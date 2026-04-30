import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const addImage = vi.fn()
const outputBlob = new Blob(['pdf'], { type: 'application/pdf' })
const output = vi.fn(() => outputBlob)
const jsPdfConstructor = vi.fn(() => ({ addImage, output }))
const encode = vi.fn()

vi.mock('jspdf', () => ({
  jsPDF: jsPdfConstructor
}))

vi.mock('@hamster-note/image-parser', () => ({
  ImageParser: {
    encode
  }
}))

import {
  convertImageToPdf,
  convertImageToTxt,
  EmptyOcrError
} from '../lib/converter/image-adapters'
import type { ConversionRequest } from '../lib/converter'

type MockImageInstance = {
  addEventListener: (eventName: 'error' | 'load', listener: () => void) => void
  naturalHeight: number
  naturalWidth: number
  src: string
}

const createImageRequest = (fileName = 'image.png'): ConversionRequest => ({
  file: new File(['image'], fileName, { type: 'image/png' }),
  source: 'image',
  target: 'pdf'
})

const readBlobText = async (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('FileReader returned an unsupported result'))
    })
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('Failed to read blob'))
    })
    reader.readAsText(blob)
  })

describe('image conversion adapters', () => {
  const originalCreateObjectUrl = URL.createObjectURL
  const originalRevokeObjectUrl = URL.revokeObjectURL
  const OriginalImage = globalThis.Image

  beforeEach(() => {
    vi.clearAllMocks()
    URL.createObjectURL = vi.fn(() => 'blob:image-url')
    URL.revokeObjectURL = vi.fn()
    globalThis.Image = vi.fn(() => {
      const listeners = new Map<'error' | 'load', () => void>()
      const image: MockImageInstance = {
        addEventListener: (eventName, listener) => {
          listeners.set(eventName, listener)
        },
        naturalHeight: 240,
        naturalWidth: 320,
        set src(_value: string) {
          listeners.get('load')?.()
        },
        get src() {
          return 'blob:image-url'
        }
      }
      return image as HTMLImageElement
    }) as unknown as typeof Image
  })

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectUrl
    URL.revokeObjectURL = originalRevokeObjectUrl
    globalThis.Image = OriginalImage
  })

  it('converts an image to a single same-aspect PDF', async () => {
    const [result] = await convertImageToPdf(createImageRequest())

    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(File))
    expect(jsPdfConstructor).toHaveBeenCalledWith({ unit: 'px', format: [320, 240] })
    expect(addImage).toHaveBeenCalledWith('blob:image-url', 0, 0, 320, 240)
    expect(output).toHaveBeenCalledWith('blob')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:image-url')
    expect(result).toMatchObject({
      blob: outputBlob,
      filename: 'image.pdf',
      mimeType: 'application/pdf',
      targetFormat: 'pdf'
    })
  })

  it('converts OCR text to a UTF-8 text file', async () => {
    encode.mockResolvedValue({ outline: undefined, text: '  hello OCR  ' })

    const [result] = await convertImageToTxt({ ...createImageRequest(), target: 'txt' })

    expect(encode).toHaveBeenCalledWith(expect.any(ArrayBuffer))
    expect(result).toMatchObject({
      filename: 'image-ocr.txt',
      mimeType: 'text/plain;charset=utf-8',
      targetFormat: 'txt'
    })
    await expect(readBlobText(result?.blob ?? new Blob())).resolves.toBe('hello OCR')
  })

  it('fails with a typed empty OCR error when OCR has no text', async () => {
    encode.mockResolvedValue({ outline: undefined, text: '   ' })

    await expect(
      convertImageToTxt({ ...createImageRequest(), target: 'txt' })
    ).rejects.toMatchObject({
      code: 'EMPTY_OCR',
      name: 'EmptyOcrError'
    })
    await expect(
      convertImageToTxt({ ...createImageRequest(), target: 'txt' })
    ).rejects.toBeInstanceOf(EmptyOcrError)
  })
})
