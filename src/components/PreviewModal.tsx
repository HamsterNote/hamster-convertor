import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ConversionResult } from '../lib/converter'
import { loadPdfDocument, type PdfJsDocument } from '../lib/pdf-utils'

const PDF_PREVIEW_SCALE = 1.5

type PdfRenderTask = {
  promise: Promise<void>
  cancel?: () => void
}

type PreviewPdfDocument = PdfJsDocument & {
  cleanup?: () => void | Promise<void>
  destroy?: () => void | Promise<void>
}

type PreviewTab = {
  label: string
  result: ConversionResult
}

type PreviewModalProps = {
  open: boolean
  results: ConversionResult[]
  initialIndex?: number
  onClose: () => void
}

export type { PreviewTab }

const ignoreAsyncTeardownError = (result: void | Promise<void> | undefined) => {
  if (result instanceof Promise) {
    result.catch(() => undefined)
  }
}

const disposePdfDocument = (pdfDocument: PreviewPdfDocument) => {
  ignoreAsyncTeardownError(pdfDocument.cleanup?.())
  ignoreAsyncTeardownError(pdfDocument.destroy?.())
}

const renderPdfPage = async ({
  filename,
  isStaleRender,
  pageNumber,
  pdfDocument,
  renderTasks,
  viewer
}: {
  filename: string
  isStaleRender: () => boolean
  pageNumber: number
  pdfDocument: PreviewPdfDocument
  renderTasks: React.MutableRefObject<PdfRenderTask[]>
  viewer: HTMLDivElement
}) => {
  const page = await pdfDocument.getPage(pageNumber)
  const viewport = page.getViewport({ scale: PDF_PREVIEW_SCALE })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  canvas.setAttribute('aria-label', `${filename} page ${pageNumber}`)

  const canvasContext = canvas.getContext('2d')
  if (!canvasContext) {
    throw new Error('Canvas 2D context is unavailable')
  }

  const renderTask = page.render({ canvasContext, viewport }) as PdfRenderTask
  renderTasks.current.push(renderTask)
  await renderTask.promise
  renderTasks.current = renderTasks.current.filter(task => task !== renderTask)

  if (isStaleRender()) {
    renderTask.cancel?.()
    return
  }

  viewer.append(canvas)
}

