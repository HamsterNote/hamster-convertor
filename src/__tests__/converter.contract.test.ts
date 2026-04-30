import { beforeEach, describe, expect, it, vi } from 'vitest'

const adapterMocks = vi.hoisted(() => ({
  convertPdfToTxt: vi.fn(),
  convertPdfToImage: vi.fn(),
  convertTxtToImage: vi.fn(),
  convertImageToPdf: vi.fn(),
  convertImageToTxt: vi.fn()
}))

vi.mock('@hamster-note/pdf-parser', () => ({
  PdfParser: {
    encode: vi.fn().mockResolvedValue({ type: 'document', children: [] })
  }
}))

vi.mock('@hamster-note/html-parser', () => ({
  HtmlParser: {
    decodeToHtml: vi.fn().mockResolvedValue('<!doctype html><html><body>ok</body></html>')
  }
}))

vi.mock('../lib/converter/pdf-adapters', () => ({
  convertPdfToTxt: adapterMocks.convertPdfToTxt,
  convertPdfToImage: adapterMocks.convertPdfToImage
}))

vi.mock('../lib/converter/txt-adapter', () => ({
  convertTxtToImage: adapterMocks.convertTxtToImage
}))

vi.mock('../lib/converter/image-adapters', () => ({
  convertImageToPdf: adapterMocks.convertImageToPdf,
  convertImageToTxt: adapterMocks.convertImageToTxt
}))

import {
  UnsupportedConversionError,
  convertFile,
  getSupportedTargets,
  type ConversionResult,
  type ConversionRequest
} from '../lib/converter'

const createRequest = (overrides: Partial<ConversionRequest> = {}): ConversionRequest => ({
  file: new File(['sample'], 'sample.pdf', { type: 'application/pdf' }),
  source: 'pdf',
  target: 'html',
  ...overrides
})

const makeResult = (
  filename: string,
  mimeType: string,
  targetFormat: ConversionResult['targetFormat']
): ConversionResult => ({
  blob: new Blob(['converted'], { type: mimeType }),
  filename,
  mimeType,
  targetFormat
})

describe('converter contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exposes supported targets for each source format', () => {
    expect(getSupportedTargets('pdf')).toEqual(['txt', 'image'])
    expect(getSupportedTargets('txt')).toEqual(['image'])
    expect(getSupportedTargets('image')).toEqual(['pdf', 'txt'])
  })

  it('rejects unsupported conversion pairs with typed errors', async () => {
    const request = createRequest({
      file: new File(['sample'], 'sample.txt', { type: 'text/plain' }),
      source: 'txt',
      target: 'pdf'
    })

    await expect(convertFile(request)).rejects.toMatchObject({
      name: 'UnsupportedConversionError',
      code: 'UNSUPPORTED_CONVERSION',
      source: 'txt',
      target: 'pdf'
    })
  })

  it('rejects truly unsupported conversion pairs', async () => {
    await expect(
      convertFile(
        createRequest({
          file: new File(['sample'], 'sample.txt', { type: 'text/plain' }),
          source: 'txt',
          target: 'pdf'
        })
      )
    ).rejects.toBeInstanceOf(UnsupportedConversionError)
  })

  it('returns an array for single-output conversions', async () => {
    const results = await convertFile(createRequest())

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      filename: 'sample.html',
      mimeType: 'text/html;charset=utf-8',
      targetFormat: 'html',
      warnings: []
    })
    expect(results[0]?.blob).toBeInstanceOf(Blob)
  })

  it('routes PDF to TXT through the PDF text adapter', async () => {
    adapterMocks.convertPdfToTxt.mockResolvedValue([
      makeResult('sample.txt', 'text/plain;charset=utf-8', 'txt')
    ])

    const results = await convertFile(createRequest({ target: 'txt' }))

    expect(adapterMocks.convertPdfToTxt).toHaveBeenCalledOnce()
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ filename: 'sample.txt', targetFormat: 'txt' })
  })

  it('routes PDF to IMAGE through the PDF image adapter', async () => {
    adapterMocks.convertPdfToImage.mockResolvedValue([
      makeResult('sample-page-001.png', 'image/png', 'image')
    ])

    const results = await convertFile(createRequest({ target: 'image' }))

    expect(adapterMocks.convertPdfToImage).toHaveBeenCalledOnce()
    expect(results[0]).toMatchObject({ filename: 'sample-page-001.png', targetFormat: 'image' })
  })

  it('routes TXT to IMAGE through the TXT image adapter', async () => {
    adapterMocks.convertTxtToImage.mockResolvedValue([
      makeResult('sample.png', 'image/png', 'image')
    ])

    const results = await convertFile(
      createRequest({
        file: new File(['sample'], 'sample.txt', { type: 'text/plain' }),
        source: 'txt',
        target: 'image'
      })
    )

    expect(adapterMocks.convertTxtToImage).toHaveBeenCalledOnce()
    expect(results[0]).toMatchObject({ filename: 'sample.png', mimeType: 'image/png' })
  })

  it('routes IMAGE to PDF through the image PDF adapter', async () => {
    adapterMocks.convertImageToPdf.mockResolvedValue([
      makeResult('sample.pdf', 'application/pdf', 'pdf')
    ])

    const results = await convertFile(
      createRequest({
        file: new File(['sample'], 'sample.png', { type: 'image/png' }),
        source: 'image',
        target: 'pdf'
      })
    )

    expect(adapterMocks.convertImageToPdf).toHaveBeenCalledOnce()
    expect(results[0]).toMatchObject({ filename: 'sample.pdf', mimeType: 'application/pdf' })
  })

  it('routes IMAGE to TXT through the image OCR adapter', async () => {
    adapterMocks.convertImageToTxt.mockResolvedValue([
      makeResult('sample-ocr.txt', 'text/plain;charset=utf-8', 'txt')
    ])

    const results = await convertFile(
      createRequest({
        file: new File(['sample'], 'sample.png', { type: 'image/png' }),
        source: 'image',
        target: 'txt'
      })
    )

    expect(adapterMocks.convertImageToTxt).toHaveBeenCalledOnce()
    expect(results[0]).toMatchObject({ filename: 'sample-ocr.txt', targetFormat: 'txt' })
  })
})
