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
import { EmptyOcrError } from '../lib/converter/image-adapters'
import { OcrRequiredError } from '../lib/converter/pdf-adapters'

describe('converter failure behavior', () => {
  it('throws when parser cannot produce intermediate document', async () => {
    await expect(convertPdfToHtml(new Uint8Array([1, 2, 3]))).rejects.toThrow(
      'PDF parser returned no intermediate document'
    )
  })

  it('exposes typed adapter error codes for OCR failures', () => {
    expect(new OcrRequiredError('scan.pdf')).toMatchObject({
      code: 'OCR_REQUIRED',
      name: 'OcrRequiredError'
    })
    expect(new EmptyOcrError()).toMatchObject({
      code: 'EMPTY_OCR',
      name: 'EmptyOcrError'
    })
  })
})
