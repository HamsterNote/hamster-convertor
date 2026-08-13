import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  ExifCategory,
  HtmlDecodeOptions,
  HtmlEncodeOptions,
  HtmlLayoutOptions,
  SourceFormat,
  TargetFormat,
  TxtImageOptions
} from '../lib/converter'
import PdfPageSelectorInline from './PdfPageSelectorInline'

type BackgroundDecodeOptions = NonNullable<HtmlDecodeOptions['background']>

type SettingsSection =
  | 'pdfPages'
  | 'pdfOcr'
  | 'htmlOptions'
  | 'htmlEncodeOptions'
  | 'imageTarget'
  | 'txtImage'
  | 'imageToPdf'
  | 'pdfPageSetup'
  | 'markdown'

type ImageTargetOptions = {
  maxWidth?: number
  maxHeight?: number
  keepAspectRatio?: boolean
  quality?: number
  removeExif?: {
    enabled: boolean
    categories: ExifCategory[]
  }
}

type ImageToPdfOptions = {
  margin?: number
  fit?: 'original' | 'showAll'
  pageMode?: 'auto' | 'single' | 'multi'
  rotationDeg?: 0 | 90 | 180 | 270
  scalePercent?: number
}

type PdfPageSetupOptions = {
  paperSize?: 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal' | 'B5' | 'auto'
  orientation?: 'portrait' | 'landscape' | 'auto'
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
  htmlEncode?: HtmlEncodeOptions
  image?: ImageTargetOptions
  txtImage?: TxtImageOptions
  imageToPdf?: ImageToPdfOptions
  pdfPageSetup?: PdfPageSetupOptions
  markdown?: {
    txtMode?: 'raw' | 'plain'
  }
}

type SettingsModalFileProps = {
  open: boolean
  settingsScope?: never
  source: SourceFormat
  target: TargetFormat
  fileName: string
  file: File
  status: 'ready' | 'queued' | 'converting' | 'done' | 'failed'
  options?: SettingsOptions
  readOnly?: boolean
  onCancel: () => void
  onConfirm: (next: SettingsOptions) => void
}

type SettingsModalGroupTargetProps = {
  open: boolean
  settingsScope: 'group-target'
  visibleSectionsOverride: SettingsSection[]
  target: TargetFormat
  options?: SettingsOptions
  readOnly?: boolean
  onCancel: () => void
  onConfirm: (next: SettingsOptions) => void
}

type SettingsModalProps = SettingsModalFileProps | SettingsModalGroupTargetProps

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
}

type HtmlEncodeDraft = {
  excludeSelectors: string
  snapshotWidth: string
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
  htmlEncode: HtmlEncodeDraft
  layout: LayoutDraft
  image: {
    maxWidth: string
    maxHeight: string
    keepAspectRatio: boolean
    quality: number // Display value 10-100
    removeExifEnabled: boolean
    removeExifCategories: ExifCategory[]
  }
  txtImage: {
    textColor: string
    backgroundColor: string
    fontSizePx: string
    imageWidthPx: string
    paddingPx: string
    lineHeightPx: string
  }
  imageToPdf: {
    margin: string
    fit: 'original' | 'showAll'
    pageMode: 'auto' | 'single' | 'multi'
    rotationDeg: 0 | 90 | 180 | 270
    scalePercent: string
  }
  pdfPageSetup: {
    paperSize: 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal' | 'B5' | 'auto'
    orientation: 'portrait' | 'landscape' | 'auto'
  }
  markdown: {
    txtMode: 'raw' | 'plain'
  }
}

const EXIF_CATEGORY_OPTIONS = [
  'all',
  'geolocation',
  'camera',
  'datetime',
  'software',
  'authorCopyright'
] as const satisfies readonly ExifCategory[]

const ROTATION_DEGREE_OPTIONS = [0, 90, 180, 270] as const

const HTML_BACKGROUND_QUALITY_OPTIONS = [
  { value: 0.3, labelKey: 'options.backgroundQualityLow' },
  { value: 0.6, labelKey: 'options.backgroundQualityMedium' },
  { value: 0.85, labelKey: 'options.backgroundQualityHigh' },
  { value: 1, labelKey: 'options.backgroundQualityUltra' }
] as const

const DEFAULT_BACKGROUND: BackgroundDraft = {
  includeBackground: true,
  backgroundQuality: 0.85
}

const DEFAULT_HTML_ENCODE: HtmlEncodeDraft = {
  excludeSelectors: '',
  snapshotWidth: ''
}

const DEFAULT_LAYOUT: LayoutDraft = {
  mode: 'paginated',
  widthMode: 'actual'
}

const DEFAULT_IMAGE_OPTIONS = {
  maxWidth: '',
  maxHeight: '',
  keepAspectRatio: true,
  quality: 92, // Display value
  removeExifEnabled: false,
  removeExifCategories: [] as ExifCategory[]
}

