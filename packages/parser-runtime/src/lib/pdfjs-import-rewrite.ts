export const rewritePdfjsImport = (code: string, id: string): string | null => {
  const isPdfParserModule = id.includes('@hamster-note/pdf-parser') || id.includes('/PdfParser/')
  const isRuntimeAdapter = id.includes('packages/parser-runtime/src/conversion/adapters')
  const pdfjsImportPattern = /import\((['"])pdfjs-dist\1\)/
  if ((!isPdfParserModule && !isRuntimeAdapter) || !pdfjsImportPattern.test(code)) {
    return null
  }

  return code.replace(pdfjsImportPattern, 'import("/src/lib/pdfjs-wrapper.ts")')
}
