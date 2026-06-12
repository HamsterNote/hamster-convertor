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
      // 此模块运行在 parser-runtime iframe 内部，import.meta.env.BASE_URL 形如：
      //   - 默认根部署：'/parser-runtime/'
      //   - 子路径部署：'/beta/parser-runtime/'
      // CMap 资源由主站 public/cmaps/ 提供，所以把末尾的 'parser-runtime/' 换成 'cmaps/'，
      // 即可在两种部署形态下都正确指向 '/cmaps/' 或 '/beta/cmaps/'。
      const baseUrl = import.meta.env.BASE_URL || '/'
      const cMapUrl = baseUrl.replace(/parser-runtime\/?$/, 'cmaps/')
      return originalGetDocument({
        ...params,
        cMapUrl,
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
