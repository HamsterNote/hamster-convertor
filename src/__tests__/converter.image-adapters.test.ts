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
  convertImageToImage,
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
  const originalCreateElement = document.createElement.bind(document)

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

  describe('convertImageToImage', () => {
    const mockCanvas = {
      width: 320,
      height: 240,
      getContext: vi.fn(() => ({
        drawImage: vi.fn(),
        fillRect: vi.fn()
      })),
      toBlob: vi.fn()
    }

    beforeEach(() => {
      vi.clearAllMocks()
      document.createElement = vi.fn((tag: string) => {
        if (tag === 'canvas') {
          return mockCanvas as unknown as HTMLCanvasElement
        }
        return originalCreateElement(tag)
      })
    })

    afterEach(() => {
      document.createElement = originalCreateElement
    })

    const setupCanvasToBlobMock = (blob: Blob) => {
      mockCanvas.toBlob.mockImplementation((callback, _mimeType, _quality) => {
        callback(blob)
      })
    }

    it('converts PNG to WEBP', async () => {
      const webpBlob = new Blob(['webp'], { type: 'image/webp' })
      setupCanvasToBlobMock(webpBlob)

      const request: ConversionRequest = {
        file: new File(['png'], 'photo.png', { type: 'image/png' }),
        source: 'image',
        target: 'webp'
      }

      const [result] = await convertImageToImage(request)

      expect(result).toMatchObject({
        filename: 'photo.webp',
        mimeType: 'image/webp',
        targetFormat: 'webp'
      })
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:image-url')
    })

    it('converts JPG to PNG', async () => {
      const pngBlob = new Blob(['png'], { type: 'image/png' })
      setupCanvasToBlobMock(pngBlob)

      const request: ConversionRequest = {
        file: new File(['jpg'], 'photo.jpg', { type: 'image/jpeg' }),
        source: 'image',
        target: 'png'
      }

      const [result] = await convertImageToImage(request)

      expect(result).toMatchObject({
        filename: 'photo.png',
        mimeType: 'image/png',
        targetFormat: 'png'
      })
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:image-url')
    })

    it('converts WEBP to JPG', async () => {
      const jpgBlob = new Blob(['jpg'], { type: 'image/jpeg' })
      setupCanvasToBlobMock(jpgBlob)

      const request: ConversionRequest = {
        file: new File(['webp'], 'photo.webp', { type: 'image/webp' }),
        source: 'image',
        target: 'jpg'
      }

      const [result] = await convertImageToImage(request)

      expect(result).toMatchObject({
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        targetFormat: 'jpg'
      })
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:image-url')
    })

    it('rejects GIF input with clear error', async () => {
      const request: ConversionRequest = {
        file: new File(['gif'], 'animation.gif', { type: 'image/gif' }),
        source: 'image',
        target: 'png'
      }

      await expect(convertImageToImage(request)).rejects.toThrow(
        'Unsupported image format for conversion: svg/gif'
      )
      // URL is never created for unsupported formats, so no revocation needed
    })

    it('rejects SVG input with clear error', async () => {
      const request: ConversionRequest = {
        file: new File(['svg'], 'vector.svg', { type: 'image/svg+xml' }),
        source: 'image',
        target: 'png'
      }

      await expect(convertImageToImage(request)).rejects.toThrow(
        'Unsupported image format for conversion: svg/gif'
      )
      // URL is never created for unsupported formats, so no revocation needed
    })
  })
})
