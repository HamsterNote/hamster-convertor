import { afterEach, describe, expect, it, vi } from 'vitest'
import { convertRuntime } from '../conversion'

const parserMocks = vi.hoisted(() => ({
  pdfEncode: vi.fn(),
  htmlDecodeToHtml: vi.fn(),
  imageEncode: vi.fn()
}))

vi.mock('@hamster-note/pdf-parser', () => ({
  PdfParser: {
    encode: parserMocks.pdfEncode
  }
}))

vi.mock('@hamster-note/html-parser', () => ({
  HtmlParser: {
    decodeToHtml: parserMocks.htmlDecodeToHtml
  }
}))

vi.mock('@hamster-note/image-parser', () => ({
  ImageParser: {
    encode: parserMocks.imageEncode
  }
}))

type ImageListener = () => void

class MockImage {
  naturalHeight = 16
  naturalWidth = 32
  private readonly listeners = new Map<string, ImageListener>()

  addEventListener(type: string, listener: ImageListener) {
    this.listeners.set(type, listener)
  }

  set src(_value: string) {
    queueMicrotask(() => this.listeners.get('load')?.())
  }
}

const textFromBuffer = (buffer: ArrayBuffer): string => new TextDecoder().decode(buffer)

const createBuffer = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer

const installCanvasAndImageMocks = () => {
  const originalImage = globalThis.Image
  const originalCreateElement = document.createElement.bind(document)
  const originalCreateObjectUrl = URL.createObjectURL
  const originalRevokeObjectUrl = URL.revokeObjectURL
  URL.createObjectURL = vi.fn(() => 'blob:mock-image')
  URL.revokeObjectURL = vi.fn(() => undefined)
  const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-image')
  const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(tagName => {
    if (tagName !== 'canvas') {
      return originalCreateElement(tagName)
    }

    return {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: vi.fn(),
        fillRect: vi.fn(),
        fillStyle: '',
        fillText: vi.fn(),
        font: '',
        measureText: (text: string) => ({ width: text.length * 8 })
      }),
      toBlob: (callback: BlobCallback, type?: string) => {
        callback(new Blob(['mock png'], { type: type ?? 'image/png' }))
      }
    } as unknown as HTMLCanvasElement
  })

  globalThis.Image = MockImage as unknown as typeof Image

  return () => {
    globalThis.Image = originalImage
    URL.createObjectURL = originalCreateObjectUrl
    URL.revokeObjectURL = originalRevokeObjectUrl
    createObjectUrlSpy.mockRestore()
    revokeObjectUrlSpy.mockRestore()
    createElementSpy.mockRestore()
  }
}

describe('Runtime conversion', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    parserMocks.pdfEncode.mockReset()
    parserMocks.htmlDecodeToHtml.mockReset()
    parserMocks.imageEncode.mockReset()
  })

  it('converts mocked PDF to HTML', async () => {
    parserMocks.pdfEncode.mockResolvedValue({ children: [{ text: 'PDF text' }] })
    parserMocks.htmlDecodeToHtml.mockResolvedValue('<html><body>PDF text</body></html>')

    const [result] = await convertRuntime({
      filename: 'sample.pdf',
      sourceFormat: 'pdf',
      targetFormat: 'html',
      buffer: createBuffer('%PDF')
    })

    expect(result?.filename).toBe('sample.html')
    expect(result?.mimeType).toBe('text/html;charset=utf-8')
    expect(result?.targetFormat).toBe('html')
    expect(textFromBuffer(result?.buffer ?? new ArrayBuffer(0))).toContain('PDF text')
  })

  it('converts image to PNG', async () => {
    const restoreDomMocks = installCanvasAndImageMocks()

    try {
      const [result] = await convertRuntime({
        filename: 'photo.jpg',
        sourceFormat: 'image',
        targetFormat: 'png',
        buffer: createBuffer('jpg-bytes'),
        mimeType: 'image/jpeg'
      })

      expect(result?.filename).toBe('photo.png')
      expect(result?.mimeType).toBe('image/png')
      expect(result?.targetFormat).toBe('png')
      expect(textFromBuffer(result?.buffer ?? new ArrayBuffer(0))).toBe('mock png')
    } finally {
      restoreDomMocks()
    }
  })

  it('rejects unsupported SVG conversion', async () => {
    await expect(
      convertRuntime({
        filename: 'vector.svg',
        sourceFormat: 'image',
        targetFormat: 'png',
        buffer: createBuffer('<svg />'),
        mimeType: 'image/svg+xml'
      })
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_IMAGE_FORMAT' })
  })

  it('rejects unsupported GIF conversion', async () => {
    await expect(
      convertRuntime({
        filename: 'animation.gif',
        sourceFormat: 'image',
        targetFormat: 'png',
        buffer: createBuffer('gif'),
        mimeType: 'image/gif'
      })
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_IMAGE_FORMAT' })
  })

  it('preserves OCR_REQUIRED error', async () => {
    const ocrError = new Error('OCR is required to extract text from scanned.pdf') as Error & {
      code: string
    }
    ocrError.code = 'OCR_REQUIRED'
    parserMocks.pdfEncode.mockRejectedValue(ocrError)

    await expect(
      convertRuntime({
        filename: 'scanned.pdf',
        sourceFormat: 'pdf',
        targetFormat: 'html',
        buffer: createBuffer('%PDF')
      })
    ).rejects.toMatchObject({ code: 'OCR_REQUIRED' })
  })
})
