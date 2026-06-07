import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  HtmlDecodeOptions,
  HtmlLayoutOptions,
  SourceFormat,
  TargetFormat
} from '../lib/converter'

type BackgroundDecodeOptions = NonNullable<HtmlDecodeOptions['background']>

type SettingsSection = 'pdfPages' | 'pdfOcr' | 'htmlOptions' | 'imageTarget' | 'imageToPdf'

type ImageTargetOptions = {
  maxWidth?: number
  maxHeight?: number
  keepAspectRatio?: boolean
  quality?: number
}

type ImageToPdfOptions = {
  margin?: number
  fit?: 'cover' | 'contain'
  pageMode?: 'auto' | 'single' | 'multi'
}

type SettingsOptions = {
  pdf?: {
    ocr: boolean
    selectedPages?: number[]
  }
  html?: {
    textControl?: HtmlDecodeOptions['textControl']
    background?: BackgroundDecodeOptions
    htmlLayout?: HtmlLayoutOptions
  }
  image?: ImageTargetOptions
  imageToPdf?: ImageToPdfOptions
}

type SettingsModalProps = {
  open: boolean
  source: SourceFormat
  target: TargetFormat
  fileName: string
  status: 'ready' | 'queued' | 'converting' | 'done' | 'failed'
  options?: SettingsOptions
  readOnly?: boolean
  onCancel: () => void
  onConfirm: (next: SettingsOptions) => void
  onOpenPdfPageSelector: () => void
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
  pdf: {
    ocr: boolean
    selectedPages?: number[]
  }
  textControl: TextControlDraft
  background: BackgroundDraft
  layout: LayoutDraft
  image: {
    maxWidth: string
    maxHeight: string
    keepAspectRatio: boolean
    quality: number // Display value 10-100
  }
  imageToPdf: {
    margin: string
    fit: 'cover' | 'contain'
    pageMode: 'auto' | 'single' | 'multi'
  }
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

const DEFAULT_IMAGE_OPTIONS = {
  maxWidth: '',
  maxHeight: '',
  keepAspectRatio: true,
  quality: 92 // Display value
}

const DEFAULT_IMAGE_TO_PDF_OPTIONS = {
  margin: '',
  fit: 'cover' as const,
  pageMode: 'auto' as const
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

const createDraft = (options?: SettingsModalProps['options']): Draft => ({
  pdf: {
    ocr: options?.pdf?.ocr ?? false,
    selectedPages: options?.pdf?.selectedPages
  },
  textControl: createTextControlDraft(options?.html?.textControl),
  background: {
    includeBackground:
      options?.html?.background?.includeBackground ?? DEFAULT_BACKGROUND.includeBackground,
    backgroundQuality:
      options?.html?.background?.backgroundQuality ?? DEFAULT_BACKGROUND.backgroundQuality,
    excludeTextFromBackground:
      options?.html?.background?.excludeTextFromBackground ??
      DEFAULT_BACKGROUND.excludeTextFromBackground
  },
  layout: {
    mode: options?.html?.htmlLayout?.mode ?? DEFAULT_LAYOUT.mode,
    widthMode: options?.html?.htmlLayout?.widthMode ?? DEFAULT_LAYOUT.widthMode
  },
  image: {
    maxWidth: options?.image?.maxWidth?.toString() ?? DEFAULT_IMAGE_OPTIONS.maxWidth,
    maxHeight: options?.image?.maxHeight?.toString() ?? DEFAULT_IMAGE_OPTIONS.maxHeight,
    keepAspectRatio: options?.image?.keepAspectRatio ?? DEFAULT_IMAGE_OPTIONS.keepAspectRatio,
    quality:
      options?.image?.quality !== undefined
        ? Math.round(options.image.quality * 100)
        : DEFAULT_IMAGE_OPTIONS.quality
  },
  imageToPdf: {
    margin: options?.imageToPdf?.margin?.toString() ?? DEFAULT_IMAGE_TO_PDF_OPTIONS.margin,
    fit: options?.imageToPdf?.fit ?? DEFAULT_IMAGE_TO_PDF_OPTIONS.fit,
    pageMode: options?.imageToPdf?.pageMode ?? DEFAULT_IMAGE_TO_PDF_OPTIONS.pageMode
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

const cleanOutput = (draft: Draft): SettingsOptions => {
  const output: SettingsOptions = {}

  // PDF options
  output.pdf = {
    ocr: draft.pdf.ocr,
    selectedPages: draft.pdf.selectedPages
  }

  // HTML options
  const textControl = cleanTextControl(draft.textControl)
  const htmlOutput: NonNullable<SettingsOptions['html']> = {
    background: { ...draft.background },
    htmlLayout: { ...draft.layout }
  }
  if (textControl) {
    htmlOutput.textControl = textControl
  }
  output.html = htmlOutput

  // Image options
  const maxWidth = optionalNumber(draft.image.maxWidth)
  const maxHeight = optionalNumber(draft.image.maxHeight)
  const imageOutput: NonNullable<SettingsOptions['image']> = {
    keepAspectRatio: draft.image.keepAspectRatio,
    quality: draft.image.quality / 100
  }
  if (maxWidth !== undefined) imageOutput.maxWidth = maxWidth
  if (maxHeight !== undefined) imageOutput.maxHeight = maxHeight
  output.image = imageOutput

  // Image to PDF options
  const margin = optionalNumber(draft.imageToPdf.margin)
  const imageToPdfOutput: NonNullable<SettingsOptions['imageToPdf']> = {
    fit: draft.imageToPdf.fit,
    pageMode: draft.imageToPdf.pageMode
  }
  if (margin !== undefined) imageToPdfOutput.margin = margin
  output.imageToPdf = imageToPdfOutput

  return output
}

function getSettingsSections(
  source: SourceFormat,
  target: TargetFormat,
  _fileName: string,
  _status: 'ready' | 'queued' | 'converting' | 'done' | 'failed'
): SettingsSection[] {
  const sections: SettingsSection[] = []

  if (source === 'pdf') {
    sections.push('pdfPages')
    if (target === 'pdf') {
      sections.push('pdfOcr')
    }
  }

  if (target === 'html') {
    sections.push('htmlOptions')
  }

  if (['png', 'jpg', 'webp'].includes(target)) {
    sections.push('imageTarget')
  }

  if (source === 'image' && target === 'pdf') {
    sections.push('imageToPdf')
  }

  return sections
}

export type { SettingsModalProps, SettingsOptions, SettingsSection }
export { getSettingsSections }

export default function SettingsModal({
  open,
  source,
  target,
  fileName,
  status,
  options,
  readOnly = false,
  onCancel,
  onConfirm,
  onOpenPdfPageSelector
}: SettingsModalProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<Draft>(() => createDraft(options))

  const sections = getSettingsSections(source, target, fileName, status)

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

  const updatePdf = <Key extends keyof Draft['pdf']>(key: Key, value: Draft['pdf'][Key]) => {
    setDraft(prev => ({ ...prev, pdf: { ...prev.pdf, [key]: value } }))
  }

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

  const updateImage = <Key extends keyof Draft['image']>(key: Key, value: Draft['image'][Key]) => {
    setDraft(prev => ({ ...prev, image: { ...prev.image, [key]: value } }))
  }

  const updateImageToPdf = <Key extends keyof Draft['imageToPdf']>(
    key: Key,
    value: Draft['imageToPdf'][Key]
  ) => {
    setDraft(prev => ({ ...prev, imageToPdf: { ...prev.imageToPdf, [key]: value } }))
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel()
    }
  }

  const handleConfirm = () => {
    onConfirm(cleanOutput(draft))
  }

  if (!open || sections.length === 0) return null

  const titleId = 'settings-modal-title'
  const hasMultipleSections = sections.length > 1

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="pdf-modal-overlay"
      onClick={handleOverlayClick}
      onKeyDown={e => e.key === 'Escape' && onCancel()}
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <div
        className="pdf-modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={e => e.stopPropagation()}
      >
        <div className="pdf-modal__header">
          <h2 id={titleId}>{readOnly ? t('settingsModal.viewTitle') : t('settingsModal.title')}</h2>
        </div>

        <div
          className={`settings-modal__body ${hasMultipleSections ? 'settings-modal__body--columns' : ''}`}
        >
          {/* PDF Pages Section */}
          {sections.includes('pdfPages') && (
            <div className="settings-modal__section">
              <h3 className="settings-modal__section-title">{t('settingsModal.pdfPagesTitle')}</h3>
              {draft.pdf.selectedPages !== undefined && (
                <div className="settings-modal__summary">
                  {t('options.pdfPages.selectedCount', {
                    count: draft.pdf.selectedPages.length
                  })}
                </div>
              )}
              {!readOnly && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={onOpenPdfPageSelector}
                  disabled={readOnly}
                >
                  {t('actions.selectPages')}
                </button>
              )}
            </div>
          )}

          {/* PDF OCR Section */}
          {sections.includes('pdfOcr') && (
            <div className="settings-modal__section">
              <h3 className="settings-modal__section-title">{t('settingsModal.pdfOcrTitle')}</h3>
              <label className="settings-modal__checkbox">
                <input
                  type="checkbox"
                  checked={draft.pdf.ocr}
                  onChange={event => updatePdf('ocr', event.target.checked)}
                  disabled={readOnly}
                />
                <span>{t('options.ocr')}</span>
              </label>
            </div>
          )}

          {/* HTML Options Section */}
          {sections.includes('htmlOptions') && (
            <div className="settings-modal__section">
              <h3 className="settings-modal__section-title">
                {t('settingsModal.htmlOptionsTitle')}
              </h3>

              {/* Background */}
              <h4 className="settings-modal__subsection-title">
                {t('htmlOptionsModal.backgroundSection')}
              </h4>
              <label className="settings-modal__checkbox settings-modal__field--wide">
                <input
                  type="checkbox"
                  checked={draft.background.includeBackground}
                  onChange={event => updateBackground('includeBackground', event.target.checked)}
                  disabled={readOnly}
                />
                <span>{t('options.includeBackground')}</span>
              </label>

              <label className="settings-modal__field settings-modal__field--wide">
                <span>{t('options.backgroundQuality')}</span>
                <select
                  value={String(draft.background.backgroundQuality)}
                  onChange={event =>
                    updateBackground('backgroundQuality', Number(event.target.value))
                  }
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

              <label className="settings-modal__checkbox settings-modal__field--wide">
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

              {/* Text Controls */}
              <h4 className="settings-modal__subsection-title">
                {t('htmlOptionsModal.textControlSection')}
              </h4>
              <label className="settings-modal__field">
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

              <label className="settings-modal__field">
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

              <label className="settings-modal__field">
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

              <label className="settings-modal__field">
                <span>{t('options.color')}</span>
                <input
                  type="text"
                  value={draft.textControl.color}
                  onChange={event => updateTextControl('color', event.target.value)}
                  placeholder="#2d1f00"
                  disabled={readOnly}
                />
              </label>

              <label className="settings-modal__field settings-modal__field--wide">
                <span>{t('options.fontFamily')}</span>
                <input
                  type="text"
                  value={draft.textControl.fontFamily}
                  onChange={event => updateTextControl('fontFamily', event.target.value)}
                  placeholder={t('options.defaultValue')}
                  disabled={readOnly}
                />
              </label>

              <label className="settings-modal__field">
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

              <label className="settings-modal__field">
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

              <label className="settings-modal__checkbox settings-modal__field--wide">
                <input
                  type="checkbox"
                  checked={draft.textControl.italic}
                  onChange={event => updateTextControl('italic', event.target.checked)}
                  disabled={readOnly}
                />
                <span>{t('options.italic')}</span>
              </label>

              {/* Layout */}
              <h4 className="settings-modal__subsection-title">
                {t('htmlOptionsModal.layoutSection')}
              </h4>
              <div className="settings-modal__field settings-modal__field--wide">
                <label className="settings-modal__checkbox">
                  <input
                    type="radio"
                    name="html-layout-mode"
                    checked={draft.layout.mode === 'paginated'}
                    onChange={() => updateLayout('mode', 'paginated')}
                    disabled={readOnly}
                  />
                  <span>{t('options.paginated')}</span>
                </label>
                <label className="settings-modal__checkbox">
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
                  <h4 className="settings-modal__subsection-title">
                    {t('htmlOptionsModal.widthSection')}
                  </h4>
                  <div className="settings-modal__field settings-modal__field--wide">
                    <label className="settings-modal__checkbox">
                      <input
                        type="radio"
                        name="html-width-mode"
                        checked={draft.layout.widthMode === 'actual'}
                        onChange={() => updateLayout('widthMode', 'actual')}
                        disabled={readOnly}
                      />
                      <span>{t('options.actualWidth')}</span>
                    </label>
                    <label className="settings-modal__checkbox">
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
          )}

          {/* Image Target Options Section */}
          {sections.includes('imageTarget') && (
            <div className="settings-modal__section">
              <h3 className="settings-modal__section-title">
                {t('settingsModal.imageOptionsTitle')}
              </h3>

              <label className="settings-modal__field">
                <span>{t('settingsModal.maxWidth')}</span>
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={draft.image.maxWidth}
                  onChange={event => updateImage('maxWidth', event.target.value)}
                  placeholder={t('options.defaultValue')}
                  disabled={readOnly}
                  aria-label={t('settingsModal.maxWidth')}
                />
              </label>

              <label className="settings-modal__field">
                <span>{t('settingsModal.maxHeight')}</span>
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={draft.image.maxHeight}
                  onChange={event => updateImage('maxHeight', event.target.value)}
                  placeholder={t('options.defaultValue')}
                  disabled={readOnly}
                  aria-label={t('settingsModal.maxHeight')}
                />
              </label>

              <label className="settings-modal__checkbox settings-modal__field--wide">
                <input
                  type="checkbox"
                  checked={draft.image.keepAspectRatio}
                  onChange={event => updateImage('keepAspectRatio', event.target.checked)}
                  disabled={readOnly}
                />
                <span>{t('settingsModal.keepAspectRatio')}</span>
              </label>

              {target !== 'png' && (
                <label className="settings-modal__field settings-modal__field--wide">
                  <span>{t('settingsModal.quality')}</span>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={draft.image.quality}
                    onChange={event => updateImage('quality', Number(event.target.value))}
                    disabled={readOnly}
                    aria-label={t('settingsModal.quality')}
                  />
                  <span className="settings-modal__quality-value">{draft.image.quality}</span>
                </label>
              )}

              <div className="settings-modal__estimate">{t('settingsModal.heuristicEstimate')}</div>
            </div>
          )}

          {/* Image to PDF Options Section */}
          {sections.includes('imageToPdf') && (
            <div className="settings-modal__section">
              <h3 className="settings-modal__section-title">
                {t('settingsModal.imageToPdfTitle')}
              </h3>

              <label className="settings-modal__field">
                <span>{t('settingsModal.margin')}</span>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={draft.imageToPdf.margin}
                  onChange={event => updateImageToPdf('margin', event.target.value)}
                  placeholder={t('options.defaultValue')}
                  disabled={readOnly}
                  aria-label={t('settingsModal.margin')}
                />
              </label>

              <label className="settings-modal__field">
                <span>{t('settingsModal.fit')}</span>
                <select
                  value={draft.imageToPdf.fit}
                  onChange={event =>
                    updateImageToPdf('fit', event.target.value as 'cover' | 'contain')
                  }
                  disabled={readOnly}
                >
                  <option value="cover">{t('settingsModal.fitCover')}</option>
                  <option value="contain">{t('settingsModal.fitContain')}</option>
                </select>
              </label>

              <label className="settings-modal__field">
                <span>{t('settingsModal.pageMode')}</span>
                <select
                  value={draft.imageToPdf.pageMode}
                  onChange={event =>
                    updateImageToPdf('pageMode', event.target.value as 'auto' | 'single' | 'multi')
                  }
                  disabled={readOnly}
                >
                  <option value="auto">{t('settingsModal.pageModeAuto')}</option>
                  <option value="single">{t('settingsModal.pageModeSingle')}</option>
                  <option value="multi">{t('settingsModal.pageModeMulti')}</option>
                </select>
              </label>
            </div>
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
