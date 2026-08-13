import type {
  IntermediateContent,
  IntermediateDocument,
  IntermediateImage,
  IntermediatePage
} from '@hamster-note/types'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { stripExifCategories } from './exif'
import type { ConversionRequest, ConversionResult } from './index'
import {
  appendBeforeExtension,
  applyHtmlLayout,
  blobToArrayBuffer,
  bufferToBlob,
  bufferToText,
  type ConcreteImageTarget,
  EmptyOcrError,
  encodeCanvasToImage,
  extractIntermediateText,
  extractOcrText,
  extractPdfPages,
  formatPageTextsAsReadableText,
  getSelectedPdfPageNumbers,
  isUnsupportedImageFormat,
  replaceExtension,
  sanitizeTxtHtmlOutput,
  stripExtension,
  textToBlob,
  UnsupportedImageFormatError
} from './utils'

type PdfParserModule = typeof import('@hamster-note/pdf-parser')
type ImageParserModule = typeof import('@hamster-note/image-parser')
type HtmlParserModule = typeof import('@hamster-note/html-parser')
type DocxParserModule = typeof import('@hamster-note/docx-parser')
type MarkdownParserModule = typeof import('@hamster-note/markdown-parser')
type Html2CanvasModule = typeof import('html2canvas')
type PdfParserApi = {
  encode: (arrayBuffer: ArrayBuffer) => Promise<IntermediateDocument | undefined>
}
type HtmlParserDecodeOptions = Parameters<HtmlParserModule['HtmlParser']['decodeToHtml']>[1]
type HtmlParserDecodeResultOptions = Parameters<HtmlParserModule['HtmlParser']['decode']>[1]
type HtmlParserEncodeOptions = Parameters<HtmlParserModule['HtmlParser']['encode']>[1]
type JsPdfModule = typeof import('jspdf')
type JsPdfDocument = InstanceType<JsPdfModule['jsPDF']>

type TextItem = { str: string }
type TextContent = { items: TextItem[] }
type PdfPage = {
  getTextContent: (options: { includeMarkedContent: boolean }) => Promise<TextContent>
  getViewport: (options: { scale: number }) => {
    width: number
    height: number
  }
  render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
    promise: Promise<void>
  }
}
type PdfDocument = {
  numPages: number
  getPage: (pageNumber: number) => Promise<PdfPage>
}
type PdfJsModule = {
  GlobalWorkerOptions?: { workerSrc?: string }
  getDocument: (options: { data: Uint8Array }) => {
    promise: Promise<PdfDocument>
  }
}
type ImageDimensions = { height: number; width: number }
type ImageOptions = NonNullable<NonNullable<ConversionRequest['options']>['image']>
type ImageToPdfOptions = NonNullable<NonNullable<ConversionRequest['options']>['imageToPdf']>
type TxtImageOptions = NonNullable<NonNullable<ConversionRequest['options']>['txtImage']>
type PdfPageBox = { height: number; width: number }
type PdfPageOrientation = 'landscape' | 'portrait'
type PdfPageSetupOptions = NonNullable<NonNullable<ConversionRequest['options']>['pdfPageSetup']>
type ThumbnailPage = IntermediatePage & {
  getThumbnail: (scale?: number) => Promise<IntermediateImage | undefined>
}

const PAPER_SIZE_MAP: Record<string, PdfPageBox> = {
  A4: { width: 595.28, height: 841.89 },
  A3: { width: 841.89, height: 1190.55 },
  A5: { width: 419.53, height: 595.28 },
  Letter: { width: 612, height: 792 },
  Legal: { width: 612, height: 1008 },
  B5: { width: 498.9, height: 708.66 }
}

const DEFAULT_PDF_PAGE_SETUP: PdfPageSetupOptions = {
  paperSize: 'A4',
  orientation: 'auto'
}
const DEFAULT_IMAGE_TO_PDF_OPTIONS: ImageToPdfOptions = {
  marginPt: 0,
  fit: 'original',
  pageMode: 'auto',
  rotationDeg: 0,
  scalePercent: 100
}
const DEFAULT_TXT_IMAGE_OPTIONS: TxtImageOptions = {
  textColor: '#000000',
  backgroundColor: '#ffffff',
  fontSizePx: 16,
  imageWidthPx: 800,
  paddingPx: 20,
  lineHeightPx: 24
}

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('Failed to read image blob as data URL'))
    })
    reader.addEventListener('error', () => reject(reader.error ?? new Error('FileReader failed')))
    reader.readAsDataURL(blob)
  })

const dataUrlToArrayBuffer = (dataUrl: string): ArrayBuffer => {
  const separatorIndex = dataUrl.indexOf(',')
  if (separatorIndex === -1) {
    return new TextEncoder().encode(dataUrl).buffer
  }

  const metadata = dataUrl.slice(0, separatorIndex)
  const payload = dataUrl.slice(separatorIndex + 1)
  const binary = metadata.toLowerCase().endsWith(';base64')
    ? atob(payload)
    : decodeURIComponent(payload)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes.buffer
}

const imageBlobToOutputBuffer = async (
  blob: Blob,
  request: ConversionRequest,
  targetFormat: ConcreteImageTarget
): Promise<ArrayBuffer> => {
  const removeExif = request.options?.image?.removeExif
  if (targetFormat !== 'jpg' || !removeExif?.enabled || removeExif.categories.length === 0) {
    return blobToArrayBuffer(blob)
  }

  const dataUrl = await blobToDataUrl(blob)
  return dataUrlToArrayBuffer(stripExifCategories(dataUrl, removeExif.categories))
}

