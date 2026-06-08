import {
  convertHtmlToTxt,
  convertImageToHtml,
  convertImageToImage,
  convertImageToPdf,
  convertImageToTxt,
  convertPdfToHtml,
  convertPdfToImage,
  convertPdfToPdf,
  convertPdfToTxt,
  convertTxtToHtml,
  convertTxtToImage,
  type RuntimeConversionAdapter
} from './adapters'
import type { ConversionWarning, HtmlDecodeOptions, HtmlLayoutOptions } from './utils'

export type SourceFormat = 'pdf' | 'txt' | 'image' | 'html'

export type TargetFormat = 'html' | 'txt' | 'png' | 'jpg' | 'webp' | 'pdf'

export type ExifCategory =
  | 'all'
  | 'geolocation'
  | 'camera'
  | 'datetime'
  | 'software'
  | 'authorCopyright'

export type ImageOptions = {
  quality: number
  maxWidth?: number
  maxHeight?: number
  keepAspectRatio: boolean
  removeExif?: {
    enabled: boolean
    categories: ExifCategory[]
  }
}

export type ImageToPdfOptions = {
  marginPt: number
  fit: 'cover' | 'contain'
  pageMode: 'auto' | 'single' | 'multi'
  rotationDeg: 0 | 90 | 180 | 270
  scalePercent: number
}

export type ConversionOptions = {
  pdf?: {
    ocr?: boolean
    selectedPages?: number[]
    selectedImagePages?: number[]
  }
  decode?: HtmlDecodeOptions
  layout?: HtmlLayoutOptions
  image?: ImageOptions
  imageToPdf?: ImageToPdfOptions
}

export type ConversionRequest = {
  filename: string
  sourceFormat: SourceFormat
  targetFormat: TargetFormat
  buffer: ArrayBuffer
  mimeType?: string
  options?: ConversionOptions
}

export type ConversionResult = {
  filename: string
  mimeType: string
  targetFormat: TargetFormat
  buffer: ArrayBuffer
  warnings?: ConversionWarning[]
}

export class UnsupportedConversionError extends Error {
  readonly code = 'UNSUPPORTED_CONVERSION'

  constructor(
    readonly source: string,
    readonly target: string
  ) {
    super(`Unsupported conversion: ${source} to ${target}`)
    this.name = 'UnsupportedConversionError'
  }
}

const supportedTargets = {
  pdf: ['txt', 'png', 'jpg', 'webp', 'pdf', 'html'],
  txt: ['png', 'jpg', 'webp', 'html'],
  image: ['pdf', 'txt', 'png', 'jpg', 'webp', 'html'],
  html: ['txt']
} as const satisfies Record<SourceFormat, readonly TargetFormat[]>

type ConversionAdapterMap = Record<
  SourceFormat,
  Partial<Record<TargetFormat, RuntimeConversionAdapter>>
>

const adapters: ConversionAdapterMap = {
  pdf: {
    txt: convertPdfToTxt,
    png: convertPdfToImage,
    jpg: convertPdfToImage,
    webp: convertPdfToImage,
    pdf: convertPdfToPdf,
    html: convertPdfToHtml
  },
  txt: {
    png: convertTxtToImage,
    jpg: convertTxtToImage,
    webp: convertTxtToImage,
    html: convertTxtToHtml
  },
  image: {
    pdf: convertImageToPdf,
    html: convertImageToHtml,
    txt: convertImageToTxt,
    png: convertImageToImage,
    jpg: convertImageToImage,
    webp: convertImageToImage
  },
  html: {
    txt: convertHtmlToTxt
  }
}

export const getSupportedTargets = (source: SourceFormat): TargetFormat[] => [
  ...supportedTargets[source]
]

const isSourceFormat = (value: string): value is SourceFormat => value in supportedTargets

const isTargetFormat = (value: string): value is TargetFormat =>
  ['html', 'txt', 'png', 'jpg', 'webp', 'pdf'].includes(value)

export const convertRuntime = async (request: ConversionRequest): Promise<ConversionResult[]> => {
  if (!isSourceFormat(request.sourceFormat) || !isTargetFormat(request.targetFormat)) {
    throw new UnsupportedConversionError(request.sourceFormat, request.targetFormat)
  }

  const adapter = adapters[request.sourceFormat][request.targetFormat]
  if (!adapter) {
    throw new UnsupportedConversionError(request.sourceFormat, request.targetFormat)
  }

  return adapter(request)
}
