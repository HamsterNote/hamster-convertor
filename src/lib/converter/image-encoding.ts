export type ConcreteImageTarget = 'png' | 'jpg' | 'webp'

type ImageConfig = {
  extension: string
  mimeType: string
  quality?: number
}

const IMAGE_CONFIGS: Record<ConcreteImageTarget, ImageConfig> = {
  png: {
    extension: '.png',
    mimeType: 'image/png'
  },
  jpg: {
    extension: '.jpg',
    mimeType: 'image/jpeg',
    quality: 0.92
  },
  webp: {
    extension: '.webp',
    mimeType: 'image/webp',
    quality: 0.92
  }
}

export type EncodeCanvasResult = {
  blob: Blob
  extension: string
  mimeType: string
}

export const encodeCanvasToImage = (
  canvas: HTMLCanvasElement,
  target: ConcreteImageTarget
): Promise<EncodeCanvasResult> => {
  const config = IMAGE_CONFIGS[target]

  const canvasToEncode = target === 'jpg' ? createWhiteBackgroundCanvas(canvas) : canvas

  return new Promise((resolve, reject) => {
    canvasToEncode.toBlob(
      blob => {
        if (blob === null) {
          reject(new Error(`Failed to encode canvas as ${config.mimeType}`))
          return
        }
        resolve({ blob, extension: config.extension, mimeType: config.mimeType })
      },
      config.mimeType,
      config.quality
    )
  })
}

const createWhiteBackgroundCanvas = (sourceCanvas: HTMLCanvasElement): HTMLCanvasElement => {
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = sourceCanvas.width
  tempCanvas.height = sourceCanvas.height

  const ctx = tempCanvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to get 2d context for temp canvas')
  }

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height)
  ctx.drawImage(sourceCanvas, 0, 0)

  return tempCanvas
}
