/**
 * @hamster-note/document-parser 类型声明
 *
 * 仅用于类型推断，不引入运行时依赖
 */
declare module '@hamster-note/document-parser' {
  export type ParserInput = ArrayBuffer | ArrayBufferView | Blob

  export class DocumentParser {
    static readonly exts: readonly string[]

    static encode(fileOrBuffer: ParserInput): Promise<Record<string, unknown>>

    static decode(intermediateDocument: Record<string, unknown>): Promise<ParserInput>
  }
}
