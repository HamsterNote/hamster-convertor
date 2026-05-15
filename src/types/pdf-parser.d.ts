declare module '@hamster-note/pdf-parser' {
  import { IntermediateDocument } from '@hamster-note/types'

  export type ParserInput = File | ArrayBuffer

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

    static encode(
      fileOrBuffer: ParserInput,
      options?: EncodeOptions,
      onProgress?: ProgressReporter
    ): Promise<IntermediateDocument | undefined>

    static toArrayBuffer(fileOrBuffer: ParserInput): Promise<ArrayBuffer>

    static decode(
      intermediateDocument: IntermediateDocument,
      options?: DecodeOptions,
      onProgress?: ProgressReporter
    ): Promise<File | ArrayBuffer | undefined>

    encode(input: ParserInput): Promise<IntermediateDocument>

    decode(intermediateDocument: IntermediateDocument): Promise<File | ArrayBuffer | undefined>
  }

  export { PdfParser }
}
