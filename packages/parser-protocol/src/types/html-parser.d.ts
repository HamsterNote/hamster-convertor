/**
 * @hamster-note/html-parser 类型声明
 *
 * 仅用于类型推断，不引入运行时依赖
 */
declare module '@hamster-note/html-parser' {
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
    }
  }

  export class HtmlParser {
    static readonly exts: readonly ['html']

    static encode(fileOrBuffer: ParserInput): Promise<Record<string, unknown>>

    static decode(
      intermediateDocument: Record<string, unknown>,
      options?: DecodeOptions
    ): Promise<File | ArrayBuffer>
  }
}
