import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { HtmlDecodeOptions, HtmlLayoutOptions } from '../lib/converter'

type BackgroundDecodeOptions = NonNullable<HtmlDecodeOptions['background']>

type HtmlOptionsValue = {
  textControl?: HtmlDecodeOptions['textControl']
  background: BackgroundDecodeOptions
  htmlLayout: HtmlLayoutOptions
}

type HtmlOptionsModalProps = {
  open: boolean
  options: HtmlOptionsValue | undefined
  readOnly?: boolean
  onCancel: () => void
  onConfirm: (next: HtmlOptionsValue) => void
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

type BackgroundDraft = {
  includeBackground: boolean
  backgroundQuality: number
  excludeTextFromBackground: boolean
}

type LayoutDraft = {
  mode: 'paginated' | 'continuous'
  widthMode: 'actual' | 'fit'
}

type Draft = {
  textControl: TextControlDraft
  background: BackgroundDraft
  layout: LayoutDraft
}

const HTML_BACKGROUND_QUALITY_OPTIONS = [
  { value: 0.3, labelKey: 'options.backgroundQualityLow' },
  { value: 0.6, labelKey: 'options.backgroundQualityMedium' },
  { value: 0.85, labelKey: 'options.backgroundQualityHigh' },
  { value: 1, labelKey: 'options.backgroundQualityUltra' }
] as const

const DEFAULT_BACKGROUND: BackgroundDraft = {
  includeBackground: true,
  backgroundQuality: 0.85,
  excludeTextFromBackground: true
}

const DEFAULT_LAYOUT: LayoutDraft = {
  mode: 'paginated',
  widthMode: 'actual'
}

const createTextControlDraft = (
  textControl?: HtmlDecodeOptions['textControl']
): TextControlDraft => ({
  fontSize: textControl?.fontSize?.toString() ?? '',
  lineHeight: textControl?.lineHeight?.toString() ?? '',
  fontWeight: textControl?.fontWeight?.toString() ?? '',
  italic: textControl?.italic ?? false,
  color: textControl?.color ?? '',
  fontFamily: textControl?.fontFamily ?? '',
  vertical: textControl?.vertical ?? '',
  dir: textControl?.dir ?? ''
})

const createDraft = (options?: HtmlOptionsModalProps['options']): Draft => ({
  textControl: createTextControlDraft(options?.textControl),
  background: {
    includeBackground:
      options?.background?.includeBackground ?? DEFAULT_BACKGROUND.includeBackground,
    backgroundQuality:
      options?.background?.backgroundQuality ?? DEFAULT_BACKGROUND.backgroundQuality,
    excludeTextFromBackground:
      options?.background?.excludeTextFromBackground ?? DEFAULT_BACKGROUND.excludeTextFromBackground
  },
  layout: {
    mode: options?.htmlLayout?.mode ?? DEFAULT_LAYOUT.mode,
    widthMode: options?.htmlLayout?.widthMode ?? DEFAULT_LAYOUT.widthMode
  }
})

const optionalNumber = (value: string): number | undefined => {
  if (value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const cleanTextControl = (
  draft: TextControlDraft
): HtmlDecodeOptions['textControl'] | undefined => {
  const next: NonNullable<HtmlDecodeOptions['textControl']> = {}
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

  return Object.keys(next).length > 0 ? next : undefined
}

const cleanOutput = (draft: Draft): HtmlOptionsValue => {
  const textControl = cleanTextControl(draft.textControl)
  const output: HtmlOptionsValue = {
    background: { ...draft.background },
    htmlLayout: { ...draft.layout }
  }
  if (textControl) {
    output.textControl = textControl
  }
  return output
}

export type { HtmlOptionsModalProps, HtmlOptionsValue }

export default function HtmlOptionsModal({
  open,
  options,
  readOnly = false,
  onCancel,
  onConfirm
}: HtmlOptionsModalProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<Draft>(() => createDraft(options))

  useEffect(() => {
    if (open) {
      // Reset draft when the modal opens to ensure it reflects the latest options.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(createDraft(options))
    }
  }, [open, options])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onCancel])

  const updateTextControl = <Key extends keyof TextControlDraft>(
    key: Key,
    value: TextControlDraft[Key]
  ) => {
    setDraft(prev => ({ ...prev, textControl: { ...prev.textControl, [key]: value } }))
  }

  const updateBackground = <Key extends keyof BackgroundDraft>(
    key: Key,
    value: BackgroundDraft[Key]
  ) => {
    setDraft(prev => ({ ...prev, background: { ...prev.background, [key]: value } }))
  }

  const updateLayout = <Key extends keyof LayoutDraft>(key: Key, value: LayoutDraft[Key]) => {
    setDraft(prev => {
      const nextLayout = { ...prev.layout, [key]: value }
      if (key === 'mode' && value === 'paginated') {
        nextLayout.widthMode = 'actual'
      }
      return { ...prev, layout: nextLayout }
    })
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel()
    }
  }

  const handleConfirm = () => {
    onConfirm(cleanOutput(draft))
  }

  if (!open) return null

  const titleId = 'html-options-modal-title'

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="pdf-modal-overlay"
      onClick={handleOverlayClick}
      onKeyDown={e => e.key === 'Escape' && onCancel()}
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <div
        className="pdf-modal html-options-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={e => e.stopPropagation()}
      >
        <div className="pdf-modal__header">
          <h2 id={titleId}>
            {readOnly ? t('htmlOptionsModal.viewTitle') : t('htmlOptionsModal.title')}
          </h2>
        </div>

        <div className="html-options-modal__body">
          {/* Background Section */}
          <h3 className="html-options-modal__section-title html-options-modal__field--wide">
            {t('htmlOptionsModal.backgroundSection')}
          </h3>

          <label className="html-options-modal__checkbox html-options-modal__field--wide">
            <input
              type="checkbox"
              checked={draft.background.includeBackground}
              onChange={event => updateBackground('includeBackground', event.target.checked)}
              disabled={readOnly}
            />
            <span>{t('options.includeBackground')}</span>
          </label>

          <label className="html-options-modal__field html-options-modal__field--wide">
            <span>{t('options.backgroundQuality')}</span>
            <select
              value={String(draft.background.backgroundQuality)}
              onChange={event => updateBackground('backgroundQuality', Number(event.target.value))}
              disabled={readOnly}
              aria-label={t('options.backgroundQuality')}
            >
              {HTML_BACKGROUND_QUALITY_OPTIONS.map(option => (
                <option key={option.value} value={String(option.value)}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </label>

          <label className="html-options-modal__checkbox html-options-modal__field--wide">
            <input
              type="checkbox"
              checked={draft.background.excludeTextFromBackground}
              onChange={event =>
                updateBackground('excludeTextFromBackground', event.target.checked)
              }
              disabled={readOnly}
            />
            <span>{t('options.excludeTextFromBackground')}</span>
          </label>

          {/* Text Control Section */}
          <h3 className="html-options-modal__section-title html-options-modal__field--wide">
            {t('htmlOptionsModal.textControlSection')}
          </h3>

          <label className="html-options-modal__field">
            <span>{t('options.fontSize')}</span>
            <input
              type="number"
              min="1"
              inputMode="decimal"
              value={draft.textControl.fontSize}
              onChange={event => updateTextControl('fontSize', event.target.value)}
              placeholder={t('options.defaultValue')}
              disabled={readOnly}
            />
          </label>

          <label className="html-options-modal__field">
            <span>{t('options.lineHeight')}</span>
            <input
              type="number"
              min="0"
              step="0.1"
              inputMode="decimal"
              value={draft.textControl.lineHeight}
              onChange={event => updateTextControl('lineHeight', event.target.value)}
              placeholder={t('options.defaultValue')}
              disabled={readOnly}
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
              value={draft.textControl.fontWeight}
              onChange={event => updateTextControl('fontWeight', event.target.value)}
              placeholder={t('options.defaultValue')}
              disabled={readOnly}
            />
          </label>

          <label className="html-options-modal__field">
            <span>{t('options.color')}</span>
            <input
              type="text"
              value={draft.textControl.color}
              onChange={event => updateTextControl('color', event.target.value)}
              placeholder="#2d1f00"
              disabled={readOnly}
            />
          </label>

          <label className="html-options-modal__field html-options-modal__field--wide">
            <span>{t('options.fontFamily')}</span>
            <input
              type="text"
              value={draft.textControl.fontFamily}
              onChange={event => updateTextControl('fontFamily', event.target.value)}
              placeholder={t('options.defaultValue')}
              disabled={readOnly}
            />
          </label>

          <label className="html-options-modal__field">
            <span>{t('options.vertical')}</span>
            <select
              value={draft.textControl.vertical}
              onChange={event => updateTextControl('vertical', event.target.value)}
              disabled={readOnly}
            >
              <option value="">{t('options.defaultValue')}</option>
              <option value="horizontal-tb">horizontal-tb</option>
              <option value="vertical-rl">vertical-rl</option>
              <option value="vertical-lr">vertical-lr</option>
            </select>
          </label>

          <label className="html-options-modal__field">
            <span>{t('options.dir')}</span>
            <select
              value={draft.textControl.dir}
              onChange={event => updateTextControl('dir', event.target.value)}
              disabled={readOnly}
            >
              <option value="">{t('options.defaultValue')}</option>
              <option value="ltr">ltr</option>
              <option value="rtl">rtl</option>
              <option value="auto">auto</option>
            </select>
          </label>

          <label className="html-options-modal__checkbox html-options-modal__field--wide">
            <input
              type="checkbox"
              checked={draft.textControl.italic}
              onChange={event => updateTextControl('italic', event.target.checked)}
              disabled={readOnly}
            />
            <span>{t('options.italic')}</span>
          </label>

          {/* Layout Section */}
          <h3 className="html-options-modal__section-title html-options-modal__field--wide">
            {t('htmlOptionsModal.layoutSection')}
          </h3>

          <div className="html-options-modal__field html-options-modal__field--wide">
            <label className="html-options-modal__checkbox">
              <input
                type="radio"
                name="html-layout-mode"
                checked={draft.layout.mode === 'paginated'}
                onChange={() => updateLayout('mode', 'paginated')}
                disabled={readOnly}
              />
              <span>{t('options.paginated')}</span>
            </label>
            <label className="html-options-modal__checkbox">
              <input
                type="radio"
                name="html-layout-mode"
                checked={draft.layout.mode === 'continuous'}
                onChange={() => updateLayout('mode', 'continuous')}
                disabled={readOnly}
              />
              <span>{t('options.continuous')}</span>
            </label>
          </div>

          {draft.layout.mode === 'continuous' && (
            <>
              <h3 className="html-options-modal__section-title html-options-modal__field--wide">
                {t('htmlOptionsModal.widthSection')}
              </h3>
              <div className="html-options-modal__field html-options-modal__field--wide">
                <label className="html-options-modal__checkbox">
                  <input
                    type="radio"
                    name="html-width-mode"
                    checked={draft.layout.widthMode === 'actual'}
                    onChange={() => updateLayout('widthMode', 'actual')}
                    disabled={readOnly}
                  />
                  <span>{t('options.actualWidth')}</span>
                </label>
                <label className="html-options-modal__checkbox">
                  <input
                    type="radio"
                    name="html-width-mode"
                    checked={draft.layout.widthMode === 'fit'}
                    onChange={() => updateLayout('widthMode', 'fit')}
                    disabled={readOnly}
                  />
                  <span>{t('options.fitWidth')}</span>
                </label>
              </div>
            </>
          )}
        </div>

        <div className="pdf-modal__actions">
          {readOnly ? (
            <button type="button" className="btn btn--primary" onClick={onCancel}>
              {t('actions.done')}
            </button>
          ) : (
            <>
              <div className="pdf-modal__actions__spacer" />
              <button type="button" className="btn btn--secondary" onClick={onCancel}>
                {t('actions.cancel')}
              </button>
              <button type="button" className="btn btn--primary" onClick={handleConfirm}>
                {t('actions.done')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
