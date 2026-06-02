declare module '@hamster-note/html-parser' {
  import { IntermediateDocument, Number2 } from '@hamster-note/types'

  export type ParserInput = ArrayBuffer | ArrayBufferView | Blob

  export type DecodeOptions = {
    textControl?: {
      fontSize?: number
      lineHeight?: number
      fontWeight?: number
      italic?: boolean
      color?: string
      fontFamily?: string
      vertical?: string
      dir?: string
    }
    background?: {
      includeBackground?: boolean
      backgroundQuality?: number
      excludeTextFromBackground?: boolean
    }
  }

  export interface RenderOptions {
    scale?: number
    views?: ('TEXT' | 'THUMBNAIL')[]
  }

  export type IframeHostDocument = Pick<Document, 'createElement' | 'body' | 'documentElement'>

  export function setIframeHostDocument(documentOverride: IframeHostDocument | null): void

  export class HtmlPage {
    constructor(intermediatePage: IntermediateDocument)
    getNumber(): number
    getSize(scale: number): Number2
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

  export class HtmlParser extends DocumentParser {
    static readonly exts: readonly ['html']
    static readonly ext: 'html'

    static encode(fileOrBuffer: ParserInput): Promise<HtmlDocument>

    static decodeToHtml(
      intermediateDocument: IntermediateDocument,
      options?: DecodeOptions
    ): Promise<string>

    static decode(
      intermediateDocument: IntermediateDocument,
      options?: DecodeOptions
    ): Promise<File | ArrayBuffer>

    encode(input: ParserInput): Promise<IntermediateDocument>

    decode(intermediateDocument: IntermediateDocument): Promise<ParserInput>
  }

  export { HtmlParser }
}
