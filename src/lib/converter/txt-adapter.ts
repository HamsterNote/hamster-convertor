import type { IntermediateDocument } from '@hamster-note/types'

import type { ConversionRequest, ConversionResult } from '../converter'

const CANVAS_WIDTH = 800
const PADDING = 20
const LINE_HEIGHT = 24
const FONT = '16px sans-serif'

const extractTextFromIntermediate = (intermediate: IntermediateDocument): string => {
  if (intermediate.text && typeof intermediate.text === 'string') {
    return intermediate.text
  }
  return ''
}

const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
  const paragraphs = text.split('\n')
  const wrappedLines: string[] = []

  for (const paragraph of paragraphs) {
    if (paragraph === '') {
      wrappedLines.push('')
      continue
    }

    const words = paragraph.split(' ')
    let currentLine = ''

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word
      const metrics = ctx.measureText(testLine)

      if (metrics.width > maxWidth && currentLine) {
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

const getBaseName = (filename: string): string => {
  return filename.replace(/\.[^/.]+$/, '')
}

const replaceExtension = (filename: string, extension: string): string => {
  const withoutExtension = filename.replace(/\.[^/.]+$/, '')
  return `${withoutExtension || filename}.${extension}`
}

export const convertTxtToImage = async (
  request: ConversionRequest
): Promise<ConversionResult[]> => {
  const { file } = request
  let text: string
  const warnings: string[] = []

  try {
    const { TxtParser } = await import('@hamster-note/txt-parser')
    const buffer = await file.arrayBuffer()
    const intermediate: IntermediateDocument = await TxtParser.encode(buffer)
    text = extractTextFromIntermediate(intermediate)
  } catch {
    text = await file.text()
    warnings.push('Used fallback text reader')
  }

  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH

  const measureCtx = document.createElement('canvas').getContext('2d')
  if (!measureCtx) {
    throw new Error('Canvas 2D context not available')
  }
  measureCtx.font = FONT

  const availableWidth = CANVAS_WIDTH - PADDING * 2
  const lines = wrapText(measureCtx, text, availableWidth)
  const textHeight = lines.length * LINE_HEIGHT
  const canvasHeight = Math.max(textHeight + PADDING * 2, 100)
  canvas.height = canvasHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D context not available')
  }

  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = 'black'
  ctx.font = FONT

  lines.forEach((line, i) => {
    ctx.fillText(line, PADDING, PADDING + (i + 1) * LINE_HEIGHT)
  })

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('Canvas toBlob failed'))
      }
    }, 'image/png')
  })

  const baseName = getBaseName(file.name)
  return [
    {
      blob,
      filename: `${baseName}.png`,
      mimeType: 'image/png',
      targetFormat: 'png',
      warnings: warnings.length > 0 ? warnings : undefined
    }
  ]
}

export const convertTxtToHtml = async (request: ConversionRequest): Promise<ConversionResult[]> => {
  const { file } = request

  const buffer = await file.arrayBuffer()

  const { TxtParser } = await import('@hamster-note/txt-parser')
  const intermediate: IntermediateDocument = await TxtParser.encode(buffer)

  const { HtmlParser } = await import('@hamster-note/html-parser')
  const result = await HtmlParser.decode(intermediate)

  let blob: Blob
  if (result instanceof File) {
    blob = result
  } else {
    blob = new Blob([result], { type: 'text/html' })
  }

  const mimeType = 'text/html;charset=utf-8'
  return [
    {
      blob,
      filename: replaceExtension(file.name, 'html'),
      mimeType,
      targetFormat: 'html'
    }
  ]
}
