import type { IntermediateDocument } from '@hamster-note/types'
import { convertPdfToTxt, convertPdfToImage } from './converter/pdf-adapters'
import { convertTxtToImage } from './converter/txt-adapter'
import { convertImageToPdf, convertImageToTxt } from './converter/image-adapters'

export type ConversionWarning = string | { message: string }

export type PdfToHtmlResult = {
  html: string
  warnings: ConversionWarning[]
}

export type ConvertPdfToHtml = (input: Uint8Array) => Promise<PdfToHtmlResult>

export type SourceFormat = 'pdf' | 'txt' | 'image'

export type TargetFormat = 'html' | 'txt' | 'image' | 'pdf'

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
  pdf: ['txt', 'image'],
  txt: ['image'],
  image: ['pdf', 'txt']
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
  intermediateDocument
}: {
  HtmlParser: HtmlParserModule['HtmlParser']
  intermediateDocument: IntermediateDocument
}): Promise<HtmlDecodeResult> => {
  const warnings: ConversionWarning[] = []
  const html = await HtmlParser.decodeToHtml(intermediateDocument)
  return { html, warnings }
}

const decodeByParserModules = async (input: Uint8Array): Promise<PdfToHtmlResult> => {
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

  return extractHtml({ HtmlParser, intermediateDocument: intermediate })
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

export const convertPdfToHtml: ConvertPdfToHtml = async input => {
  if (isE2E()) {
    return {
      html: fallbackHtml,
      warnings: []
    }
  }

  return decodeByParserModules(input)
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

const convertPdfFileToHtml = async (file: File): Promise<ConversionResult[]> => {
  const buffer = await readFileAsArrayBuffer(file)
  const { html, warnings } = await convertPdfToHtml(new Uint8Array(buffer))
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

const createE2EResult = async (request: ConversionRequest): Promise<ConversionResult[]> => {
  if (request.file.name.includes('fail')) {
    throw new Error('Fake E2E conversion failed')
  }

  if (request.target === 'html') {
    return convertPdfFileToHtml(request.file)
  }

  if (request.source === 'pdf' && request.target === 'image') {
    return [1, 2].map(pageNumber => ({
      blob: new Blob([`fake image ${pageNumber}`], { type: 'image/png' }),
      filename: `fake-page-${String(pageNumber).padStart(3, '0')}.png`,
      mimeType: 'image/png',
      targetFormat: 'image'
    }))
  }

  const fakeResults: Record<Exclude<TargetFormat, 'html'>, ConversionResult> = {
    txt: {
      blob: new Blob(['fake text'], { type: 'text/plain' }),
      filename: 'fake.txt',
      mimeType: 'text/plain',
      targetFormat: 'txt'
    },
    image: {
      blob: new Blob(['fake image'], { type: 'image/png' }),
      filename: 'fake.png',
      mimeType: 'image/png',
      targetFormat: 'image'
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
    image: convertPdfToImage
  },
  txt: {
    image: convertTxtToImage
  },
  image: {
    pdf: convertImageToPdf,
    txt: convertImageToTxt
  }
}

export const convertFile = async (request: ConversionRequest): Promise<ConversionResult[]> => {
  if (isE2E()) {
    return createE2EResult(request)
  }

  if (request.source === 'pdf' && request.target === 'html') {
    return convertPdfFileToHtml(request.file)
  }

  if (request.target === 'html') {
    throw new UnsupportedConversionError(request.source, request.target)
  }

  const adapter = adapters[request.source][request.target]

  if (!adapter) {
    throw new UnsupportedConversionError(request.source, request.target)
  }

  return adapter(request)
}