export class OcrRequiredError extends Error {
  readonly code = 'OCR_REQUIRED'

  constructor(filename: string) {
    super(`OCR is required to extract text from ${filename}`)
    this.name = 'OcrRequiredError'
  }
}

const arrayBufferToBytes = (arrayBuffer: ArrayBuffer): Uint8Array => new Uint8Array(arrayBuffer)

const configurePdfJsWorker = (pdfjs: PdfJsModule): void => {
  if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  }
}

const loadPdfDocument = async (arrayBuffer: ArrayBuffer): Promise<PdfDocument> => {
  const pdfjs = (await import('pdfjs-dist')) as unknown as PdfJsModule
  configurePdfJsWorker(pdfjs)
  return pdfjs.getDocument({ data: arrayBufferToBytes(arrayBuffer) }).promise
}

const extractTextWithHamster = async (arrayBuffer: ArrayBuffer): Promise<string> => {
  const { PdfParser } = (await import('@hamster-note/pdf-parser')) as PdfParserModule & {
    PdfParser: PdfParserApi
  }
  const intermediateDocument = await PdfParser.encode(arrayBuffer)
  return intermediateDocument ? extractIntermediateText(intermediateDocument) : ''
}

const extractTextWithPdfJs = async (arrayBuffer: ArrayBuffer): Promise<string> => {
  const pdfDocument = await loadPdfDocument(arrayBuffer)
  const pages = await Promise.all(
    Array.from({ length: pdfDocument.numPages }, async (_, index) => {
      const page = await pdfDocument.getPage(index + 1)
      const textContent = await page.getTextContent({
        includeMarkedContent: false
      })
      return textContent.items.map(item => item.str).join(' ')
    })
  )
  return pages.join('\n').trim()
}

const renderPageToCanvas = async (page: PdfPage): Promise<HTMLCanvasElement> => {
  const viewport = page.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)

  const canvasContext = canvas.getContext('2d')
  if (!canvasContext) {
    throw new Error('Canvas 2D context is unavailable')
  }

  await page.render({ canvasContext, viewport }).promise
  return canvas
}

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', () => reject(new Error('Failed to load image')))
    image.src = url
  })

const loadImageDimensions = async (url: string): Promise<ImageDimensions> => {
  const image = await loadImage(url)
  return { height: image.naturalHeight, width: image.naturalWidth }
}

const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

const normalizeRoundedNumber = (
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.min(Math.max(Math.round(value), min), max)
}

const normalizeTxtImageOptions = (options?: Partial<TxtImageOptions>): TxtImageOptions => {
  if (!options) {
    return DEFAULT_TXT_IMAGE_OPTIONS
  }

  const fontSizePx = normalizeRoundedNumber(
    options.fontSizePx,
    DEFAULT_TXT_IMAGE_OPTIONS.fontSizePx,
    8,
    96
  )
  const imageWidthPx = normalizeRoundedNumber(
    options.imageWidthPx,
    DEFAULT_TXT_IMAGE_OPTIONS.imageWidthPx,
    320,
    4096
  )
  let paddingPx = normalizeRoundedNumber(
    options.paddingPx,
    DEFAULT_TXT_IMAGE_OPTIONS.paddingPx,
    0,
    256
  )
  const lineHeightPx = Math.max(
    normalizeRoundedNumber(options.lineHeightPx, DEFAULT_TXT_IMAGE_OPTIONS.lineHeightPx, 8, 160),
    fontSizePx
  )

  if (imageWidthPx - paddingPx * 2 < 40) {
    paddingPx = Math.max(0, Math.floor((imageWidthPx - 40) / 2))
  }

  return {
    textColor:
      typeof options.textColor === 'string'
        ? options.textColor
        : DEFAULT_TXT_IMAGE_OPTIONS.textColor,
    backgroundColor:
      typeof options.backgroundColor === 'string'
        ? options.backgroundColor
        : DEFAULT_TXT_IMAGE_OPTIONS.backgroundColor,
    fontSizePx,
    imageWidthPx,
    paddingPx,
    lineHeightPx
  }
}

const getRotatedImageDimensions = (
  dimensions: ImageDimensions,
  rotationDeg: ImageToPdfOptions['rotationDeg']
): ImageDimensions =>
  rotationDeg === 90 || rotationDeg === 270
    ? { width: dimensions.height, height: dimensions.width }
    : dimensions

const getImageToPdfPageBox = (
  dimensions: ImageDimensions,
  pageMode: ImageToPdfOptions['pageMode'],
  pageSetup: PdfPageSetupOptions
): PdfPageBox => {
  // auto 模式下根据图片尺寸选择方向；single 模式强制 portrait
  const getOrientationBox = (box: PdfPageBox): PdfPageBox => {
    if (pageMode === 'single') return box
    return dimensions.width > dimensions.height ? { width: box.height, height: box.width } : box
  }

  if (pageSetup.paperSize === 'auto') {
    // auto 纸张尺寸 = 以图片尺寸作为页面尺寸，
    // 但仍需尊重 orientation 设置：
    //   portrait  → 确保 width <= height（横图则交换宽高）
    //   landscape → 确保 width >= height（竖图则交换宽高）
    //   auto      → 保持原图宽高比
    const rawBox = { width: dimensions.width, height: dimensions.height }
    if (pageSetup.orientation === 'portrait' && rawBox.width > rawBox.height) {
      return { width: rawBox.height, height: rawBox.width }
    }
    if (pageSetup.orientation === 'landscape' && rawBox.height > rawBox.width) {
      return { width: rawBox.height, height: rawBox.width }
    }
    return rawBox
  }

  const baseBox = PAPER_SIZE_MAP[pageSetup.paperSize] ?? PAPER_SIZE_MAP.A4

  if (pageSetup.orientation === 'landscape') {
    return { width: baseBox.height, height: baseBox.width }
  }
  if (pageSetup.orientation === 'portrait') {
    return baseBox
  }
  // orientation === 'auto' → 根据 pageMode 和图片尺寸决定
  return getOrientationBox(baseBox)
}

