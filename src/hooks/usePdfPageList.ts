import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { useCallback, useEffect, useRef, useState } from 'react'

export type PageShell = {
  pageNumber: number
  thumbnailUrl: string | null
  status: 'idle' | 'loading' | 'loaded' | 'failed'
}

type PdfJsModule = {
  GlobalWorkerOptions?: {
    workerSrc?: string
  }
  getDocument: (options: { data: Uint8Array }) => {
    promise: Promise<{
      numPages: number
      getPage: (pageNumber: number) => Promise<{
        getViewport: (options: { scale: number }) => { width: number; height: number }
        render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
          promise: Promise<void>
        }
      }>
    }>
  }
}

type PdfDocument = {
  numPages: number
  getPage: (pageNumber: number) => Promise<{
    getViewport: (options: { scale: number }) => { width: number; height: number }
    render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
      promise: Promise<void>
    }
  }>
}

const configurePdfJsWorker = (pdfjs: PdfJsModule): void => {
  if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  }
}

const loadPdfDocument = async (arrayBuffer: ArrayBuffer): Promise<PdfDocument> => {
  const pdfjs = (await import('pdfjs-dist')) as unknown as PdfJsModule
  configurePdfJsWorker(pdfjs)
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) })
  return loadingTask.promise
}

const readFileAsArrayBuffer = async (file: File): Promise<ArrayBuffer> => {
  const fileWithArrayBuffer = file as File & { arrayBuffer?: () => Promise<ArrayBuffer> }
  if (fileWithArrayBuffer.arrayBuffer) {
    return fileWithArrayBuffer.arrayBuffer()
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result)
        return
      }
      reject(new Error('FileReader returned an unsupported result'))
    })
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('Failed to read file'))
    })
    reader.readAsArrayBuffer(file)
  })
}

const renderPageThumbnail = async (
  page: {
    getViewport: (options: { scale: number }) => { width: number; height: number }
    render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
      promise: Promise<void>
    }
  },
  scale: number
): Promise<string> => {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)

  const canvasContext = canvas.getContext('2d')
  if (!canvasContext) {
    throw new Error('Canvas 2D context is unavailable')
  }

  await page.render({ canvasContext, viewport }).promise

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) {
        resolve(URL.createObjectURL(blob))
        return
      }
      reject(new Error('Failed to render PDF page as blob'))
    }, 'image/png')
  })
}

const isE2E = (): boolean =>
  typeof window !== 'undefined' && (window as Window & { __E2E__?: boolean }).__E2E__ === true

const createFakeE2EThumbnails = (): PageShell[] => {
  const colors = ['#f6a700', '#e09100']
  return [1, 2].map((pageNumber, index) => {
    const canvas = document.createElement('canvas')
    canvas.width = 120
    canvas.height = 160
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = colors[index % colors.length]
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 16px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`Page ${pageNumber}`, canvas.width / 2, canvas.height / 2)
    }
    const thumbnailUrl = canvas.toDataURL('image/png')
    return { pageNumber, thumbnailUrl, status: 'loaded' as const }
  })
}

/**
 * Hook that loads a PDF file and lazily renders page thumbnails
 * using IntersectionObserver. Automatically cleans up blob URLs
 * and observers on unmount.
 */
export function usePdfPageList(file: File): {
  pageShells: PageShell[]
  loading: boolean
  error: string | null
  gridRef: React.RefObject<HTMLDivElement>
} {
  const [pageShells, setPageShells] = useState<PageShell[]>([])
  const [pdfDocument, setPdfDocument] = useState<PdfDocument | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const objectUrlsRef = useRef<string[]>([])
  const isMountedRef = useRef(true)
  const gridRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const revokeObjectUrls = useCallback(() => {
    objectUrlsRef.current.forEach(url => {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url)
      }
    })
    objectUrlsRef.current = []
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      revokeObjectUrls()
      observerRef.current?.disconnect()
      observerRef.current = null
    }
  }, [revokeObjectUrls])

  useEffect(() => {
    const controller = new AbortController()
    const signal = controller.signal

    const loadPdfPages = async () => {
      setLoading(true)
      setError(null)
      setPageShells([])
      setPdfDocument(null)
      revokeObjectUrls()
      observerRef.current?.disconnect()
      observerRef.current = null

      try {
        if (isE2E()) {
          const fakePages = createFakeE2EThumbnails()
          setPageShells(fakePages)
          setLoading(false)
          return
        }

        const arrayBuffer = await readFileAsArrayBuffer(file)
        if (signal.aborted) return
        const doc = await loadPdfDocument(arrayBuffer)
        if (signal.aborted) return

        const numPages = doc.numPages
        setPdfDocument(doc)
        setPageShells(
          Array.from({ length: numPages }, (_, i) => ({
            pageNumber: i + 1,
            thumbnailUrl: null,
            status: 'idle'
          }))
        )
        setLoading(false)
      } catch {
        if (!signal.aborted) {
          setError('Failed to load PDF')
          setLoading(false)
        }
      }
    }

    loadPdfPages()

    return () => {
      controller.abort()
      observerRef.current?.disconnect()
      observerRef.current = null
    }
  }, [file, revokeObjectUrls])

  useEffect(() => {
    if (!pdfDocument || pageShells.length === 0 || isE2E()) return

    const grid = gridRef.current
    if (!grid) return

    const markLoading = (prev: PageShell[], pageNum: number): PageShell[] => {
      const shell = prev.find(s => s.pageNumber === pageNum)
      if (!shell || shell.status !== 'idle') return prev
      return prev.map(s => (s.pageNumber === pageNum ? { ...s, status: 'loading' } : s))
    }

    const markLoaded = (prev: PageShell[], pageNum: number, url: string): PageShell[] =>
      prev.map(s => (s.pageNumber === pageNum ? { ...s, thumbnailUrl: url, status: 'loaded' } : s))

    const markFailed = (prev: PageShell[], pageNum: number): PageShell[] =>
      prev.map(s => (s.pageNumber === pageNum ? { ...s, status: 'failed' } : s))

    const renderThumbnailForPage = async (pageNumber: number): Promise<void> => {
      if (!isMountedRef.current) return
      setPageShells(prev => markLoading(prev, pageNumber))

      try {
        const page = await pdfDocument.getPage(pageNumber)
        const thumbnailUrl = await renderPageThumbnail(page, 0.4)
        if (!isMountedRef.current) {
          if (thumbnailUrl.startsWith('blob:')) URL.revokeObjectURL(thumbnailUrl)
          return
        }
        objectUrlsRef.current.push(thumbnailUrl)
        setPageShells(prev => markLoaded(prev, pageNumber, thumbnailUrl))
      } catch {
        if (isMountedRef.current) {
          setPageShells(prev => markFailed(prev, pageNumber))
        }
      }
    }

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return
          const pageNumber = Number(entry.target.getAttribute('data-page-number'))
          if (!pageNumber) return
          void renderThumbnailForPage(pageNumber)
        })
      },
      { root: grid, rootMargin: '100px' }
    )

    const cards = grid.querySelectorAll('[data-page-number]')
    cards.forEach(card => {
      observer.observe(card)
    })
    observerRef.current = observer

    return () => {
      observer.disconnect()
    }
  }, [pdfDocument, pageShells.length])

  return { pageShells, loading, error, gridRef }
}
