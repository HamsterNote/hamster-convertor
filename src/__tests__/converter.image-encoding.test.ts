import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { encodeCanvasToImage } from '../lib/converter/image-encoding'

const createMockContext = (): CanvasRenderingContext2D =>
  ({
    fillStyle: '',
    fillRect: vi.fn(),
    drawImage: vi.fn()
  }) as unknown as CanvasRenderingContext2D

describe('encodeCanvasToImage', () => {
  let mockCanvas: HTMLCanvasElement
  let originalCreateElement: typeof document.createElement

  beforeEach(() => {
    mockCanvas = document.createElement('canvas')
    mockCanvas.width = 100
    mockCanvas.height = 100

    originalCreateElement = document.createElement

    HTMLCanvasElement.prototype.toBlob = vi.fn(callback => {
      callback(new Blob(['test'], { type: 'image/png' }))
    }) as HTMLCanvasElement['toBlob']

    HTMLCanvasElement.prototype.getContext = vi.fn((_contextId: string) =>
      createMockContext()
    ) as unknown as HTMLCanvasElement['getContext']
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.createElement = originalCreateElement
  })

  it('encodes canvas to PNG with correct mime type', async () => {
    const result = await encodeCanvasToImage(mockCanvas, 'png')

    expect(result.extension).toBe('.png')
    expect(result.mimeType).toBe('image/png')
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      'image/png',
      undefined
    )
  })

  it('encodes canvas to JPG with quality and white background', async () => {
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = mockCanvas.width
    tempCanvas.height = mockCanvas.height
    const tempCtx = createMockContext()

    vi.spyOn(document, 'createElement').mockReturnValue(tempCanvas)
    vi.spyOn(tempCanvas, 'getContext').mockReturnValue(tempCtx)

    const result = await encodeCanvasToImage(mockCanvas, 'jpg')

    expect(result.extension).toBe('.jpg')
    expect(result.mimeType).toBe('image/jpeg')
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      'image/jpeg',
      0.92
    )
    expect(tempCtx.fillStyle).toBe('#ffffff')
    expect(tempCtx.fillRect).toHaveBeenCalledWith(0, 0, tempCanvas.width, tempCanvas.height)
    expect(tempCtx.drawImage).toHaveBeenCalledWith(mockCanvas, 0, 0)
  })

  it('encodes canvas to WEBP with quality', async () => {
    const result = await encodeCanvasToImage(mockCanvas, 'webp')

    expect(result.extension).toBe('.webp')
    expect(result.mimeType).toBe('image/webp')
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      'image/webp',
      0.92
    )
  })

  it('throws error when toBlob returns null', async () => {
    HTMLCanvasElement.prototype.toBlob = vi.fn(callback => {
      callback(null)
    }) as HTMLCanvasElement['toBlob']

    await expect(encodeCanvasToImage(mockCanvas, 'png')).rejects.toThrow(
      'Failed to encode canvas as image/png'
    )
  })

  it('throws error when toBlob returns null for JPG', async () => {
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = mockCanvas.width
    tempCanvas.height = mockCanvas.height
    const tempCtx = createMockContext()

    vi.spyOn(document, 'createElement').mockReturnValue(tempCanvas)
    vi.spyOn(tempCanvas, 'getContext').mockReturnValue(tempCtx)

    HTMLCanvasElement.prototype.toBlob = vi.fn(callback => {
      callback(null)
    }) as HTMLCanvasElement['toBlob']

    await expect(encodeCanvasToImage(mockCanvas, 'jpg')).rejects.toThrow(
      'Failed to encode canvas as image/jpeg'
    )
  })
})