const getPdfPageOrientation = (pageBox: PdfPageBox): PdfPageOrientation =>
  pageBox.width > pageBox.height ? 'landscape' : 'portrait'

const getImageToPdfDrawBox = (
  dimensions: ImageDimensions,
  pageBox: PdfPageBox,
  options: ImageToPdfOptions
): { drawHeight: number; drawWidth: number; x: number; y: number } => {
  const marginPt = clampNumber(options.marginPt, 0, Math.min(pageBox.width, pageBox.height) / 2)
  const usableWidth = pageBox.width - marginPt * 2
  const usableHeight = pageBox.height - marginPt * 2

  const showAllScale = Math.min(usableWidth / dimensions.width, usableHeight / dimensions.height, 1)
  const baseScale = options.fit === 'showAll' ? showAllScale : 1
  const scaleMultiplier = clampNumber(options.scalePercent, 10, 300) / 100
  const drawWidth = dimensions.width * baseScale * scaleMultiplier
  const drawHeight = dimensions.height * baseScale * scaleMultiplier

  return {
    drawHeight,
    drawWidth,
    x: marginPt,
    y: marginPt
  }
}

const getSelectedPdfBuffer = async (
  buffer: ArrayBuffer,
  selectedPages?: number[]
): Promise<ArrayBuffer> => {
  if (selectedPages === undefined) {
    return buffer
  }

  const { PDFDocument } = await import('pdf-lib')
  const srcDoc = await PDFDocument.load(buffer)
  const pageNumbers = getSelectedPdfPageNumbers(srcDoc.getPageCount(), selectedPages)
  return extractPdfPages(buffer, pageNumbers)
}

const isIntermediateImage = (item: IntermediateContent): item is IntermediateImage => 'src' in item

const hasRenderableImageSourceValue = (src: string): boolean => {
  const trimmed = src.trim()

  if (!trimmed) {
    return false
  }

  if (trimmed.toLowerCase().startsWith('data:')) {
    const commaIndex = trimmed.indexOf(',')
    return commaIndex >= 0 && trimmed.slice(commaIndex + 1).trim().length > 0
  }

  return true
}

const hasRenderableImageSource = (item: IntermediateContent): boolean =>
  !isIntermediateImage(item) || hasRenderableImageSourceValue(item.src)

const canSanitizeThumbnail = (page: IntermediatePage): page is ThumbnailPage =>
  typeof page.getThumbnail === 'function'

const sanitizePageThumbnail = (page: IntermediatePage): void => {
  if (!canSanitizeThumbnail(page)) {
    return
  }

  const getThumbnail = page.getThumbnail.bind(page)
  page.getThumbnail = async scale => {
    const thumbnail = await getThumbnail(scale)
    return thumbnail && hasRenderableImageSourceValue(thumbnail.src) ? thumbnail : undefined
  }
}

const sanitizePdfHtmlBackgrounds = (html: string): string => {
  const document = new DOMParser().parseFromString(html, 'text/html')

  document.querySelectorAll<HTMLElement>('[style]').forEach(element => {
    const backgroundImage = element.style.backgroundImage
    const invalidDataBackground =
      backgroundImage.startsWith('url("data:') || backgroundImage.startsWith("url('data:")

    if (invalidDataBackground && !hasRenderableImageSourceValue(backgroundImage.slice(5, -2))) {
      element.style.removeProperty('background-image')
    }
  })

  return document.body.innerHTML
}

const preparePdfIntermediateForHtml = async (intermediate: IntermediateDocument): Promise<void> => {
  const pages = await intermediate.pages
  const hydratedPages = await Promise.all(
    pages.map(async page => {
      const content = await page.getContent()
      page.content = content.filter(hasRenderableImageSource)
      sanitizePageThumbnail(page)
      return page
    })
  )

  intermediate.pages = hydratedPages
}

export const convertPdfToHtml = async (request: ConversionRequest): Promise<ConversionResult[]> => {
  const selectedPages = request.options?.pdf?.selectedPages
  const effectiveBuffer = await getSelectedPdfBuffer(request.buffer, selectedPages)
  const [{ PdfParser }, { HtmlParser }] = (await Promise.all([
    import('@hamster-note/pdf-parser') as Promise<PdfParserModule>,
    import('@hamster-note/html-parser') as Promise<HtmlParserModule>
  ])) as [PdfParserModule & { PdfParser: PdfParserApi }, HtmlParserModule]

  const intermediate = await PdfParser.encode(effectiveBuffer)
  if (!intermediate) {
    throw new Error('PDF parser returned no intermediate document')
  }

  await preparePdfIntermediateForHtml(intermediate)

  const html = sanitizePdfHtmlBackgrounds(
    await HtmlParser.decodeToHtml(intermediate, request.options?.decode as HtmlParserDecodeOptions)
  )
  const mimeType = 'text/html;charset=utf-8'
  return [
    {
      buffer: await blobToArrayBuffer(
        textToBlob(applyHtmlLayout(html, request.options?.layout), mimeType)
      ),
      filename: replaceExtension(request.filename, 'html'),
      mimeType,
      targetFormat: 'html',
      warnings: []
    }
  ]
}