export default function PreviewModal({
  open,
  results,
  initialIndex = 0,
  onClose
}: PreviewModalProps) {
  const { t } = useTranslation()
  const [activeIndex, setActiveIndex] = useState(initialIndex)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const pdfViewerRef = useRef<HTMLDivElement>(null)
  const pdfDocumentRef = useRef<PreviewPdfDocument | null>(null)
  const pdfRenderTasksRef = useRef<PdfRenderTask[]>([])
  const renderGenRef = useRef(0)
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeResult = results[activeIndex]

  const revokeCurrentUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }, [])

  const clearLoadTimeout = useCallback(() => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current)
      loadTimeoutRef.current = null
    }
  }, [])

  const cleanupPdfPreview = useCallback(() => {
    renderGenRef.current += 1
    for (const task of pdfRenderTasksRef.current) {
      task.cancel?.()
    }
    pdfRenderTasksRef.current = []

    const pdfDocument = pdfDocumentRef.current
    if (pdfDocument) {
      disposePdfDocument(pdfDocument)
      pdfDocumentRef.current = null
    }

    pdfViewerRef.current?.replaceChildren()
  }, [])

  const loadPdfResult = useCallback(
    async (result: ConversionResult) => {
      revokeCurrentUrl()
      clearLoadTimeout()
      cleanupPdfPreview()
      setPreviewUrl(null)
      setPdfError(null)
      setIsLoading(true)

      const currentGen = ++renderGenRef.current
      const isStaleRender = () => renderGenRef.current !== currentGen

      try {
        const arrayBuffer = await result.blob.arrayBuffer()
        if (isStaleRender()) return

        const pdfDocument = (await loadPdfDocument(arrayBuffer)) as PreviewPdfDocument
        if (isStaleRender()) {
          disposePdfDocument(pdfDocument)
          return
        }

        pdfDocumentRef.current = pdfDocument
        const viewer = pdfViewerRef.current
        if (!viewer) {
          throw new Error('PDF preview viewer is unavailable')
        }
        viewer.replaceChildren()

        for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
          await renderPdfPage({
            filename: result.filename,
            isStaleRender,
            pageNumber,
            pdfDocument,
            renderTasks: pdfRenderTasksRef,
            viewer
          })
          if (isStaleRender()) return
        }

        if (!isStaleRender()) {
          setIsLoading(false)
        }
      } catch (error) {
        if (isStaleRender()) return
        cleanupPdfPreview()
        setPdfError(
          error instanceof Error
            ? `Unable to render PDF preview: ${error.message}`
            : 'Unable to render PDF preview.'
        )
        setIsLoading(false)
      }
    },
    [clearLoadTimeout, cleanupPdfPreview, revokeCurrentUrl]
  )

  const loadResult = useCallback(
    (result: ConversionResult) => {
      cleanupPdfPreview()
      revokeCurrentUrl()
      clearLoadTimeout()
      setPdfError(null)

      if (result.targetFormat === 'pdf') {
        void loadPdfResult(result)
        return
      }

      const url = URL.createObjectURL(result.blob)
      objectUrlRef.current = url
      setPreviewUrl(url)
      setIsLoading(true)
      loadTimeoutRef.current = setTimeout(() => {
        setIsLoading(false)
      }, 800)
    },
    [cleanupPdfPreview, clearLoadTimeout, loadPdfResult, revokeCurrentUrl]
  )

  useEffect(() => {
    if (!open || !activeResult) return

    loadResult(activeResult)

    return () => {
      revokeCurrentUrl()
      cleanupPdfPreview()
    }
  }, [open, activeResult, cleanupPdfPreview, loadResult, revokeCurrentUrl])

  useEffect(() => {
    if (!open) {
      revokeCurrentUrl()
      cleanupPdfPreview()
      setPreviewUrl(null)
      setIsLoading(true)
      setPdfError(null)
    }
  }, [cleanupPdfPreview, open, revokeCurrentUrl])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Cleanup load timeout on unmount
  useEffect(() => {
    return () => {
      clearLoadTimeout()
      cleanupPdfPreview()
    }
  }, [cleanupPdfPreview, clearLoadTimeout])

  const handleIframeLoad = () => {
    clearLoadTimeout()
    setIsLoading(false)
  }

  const handleTabClick = (index: number) => {
    if (index === activeIndex) return
    setActiveIndex(index)
  }

  if (!open || results.length === 0) return null

  const showTabs = results.length > 1
  const isPdfPreview = activeResult?.targetFormat === 'pdf'

  return (
    <>
      <button
        type="button"
        className="preview-modal-overlay"
        onClick={onClose}
        aria-label={t('preview.close')}
        tabIndex={-1}
      />
      <div
        className="preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('preview.title', { filename: activeResult?.filename ?? '' })}
      >
        <div className="preview-modal__header">
          {showTabs ? (
            <div className="preview-modal__tabs" role="tablist">
              {results.map((result, index) => (
                <button
                  key={`${result.filename}-${result.mimeType}-${result.targetFormat}`}
                  type="button"
                  role="tab"
                  aria-selected={index === activeIndex}
                  className={`preview-modal__tab${index === activeIndex ? ' preview-modal__tab--active' : ''}`}
                  onClick={() => handleTabClick(index)}
                >
                  {result.filename}
                </button>
              ))}
            </div>
          ) : (
            <h2 className="preview-modal__title">{activeResult?.filename}</h2>
          )}
          <button
            type="button"
            className="preview-modal__close"
            onClick={onClose}
            aria-label={t('preview.close')}
          >
            ×
          </button>
        </div>

        <div className="preview-modal__body">
          {isLoading && (
            <div className="preview-modal__loading">
              <span className="preview-modal__spinner" aria-hidden />
              <span>{t('preview.loading')}</span>
            </div>
          )}
          {pdfError && <div className="pdf-modal__error">{pdfError}</div>}
          {activeResult && isPdfPreview && !pdfError && (
            <div
              ref={pdfViewerRef}
              className="preview-modal__pdf-viewer"
              style={{
                alignItems: 'center',
                flexDirection: 'column',
                gap: '24px',
                overflowY: 'auto',
                padding: '24px'
              }}
            />
          )}
          {previewUrl && activeResult && !isPdfPreview && (
            <div className="preview-modal__content">
              <iframe
                ref={iframeRef}
                className="preview-modal__iframe"
                src={previewUrl}
                title={activeResult.filename}
                onLoad={handleIframeLoad}
                sandbox=""
                style={{ display: isLoading ? 'none' : 'block' }}
              />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
