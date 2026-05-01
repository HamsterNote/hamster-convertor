import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversionRequest } from '../lib/converter'

type MockTextContent = {
  items: { str: string }[]
}

type MockPdfPage = {
  getTextContent: () => Promise<MockTextContent>
  getViewport: () => { width: number; height: number }
  render: () => { promise: Promise<void> }
}

type MockPdfDocument = {
  numPages: number
  getPage: (pageNumber: number) => Promise<MockPdfPage>
}

const parserMocks = vi.hoisted(() => ({
  encode: vi.fn()
}))

const pdfJsMocks = vi.hoisted(() => ({
  GlobalWorkerOptions: {
    workerSrc: ''
  },
  getDocument: vi.fn()
}))

vi.mock('@hamster-note/pdf-parser', () => ({
  PdfParser: {
    encode: parserMocks.encode
  }
}))

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: pdfJsMocks.GlobalWorkerOptions,
  getDocument: pdfJsMocks.getDocument
}))

import { OcrRequiredError, convertPdfToImage, convertPdfToTxt } from '../lib/converter/pdf-adapters'

const createRequest = (name = 'sample.pdf'): ConversionRequest => ({
  file: new File(['pdf bytes'], name, { type: 'application/pdf' }),
  source: 'pdf',
  target: 'txt'
})

const readBlobText = async (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('FileReader returned an unsupported result'))
    })
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('Failed to read blob'))
    })
    reader.readAsText(blob)
  })

const createMockPage = (text = ''): MockPdfPage => ({
  getTextContent: vi.fn(async () => ({ items: text ? [{ str: text }] : [] })),
  getViewport: vi.fn(() => ({ width: 100, height: 200 })),
  render: vi.fn(() => ({ promise: Promise.resolve() }))
})

const mockPdfDocument = (pages: MockPdfPage[]): MockPdfDocument => {
  const document = {
    numPages: pages.length,
    getPage: vi.fn(async (pageNumber: number) => pages[pageNumber - 1] ?? createMockPage())
  }
  pdfJsMocks.getDocument.mockReturnValue({ promise: Promise.resolve(document) })
  return document
}

