import type { IntermediateDocument } from '@hamster-note/types'

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
    excludeTextFromBackground?: boolean
  }
}

export type HtmlLayoutOptions = {
  mode: 'paginated' | 'continuous'
  widthMode?: 'actual' | 'fit'
}

export type ConcreteImageTarget = 'png' | 'jpg' | 'webp'

export type EncodeCanvasResult = {
  blob: Blob
  extension: string
  mimeType: string
}

export class EmptyOcrError extends Error {
  readonly code = 'EMPTY_OCR'

  constructor() {
    super('OCR returned no text')
    this.name = 'EmptyOcrError'
  }
}

export class NoPagesSelectedError extends Error {
  readonly code = 'NO_PAGES_SELECTED'

  constructor() {
    super('No pages selected')
    this.name = 'NoPagesSelectedError'
  }
}

export class UnsupportedImageFormatError extends Error {
  readonly code = 'UNSUPPORTED_IMAGE_FORMAT'

  constructor(filename: string) {
    super(`Unsupported image format for conversion: ${filename}`)
    this.name = 'UnsupportedImageFormatError'
  }
}

export const replaceExtension = (filename: string, extension: string): string => {
  const withoutExtension = filename.replace(/\.[^/.]+$/, '')
  return `${withoutExtension || filename}.${extension}`
}

export const appendBeforeExtension = (
  filename: string,
  suffix: string,
  extension: string
): string => {
  const withoutExtension = filename.replace(/\.[^/.]+$/, '')
  return `${withoutExtension || filename}${suffix}.${extension}`
}

export const stripExtension = (filename: string): string =>
  filename.replace(/\.[^/.]+$/, '') || filename

export const bufferToBlob = (buffer: ArrayBuffer, type: string): Blob =>
  new Blob([buffer], { type })

export const blobToArrayBuffer = (blob: Blob): Promise<ArrayBuffer> => {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer()
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
      reject(reader.error ?? new Error('Failed to read blob'))
    })
    reader.readAsArrayBuffer(blob)
  })
}

export const bufferToText = (buffer: ArrayBuffer): string => new TextDecoder().decode(buffer)

export const textToBlob = (text: string, type: string): Blob => new Blob([text], { type })

type TextNode = {
  text?: unknown
  children?: TextNode[]
}

const collectText = (value: unknown): string[] => {
  if (!value || typeof value !== 'object') {
    return []
  }

  const node = value as TextNode
  const ownText = typeof node.text === 'string' ? [node.text] : []
  const childText = Array.isArray(node.children) ? node.children.flatMap(collectText) : []
  return [...ownText, ...childText]
}

export const extractIntermediateText = (intermediateDocument: IntermediateDocument): string =>
  collectText(intermediateDocument).join('\n').trim()

export const extractOcrText = (intermediateDocument: IntermediateDocument | undefined): string => {
  const text =
    intermediateDocument && 'text' in intermediateDocument ? intermediateDocument.text : undefined
  return typeof text === 'string' ? text.trim() : ''
}

const ensureCharsetDeclaration = (html: string): string => {
  if (/<meta\s+charset="utf-8"/i.test(html)) return html

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, match => `${match}\n<meta charset="utf-8">`)
  }

  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, match => `${match}\n<head><meta charset="utf-8"></head>`)
  }

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
        (_, size: string) => `font-size:${(parseFloat(size) / pageWidth) * 100}vw`
      )
      .replace(
        /left:(\d+(?:\.\d+)?)px/g,
        (_, left: string) => `left:${(parseFloat(left) / pageWidth) * 100}vw`
      )
      .replace(
        /top:(\d+(?:\.\d+)?)px/g,
        (_, top: string) => `top:${(parseFloat(top) / pageWidth) * 100}vw`
      )

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

