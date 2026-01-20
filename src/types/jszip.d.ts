declare module 'jszip' {
  export type JSZipFileData =
    | string
    | ArrayBuffer
    | Uint8Array
    | Blob
    | Buffer
    | Promise<string | ArrayBuffer | Uint8Array | Blob | Buffer>

  export default class JSZip {
    file(name: string, data: JSZipFileData): this
    generateAsync(options: { type: 'blob' }): Promise<Blob>
  }
}
