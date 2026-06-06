/**
 * @hamster-note/image-parser 类型声明
 *
 * 仅用于类型推断，不引入运行时依赖
 */
declare module '@hamster-note/image-parser' {
  export type ParserInput = ArrayBuffer | ArrayBufferView | Blob

  export class ImageParser {
    static readonly exts: readonly ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']

    static encode(fileOrBuffer: ParserInput): Promise<Record<string, unknown>>

    static decode(intermediateDocument: Record<string, unknown>): Promise<ParserInput>
  }
}
