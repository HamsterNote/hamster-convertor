import { useCallback, useEffect, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'

export type ConfirmModalProps = {
  open: boolean
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'default',
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  const { t } = useTranslation()
  const headerId = useId()
  const messageId = useId()
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  const handleEscape = useCallback(
    (event: { key: string }) => {
      if (event.key === 'Escape') {
        onCancel()
      }
    },
    [onCancel]
  )

  useEffect(() => {
    if (!open) return

    const handler = (event: KeyboardEvent) => handleEscape(event)
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('keydown', handler)
    }
  }, [open, handleEscape])

  useEffect(() => {
    if (open) {
      confirmButtonRef.current?.focus()
    }
  }, [open])

  if (!open) return null

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onCancel()
    }
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className="pdf-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={headerId}
      aria-describedby={messageId}
      onClick={handleOverlayClick}
      onKeyDown={handleEscape}
    >
      <div className="pdf-modal confirm-modal">
        <div className="pdf-modal__header">
          <h2 id={headerId} className="pdf-modal__title">
            {title ?? t('confirmations.title')}
          </h2>
        </div>

        <p id={messageId} className="confirm-modal__message" style={{ whiteSpace: 'pre-line' }}>
          {message}
        </p>

        <div className="actions">
          <button type="button" className="btn btn--secondary" onClick={onCancel}>
            {cancelLabel ?? t('actions.cancel')}
          </button>
          <button
            type="button"
            ref={confirmButtonRef}
            className={`btn btn--primary${
              variant === 'danger' ? ' confirm-modal__confirm--danger' : ''
            }`}
            onClick={onConfirm}
          >
            {confirmLabel ?? t('actions.continue')}
          </button>
        </div>
      </div>
    </div>
  )
}
