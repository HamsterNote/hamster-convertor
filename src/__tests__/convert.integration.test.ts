import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadPdfFixture } from '../test/fixtures'
import { normalizeHtml } from '../test/normalizeHtml'
import { convertPdfToHtml, convertFile, UnsupportedConversionError } from '../lib/converter'
import { EmptyOcrError } from '../lib/converter/pdf-adapters'

const imageParserMocks = vi.hoisted(() => ({
  encode: vi.fn().mockResolvedValue({ outline: undefined, text: 'mock ocr text' })
}))

vi.mock('@hamster-note/image-parser', () => ({
  ImageParser: {
    exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'],
    encode: imageParserMocks.encode
  }
}))

const createMockPage = (pageNumber: number) => ({
  getViewport: () => ({ width: 612, height: 792 }),
  getTextContent: () =>
    Promise.resolve({
      items: [{ str: `page ${pageNumber} text` }]
    }),
  render: () => ({ promise: Promise.resolve() })
})

const pdfjsMocks = vi.hoisted(() => ({
  getDocument: vi.fn().mockReturnValue({
    promise: Promise.resolve({
      numPages: 1,
      getPage: (n: number) => Promise.resolve(createMockPage(n))
    })
  })
}))

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: pdfjsMocks.getDocument
}))

const expectedText = 'Hamster PDF Sample'

const stubCanvas2dContext = (): HTMLCanvasElement['getContext'] => {
  const original = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function getContext(
    this: HTMLCanvasElement,
    contextId: string
  ) {
    if (contextId === '2d') {
      return {
        canvas: this,
        fillRect: vi.fn(),
        clearRect: vi.fn(),
        getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
        putImageData: vi.fn(),
        createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })),
        setTransform: vi.fn(),
        drawImage: vi.fn(),
        save: vi.fn(),
        fillText: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        closePath: vi.fn(),
        stroke: vi.fn(),
        translate: vi.fn(),
        scale: vi.fn(),
        rotate: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        measureText: vi.fn(() => ({ width: 0 })),
        transform: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn()
      } as unknown as CanvasRenderingContext2D
    }
    return original.call(this, contextId as '2d')
  } as HTMLCanvasElement['getContext']
  return original
}

const stubCanvasToBlob = (): HTMLCanvasElement['toBlob'] => {
  const original = HTMLCanvasElement.prototype.toBlob
  HTMLCanvasElement.prototype.toBlob = function (this: HTMLCanvasElement, callback: BlobCallback) {
    callback(new Blob([new Uint8Array(100)], { type: 'image/png' }))
  } as HTMLCanvasElement['toBlob']
  return original
}

const stubUrlObject = (): {
  createObjectURL: typeof URL.createObjectURL
  revokeObjectURL: typeof URL.revokeObjectURL
} => {
  const original = { createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL }
  URL.createObjectURL = () =>
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  URL.revokeObjectURL = () => {}
  return original
}

const stubBlobArrayBuffer = (): Blob['arrayBuffer'] => {
  const original = Blob.prototype.arrayBuffer
  Blob.prototype.arrayBuffer = function (this: Blob) {
    return Promise.resolve(new ArrayBuffer(this.size))
  }
  return original
}

describe('pdf to html integration', () => {
  it('converts fixture pdf into stable html', async () => {
    const pdfBuffer = await loadPdfFixture('sample.pdf')
    const result = await convertPdfToHtml(pdfBuffer)

    expect(result.warnings).toHaveLength(0)

    const normalized = normalizeHtml(result.html)
    expect(normalized.text).toContain(expectedText)
    expect(normalized.text).toMatchSnapshot()
  })

  it('is deterministic for the same input', async () => {
    const pdfBuffer = await loadPdfFixture('sample.pdf')
    const first = await convertPdfToHtml(pdfBuffer)
    const second = await convertPdfToHtml(pdfBuffer)

    expect(first.html).toBe(second.html)
  })
})

