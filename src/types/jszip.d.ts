declare module 'jszip' {
  export default class JSZip {
    file(name: string, data: string): this
    generateAsync(options: { type: 'blob' }): Promise<Blob>
  }
}
