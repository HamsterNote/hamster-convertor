import { PDFDocument } from 'pdf-lib'

/**
 * Normalize selected page numbers: filter valid, deduplicate, sort.
 * If selectedPages is undefined, returns all pages (1..pageCount).
 * If selectedPages is defined but empty after filtering, throws.
 */
export const getSelectedPdfPageNumbers = (
  pageCount: number,
  selectedPages?: number[]
): number[] => {
  if (selectedPages === undefined) {
    return Array.from({ length: pageCount }, (_, i) => i + 1)
  }

  const valid = selectedPages.filter(
    (p): p is number => Number.isInteger(p) && p >= 1 && p <= pageCount
  )
  const deduped = [...new Set(valid)].sort((a, b) => a - b)

  if (deduped.length === 0) {
    throw new Error('No pages selected')
  }

  return deduped
}

/**
 * Extract specific pages from a PDF ArrayBuffer using pdf-lib.
 * Returns a new ArrayBuffer containing only the selected pages.
 */
export const extractPdfPages = async (
  arrayBuffer: ArrayBuffer,
  selectedPages: number[]
): Promise<ArrayBuffer> => {
  const srcDoc = await PDFDocument.load(arrayBuffer)
  const newDoc = await PDFDocument.create()

  const indices = selectedPages.map(p => p - 1)
  const pages = await newDoc.copyPages(srcDoc, indices)
  for (const page of pages) {
    newDoc.addPage(page)
  }

  const bytes = await newDoc.save()
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
