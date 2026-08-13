/**
 * @hamster-note/pdf-parser 类型声明
 *
 * 仅用于类型推断，不引入运行时依赖
 */
declare module '@hamster-note/pdf-parser' {
  export type ParserInput = ArrayBuffer | ArrayBufferView | Blob

  export type EncodeOptions = {
    maxPages?: number
    pageLoadTimeoutMs?: number
  }

  export type DecodeOptions = {
    fonts?: unknown
  }

  export class PdfParser {
    static readonly exts: readonly ['pdf']

    static encode(
      fileOrBuffer: ParserInput,
      options?: EncodeOptions,
      onProgress?: (report: { stage: string; current: number; total: number }) => void
    ): Promise<Record<string, unknown>>

    static decode(
      intermediateDocument: Record<string, unknown>,
      options?: DecodeOptions,
      onProgress?: (report: { stage: string; current: number; total: number }) => void
    ): Promise<ParserInput>
  }
}
