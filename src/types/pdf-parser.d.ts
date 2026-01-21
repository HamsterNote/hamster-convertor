declare module '@system-ui-js/pdf-parser' {
  import { IntermediateDocument } from '@hamster-note/types'

  export type ParserInput = File | ArrayBuffer

  export class PdfParser {
    static readonly exts: readonly ['pdf']

    static encode(
      fileOrBuffer: ParserInput
    ): Promise<IntermediateDocument | undefined>

    static toArrayBuffer(fileOrBuffer: ParserInput): Promise<ArrayBuffer>

    static decode(
      intermediateDocument: IntermediateDocument
    ): Promise<File | ArrayBuffer | undefined>

    encode(input: ParserInput): Promise<IntermediateDocument>

    decode(
      intermediateDocument: IntermediateDocument
    ): Promise<File | ArrayBuffer | undefined>
  }

  export { PdfParser }
}
