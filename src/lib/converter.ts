export type ConversionWarning = string | { message: string }

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
  }
}

export type HtmlEncodeOptions = {
  excludeSelectors?: string[]
  snapshotWidth?: number
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

export type SourceFormat = 'pdf' | 'txt' | 'image' | 'html' | 'docx' | 'markdown'

export type TargetFormat = 'html' | 'txt' | 'png' | 'jpg' | 'webp' | 'pdf' | 'md'

export type ExifCategory =
  | 'all'
  | 'geolocation'
  | 'camera'
  | 'datetime'
  | 'software'
  | 'authorCopyright'

export type TxtImageOptions = {
  textColor: string
  backgroundColor: string
  fontSizePx: number
  imageWidthPx: number
  paddingPx: number
  lineHeightPx: number
}

export type ConversionResult = {
  blob: Blob
  filename: string
  mimeType: string
  targetFormat: TargetFormat
  label?: string
  warnings?: ConversionWarning[]
}

export type PaperSize = 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal' | 'B5' | 'auto'

export type PageOrientation = 'portrait' | 'landscape' | 'auto'

export type PdfPageSetupOptions = {
  paperSize: PaperSize
  orientation: PageOrientation
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
    encode?: HtmlEncodeOptions
    decode?: HtmlDecodeOptions
    layout?: HtmlLayoutOptions
    image?: {
      quality: number
      maxWidth?: number
      maxHeight?: number
      keepAspectRatio: boolean
      removeExif?: {
        enabled: boolean
        categories: ExifCategory[]
      }
    }
    imageToPdf?: {
      marginPt: number
      fit: 'original' | 'showAll'
      pageMode: 'auto' | 'single' | 'multi'
      rotationDeg: 0 | 90 | 180 | 270
      scalePercent: number
    }
    pdfPageSetup?: PdfPageSetupOptions
    txtImage?: TxtImageOptions
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
  txt: ['png', 'jpg', 'webp', 'html'],
  image: ['pdf', 'txt', 'png', 'jpg', 'webp', 'html'],
  html: ['txt', 'md'],
  docx: ['txt', 'html'],
  // markdown：对应 .md 文件，可输出 html/txt/图片/pdf。md→md 不开放（无意义）。
  markdown: ['html', 'txt', 'png', 'jpg', 'webp', 'pdf']
} as const satisfies Record<SourceFormat, readonly TargetFormat[]>

export const getSupportedTargets = (source: SourceFormat): TargetFormat[] => [
  ...supportedTargets[source]
]

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
      .replace(
        /font-size:(\d+(?:\.\d+)?)px/g,
        (_, size) => `font-size:${(parseFloat(size) / pageWidth) * 100}vw`
      )
      .replace(
        /left:(\d+(?:\.\d+)?)px/g,
        (_, left) => `left:${(parseFloat(left) / pageWidth) * 100}vw`
      )
      .replace(/top:(\d+(?:\.\d+)?)px/g, (_, top) => `top:${(parseFloat(top) / pageWidth) * 100}vw`)

    const matchStart = (match.index ?? 0) + offset
    const matchEnd = matchStart + match[0].length
    result =
      result.substring(0, matchStart) +
      match[0].replace(style, convertedStyle) +
      result.substring(matchEnd)
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

    const aspectRatio = pageHeight > 0 ? (pageHeight / pageWidth) * 100 : 100

    const pageStart = (match.index ?? 0) + offset
    const pageEnd = html.indexOf('</div>', pageStart)
    if (pageEnd === -1) continue

    const pageContent = html.substring(pageStart, pageEnd + 6)
    const convertedPage = convertTextStylesToVw(pageContent, pageWidth)

    const updatedPage = convertedPage.replace(/style="([^"]*)"/, (_, existingStyle: string) => {
      const newStyle =
        existingStyle.replace(/width:\d+(?:\.\d+)?px/g, '').replace(/height:\d+(?:\.\d+)?px/g, '') +
        `;width:100%;padding-bottom:${aspectRatio}%;position:relative;`
      return `style="${newStyle}"`
    })

    result = result.substring(0, pageStart) + updatedPage + result.substring(pageEnd + 6)
    offset += updatedPage.length - pageContent.length
  }

  return result
}

export const applyHtmlLayout = (html: string, layoutOptions?: HtmlLayoutOptions): string => {
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
        padding-top: 24px !important;
      }
      .hamster-note-page {
        page-break-after: always;
        break-after: page;
        margin: 0 auto 24px auto;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1);
        border-radius: 2px;
      }
      .hamster-note-page:last-child {
        page-break-after: auto;
        break-after: auto;
        margin-bottom: 24px;
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
      padding-top: 24px !important;
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
      padding-top: 24px !important;
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

const createHostParserRuntimeError = (source: SourceFormat, target: TargetFormat): Error =>
  new Error(
    `Host direct conversion is deprecated for ${source} to ${target}; use parser iframe bridge.`
  )

export const convertPdfToHtml: ConvertPdfToHtml = async (input, options) => {
  const targetPageCount = options?.selectedPages?.length ?? input.byteLength
  throw new Error(`Host PDF parsing is disabled for ${targetPageCount}; use parser iframe bridge.`)
}

export const convertFile = async (request: ConversionRequest): Promise<ConversionResult[]> => {
  throw createHostParserRuntimeError(request.source, request.target)
}
