import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockTxtParserEncode = vi.fn()
vi.mock('@hamster-note/txt-parser', () => ({
  TxtParser: {
    encode: mockTxtParserEncode
  }
}))

import { convertTxtToImage } from '../lib/converter/txt-adapter'
import type { ConversionRequest } from '../lib/converter'

type MockCanvasRenderingContext2D = {
  fillStyle: string
  font: string
  fillRect: (x: number, y: number, w: number, h: number) => void
  fillText: (text: string, x: number, y: number) => void
  measureText: (text: string) => { width: number }
}

type MockCanvasElement = {
  width: number
  height: number
  getContext: (type: string) => MockCanvasRenderingContext2D | null
  toBlob: (callback: (blob: Blob | null) => void, type?: string, quality?: number) => void
}

const createImageRequest = (
  fileName = 'document.txt',
  content = 'line1\nline2\nline3'
): ConversionRequest => {
  const file = new File([content], fileName, { type: 'text/plain' }) as File & {
    text: () => Promise<string>
  }
  file.text = async () => content
  return {
    file,
    source: 'txt',
    target: 'png'
  }
}

describe('txt to image adapter', () => {
  let mockCtx: MockCanvasRenderingContext2D
  let mockCanvas: MockCanvasElement

  beforeEach(() => {
    vi.clearAllMocks()

    mockCtx = {
      fillStyle: '',
      font: '',
      fillRect: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn((text: string) => ({ width: text.length * 8 }))
    }

    mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => mockCtx),
      toBlob: vi.fn((callback: (blob: Blob | null) => void) => {
        callback(new Blob(['png'], { type: 'image/png' }))
      })
    }

    vi.stubGlobal('HTMLCanvasElement', {
      prototype: {
        getContext: vi.fn(() => mockCtx)
      },
      prototype2: mockCanvas
    } as unknown as typeof HTMLCanvasElement)

    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        const canvas = { ...mockCanvas }
        return canvas as unknown as HTMLCanvasElement
      }
      return originalCreateElement(tagName)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders multiline TXT to PNG', async () => {
    mockTxtParserEncode.mockResolvedValue({
      outline: undefined,
      text: 'line1\nline2\nline3'
    })

    const [result] = await convertTxtToImage(createImageRequest())

    expect(result).toMatchObject({
      filename: 'document.png',
      mimeType: 'image/png',
      targetFormat: 'png'
    })
    expect(mockCtx.fillText).toHaveBeenCalled()
  })

  it('falls back to direct text reading when parser fails', async () => {
    mockTxtParserEncode.mockRejectedValue(new Error('Parser error'))

    const req = createImageRequest()
    req.file.text = async () => 'fallback line1\nfallback line2'

    const [result] = await convertTxtToImage(req)

    expect(result).toMatchObject({
      filename: 'document.png',
      mimeType: 'image/png',
      targetFormat: 'png'
    })
    expect(result.warnings).toContain('Used fallback text reader')
  })

  it('fails when canvas cannot produce a PNG Blob', async () => {
    mockTxtParserEncode.mockResolvedValue({
      outline: undefined,
      text: 'line1'
    })
    mockCanvas.toBlob = vi.fn((callback: (blob: Blob | null) => void) => {
      callback(null)
    })

    await expect(convertTxtToImage(createImageRequest())).rejects.toThrow('Canvas toBlob failed')
  })
})
