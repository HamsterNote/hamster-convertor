import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { truncateMiddle } from './filename'

describe('truncateMiddle', () => {
  let measureTextMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    measureTextMock = vi.fn((text: string) => ({ width: text.length * 8 }))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((type: string) => {
      if (type !== '2d') return null
      return {
        font: '',
        measureText: measureTextMock
      } as unknown as CanvasRenderingContext2D
    }) as typeof HTMLCanvasElement.prototype.getContext)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns empty string for non-string input', () => {
    expect(truncateMiddle(undefined as unknown as string)).toBe('')
    expect(truncateMiddle(null as unknown as string)).toBe('')
  })

  it('returns original when fileName too short for truncation', () => {
    // tailLen=6, ellipsis='...' (len 3) => threshold is 9 chars
    expect(truncateMiddle('short')).toBe('short')
    expect(truncateMiddle('123456789')).toBe('123456789')
  })

  it('returns original when measured width fits within maxWidthPx', () => {
    measureTextMock.mockImplementation((text: string) => ({
      width: text.length * 2 // very narrow per char
    }))
    const name = 'a-moderately-long-filename.txt'
    const result = truncateMiddle(name, { maxWidthPx: 500 })
    expect(result).toBe(name)
  })

  it('middle-ellipsizes long filenames and preserves last 6 chars', () => {
    const longName = 'this-is-a-very-long-document-filename-that-should-be-truncated.pdf'
    const result = truncateMiddle(longName, { maxWidthPx: 200 })

    // Contains ellipsis
    expect(result).toContain('...')
    // Preserves last 6 chars exactly
    expect(result.endsWith(longName.slice(-6))).toBe(true)
    // Result is shorter than input
    expect(result.length).toBeLessThan(longName.length)
  })

  it('falls back safely when canvas getContext returns null', () => {
    // Override to return null for this test
    vi.restoreAllMocks()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (() => null) as typeof HTMLCanvasElement.prototype.getContext
    )

    const longName = 'another-extremely-long-filename-to-force-fallback-behavior.pdf'
    const result = truncateMiddle(longName, { maxWidthPx: 200 })

    expect(result).toContain('...')
    expect(result.endsWith(longName.slice(-6))).toBe(true)
  })
})