const intermediateToHtmlResult = async (
  request: ConversionRequest,
  intermediate: IntermediateDocument
): Promise<ConversionResult[]> => {
  const { HtmlParser } = (await import('@hamster-note/html-parser')) as HtmlParserModule
  const html = await HtmlParser.decodeToHtml(
    intermediate,
    request.options?.decode as HtmlParserDecodeOptions
  )
  const mimeType = 'text/html;charset=utf-8'
  return [
    {
      buffer: await blobToArrayBuffer(
        textToBlob(applyHtmlLayout(html, request.options?.layout), mimeType)
      ),
      filename: replaceExtension(request.filename, 'html'),
      mimeType,
      targetFormat: 'html'
    }
  ]
}

const intermediateToTxtResult = async (
  request: ConversionRequest,
  intermediate: IntermediateDocument
): Promise<ConversionResult[]> => {
  const text = extractIntermediateText(intermediate)
  const mimeType = 'text/plain;charset=utf-8'
  return [
    {
      buffer: await blobToArrayBuffer(textToBlob(text, mimeType)),
      filename: replaceExtension(request.filename, 'txt'),
      mimeType,
      targetFormat: 'txt'
    }
  ]
}

const encodeDocxIntermediate = async (arrayBuffer: ArrayBuffer): Promise<IntermediateDocument> => {
  const { DocxParser } = (await import('@hamster-note/docx-parser')) as DocxParserModule
  return DocxParser.encodeToIntermediate(arrayBuffer)
}

export const convertDocxToHtml = async (
  request: ConversionRequest
): Promise<ConversionResult[]> => {
  const intermediate = await encodeDocxIntermediate(request.buffer)
  return intermediateToHtmlResult(request, intermediate)
}

export const convertDocxToTxt = async (request: ConversionRequest): Promise<ConversionResult[]> => {
  const intermediate = await encodeDocxIntermediate(request.buffer)
  return intermediateToTxtResult(request, intermediate)
}

export const convertPdfToTxt = async (request: ConversionRequest): Promise<ConversionResult[]> => {
  const selectedPages =
    request.options?.pdf?.selectedPages ?? request.options?.pdf?.selectedImagePages
  const effectiveBuffer = await getSelectedPdfBuffer(request.buffer, selectedPages)
  let text = ''

  try {
    text = await extractTextWithHamster(effectiveBuffer)
  } catch {
    text = ''
  }

  if (!text) {
    text = await extractTextWithPdfJs(effectiveBuffer)
  }

  if (!text) {
    throw new OcrRequiredError(request.filename)
  }

  const mimeType = 'text/plain;charset=utf-8'
  return [
    {
      buffer: await blobToArrayBuffer(textToBlob(text, mimeType)),
      filename: replaceExtension(request.filename, 'txt'),
      mimeType,
      targetFormat: 'txt'
    }
  ]
}

export const convertPdfToImage = async (
  request: ConversionRequest
): Promise<ConversionResult[]> => {
  const pdfDocument = await loadPdfDocument(request.buffer)
  const selected = request.options?.pdf?.selectedPages ?? request.options?.pdf?.selectedImagePages
  const pageNumbers = getSelectedPdfPageNumbers(pdfDocument.numPages, selected)
  const targetFormat = request.targetFormat

  if (!['png', 'jpg', 'webp'].includes(targetFormat)) {
    throw new Error(`Unsupported PDF image target: ${targetFormat}`)
  }

  return Promise.all(
    pageNumbers.map(async pageNumber => {
      const page = await pdfDocument.getPage(pageNumber)
      const canvas = await renderPageToCanvas(page)
      const { blob, extension, mimeType } = await encodeCanvasToImage(
        canvas,
        targetFormat as ConcreteImageTarget
      )
      return {
        buffer: await imageBlobToOutputBuffer(blob, request, targetFormat as ConcreteImageTarget),
        filename: `${stripExtension(request.filename)}-page-${String(pageNumber).padStart(3, '0')}${extension}`,
        mimeType,
        targetFormat
      }
    })
  )
}

const copyPdfWithoutOcr = (request: ConversionRequest): ConversionResult[] => [
  {
    buffer: request.buffer.slice(0),
    filename: request.filename,
    mimeType: 'application/pdf',
    targetFormat: 'pdf'
  }
]

const convertRenderedPageToOcrText = async (
  blob: Blob,
  ImageParser: ImageParserModule['ImageParser']
): Promise<string> => {
  try {
    const intermediateDocument = await ImageParser.encode(await blob.arrayBuffer())
    return extractOcrText(intermediateDocument)
  } catch {
    return ''
  }
}

const processOcrPage = async (
  page: PdfPage,
  doc: JsPdfDocument,
  ImageParser: ImageParserModule['ImageParser'],
  arrayBuffer: ArrayBuffer,
  pageNumber: number
): Promise<boolean> => {
  const viewport = page.getViewport({ scale: 2 })

  if (pageNumber > 1) {
    doc.addPage(
      [viewport.width, viewport.height],
      viewport.width > viewport.height ? 'landscape' : 'portrait'
    )
  }

  let blob: Blob | undefined
  try {
    const canvas = await renderPageToCanvas(page)
    ;({ blob } = await encodeCanvasToImage(canvas, 'png'))
  } catch {
    blob = undefined
  }

  const objectUrl = blob ? URL.createObjectURL(blob) : undefined

  try {
    const text = blob
      ? await convertRenderedPageToOcrText(blob, ImageParser)
      : await extractTextWithPdfJs(arrayBuffer.slice(0))

    if (objectUrl) {
      doc.addImage(objectUrl, 0, 0, viewport.width, viewport.height)
    }

    if (text) {
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(1)
      doc.text(text, 16, 16)
      return true
    }
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
    }
  }

  return false
}