describe('pdf to pdf integration', () => {
  afterEach(() => {
    imageParserMocks.encode.mockClear()
    imageParserMocks.encode.mockResolvedValue({ outline: undefined, text: 'mock ocr text' })
  })

  it('converts pdf to pdf via image pipeline', async () => {
    const pdfBuffer = await loadPdfFixture('sample.pdf')
    const file = new File([new Uint8Array(pdfBuffer)], 'sample.pdf', { type: 'application/pdf' })

    const results = await convertFile({ file, source: 'pdf', target: 'pdf' })

    expect(results).toHaveLength(1)
    expect(results[0].mimeType).toBe('application/pdf')
    expect(results[0].blob).toBeInstanceOf(Blob)
  })

  it('propagates ocr option to enable OCR text extraction', async () => {
    const pdfBuffer = await loadPdfFixture('sample.pdf')
    const file = new File([new Uint8Array(pdfBuffer)], 'sample.pdf', { type: 'application/pdf' })

    const results = await convertFile({
      file,
      source: 'pdf',
      target: 'pdf',
      options: { pdf: { ocr: true } }
    } as Parameters<typeof convertFile>[0])

    expect(results).toHaveLength(1)
    expect(results[0].mimeType).toBe('application/pdf')
  })

  it('skips OCR when ocr option is false', async () => {
    const pdfBuffer = await loadPdfFixture('sample.pdf')
    const file = new File([new Uint8Array(pdfBuffer)], 'sample.pdf', { type: 'application/pdf' })

    const results = await convertFile({
      file,
      source: 'pdf',
      target: 'pdf',
      options: { pdf: { ocr: false } }
    } as Parameters<typeof convertFile>[0])

    expect(results).toHaveLength(1)
    expect(results[0].mimeType).toBe('application/pdf')
  })

  it('throws UnsupportedConversionError for txt to pdf', async () => {
    const file = new File(['sample text'], 'sample.txt', { type: 'text/plain' })

    await expect(convertFile({ file, source: 'txt', target: 'pdf' })).rejects.toBeInstanceOf(
      UnsupportedConversionError
    )
  })

  describe('OCR assertions', () => {
    let originalGetContext: HTMLCanvasElement['getContext']
    let originalToBlob: HTMLCanvasElement['toBlob']
    let originalUrl: {
      createObjectURL: typeof URL.createObjectURL
      revokeObjectURL: typeof URL.revokeObjectURL
    }
    let originalArrayBuffer: Blob['arrayBuffer']

    beforeEach(() => {
      originalUrl = stubUrlObject()
      originalArrayBuffer = stubBlobArrayBuffer()
      originalGetContext = stubCanvas2dContext()
      originalToBlob = stubCanvasToBlob()
    })

    afterEach(() => {
      HTMLCanvasElement.prototype.getContext = originalGetContext
      HTMLCanvasElement.prototype.toBlob = originalToBlob
      URL.createObjectURL = originalUrl.createObjectURL
      URL.revokeObjectURL = originalUrl.revokeObjectURL
      Blob.prototype.arrayBuffer = originalArrayBuffer
    })

    it('calls ImageParser.encode when OCR is enabled', async () => {
      const pdfBuffer = await loadPdfFixture('sample.pdf')
      const file = new File([new Uint8Array(pdfBuffer)], 'sample.pdf', { type: 'application/pdf' })

      await convertFile({
        file,
        source: 'pdf',
        target: 'pdf',
        options: { pdf: { ocr: true } }
      } as Parameters<typeof convertFile>[0])

      expect(imageParserMocks.encode).toHaveBeenCalled()
      expect(imageParserMocks.encode.mock.calls.length).toBeGreaterThanOrEqual(1)
    })

    it('throws EmptyOcrError with code EMPTY_OCR when OCR returns no text', async () => {
      imageParserMocks.encode.mockResolvedValue({ outline: undefined, text: '' })

      const pdfBuffer = await loadPdfFixture('sample.pdf')
      const file = new File([new Uint8Array(pdfBuffer)], 'sample.pdf', { type: 'application/pdf' })

      await expect(
        convertFile({
          file,
          source: 'pdf',
          target: 'pdf',
          options: { pdf: { ocr: true } }
        } as Parameters<typeof convertFile>[0])
      ).rejects.toSatisfy((error: unknown) => {
        return error instanceof EmptyOcrError && error.code === 'EMPTY_OCR'
      })
    })

    it('creates output PDF blob successfully in OCR path', async () => {
      const pdfBuffer = await loadPdfFixture('sample.pdf')
      const file = new File([new Uint8Array(pdfBuffer)], 'sample.pdf', { type: 'application/pdf' })

      const results = await convertFile({
        file,
        source: 'pdf',
        target: 'pdf',
        options: { pdf: { ocr: true } }
      } as Parameters<typeof convertFile>[0])

      expect(results).toHaveLength(1)
      expect(results[0].blob).toBeInstanceOf(Blob)
      expect(results[0].mimeType).toBe('application/pdf')
      expect(results[0].blob.size).toBeGreaterThan(0)
    })
  })
})
