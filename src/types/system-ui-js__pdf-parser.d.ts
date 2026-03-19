declare module '@hamster-note/pdf-parser' {
  import type { IntermediateDocument } from '@hamster-note/types'

  export class PdfParser {
    static readonly exts: readonly ['pdf']
    static encode(input: File | ArrayBuffer): Promise<IntermediateDocument | undefined>
  }
}
