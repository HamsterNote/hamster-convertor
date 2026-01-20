import { describe, expect, it } from 'vitest'
import { loadPdfFixture } from '../test/fixtures'
import { normalizeHtml } from '../test/normalizeHtml'
import { convertPdfToHtml } from '../lib/converter'

const expectedText = 'Hamster PDF Sample'

describe('pdf to html integration', () => {
  it('converts fixture pdf into stable html', async () => {
    const pdfBuffer = await loadPdfFixture('sample.pdf')
    const result = await convertPdfToHtml(pdfBuffer)

    expect(result.warnings).toHaveLength(0)

    const normalized = normalizeHtml(result.html)
    expect(normalized.text).toContain(expectedText)
    expect(normalized.text).toMatchSnapshot()
  })

  it('is deterministic for the same input', async () => {
    const pdfBuffer = await loadPdfFixture('sample.pdf')
    const first = await convertPdfToHtml(pdfBuffer)
    const second = await convertPdfToHtml(pdfBuffer)

    expect(first.html).toBe(second.html)
  })
})
