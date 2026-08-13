import type { IntermediateDocument } from '@hamster-note/types'

export class ImageParser {
  static readonly exts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] as const

  static async encode(_input: ArrayBuffer): Promise<IntermediateDocument> {
    return { outline: undefined, text: 'mock ocr text' }
  }
}
