import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePdfPageList, type PageShell } from '../hooks/usePdfPageList'

type PdfPageSelectorInlineProps = {
  file: File
  selectedPages: number[]
  readOnly?: boolean
  onSelectedPagesChange: (pages: number[]) => void
}

export default function PdfPageSelectorInline({
  file,
  selectedPages,
  readOnly = false,
  onSelectedPagesChange
}: PdfPageSelectorInlineProps) {
  const { t } = useTranslation()
  const { pageShells, loading, error, gridRef } = usePdfPageList(file)
  const [collapsed, setCollapsed] = useState(false)

  const selectedSet = useMemo(() => new Set(selectedPages), [selectedPages])

  const togglePage = useCallback(
    (pageNumber: number) => {
      if (readOnly) return
      const next = new Set(selectedSet)
      if (next.has(pageNumber)) {
        next.delete(pageNumber)
      } else {
        next.add(pageNumber)
      }
      onSelectedPagesChange(Array.from(next).sort((a, b) => a - b))
    },
    [readOnly, selectedSet, onSelectedPagesChange]
  )

  const selectAll = useCallback(() => {
    if (readOnly) return
    onSelectedPagesChange(pageShells.map(s => s.pageNumber))
  }, [readOnly, pageShells, onSelectedPagesChange])

  const deselectAll = useCallback(() => {
    if (readOnly) return
    onSelectedPagesChange([])
  }, [readOnly, onSelectedPagesChange])

  const selectedCount = selectedPages.length

  return (
    <div className="pdf-page-selector-inline">
      <div className="pdf-page-selector-inline__sticky-header">
        <button
          type="button"
          className="pdf-page-selector-inline__header"
          onClick={() => setCollapsed(prev => !prev)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand' : 'Collapse'}
        >
          <span className="pdf-page-selector-inline__collapse-btn" aria-hidden="true">
            {collapsed ? '▶' : '▼'}
          </span>
          <h3 className="pdf-page-selector-inline__title">{t('settingsModal.pdfPagesTitle')}</h3>
          <span className="pdf-page-selector-inline__count">
            {t('options.pdfPages.selectedCount', { count: selectedCount })}
          </span>
        </button>

        {!collapsed && !readOnly && pageShells.length > 0 && (
          <div className="pdf-page-selector-inline__controls">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={selectAll}
              disabled={selectedCount === pageShells.length}
            >
              {t('pdfPageSelector.selectAll')}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={deselectAll}
              disabled={selectedCount === 0}
            >
              {t('pdfPageSelector.deselectAll')}
            </button>
          </div>
        )}
      </div>

      {!collapsed && (
        <>
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
            <div className="pdf-page-selector-inline__grid" ref={gridRef}>
              {pageShells.map(shell => (
                <PageCard
                  key={shell.pageNumber}
                  shell={shell}
                  isSelected={selectedSet.has(shell.pageNumber)}
                  onToggle={() => togglePage(shell.pageNumber)}
                  readOnly={readOnly}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function PageCard({
  shell,
  isSelected,
  onToggle,
  readOnly
}: {
  shell: PageShell
  isSelected: boolean
  onToggle: () => void
  readOnly: boolean
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      data-page-number={shell.pageNumber}
      className={`pdf-modal__card${isSelected ? ' pdf-modal__card--selected' : ''}`}
      onClick={onToggle}
      aria-pressed={isSelected}
      aria-label={`${t('pdfPageSelector.page')} ${shell.pageNumber}`}
      disabled={readOnly}
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
}
