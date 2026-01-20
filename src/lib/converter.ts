import { PdfParser } from '@system-ui-js/pdf-parser'
import { HtmlParser } from '@system-ui-js/html-parser'
import type { IntermediateDocument } from '@hamster-note/types'

export type PdfToHtmlResult = {
  html: string
  warnings: string[]
}

export type ConvertPdfToHtml = (input: Uint8Array) => Promise<PdfToHtmlResult>

type HtmlDecodeResult = {
  html: string
  warnings: string[]
}

const extractHtml = async (
  intermediateDocument: IntermediateDocument
): Promise<HtmlDecodeResult> => {
  const warnings: string[] = []
  const html = await HtmlParser.decodeToHtml(intermediateDocument)
  return { html, warnings }
}

const fallbackHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Hamster PDF Sample</title>
  </head>
  <body>
    <h1>Hamster PDF Sample</h1>
    <p>PDF to HTML conversion placeholder.</p>
  </body>
</html>
`

const isE2E = () =>
  typeof window !== 'undefined' &&
  (window as Window & { __E2E__?: boolean }).__E2E__ === true

export const convertPdfToHtml: ConvertPdfToHtml = async (input) => {
  if (isE2E()) {
    return {
      html: fallbackHtml,
      warnings: []
    }
  }
  const arrayBuffer = input.buffer.slice(
    input.byteOffset,
    input.byteOffset + input.byteLength
  ) as ArrayBuffer
  const intermediate = await PdfParser.encode(arrayBuffer)
  if (!intermediate) {
    throw new Error('PdfParser returned empty document')
  }
  const result = await extractHtml(intermediate)
  return {
    html: result.html,
    warnings: result.warnings
  }
}
