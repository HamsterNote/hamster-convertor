import type { IntermediateDocument } from '@hamster-note/types'

export class TxtParser {
  static readonly exts = ['txt'] as const

  static async encode(_input: ArrayBuffer): Promise<IntermediateDocument> {
    return { outline: undefined, text: 'mock txt content' }
  }
}
