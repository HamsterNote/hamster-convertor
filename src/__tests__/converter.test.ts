import { describe, expect, it } from 'vitest'
import { getSupportedTargets } from '../lib/converter'

describe('getSupportedTargets', () => {
  it('returns exact ordered list for pdf source', () => {
    expect(getSupportedTargets('pdf')).toEqual(['txt', 'png', 'jpg', 'webp', 'pdf'])
  })

  it('returns exact ordered list for txt source', () => {
    expect(getSupportedTargets('txt')).toEqual(['png'])
  })

  it('returns exact ordered list for image source', () => {
    expect(getSupportedTargets('image')).toEqual(['pdf', 'txt', 'png', 'jpg', 'webp'])
  })
})
