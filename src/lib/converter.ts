import type { IntermediateDocument } from '@hamster-note/types'
import { convertHtmlToTxt } from './converter/html-adapter'
import {
  convertImageToHtml,
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

export type HtmlLayoutOptions = {
  mode: 'paginated' | 'continuous'
  widthMode?: 'actual' | 'fit'
}

export type ConvertPdfToHtml = (
  input: Uint8Array,
  options?: {
    selectedPages?: number[]
    decodeOptions?: HtmlDecodeOptions
    layoutOptions?: HtmlLayoutOptions
  }
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
    layout?: HtmlLayoutOptions
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
  image: ['pdf', 'txt', 'png', 'jpg', 'webp', 'html'],
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

// 确保 HTML 输出包含 <meta charset="utf-8"> 声明
// 这对本地文件浏览器正确显示中文至关重要 — 没有 charset 声明时浏览器默认 Latin-1 编码导致乱码
const ensureCharsetDeclaration = (html: string): string => {
  // 已包含 charset meta → 无需重复添加
  if (/<meta\s+charset="utf-8"/i.test(html)) return html

  // 有 <head> 标签 → 在开头插入 charset meta
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, match => `${match}\n<meta charset="utf-8">`)
  }

  // 有 <html> 标签 → 创建 <head> 包含 charset
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, match => `${match}\n<head><meta charset="utf-8"></head>`)
  }

  // 纯片段 → 包装为完整 HTML 文档
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`
}

const injectStyleIntoHead = (html: string, css: string): string => {
  const styleTag = `<style data-hamster-html-layout>\n${css}\n</style>`

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${styleTag}\n</head>`)
  }

  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, match => `${match}\n<head>\n${styleTag}\n</head>`)
  }

  return `${styleTag}\n${html}`
}

const convertTextStylesToVw = (pageHtml: string, pageWidth: number): string => {
  const textRegex = /<span class="hamster-note-text"[^>]*style="([^"]*)"[^>]*>/g
  let result = pageHtml
  let offset = 0

  for (const match of pageHtml.matchAll(textRegex)) {
    const style = match[1]

    const convertedStyle = style
      .replace(/font-size:(\d+(?:\.\d+)?)px/g, (_, size) => `font-size:${(parseFloat(size) / pageWidth * 100)}vw`)
      .replace(/left:(\d+(?:\.\d+)?)px/g, (_, left) => `left:${(parseFloat(left) / pageWidth * 100)}vw`)
      .replace(/top:(\d+(?:\.\d+)?)px/g, (_, top) => `top:${(parseFloat(top) / pageWidth * 100)}vw`)

    const matchStart = (match.index ?? 0) + offset
    const matchEnd = matchStart + match[0].length
    result = result.substring(0, matchStart) + match[0].replace(style, convertedStyle) + result.substring(matchEnd)
    offset += convertedStyle.length - style.length
  }

  return result
}

const convertPxToVw = (html: string): string => {
  const pageRegex = /<div class="hamster-note-page"[^>]*style="([^"]*)"[^>]*>/g
  let result = html
  let offset = 0

  for (const match of html.matchAll(pageRegex)) {
    const style = match[1]
    const widthMatch = style.match(/width:(\d+(?:\.\d+)?)px/)
    const heightMatch = style.match(/height:(\d+(?:\.\d+)?)px/)
    if (!widthMatch) continue

    const pageWidth = parseFloat(widthMatch[1])
    const pageHeight = heightMatch ? parseFloat(heightMatch[1]) : 0
    if (pageWidth <= 0) continue

    const aspectRatio = pageHeight > 0 ? (pageHeight / pageWidth * 100) : 100

    const pageStart = (match.index ?? 0) + offset
    const pageEnd = html.indexOf('</div>', pageStart)
    if (pageEnd === -1) continue

    const pageContent = html.substring(pageStart, pageEnd + 6)
    const convertedPage = convertTextStylesToVw(pageContent, pageWidth)

    const updatedPage = convertedPage.replace(
      /style="([^"]*)"/,
      (_, existingStyle: string) => {
        const newStyle = existingStyle
          .replace(/width:\d+(?:\.\d+)?px/g, '')
          .replace(/height:\d+(?:\.\d+)?px/g, '')
          + `;width:100%;padding-bottom:${aspectRatio}%;position:relative;`
        return `style="${newStyle}"`
      }
    )

    result = result.substring(0, pageStart) + updatedPage + result.substring(pageEnd + 6)
    offset += updatedPage.length - pageContent.length
  }

  return result
}

export const applyHtmlLayout = (
  html: string,
  layoutOptions?: HtmlLayoutOptions
): string => {
  const withCharset = ensureCharsetDeclaration(html)

  if (!layoutOptions || layoutOptions.mode === 'paginated') {
    const paginatedCss = `
      html, body {
        overflow: auto !important;
        height: auto !important;
        margin: 0;
        padding: 0;
      }
      .hamster-note-document {
        overflow: visible !important;
        height: auto !important;
        contain: none !important;
      }
      .hamster-note-page {
        page-break-after: always;
        break-after: page;
        margin-bottom: 24px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1);
        border-radius: 2px;
      }
      .hamster-note-page:last-child {
        page-break-after: auto;
        break-after: auto;
        margin-bottom: 0;
        box-shadow: none;
      }
    `.trim()
    return injectStyleIntoHead(withCharset, paginatedCss)
  }

  // 连续模式 - 实际宽度：启用滚动，保持原始尺寸
  const actualWidthCss = `
    html, body {
      overflow: auto !important;
      height: auto !important;
      margin: 0;
      padding: 0;
    }
    .hamster-note-document {
      overflow: visible !important;
      height: auto !important;
    }
    .hamster-note-page {
      overflow: visible !important;
    }
  `.trim()

  // 连续模式 - 撑满宽度：将 px 转换为 vw 实现响应式缩放
  const processedHtml = convertPxToVw(withCharset)
  
  const fitWidthCss = `
    html, body {
      overflow-x: hidden !important;
      overflow-y: auto !important;
      height: auto !important;
      margin: 0;
      padding: 0;
    }
    .hamster-note-document {
      width: 100% !important;
      max-width: 100% !important;
      overflow: visible !important;
      height: auto !important;
    }
    .hamster-note-page {
      width: 100% !important;
      height: 0 !important;
      overflow: hidden !important;
      position: relative !important;
    }
  `.trim()

  return injectStyleIntoHead(
    processedHtml,
    layoutOptions.widthMode === 'fit' ? fitWidthCss : actualWidthCss
  )
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
    const result = await decodeByParserModules(new Uint8Array(subsetBuffer), options?.decodeOptions)
    return {
      html: applyHtmlLayout(result.html, options?.layoutOptions),
      warnings: result.warnings
    }
  }

  const result = await decodeByParserModules(input, options?.decodeOptions)
  return {
    html: applyHtmlLayout(result.html, options?.layoutOptions),
    warnings: result.warnings
  }
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
  options?: {
    selectedPages?: number[]
    decodeOptions?: HtmlDecodeOptions
    layoutOptions?: HtmlLayoutOptions
  }
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
    decodeOptions: request.options?.decode,
    layoutOptions: request.options?.layout
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
