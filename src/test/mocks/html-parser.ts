import type { IntermediateDocument } from '@hamster-note/types'

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
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

class MockHtmlPage {
  private number: number
  private pureText: string

  constructor(pageNumber: number, pureText: string) {
    this.number = pageNumber
    this.pureText = pureText
  }

  getNumber(): number {
    return this.number
  }

  // getSize 返回类型从 [number, number] 改为 Number2 ({x, y})
  getSize(_scale: number): { x: number; y: number } {
    return { x: 595, y: 842 }
  }

  getPureText(): string {
    return this.pureText
  }
}

class MockHtmlDocument {
  private pages: MockHtmlPage[]

  constructor(pageTexts: string[]) {
    this.pages = pageTexts.map((text, index) => new MockHtmlPage(index + 1, text))
  }

  getPages(): Promise<MockHtmlPage[]> {
    return Promise.resolve(this.pages)
  }

  getPage(pageNumber: number): Promise<MockHtmlPage | undefined> {
    return Promise.resolve(this.pages.find(p => p.getNumber() === pageNumber))
  }

  getOutline(): Promise<IntermediateDocument['outline']> {
    return Promise.resolve(undefined)
  }

  getCover(): Promise<HTMLCanvasElement | HTMLImageElement> {
    return Promise.resolve({} as HTMLCanvasElement)
  }

  getTitle(): string {
    return 'Sample Document'
  }

  getId(): string {
    return 'mock-html-doc-id'
  }

  getIntermediateDocument(): IntermediateDocument {
    return { outline: undefined }
  }
}

export class HtmlParser {
  static readonly exts = ['html'] as const
  static readonly ext = 'html' as const

  static async encode(_input: File | ArrayBuffer): Promise<MockHtmlDocument> {
    const pageTexts = ['Page 1: Hamster Note Sample', 'Page 2: Nested Content with Script']
    return new MockHtmlDocument(pageTexts)
  }

  static async decode(
    _intermediateDocument: IntermediateDocument,
    _options?: unknown
  ): Promise<File> {
    const file = new File([html], 'converted.html', { type: 'text/html' })
    return file
  }

  static async decodeToHtml(
    _intermediateDocument: IntermediateDocument,
    _options?: unknown
  ): Promise<string> {
    return html
  }
}
