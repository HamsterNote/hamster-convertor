import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

// 设置 PDF.js worker 路径，避免使用 fake worker 导致转换失败
if (pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
}

const originalGetDocument = pdfjsLib.getDocument

type GetDocumentSrc = Parameters<typeof originalGetDocument>[0]

type CMapParams = {
  cMapUrl?: string
  cMapPacked?: boolean
  useWorkerFetch?: boolean
  [key: string]: unknown
}

const wrappedGetDocument = (src?: GetDocumentSrc) => {
  if (
    src &&
    typeof src === 'object' &&
    !Array.isArray(src) &&
    !(src instanceof URL) &&
    !(src instanceof Uint8Array) &&
    !(src instanceof ArrayBuffer)
  ) {
    const params = src as CMapParams

    if (!params.cMapUrl) {
      return originalGetDocument({
        ...params,
        cMapUrl: '/cmaps/',
        cMapPacked: true,
        useWorkerFetch: true
      } as unknown as GetDocumentSrc)
    }
  }

  return originalGetDocument(src)
}

export const getDocument = wrappedGetDocument
export const GlobalWorkerOptions = pdfjsLib.GlobalWorkerOptions

export * from 'pdfjs-dist'
