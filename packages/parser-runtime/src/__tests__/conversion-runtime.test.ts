import type { IntermediateContent, IntermediateDocument } from '@hamster-note/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { convertRuntime } from '../conversion'

const parserMocks = vi.hoisted(() => ({
  pdfEncode: vi.fn(),
  txtEncode: vi.fn(),
  htmlDecodeToHtml: vi.fn(),
  htmlEncode: vi.fn(),
  htmlDecode: vi.fn(),
  imageEncode: vi.fn(),
  // Markdown parser mocks - encode 把 buffer 转为 IntermediateDocument，
  // decodeToMarkdown 反向把 IntermediateDocument 输出为 markdown 字符串
  markdownEncode: vi.fn(),
  markdownDecodeToMarkdown: vi.fn(),
  // html2canvas 默认导出函数 mock - 单测里渲染用到
  html2canvas: vi.fn()
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

vi.mock('@hamster-note/txt-parser', () => ({
  TxtParser: {
    encode: parserMocks.txtEncode
  }
}))

vi.mock('@hamster-note/image-parser', () => ({
  ImageParser: {
    encode: parserMocks.imageEncode
  }
}))

// Markdown parser mock - 与 PdfParser/HtmlParser 同模式：导出一个有 static 方法的类
vi.mock('@hamster-note/markdown-parser', () => ({
  MarkdownParser: {
    encode: parserMocks.markdownEncode,
    decodeToMarkdown: parserMocks.markdownDecodeToMarkdown
  }
}))

// html2canvas 是 default export 的函数；包装为 default 字段
vi.mock('html2canvas', () => ({
  default: parserMocks.html2canvas
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

// 构造仿真 TXT 解析结果：真实 TxtParser.encode 把整段文本放在
// pages[0].content[0].content（IntermediateText 节点）。adapters.ts 的
// extractTextFromIntermediate 通过 await pages → page.getContent() 读取，
// 所以 mock 必须复刻这条链路而不是返回旧的 { text } 顶层结构。
const createTxtIntermediateDocument = (text: string): IntermediateDocument =>
  createIntermediateDocument([
    {
      content: [{ content: text } as unknown as IntermediateContent],
      getContent: async () => [{ content: text } as unknown as IntermediateContent]
    }
  ])

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

const getTxtImageCanvas = (state: MockCanvasState): MockCanvasRecord => {
  const canvas = state.canvases.find(item =>
    item.operations.some(operation => operation.method === 'fillText')
  )
  if (!canvas) {
    throw new Error('Expected TXT image canvas with text drawing')
  }
  return canvas
}

const getFirstOperation = (
  canvas: MockCanvasRecord,
  method: MockCanvasOperation['method']
): MockCanvasOperation => {
  const operation = canvas.operations.find(item => item.method === method)
  if (!operation) {
    throw new Error(`Expected ${method} operation`)
  }
  return operation
}

type MockCanvasOperation = {
  method: 'drawImage' | 'fillRect' | 'fillText'
  args: unknown[]
  fillStyle: string
  font: string
}

type MockCanvasRecord = {
  height: number
  operations: MockCanvasOperation[]
  width: number
}

type MockCanvasState = {
  canvases: MockCanvasRecord[]
  lastCanvas: MockCanvasRecord | null
  lastToBlobCanvas: MockCanvasRecord | null
  lastToBlobArgs: { type: string | undefined; quality: number | undefined }
}

const installCanvasAndImageMocks = (): { restore: () => void; state: MockCanvasState } => {
  const state: MockCanvasState = {
    canvases: [],
    lastCanvas: null,
    lastToBlobCanvas: null,
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

    const canvas: MockCanvasRecord & {
      getContext: () => CanvasRenderingContext2D
      toBlob: (callback: BlobCallback, type?: string, quality?: number) => void
    } = {
      width: 0,
      height: 0,
      operations: [],
      getContext: () => {
        let fillStyle = ''
        let font = ''
        return {
          drawImage: vi.fn((...args: unknown[]) => {
            canvas.operations.push({ method: 'drawImage', args, fillStyle, font })
          }),
          fillRect: vi.fn((...args: unknown[]) => {
            canvas.operations.push({ method: 'fillRect', args, fillStyle, font })
          }),
          get fillStyle() {
            return fillStyle
          },
          set fillStyle(value: string) {
            fillStyle = value
          },
          fillText: vi.fn((...args: unknown[]) => {
            canvas.operations.push({ method: 'fillText', args, fillStyle, font })
          }),
          get font() {
            return font
          },
          set font(value: string) {
            font = value
          },
          measureText: (text: string) => ({ width: text.length * 8 })
        } as unknown as CanvasRenderingContext2D
      },
      toBlob: (callback: BlobCallback, type?: string, quality?: number) => {
        state.lastToBlobArgs = { type, quality }
        state.lastToBlobCanvas = canvas
        callback(new Blob(['mock png'], { type: type ?? 'image/png' }))
      }
    }

    state.lastCanvas = canvas
    state.canvases.push(canvas)
    return canvas as unknown as HTMLCanvasElement
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
    parserMocks.txtEncode.mockResolvedValue(createTxtIntermediateDocument('mock txt content'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    parserMocks.pdfEncode.mockReset()
    parserMocks.txtEncode.mockReset()
    parserMocks.htmlDecodeToHtml.mockReset()
    parserMocks.htmlEncode.mockReset()
    parserMocks.htmlDecode.mockReset()
    parserMocks.imageEncode.mockReset()
    parserMocks.markdownEncode.mockReset()
    parserMocks.markdownDecodeToMarkdown.mockReset()
    parserMocks.html2canvas.mockReset()
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
        backgroundQuality: 0.85
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

  it('separates HTML page paragraphs with deterministic blank lines', async () => {
    parserMocks.htmlEncode.mockResolvedValue({
      getPages: vi.fn().mockResolvedValue([{ getPureText: () => 'A\n\nB\n\nC\nD' }])
    })

    const [result] = await convertRuntime({
      filename: 'article.html',
      sourceFormat: 'html',
      targetFormat: 'txt',
      buffer: createBuffer('<p>A</p><p>B</p><div>C<br>D</div>')
    })

    expect(textFromBuffer(result?.buffer ?? new ArrayBuffer(0)).trim()).toBe('A\n\nB\n\nC\nD')
  })

  it('wraps TXT-to-HTML output with readable 16px defaults and strips abnormal scale styles', async () => {
    const intermediate = {
      outline: undefined,
      text: 'Hello\nWorld',
      children: [{ text: 'Hello' }, { text: 'World' }]
    }
    parserMocks.txtEncode.mockResolvedValue(intermediate)
    parserMocks.htmlDecode.mockResolvedValue(
      new File(
        [
          '<!doctype html><html><head><title>Converted</title></head><body style="transform: scale(0.06); font-size: 2px;"><p style="transform:scale(0.06)">Hello</p><p>World</p></body></html>'
        ],
        'converted.html',
        { type: 'text/html' }
      )
    )

    const [result] = await convertRuntime({
      filename: 'note.txt',
      sourceFormat: 'txt',
      targetFormat: 'html',
      buffer: createBuffer('Hello\nWorld'),
      mimeType: 'text/plain'
    })

    const html = textFromBuffer(result?.buffer ?? new ArrayBuffer(0))
    expect(parserMocks.txtEncode).toHaveBeenCalledWith(createBuffer('Hello\nWorld'))
    expect(parserMocks.htmlDecode).toHaveBeenCalledWith(intermediate, undefined)
    expect(html).toContain('<p>Hello</p><p>World</p>')
    expect(html).toContain('data-hamster-txt-html-wrapper')
    expect(html).toContain('font-size:16px')
    expect(html).toContain('line-height:1.5')
    expect(html).not.toContain('scale(')
    expect(html).not.toContain('data-hamster-html-layout')
  })

  it('preserves PDF-to-TXT page, paragraph, and line separation from intermediate structure', async () => {
    parserMocks.pdfEncode.mockResolvedValue({
      pages: [
        {
          children: [{ text: 'A' }, { text: 'B' }]
        },
        {
          children: [{ text: 'C' }]
        }
      ]
    })

    const [result] = await convertRuntime({
      filename: 'sample.pdf',
      sourceFormat: 'pdf',
      targetFormat: 'txt',
      buffer: createBuffer('%PDF')
    })

    expect(textFromBuffer(result?.buffer ?? new ArrayBuffer(0)).trim()).toBe('A\nB\n\nC')
  })

  it('renders TXT-to-PNG with dedicated visible canvas options', async () => {
    const { restore, state } = installCanvasAndImageMocks()
    parserMocks.txtEncode.mockResolvedValue(createTxtIntermediateDocument('Alpha\nBeta'))

    try {
      const [result] = await convertRuntime({
        filename: 'note.txt',
        sourceFormat: 'txt',
        targetFormat: 'png',
        buffer: createBuffer('Alpha\nBeta'),
        mimeType: 'text/plain',
        options: {
          txtImage: {
            textColor: '#ff0000',
            backgroundColor: '#00ff00',
            fontSizePx: 22,
            imageWidthPx: 640,
            paddingPx: 32,
            lineHeightPx: 36
          }
        }
      })

      const canvas = getTxtImageCanvas(state)
      const background = getFirstOperation(canvas, 'fillRect')
      const firstText = getFirstOperation(canvas, 'fillText')
      const secondText = canvas.operations.filter(operation => operation.method === 'fillText')[1]
      expect(result?.filename).toBe('note.png')
      expect(result?.mimeType).toBe('image/png')
      expect(result?.targetFormat).toBe('png')
      expect(textFromBuffer(result?.buffer ?? new ArrayBuffer(0))).toBe('mock png')
      expect(canvas.width).toBe(640)
      expect(canvas.height).toBe(136)
      expect(background.fillStyle).toBe('#00ff00')
      expect(background.args).toEqual([0, 0, 640, 136])
      expect(firstText.fillStyle).toBe('#ff0000')
      expect(firstText.font).toBe('22px sans-serif')
      expect(firstText.args).toEqual(['Alpha', 32, 68])
      expect(secondText?.args).toEqual(['Beta', 32, 104])
      expect(state.lastToBlobArgs).toEqual({ type: 'image/png', quality: undefined })
    } finally {
      restore()
    }
  })

  it.each([
    ['jpg', 'image/jpeg', 'note.jpg', 0.92],
    ['webp', 'image/webp', 'note.webp', 0.92]
  ] as const)(
    'converts TXT to %s with non-empty output',
    async (targetFormat, mimeType, filename, quality) => {
      const { restore, state } = installCanvasAndImageMocks()

      try {
        const [result] = await convertRuntime({
          filename: 'note.txt',
          sourceFormat: 'txt',
          targetFormat,
          buffer: createBuffer('hello'),
          mimeType: 'text/plain',
          options: {
            txtImage: {
              textColor: '#111111',
              backgroundColor: '#eeeeee',
              fontSizePx: 18,
              imageWidthPx: 500,
              paddingPx: 24,
              lineHeightPx: 30
            }
          }
        })

        expect(result?.filename).toBe(filename)
        expect(result?.mimeType).toBe(mimeType)
        expect(result?.targetFormat).toBe(targetFormat)
        expect((result?.buffer.byteLength ?? 0) > 0).toBe(true)
        expect(state.lastToBlobArgs).toEqual({ type: mimeType, quality })
      } finally {
        restore()
      }
    }
  )

  it('uses TXT image defaults for missing, NaN, and Infinity numeric options', async () => {
    const { restore, state } = installCanvasAndImageMocks()

    try {
      await convertRuntime({
        filename: 'note.txt',
        sourceFormat: 'txt',
        targetFormat: 'png',
        buffer: createBuffer('hello'),
        mimeType: 'text/plain',
        options: {
          txtImage: {
            textColor: '#123456',
            backgroundColor: '#abcdef',
            fontSizePx: Number.NaN,
            imageWidthPx: Number.POSITIVE_INFINITY,
            paddingPx: Number.NEGATIVE_INFINITY,
            lineHeightPx: undefined as unknown as number
          }
        }
      })

      const canvas = getTxtImageCanvas(state)
      const text = getFirstOperation(canvas, 'fillText')
      expect(canvas.width).toBe(800)
      expect(canvas.height).toBe(100)
      expect(text.font).toBe('16px sans-serif')
      expect(text.args).toEqual(['mock txt content', 20, 44])
    } finally {
      restore()
    }
  })

  it('rounds and clamps TXT image numeric options with padding and line-height safeguards', async () => {
    const { restore, state } = installCanvasAndImageMocks()

    try {
      await convertRuntime({
        filename: 'note.txt',
        sourceFormat: 'txt',
        targetFormat: 'png',
        buffer: createBuffer('hello'),
        mimeType: 'text/plain',
        options: {
          txtImage: {
            textColor: '#000000',
            backgroundColor: '#ffffff',
            fontSizePx: 7.6,
            imageWidthPx: 319.4,
            paddingPx: 300.2,
            lineHeightPx: 7.2
          }
        }
      })

      const minCanvas = getTxtImageCanvas(state)
      const minText = getFirstOperation(minCanvas, 'fillText')
      const minSecondText = minCanvas.operations.filter(
        operation => operation.method === 'fillText'
      )[1]
      expect(minCanvas.width).toBe(320)
      expect(minText.font).toBe('8px sans-serif')
      expect(minText.args).toEqual(['mock', 140, 148])
      expect(minSecondText?.args).toEqual(['txt', 140, 156])

      await convertRuntime({
        filename: 'note.txt',
        sourceFormat: 'txt',
        targetFormat: 'png',
        buffer: createBuffer('hello'),
        mimeType: 'text/plain',
        options: {
          txtImage: {
            textColor: '#000000',
            backgroundColor: '#ffffff',
            fontSizePx: 200.2,
            imageWidthPx: 5000.8,
            paddingPx: -1.2,
            lineHeightPx: 12.1
          }
        }
      })

      const maxCanvas = getTxtImageCanvas({ ...state, canvases: state.canvases.slice(2) })
      const maxText = getFirstOperation(maxCanvas, 'fillText')
      expect(maxCanvas.width).toBe(4096)
      expect(maxText.font).toBe('96px sans-serif')
      expect(maxText.args).toEqual(['mock txt content', 0, 96])
    } finally {
      restore()
    }
  })

  // ---- Regression: TXT-to-PNG must wrap CJK text without spaces ----
  // 用户反馈：TXT 文件包含中文/日文/韩文（无空格）时 PNG 输出空白，
  // 因为 wrapText 仅按空格切分，CJK 整段被当成一个 token，永远不换行，
  // 一行被绘制到画布外导致看似空白。以下 4 个用例锁定修复后的行为。

  it('wraps CJK paragraphs without spaces into multiple lines (TXT→PNG)', async () => {
    // S1 - Happy path: 200 个汉字无空格，必须换行成 ≥2 行；
    // 默认 imageWidthPx=800、padding=20 → maxWidth=760；
    // 在 mock 下每字符宽 8px → 95 字符/行；200 字符必须 ≥ 3 行。
    const longChinese = '你好世界'.repeat(50) // 200 chars, no spaces
    parserMocks.txtEncode.mockResolvedValueOnce(createTxtIntermediateDocument(longChinese))
    const { restore, state } = installCanvasAndImageMocks()

    try {
      await convertRuntime({
        filename: 'cjk.txt',
        sourceFormat: 'txt',
        targetFormat: 'png',
        buffer: createBuffer('cjk-bytes'),
        mimeType: 'text/plain'
      })

      const canvas = getTxtImageCanvas(state)
      const fillTextOps = canvas.operations.filter(op => op.method === 'fillText')
      expect(fillTextOps.length).toBeGreaterThanOrEqual(2)
      // 每一行的可视宽度（chars*8）必须 ≤ maxWidth=760
      for (const op of fillTextOps) {
        const line = op.args[0] as string
        expect(line.length * 8).toBeLessThanOrEqual(760)
      }
    } finally {
      restore()
    }
  })

  it('wraps mixed CJK + Latin text on character boundaries when no space fits (TXT→PNG)', async () => {
    // S2 - 中英混排：CJK 段无空格 + 一个英文单词
    // 输入 '你好世界你好世界 hello' — 在 maxWidth=40 时
    // 'hello' 单词宽 5*8=40 ≤ 40 可以 fit，但 8 个汉字一段 64>40 必须按字符切。
    parserMocks.txtEncode.mockResolvedValueOnce(
      createTxtIntermediateDocument('你好世界你好世界 hello')
    )
    const { restore, state } = installCanvasAndImageMocks()

    try {
      await convertRuntime({
        filename: 'mixed.txt',
        sourceFormat: 'txt',
        targetFormat: 'png',
        buffer: createBuffer('mix-bytes'),
        mimeType: 'text/plain',
        options: {
          txtImage: {
            textColor: '#000000',
            backgroundColor: '#ffffff',
            fontSizePx: 16,
            imageWidthPx: 320,
            paddingPx: 140,
            lineHeightPx: 24
          }
        }
      })

      const canvas = getTxtImageCanvas(state)
      const fillTextOps = canvas.operations.filter(op => op.method === 'fillText')
      // 8 个汉字 + 'hello'，maxWidth=40 → 至少 3 行（5字符CJK + 3字符CJK + hello）
      expect(fillTextOps.length).toBeGreaterThanOrEqual(2)
      for (const op of fillTextOps) {
        const line = op.args[0] as string
        if (line === '') continue
        expect(line.length * 8).toBeLessThanOrEqual(40)
      }
    } finally {
      restore()
    }
  })

  it('wraps a long single-token Latin word by character fallback (TXT→PNG)', async () => {
    // S3 - 极端长单词：200 个 'a' 无空格，仍必须换行
    const longWord = 'a'.repeat(200)
    parserMocks.txtEncode.mockResolvedValueOnce(createTxtIntermediateDocument(longWord))
    const { restore, state } = installCanvasAndImageMocks()

    try {
      await convertRuntime({
        filename: 'long.txt',
        sourceFormat: 'txt',
        targetFormat: 'png',
        buffer: createBuffer('long-bytes'),
        mimeType: 'text/plain'
      })

      const canvas = getTxtImageCanvas(state)
      const fillTextOps = canvas.operations.filter(op => op.method === 'fillText')
      // 默认 maxWidth=760，每字符 8px → 95/行 → 200 字符 ≥ 3 行
      expect(fillTextOps.length).toBeGreaterThanOrEqual(2)
      for (const op of fillTextOps) {
        const line = op.args[0] as string
        expect(line.length * 8).toBeLessThanOrEqual(760)
      }
    } finally {
      restore()
    }
  })

  it('preserves blank paragraphs between text lines (TXT→PNG)', async () => {
    // S5 - 段间空行：'A\n\nB' 必须保留中间空行
    parserMocks.txtEncode.mockResolvedValueOnce(createTxtIntermediateDocument('A\n\nB'))
    const { restore, state } = installCanvasAndImageMocks()

    try {
      await convertRuntime({
        filename: 'blank.txt',
        sourceFormat: 'txt',
        targetFormat: 'png',
        buffer: createBuffer('blank-bytes'),
        mimeType: 'text/plain'
      })

      const canvas = getTxtImageCanvas(state)
      const fillTextOps = canvas.operations.filter(op => op.method === 'fillText')
      expect(fillTextOps).toHaveLength(3)
      const [op0, op1, op2] = fillTextOps
      expect(op0?.args[0]).toBe('A')
      expect(op1?.args[0]).toBe('')
      expect(op2?.args[0]).toBe('B')
      const y0 = op0?.args[2] as number
      const y1 = op1?.args[2] as number
      const y2 = op2?.args[2] as number
      expect(y1).toBeGreaterThan(y0)
      expect(y2).toBeGreaterThan(y1)
    } finally {
      restore()
    }
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

describe('Markdown conversion', () => {
  beforeEach(() => {
    mockImageWidth = 32
    mockImageHeight = 16
  })

  afterEach(() => {
    vi.restoreAllMocks()
    parserMocks.markdownEncode.mockReset()
    parserMocks.markdownDecodeToMarkdown.mockReset()
    parserMocks.htmlDecodeToHtml.mockReset()
    parserMocks.htmlEncode.mockReset()
    parserMocks.html2canvas.mockReset()
    jsPdfMocks.addImage.mockClear()
    jsPdfMocks.output.mockClear()
    jsPdfMocks.constructor.mockClear()
  })

  it('converts mocked Markdown to HTML via paginated layout', async () => {
    parserMocks.markdownEncode.mockResolvedValue(
      createIntermediateDocument([{ content: [], getContent: vi.fn().mockResolvedValue([]) }])
    )
    parserMocks.htmlDecodeToHtml.mockResolvedValue('<html><body><h1>Hello</h1></body></html>')

    const [result] = await convertRuntime({
      filename: 'doc.md',
      sourceFormat: 'markdown',
      targetFormat: 'html',
      buffer: createBuffer('# Hello')
    })

    expect(parserMocks.markdownEncode).toHaveBeenCalledOnce()
    expect(result?.filename).toBe('doc.html')
    expect(result?.mimeType).toBe('text/html;charset=utf-8')
    expect(result?.targetFormat).toBe('html')
    const html = textFromBuffer(result?.buffer ?? new ArrayBuffer(0))
    expect(html).toContain('<h1>Hello</h1>')
    expectPaginatedCssContract(html)
  })

  it('preserves original markdown when txtMode=raw', async () => {
    const source = '# Title\n\n- item one\n- item two\n'

    const [result] = await convertRuntime({
      filename: 'note.md',
      sourceFormat: 'markdown',
      targetFormat: 'txt',
      buffer: createBuffer(source),
      options: { markdown: { txtMode: 'raw' } }
    })

    expect(parserMocks.markdownEncode).not.toHaveBeenCalled()
    expect(result?.filename).toBe('note.txt')
    expect(result?.mimeType).toBe('text/plain;charset=utf-8')
    expect(result?.targetFormat).toBe('txt')
    expect(textFromBuffer(result?.buffer ?? new ArrayBuffer(0))).toBe(source)
  })

  it('extracts plain text when txtMode=plain (default)', async () => {
    // intermediateToTxtResult 走同步 extractIntermediateText，需要同步的 pages 数组
    // 与 node.text 字段才能提取出文本（详见 utils.ts collectIntermediateTextBlocks）
    parserMocks.markdownEncode.mockResolvedValue({
      pages: [{ text: 'Plain extracted text' }]
    } as unknown as IntermediateDocument)

    const [result] = await convertRuntime({
      filename: 'note.md',
      sourceFormat: 'markdown',
      targetFormat: 'txt',
      buffer: createBuffer('# Title\n\nbody')
    })

    expect(parserMocks.markdownEncode).toHaveBeenCalledOnce()
    expect(result?.filename).toBe('note.txt')
    expect(result?.targetFormat).toBe('txt')
    expect(textFromBuffer(result?.buffer ?? new ArrayBuffer(0))).toContain('Plain extracted text')
  })

  it('renders Markdown to PNG via html2canvas', async () => {
    const canvasMocks = installCanvasAndImageMocks()
    try {
      parserMocks.markdownEncode.mockResolvedValue(
        createIntermediateDocument([{ content: [], getContent: vi.fn().mockResolvedValue([]) }])
      )
      parserMocks.htmlDecodeToHtml.mockResolvedValue('<html><body><p>Snap</p></body></html>')
      const fakeCanvas = document.createElement('canvas') as HTMLCanvasElement
      ;(fakeCanvas as unknown as { width: number }).width = 800
      ;(fakeCanvas as unknown as { height: number }).height = 600
      parserMocks.html2canvas.mockResolvedValue(fakeCanvas)

      const [result] = await convertRuntime({
        filename: 'note.md',
        sourceFormat: 'markdown',
        targetFormat: 'png',
        buffer: createBuffer('# Snap')
      })

      expect(parserMocks.html2canvas).toHaveBeenCalledOnce()
      expect(result?.filename).toBe('note.png')
      expect(result?.mimeType).toBe('image/png')
      expect(result?.targetFormat).toBe('png')
      expect(canvasMocks.state.lastToBlobArgs.type).toBe('image/png')
    } finally {
      canvasMocks.restore()
    }
  })

  it('renders Markdown to PDF by addImage on jsPDF', async () => {
    const canvasMocks = installCanvasAndImageMocks()
    jsPdfMocks.addImage.mockClear()
    jsPdfMocks.output.mockClear()
    jsPdfMocks.constructor.mockClear()
    jsPdfMocks.constructor.mockImplementation(() => ({
      addImage: jsPdfMocks.addImage,
      output: jsPdfMocks.output
    }))
    jsPdfMocks.output.mockReturnValue(new Blob(['pdf'], { type: 'application/pdf' }))
    try {
      parserMocks.markdownEncode.mockResolvedValue(
        createIntermediateDocument([{ content: [], getContent: vi.fn().mockResolvedValue([]) }])
      )
      parserMocks.htmlDecodeToHtml.mockResolvedValue('<html><body><p>PDF</p></body></html>')
      const fakeCanvas = document.createElement('canvas') as HTMLCanvasElement
      ;(fakeCanvas as unknown as { width: number }).width = 800
      ;(fakeCanvas as unknown as { height: number }).height = 600
      parserMocks.html2canvas.mockResolvedValue(fakeCanvas)

      const [result] = await convertRuntime({
        filename: 'note.md',
        sourceFormat: 'markdown',
        targetFormat: 'pdf',
        buffer: createBuffer('# pdf')
      })

      expect(jsPdfMocks.addImage).toHaveBeenCalledOnce()
      expect(jsPdfMocks.output).toHaveBeenCalledWith('blob')
      expect(result?.filename).toBe('note.pdf')
      expect(result?.mimeType).toBe('application/pdf')
      expect(result?.targetFormat).toBe('pdf')
    } finally {
      canvasMocks.restore()
    }
  })

  it('converts HTML to Markdown via HtmlParser.encode + MarkdownParser.decodeToMarkdown', async () => {
    const intermediateDocument = createIntermediateDocument([
      { content: [], getContent: vi.fn().mockResolvedValue([]) }
    ])
    parserMocks.htmlEncode.mockResolvedValue({
      getIntermediateDocument: () => intermediateDocument
    })
    parserMocks.markdownDecodeToMarkdown.mockResolvedValue('# converted markdown\n')

    const [result] = await convertRuntime({
      filename: 'page.html',
      sourceFormat: 'html',
      targetFormat: 'md',
      buffer: createBuffer('<h1>converted markdown</h1>')
    })

    expect(parserMocks.htmlEncode).toHaveBeenCalledOnce()
    expect(parserMocks.markdownDecodeToMarkdown).toHaveBeenCalledWith(intermediateDocument)
    expect(result?.filename).toBe('page.md')
    expect(result?.mimeType).toBe('text/markdown;charset=utf-8')
    expect(result?.targetFormat).toBe('md')
    expect(textFromBuffer(result?.buffer ?? new ArrayBuffer(0))).toContain('# converted markdown')
  })
})