const createOcrPdf = async (
  request: ConversionRequest,
  selectedPages?: number[]
): Promise<ConversionResult[]> => {
  const [{ ImageParser }, { jsPDF }, pdfDocument] = await Promise.all([
    import('@hamster-note/image-parser') as Promise<ImageParserModule>,
    import('jspdf') as Promise<JsPdfModule>,
    loadPdfDocument(request.buffer.slice(0))
  ])
  const pageNumbers = getSelectedPdfPageNumbers(pdfDocument.numPages, selectedPages)
  const firstPage = await pdfDocument.getPage(pageNumbers[0])
  const firstViewport = firstPage.getViewport({ scale: 2 })
  const doc = new jsPDF({
    unit: 'px',
    format: [firstViewport.width, firstViewport.height]
  })
  let hasText = false
  let isFirst = true

  for (const pageNumber of pageNumbers) {
    const page = isFirst ? firstPage : await pdfDocument.getPage(pageNumber)
    const pageHadText = await processOcrPage(
      page,
      doc,
      ImageParser,
      request.buffer,
      isFirst ? 1 : pageNumber
    )
    isFirst = false
    if (pageHadText) {
      hasText = true
    }
  }

  if (!hasText) {
    throw new EmptyOcrError()
  }

  const blob = doc.output('blob')
  return [
    {
      buffer: await blobToArrayBuffer(blob),
      filename: replaceExtension(request.filename, 'pdf'),
      mimeType: 'application/pdf',
      targetFormat: 'pdf'
    }
  ]
}

export const convertPdfToPdf = async (request: ConversionRequest): Promise<ConversionResult[]> => {
  const selectedPages =
    request.options?.pdf?.selectedPages ?? request.options?.pdf?.selectedImagePages

  if (!request.options?.pdf?.ocr) {
    if (selectedPages !== undefined) {
      const subsetBuffer = await getSelectedPdfBuffer(request.buffer, selectedPages)
      return [
        {
          buffer: subsetBuffer,
          filename: request.filename,
          mimeType: 'application/pdf',
          targetFormat: 'pdf'
        }
      ]
    }
    return copyPdfWithoutOcr(request)
  }

  return createOcrPdf(request, selectedPages)
}

