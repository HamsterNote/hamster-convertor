import {
  convertDocxToHtml,
  convertDocxToTxt,
  convertHtmlToMd,
  convertHtmlToTxt,
  convertImageToHtml,
  convertImageToImage,
  convertImageToPdf,
  convertImageToTxt,
  convertMarkdownToHtml,
  convertMarkdownToImage,
  convertMarkdownToPdf,
  convertMarkdownToTxt,
  convertPdfToHtml,
  convertPdfToImage,
  convertPdfToPdf,
  convertPdfToTxt,
  convertTxtToHtml,
  convertTxtToImage,
  type RuntimeConversionAdapter
} from './adapters'
import type {
  ConversionWarning,
  HtmlDecodeOptions,
  HtmlEncodeOptions,
  HtmlLayoutOptions
} from './utils'

export type SourceFormat = 'pdf' | 'txt' | 'image' | 'html' | 'docx' | 'markdown'

export type TargetFormat = 'html' | 'txt' | 'png' | 'jpg' | 'webp' | 'pdf' | 'md'

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
  fit: 'original' | 'showAll'
  pageMode: 'auto' | 'single' | 'multi'
  rotationDeg: 0 | 90 | 180 | 270
  scalePercent: number
}

/** 单位: pt, 1pt = 1/72 inch */
export type PaperSize = 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal' | 'B5' | 'auto'

export type PageOrientation = 'portrait' | 'landscape' | 'auto'

export type PdfPageSetupOptions = {
  paperSize: PaperSize
  orientation: PageOrientation
}

export type TxtImageOptions = {
  textColor: string
  backgroundColor: string
  fontSizePx: number
  imageWidthPx: number
  paddingPx: number
  lineHeightPx: number
}

export type ConversionOptions = {
  pdf?: {
    ocr?: boolean
    selectedPages?: number[]
    selectedImagePages?: number[]
  }
  encode?: HtmlEncodeOptions
  decode?: HtmlDecodeOptions
  layout?: HtmlLayoutOptions
  image?: ImageOptions
  imageToPdf?: ImageToPdfOptions
  pdfPageSetup?: PdfPageSetupOptions
  txtImage?: TxtImageOptions
  markdown?: {
    txtMode?: 'raw' | 'plain'
  }
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
  html: ['txt', 'md'],
  docx: ['txt', 'html'],
  // markdown 源：可以输出 html/txt/三种图片/pdf。md→md 不开放
  markdown: ['html', 'txt', 'png', 'jpg', 'webp', 'pdf']
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
    txt: convertHtmlToTxt,
    md: convertHtmlToMd
  },
  docx: {
    txt: convertDocxToTxt,
    html: convertDocxToHtml
  },
  markdown: {
    html: convertMarkdownToHtml,
    txt: convertMarkdownToTxt,
    png: convertMarkdownToImage,
    jpg: convertMarkdownToImage,
    webp: convertMarkdownToImage,
    pdf: convertMarkdownToPdf
  }
}

export const getSupportedTargets = (source: SourceFormat): TargetFormat[] => [
  ...supportedTargets[source]
]

const isSourceFormat = (value: string): value is SourceFormat => value in supportedTargets

const isTargetFormat = (value: string): value is TargetFormat =>
  ['html', 'txt', 'png', 'jpg', 'webp', 'pdf', 'md'].includes(value)

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
