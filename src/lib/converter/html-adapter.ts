import type { ConversionRequest, ConversionResult } from '../converter'

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

export const convertHtmlToTxt = async (request: ConversionRequest): Promise<ConversionResult[]> => {
  const { file } = request

  const buffer = await readFileAsArrayBuffer(file)

  const { HtmlParser } = await import('@hamster-note/html-parser')
  const htmlDocument = await HtmlParser.encode(buffer)

  const pages = await htmlDocument.getPages()

  const pageTexts: string[] = []
  for (const page of pages) {
    const text = page.getPureText()
    pageTexts.push(text)
  }

  const text = pageTexts.join('\n').trim()

  const mimeType = 'text/plain'
  return [
    {
      blob: new Blob([text], { type: mimeType }),
      filename: replaceExtension(file.name, 'txt'),
      mimeType,
      targetFormat: 'txt'
    }
  ]
}