export const convertPxToVw = (html: string): string => {
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
      html, body { overflow: auto !important; height: auto !important; margin: 0; padding: 0; }
      .hamster-note-document { overflow: visible !important; height: auto !important; contain: none !important; }
      .hamster-note-page { page-break-after: always; break-after: page; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1); border-radius: 2px; }
      .hamster-note-page:last-child { page-break-after: auto; break-after: auto; margin-bottom: 0; box-shadow: none; }
    `.trim()
    return injectStyleIntoHead(withCharset, paginatedCss)
  }

  const actualWidthCss = `
    html, body { overflow: auto !important; height: auto !important; margin: 0; padding: 0; }
    .hamster-note-document { overflow: visible !important; height: auto !important; }
    .hamster-note-page { overflow: visible !important; }
  `.trim()

  const fitWidthCss = `
    html, body { overflow-x: hidden !important; overflow-y: auto !important; height: auto !important; margin: 0; padding: 0; }
    .hamster-note-document { width: 100% !important; max-width: 100% !important; overflow: visible !important; height: auto !important; }
    .hamster-note-page { width: 100% !important; height: 0 !important; overflow: hidden !important; position: relative !important; }
  `.trim()

  return injectStyleIntoHead(
    convertPxToVw(withCharset),
    layoutOptions.widthMode === 'fit' ? fitWidthCss : actualWidthCss
  )
}

const imageConfigs: Record<
  ConcreteImageTarget,
  { extension: string; mimeType: string; quality?: number }
> = {
  png: { extension: '.png', mimeType: 'image/png' },
  jpg: { extension: '.jpg', mimeType: 'image/jpeg', quality: 0.92 },
  webp: { extension: '.webp', mimeType: 'image/webp', quality: 0.92 }
}

const createWhiteBackgroundCanvas = (sourceCanvas: HTMLCanvasElement): HTMLCanvasElement => {
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = sourceCanvas.width
  tempCanvas.height = sourceCanvas.height

  const ctx = tempCanvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to get 2d context for temp canvas')
  }

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height)
  ctx.drawImage(sourceCanvas, 0, 0)

  return tempCanvas
}

export const encodeCanvasToImage = (
  canvas: HTMLCanvasElement,
  target: ConcreteImageTarget
): Promise<EncodeCanvasResult> => {
  const config = imageConfigs[target]
  const canvasToEncode = target === 'jpg' ? createWhiteBackgroundCanvas(canvas) : canvas

  return new Promise((resolve, reject) => {
    canvasToEncode.toBlob(
      blob => {
        if (blob === null) {
          reject(new Error(`Failed to encode canvas as ${config.mimeType}`))
          return
        }
        resolve({ blob, extension: config.extension, mimeType: config.mimeType })
      },
      config.mimeType,
      config.quality
    )
  })
}

export const getSelectedPdfPageNumbers = (
  pageCount: number,
  selectedPages?: number[]
): number[] => {
  if (selectedPages === undefined) {
    return Array.from({ length: pageCount }, (_, i) => i + 1)
  }

  const valid = selectedPages.filter(
    (page): page is number => Number.isInteger(page) && page >= 1 && page <= pageCount
  )
  const deduped = [...new Set(valid)].sort((a, b) => a - b)

  if (deduped.length === 0) {
    throw new NoPagesSelectedError()
  }

  return deduped
}

export const extractPdfPages = async (
  arrayBuffer: ArrayBuffer,
  selectedPages: number[]
): Promise<ArrayBuffer> => {
  const { PDFDocument } = await import('pdf-lib')
  const srcDoc = await PDFDocument.load(arrayBuffer)
  const newDoc = await PDFDocument.create()
  const pages = await newDoc.copyPages(
    srcDoc,
    selectedPages.map(page => page - 1)
  )

  for (const page of pages) {
    newDoc.addPage(page)
  }

  const bytes = await newDoc.save()
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

export const isUnsupportedImageFormat = (filename: string): boolean => {
  const lower = filename.toLowerCase()
  return lower.endsWith('.svg') || lower.endsWith('.gif')
}
