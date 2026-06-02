declare module '@hamster-note/pdf-parser' {
  import { IntermediateDocument } from '@hamster-note/types'

  // ParserInput 与 @hamster-note/document-parser 保持一致
  export type ParserInput = ArrayBuffer | ArrayBufferView | Blob

  export type EncodeOptions = {
    maxPages?: number
    pageLoadTimeoutMs?: number
  }

  export type DecodeOptions = {
    fonts?: unknown
  }

  export type ProgressStage =
    | 'encode:start'
    | 'encode:complete'
    | 'decode:start'
    | 'decode:complete'

  export type ProgressReport = {
    stage: ProgressStage
    current: number
    total: number
  }

  export type ProgressReporter = (report: ProgressReport) => void

  export class PdfParser {
    static readonly exts: readonly ['pdf']

    // encode 不再返回 undefined
    static encode(
      fileOrBuffer: ParserInput,
      options?: EncodeOptions,
      onProgress?: ProgressReporter
    ): Promise<IntermediateDocument>

    static toArrayBuffer(fileOrBuffer: ParserInput): Promise<ArrayBuffer>

    // decode 不再返回 undefined
    static decode(
      intermediateDocument: IntermediateDocument,
      options?: DecodeOptions,
      onProgress?: ProgressReporter
    ): Promise<ParserInput>

    encode(input: ParserInput): Promise<IntermediateDocument>

    decode(intermediateDocument: IntermediateDocument): Promise<ParserInput>
  }

  export { PdfParser }
}
