import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

type PageShell = {
  pageNumber: number
  thumbnailUrl: string | null
  status: 'idle' | 'loading' | 'loaded' | 'failed'
}

type PdfPageSelectorModalProps = {
  open: boolean
  file: File
  selectedPages?: number[]
  onCancel: () => void
  onConfirm: (pages: number[]) => void
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

const configurePdfJsWorker = (pdfjs: PdfJsModule): void => {
  if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  }
}

const loadPdfDocument = async (arrayBuffer: ArrayBuffer) => {
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

export default function PdfPageSelectorModal({
  open,
  file,
  selectedPages,
  onCancel,
  onConfirm
}: PdfPageSelectorModalProps) {
  const { t } = useTranslation()
  const [pageShells, setPageShells] = useState<PageShell[]>([])
  const [pdfDocument, setPdfDocument] = useState<{
    numPages: number
    getPage: (pageNumber: number) => Promise<{
      getViewport: (options: { scale: number }) => { width: number; height: number }
      render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
        promise: Promise<void>
      }
    }>
  } | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const objectUrlsRef = useRef<string[]>([])
  const isMountedRef = useRef(true)
  const isOpenRef = useRef(open)
  const gridRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    isOpenRef.current = open
  }, [open])

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
    }
  }, [revokeObjectUrls])

  useEffect(() => {
    if (!open) {
      revokeObjectUrls()
      observerRef.current?.disconnect()
      observerRef.current = null
      return
    }

    const controller = new AbortController()
    const signal = controller.signal

    const loadPdfPages = async () => {
      setLoading(true)
      setError(null)
      setPageShells([])
      setSelected(new Set())
      setPdfDocument(null)
      revokeObjectUrls()
      observerRef.current?.disconnect()
      observerRef.current = null

      try {
        if (isE2E()) {
          const fakePages = createFakeE2EThumbnails()
          const initialSelected = new Set(fakePages.map(p => p.pageNumber))
          setPageShells(
            fakePages.map(p => ({
              pageNumber: p.pageNumber,
              thumbnailUrl: p.thumbnailUrl,
              status: 'loaded'
            }))
          )
          setSelected(initialSelected)
          setLoading(false)
          return
        }

        const arrayBuffer = await readFileAsArrayBuffer(file)
        if (signal.aborted) return
        const doc = await loadPdfDocument(arrayBuffer)
        if (signal.aborted) return

        const numPages = doc.numPages
        const initialSelected =
          selectedPages !== undefined && selectedPages.length > 0
            ? new Set(selectedPages.filter(p => p >= 1 && p <= numPages))
            : new Set(Array.from({ length: numPages }, (_, i) => i + 1))

        setPdfDocument(doc)
        setPageShells(
          Array.from({ length: numPages }, (_, i) => ({
            pageNumber: i + 1,
            thumbnailUrl: null,
            status: 'idle'
          }))
        )
        setSelected(initialSelected)
        setLoading(false)
      } catch {
        if (!signal.aborted) {
          setError(t('pdfPageSelector.loadError'))
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
  }, [open, file, selectedPages, revokeObjectUrls, t])

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
      if (!isMountedRef.current || !isOpenRef.current) return
      setPageShells(prev => markLoading(prev, pageNumber))

      try {
        const page = await pdfDocument.getPage(pageNumber)
        const thumbnailUrl = await renderPageThumbnail(page, 0.4)
        if (!isMountedRef.current || !isOpenRef.current) {
          if (thumbnailUrl.startsWith('blob:')) URL.revokeObjectURL(thumbnailUrl)
          return
        }
        objectUrlsRef.current.push(thumbnailUrl)
        setPageShells(prev => markLoaded(prev, pageNumber, thumbnailUrl))
      } catch {
        if (isMountedRef.current && isOpenRef.current) {
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
    cards.forEach(card => observer.observe(card))
    observerRef.current = observer

    return () => {
      observer.disconnect()
    }
  }, [pdfDocument, pageShells.length, t])

  const togglePage = (pageNumber: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(pageNumber)) {
        next.delete(pageNumber)
      } else {
        next.add(pageNumber)
      }
      return next
    })
  }

  const selectAll = () => {
    setSelected(new Set(pageShells.map(s => s.pageNumber)))
  }

  const deselectAll = () => {
    setSelected(new Set())
  }

  const handleConfirm = () => {
    const sorted = Array.from(selected).sort((a, b) => a - b)
    onConfirm(sorted)
  }

  if (!open) return null

  return (
    <div className="pdf-modal-overlay">
      <div
        className="pdf-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('pdfPageSelector.title')}
      >
        <div className="pdf-modal__header">
          <h2>{t('pdfPageSelector.title')}</h2>
        </div>

        {error && (
          <div className="pdf-modal__error" role="alert">
            {error}
          </div>
        )}

        {loading && pageShells.length === 0 && (
          <div className="pdf-modal__loading">
            <span className="pdf-modal__spinner" aria-hidden />
            <span>{t('pdfPageSelector.loading')}</span>
          </div>
        )}

        {!error && pageShells.length > 0 && (
          <>
            <div className="pdf-modal__grid" ref={gridRef}>
              {pageShells.map(shell => {
                const isSelected = selected.has(shell.pageNumber)
                return (
                  <button
                    key={shell.pageNumber}
                    type="button"
                    data-page-number={shell.pageNumber}
                    className={`pdf-modal__card${isSelected ? ' pdf-modal__card--selected' : ''}`}
                    onClick={() => togglePage(shell.pageNumber)}
                    aria-pressed={isSelected}
                    aria-label={`${t('pdfPageSelector.page')} ${shell.pageNumber}`}
                  >
                    {shell.thumbnailUrl ? (
                      <img
                        src={shell.thumbnailUrl}
                        alt={`${t('pdfPageSelector.page')} ${shell.pageNumber}`}
                        className="pdf-modal__thumbnail"
                      />
                    ) : (
                      <div className="pdf-modal__thumbnail-placeholder">
                        <span className="pdf-modal__spinner" aria-hidden />
                      </div>
                    )}
                    <span className="pdf-modal__page-number">
                      {t('pdfPageSelector.page')} {shell.pageNumber}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="pdf-modal__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={selectAll}
                disabled={selected.size === pageShells.length}
              >
                {t('pdfPageSelector.selectAll')}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={deselectAll}
                disabled={selected.size === 0}
              >
                {t('pdfPageSelector.deselectAll')}
              </button>
              <div className="pdf-modal__actions__spacer" />
              <button type="button" className="btn btn--secondary" onClick={onCancel}>
                {t('pdfPageSelector.cancel')}
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleConfirm}
                disabled={selected.size === 0}
              >
                {t('pdfPageSelector.done')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