export const convertImageToPdf = async (
  request: ConversionRequest
): Promise<ConversionResult[]> => {
  const objectUrl = URL.createObjectURL(
    bufferToBlob(request.buffer, request.mimeType ?? 'application/octet-stream')
  )

  try {
    const dimensions = await loadImageDimensions(objectUrl)
    const { jsPDF } = (await import('jspdf')) as JsPdfModule
    const imageToPdfOptions = request.options?.imageToPdf ?? DEFAULT_IMAGE_TO_PDF_OPTIONS
    const pageSetup = request.options?.pdfPageSetup ?? DEFAULT_PDF_PAGE_SETUP
    const effectiveDimensions = getRotatedImageDimensions(dimensions, imageToPdfOptions.rotationDeg)
    const pageBox = getImageToPdfPageBox(effectiveDimensions, imageToPdfOptions.pageMode, pageSetup)
    const { drawHeight, drawWidth, x, y } = getImageToPdfDrawBox(
      effectiveDimensions,
      pageBox,
      imageToPdfOptions
    )

    const doc = new jsPDF({
      orientation: getPdfPageOrientation(pageBox),
      unit: 'pt',
      format: [pageBox.width, pageBox.height]
    })
    doc.addImage(
      objectUrl,
      x,
      y,
      drawWidth,
      drawHeight,
      undefined,
      undefined,
      imageToPdfOptions.rotationDeg
    )
    const blob = doc.output('blob')
    return [
      {
        buffer: await blobToArrayBuffer(blob),
        filename: replaceExtension(request.filename, 'pdf'),
        mimeType: 'application/pdf',
        targetFormat: 'pdf'
      }
    ]
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export const convertImageToTxt = async (
  request: ConversionRequest
): Promise<ConversionResult[]> => {
  const { ImageParser } = (await import('@hamster-note/image-parser')) as ImageParserModule
  let intermediateDocument: IntermediateDocument

  try {
    intermediateDocument = await ImageParser.encode(request.buffer)
  } catch {
    throw new EmptyOcrError()
  }

  const text = extractOcrText(intermediateDocument)
  if (!text) {
    throw new EmptyOcrError()
  }

  const mimeType = 'text/plain;charset=utf-8'
  return [
    {
      buffer: await blobToArrayBuffer(textToBlob(text, mimeType)),
      filename: appendBeforeExtension(request.filename, '-ocr', 'txt'),
      mimeType,
      targetFormat: 'txt'
    }
  ]
}

export const convertImageToHtml = async (
  request: ConversionRequest
): Promise<ConversionResult[]> => {
  const [{ ImageParser }, { HtmlParser }] = await Promise.all([
    import('@hamster-note/image-parser') as Promise<ImageParserModule>,
    import('@hamster-note/html-parser') as Promise<HtmlParserModule>
  ])
  const intermediate = await ImageParser.encode(request.buffer)
  const html = await HtmlParser.decodeToHtml(
    intermediate,
    request.options?.decode as HtmlParserDecodeOptions
  )
  const mimeType = 'text/html;charset=utf-8'
  return [
    {
      buffer: await blobToArrayBuffer(
        textToBlob(applyHtmlLayout(html, request.options?.layout), mimeType)
      ),
      filename: replaceExtension(request.filename, 'html'),
      mimeType,
      targetFormat: 'html'
    }
  ]
}

const calculateImageTargetSize = (
  naturalWidth: number,
  naturalHeight: number,
  imageOptions: ImageOptions | undefined
): { width: number; height: number } => {
  const maxWidth = imageOptions?.maxWidth
  const maxHeight = imageOptions?.maxHeight

  if (!maxWidth && !maxHeight) {
    return { width: naturalWidth, height: naturalHeight }
  }

  const boundedMaxWidth = maxWidth ?? Infinity
  const boundedMaxHeight = maxHeight ?? Infinity

  if (imageOptions?.keepAspectRatio !== false) {
    const scale = Math.min(boundedMaxWidth / naturalWidth, boundedMaxHeight / naturalHeight, 1)
    return {
      width: Math.max(1, Math.round(naturalWidth * scale)),
      height: Math.max(1, Math.round(naturalHeight * scale))
    }
  }

  return {
    width: Math.max(1, Math.round(Math.min(naturalWidth, boundedMaxWidth))),
    height: Math.max(1, Math.round(Math.min(naturalHeight, boundedMaxHeight)))
  }
}

export const convertImageToImage = async (
  request: ConversionRequest
): Promise<ConversionResult[]> => {
  if (isUnsupportedImageFormat(request.filename)) {
    throw new UnsupportedImageFormatError(request.filename)
  }

  const objectUrl = URL.createObjectURL(
    bufferToBlob(request.buffer, request.mimeType ?? 'application/octet-stream')
  )

  try {
    const image = await loadImage(objectUrl)
    const imageOptions = request.options?.image
    const { width: targetWidth, height: targetHeight } = calculateImageTargetSize(
      image.naturalWidth,
      image.naturalHeight,
      imageOptions
    )

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to get 2d context')
    }
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight)

    const targetFormat = request.targetFormat as ConcreteImageTarget
    if (!['png', 'jpg', 'webp'].includes(targetFormat)) {
      throw new Error(`Unsupported image conversion target: ${targetFormat}`)
    }

    const { blob, mimeType } = await encodeCanvasToImage(
      canvas,
      targetFormat,
      imageOptions?.quality
    )
    return [
      {
        buffer: await imageBlobToOutputBuffer(blob, request, targetFormat),
        filename: replaceExtension(request.filename, targetFormat),
        mimeType,
        targetFormat
      }
    ]
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

// 从 IntermediateDocument 提取纯文本：真实 TxtParser.encode 把文本放在
// pages[i].content[j].content（IntermediateText.content），而不是顶层 .text。
// 旧实现读 intermediate.text，永远返回空串，导致 TXT→PNG/JPG/WebP 渲染空白图。
// 本实现复刻 TxtParser.decode 的官方提取链路：await pages → page.getContent() →
// 拼接 IntermediateText.content。仅取文本节点：IntermediateImage 没有 string content，
// 用 typeof 守卫即可区分。
const readTextContent = (node: unknown): string => {
  if (typeof node !== 'object' || node === null) {
    return ''
  }
  const value = (node as { content?: unknown }).content
  return typeof value === 'string' ? value : ''
}

const extractTextFromIntermediate = async (intermediate: IntermediateDocument): Promise<string> => {
  const pages = await intermediate.pages
  if (!Array.isArray(pages) || pages.length === 0) {
    return ''
  }

  const pageTexts: string[] = []
  for (const page of pages) {
    const contents = await page.getContent()
    if (!Array.isArray(contents)) {
      continue
    }
    const pageText = contents.map(readTextContent).join('')
    if (pageText.length > 0) {
      pageTexts.push(pageText)
    }
  }

  return pageTexts.join('\n')
}

const wrapTokenByCharacter = (
  ctx: CanvasRenderingContext2D,
  token: string,
  maxWidth: number,
  initialLine: string
): { lines: string[]; trailing: string } => {
  // CJK / 极长无空格 token 的字符级换行 fallback。
  // Array.from 按 Unicode code point 切分，正确处理 emoji 等代理对。
  const out: string[] = []
  let line = initialLine
  for (const char of Array.from(token)) {
    const next = line + char
    if (ctx.measureText(next).width > maxWidth && line !== '') {
      out.push(line)
      line = char
    } else {
      line = next
    }
  }
  return { lines: out, trailing: line }
}

const appendWord = (
  ctx: CanvasRenderingContext2D,
  word: string,
  maxWidth: number,
  currentLine: string
): { flushed: string[]; nextLine: string } => {
  // 三种情况：1) 拼接后仍 ≤ maxWidth；2) word 自身 ≤ maxWidth 需要换新行；
  // 3) word 自身超宽，按字符切分（CJK / 长串 token）。
  const testLine = currentLine ? `${currentLine} ${word}` : word
  if (ctx.measureText(testLine).width <= maxWidth) {
    return { flushed: [], nextLine: testLine }
  }

  const flushed: string[] = []
  if (currentLine) flushed.push(currentLine)

  if (ctx.measureText(word).width <= maxWidth) {
    return { flushed, nextLine: word }
  }

  const { lines, trailing } = wrapTokenByCharacter(ctx, word, maxWidth, '')
  flushed.push(...lines)
  return { flushed, nextLine: trailing }
}

const wrapParagraph = (
  ctx: CanvasRenderingContext2D,
  paragraph: string,
  maxWidth: number
): string[] => {
  const out: string[] = []
  let currentLine = ''
  for (const word of paragraph.split(' ')) {
    const { flushed, nextLine } = appendWord(ctx, word, maxWidth, currentLine)
    out.push(...flushed)
    currentLine = nextLine
  }
  if (currentLine) out.push(currentLine)
  return out
}

const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
  const wrappedLines: string[] = []
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      wrappedLines.push('')
      continue
    }
    wrappedLines.push(...wrapParagraph(ctx, paragraph, maxWidth))
  }
  return wrappedLines
}

