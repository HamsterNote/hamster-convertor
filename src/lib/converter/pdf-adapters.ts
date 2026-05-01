import type { IntermediateDocument } from '@hamster-note/types'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import type { ConversionRequest, ConversionResult } from '../converter'
import { encodeCanvasToImage } from './image-encoding'

type TextItem = {
  str: string
}

type TextContent = {
  items: TextItem[]
}

type TextContentOptions = {
  includeMarkedContent: boolean
}

type PdfPage = {
  getTextContent: (options: TextContentOptions) => Promise<TextContent>
  getViewport: (options: { scale: number }) => { width: number; height: number }
  render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
    promise: Promise<void>
  }
}

type PdfDocument = {
  numPages: number
  getPage: (pageNumber: number) => Promise<PdfPage>
}

type PdfLoadingTask = {
  promise: Promise<PdfDocument>
}

type PdfJsModule = {
  GlobalWorkerOptions?: {
    workerSrc?: string
  }
  getDocument: (options: { data: Uint8Array }) => PdfLoadingTask
}

type PdfParserModule = typeof import('@hamster-note/pdf-parser')

type ImageParserModule = typeof import('@hamster-note/image-parser')

type JsPdfModule = typeof import('jspdf')

type JsPdfDocument = InstanceType<JsPdfModule['jsPDF']>

type TextNode = {
  text?: unknown
  children?: TextNode[]
}

export class OcrRequiredError extends Error {
  readonly code = 'OCR_REQUIRED'

  constructor(filename: string) {
    super(`OCR is required to extract text from ${filename}`)
    this.name = 'OcrRequiredError'
  }
}

export class EmptyOcrError extends Error {
  readonly code = 'EMPTY_OCR'

  constructor() {
    super('OCR returned no text')
    this.name = 'EmptyOcrError'
  }
}

const replaceExtension = (filename: string, extension: string): string => {
  const withoutExtension = filename.replace(/\.[^/.]+$/, '')
  return `${withoutExtension || filename}.${extension}`
}

const stripExtension = (filename: string): string => filename.replace(/\.[^/.]+$/, '') || filename

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

const arrayBufferToBytes = (arrayBuffer: ArrayBuffer): Uint8Array => new Uint8Array(arrayBuffer)

const collectText = (value: unknown): string[] => {
  if (!value || typeof value !== 'object') {
    return []
  }

  const node = value as TextNode
  const ownText = typeof node.text === 'string' ? [node.text] : []
  const childText = Array.isArray(node.children) ? node.children.flatMap(collectText) : []
  return [...ownText, ...childText]
}

const extractIntermediateText = (intermediateDocument: IntermediateDocument): string =>
  collectText(intermediateDocument).join('\n').trim()

const extractOcrText = (intermediateDocument: IntermediateDocument | undefined): string => {
  const text = intermediateDocument?.text
  return typeof text === 'string' ? text.trim() : ''
}

const extractTextWithHamster = async (arrayBuffer: ArrayBuffer): Promise<string> => {
  const { PdfParser }: PdfParserModule = await import('@hamster-note/pdf-parser')
  const intermediateDocument = await PdfParser.encode(arrayBuffer)
  return intermediateDocument ? extractIntermediateText(intermediateDocument) : ''
}

const configurePdfJsWorker = (pdfjs: PdfJsModule): void => {
  if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  }
}

const loadPdfDocument = async (arrayBuffer: ArrayBuffer): Promise<PdfDocument> => {
  const pdfjs = (await import('pdfjs-dist')) as unknown as PdfJsModule
  configurePdfJsWorker(pdfjs)
  const loadingTask = pdfjs.getDocument({ data: arrayBufferToBytes(arrayBuffer) })
  return loadingTask.promise
}

