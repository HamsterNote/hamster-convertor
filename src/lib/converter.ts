import type { IntermediateDocument } from '@hamster-note/types'
import { convertHtmlToTxt } from './converter/html-adapter'
import {
  convertImageToImage,
  convertImageToPdf,
  convertImageToTxt
} from './converter/image-adapters'
import { convertPdfToImage, convertPdfToPdf, convertPdfToTxt } from './converter/pdf-adapters'
import { convertTxtToHtml, convertTxtToImage } from './converter/txt-adapter'

export type ConversionWarning = string | { message: string }

/**
 * html-parser@0.8.0 的 DecodeOptions 类型定义
 * 用于控制 HTML 解码时的文字样式和背景渲染行为
 */
export type HtmlDecodeOptions = {
  textControl?: {
    fontSize?: number
    lineHeight?: number
    fontWeight?: number
    italic?: boolean
    color?: string
    fontFamily?: string
    vertical?: string
    dir?: string
  }
  background?: {
    includeBackground?: boolean
    backgroundQuality?: number
    excludeTextFromBackground?: boolean
  }
}

export type PdfToHtmlResult = {
  html: string
  warnings: ConversionWarning[]
}

export type ConvertPdfToHtml = (
  input: Uint8Array,
  options?: { selectedPages?: number[]; decodeOptions?: HtmlDecodeOptions }
) => Promise<PdfToHtmlResult>

export type SourceFormat = 'pdf' | 'txt' | 'image' | 'html'

export type TargetFormat = 'html' | 'txt' | 'png' | 'jpg' | 'webp' | 'pdf'

export type ConversionResult = {
  blob: Blob
  filename: string
  mimeType: string
  targetFormat: TargetFormat
  label?: string
  warnings?: ConversionWarning[]
}

export type ConversionRequest = {
  file: File
  source: SourceFormat
  target: TargetFormat
  options?: {
    pdf?: {
      ocr: boolean
      selectedPages?: number[]
      selectedImagePages?: number[]
    }
    decode?: HtmlDecodeOptions
  }
}

export class UnsupportedConversionError extends Error {
  readonly code = 'UNSUPPORTED_CONVERSION'

  constructor(
    readonly source: SourceFormat,
    readonly target: TargetFormat
  ) {
    super(`Unsupported conversion: ${source} to ${target}`)
    this.name = 'UnsupportedConversionError'
  }
}

const supportedTargets = {
  pdf: ['txt', 'png', 'jpg', 'webp', 'pdf', 'html'],
  txt: ['png', 'html'],
  image: ['pdf', 'txt', 'png', 'jpg', 'webp'],
  html: ['txt']
} as const satisfies Record<SourceFormat, readonly TargetFormat[]>

export const getSupportedTargets = (source: SourceFormat): TargetFormat[] => [
  ...supportedTargets[source]
]

type HtmlDecodeResult = {
  html: string
  warnings: ConversionWarning[]
}

type PdfParserModule = typeof import('@hamster-note/pdf-parser')

type HtmlParserModule = typeof import('@hamster-note/html-parser')

const loadParserModules = async (): Promise<[PdfParserModule, HtmlParserModule]> => {
  const [pdfParserModule, htmlParserModule] = await Promise.all([
    import('@hamster-note/pdf-parser'),
    import('@hamster-note/html-parser')
  ])
  return [pdfParserModule, htmlParserModule]
}

const extractHtml = async ({
  HtmlParser,
  intermediateDocument,
  decodeOptions
}: {
  HtmlParser: HtmlParserModule['HtmlParser']
  intermediateDocument: IntermediateDocument
  decodeOptions?: HtmlDecodeOptions
}): Promise<HtmlDecodeResult> => {
  const warnings: ConversionWarning[] = []
  const html = await HtmlParser.decodeToHtml(intermediateDocument, decodeOptions)
  return { html, warnings }
}

