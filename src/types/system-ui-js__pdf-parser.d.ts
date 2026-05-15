declare module '@hamster-note/pdf-parser' {
  import type { IntermediateDocument } from '@hamster-note/types'

  export type EncodeOptions = {
    maxPages?: number
    pageLoadTimeoutMs?: number
  }

  export type ProgressReport = {
    stage: 'encode:start' | 'encode:complete' | 'decode:start' | 'decode:complete'
    current: number
    total: number
  }

  export class PdfParser {
    static readonly exts: readonly ['pdf']
    static encode(
      input: File | ArrayBuffer,
      options?: EncodeOptions,
      onProgress?: (report: ProgressReport) => void
    ): Promise<IntermediateDocument | undefined>
  }
}