const extractTextWithPdfJs = async (arrayBuffer: ArrayBuffer): Promise<string> => {
  const pdfDocument = await loadPdfDocument(arrayBuffer)
  const pages = await Promise.all(
    Array.from({ length: pdfDocument.numPages }, async (_, index) => {
      const page = await pdfDocument.getPage(index + 1)
      const textContent = await page.getTextContent({ includeMarkedContent: false })
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

const convertRenderedPageToOcrText = async (
  blob: Blob,
  ImageParser: ImageParserModule['ImageParser']
): Promise<string> => {
  try {
    const arrayBuffer = await blob.arrayBuffer()
    const intermediateDocument = await ImageParser.encode(arrayBuffer)
    return extractOcrText(intermediateDocument)
  } catch {
    return ''
  }
}

export const convertPdfToTxt = async ({ file }: ConversionRequest): Promise<ConversionResult[]> => {
  const arrayBuffer = await readFileAsArrayBuffer(file)
  let text = ''

  try {
    text = await extractTextWithHamster(arrayBuffer)
  } catch {
    text = ''
  }

  if (!text) {
    text = await extractTextWithPdfJs(arrayBuffer)
  }

  if (!text) {
    throw new OcrRequiredError(file.name)
  }

  const mimeType = 'text/plain;charset=utf-8'
  return [
    {
      blob: new Blob([text], { type: mimeType }),
      filename: replaceExtension(file.name, 'txt'),
      mimeType,
      targetFormat: 'txt'
    }
  ]
}

export const convertPdfToImage = async ({
  file,
  target,
  options
}: ConversionRequest): Promise<ConversionResult[]> => {
  const arrayBuffer = await readFileAsArrayBuffer(file)
  const pdfDocument = await loadPdfDocument(arrayBuffer)
  const baseName = stripExtension(file.name)

  let pageNumbers = Array.from({ length: pdfDocument.numPages }, (_, i) => i + 1)

  const selected = options?.pdf?.selectedImagePages
  if (selected !== undefined) {
    pageNumbers = selected.filter(
      (p): p is number => Number.isInteger(p) && p >= 1 && p <= pdfDocument.numPages
    )
    pageNumbers = [...new Set(pageNumbers)].sort((a, b) => a - b)
    if (pageNumbers.length === 0) {
      throw new Error('No pages selected')
    }
  }

  const effectiveTarget = target ?? 'png'

  if (!['png', 'jpg', 'webp'].includes(effectiveTarget)) {
    throw new Error(`Unsupported PDF image target: ${effectiveTarget}`)
  }

  return Promise.all(
    pageNumbers.map(async pageNumber => {
      const page = await pdfDocument.getPage(pageNumber)
      const canvas = await renderPageToCanvas(page)
      const { blob, extension, mimeType } = await encodeCanvasToImage(
        canvas,
        effectiveTarget as import('./image-encoding').ConcreteImageTarget
      )
      return {
        blob,
        filename: `${baseName}-page-${String(pageNumber).padStart(3, '0')}${extension}`,
        mimeType,
        targetFormat: effectiveTarget
      }
    })
  )
}

const copyPdfWithoutOcr = (file: File, arrayBuffer: ArrayBuffer): ConversionResult[] => {
  const mimeType = 'application/pdf'
  return [
    {
      blob: new Blob([arrayBuffer], { type: mimeType }),
      filename: file.name,
      mimeType,
      targetFormat: 'pdf'
    }
  ]
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

const createOcrPdf = async (file: File, arrayBuffer: ArrayBuffer): Promise<ConversionResult[]> => {
  const [{ ImageParser }, { jsPDF }, pdfDocument] = await Promise.all([
    import('@hamster-note/image-parser') as Promise<ImageParserModule>,
    import('jspdf') as Promise<JsPdfModule>,
    loadPdfDocument(arrayBuffer.slice(0))
  ])

  const firstPage = await pdfDocument.getPage(1)
  const firstViewport = firstPage.getViewport({ scale: 2 })
  const doc = new jsPDF({ unit: 'px', format: [firstViewport.width, firstViewport.height] })

  let hasText = false

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const page = pageNumber === 1 ? firstPage : await pdfDocument.getPage(pageNumber)
    const pageHadText = await processOcrPage(page, doc, ImageParser, arrayBuffer, pageNumber)
    if (pageHadText) {
      hasText = true
    }
  }

  if (!hasText) {
    throw new EmptyOcrError()
  }

  const mimeType = 'application/pdf'
  return [
    {
      blob: doc.output('blob'),
      filename: replaceExtension(file.name, 'pdf'),
      mimeType,
      targetFormat: 'pdf'
    }
  ]
}

export const convertPdfToPdf = async ({
  file,
  options
}: ConversionRequest): Promise<ConversionResult[]> => {
  const arrayBuffer = await readFileAsArrayBuffer(file)

  if (!options?.pdf?.ocr) {
    return copyPdfWithoutOcr(file, arrayBuffer)
  }

  return createOcrPdf(file, arrayBuffer)
}