const decodeByParserModules = async (
  input: Uint8Array,
  decodeOptions?: HtmlDecodeOptions
): Promise<PdfToHtmlResult> => {
  const [pdfParserModule, htmlParserModule] = await loadParserModules()
  const { PdfParser } = pdfParserModule
  const { HtmlParser } = htmlParserModule

  const arrayBuffer = input.buffer.slice(
    input.byteOffset,
    input.byteOffset + input.byteLength
  ) as ArrayBuffer

  const intermediate = await PdfParser.encode(arrayBuffer)
  if (!intermediate) {
    throw new Error('PDF parser returned no intermediate document')
  }

  return extractHtml({ HtmlParser, intermediateDocument: intermediate, decodeOptions })
}

const fallbackHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Hamster PDF Sample</title>
  </head>
  <body>
    <style>
      .hamster-note-document { position: relative; display: block; contain: layout style size; }
      .hamster-note-document .hamster-note-page { position: relative; overflow: hidden; background-repeat: no-repeat; background-position: top center; background-size: contain; }
      .hamster-note-document .hamster-note-text { position: absolute; white-space: pre; transform-origin: 0 0; }
    </style>
    <div class="hamster-note-document">Hamster PDF Sample</div>
  </body>
</html>
`

const isE2E = () =>
  typeof window !== 'undefined' && (window as Window & { __E2E__?: boolean }).__E2E__ === true

const waitForE2EPaint = async (): Promise<void> => {
  await new Promise<void>(resolve => {
    globalThis.setTimeout(resolve, 50)
  })
}

export const convertPdfToHtml: ConvertPdfToHtml = async (input, options) => {
  if (isE2E()) {
    return {
      html: fallbackHtml,
      warnings: []
    }
  }

  if (options?.selectedPages !== undefined) {
    const { getSelectedPdfPageNumbers, extractPdfPages } = await import('./converter/pdf-pages')
    const { PDFDocument } = await import('pdf-lib')
    const arrayBuffer = input.buffer.slice(
      input.byteOffset,
      input.byteOffset + input.byteLength
    ) as ArrayBuffer
    const srcDoc = await PDFDocument.load(arrayBuffer)
    const pageNumbers = getSelectedPdfPageNumbers(srcDoc.getPageCount(), options.selectedPages)
    const subsetBuffer = await extractPdfPages(arrayBuffer, pageNumbers)
    return decodeByParserModules(new Uint8Array(subsetBuffer), options?.decodeOptions)
  }

  return decodeByParserModules(input, options?.decodeOptions)
}

const replaceExtension = (filename: string, extension: string): string => {
  const withoutExtension = filename.replace(/\.[^/.]+$/, '')
  return `${withoutExtension || filename}.${extension}`
}

const readFileAsArrayBuffer = async (file: File): Promise<ArrayBuffer> => {
  const fileWithArrayBuffer = file as File & { arrayBuffer?: () => Promise<ArrayBuffer> }
  if (fileWithArrayBuffer.arrayBuffer) {
    return fileWithArrayBuffer.arrayBuffer()
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result)
        return
      }

      reject(new Error('FileReader returned an unsupported result'))
    })
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('Failed to read file'))
    })
    reader.readAsArrayBuffer(file)
  })
}

const convertPdfFileToHtml = async (
  file: File,
  options?: { selectedPages?: number[]; decodeOptions?: HtmlDecodeOptions }
): Promise<ConversionResult[]> => {
  const buffer = await readFileAsArrayBuffer(file)
  const { html, warnings } = await convertPdfToHtml(new Uint8Array(buffer), options)
  const mimeType = 'text/html;charset=utf-8'

  return [
    {
      blob: new Blob([html], { type: mimeType }),
      filename: replaceExtension(file.name, 'html'),
      mimeType,
      targetFormat: 'html',
      warnings
    }
  ]
}

const convertPdfToHtmlAdapter = async (request: ConversionRequest): Promise<ConversionResult[]> => {
  return convertPdfFileToHtml(request.file, {
    selectedPages: request.options?.pdf?.selectedPages,
    decodeOptions: request.options?.decode
  })
}

const createE2EResult = async (request: ConversionRequest): Promise<ConversionResult[]> => {
  await waitForE2EPaint()

  if (request.file.name.includes('fail')) {
    throw new Error('Fake E2E conversion failed')
  }

  if (request.target === 'html') {
    if (request.source === 'pdf') {
      return convertPdfFileToHtml(request.file)
    }

    const mimeType = 'text/html;charset=utf-8'
    return [
      {
        blob: new Blob(['<html><body>fake html</body></html>'], { type: mimeType }),
        filename: replaceExtension(request.file.name, 'html'),
        mimeType,
        targetFormat: 'html'
      }
    ]
  }

  if (request.source === 'html' && request.target === 'txt') {
    return [
      {
        blob: new Blob(['fake extracted text'], { type: 'text/plain' }),
        filename: replaceExtension(request.file.name, 'txt'),
        mimeType: 'text/plain',
        targetFormat: 'txt'
      }
    ]
  }

  if (
    request.source === 'pdf' &&
    (request.target === 'png' || request.target === 'jpg' || request.target === 'webp')
  ) {
    const selected = request.options?.pdf?.selectedPages ??
      request.options?.pdf?.selectedImagePages ?? [1, 2]
    const ext = request.target
    const mimeType = `image/${request.target === 'jpg' ? 'jpeg' : request.target}`
    return selected.map(pageNumber => ({
      blob: new Blob([`fake ${request.target} ${pageNumber}`], { type: mimeType }),
      filename: `fake-page-${String(pageNumber).padStart(3, '0')}.${ext}`,
      mimeType,
      targetFormat: request.target
    }))
  }

  if (
    request.source === 'image' &&
    (request.target === 'png' || request.target === 'jpg' || request.target === 'webp')
  ) {
    const ext = request.target
    const mimeType = `image/${request.target === 'jpg' ? 'jpeg' : request.target}`
    return [
      {
        blob: new Blob([`fake ${request.target}`], { type: mimeType }),
        filename: replaceExtension(request.file.name, ext),
        mimeType,
        targetFormat: request.target
      }
    ]
  }

  const fakeResults: Record<Exclude<TargetFormat, 'html'>, ConversionResult> = {
    txt: {
      blob: new Blob(['fake text'], { type: 'text/plain' }),
      filename: 'fake.txt',
      mimeType: 'text/plain',
      targetFormat: 'txt'
    },
    png: {
      blob: new Blob(['fake png'], { type: 'image/png' }),
      filename: 'fake.png',
      mimeType: 'image/png',
      targetFormat: 'png'
    },
    jpg: {
      blob: new Blob(['fake jpg'], { type: 'image/jpeg' }),
      filename: 'fake.jpg',
      mimeType: 'image/jpeg',
      targetFormat: 'jpg'
    },
    webp: {
      blob: new Blob(['fake webp'], { type: 'image/webp' }),
      filename: 'fake.webp',
      mimeType: 'image/webp',
      targetFormat: 'webp'
    },
    pdf: {
      blob: new Blob(['fake pdf'], { type: 'application/pdf' }),
      filename: 'fake.pdf',
      mimeType: 'application/pdf',
      targetFormat: 'pdf'
    }
  }

  return [fakeResults[request.target]]
}

type ConversionAdapter = (request: ConversionRequest) => Promise<ConversionResult[]>
type ConversionAdapterMap = Record<SourceFormat, Partial<Record<TargetFormat, ConversionAdapter>>>

const adapters: ConversionAdapterMap = {
  pdf: {
    txt: convertPdfToTxt,
    png: convertPdfToImage,
    jpg: convertPdfToImage,
    webp: convertPdfToImage,
    pdf: convertPdfToPdf,
    html: convertPdfToHtmlAdapter
  },
  txt: {
    png: convertTxtToImage,
    html: convertTxtToHtml
  },
  image: {
    pdf: convertImageToPdf,
    txt: convertImageToTxt,
    png: convertImageToImage,
    jpg: convertImageToImage,
    webp: convertImageToImage
  },
  html: {
    txt: convertHtmlToTxt
  }
}

export const convertFile = async (request: ConversionRequest): Promise<ConversionResult[]> => {
  if (isE2E()) {
    return createE2EResult(request)
  }

  const adapter = adapters[request.source][request.target]

  if (!adapter) {
    throw new UnsupportedConversionError(request.source, request.target)
  }

  return adapter(request)
}
