import type { IntermediateDocument } from '@hamster-note/types'

export class PdfParser {
  static readonly exts = ['pdf'] as const

  static async encode(_input: ArrayBuffer): Promise<IntermediateDocument> {
    return { outline: undefined }
  }
}
