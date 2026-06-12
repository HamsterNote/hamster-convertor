import type { IntermediateContent, IntermediateDocument } from '@hamster-note/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { convertRuntime } from '../conversion'

const parserMocks = vi.hoisted(() => ({
  pdfEncode: vi.fn(),
  htmlDecodeToHtml: vi.fn(),
  htmlEncode: vi.fn(),
  htmlDecode: vi.fn(),
  imageEncode: vi.fn()
}))

vi.mock('@hamster-note/pdf-parser', () => ({
  PdfParser: {
    encode: parserMocks.pdfEncode
  }
}))

vi.mock('@hamster-note/html-parser', () => ({
  HtmlParser: {
    decodeToHtml: parserMocks.htmlDecodeToHtml,
    encode: parserMocks.htmlEncode,
    decode: parserMocks.htmlDecode
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

type MockIntermediatePage = {
  content: IntermediateContent[]
  getThumbnail?: (scale?: number) => Promise<{ src: string } | undefined>
  getContent: () => Promise<IntermediateContent[]>
  setGetThumbnail?: (fn: (scale?: number) => Promise<{ src: string } | undefined>) => void
}

const createIntermediateDocument = (pages: MockIntermediatePage[]): IntermediateDocument => {
  let currentPages = pages
  const document = {}

  Object.defineProperty(document, 'pages', {
    configurable: true,
    get() {
      return Promise.resolve(currentPages)
    },
    set(nextPages: MockIntermediatePage[]) {
      currentPages = nextPages
    }
  })

  return document as IntermediateDocument
}

const createImageContent = (id: string, src: string): IntermediateContent =>
  ({
    id,
    src,
    opacity: 1,
    polygon: [
      [0, 0],
      [16, 0],
      [16, 16],
      [0, 16]
    ]
  }) as IntermediateContent

const imageHtmlFromIntermediate = async (intermediate: IntermediateDocument): Promise<string> => {
  const pages = await intermediate.pages
  const content = pages.flatMap(page => page.content)
  const images = content
    .filter((item): item is IntermediateContent & { src: string } => 'src' in item)
    .map(image => `<img src="${image.src}" />`)
    .join('')

  return `<html><body>${images}</body></html>`
}

const expectPaginatedCssContract = (result: string) => {
  expect(result).toMatch(/\.hamster-note-document\s*\{[^}]*padding-top:\s*24px/i)
  expect(result).toMatch(/\.hamster-note-page\s*\{[^}]*margin:\s*0 auto 24px auto/i)
  expect(result).toMatch(/\.hamster-note-page:last-child\s*\{[^}]*margin-bottom:\s*24px/i)
  expect(result).toMatch(/\.hamster-note-page\s*\{[^}]*box-shadow:\s*0 2px 8px/i)
  expect(result).not.toMatch(/:last-child\s*\{[^}]*box-shadow:\s*none/i)
}

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
  beforeEach(() => {
    mockImageWidth = 32
    mockImageHeight = 16
  })

  afterEach(() => {
    vi.restoreAllMocks()
    parserMocks.pdfEncode.mockReset()
    parserMocks.htmlDecodeToHtml.mockReset()
    parserMocks.htmlEncode.mockReset()
    parserMocks.htmlDecode.mockReset()
    parserMocks.imageEncode.mockReset()
  })

  it('converts mocked PDF to HTML', async () => {
    parserMocks.pdfEncode.mockResolvedValue(
      createIntermediateDocument([{ content: [], getContent: vi.fn().mockResolvedValue([]) }])
    )
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
    const html = textFromBuffer(result?.buffer ?? new ArrayBuffer(0))
    expect(html).toContain('PDF text')
    expectPaginatedCssContract(html)
  })

  it('passes HTML decode background options to PDF-to-HTML', async () => {
    const decodeOptions = {
      background: {
        includeBackground: true,
        backgroundQuality: 0.85,
        excludeTextFromBackground: true,
        excludeImagesFromBackground: true
      }
    }
    parserMocks.pdfEncode.mockResolvedValue(
      createIntermediateDocument([{ content: [], getContent: vi.fn().mockResolvedValue([]) }])
    )
    parserMocks.htmlDecodeToHtml.mockResolvedValue('<html><body>PDF text</body></html>')

    await convertRuntime({
      filename: 'sample.pdf',
      sourceFormat: 'pdf',
      targetFormat: 'html',
      buffer: createBuffer('%PDF'),
      options: { decode: decodeOptions }
    })

    expect(parserMocks.htmlDecodeToHtml).toHaveBeenCalledWith(expect.anything(), decodeOptions)
  })

  it('removes PDF images with empty src before HTML decode', async () => {
    const validImage = createImageContent('valid-image', 'data:image/png;base64,ZmFrZQ==')
    const emptyImage = createImageContent('empty-image', '')
    const page: MockIntermediatePage = {
      content: [],
      getContent: vi.fn().mockResolvedValue([validImage, emptyImage])
    }
    const intermediate = createIntermediateDocument([page])
    parserMocks.pdfEncode.mockResolvedValue(intermediate)
    parserMocks.htmlDecodeToHtml.mockImplementation(imageHtmlFromIntermediate)

    const [result] = await convertRuntime({
      filename: 'sample.pdf',
      sourceFormat: 'pdf',
      targetFormat: 'html',
      buffer: createBuffer('%PDF')
    })

    const html = textFromBuffer(result?.buffer ?? new ArrayBuffer(0))
    expect(page.getContent).toHaveBeenCalledOnce()
    expect(parserMocks.htmlDecodeToHtml).toHaveBeenCalledWith(intermediate, undefined)
    expect(html).toContain('src="data:image/png;base64,ZmFrZQ=="')
    expect(html).not.toContain('src=""')
  })

  it('removes PDF page thumbnails with empty data URL before HTML decode', async () => {
    let getThumbnail = vi.fn().mockResolvedValue({ src: 'data:,' })
    const page: MockIntermediatePage = {
      content: [],
      getContent: vi.fn().mockResolvedValue([]),
      getThumbnail: (scale?: number) => getThumbnail(scale),
      setGetThumbnail: fn => {
        getThumbnail = vi.fn(fn)
      }
    }
    const intermediate = createIntermediateDocument([page])
    parserMocks.pdfEncode.mockResolvedValue(intermediate)
    parserMocks.htmlDecodeToHtml.mockImplementation(async doc => {
      const [preparedPage] = await doc.pages
      const thumbnail = await preparedPage?.getThumbnail?.(0.3)
      const backgroundStyle = thumbnail?.src ? `background-image:url('${thumbnail.src}');` : ''
      return `<div class="hamster-note-page" style="width:427.92px;height:619.68px;${backgroundStyle}"></div>`
    })

    const [result] = await convertRuntime({
      filename: 'sample.pdf',
      sourceFormat: 'pdf',
      targetFormat: 'html',
      buffer: createBuffer('%PDF')
    })

    const html = textFromBuffer(result?.buffer ?? new ArrayBuffer(0))
    expect(html).not.toContain("background-image:url('data:,')")
  })

  it('removes empty data URL page backgrounds from generated PDF HTML', async () => {
    parserMocks.pdfEncode.mockResolvedValue(
      createIntermediateDocument([{ content: [], getContent: vi.fn().mockResolvedValue([]) }])
    )
    parserMocks.htmlDecodeToHtml.mockResolvedValue(
      `<div class="hamster-note-page" style="width:427.92px;height:619.68px;background-image:url('data:,');"></div>`
    )

    const [result] = await convertRuntime({
      filename: 'sample.pdf',
      sourceFormat: 'pdf',
      targetFormat: 'html',
      buffer: createBuffer('%PDF')
    })

    const html = textFromBuffer(result?.buffer ?? new ArrayBuffer(0))
    expect(html).toContain('class="hamster-note-page"')
    expect(html).not.toContain("background-image:url('data:,')")
  })

  it('passes HTML encode options to HTML-to-text', async () => {
    const getPages = vi
      .fn()
      .mockResolvedValue([
        { getPureText: () => 'Visible text' },
        { getPureText: () => 'More text' }
      ])
    const encodeOptions = { excludeSelectors: ['script', '.skip'], snapshotWidth: 1024 }
    const buffer = createBuffer('<html><body>Visible text</body></html>')
    parserMocks.htmlEncode.mockResolvedValue({ getPages })

    const [result] = await convertRuntime({
      filename: 'page.html',
      sourceFormat: 'html',
      targetFormat: 'txt',
      buffer,
      options: { encode: encodeOptions }
    })

    expect(parserMocks.htmlEncode).toHaveBeenCalledWith(buffer, encodeOptions)
    expect(getPages).toHaveBeenCalled()
    expect(textFromBuffer(result?.buffer ?? new ArrayBuffer(0))).toBe('Visible text\nMore text')
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

  it('converts image to JPG when removeExif is enabled', async () => {
    const { restore } = installCanvasAndImageMocks()
    try {
      const [result] = await convertRuntime({
        filename: 'photo.jpg',
        sourceFormat: 'image',
        targetFormat: 'jpg',
        buffer: createBuffer('jpg-bytes'),
        mimeType: 'image/jpeg',
        options: {
          image: {
            quality: 0.8,
            keepAspectRatio: true,
            removeExif: { enabled: true, categories: ['all'] }
          }
        }
      })

      expect(result?.filename).toBe('photo.jpg')
      expect(result?.mimeType).toBe('image/jpeg')
      expect(result?.targetFormat).toBe('jpg')
      expect(textFromBuffer(result?.buffer ?? new ArrayBuffer(0))).toBe('mock png')
    } finally {
      restore()
    }
  })

  it('skips EXIF parsing for PNG and WEBP when removeExif is enabled', async () => {
    const { restore } = installCanvasAndImageMocks()
    try {
      for (const targetFormat of ['png', 'webp'] as const) {
        const [result] = await convertRuntime({
          filename: 'photo.jpg',
          sourceFormat: 'image',
          targetFormat,
          buffer: createBuffer('jpg-bytes'),
          mimeType: 'image/jpeg',
          options: {
            image: {
              quality: 0.8,
              keepAspectRatio: true,
              removeExif: { enabled: true, categories: ['all'] }
            }
          }
        })

        expect(result?.targetFormat).toBe(targetFormat)
      }
    } finally {
      restore()
    }
  })

  it('converts text to JPG with removeExif enabled', async () => {
    const { restore } = installCanvasAndImageMocks()
    try {
      const [result] = await convertRuntime({
        filename: 'note.txt',
        sourceFormat: 'txt',
        targetFormat: 'jpg',
        buffer: createBuffer('hello'),
        mimeType: 'text/plain',
        options: {
          image: {
            quality: 0.75,
            keepAspectRatio: true,
            removeExif: { enabled: true, categories: ['all'] }
          }
        }
      })

      expect(result?.filename).toBe('note.jpg')
      expect(result?.mimeType).toBe('image/jpeg')
      expect(result?.targetFormat).toBe('jpg')
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
      mockImageWidth = 400
      mockImageHeight = 200
      await convertRuntime({
        filename: 'photo.jpg',
        sourceFormat: 'image',
        targetFormat: 'png',
        buffer: createBuffer('jpg-bytes'),
        mimeType: 'image/jpeg',
        options: { image: { quality: 0.92, maxWidth: 200, keepAspectRatio: true } }
      })
      expect(state.lastCanvas?.width).toBe(200)
      expect(state.lastCanvas?.height).toBe(100)
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
      mockImageWidth = 100
      mockImageHeight = 50
      await convertRuntime({
        filename: 'photo.jpg',
        sourceFormat: 'image',
        targetFormat: 'png',
        buffer: createBuffer('jpg-bytes'),
        mimeType: 'image/jpeg',
        options: { image: { quality: 0.92, maxWidth: 200, keepAspectRatio: true } }
      })
      expect(state.lastCanvas?.width).toBe(100)
      expect(state.lastCanvas?.height).toBe(50)
    } finally {
      restore()
    }
  })

  it('downscales to maxWidth and keeps original size when maxWidth is larger', async () => {
    const { restore, state } = installCanvasAndImageMocks()
    try {
      mockImageWidth = 800
      mockImageHeight = 400
      await convertRuntime({
        filename: 'wide.jpg',
        sourceFormat: 'image',
        targetFormat: 'webp',
        buffer: createBuffer('jpg-bytes'),
        mimeType: 'image/jpeg',
        options: { image: { quality: 0.92, maxWidth: 320, keepAspectRatio: true } }
      })
      expect(state.lastCanvas?.width).toBe(320)
      expect(state.lastCanvas?.height).toBe(160)

      await convertRuntime({
        filename: 'small.jpg',
        sourceFormat: 'image',
        targetFormat: 'webp',
        buffer: createBuffer('jpg-bytes'),
        mimeType: 'image/jpeg',
        options: { image: { quality: 0.92, maxWidth: 1200, keepAspectRatio: true } }
      })
      expect(state.lastCanvas?.width).toBe(800)
      expect(state.lastCanvas?.height).toBe(400)
    } finally {
      restore()
    }
  })

  it('uses the smaller scale factor when maxWidth and maxHeight are both set', async () => {
    const { restore, state } = installCanvasAndImageMocks()
    try {
      mockImageWidth = 400
      mockImageHeight = 300
      await convertRuntime({
        filename: 'photo.jpg',
        sourceFormat: 'image',
        targetFormat: 'png',
        buffer: createBuffer('jpg-bytes'),
        mimeType: 'image/jpeg',
        options: { image: { quality: 0.92, maxWidth: 300, maxHeight: 120, keepAspectRatio: true } }
      })
      expect(state.lastCanvas?.width).toBe(160)
      expect(state.lastCanvas?.height).toBe(120)
    } finally {
      restore()
    }
  })

  it('accepts imageToPdf options with marginPt, fit, pageMode, rotation, and scale', () => {
    const request: Parameters<typeof convertRuntime>[0] = {
      filename: 'photo.jpg',
      sourceFormat: 'image',
      targetFormat: 'pdf',
      buffer: createBuffer('jpg-bytes'),
      mimeType: 'image/jpeg',
      options: {
        imageToPdf: {
          marginPt: 24,
          fit: 'contain',
          pageMode: 'multi',
          rotationDeg: 270,
          scalePercent: 150
        }
      }
    }
    expect(request.options?.imageToPdf?.marginPt).toBe(24)
    expect(request.options?.imageToPdf?.fit).toBe('contain')
    expect(request.options?.imageToPdf?.pageMode).toBe('multi')
    expect(request.options?.imageToPdf?.rotationDeg).toBe(270)
    expect(request.options?.imageToPdf?.scalePercent).toBe(150)
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

describe('Image-to-PDF A4 sizing', () => {
  let restoreDomMocks: (() => void) | undefined
  const a4Portrait = { width: 595.28, height: 841.89 }
  const a4Landscape = { width: 841.89, height: 595.28 }
  const marginPt = 24

  const getLastAddImageCall = () => {
    const call = jsPdfMocks.addImage.mock.calls.at(-1)
    if (!call) {
      throw new Error('Expected addImage to be called')
    }
    return call as [string, number, number, number, number, string | undefined, unknown, number]
  }

  const expectWithinUsableBounds = (usableWidth: number, usableHeight: number) => {
    const [, x, y, drawWidth, drawHeight] = getLastAddImageCall()
    expect(drawWidth).toBeLessThanOrEqual(usableWidth)
    expect(drawHeight).toBeLessThanOrEqual(usableHeight)
    expect(x).toBeGreaterThanOrEqual(marginPt)
    expect(y).toBeGreaterThanOrEqual(marginPt)
    expect(x + drawWidth).toBeLessThanOrEqual(marginPt + usableWidth)
    expect(y + drawHeight).toBeLessThanOrEqual(marginPt + usableHeight)
  }

  const expectContainAtTopLeftWithinBounds = (usableWidth: number, usableHeight: number) => {
    const [, x, y] = getLastAddImageCall()
    expect(x).toBe(marginPt)
    expect(y).toBe(marginPt)
    expectWithinUsableBounds(usableWidth, usableHeight)
  }

  const convertImageToPdf = (
    imageToPdf: NonNullable<
      NonNullable<Parameters<typeof convertRuntime>[0]['options']>['imageToPdf']
    >
  ) =>
    convertRuntime({
      filename: 'photo.jpg',
      sourceFormat: 'image',
      targetFormat: 'pdf',
      buffer: createBuffer('jpg-bytes'),
      mimeType: 'image/jpeg',
      options: { imageToPdf }
    })

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

  it('uses deterministic A4 landscape pages without imageToPdf options', async () => {
    const [result] = await convertRuntime({
      filename: 'photo.jpg',
      sourceFormat: 'image',
      targetFormat: 'pdf',
      buffer: createBuffer('jpg-bytes'),
      mimeType: 'image/jpeg'
    })

    expect(jsPdfMocks.constructor).toHaveBeenCalledWith({
      unit: 'pt',
      format: [a4Landscape.width, a4Landscape.height]
    })
    expect(jsPdfMocks.addImage).toHaveBeenCalledWith(
      'blob:mock-image',
      0,
      0,
      a4Landscape.width,
      a4Landscape.height,
      undefined,
      undefined,
      0
    )
    expect(result?.filename).toBe('photo.pdf')
    expect(result?.mimeType).toBe('application/pdf')
    expect(result?.targetFormat).toBe('pdf')
  })

  it.each(['contain', 'cover'] as const)(
    'keeps a large landscape image inside usable page width for %s fit',
    async fit => {
      mockImageWidth = 4000
      mockImageHeight = 3000

      await convertRuntime({
        filename: 'large.jpg',
        sourceFormat: 'image',
        targetFormat: 'pdf',
        buffer: createBuffer('jpg-bytes'),
        mimeType: 'image/jpeg',
        options: {
          imageToPdf: {
            marginPt,
            fit,
            pageMode: 'auto',
            rotationDeg: 0,
            scalePercent: 100
          }
        }
      })

      expect(jsPdfMocks.constructor).toHaveBeenCalledWith({
        unit: 'pt',
        format: [a4Landscape.width, a4Landscape.height]
      })
      expectWithinUsableBounds(a4Landscape.width - marginPt * 2, a4Landscape.height - marginPt * 2)
    }
  )

  it('draws width-dominant contain images from the top-left margin', async () => {
    mockImageWidth = 4000
    mockImageHeight = 1000

    await convertImageToPdf({
      marginPt,
      fit: 'contain',
      pageMode: 'auto',
      rotationDeg: 0,
      scalePercent: 100
    })

    expect(jsPdfMocks.constructor).toHaveBeenCalledWith({
      unit: 'pt',
      format: [a4Landscape.width, a4Landscape.height]
    })
    expectContainAtTopLeftWithinBounds(
      a4Landscape.width - marginPt * 2,
      a4Landscape.height - marginPt * 2
    )
  })

  it('draws height-dominant contain images from the top-left margin', async () => {
    mockImageWidth = 1000
    mockImageHeight = 4000

    await convertImageToPdf({
      marginPt,
      fit: 'contain',
      pageMode: 'auto',
      rotationDeg: 0,
      scalePercent: 100
    })

    expect(jsPdfMocks.constructor).toHaveBeenCalledWith({
      unit: 'pt',
      format: [a4Portrait.width, a4Portrait.height]
    })
    expectContainAtTopLeftWithinBounds(
      a4Portrait.width - marginPt * 2,
      a4Portrait.height - marginPt * 2
    )
  })

  it('draws square contain images from the top-left margin', async () => {
    mockImageWidth = 2000
    mockImageHeight = 2000

    await convertImageToPdf({
      marginPt,
      fit: 'contain',
      pageMode: 'auto',
      rotationDeg: 0,
      scalePercent: 100
    })
    expect(jsPdfMocks.constructor).toHaveBeenCalledWith({
      unit: 'pt',
      format: [a4Portrait.width, a4Portrait.height]
    })
    expectContainAtTopLeftWithinBounds(
      a4Portrait.width - marginPt * 2,
      a4Portrait.height - marginPt * 2
    )
  })

  it('keeps cover images centered when scale leaves drawable whitespace', async () => {
    mockImageWidth = 4000
    mockImageHeight = 1000

    await convertImageToPdf({
      marginPt,
      fit: 'cover',
      pageMode: 'single',
      rotationDeg: 0,
      scalePercent: 50
    })

    const [, x, y, drawWidth, drawHeight] = getLastAddImageCall()
    const usableWidth = a4Portrait.width - marginPt * 2
    const usableHeight = a4Portrait.height - marginPt * 2
    expect(x).toBeCloseTo(marginPt + (usableWidth - drawWidth) / 2)
    expect(y).toBeCloseTo(marginPt + (usableHeight - drawHeight) / 2)
    expect(x).toBeGreaterThan(marginPt)
    expect(y).toBeGreaterThan(marginPt)
    expectWithinUsableBounds(usableWidth, usableHeight)
  })

  it.each([90, 270] as const)(
    'rotation %i swaps effective dimensions for auto page mode',
    async rotationDeg => {
      mockImageWidth = 4000
      mockImageHeight = 3000

      await convertRuntime({
        filename: 'photo.jpg',
        sourceFormat: 'image',
        targetFormat: 'pdf',
        buffer: createBuffer('jpg-bytes'),
        mimeType: 'image/jpeg',
        options: {
          imageToPdf: {
            marginPt,
            fit: 'contain',
            pageMode: 'auto',
            rotationDeg,
            scalePercent: 100
          }
        }
      })

      expect(jsPdfMocks.constructor).toHaveBeenCalledWith({
        unit: 'pt',
        format: [a4Portrait.width, a4Portrait.height]
      })
      expect(getLastAddImageCall()[7]).toBe(rotationDeg)
      expectWithinUsableBounds(a4Portrait.width - marginPt * 2, a4Portrait.height - marginPt * 2)
    }
  )

  it('single page mode forces portrait A4 for landscape images', async () => {
    mockImageWidth = 4000
    mockImageHeight = 3000

    await convertRuntime({
      filename: 'landscape.jpg',
      sourceFormat: 'image',
      targetFormat: 'pdf',
      buffer: createBuffer('jpg-bytes'),
      mimeType: 'image/jpeg',
      options: {
        imageToPdf: {
          marginPt,
          fit: 'cover',
          pageMode: 'single',
          rotationDeg: 0,
          scalePercent: 100
        }
      }
    })

    expect(jsPdfMocks.constructor).toHaveBeenCalledWith({
      unit: 'pt',
      format: [a4Portrait.width, a4Portrait.height]
    })
    expectWithinUsableBounds(a4Portrait.width - marginPt * 2, a4Portrait.height - marginPt * 2)
  })

  it('multi page mode behaves like auto without adding tiling', async () => {
    mockImageWidth = 4000
    mockImageHeight = 3000

    await convertRuntime({
      filename: 'large.jpg',
      sourceFormat: 'image',
      targetFormat: 'pdf',
      buffer: createBuffer('jpg-bytes'),
      mimeType: 'image/jpeg',
      options: {
        imageToPdf: {
          marginPt,
          fit: 'contain',
          pageMode: 'multi',
          rotationDeg: 0,
          scalePercent: 100
        }
      }
    })

    expect(jsPdfMocks.constructor).toHaveBeenCalledWith({
      unit: 'pt',
      format: [a4Landscape.width, a4Landscape.height]
    })
    expect(jsPdfMocks.addImage).toHaveBeenCalledTimes(1)
  })

  it('clamps scale 300 on wide images to usable page bounds', async () => {
    mockImageWidth = 4000
    mockImageHeight = 1000

    await convertRuntime({
      filename: 'wide.jpg',
      sourceFormat: 'image',
      targetFormat: 'pdf',
      buffer: createBuffer('jpg-bytes'),
      mimeType: 'image/jpeg',
      options: {
        imageToPdf: {
          marginPt,
          fit: 'contain',
          pageMode: 'auto',
          rotationDeg: 0,
          scalePercent: 300
        }
      }
    })

    expectWithinUsableBounds(a4Landscape.width - marginPt * 2, a4Landscape.height - marginPt * 2)
    expect(jsPdfMocks.addImage).toHaveBeenCalledTimes(1)
  })

  it('keeps rotated and scaled images inside A4 bounds', async () => {
    mockImageWidth = 1200
    mockImageHeight = 2400

    await convertRuntime({
      filename: 'portrait.jpg',
      sourceFormat: 'image',
      targetFormat: 'pdf',
      buffer: createBuffer('jpg-bytes'),
      mimeType: 'image/jpeg',
      options: {
        imageToPdf: {
          marginPt,
          fit: 'contain',
          pageMode: 'auto',
          rotationDeg: 90,
          scalePercent: 150
        }
      }
    })

    expect(jsPdfMocks.constructor).toHaveBeenCalledWith({
      unit: 'pt',
      format: [a4Landscape.width, a4Landscape.height]
    })
    expect(getLastAddImageCall()[7]).toBe(90)
    expectWithinUsableBounds(a4Landscape.width - marginPt * 2, a4Landscape.height - marginPt * 2)
  })

  it('revokes object URL after A4 sizing', async () => {
    await convertRuntime({
      filename: 'photo.jpg',
      sourceFormat: 'image',
      targetFormat: 'pdf',
      buffer: createBuffer('jpg-bytes'),
      mimeType: 'image/jpeg',
      options: {
        imageToPdf: {
          marginPt,
          fit: 'cover',
          pageMode: 'auto',
          rotationDeg: 0,
          scalePercent: 100
        }
      }
    })

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-image')
  })
})
