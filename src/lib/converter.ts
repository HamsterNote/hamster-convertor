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

type PdfParserModule = {
  PdfParser: {
    encode: (input: ArrayBuffer) => Promise<IntermediateDocument | undefined>
  }
}

type HtmlParserModule = {
  HtmlParser: {
    decodeToHtml: (intermediateDocument: IntermediateDocument) => Promise<string>
  }
}

const PDF_PARSER_MODULE = '@system-ui-js/pdf-parser'
const HTML_PARSER_MODULE = '@system-ui-js/html-parser'
const loadParserModules = async (): Promise<[PdfParserModule, HtmlParserModule]> => {
  const [pdfParserModule, htmlParserModule] = await Promise.all([
    import(PDF_PARSER_MODULE),
    import(HTML_PARSER_MODULE)
  ])
  return [pdfParserModule as PdfParserModule, htmlParserModule as HtmlParserModule]
}

const extractHtml = async ({
  HtmlParser,
  intermediateDocument
}: {
  HtmlParser: HtmlParserModule['HtmlParser']
  intermediateDocument: IntermediateDocument
}): Promise<HtmlDecodeResult> => {
  const warnings: string[] = []
  const html = await HtmlParser.decodeToHtml(intermediateDocument)
  return { html, warnings }
}

const decodeByParserModules = async (input: Uint8Array): Promise<PdfToHtmlResult> => {
  const [pdfParserModule, htmlParserModule] = await loadParserModules()
  const { PdfParser } = pdfParserModule
  const { HtmlParser } = htmlParserModule

  const arrayBuffer = input.buffer.slice(
    input.byteOffset,
    input.byteOffset + input.byteLength
  ) as ArrayBuffer

  const intermediate = await PdfParser.encode(arrayBuffer)
  if (!intermediate) {
    throw new Error('PDF parser returned no intermediate document')
  }

  return extractHtml({ HtmlParser, intermediateDocument: intermediate })
}

const fallbackHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Hamster PDF Sample</title>
  </head>
  <body>
    <style>
      .hamster-note-document { position: relative; display: block; contain: layout style size; }
      .hamster-note-document .hamster-note-page { position: relative; overflow: hidden; background-repeat: no-repeat; background-position: top center; background-size: contain; }
      .hamster-note-document .hamster-note-text { position: absolute; white-space: pre; transform-origin: 0 0; }
    </style>
    <div class="hamster-note-document">Hamster PDF Sample</div>
  </body>
</html>
`

const isE2E = () =>
  typeof window !== 'undefined' && (window as Window & { __E2E__?: boolean }).__E2E__ === true

export const convertPdfToHtml: ConvertPdfToHtml = async input => {
  if (isE2E()) {
    return {
      html: fallbackHtml,
      warnings: []
    }
  }

  return decodeByParserModules(input)
}
