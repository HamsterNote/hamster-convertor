import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePdfPageList } from '../hooks/usePdfPageList'

type PdfPageSelectorModalProps = {
  open: boolean
  file: File
  selectedPages?: number[]
  onCancel: () => void
  onConfirm: (pages: number[]) => void
}

export default function PdfPageSelectorModal({
  open,
  file,
  selectedPages,
  onCancel,
  onConfirm
}: PdfPageSelectorModalProps) {
  const { t } = useTranslation()
  const { pageShells, loading, error, gridRef } = usePdfPageList(file)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (pageShells.length === 0) return
    const numPages = pageShells.length
    const initialSelected =
      selectedPages !== undefined && selectedPages.length > 0
        ? new Set(selectedPages.filter(p => p >= 1 && p <= numPages))
        : new Set(Array.from({ length: numPages }, (_, i) => i + 1))
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(initialSelected)
  }, [pageShells.length, selectedPages])

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
            <span className="pdf-modal__spinner" aria-hidden="true" />
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
                        <span className="pdf-modal__spinner" aria-hidden="true" />
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