describe('PDF conversion adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pdfJsMocks.GlobalWorkerOptions.workerSrc = ''
    HTMLCanvasElement.prototype.getContext = vi.fn((contextId: string) =>
      contextId === '2d'
        ? ({
            fillStyle: '',
            fillRect: vi.fn(),
            drawImage: vi.fn()
          } as unknown as CanvasRenderingContext2D)
        : null
    ) as HTMLCanvasElement['getContext']
    HTMLCanvasElement.prototype.toBlob = vi.fn(
      (callback: BlobCallback, mimeType?: string, _quality?: number) => {
        const type = mimeType ?? 'image/png'
        callback(new Blob(['mock'], { type }))
      }
    ) as HTMLCanvasElement['toBlob']
  })

  it('converts PDF to TXT using Hamster intermediate text', async () => {
    parserMocks.encode.mockResolvedValue({
      text: 'Hamster text',
      children: [{ text: 'Nested text' }]
    })

    const results = await convertPdfToTxt(createRequest())

    expect(pdfJsMocks.getDocument).not.toHaveBeenCalled()
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      filename: 'sample.txt',
      mimeType: 'text/plain;charset=utf-8',
      targetFormat: 'txt'
    })
    const result = results[0]
    expect(result).toBeDefined()
    if (!result) {
      throw new Error('Expected a text conversion result')
    }
    await expect(readBlobText(result.blob)).resolves.toBe('Hamster text\nNested text')
  })

  it('converts PDF pages to zero-padded PNG image results', async () => {
    const pages = [createMockPage(), createMockPage()]
    mockPdfDocument(pages)

    const results = await convertPdfToImage({ ...createRequest('report.pdf'), target: 'png' })

    expect(pdfJsMocks.GlobalWorkerOptions.workerSrc).toContain('pdf.worker.mjs')
    expect(pdfJsMocks.getDocument).toHaveBeenCalledOnce()
    expect(pages[0]?.render).toHaveBeenCalledOnce()
    expect(pages[1]?.render).toHaveBeenCalledOnce()
    expect(results).toHaveLength(2)
    expect(results.map(result => result.filename)).toEqual([
      'report-page-001.png',
      'report-page-002.png'
    ])
    expect(results.map(result => result.mimeType)).toEqual(['image/png', 'image/png'])
    expect(results.map(result => result.targetFormat)).toEqual(['png', 'png'])
  })

  it('throws a typed OCR-required error for scanned PDFs without text', async () => {
    parserMocks.encode.mockResolvedValue({ children: [] })
    mockPdfDocument([createMockPage('')])

    await expect(convertPdfToTxt(createRequest('scan.pdf'))).rejects.toMatchObject({
      name: 'OcrRequiredError',
      code: 'OCR_REQUIRED'
    })
    await expect(convertPdfToTxt(createRequest('scan.pdf'))).rejects.toBeInstanceOf(
      OcrRequiredError
    )
  })

  it('renders only selected page when selectedImagePages is provided', async () => {
    const pages = [createMockPage(), createMockPage(), createMockPage()]
    mockPdfDocument(pages)

    const results = await convertPdfToImage({
      ...createRequest('report.pdf'),
      target: 'png',
      options: { pdf: { ocr: false, selectedImagePages: [2] } }
    })

    expect(results).toHaveLength(1)
    expect(results[0].filename).toBe('report-page-002.png')
    expect(pages[0]?.render).not.toHaveBeenCalled()
    expect(pages[1]?.render).toHaveBeenCalledOnce()
    expect(pages[2]?.render).not.toHaveBeenCalled()
  })

  it('renders multiple selected pages sorted and deduplicated', async () => {
    const pages = [createMockPage(), createMockPage(), createMockPage()]
    mockPdfDocument(pages)

    const results = await convertPdfToImage({
      ...createRequest('report.pdf'),
      target: 'png',
      options: { pdf: { ocr: false, selectedImagePages: [3, 1, 2, 2, 1] } }
    })

    expect(results).toHaveLength(3)
    expect(results.map(r => r.filename)).toEqual([
      'report-page-001.png',
      'report-page-002.png',
      'report-page-003.png'
    ])
  })

  it('throws Error when selected pages is empty after filtering', async () => {
    const pages = [createMockPage(), createMockPage()]
    mockPdfDocument(pages)

    await expect(
      convertPdfToImage({
        ...createRequest('report.pdf'),
        target: 'png',
        options: { pdf: { ocr: false, selectedImagePages: [5, 10] } }
      })
    ).rejects.toThrow('No pages selected')
  })

  it('renders all pages when selectedImagePages is undefined', async () => {
    const pages = [createMockPage(), createMockPage()]
    mockPdfDocument(pages)

    const results = await convertPdfToImage({
      ...createRequest('report.pdf'),
      target: 'png'
    })

    expect(results).toHaveLength(2)
    expect(results.map(r => r.filename)).toEqual(['report-page-001.png', 'report-page-002.png'])
  })

  it('converts PDF pages to JPG with correct mime type and filename', async () => {
    const pages = [createMockPage()]
    mockPdfDocument(pages)

    const results = await convertPdfToImage({ ...createRequest('report.pdf'), target: 'jpg' })

    expect(results).toHaveLength(1)
    expect(results[0].filename).toBe('report-page-001.jpg')
    expect(results[0].mimeType).toBe('image/jpeg')
    expect(results[0].targetFormat).toBe('jpg')
  })

  it('converts PDF pages to WEBP with correct mime type and filename', async () => {
    const pages = [createMockPage()]
    mockPdfDocument(pages)

    const results = await convertPdfToImage({ ...createRequest('report.pdf'), target: 'webp' })

    expect(results).toHaveLength(1)
    expect(results[0].filename).toBe('report-page-001.webp')
    expect(results[0].mimeType).toBe('image/webp')
    expect(results[0].targetFormat).toBe('webp')
  })
})
