import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ConversionResult } from '../lib/converter'

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
  const objectUrlRef = useRef<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeResult = results[activeIndex]

  const revokeCurrentUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }, [])

  const loadResult = useCallback(
    (result: ConversionResult) => {
      revokeCurrentUrl()
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current)
      }
      const url = URL.createObjectURL(result.blob)
      objectUrlRef.current = url
      setPreviewUrl(url)
      setIsLoading(true)
      // PDF blobs in a sandbox="" iframe never fire onLoad in Chromium
      // because the built-in PDF viewer is blocked. Use a timeout fallback
      // so the spinner does not block indefinitely.
      loadTimeoutRef.current = setTimeout(() => {
        setIsLoading(false)
      }, 800)
    },
    [revokeCurrentUrl]
  )

  useEffect(() => {
    if (!open || !activeResult) return

    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadResult(activeResult)

    return () => {
      revokeCurrentUrl()
    }
  }, [open, activeResult, loadResult, revokeCurrentUrl])

  useEffect(() => {
    if (!open) {
      revokeCurrentUrl()
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreviewUrl(null)
      setIsLoading(true)
    }
  }, [open, revokeCurrentUrl])

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
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current)
      }
    }
  }, [])

  const handleIframeLoad = () => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current)
      loadTimeoutRef.current = null
    }
    setIsLoading(false)
  }

  const handleTabClick = (index: number) => {
    if (index === activeIndex) return
    setActiveIndex(index)
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  if (!open || results.length === 0) return null

  const showTabs = results.length > 1

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="preview-modal-overlay"
      onClick={handleOverlayClick}
      onKeyDown={e => e.key === 'Escape' && onClose()}
    >
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
                  key={result.filename + index}
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
          {previewUrl && activeResult && (
            <iframe
              ref={iframeRef}
              className="preview-modal__iframe"
              src={previewUrl}
              title={activeResult.filename}
              onLoad={handleIframeLoad}
              sandbox=""
              style={{ display: isLoading ? 'none' : 'block' }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
