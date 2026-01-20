declare module 'pdfjs-dist' {
  export const Util: {
    transform: (m1: number[], m2: number[]) => number[]
  }
  export const getDocument: (options: {
    data: Uint8Array
    disableWorker?: boolean
  }) => {
    promise: Promise<PDFDocumentProxy>
  }

  export type PDFDocumentProxy = {
    numPages: number
    fingerprints?: string[]
    getMetadata: () => Promise<{ info?: { Title?: string } } | undefined>
    getPage: (pageNumber: number) => Promise<PDFPageProxy>
    getOutline: () => Promise<
      {
        title?: string
        bold?: boolean
        italic?: boolean
        url?: string
        unsafeUrl?: string
        newWindow?: boolean
        dest?: unknown
        items?: unknown[]
      }[]
    >
    getDestination: (dest: string) => Promise<unknown[] | undefined>
    getPageIndex: (ref: { num: number }) => Promise<number>
  }

  export type PDFPageProxy = {
    getViewport: (options: { scale: number }) => {
      width: number
      height: number
      transform: number[]
    }
    getTextContent: (options: {
      includeMarkedContent: boolean
    }) => Promise<TextContent>
    render: (options: {
      canvas: HTMLCanvasElement
      viewport: { width: number; height: number }
    }) => {
      promise: Promise<void>
    }
    cleanup?: () => void
  }

  export type PageViewport = {
    height: number
    transform: number[]
  }

  export type TextItem = {
    str?: string
    fontName: string
    transform: number[]
    width?: number
    height?: number
    dir?: 'ltr' | 'rtl' | 'ttb'
    hasEOL?: boolean
  }

  export type TextStyle = {
    ascent?: number
    descent?: number
    fontFamily?: string
    vertical?: boolean
  }

  export type TextContent = {
    items: TextItem[]
    styles?: Record<string, TextStyle>
  }
}

declare module 'pdfjs-dist/types/src/display/api' {
  export type TextContent = {
    items: import('pdfjs-dist').TextItem[]
    styles?: Record<string, import('pdfjs-dist').TextStyle>
  }
  export type TextItem = import('pdfjs-dist').TextItem
  export type TextStyle = import('pdfjs-dist').TextStyle
}

declare global {
  interface Window {
    __E2E__?: boolean
  }
}
