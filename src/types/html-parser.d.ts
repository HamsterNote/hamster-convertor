declare module '@hamster-note/html-parser' {
  import { IntermediateDocument } from '@hamster-note/types'

  export interface RenderOptions {
    scale?: number
    views?: ('TEXT' | 'THUMBNAIL')[]
  }

  export class HtmlPage {
    constructor(intermediateDocument: IntermediateDocument)
    getNumber(): number
    getSize(scale: number): [number, number]
    getPureText(): string
    render(container: HTMLDivElement, options?: RenderOptions): Promise<void>
  }

  export class HtmlDocument {
    constructor(intermediateDocument: IntermediateDocument)
    getPages(): Promise<HtmlPage[]>
    getPage(pageNumber: number): Promise<HtmlPage | undefined>
    getOutline(): Promise<IntermediateDocument['outline']>
    getCover(): Promise<HTMLCanvasElement | HTMLImageElement>
    getTitle(): string
    getId(): string
    getIntermediateDocument(): IntermediateDocument
  }

  export class HtmlParser {
    static readonly exts: readonly ['html']
    static readonly ext: 'html'

    static encode(fileOrBuffer: File | ArrayBuffer): Promise<HtmlDocument>

    static decodeToHtml(intermediateDocument: IntermediateDocument): Promise<string>

    static decode(intermediateDocument: IntermediateDocument): Promise<File | ArrayBuffer>

    encode(input: File | ArrayBuffer): Promise<IntermediateDocument>

    decode(intermediateDocument: IntermediateDocument): Promise<File | ArrayBuffer | undefined>
  }

  export { HtmlParser }
}
