import type { IntermediateDocument } from '@hamster-note/types'
import type { ConversionRequest, ConversionResult } from '../converter'

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
  getDocument: (options: { data: Uint8Array }) => PdfLoadingTask
}

type PdfParserModule = typeof import('@hamster-note/pdf-parser')

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

const extractTextWithHamster = async (arrayBuffer: ArrayBuffer): Promise<string> => {
  const { PdfParser }: PdfParserModule = await import('@hamster-note/pdf-parser')
  const intermediateDocument = await PdfParser.encode(arrayBuffer)
  return intermediateDocument ? extractIntermediateText(intermediateDocument) : ''
}

const loadPdfDocument = async (arrayBuffer: ArrayBuffer): Promise<PdfDocument> => {
  const pdfjs = (await import('pdfjs-dist')) as unknown as PdfJsModule
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

const renderPageToBlob = async (page: PdfPage): Promise<Blob> => {
  const viewport = page.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)

  const canvasContext = canvas.getContext('2d')
  if (!canvasContext) {
    throw new Error('Canvas 2D context is unavailable')
  }

  await page.render({ canvasContext, viewport }).promise

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) {
        resolve(blob)
        return
      }
      reject(new Error('Failed to render PDF page as PNG'))
    }, 'image/png')
  })
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
  file
}: ConversionRequest): Promise<ConversionResult[]> => {
  const arrayBuffer = await readFileAsArrayBuffer(file)
  const pdfDocument = await loadPdfDocument(arrayBuffer)
  const baseName = stripExtension(file.name)

  return Promise.all(
    Array.from({ length: pdfDocument.numPages }, async (_, index) => {
      const pageNumber = index + 1
      const page = await pdfDocument.getPage(pageNumber)
      const blob = await renderPageToBlob(page)
      return {
        blob,
        filename: `${baseName}-page-${String(pageNumber).padStart(3, '0')}.png`,
        mimeType: 'image/png',
        targetFormat: 'image'
      }
    })
  )
}