export const convertTxtToImage = async (
  request: ConversionRequest
): Promise<ConversionResult[]> => {
  let text: string
  const warnings: string[] = []

  try {
    const { TxtParser } = await import('@hamster-note/txt-parser')
    text = await extractTextFromIntermediate(await TxtParser.encode(request.buffer))
  } catch {
    text = bufferToText(request.buffer)
    warnings.push('Used fallback text reader')
  }

  const txtImageOptions = normalizeTxtImageOptions(request.options?.txtImage)
  const canvasWidth = txtImageOptions.imageWidthPx
  const padding = txtImageOptions.paddingPx
  const lineHeight = txtImageOptions.lineHeightPx
  const font = `${txtImageOptions.fontSizePx}px sans-serif`
  const measureCtx = document.createElement('canvas').getContext('2d')
  if (!measureCtx) {
    throw new Error('Canvas 2D context not available')
  }
  measureCtx.font = font

  const lines = wrapText(measureCtx, text, Math.max(40, canvasWidth - padding * 2))
  const canvas = document.createElement('canvas')
  canvas.width = canvasWidth
  canvas.height = Math.max(lines.length * lineHeight + padding * 2, 100)

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D context not available')
  }

  ctx.fillStyle = txtImageOptions.backgroundColor
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = txtImageOptions.textColor
  ctx.font = font
  lines.forEach((line, index) => {
    ctx.fillText(line, padding, padding + (index + 1) * lineHeight)
  })

  const targetFormat = request.targetFormat as ConcreteImageTarget
  if (!['png', 'jpg', 'webp'].includes(targetFormat)) {
    throw new Error(`Unsupported text image target: ${targetFormat}`)
  }

  const { blob, mimeType } = await encodeCanvasToImage(canvas, targetFormat)
  return [
    {
      buffer: await blobToArrayBuffer(blob),
      filename: replaceExtension(request.filename, targetFormat),
      mimeType,
      targetFormat,
      warnings: warnings.length > 0 ? warnings : undefined
    }
  ]
}

export const convertTxtToHtml = async (request: ConversionRequest): Promise<ConversionResult[]> => {
  const [{ TxtParser }, { HtmlParser }] = await Promise.all([
    import('@hamster-note/txt-parser'),
    import('@hamster-note/html-parser') as Promise<HtmlParserModule>
  ])
  const intermediate: IntermediateDocument = await TxtParser.encode(request.buffer)
  const result = await HtmlParser.decode(
    intermediate,
    request.options?.decode as HtmlParserDecodeResultOptions
  )
  const html =
    result instanceof Blob ? bufferToText(await blobToArrayBuffer(result)) : String(result)
  const blob = textToBlob(sanitizeTxtHtmlOutput(html), 'text/html')
  const mimeType = 'text/html;charset=utf-8'
  return [
    {
      buffer: await blobToArrayBuffer(blob),
      filename: replaceExtension(request.filename, 'html'),
      mimeType,
      targetFormat: 'html'
    }
  ]
}

export const convertHtmlToTxt = async (request: ConversionRequest): Promise<ConversionResult[]> => {
  const { HtmlParser } = await import('@hamster-note/html-parser')
  const htmlDocument = await HtmlParser.encode(
    request.buffer,
    request.options?.encode as HtmlParserEncodeOptions
  )
  const pages = await htmlDocument.getPages()
  const pageTexts: string[] = []

  for (const page of pages) {
    pageTexts.push(page.getPureText())
  }

  const mimeType = 'text/plain'
  return [
    {
      buffer: await blobToArrayBuffer(
        textToBlob(formatPageTextsAsReadableText(pageTexts), mimeType)
      ),
      filename: replaceExtension(request.filename, 'txt'),
      mimeType,
      targetFormat: 'txt'
    }
  ]
}

const encodeMarkdownIntermediate = async (buffer: ArrayBuffer): Promise<IntermediateDocument> => {
  const { MarkdownParser } = (await import('@hamster-note/markdown-parser')) as MarkdownParserModule
  return MarkdownParser.encode(buffer)
}

const renderHtmlStringToCanvas = async (
  html: string,
  width: number
): Promise<HTMLCanvasElement> => {
  const { default: html2canvas } = (await import('html2canvas')) as Html2CanvasModule
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.top = '-10000px'
  container.style.left = '-10000px'
  container.style.width = `${width}px`
  container.style.padding = '24px'
  container.style.boxSizing = 'border-box'
  container.style.backgroundColor = '#ffffff'
  container.style.color = '#000000'
  container.style.fontFamily = 'sans-serif'
  container.style.fontSize = '14px'
  container.style.lineHeight = '1.6'
  container.innerHTML = html
  document.body.appendChild(container)

  try {
    return await html2canvas(container, {
      backgroundColor: '#ffffff',
      width,
      windowWidth: width,
      scale: 1,
      useCORS: true,
      logging: false
    })
  } finally {
    container.remove()
  }
}

