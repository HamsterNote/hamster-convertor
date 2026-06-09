import type { IntermediateDocument } from '@hamster-note/types'
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
  getSelectedPdfPageNumbers,
  isUnsupportedImageFormat,
  replaceExtension,
  stripExtension,
  textToBlob,
  UnsupportedImageFormatError
} from './utils'

type PdfParserModule = typeof import('@hamster-note/pdf-parser')
type ImageParserModule = typeof import('@hamster-note/image-parser')
type HtmlParserModule = typeof import('@hamster-note/html-parser')
type PdfParserApi = {
  encode: (arrayBuffer: ArrayBuffer) => Promise<IntermediateDocument | undefined>
}
type HtmlParserDecodeOptions = Parameters<HtmlParserModule['HtmlParser']['decodeToHtml']>[1]
type HtmlParserDecodeResultOptions = Parameters<HtmlParserModule['HtmlParser']['decode']>[1]
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
type PdfPageBox = { height: number; width: number }

const A4_PORTRAIT_PT: PdfPageBox = { width: 595.28, height: 841.89 }
const A4_LANDSCAPE_PT: PdfPageBox = { width: 841.89, height: 595.28 }
const DEFAULT_IMAGE_TO_PDF_OPTIONS: ImageToPdfOptions = {
  marginPt: 0,
  fit: 'cover',
  pageMode: 'auto',
  rotationDeg: 0,
  scalePercent: 100
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

const getRotatedImageDimensions = (
  dimensions: ImageDimensions,
  rotationDeg: ImageToPdfOptions['rotationDeg']
): ImageDimensions =>
  rotationDeg === 90 || rotationDeg === 270
    ? { width: dimensions.height, height: dimensions.width }
    : dimensions

const getImageToPdfPageBox = (
  dimensions: ImageDimensions,
  pageMode: ImageToPdfOptions['pageMode']
): PdfPageBox => {
  if (pageMode === 'single') {
    return A4_PORTRAIT_PT
  }

  return dimensions.width > dimensions.height ? A4_LANDSCAPE_PT : A4_PORTRAIT_PT
}

const getImageToPdfDrawBox = (
  dimensions: ImageDimensions,
  pageBox: PdfPageBox,
  options: ImageToPdfOptions
): { drawHeight: number; drawWidth: number; x: number; y: number } => {
  const marginPt = clampNumber(options.marginPt, 0, Math.min(pageBox.width, pageBox.height) / 2)
  const usableWidth = pageBox.width - marginPt * 2
  const usableHeight = pageBox.height - marginPt * 2
  const fitScale =
    options.fit === 'contain'
      ? Math.min(usableWidth / dimensions.width, usableHeight / dimensions.height)
      : Math.max(usableWidth / dimensions.width, usableHeight / dimensions.height)
  const coverClampedWidth = Math.min(dimensions.width * fitScale, usableWidth)
  const coverClampedHeight = Math.min(dimensions.height * fitScale, usableHeight)
  const scaleMultiplier = clampNumber(options.scalePercent, 10, 300) / 100
  const drawWidth = Math.min(coverClampedWidth * scaleMultiplier, usableWidth)
  const drawHeight = Math.min(coverClampedHeight * scaleMultiplier, usableHeight)

  if (options.fit === 'contain') {
    return {
      drawHeight,
      drawWidth,
      x: marginPt,
      y: marginPt
    }
  }

  return {
    drawHeight,
    drawWidth,
    x: marginPt + (usableWidth - drawWidth) / 2,
    y: marginPt + (usableHeight - drawHeight) / 2
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
      targetFormat: 'html',
      warnings: []
    }
  ]
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
    const effectiveDimensions = getRotatedImageDimensions(dimensions, imageToPdfOptions.rotationDeg)
    const pageBox = getImageToPdfPageBox(effectiveDimensions, imageToPdfOptions.pageMode)
    const { drawHeight, drawWidth, x, y } = getImageToPdfDrawBox(
      effectiveDimensions,
      pageBox,
      imageToPdfOptions
    )

    const doc = new jsPDF({
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

const extractTextFromIntermediate = (intermediate: IntermediateDocument): string => {
  const text = 'text' in intermediate ? intermediate.text : undefined
  if (typeof text === 'string') {
    return text
  }
  return ''
}

const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
  const wrappedLines: string[] = []

  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      wrappedLines.push('')
      continue
    }

    let currentLine = ''
    for (const word of paragraph.split(' ')) {
      const testLine = currentLine ? `${currentLine} ${word}` : word
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        wrappedLines.push(currentLine)
        currentLine = word
      } else {
        currentLine = testLine
      }
    }

    if (currentLine) {
      wrappedLines.push(currentLine)
    }
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
    text = extractTextFromIntermediate(await TxtParser.encode(request.buffer))
  } catch {
    text = bufferToText(request.buffer)
    warnings.push('Used fallback text reader')
  }

  const canvasWidth = 800
  const padding = 20
  const lineHeight = 24
  const font = '16px sans-serif'
  const measureCtx = document.createElement('canvas').getContext('2d')
  if (!measureCtx) {
    throw new Error('Canvas 2D context not available')
  }
  measureCtx.font = font

  const lines = wrapText(measureCtx, text, canvasWidth - padding * 2)
  const canvas = document.createElement('canvas')
  canvas.width = canvasWidth
  canvas.height = Math.max(lines.length * lineHeight + padding * 2, 100)

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D context not available')
  }

  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = 'black'
  ctx.font = font
  lines.forEach((line, index) => {
    ctx.fillText(line, padding, padding + (index + 1) * lineHeight)
  })

  const targetFormat = request.targetFormat as ConcreteImageTarget
  if (!['png', 'jpg', 'webp'].includes(targetFormat)) {
    throw new Error(`Unsupported text image target: ${targetFormat}`)
  }

  const { blob, mimeType } = await encodeCanvasToImage(
    canvas,
    targetFormat,
    request.options?.image?.quality
  )
  return [
    {
      buffer: await imageBlobToOutputBuffer(blob, request, targetFormat),
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
  const blob = result instanceof File ? result : new Blob([result], { type: 'text/html' })
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
  const htmlDocument = await HtmlParser.encode(request.buffer)
  const pages = await htmlDocument.getPages()
  const pageTexts: string[] = []

  for (const page of pages) {
    pageTexts.push(page.getPureText())
  }

  const mimeType = 'text/plain'
  return [
    {
      buffer: await blobToArrayBuffer(textToBlob(pageTexts.join('\n').trim(), mimeType)),
      filename: replaceExtension(request.filename, 'txt'),
      mimeType,
      targetFormat: 'txt'
    }
  ]
}

export type RuntimeConversionAdapter = (request: ConversionRequest) => Promise<ConversionResult[]>
