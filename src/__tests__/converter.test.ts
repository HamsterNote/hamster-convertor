import { describe, expect, it } from 'vitest'
import { getSupportedTargets } from '../lib/converter'

describe('getSupportedTargets', () => {
  it('returns exact ordered list for pdf source', () => {
    expect(getSupportedTargets('pdf')).toEqual(['txt', 'png', 'jpg', 'webp', 'pdf', 'html'])
  })

  it('returns exact ordered list for txt source', () => {
    expect(getSupportedTargets('txt')).toEqual(['png', 'jpg', 'webp', 'html'])
  })

  it('returns exact ordered list for image source', () => {
    expect(getSupportedTargets('image')).toEqual(['pdf', 'txt', 'png', 'jpg', 'webp', 'html'])
  })

  it('returns exact ordered list for html source', () => {
    expect(getSupportedTargets('html')).toEqual(['txt', 'md'])
  })

  it('returns exact ordered list for docx source', () => {
    expect(getSupportedTargets('docx')).toEqual(['txt', 'html'])
  })

  it('returns exact ordered list for markdown source', () => {
    expect(getSupportedTargets('markdown')).toEqual(['html', 'txt', 'png', 'jpg', 'webp', 'pdf'])
  })
})
