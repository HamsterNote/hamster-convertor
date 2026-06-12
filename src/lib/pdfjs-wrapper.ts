import * as pdfjsLib from 'pdfjs-dist'

const originalGetDocument = pdfjsLib.getDocument

type GetDocumentSrc = Parameters<typeof originalGetDocument>[0]

interface CMapParams {
  cMapUrl?: string
  cMapPacked?: boolean
  useWorkerFetch?: boolean
  [key: string]: unknown
}

// 包装 getDocument，自动注入 CMap 选项解决中文乱码
// 关键：显式设置 useWorkerFetch: true 绕过自动检测（自动检测要求 cMapUrl + standardFontDataUrl + wasmUrl 全部提供）
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
      const cMapUrl = `${import.meta.env.BASE_URL || '/'}cmaps/`.replace(/\/+/g, '/')
      console.log('[pdfjs-wrapper] Injecting CMap options:', {
        cMapUrl,
        cMapPacked: true,
        useWorkerFetch: true
      })
      return originalGetDocument({
        ...params,
        cMapUrl,
        cMapPacked: true,
        useWorkerFetch: true
      } as unknown as GetDocumentSrc)
    }
  }

  return originalGetDocument(src!)
}

export const getDocument = wrappedGetDocument
export const GlobalWorkerOptions = pdfjsLib.GlobalWorkerOptions

export * from 'pdfjs-dist'