const DEFAULT_IMAGE_TO_PDF_OPTIONS = {
  margin: '',
  fit: 'original' as const,
  pageMode: 'auto' as const,
  rotationDeg: 0 as const,
  scalePercent: '100'
}

const DEFAULT_PDF_PAGE_SETUP = {
  paperSize: 'A4' as const,
  orientation: 'auto' as const
}

const DEFAULT_TXT_IMAGE_OPTIONS: TxtImageOptions = {
  textColor: '#000000',
  backgroundColor: '#ffffff',
  fontSizePx: 16,
  imageWidthPx: 800,
  paddingPx: 20,
  lineHeightPx: 24
}

const normalizeExifCategories = (categories: ExifCategory[]): ExifCategory[] =>
  categories.includes('all') ? ['all'] : [...new Set(categories)]

const getNextExifCategories = (
  current: ExifCategory[],
  category: ExifCategory,
  checked: boolean
): ExifCategory[] => {
  if (!checked) {
    return current.filter(item => item !== category)
  }

  if (category === 'all') {
    return ['all']
  }

  return [...current.filter(item => item !== 'all'), category]
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
      options?.html?.background?.backgroundQuality ?? DEFAULT_BACKGROUND.backgroundQuality
  },
  htmlEncode: {
    excludeSelectors:
      options?.htmlEncode?.excludeSelectors?.join('\n') ?? DEFAULT_HTML_ENCODE.excludeSelectors,
    snapshotWidth:
      options?.htmlEncode?.snapshotWidth?.toString() ?? DEFAULT_HTML_ENCODE.snapshotWidth
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
        : DEFAULT_IMAGE_OPTIONS.quality,
    removeExifEnabled:
      options?.image?.removeExif?.enabled ?? DEFAULT_IMAGE_OPTIONS.removeExifEnabled,
    removeExifCategories: normalizeExifCategories(
      options?.image?.removeExif?.categories ?? DEFAULT_IMAGE_OPTIONS.removeExifCategories
    )
  },
  txtImage: {
    textColor: options?.txtImage?.textColor ?? DEFAULT_TXT_IMAGE_OPTIONS.textColor,
    backgroundColor:
      options?.txtImage?.backgroundColor ?? DEFAULT_TXT_IMAGE_OPTIONS.backgroundColor,
    fontSizePx: (options?.txtImage?.fontSizePx ?? DEFAULT_TXT_IMAGE_OPTIONS.fontSizePx).toString(),
    imageWidthPx: (
      options?.txtImage?.imageWidthPx ?? DEFAULT_TXT_IMAGE_OPTIONS.imageWidthPx
    ).toString(),
    paddingPx: (options?.txtImage?.paddingPx ?? DEFAULT_TXT_IMAGE_OPTIONS.paddingPx).toString(),
    lineHeightPx: (
      options?.txtImage?.lineHeightPx ?? DEFAULT_TXT_IMAGE_OPTIONS.lineHeightPx
    ).toString()
  },
  imageToPdf: {
    margin: options?.imageToPdf?.margin?.toString() ?? DEFAULT_IMAGE_TO_PDF_OPTIONS.margin,
    fit: options?.imageToPdf?.fit ?? DEFAULT_IMAGE_TO_PDF_OPTIONS.fit,
    pageMode: options?.imageToPdf?.pageMode ?? DEFAULT_IMAGE_TO_PDF_OPTIONS.pageMode,
    rotationDeg: options?.imageToPdf?.rotationDeg ?? DEFAULT_IMAGE_TO_PDF_OPTIONS.rotationDeg,
    scalePercent:
      options?.imageToPdf?.scalePercent?.toString() ?? DEFAULT_IMAGE_TO_PDF_OPTIONS.scalePercent
  },
  pdfPageSetup: {
    paperSize: options?.pdfPageSetup?.paperSize ?? DEFAULT_PDF_PAGE_SETUP.paperSize,
    orientation: options?.pdfPageSetup?.orientation ?? DEFAULT_PDF_PAGE_SETUP.orientation
  },
  markdown: {
    txtMode: options?.markdown?.txtMode ?? 'plain'
  }
})

