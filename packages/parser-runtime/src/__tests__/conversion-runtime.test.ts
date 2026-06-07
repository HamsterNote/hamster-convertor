import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

const jsPdfMocks = vi.hoisted(() => ({
  addImage: vi.fn(),
  output: vi.fn(() => new Blob(['mock-pdf'], { type: 'application/pdf' })),
  constructor: vi.fn()
}))

vi.mock('jspdf', () => ({
  jsPDF: jsPdfMocks.constructor.mockImplementation(() => ({
    addImage: jsPdfMocks.addImage,
    output: jsPdfMocks.output
  }))
}))

type ImageListener = () => void

let mockImageWidth = 32
let mockImageHeight = 16

class MockImage {
  get naturalHeight() {
    return mockImageHeight
  }
  get naturalWidth() {
    return mockImageWidth
  }
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

type MockCanvasState = {
  lastCanvas: { width: number; height: number } | null
  lastToBlobArgs: { type: string | undefined; quality: number | undefined }
}

const installCanvasAndImageMocks = (): { restore: () => void; state: MockCanvasState } => {
  const state: MockCanvasState = {
    lastCanvas: null,
    lastToBlobArgs: { type: undefined, quality: undefined }
  }

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

    const canvas = {
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
      toBlob: (callback: BlobCallback, type?: string, quality?: number) => {
        state.lastToBlobArgs = { type, quality }
        callback(new Blob(['mock png'], { type: type ?? 'image/png' }))
      }
    } as unknown as HTMLCanvasElement

    state.lastCanvas = canvas
    return canvas
  })

  globalThis.Image = MockImage as unknown as typeof Image

  return {
    state,
    restore: () => {
      globalThis.Image = originalImage
      URL.createObjectURL = originalCreateObjectUrl
      URL.revokeObjectURL = originalRevokeObjectUrl
      createObjectUrlSpy.mockRestore()
      revokeObjectUrlSpy.mockRestore()
      createElementSpy.mockRestore()
    }
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
    const { restore: restoreDomMocks } = installCanvasAndImageMocks()

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

  it('accepts image options with quality and keepAspectRatio for image-to-image conversion', async () => {
    const { restore: restoreDomMocks } = installCanvasAndImageMocks()
    try {
      const [result] = await convertRuntime({
        filename: 'photo.jpg',
        sourceFormat: 'image',
        targetFormat: 'png',
        buffer: createBuffer('jpg-bytes'),
        mimeType: 'image/jpeg',
        options: {
          image: { quality: 0.85, keepAspectRatio: true }
        }
      })
      expect(result?.targetFormat).toBe('png')
    } finally {
      restoreDomMocks()
    }
  })

  it('accepts image options with maxWidth and maxHeight', async () => {
    const { restore: restoreDomMocks } = installCanvasAndImageMocks()
    try {
      const [result] = await convertRuntime({
        filename: 'photo.jpg',
        sourceFormat: 'image',
        targetFormat: 'webp',
        buffer: createBuffer('jpg-bytes'),
        mimeType: 'image/jpeg',
        options: {
          image: { quality: 0.92, maxWidth: 1920, maxHeight: 1080, keepAspectRatio: true }
        }
      })
      expect(result?.targetFormat).toBe('webp')
    } finally {
      restoreDomMocks()
    }
  })

  it('passes canonical quality to canvas.toBlob for JPG target', async () => {
    const { restore, state } = installCanvasAndImageMocks()
    try {
      await convertRuntime({
        filename: 'photo.jpg',
        sourceFormat: 'image',
        targetFormat: 'jpg',
        buffer: createBuffer('jpg-bytes'),
        mimeType: 'image/jpeg',
        options: { image: { quality: 0.8, keepAspectRatio: true } }
      })
      expect(state.lastToBlobArgs.quality).toBe(0.8)
    } finally {
      restore()
    }
  })

  it('ignores quality for PNG target', async () => {
    const { restore, state } = installCanvasAndImageMocks()
    try {
      await convertRuntime({
        filename: 'photo.jpg',
        sourceFormat: 'image',
        targetFormat: 'png',
        buffer: createBuffer('jpg-bytes'),
        mimeType: 'image/jpeg',
        options: { image: { quality: 0.8, keepAspectRatio: true } }
      })
      expect(state.lastToBlobArgs.quality).toBeUndefined()
    } finally {
      restore()
    }
  })

  it('clamps quality below 0.1 to 0.1', async () => {
    const { restore, state } = installCanvasAndImageMocks()
    try {
      await convertRuntime({
        filename: 'photo.jpg',
        sourceFormat: 'image',
        targetFormat: 'jpg',
        buffer: createBuffer('jpg-bytes'),
        mimeType: 'image/jpeg',
        options: { image: { quality: 0.05, keepAspectRatio: true } }
      })
      expect(state.lastToBlobArgs.quality).toBe(0.1)
    } finally {
      restore()
    }
  })

  it('clamps quality above 1.0 to 1.0', async () => {
    const { restore, state } = installCanvasAndImageMocks()
    try {
      await convertRuntime({
        filename: 'photo.jpg',
        sourceFormat: 'image',
        targetFormat: 'jpg',
        buffer: createBuffer('jpg-bytes'),
        mimeType: 'image/jpeg',
        options: { image: { quality: 1.5, keepAspectRatio: true } }
      })
      expect(state.lastToBlobArgs.quality).toBe(1.0)
    } finally {
      restore()
    }
  })

  it('resizes canvas with maxWidth preserving aspect ratio', async () => {
    const { restore, state } = installCanvasAndImageMocks()
    try {
      await convertRuntime({
        filename: 'photo.jpg',
        sourceFormat: 'image',
        targetFormat: 'png',
        buffer: createBuffer('jpg-bytes'),
        mimeType: 'image/jpeg',
        options: { image: { quality: 0.92, maxWidth: 16, keepAspectRatio: true } }
      })
      // MockImage: 32x16, maxWidth=16 → scale=0.5 → 16x8
      expect(state.lastCanvas?.width).toBe(16)
      expect(state.lastCanvas?.height).toBe(8)
    } finally {
      restore()
    }
  })

  it('resizes canvas with maxHeight preserving aspect ratio', async () => {
    const { restore, state } = installCanvasAndImageMocks()
    try {
      await convertRuntime({
        filename: 'photo.jpg',
        sourceFormat: 'image',
        targetFormat: 'png',
        buffer: createBuffer('jpg-bytes'),
        mimeType: 'image/jpeg',
        options: { image: { quality: 0.92, maxHeight: 4, keepAspectRatio: true } }
      })
      // MockImage: 32x16, maxHeight=4 → scale=0.25 → 8x4
      expect(state.lastCanvas?.width).toBe(8)
      expect(state.lastCanvas?.height).toBe(4)
    } finally {
      restore()
    }
  })

  it('does not upscale when maxWidth exceeds natural width', async () => {
    const { restore, state } = installCanvasAndImageMocks()
    try {
      await convertRuntime({
        filename: 'photo.jpg',
        sourceFormat: 'image',
        targetFormat: 'png',
        buffer: createBuffer('jpg-bytes'),
        mimeType: 'image/jpeg',
        options: { image: { quality: 0.92, maxWidth: 64, keepAspectRatio: true } }
      })
      // MockImage: 32x16, maxWidth=64 → scale clamped to 1 → 32x16
      expect(state.lastCanvas?.width).toBe(32)
      expect(state.lastCanvas?.height).toBe(16)
    } finally {
      restore()
    }
  })

  it('accepts imageToPdf options with marginPt, fit, and pageMode', () => {
    const request: Parameters<typeof convertRuntime>[0] = {
      filename: 'photo.jpg',
      sourceFormat: 'image',
      targetFormat: 'pdf',
      buffer: createBuffer('jpg-bytes'),
      mimeType: 'image/jpeg',
      options: {
        imageToPdf: { marginPt: 24, fit: 'cover', pageMode: 'auto' }
      }
    }
    expect(request.options?.imageToPdf?.marginPt).toBe(24)
    expect(request.options?.imageToPdf?.fit).toBe('cover')
    expect(request.options?.imageToPdf?.pageMode).toBe('auto')
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

describe('Image-to-PDF cover-fit', () => {
  let restoreDomMocks: (() => void) | undefined

  beforeEach(() => {
    jsPdfMocks.addImage.mockClear()
    jsPdfMocks.output.mockClear()
    jsPdfMocks.constructor.mockClear()
    jsPdfMocks.constructor.mockImplementation(() => ({
      addImage: jsPdfMocks.addImage,
      output: jsPdfMocks.output
    }))
    mockImageWidth = 32
    mockImageHeight = 16
    restoreDomMocks = installCanvasAndImageMocks().restore
  })

  afterEach(() => {
    restoreDomMocks?.()
  })

  it('legacy: no imageToPdf uses image dimensions and draws at origin', async () => {
    const [result] = await convertRuntime({
      filename: 'photo.jpg',
      sourceFormat: 'image',
      targetFormat: 'pdf',
      buffer: createBuffer('jpg-bytes'),
      mimeType: 'image/jpeg'
    })

    expect(jsPdfMocks.constructor).toHaveBeenCalledWith({ unit: 'px', format: [32, 16] })
    expect(jsPdfMocks.addImage).toHaveBeenCalledWith('blob:mock-image', 0, 0, 32, 16)
    expect(result?.filename).toBe('photo.pdf')
    expect(result?.mimeType).toBe('application/pdf')
    expect(result?.targetFormat).toBe('pdf')
  })

  it('cover-fit with margin 0 draws full-size at origin', async () => {
    await convertRuntime({
      filename: 'photo.jpg',
      sourceFormat: 'image',
      targetFormat: 'pdf',
      buffer: createBuffer('jpg-bytes'),
      mimeType: 'image/jpeg',
      options: { imageToPdf: { marginPt: 0, fit: 'cover', pageMode: 'auto' } }
    })

    expect(jsPdfMocks.constructor).toHaveBeenCalledWith({ unit: 'px', format: [32, 16] })
    expect(jsPdfMocks.addImage).toHaveBeenCalledWith('blob:mock-image', 0, 0, 32, 16)
  })

  it('cover-fit with margin on landscape image centers and crops', async () => {
    await convertRuntime({
      filename: 'photo.jpg',
      sourceFormat: 'image',
      targetFormat: 'pdf',
      buffer: createBuffer('jpg-bytes'),
      mimeType: 'image/jpeg',
      options: { imageToPdf: { marginPt: 4, fit: 'cover', pageMode: 'auto' } }
    })

    // content box: 24x8, scale: max(24/32, 8/16)=0.75, draw: 24x12
    // x=4+(24-24)/2=4, y=4+(8-12)/2=2
    expect(jsPdfMocks.constructor).toHaveBeenCalledWith({ unit: 'px', format: [32, 16] })
    expect(jsPdfMocks.addImage).toHaveBeenCalledWith('blob:mock-image', 4, 2, 24, 12)
  })

  it('cover-fit on portrait image', async () => {
    mockImageWidth = 16
    mockImageHeight = 32

    await convertRuntime({
      filename: 'portrait.jpg',
      sourceFormat: 'image',
      targetFormat: 'pdf',
      buffer: createBuffer('jpg-bytes'),
      mimeType: 'image/jpeg',
      options: { imageToPdf: { marginPt: 4, fit: 'cover', pageMode: 'auto' } }
    })

    // content box: 8x24, scale: max(8/16, 24/32)=0.75, draw: 12x24
    // x=4+(8-12)/2=2, y=4+(24-24)/2=4
    expect(jsPdfMocks.constructor).toHaveBeenCalledWith({ unit: 'px', format: [16, 32] })
    expect(jsPdfMocks.addImage).toHaveBeenCalledWith('blob:mock-image', 2, 4, 12, 24)
  })

  it('clamps excessive margin rather than throwing', async () => {
    await convertRuntime({
      filename: 'photo.jpg',
      sourceFormat: 'image',
      targetFormat: 'pdf',
      buffer: createBuffer('jpg-bytes'),
      mimeType: 'image/jpeg',
      options: { imageToPdf: { marginPt: 100, fit: 'cover', pageMode: 'auto' } }
    })

    // maxMargin=min(32,16)/2=8, clamped to 8
    // content box: 16x0, scale: max(16/32, 0/16)=0.5, draw: 16x8
    // x=8+(16-16)/2=8, y=8+(0-8)/2=4
    expect(jsPdfMocks.addImage).toHaveBeenCalledWith('blob:mock-image', 8, 4, 16, 8)
  })

  it('revokes object URL in cover-fit path', async () => {
    await convertRuntime({
      filename: 'photo.jpg',
      sourceFormat: 'image',
      targetFormat: 'pdf',
      buffer: createBuffer('jpg-bytes'),
      mimeType: 'image/jpeg',
      options: { imageToPdf: { marginPt: 4, fit: 'cover', pageMode: 'auto' } }
    })

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-image')
  })
})
