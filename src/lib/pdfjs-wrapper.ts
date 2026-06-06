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
      console.log('[pdfjs-wrapper] Injecting CMap options:', {
        cMapUrl: '/cmaps/',
        cMapPacked: true,
        useWorkerFetch: true
      })
      return originalGetDocument({
        ...params,
        cMapUrl: '/cmaps/',
        cMapPacked: true,
        useWorkerFetch: true // 强制 Worker 直接获取 CMap，绕过自动检测
      } as unknown as GetDocumentSrc)
    }
  }

  return originalGetDocument(src!)
}

export const getDocument = wrappedGetDocument
export const GlobalWorkerOptions = pdfjsLib.GlobalWorkerOptions

export * from 'pdfjs-dist'
