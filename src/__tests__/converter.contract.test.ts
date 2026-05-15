import { beforeEach, describe, expect, it, vi } from 'vitest'

const adapterMocks = vi.hoisted(() => ({
  convertPdfToTxt: vi.fn(),
  convertPdfToImage: vi.fn(),
  convertPdfToPdf: vi.fn(),
  convertTxtToImage: vi.fn(),
  convertTxtToHtml: vi.fn(),
  convertHtmlToTxt: vi.fn(),
  convertImageToPdf: vi.fn(),
  convertImageToTxt: vi.fn(),
  convertImageToImage: vi.fn()
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
  convertPdfToImage: adapterMocks.convertPdfToImage,
  convertPdfToPdf: adapterMocks.convertPdfToPdf
}))

vi.mock('../lib/converter/txt-adapter', () => ({
  convertTxtToImage: adapterMocks.convertTxtToImage,
  convertTxtToHtml: adapterMocks.convertTxtToHtml
}))

vi.mock('../lib/converter/html-adapter', () => ({
  convertHtmlToTxt: adapterMocks.convertHtmlToTxt
}))

vi.mock('../lib/converter/image-adapters', () => ({
  convertImageToPdf: adapterMocks.convertImageToPdf,
  convertImageToTxt: adapterMocks.convertImageToTxt,
  convertImageToImage: adapterMocks.convertImageToImage
}))

vi.mock('@hamster-note/image-parser', () => ({
  ImageParser: {
    exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'],
    encode: vi.fn().mockResolvedValue({ outline: undefined, text: 'mock ocr text' })
  }
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

type ConversionRequestWithOptions = ConversionRequest & {
  options?: { pdf?: { ocr?: boolean } }
}

const createRequestWithOptions = (
  overrides: Partial<ConversionRequestWithOptions>
): ConversionRequestWithOptions => ({
  file: new File(['sample'], 'sample.pdf', { type: 'application/pdf' }),
  source: 'pdf',
  target: 'html',
  options: overrides.options,
  ...overrides
})

describe('converter contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exposes supported targets for each source format', () => {
    expect(getSupportedTargets('pdf')).toContain('pdf')
    expect(getSupportedTargets('pdf')).toContain('html')
    expect(getSupportedTargets('txt')).toContain('html')
    expect(getSupportedTargets('html')).toEqual(['txt'])
    expect(getSupportedTargets('image')).toEqual(['pdf', 'txt', 'png', 'jpg', 'webp'])
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

  it('routes PDF to PNG through the PDF image adapter', async () => {
    adapterMocks.convertPdfToImage.mockResolvedValue([
      makeResult('sample-page-001.png', 'image/png', 'png')
    ])

    const results = await convertFile(createRequest({ target: 'png' }))

    expect(adapterMocks.convertPdfToImage).toHaveBeenCalledOnce()
    expect(results[0]).toMatchObject({ filename: 'sample-page-001.png', targetFormat: 'png' })
  })

  it('routes TXT to PNG through the TXT image adapter', async () => {
    adapterMocks.convertTxtToImage.mockResolvedValue([makeResult('sample.png', 'image/png', 'png')])

    const results = await convertFile(
      createRequest({
        file: new File(['sample'], 'sample.txt', { type: 'text/plain' }),
        source: 'txt',
        target: 'png'
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

  it('routes TXT to HTML through the TXT HTML adapter', async () => {
    adapterMocks.convertTxtToHtml.mockResolvedValue([
      makeResult('sample.html', 'text/html;charset=utf-8', 'html')
    ])

    const results = await convertFile(
      createRequest({
        file: new File(['sample'], 'sample.txt', { type: 'text/plain' }),
        source: 'txt',
        target: 'html'
      })
    )

    expect(adapterMocks.convertTxtToHtml).toHaveBeenCalledOnce()
    expect(results[0]).toMatchObject({
      filename: 'sample.html',
      mimeType: 'text/html;charset=utf-8'
    })
  })

  it('routes HTML to TXT through the HTML TXT adapter', async () => {
    adapterMocks.convertHtmlToTxt.mockResolvedValue([makeResult('sample.txt', 'text/plain', 'txt')])

    const results = await convertFile(
      createRequest({
        file: new File(['<html><body>test</body></html>'], 'sample.html', { type: 'text/html' }),
        source: 'html',
        target: 'txt'
      })
    )

    expect(adapterMocks.convertHtmlToTxt).toHaveBeenCalledOnce()
    expect(results[0]).toMatchObject({ filename: 'sample.txt', mimeType: 'text/plain' })
  })

  describe('guard: unsupported HTML targets throw UnsupportedConversionError', () => {
    it('throws UnsupportedConversionError for html to pdf', async () => {
      await expect(
        convertFile(
          createRequest({
            file: new File(['<html><body>test</body></html>'], 'sample.html', {
              type: 'text/html'
            }),
            source: 'html',
            target: 'pdf'
          })
        )
      ).rejects.toBeInstanceOf(UnsupportedConversionError)
    })

    it('throws UnsupportedConversionError for html to png', async () => {
      await expect(
        convertFile(
          createRequest({
            file: new File(['<html><body>test</body></html>'], 'sample.html', {
              type: 'text/html'
            }),
            source: 'html',
            target: 'png'
          })
        )
      ).rejects.toBeInstanceOf(UnsupportedConversionError)
    })
  })

  describe('pdf to pdf conversion', () => {
    it('returns one application/pdf result for pdf to pdf conversion', async () => {
      adapterMocks.convertPdfToPdf.mockResolvedValue([
        makeResult('sample.pdf', 'application/pdf', 'pdf')
      ])

      const results = await convertFile(
        createRequest({
          file: new File(['sample'], 'sample.pdf', { type: 'application/pdf' }),
          source: 'pdf',
          target: 'pdf'
        })
      )

      expect(adapterMocks.convertPdfToPdf).toHaveBeenCalledOnce()
      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({
        filename: 'sample.pdf',
        mimeType: 'application/pdf',
        targetFormat: 'pdf'
      })
    })

    it('passes ocr option to convertPdfToPdf adapter', async () => {
      adapterMocks.convertPdfToPdf.mockResolvedValue([
        makeResult('sample.pdf', 'application/pdf', 'pdf')
      ])

      await convertFile(
        createRequestWithOptions({
          file: new File(['sample'], 'sample.pdf', { type: 'application/pdf' }),
          source: 'pdf',
          target: 'pdf',
          options: { pdf: { ocr: false } }
        }) as ConversionRequest
      )

      expect(adapterMocks.convertPdfToPdf).toHaveBeenCalledOnce()
      expect(adapterMocks.convertPdfToPdf).toHaveBeenCalledWith(
        expect.objectContaining({
          options: { pdf: { ocr: false } }
        })
      )
    })
  })

  describe('guard: txt to pdf throws UnsupportedConversionError', () => {
    it('throws UnsupportedConversionError for txt to pdf', async () => {
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
  })
})