const optionalNumber = (value: string): number | undefined => {
  if (value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const optionalImageDimension = (value: string): number | undefined => {
  const parsed = optionalNumber(value)
  return parsed !== undefined && parsed >= 1 ? Math.floor(parsed) : undefined
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

const cleanHtmlEncode = (draft: HtmlEncodeDraft): HtmlEncodeOptions | undefined => {
  const excludeSelectors = [
    ...new Set(
      draft.excludeSelectors
        .split(/[\n,]+/)
        .map(selector => selector.trim())
        .filter(Boolean)
    )
  ]
  const snapshotWidth = optionalImageDimension(draft.snapshotWidth)
  const output: HtmlEncodeOptions = {}

  if (excludeSelectors.length > 0) output.excludeSelectors = excludeSelectors
  if (snapshotWidth !== undefined) output.snapshotWidth = snapshotWidth

  return Object.keys(output).length > 0 ? output : undefined
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

  const htmlEncode = cleanHtmlEncode(draft.htmlEncode)
  if (htmlEncode) {
    output.htmlEncode = htmlEncode
  }

  // Image options
  const maxWidth = optionalImageDimension(draft.image.maxWidth)
  const maxHeight = optionalImageDimension(draft.image.maxHeight)
  const imageOutput: NonNullable<SettingsOptions['image']> = {
    keepAspectRatio: draft.image.keepAspectRatio,
    quality: draft.image.quality / 100,
    removeExif: {
      enabled: draft.image.removeExifEnabled,
      categories: draft.image.removeExifEnabled
        ? normalizeExifCategories(draft.image.removeExifCategories)
        : []
    }
  }
  if (maxWidth !== undefined) imageOutput.maxWidth = maxWidth
  if (maxHeight !== undefined) imageOutput.maxHeight = maxHeight
  output.image = imageOutput

  output.txtImage = {
    textColor: draft.txtImage.textColor,
    backgroundColor: draft.txtImage.backgroundColor,
    fontSizePx: optionalNumber(draft.txtImage.fontSizePx) ?? DEFAULT_TXT_IMAGE_OPTIONS.fontSizePx,
    imageWidthPx:
      optionalNumber(draft.txtImage.imageWidthPx) ?? DEFAULT_TXT_IMAGE_OPTIONS.imageWidthPx,
    paddingPx: optionalNumber(draft.txtImage.paddingPx) ?? DEFAULT_TXT_IMAGE_OPTIONS.paddingPx,
    lineHeightPx:
      optionalNumber(draft.txtImage.lineHeightPx) ?? DEFAULT_TXT_IMAGE_OPTIONS.lineHeightPx
  }

  // Image to PDF options
  const margin = optionalNumber(draft.imageToPdf.margin)
  const scalePercent = optionalNumber(draft.imageToPdf.scalePercent)
  const imageToPdfOutput: NonNullable<SettingsOptions['imageToPdf']> = {
    fit: draft.imageToPdf.fit,
    pageMode: draft.imageToPdf.pageMode,
    rotationDeg: draft.imageToPdf.rotationDeg,
    scalePercent: scalePercent ?? 100
  }
  if (margin !== undefined) imageToPdfOutput.margin = margin
  output.imageToPdf = imageToPdfOutput

  output.pdfPageSetup = {
    paperSize: draft.pdfPageSetup.paperSize,
    orientation: draft.pdfPageSetup.orientation
  }

  output.markdown = {
    txtMode: draft.markdown.txtMode
  }

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

  if (source === 'html') {
    sections.push('htmlEncodeOptions')
  }

  if (source === 'txt' && ['png', 'jpg', 'webp'].includes(target)) {
    sections.push('txtImage')
  } else if (['png', 'jpg', 'webp'].includes(target)) {
    sections.push('imageTarget')
  }

  if (source === 'image' && target === 'pdf') {
    sections.push('imageToPdf')
  }

  if (target === 'pdf') {
    sections.push('pdfPageSetup')
  }

  if (source === 'markdown' && target === 'txt') {
    sections.push('markdown')
  }

  return sections
}

const SECTION_ID_MAP: Record<SettingsSection, string> = {
  pdfPages: 'settings-section-pdf-pages',
  pdfOcr: 'settings-section-pdf-ocr',
  pdfPageSetup: 'settings-section-pdf-page-setup',
  htmlOptions: 'settings-section-html-options',
  htmlEncodeOptions: 'settings-section-html-encode-options',
  imageTarget: 'settings-section-image-target',
  txtImage: 'settings-section-txt-image',
  imageToPdf: 'settings-section-image-to-pdf',
  markdown: 'settings-section-markdown'
}

const SECTION_TITLE_KEY_MAP: Record<SettingsSection, string> = {
  pdfPages: 'settingsModal.pdfPagesTitle',
  pdfOcr: 'settingsModal.pdfOcrTitle',
  pdfPageSetup: 'settingsModal.pdfPageSetupTitle',
  htmlOptions: 'settingsModal.htmlOptionsTitle',
  htmlEncodeOptions: 'settingsModal.htmlEncodeOptionsTitle',
  imageTarget: 'settingsModal.imageOptionsTitle',
  txtImage: 'settingsModal.txtImageOptionsTitle',
  imageToPdf: 'settingsModal.imageToPdfTitle',
  markdown: 'settingsModal.markdownTitle'
}

export type { SettingsModalProps, SettingsOptions, SettingsSection }
export { getSettingsSections }

type SettingsModalNavProps = {
  sections: SettingsSection[]
  t: (key: string) => string
}

function SettingsModalNav({ sections, t }: SettingsModalNavProps) {
  if (sections.length <= 1) return null

  return (
    <nav className="settings-modal__nav">
      {sections.map(section => (
        <button
          key={section}
          type="button"
          className="settings-modal__nav-button"
          aria-controls={SECTION_ID_MAP[section]}
          onClick={() => {
            const el = document.getElementById(SECTION_ID_MAP[section])
            el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
          }}
        >
          {t(SECTION_TITLE_KEY_MAP[section])}
        </button>
      ))}
    </nav>
  )
}

const getLayoutClassName = (hasNav: boolean): string =>
  hasNav ? 'settings-modal__layout' : 'settings-modal__layout settings-modal__layout--no-nav'

const getLayoutStyle = (hasNav: boolean): CSSProperties | undefined =>
  hasNav ? undefined : { gridTemplateColumns: 'minmax(0, 1fr)' }

const resolveSections = (props: SettingsModalProps): SettingsSection[] =>
  props.settingsScope === 'group-target'
    ? props.visibleSectionsOverride
    : getSettingsSections(props.source, props.target, props.fileName, props.status)

const createInitialCollapsedSections = (): Record<SettingsSection, boolean> => ({
  pdfPages: false,
  pdfOcr: false,
  pdfPageSetup: false,
  htmlOptions: false,
  htmlEncodeOptions: false,
  imageTarget: false,
  txtImage: false,
  imageToPdf: false,
  markdown: false
})

// Markdown 设置段（抽出以降低 SettingsModal 主函数认知复杂度）
type MarkdownSectionProps = {
  t: (key: string) => string
  collapsed: boolean
  onToggle: () => void
  txtMode: 'raw' | 'plain'
  onTxtModeChange: (mode: 'raw' | 'plain') => void
  readOnly: boolean
}

const MarkdownSection = ({
  t,
  collapsed,
  onToggle,
  txtMode,
  onTxtModeChange,
  readOnly
}: MarkdownSectionProps) => (
  <div id={SECTION_ID_MAP.markdown} className="settings-modal__section">
    <header className="settings-modal__section-header">
      <button
        type="button"
        className="settings-modal__section-toggle"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand' : 'Collapse'}
      >
        {collapsed ? '▶' : '▼'}
      </button>
      <h3 className="settings-modal__section-title">{t('settingsModal.markdownTitle')}</h3>
    </header>
    {!collapsed && (
      <div className="settings-modal__field-group">
        <label className="settings-modal__field settings-modal__field--wide">
          <span>{t('settingsModal.markdownTxtMode')}</span>
          <div className="settings-modal__radio-group">
            <label className="settings-modal__radio">
              <input
                type="radio"
                name="markdown-txt-mode"
                value="raw"
                checked={txtMode === 'raw'}
                onChange={() => onTxtModeChange('raw')}
                disabled={readOnly}
              />
              <span>{t('settingsModal.markdownTxtModeRaw')}</span>
            </label>
            <label className="settings-modal__radio">
              <input
                type="radio"
                name="markdown-txt-mode"
                value="plain"
                checked={txtMode === 'plain'}
                onChange={() => onTxtModeChange('plain')}
                disabled={readOnly}
              />
              <span>{t('settingsModal.markdownTxtModePlain')}</span>
            </label>
          </div>
        </label>
        <div className="settings-modal__estimate settings-modal__field--wide">
          {t('settingsModal.markdownTxtModeHelp')}
        </div>
      </div>
    )}
  </div>
)

// PDF 页面设置 section（纸张尺寸 + 方向）— 提取为独立组件以降低主函数复杂度
type PdfPageSetupSectionProps = {
  t: (key: string) => string
  collapsed: boolean
  onToggle: () => void
  paperSize: Draft['pdfPageSetup']['paperSize']
  orientation: Draft['pdfPageSetup']['orientation']
  onPaperSizeChange: (value: Draft['pdfPageSetup']['paperSize']) => void
  onOrientationChange: (value: Draft['pdfPageSetup']['orientation']) => void
  readOnly: boolean
}

const PdfPageSetupSection = ({
  t,
  collapsed,
  onToggle,
  paperSize,
  orientation,
  onPaperSizeChange,
  onOrientationChange,
  readOnly
}: PdfPageSetupSectionProps) => (
  <div id={SECTION_ID_MAP.pdfPageSetup} className="settings-modal__section">
    <button
      type="button"
      className="settings-modal__section-header"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-label={collapsed ? 'Expand' : 'Collapse'}
    >
      <span className="settings-modal__collapse-btn" aria-hidden="true">
        {collapsed ? '▶' : '▼'}
      </span>
      <span className="settings-modal__section-title">{t('settingsModal.pdfPageSetupTitle')}</span>
    </button>
    {!collapsed && (
      <div className="settings-modal__section-content">
        <label className="settings-modal__field">
          <span>{t('settingsModal.paperSize')}</span>
          <select
            value={paperSize}
            onChange={event =>
              onPaperSizeChange(event.target.value as Draft['pdfPageSetup']['paperSize'])
            }
            disabled={readOnly}
          >
            <option value="A4">{t('settingsModal.paperSizeA4')}</option>
            <option value="A3">{t('settingsModal.paperSizeA3')}</option>
            <option value="A5">{t('settingsModal.paperSizeA5')}</option>
            <option value="Letter">{t('settingsModal.paperSizeLetter')}</option>
            <option value="Legal">{t('settingsModal.paperSizeLegal')}</option>
            <option value="B5">{t('settingsModal.paperSizeB5')}</option>
            <option value="auto">{t('settingsModal.paperSizeAuto')}</option>
          </select>
        </label>

        <label className="settings-modal__field">
          <span>{t('settingsModal.orientation')}</span>
          <select
            value={orientation}
            onChange={event =>
              onOrientationChange(event.target.value as Draft['pdfPageSetup']['orientation'])
            }
            disabled={readOnly}
          >
            <option value="portrait">{t('settingsModal.orientationPortrait')}</option>
            <option value="landscape">{t('settingsModal.orientationLandscape')}</option>
            <option value="auto">{t('settingsModal.orientationAuto')}</option>
          </select>
        </label>
      </div>
    )}
  </div>
)

export default function SettingsModal(props: SettingsModalProps) {
  const { t } = useTranslation()
  const { open, target, options, readOnly: readOnlyProp, onCancel, onConfirm } = props
  const readOnly = readOnlyProp ?? false
  const sections = resolveSections(props)

  const [draft, setDraft] = useState<Draft>(() => createDraft(options))
  const [collapsedSections, setCollapsedSections] = useState<Record<SettingsSection, boolean>>(
    createInitialCollapsedSections
  )

  const toggleSection = (section: SettingsSection) => {
    setCollapsedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

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

  const updateHtmlEncode = <Key extends keyof HtmlEncodeDraft>(
    key: Key,
    value: HtmlEncodeDraft[Key]
  ) => {
    setDraft(prev => ({ ...prev, htmlEncode: { ...prev.htmlEncode, [key]: value } }))
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

  const updateTxtImage = <Key extends keyof Draft['txtImage']>(
    key: Key,
    value: Draft['txtImage'][Key]
  ) => {
    setDraft(prev => ({ ...prev, txtImage: { ...prev.txtImage, [key]: value } }))
  }

  const toggleExifCategory = (category: ExifCategory, checked: boolean) => {
    setDraft(prev => {
      const current = prev.image.removeExifCategories
      const categories = getNextExifCategories(current, category, checked)

      return {
        ...prev,
        image: {
          ...prev.image,
          removeExifCategories: normalizeExifCategories(categories)
        }
      }
    })
  }

  const updateImageToPdf = <Key extends keyof Draft['imageToPdf']>(
    key: Key,
    value: Draft['imageToPdf'][Key]
  ) => {
    setDraft(prev => ({ ...prev, imageToPdf: { ...prev.imageToPdf, [key]: value } }))
  }

  // 更新 PDF 页面设置（纸张尺寸、方向）
  const updatePdfPageSetup = <Key extends keyof Draft['pdfPageSetup']>(
    key: Key,
    value: Draft['pdfPageSetup'][Key]
  ) => {
    setDraft(prev => ({ ...prev, pdfPageSetup: { ...prev.pdfPageSetup, [key]: value } }))
  }

  // 更新 Markdown 设置（如 txt 输出模式）
  const updateMarkdown = <Key extends keyof Draft['markdown']>(
    key: Key,
    value: Draft['markdown'][Key]
  ) => {
    setDraft(prev => ({ ...prev, markdown: { ...prev.markdown, [key]: value } }))
  }

  const handleOverlayClick = () => onCancel()

  const handleConfirm = () => {
    onConfirm(cleanOutput(draft))
  }

  if (!open || sections.length === 0) return null

  const titleId = 'settings-modal-title'

  return (
    <div className="pdf-modal-overlay">
      <button
        type="button"
        className="pdf-modal-overlay__backdrop"
        aria-hidden="true"
        tabIndex={-1}
        onClick={handleOverlayClick}
      />
      <div
        className="pdf-modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="pdf-modal__header">
          <h2 id={titleId}>{readOnly ? t('settingsModal.viewTitle') : t('settingsModal.title')}</h2>
        </div>

        <div
          className={getLayoutClassName(sections.length > 1)}
          style={getLayoutStyle(sections.length > 1)}
        >
          <SettingsModalNav sections={sections} t={t} />

          <div className="settings-modal__body">
            {/* PDF Pages Section */}
            {sections.includes('pdfPages') && 'file' in props && (
              <div id={SECTION_ID_MAP.pdfPages} className="settings-modal__section">
                <PdfPageSelectorInline
                  file={props.file}
                  selectedPages={draft.pdf.selectedPages ?? []}
                  readOnly={readOnly}
                  onSelectedPagesChange={pages => updatePdf('selectedPages', pages)}
                />
              </div>
            )}

            {/* PDF OCR Section */}
            {sections.includes('pdfOcr') && (
              <div id={SECTION_ID_MAP.pdfOcr} className="settings-modal__section">
                <button
                  type="button"
                  className="settings-modal__section-header"
                  onClick={() => toggleSection('pdfOcr')}
                  aria-expanded={!collapsedSections.pdfOcr}
                  aria-label={collapsedSections.pdfOcr ? 'Expand' : 'Collapse'}
                >
                  <span className="settings-modal__collapse-btn" aria-hidden="true">
                    {collapsedSections.pdfOcr ? '▶' : '▼'}
                  </span>
                  <span className="settings-modal__section-title">
                    {t('settingsModal.pdfOcrTitle')}
                  </span>
                </button>
                {!collapsedSections.pdfOcr && (
                  <div className="settings-modal__section-content">
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
              </div>
            )}

            {/* HTML Options Section */}
            {sections.includes('htmlOptions') && (
              <div id={SECTION_ID_MAP.htmlOptions} className="settings-modal__section">
                <button
                  type="button"
                  className="settings-modal__section-header"
                  onClick={() => toggleSection('htmlOptions')}
                  aria-expanded={!collapsedSections.htmlOptions}
                  aria-label={collapsedSections.htmlOptions ? 'Expand' : 'Collapse'}
                >
                  <span className="settings-modal__collapse-btn" aria-hidden="true">
                    {collapsedSections.htmlOptions ? '▶' : '▼'}
                  </span>
                  <span className="settings-modal__section-title">
                    {t('settingsModal.htmlOptionsTitle')}
                  </span>
                </button>
                {!collapsedSections.htmlOptions && (
                  <div className="settings-modal__section-content">
                    {/* Background */}
                    <h4 className="settings-modal__subsection-title">
                      {t('htmlOptionsModal.backgroundSection')}
                    </h4>
                    <label className="settings-modal__checkbox settings-modal__field--wide">
                      <input
                        type="checkbox"
                        checked={draft.background.includeBackground}
                        onChange={event =>
                          updateBackground('includeBackground', event.target.checked)
                        }
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
              </div>
            )}

            {sections.includes('htmlEncodeOptions') && (
              <div id={SECTION_ID_MAP.htmlEncodeOptions} className="settings-modal__section">
                <button
                  type="button"
                  className="settings-modal__section-header"
                  onClick={() => toggleSection('htmlEncodeOptions')}
                  aria-expanded={!collapsedSections.htmlEncodeOptions}
                  aria-label={collapsedSections.htmlEncodeOptions ? 'Expand' : 'Collapse'}
                >
                  <span className="settings-modal__collapse-btn" aria-hidden="true">
                    {collapsedSections.htmlEncodeOptions ? '▶' : '▼'}
                  </span>
                  <span className="settings-modal__section-title">
                    {t('settingsModal.htmlEncodeOptionsTitle')}
                  </span>
                </button>
                {!collapsedSections.htmlEncodeOptions && (
                  <div className="settings-modal__section-content">
                    <label className="settings-modal__field settings-modal__field--wide">
                      <span>{t('settingsModal.excludeSelectors')}</span>
                      <textarea
                        value={draft.htmlEncode.excludeSelectors}
                        onChange={event => updateHtmlEncode('excludeSelectors', event.target.value)}
                        placeholder="script, style, .ads"
                        disabled={readOnly}
                        aria-label={t('settingsModal.excludeSelectors')}
                      />
                    </label>

                    <div className="settings-modal__estimate settings-modal__field--wide">
                      {t('settingsModal.excludeSelectorsHelp')}
                    </div>

                    <label className="settings-modal__field">
                      <span>{t('settingsModal.snapshotWidth')}</span>
                      <input
                        type="number"
                        min="1"
                        inputMode="numeric"
                        value={draft.htmlEncode.snapshotWidth}
                        onChange={event => updateHtmlEncode('snapshotWidth', event.target.value)}
                        placeholder={t('options.defaultValue')}
                        disabled={readOnly}
                        aria-label={t('settingsModal.snapshotWidth')}
                      />
                    </label>

                    <div className="settings-modal__estimate settings-modal__field--wide">
                      {t('settingsModal.snapshotWidthHelp')}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Image Target Options Section */}
            {sections.includes('imageTarget') && (
              <div id={SECTION_ID_MAP.imageTarget} className="settings-modal__section">
                <button
                  type="button"
                  className="settings-modal__section-header"
                  onClick={() => toggleSection('imageTarget')}
                  aria-expanded={!collapsedSections.imageTarget}
                  aria-label={collapsedSections.imageTarget ? 'Expand' : 'Collapse'}
                >
                  <span className="settings-modal__collapse-btn" aria-hidden="true">
                    {collapsedSections.imageTarget ? '▶' : '▼'}
                  </span>
                  <span className="settings-modal__section-title">
                    {t('settingsModal.imageOptionsTitle')}
                  </span>
                </button>
                {!collapsedSections.imageTarget && (
                  <div className="settings-modal__section-content">
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

                    <label className="settings-modal__checkbox settings-modal__field--wide">
                      <input
                        type="checkbox"
                        checked={draft.image.removeExifEnabled}
                        onChange={event => updateImage('removeExifEnabled', event.target.checked)}
                        disabled={readOnly}
                      />
                      <span>{t('settingsModal.removeExif')}</span>
                    </label>

                    <div className="settings-modal__estimate settings-modal__field--wide">
                      {t('settingsModal.removeExifHelp')}
                    </div>

                    {draft.image.removeExifEnabled && (
                      <div className="settings-modal__field settings-modal__field--wide">
                        <span>{t('settingsModal.exifCategories')}</span>
                        {EXIF_CATEGORY_OPTIONS.map(category => (
                          <label key={category} className="settings-modal__checkbox">
                            <input
                              type="checkbox"
                              checked={draft.image.removeExifCategories.includes(category)}
                              onChange={event => toggleExifCategory(category, event.target.checked)}
                              disabled={readOnly}
                            />
                            <span>{t(`settingsModal.exifCategory.${category}`)}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    <div className="settings-modal__estimate">
                      {t('settingsModal.heuristicEstimate')}
                    </div>
                  </div>
                )}
              </div>
            )}

            {sections.includes('txtImage') && (
              <div id={SECTION_ID_MAP.txtImage} className="settings-modal__section">
                <button
                  type="button"
                  className="settings-modal__section-header"
                  onClick={() => toggleSection('txtImage')}
                  aria-expanded={!collapsedSections.txtImage}
                  aria-label={collapsedSections.txtImage ? 'Expand' : 'Collapse'}
                >
                  <span className="settings-modal__collapse-btn" aria-hidden="true">
                    {collapsedSections.txtImage ? '▶' : '▼'}
                  </span>
                  <span className="settings-modal__section-title">
                    {t('settingsModal.txtImageOptionsTitle')}
                  </span>
                </button>
                {!collapsedSections.txtImage && (
                  <div className="settings-modal__section-content">
                    <label className="settings-modal__field">
                      <span>{t('settingsModal.txtImageTextColor')}</span>
                      <input
                        type="color"
                        value={draft.txtImage.textColor}
                        onChange={event => updateTxtImage('textColor', event.target.value)}
                        disabled={readOnly}
                        aria-label={t('settingsModal.txtImageTextColor')}
                      />
                    </label>

                    <label className="settings-modal__field">
                      <span>{t('settingsModal.txtImageBackgroundColor')}</span>
                      <input
                        type="color"
                        value={draft.txtImage.backgroundColor}
                        onChange={event => updateTxtImage('backgroundColor', event.target.value)}
                        disabled={readOnly}
                        aria-label={t('settingsModal.txtImageBackgroundColor')}
                      />
                    </label>

                    <label className="settings-modal__field">
                      <span>{t('settingsModal.txtImageFontSize')}</span>
                      <input
                        type="number"
                        min="8"
                        max="96"
                        inputMode="numeric"
                        value={draft.txtImage.fontSizePx}
                        onChange={event => updateTxtImage('fontSizePx', event.target.value)}
                        disabled={readOnly}
                        aria-label={t('settingsModal.txtImageFontSize')}
                      />
                    </label>

                    <label className="settings-modal__field">
                      <span>{t('settingsModal.txtImageWidth')}</span>
                      <input
                        type="number"
                        min="320"
                        max="4096"
                        inputMode="numeric"
                        value={draft.txtImage.imageWidthPx}
                        onChange={event => updateTxtImage('imageWidthPx', event.target.value)}
                        disabled={readOnly}
                        aria-label={t('settingsModal.txtImageWidth')}
                      />
                    </label>

                    <label className="settings-modal__field">
                      <span>{t('settingsModal.txtImagePadding')}</span>
                      <input
                        type="number"
                        min="0"
                        max="256"
                        inputMode="numeric"
                        value={draft.txtImage.paddingPx}
                        onChange={event => updateTxtImage('paddingPx', event.target.value)}
                        disabled={readOnly}
                        aria-label={t('settingsModal.txtImagePadding')}
                      />
                    </label>

                    <label className="settings-modal__field">
                      <span>{t('settingsModal.txtImageLineHeight')}</span>
                      <input
                        type="number"
                        min="8"
                        max="160"
                        inputMode="numeric"
                        value={draft.txtImage.lineHeightPx}
                        onChange={event => updateTxtImage('lineHeightPx', event.target.value)}
                        disabled={readOnly}
                        aria-label={t('settingsModal.txtImageLineHeight')}
                      />
                    </label>

                    <div className="settings-modal__estimate settings-modal__field--wide">
                      {t('settingsModal.txtImageHelp')}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Image to PDF Options Section */}
            {sections.includes('imageToPdf') && (
              <div id={SECTION_ID_MAP.imageToPdf} className="settings-modal__section">
                <button
                  type="button"
                  className="settings-modal__section-header"
                  onClick={() => toggleSection('imageToPdf')}
                  aria-expanded={!collapsedSections.imageToPdf}
                  aria-label={collapsedSections.imageToPdf ? 'Expand' : 'Collapse'}
                >
                  <span className="settings-modal__collapse-btn" aria-hidden="true">
                    {collapsedSections.imageToPdf ? '▶' : '▼'}
                  </span>
                  <span className="settings-modal__section-title">
                    {t('settingsModal.imageToPdfTitle')}
                  </span>
                </button>
                {!collapsedSections.imageToPdf && (
                  <div className="settings-modal__section-content">
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
                          updateImageToPdf('fit', event.target.value as 'original' | 'showAll')
                        }
                        disabled={readOnly}
                      >
                        <option value="original">{t('settingsModal.fitOriginal')}</option>
                        <option value="showAll">{t('settingsModal.fitShowAll')}</option>
                      </select>
                    </label>

                    <label className="settings-modal__field">
                      <span>{t('settingsModal.pageMode')}</span>
                      <select
                        value={draft.imageToPdf.pageMode}
                        onChange={event =>
                          updateImageToPdf(
                            'pageMode',
                            event.target.value as 'auto' | 'single' | 'multi'
                          )
                        }
                        disabled={readOnly}
                      >
                        <option value="auto">{t('settingsModal.pageModeAuto')}</option>
                        <option value="single">{t('settingsModal.pageModeSingle')}</option>
                        <option value="multi">{t('settingsModal.pageModeMulti')}</option>
                      </select>
                    </label>

                    <label className="settings-modal__field">
                      <span>{t('settingsModal.rotation')}</span>
                      <select
                        value={String(draft.imageToPdf.rotationDeg)}
                        onChange={event =>
                          updateImageToPdf(
                            'rotationDeg',
                            Number(event.target.value) as 0 | 90 | 180 | 270
                          )
                        }
                        disabled={readOnly}
                      >
                        {ROTATION_DEGREE_OPTIONS.map(rotationDeg => (
                          <option key={rotationDeg} value={String(rotationDeg)}>
                            {t('settingsModal.rotationDegrees', { degrees: rotationDeg })}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="settings-modal__field">
                      <span>{t('settingsModal.scale')}</span>
                      <input
                        type="number"
                        min="10"
                        max="300"
                        inputMode="numeric"
                        value={draft.imageToPdf.scalePercent}
                        onChange={event => updateImageToPdf('scalePercent', event.target.value)}
                        placeholder="100"
                        disabled={readOnly}
                        aria-label={t('settingsModal.scale')}
                      />
                    </label>

                    <div className="settings-modal__estimate settings-modal__field--wide">
                      {t('settingsModal.imageToPdfTransformHelp')}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PDF Page Setup Section */}
            {sections.includes('pdfPageSetup') && (
              <PdfPageSetupSection
                t={t}
                collapsed={collapsedSections.pdfPageSetup}
                onToggle={() => toggleSection('pdfPageSetup')}
                paperSize={draft.pdfPageSetup.paperSize}
                orientation={draft.pdfPageSetup.orientation}
                onPaperSizeChange={value => updatePdfPageSetup('paperSize', value)}
                onOrientationChange={value => updatePdfPageSetup('orientation', value)}
                readOnly={readOnly}
              />
            )}

            {sections.includes('markdown') && (
              <MarkdownSection
                t={t}
                collapsed={collapsedSections.markdown}
                onToggle={() => toggleSection('markdown')}
                txtMode={draft.markdown.txtMode}
                onTxtModeChange={mode => updateMarkdown('txtMode', mode)}
                readOnly={readOnly}
              />
            )}
          </div>
        </div>

        <div className="pdf-modal__actions">
          {readOnly ? (
            <button type="button" className="btn btn--primary" onClick={props.onCancel}>
              {t('actions.done')}
            </button>
          ) : (
            <>
              <div className="pdf-modal__actions__spacer" />
              <button type="button" className="btn btn--secondary" onClick={props.onCancel}>
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