const MARKDOWN_RENDER_WIDTH_PX = 800

export const convertMarkdownToHtml = async (
  request: ConversionRequest
): Promise<ConversionResult[]> => {
  const intermediate = await encodeMarkdownIntermediate(request.buffer)
  return intermediateToHtmlResult(request, intermediate)
}

export const convertMarkdownToTxt = async (
  request: ConversionRequest
): Promise<ConversionResult[]> => {
  const txtMode = request.options?.markdown?.txtMode ?? 'plain'

  if (txtMode === 'raw') {
    const text = bufferToText(request.buffer)
    const mimeType = 'text/plain;charset=utf-8'
    return [
      {
        buffer: await blobToArrayBuffer(textToBlob(text, mimeType)),
        filename: replaceExtension(request.filename, 'txt'),
        mimeType,
        targetFormat: 'txt'
      }
    ]
  }

  const intermediate = await encodeMarkdownIntermediate(request.buffer)
  return intermediateToTxtResult(request, intermediate)
}

const renderMarkdownToImage = async (request: ConversionRequest): Promise<HTMLCanvasElement> => {
  const intermediate = await encodeMarkdownIntermediate(request.buffer)
  const { HtmlParser } = (await import('@hamster-note/html-parser')) as HtmlParserModule
  const html = await HtmlParser.decodeToHtml(
    intermediate,
    request.options?.decode as HtmlParserDecodeOptions
  )
  return renderHtmlStringToCanvas(html, MARKDOWN_RENDER_WIDTH_PX)
}

export const convertMarkdownToImage = async (
  request: ConversionRequest
): Promise<ConversionResult[]> => {
  const targetFormat = request.targetFormat
  if (!['png', 'jpg', 'webp'].includes(targetFormat)) {
    throw new Error(`Unsupported markdown image target: ${targetFormat}`)
  }
  const concreteTarget = targetFormat as ConcreteImageTarget
  const canvas = await renderMarkdownToImage(request)
  const { blob, extension, mimeType } = await encodeCanvasToImage(canvas, concreteTarget)
  return [
    {
      buffer: await blobToArrayBuffer(blob),
      filename: replaceExtension(request.filename, extension.replace(/^\./, '')),
      mimeType,
      targetFormat
    }
  ]
}

export const convertMarkdownToPdf = async (
  request: ConversionRequest
): Promise<ConversionResult[]> => {
  const canvas = await renderMarkdownToImage(request)
  const { blob: pngBlob } = await encodeCanvasToImage(canvas, 'png')
  const objectUrl = URL.createObjectURL(pngBlob)

  try {
    const { jsPDF } = (await import('jspdf')) as JsPdfModule
    const pageSetup = request.options?.pdfPageSetup ?? DEFAULT_PDF_PAGE_SETUP
    const canvasPtW = canvas.width * 0.75
    const canvasPtH = canvas.height * 0.75

    let pageW: number
    let pageH: number

    if (pageSetup.paperSize === 'auto') {
      pageW = canvasPtW
      pageH = canvasPtH
    } else {
      const baseBox = PAPER_SIZE_MAP[pageSetup.paperSize] ?? PAPER_SIZE_MAP.A4
      if (pageSetup.orientation === 'landscape') {
        pageW = baseBox.height
        pageH = baseBox.width
      } else if (pageSetup.orientation === 'portrait') {
        pageW = baseBox.width
        pageH = baseBox.height
      } else {
        // orientation === 'auto' → 根据 canvas 宽高比选择
        pageW = canvasPtW > canvasPtH ? baseBox.height : baseBox.width
        pageH = canvasPtW > canvasPtH ? baseBox.width : baseBox.height
      }
    }

    const doc = new jsPDF({ unit: 'pt', format: [pageW, pageH] })
    // 将 canvas 缩放到页面宽度，保持宽高比
    const scale = pageW / canvasPtW
    const drawW = pageW
    const drawH = canvasPtH * scale
    doc.addImage(objectUrl, 0, 0, drawW, drawH)
    const pdfBlob = doc.output('blob')
    return [
      {
        buffer: await blobToArrayBuffer(pdfBlob),
        filename: replaceExtension(request.filename, 'pdf'),
        mimeType: 'application/pdf',
        targetFormat: 'pdf'
      }
    ]
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export const convertHtmlToMd = async (request: ConversionRequest): Promise<ConversionResult[]> => {
  const [{ HtmlParser }, { MarkdownParser }] = await Promise.all([
    import('@hamster-note/html-parser') as Promise<HtmlParserModule>,
    import('@hamster-note/markdown-parser') as Promise<MarkdownParserModule>
  ])

  const htmlDocument = await HtmlParser.encode(
    request.buffer,
    request.options?.encode as HtmlParserEncodeOptions
  )
  const intermediate = htmlDocument.getIntermediateDocument()
  const markdownText = await MarkdownParser.decodeToMarkdown(intermediate)

  const mimeType = 'text/markdown;charset=utf-8'
  return [
    {
      buffer: await blobToArrayBuffer(textToBlob(markdownText, mimeType)),
      filename: replaceExtension(request.filename, 'md'),
      mimeType,
      targetFormat: 'md'
    }
  ]
}

export type RuntimeConversionAdapter = (request: ConversionRequest) => Promise<ConversionResult[]>
