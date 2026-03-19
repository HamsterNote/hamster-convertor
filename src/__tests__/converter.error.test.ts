import { describe, expect, it, vi } from 'vitest'

vi.mock('@hamster-note/pdf-parser', () => ({
  PdfParser: {
    encode: vi.fn().mockResolvedValue(undefined)
  }
}))

vi.mock('@hamster-note/html-parser', () => ({
  HtmlParser: {
    decodeToHtml: vi.fn().mockResolvedValue('<html></html>')
  }
}))

import { convertPdfToHtml } from '../lib/converter'

describe('converter failure behavior', () => {
  it('throws when parser cannot produce intermediate document', async () => {
    await expect(convertPdfToHtml(new Uint8Array([1, 2, 3]))).rejects.toThrow(
      'PDF parser returned no intermediate document'
    )
  })
})
