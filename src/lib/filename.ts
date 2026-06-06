/**
 * Filename rendering utilities.
 * truncateMiddle() - ellipsizes long filenames while preserving the tail.
 */

export type TruncateMiddleOptions = {
  /** Maximum pixel width allowed. Default 200. */
  maxWidthPx?: number
  /** Number of characters to preserve at the end. Default 6. */
  tailLen?: number
  /** CSS font string used for canvas measurement. */
  font?: string
  /** Ellipsis string inserted in the middle. Default '...'. */
  ellipsis?: string
}

const DEFAULT_MAX_WIDTH_PX = 200
const DEFAULT_TAIL_LEN = 6
const DEFAULT_FONT = '14px ui-sans-serif, -apple-system, sans-serif'
const DEFAULT_ELLIPSIS = '...'
/** Average px-per-char used when canvas context is unavailable (SSR / test fallback). */
const FALLBACK_PX_PER_CHAR = 7.5

const getCanvasContext = (): CanvasRenderingContext2D | null => {
  try {
    const canvas = document.createElement('canvas')
    return canvas.getContext('2d')
  } catch {
    return null
  }
}

/** Character-budget heuristic used when canvas measurement is unavailable. */
const truncateByCharBudget = (
  fileName: string,
  maxWidthPx: number,
  tailLen: number,
  ellipsis: string,
  tail: string
): string => {
  const charBudget = Math.floor(maxWidthPx / FALLBACK_PX_PER_CHAR)
  if (charBudget >= fileName.length) return fileName

  const headBudget = charBudget - tailLen - ellipsis.length
  if (headBudget <= 0) return ellipsis + tail

  return fileName.slice(0, headBudget) + ellipsis + tail
}

/** Binary search for the longest prefix of fileName whose measured width fits targetHeadWidth. */
const findLongestFittingHead = (
  ctx: CanvasRenderingContext2D,
  fileName: string,
  maxHeadLen: number,
  targetHeadWidth: number
): string => {
  let lo = 0
  let hi = maxHeadLen
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (ctx.measureText(fileName.slice(0, mid)).width <= targetHeadWidth) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  return fileName.slice(0, lo)
}

export const truncateMiddle = (fileName: string, options?: TruncateMiddleOptions): string => {
  if (typeof fileName !== 'string' || fileName === '') return ''

  const maxWidthPx = options?.maxWidthPx ?? DEFAULT_MAX_WIDTH_PX
  const tailLen = options?.tailLen ?? DEFAULT_TAIL_LEN
  const font = options?.font ?? DEFAULT_FONT
  const ellipsis = options?.ellipsis ?? DEFAULT_ELLIPSIS

  if (fileName.length <= tailLen + ellipsis.length) return fileName

  const tail = fileName.slice(-tailLen)
  const ctx = getCanvasContext()

  if (!ctx) return truncateByCharBudget(fileName, maxWidthPx, tailLen, ellipsis, tail)

  try {
    ctx.font = font
    if (ctx.measureText(fileName).width <= maxWidthPx) return fileName

    const suffix = ellipsis + tail
    const targetHeadWidth = maxWidthPx - ctx.measureText(suffix).width
    if (targetHeadWidth <= 0) return suffix

    const head = findLongestFittingHead(ctx, fileName, fileName.length - tailLen, targetHeadWidth)
    return head + suffix
  } catch {
    return truncateByCharBudget(fileName, maxWidthPx, tailLen, ellipsis, tail)
  }
}
