import { describe, expect, it } from 'vitest'
import { rewritePdfjsImport } from '../lib/pdfjs-import-rewrite'

const pdfjsImport = 'const pdfjs = await import("pdfjs-dist")'
const adaptersPdfjsImport = "const pdfjs = await import('pdfjs-dist')"
const wrappedPdfjsImport = 'import("/src/lib/pdfjs-wrapper.ts")'

describe('parser runtime PDF.js import rewriting', () => {
  it('rewrites the runtime adapters import so production loads CMap defaults', () => {
    const result = rewritePdfjsImport(
      adaptersPdfjsImport,
      '/workspace/packages/parser-runtime/src/conversion/adapters.ts'
    )

    expect(result).toContain(wrappedPdfjsImport)
  })

  it('continues to rewrite imports inside pdf-parser', () => {
    const result = rewritePdfjsImport(
      pdfjsImport,
      '/workspace/node_modules/@hamster-note/pdf-parser/dist/PdfParser.js'
    )

    expect(result).toContain(wrappedPdfjsImport)
  })

  it('leaves unrelated PDF.js consumers unchanged', () => {
    const result = rewritePdfjsImport(pdfjsImport, '/workspace/src/unrelated.ts')

    expect(result).toBeNull()
  })
})
