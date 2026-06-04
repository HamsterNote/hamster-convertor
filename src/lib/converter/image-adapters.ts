import type { IntermediateDocument } from '@hamster-note/types'

import {
  applyHtmlLayout,
  type ConversionRequest,
  type ConversionResult,
  type HtmlDecodeOptions
} from '../converter'
import type { ConcreteImageTarget } from './image-encoding'
import { encodeCanvasToImage } from './image-encoding'

type JsPdfModule = typeof import('jspdf')

type ImageParserModule = typeof import('@hamster-note/image-parser')

type HtmlParserModule = typeof import('@hamster-note/html-parser')

type ImageDimensions = {
  height: number
  width: number
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

const appendBeforeExtension = (filename: string, suffix: string, extension: string): string => {
  const withoutExtension = filename.replace(/\.[^/.]+$/, '')
  return `${withoutExtension || filename}${suffix}.${extension}`
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

const loadImageDimensions = async (url: string): Promise<ImageDimensions> =>
  new Promise((resolve, reject) => {
    const image = new Image()

    image.addEventListener('load', () => {
      resolve({ height: image.naturalHeight, width: image.naturalWidth })
    })
    image.addEventListener('error', () => {
      reject(new Error('Failed to load image dimensions'))
    })
    image.src = url
  })

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image()

    image.addEventListener('load', () => {
      resolve(image)
    })
    image.addEventListener('error', () => {
      reject(new Error('Failed to load image'))
    })
    image.src = url
  })

const extractOcrText = (intermediateDocument: IntermediateDocument | undefined): string => {
  const text = intermediateDocument?.text
  return typeof text === 'string' ? text.trim() : ''
}

export const convertImageToPdf = async ({
  file
}: ConversionRequest): Promise<ConversionResult[]> => {
  const objectUrl = URL.createObjectURL(file)
  let dimensions: ImageDimensions

  try {
    dimensions = await loadImageDimensions(objectUrl)

    const { jsPDF } = (await import('jspdf')) as JsPdfModule
    const doc = new jsPDF({ unit: 'px', format: [dimensions.width, dimensions.height] })
    doc.addImage(objectUrl, 0, 0, dimensions.width, dimensions.height)

    const blob = doc.output('blob')

    return [
      {
        blob,
        filename: replaceExtension(file.name, 'pdf'),
        mimeType: 'application/pdf',
        targetFormat: 'pdf'
      }
    ]
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export const convertImageToTxt = async ({
  file
}: ConversionRequest): Promise<ConversionResult[]> => {
  const [{ ImageParser }, arrayBuffer] = await Promise.all([
    import('@hamster-note/image-parser') as Promise<ImageParserModule>,
    readFileAsArrayBuffer(file)
  ])

  let intermediateDocument: IntermediateDocument
  try {
    intermediateDocument = await ImageParser.encode(arrayBuffer)
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
      blob: new Blob([text], { type: mimeType }),
      filename: appendBeforeExtension(file.name, '-ocr', 'txt'),
      mimeType,
      targetFormat: 'txt'
    }
  ]
}

export const convertImageToHtml = async ({
  file,
  options
}: ConversionRequest): Promise<ConversionResult[]> => {
  const [{ ImageParser }, { HtmlParser }, arrayBuffer] = await Promise.all([
    import('@hamster-note/image-parser') as Promise<ImageParserModule>,
    import('@hamster-note/html-parser') as Promise<HtmlParserModule>,
    readFileAsArrayBuffer(file)
  ])

  const intermediate = await ImageParser.encode(arrayBuffer)
  const decodeOptions: HtmlDecodeOptions | undefined = options?.decode
  const html = await HtmlParser.decodeToHtml(intermediate, decodeOptions)
  const laidOutHtml = applyHtmlLayout(html, options?.layout)
  const mimeType = 'text/html;charset=utf-8'

  return [
    {
      blob: new Blob([laidOutHtml], { type: mimeType }),
      filename: replaceExtension(file.name, 'html'),
      mimeType,
      targetFormat: 'html'
    }
  ]
}

const isUnsupportedImageFormat = (filename: string): boolean => {
  const lower = filename.toLowerCase()
  return lower.endsWith('.svg') || lower.endsWith('.gif')
}

export const convertImageToImage = async ({
  file,
  target
}: ConversionRequest): Promise<ConversionResult[]> => {
  if (isUnsupportedImageFormat(file.name)) {
    throw new Error('Unsupported image format for conversion: svg/gif')
  }

  const objectUrl = URL.createObjectURL(file)

  try {
    const image = await loadImage(objectUrl)
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to get 2d context')
    }

    ctx.drawImage(image, 0, 0)

    const targetFormat = target as ConcreteImageTarget
    if (!['png', 'jpg', 'webp'].includes(targetFormat)) {
      throw new Error(`Unsupported image conversion target: ${targetFormat}`)
    }
    const { blob, mimeType } = await encodeCanvasToImage(canvas, targetFormat)
    const extension = targetFormat

    return [
      {
        blob,
        filename: replaceExtension(file.name, extension),
        mimeType,
        targetFormat: targetFormat
      }
    ]
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
