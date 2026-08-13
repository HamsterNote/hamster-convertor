import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { HtmlDecodeOptions } from '../lib/converter'

type DecodeTextControl = NonNullable<HtmlDecodeOptions['textControl']> & {
  respectWhitespaces?: boolean
  ignoreImages?: boolean
}

type HtmlDecodeOptionsModalProps = {
  open: boolean
  textControl?: DecodeTextControl
  onCancel: () => void
  onConfirm: (textControl: DecodeTextControl | undefined) => void
}

type TextControlDraft = {
  fontSize: string
  lineHeight: string
  fontWeight: string
  italic: boolean
  color: string
  fontFamily: string
  vertical: string
  dir: string
}

const createDraft = (textControl?: DecodeTextControl): TextControlDraft => ({
  fontSize: textControl?.fontSize?.toString() ?? '',
  lineHeight: textControl?.lineHeight?.toString() ?? '',
  fontWeight: textControl?.fontWeight?.toString() ?? '',
  italic: textControl?.italic ?? false,
  color: textControl?.color ?? '',
  fontFamily: textControl?.fontFamily ?? '',
  vertical: textControl?.vertical ?? '',
  dir: textControl?.dir ?? ''
})

const optionalNumber = (value: string): number | undefined => {
  if (value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const cleanTextControl = (draft: TextControlDraft): DecodeTextControl | undefined => {
  const next: DecodeTextControl = {}
  const fontSize = optionalNumber(draft.fontSize)
  const lineHeight = optionalNumber(draft.lineHeight)
  const fontWeight = optionalNumber(draft.fontWeight)

  if (fontSize !== undefined) next.fontSize = fontSize
  if (lineHeight !== undefined) next.lineHeight = lineHeight
  if (fontWeight !== undefined) next.fontWeight = fontWeight
  if (draft.italic) next.italic = true
  if (draft.color.trim()) next.color = draft.color.trim()
  if (draft.fontFamily.trim()) next.fontFamily = draft.fontFamily.trim()
  if (draft.vertical) next.vertical = draft.vertical
  if (draft.dir) next.dir = draft.dir

  next.respectWhitespaces = true
  next.ignoreImages = false

  return next
}

export type { DecodeTextControl }

export default function HtmlDecodeOptionsModal({
  open,
  textControl,
  onCancel,
  onConfirm
}: HtmlDecodeOptionsModalProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<TextControlDraft>(() => createDraft(textControl))

  const updateDraft = <Key extends keyof TextControlDraft>(
    key: Key,
    value: TextControlDraft[Key]
  ) => {
    setDraft(prev => ({ ...prev, [key]: value }))
  }

  const handleConfirm = () => {
    onConfirm(cleanTextControl(draft))
  }

  if (!open) return null

  return (
    <div className="pdf-modal-overlay">
      <div
        className="pdf-modal html-options-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('options.htmlTextControls')}
      >
        <div className="pdf-modal__header">
          <h2>{t('options.htmlTextControls')}</h2>
        </div>

        <div className="html-options-modal__body">
          <label className="html-options-modal__field">
            <span>{t('options.fontSize')}</span>
            <input
              type="number"
              min="1"
              inputMode="decimal"
              value={draft.fontSize}
              onChange={event => updateDraft('fontSize', event.target.value)}
              placeholder={t('options.defaultValue')}
            />
          </label>

          <label className="html-options-modal__field">
            <span>{t('options.lineHeight')}</span>
            <input
              type="number"
              min="0"
              step="0.1"
              inputMode="decimal"
              value={draft.lineHeight}
              onChange={event => updateDraft('lineHeight', event.target.value)}
              placeholder={t('options.defaultValue')}
            />
          </label>

          <label className="html-options-modal__field">
            <span>{t('options.fontWeight')}</span>
            <input
              type="number"
              min="100"
              max="900"
              step="100"
              inputMode="numeric"
              value={draft.fontWeight}
              onChange={event => updateDraft('fontWeight', event.target.value)}
              placeholder={t('options.defaultValue')}
            />
          </label>

          <label className="html-options-modal__field">
            <span>{t('options.color')}</span>
            <input
              type="text"
              value={draft.color}
              onChange={event => updateDraft('color', event.target.value)}
              placeholder="#2d1f00"
            />
          </label>

          <label className="html-options-modal__field html-options-modal__field--wide">
            <span>{t('options.fontFamily')}</span>
            <input
              type="text"
              value={draft.fontFamily}
              onChange={event => updateDraft('fontFamily', event.target.value)}
              placeholder={t('options.defaultValue')}
            />
          </label>

          <label className="html-options-modal__field">
            <span>{t('options.vertical')}</span>
            <select
              value={draft.vertical}
              onChange={event => updateDraft('vertical', event.target.value)}
            >
              <option value="">{t('options.defaultValue')}</option>
              <option value="horizontal-tb">horizontal-tb</option>
              <option value="vertical-rl">vertical-rl</option>
              <option value="vertical-lr">vertical-lr</option>
            </select>
          </label>

          <label className="html-options-modal__field">
            <span>{t('options.dir')}</span>
            <select value={draft.dir} onChange={event => updateDraft('dir', event.target.value)}>
              <option value="">{t('options.defaultValue')}</option>
              <option value="ltr">ltr</option>
              <option value="rtl">rtl</option>
              <option value="auto">auto</option>
            </select>
          </label>

          <label className="html-options-modal__checkbox html-options-modal__field--wide">
            <input
              type="checkbox"
              checked={draft.italic}
              onChange={event => updateDraft('italic', event.target.checked)}
            />
            <span>{t('options.italic')}</span>
          </label>
        </div>

        <div className="pdf-modal__actions">
          <div className="pdf-modal__actions__spacer" />
          <button type="button" className="btn btn--secondary" onClick={onCancel}>
            {t('actions.cancel')}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleConfirm}
            aria-label={t('options.confirmTextControl')}
          >
            {t('actions.done')}
          </button>
        </div>
      </div>
    </div>
  )
}
