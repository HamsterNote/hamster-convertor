import log from 'loglevel'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { ConfirmModal } from './components/ConfirmModal'
import FileDropzone from './components/FileDropzone'
import Footer from './components/Footer'
import FullscreenLoading from './components/FullscreenLoading'
import Header from './components/Header'
import { ParserIframeBridge, type ParserIframeBridgeRef } from './components/ParserIframeBridge'
import PreviewModal from './components/PreviewModal'
import SettingsModal, {
  getSettingsSections,
  type SettingsOptions
} from './components/SettingsModal'
import { assetUrl } from './lib/assets'
import {
  type ConversionResult,
  type ConversionWarning,
  type ExifCategory,
  getSupportedTargets,
  type HtmlDecodeOptions,
  type HtmlEncodeOptions,
  type SourceFormat,
  type TargetFormat,
  type TxtImageOptions
} from './lib/converter'
import { downloadBlobFile, downloadResultArchive } from './lib/download'
import {
  applyGroupSectionOptionsToApplicableMembers,
  getCommonGroupTargets,
  getGroupSettingsSections,
  isSelectableForBatch,
  pickTargetRelatedOptions,
  removeEmptyGroups,
  type GroupItem,
  type GroupMember
} from './lib/group-helpers'
import { truncateMiddle } from './lib/filename'
import { convertViaBridge } from './lib/parser-bridge/proxy'
import { getPdfPageCount } from './lib/pdf-utils'
import { getPreviewableOutputs } from './lib/preview'

type BackgroundDecodeOptions = NonNullable<HtmlDecodeOptions['background']>

type ConversionOptions = {
  pdf: {
    ocr: boolean
    selectedPages?: number[]
  }
  html?: {
    textControl?: HtmlDecodeOptions['textControl']
    background?: BackgroundDecodeOptions
    htmlLayout?: {
      mode: 'paginated' | 'continuous'
      widthMode?: 'actual' | 'fit'
    }
  }
  htmlEncode?: HtmlEncodeOptions
  image?: {
    quality: number
    maxWidth?: number
    maxHeight?: number
    keepAspectRatio: boolean
    removeExif?: {
      enabled: boolean
      categories: ExifCategory[]
    }
  }
  imageToPdf?: {
    marginPt: number
    fit: 'cover' | 'contain'
    pageMode: 'auto' | 'single' | 'multi'
    rotationDeg: 0 | 90 | 180 | 270
    scalePercent: number
  }
  txtImage?: TxtImageOptions
}

const DEFAULT_HTML_BACKGROUND_OPTIONS: Required<BackgroundDecodeOptions> = {
  includeBackground: true,
  backgroundQuality: 0.85
}

const DEFAULT_IMAGE_OPTIONS: NonNullable<ConversionOptions['image']> = {
  quality: 0.92,
  keepAspectRatio: true,
  removeExif: { enabled: false, categories: [] }
}

const DEFAULT_IMAGE_TO_PDF_OPTIONS: Required<NonNullable<ConversionOptions['imageToPdf']>> = {
  marginPt: 24,
  fit: 'cover',
  pageMode: 'auto',
  rotationDeg: 0,
  scalePercent: 100
}

const DEFAULT_TXT_IMAGE_OPTIONS: TxtImageOptions = {
  textColor: '#000000',
  backgroundColor: '#ffffff',
  fontSizePx: 16,
  imageWidthPx: 800,
  paddingPx: 20,
  lineHeightPx: 24
}

const normalizeImageDimension = (value: number | undefined): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    return undefined
  }

  return Math.floor(value)
}

const createDefaultHtmlOptions = (): NonNullable<ConversionOptions['html']> => ({
  background: { ...DEFAULT_HTML_BACKGROUND_OPTIONS },
  htmlLayout: { mode: 'paginated' }
})

type FileItem = {
  id: string
  file: File
  source: SourceFormat
  target: TargetFormat
  status: 'ready' | 'queued' | 'converting' | 'done' | 'failed'
  outputs?: ConversionResult[]
  warnings?: ConversionWarning[]
  errorMessage?: string
  conversionOptions: ConversionOptions
}

const SUPPORTED_FORMATS = [
  'pdf',
  'txt',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'svg',
  'html',
  'htm',
  'docx',
  'md',
  'markdown'
]
const SUPPORTED_FORMAT_LIST = SUPPORTED_FORMATS.map(format => `.${format}`).join(', ')

const extToFormat = (name: string): SourceFormat | 'unsupported' => {
  const ext = name.split('.').pop()?.toLowerCase()
  const extMap: Record<string, SourceFormat> = {
    pdf: 'pdf',
    txt: 'txt',
    png: 'image',
    jpg: 'image',
    jpeg: 'image',
    gif: 'image',
    webp: 'image',
    bmp: 'image',
    svg: 'image',
    html: 'html',
    htm: 'html',
    docx: 'docx',
    md: 'markdown',
    markdown: 'markdown'
  }

  if (ext && ext in extMap) {
    return extMap[ext]
  }
  return 'unsupported'
}

const replaceExtension = (filename: string, extension: string): string => {
  const withoutExtension = filename.replace(/\.[^/.]+$/, '')
  return `${withoutExtension || filename}.${extension}`
}

let fallbackFileItemId = 0
let fallbackGroupId = 0

const createFileItemId = (file: File): string => {
  fallbackFileItemId += 1

  const randomId =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${fallbackFileItemId}`

  return `${file.name}-${file.size}-${file.lastModified}-${randomId}`
}

type ConversionErrorKey = 'conversionFailed' | 'emptyOcr' | 'ocrRequired'

type BatchProgress = {
  total: number
  processed: number
  active: boolean
}

type BottomActionsProps = {
  multiSelectMode: boolean
  items: FileItem[]
  selectedItemIds: Set<string>
  selectedCommonTargets: TargetFormat[]
  canCreateGroup: boolean
  canBulkTarget: boolean
  toolbarMessageKey: string | null
  isConvertingAll: boolean
  isPreparingDownload: boolean
  canDownloadArchive: boolean
  batchProgress: BatchProgress
  acceptAttr: string
  addFilesInputRef: React.RefObject<HTMLInputElement>
  onCreateGroup: () => void
  onBulkDelete: () => void
  onBulkTargetChange: (target: TargetFormat) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onExitMultiSelectMode: () => void
  onAddFilesClick: () => void
  onFilesAdded: (files: File[]) => void
  onConvertAll: () => void
  onDownloadAll: () => void
  onEnterMultiSelectMode: () => void
  onClearAll: () => void
  t: TFunction
}

function BottomActions({
  multiSelectMode,
  items,
  selectedItemIds,
  selectedCommonTargets,
  canCreateGroup,
  canBulkTarget,
  toolbarMessageKey,
  isConvertingAll,
  isPreparingDownload,
  canDownloadArchive,
  batchProgress,
  acceptAttr,
  addFilesInputRef,
  onCreateGroup,
  onBulkDelete,
  onBulkTargetChange,
  onSelectAll,
  onDeselectAll,
  onExitMultiSelectMode,
  onAddFilesClick,
  onFilesAdded,
  onConvertAll,
  onDownloadAll,
  onEnterMultiSelectMode,
  onClearAll,
  t
}: BottomActionsProps) {
  if (multiSelectMode) {
    return (
      <>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={!canCreateGroup}
          onClick={onCreateGroup}
        >
          {t('group.create')}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={selectedItemIds.size === 0}
          onClick={onBulkDelete}
        >
          {t('multiSelect.bulkDelete')}
        </button>
        <select
          className="toolbar-select"
          value=""
          onChange={e => {
            const target = e.target.value as TargetFormat
            if (target) onBulkTargetChange(target)
            e.currentTarget.value = ''
          }}
          disabled={!canBulkTarget}
          aria-label={t('multiSelect.bulkTarget')}
        >
          <option value="">{t('multiSelect.bulkTarget')}</option>
          {selectedCommonTargets.map(target => (
            <option key={target} value={target}>
              {t(`formats.targets.${target}`)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={items.every(it => !isSelectableForBatch(it.status))}
          onClick={onSelectAll}
        >
          {t('actions.selectAll')}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={selectedItemIds.size === 0}
          onClick={onDeselectAll}
        >
          {t('actions.deselectAll')}
        </button>
        <button type="button" className="btn btn--secondary" onClick={onExitMultiSelectMode}>
          {t('multiSelect.cancel')}
        </button>
        <span className="multi-select-count">
          {t('multiSelect.selectedCount', { count: selectedItemIds.size })}
        </span>
        {toolbarMessageKey && (
          <span className="multi-select-message" role="status">
            {t(toolbarMessageKey)}
          </span>
        )}
      </>
    )
  }

  return (
    <>
      <button
        type="button"
        className="btn btn--secondary"
        onClick={onAddFilesClick}
        disabled={isConvertingAll || isPreparingDownload}
      >
        {t('actions.addFiles')}
      </button>
      <input
        type="file"
        className="file-input--hidden"
        multiple
        accept={acceptAttr}
        onChange={e => {
          const files = e.target.files ? Array.from(e.target.files) : []
          if (files.length) onFilesAdded(files)
          e.currentTarget.value = ''
        }}
        ref={addFilesInputRef}
      />
      <button
        type="button"
        className="btn btn--primary"
        disabled={items.length === 0 || isConvertingAll || isPreparingDownload}
        onClick={onConvertAll}
      >
        {t('actions.convertAll')}
      </button>
      {batchProgress.active && (
        <span aria-live="polite" className="batch-progress">
          {batchProgress.processed} / {batchProgress.total}
        </span>
      )}
      <button
        type="button"
        className="btn btn--ghost"
        disabled={items.length === 0}
        onClick={onEnterMultiSelectMode}
      >
        {t('multiSelect.toggle')}
      </button>
      <button
        type="button"
        className="btn btn--ghost"
        disabled={!canDownloadArchive || isConvertingAll || isPreparingDownload}
        onClick={onDownloadAll}
      >
        {t('actions.download')}
      </button>
      <button
        type="button"
        className="btn btn--ghost"
        disabled={items.length === 0 || isConvertingAll || isPreparingDownload}
        onClick={onClearAll}
      >
        {t('actions.clearAll')}
      </button>
    </>
  )
}

const isPendingStatus = (status: FileItem['status']) =>
  ['ready', 'queued', 'converting'].includes(status)

const isRunningStatus = (status: FileItem['status']) => ['queued', 'converting'].includes(status)

const isConvertibleStatus = (status: FileItem['status']) =>
  status === 'ready' || status === 'failed'

const hasExplicitlyEmptySelectedPages = (item: FileItem): boolean => {
  const selected = item.conversionOptions.pdf.selectedPages
  return selected !== undefined && selected.length === 0
}

const queueItem = (item: FileItem): FileItem => ({
  ...item,
  status: item.status === 'done' ? 'done' : 'queued',
  errorMessage: undefined
})

const getConversionErrorKey = (error: unknown): ConversionErrorKey => {
  if (!(error instanceof Error)) {
    return 'conversionFailed'
  }

  const errorCode = (error as Error & { code?: string }).code
  if (errorCode === 'OCR_REQUIRED') {
    return 'ocrRequired'
  }
  if (errorCode === 'EMPTY_OCR') {
    return 'emptyOcr'
  }
  return 'conversionFailed'
}

const getRequiredBridge = (bridge: ParserIframeBridgeRef | null): ParserIframeBridgeRef => {
  if (!bridge) {
    throw new Error('Parser bridge is unavailable')
  }

  return bridge
}

const toGroupMember = (item: FileItem): GroupMember => ({
  id: item.id,
  source: item.source,
  target: item.target,
  fileName: item.file.name,
  conversionOptions: item.conversionOptions
})

/**
 * Apply a target change to a file item without resetting done/failed status or
 * clearing outputs. Used for bulk and Group target changes.
 */
const updateItemTargetKeepStatus = (item: FileItem, target: TargetFormat): FileItem => {
  const conversionOptions: ConversionOptions = { ...item.conversionOptions }

  if (target === 'html') {
    conversionOptions.html = conversionOptions.html ?? createDefaultHtmlOptions()
  } else {
    conversionOptions.html = undefined
  }

  if (!(['png', 'jpg', 'webp'].includes(target) && item.source !== 'txt')) {
    conversionOptions.image = undefined
  }

  if (!(item.source === 'image' && target === 'pdf')) {
    conversionOptions.imageToPdf = undefined
  }

  return { ...item, target, conversionOptions }
}

function App() {
  const { t } = useTranslation()
  const [items, setItems] = useState<FileItem[]>([])
  const [rejectedFileNames, setRejectedFileNames] = useState<string[]>([])
  const itemsRef = useRef<FileItem[]>(items)
  const addFilesInputRef = useRef<HTMLInputElement>(null)
  const bridgeRef = useRef<ParserIframeBridgeRef>(null)
  const [isConvertingAll, setIsConvertingAll] = useState(false)
  const [batchProgress, setBatchProgress] = useState<BatchProgress>({
    total: 0,
    processed: 0,
    active: false
  })
  const [isPreparingDownload, setIsPreparingDownload] = useState(false)
  const [activeSettingsItemId, setActiveSettingsItemId] = useState<string | null>(null)
  const [confirmModal, setConfirmModal] = useState<{
    message: string
    onConfirm: () => void
    onCancel: () => void
  } | null>(null)
  const [activePreviewItemId, setActivePreviewItemId] = useState<string | null>(null)
  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set())
  const [groups, setGroups] = useState<GroupItem[]>([])
  const [activeGroupSettingsId, setActiveGroupSettingsId] = useState<string | null>(null)

  const activeSettingsItem = activeSettingsItemId
    ? items.find(it => it.id === activeSettingsItemId)
    : undefined
  const activePreviewItem = activePreviewItemId
    ? items.find(it => it.id === activePreviewItemId)
    : undefined
  const activeGroupSettings = activeGroupSettingsId
    ? groups.find(g => g.id === activeGroupSettingsId)
    : undefined

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  const hasPending = items.some(it => isPendingStatus(it.status))
  const downloadableItems = items.filter(
    it => it.status === 'done' && it.outputs && it.outputs.length > 0
  )
  const canDownloadArchive = items.length > 0 && !hasPending && downloadableItems.length > 0
  let fullscreenLoadingLabel = t('loading.converting')

  if (batchProgress.active) {
    fullscreenLoadingLabel = t('loading.convertingWithProgress', {
      processed: batchProgress.processed,
      total: batchProgress.total
    })
  }

  if (isPreparingDownload) {
    fullscreenLoadingLabel = t('loading.preparingDownload')
  }

  useEffect(() => {
    document.title = `${t('appName')} | Hamster Document Converter`
  }, [t])

  const onFilesAdded = (files: File[]) => {
    const next: FileItem[] = []
    const rejected: string[] = []

    files.forEach(file => {
      const source = extToFormat(file.name)
      if (source === 'unsupported') {
        rejected.push(file.name)
        return
      }

      next.push({
        id: createFileItemId(file),
        file,
        source,
        target: getSupportedTargets(source)[0] ?? 'txt',
        status: 'ready',
        conversionOptions: { pdf: { ocr: false } }
      })
    })

    setRejectedFileNames(rejected)
    if (next.length > 0) {
      setItems(prev => [...prev, ...next])
    }
  }

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(x => x.id !== id))
    setGroups(prev => {
      const remainingItems = items.filter(x => x.id !== id)
      const itemMap = new Map(remainingItems.map(it => [it.id, it]))
      return removeEmptyGroups(prev, itemMap)
    })
  }

  const copyItem = (id: string) => {
    const source = items.find(it => it.id === id)
    if (!source) return

    const newItem: FileItem = {
      ...source,
      id: createFileItemId(source.file),
      status: 'ready',
      outputs: undefined,
      warnings: undefined,
      errorMessage: undefined
    }

    setItems(prev => [...prev, newItem])
  }

  const clearAll = () => {
    setItems([])
    setGroups([])
  }

  const changeTarget = (id: string, target: TargetFormat) => {
    setItems(prev =>
      prev.map(it => {
        if (it.id !== id) return it
        const hadImageTarget = ['png', 'jpg', 'webp'].includes(it.target)
        const conversionOptions: ConversionOptions = {
          ...it.conversionOptions,
          html:
            target === 'html'
              ? (it.conversionOptions.html ?? createDefaultHtmlOptions())
              : undefined
        }
        const newItem = { ...it, target, conversionOptions }
        if (
          hadImageTarget &&
          !['png', 'jpg', 'webp'].includes(target) &&
          (it.status === 'done' || it.status === 'failed')
        ) {
          return {
            ...newItem,
            status: 'ready' as const,
            outputs: undefined,
            warnings: undefined,
            errorMessage: undefined
          }
        }
        return newItem
      })
    )
  }

  const applySettingsOptions = (id: string, next: SettingsOptions) => {
    setItems(prev =>
      prev.map(it => {
        if (it.id !== id) return it
        const conversionOptions: ConversionOptions = { ...it.conversionOptions }
        if (next.pdf) {
          conversionOptions.pdf = { ...next.pdf }
        }
        if (next.html) {
          conversionOptions.html = { ...next.html }
        }
        conversionOptions.htmlEncode = next.htmlEncode ? { ...next.htmlEncode } : undefined
        if (next.image) {
          const maxWidth = normalizeImageDimension(next.image.maxWidth)
          const maxHeight = normalizeImageDimension(next.image.maxHeight)
          conversionOptions.image = {
            quality: next.image.quality ?? DEFAULT_IMAGE_OPTIONS.quality,
            maxWidth,
            maxHeight,
            keepAspectRatio: next.image.keepAspectRatio ?? DEFAULT_IMAGE_OPTIONS.keepAspectRatio,
            removeExif: next.image.removeExif ?? DEFAULT_IMAGE_OPTIONS.removeExif
          }
        }
        if (next.imageToPdf) {
          conversionOptions.imageToPdf = {
            marginPt: next.imageToPdf.margin ?? DEFAULT_IMAGE_TO_PDF_OPTIONS.marginPt,
            fit: next.imageToPdf.fit ?? DEFAULT_IMAGE_TO_PDF_OPTIONS.fit,
            pageMode: next.imageToPdf.pageMode ?? DEFAULT_IMAGE_TO_PDF_OPTIONS.pageMode,
            rotationDeg: next.imageToPdf.rotationDeg ?? DEFAULT_IMAGE_TO_PDF_OPTIONS.rotationDeg,
            scalePercent: next.imageToPdf.scalePercent ?? DEFAULT_IMAGE_TO_PDF_OPTIONS.scalePercent
          }
        }
        conversionOptions.txtImage = next.txtImage ? { ...next.txtImage } : undefined
        return { ...it, conversionOptions }
      })
    )
  }

  const markFailed = (id: string, errorMessage: string) => {
    setItems(prev =>
      prev.map(it => (it.id === id ? { ...it, status: 'failed', errorMessage } : it))
    )
  }

  const markConverting = (id: string) => {
    setItems(prev => prev.map(it => (it.id === id ? { ...it, status: 'converting' } : it)))
  }

  const markDone = (id: string, results: ConversionResult[]) => {
    const warnings = results.flatMap(result => result.warnings ?? [])
    setItems(prev =>
      prev.map(it =>
        it.id === id
          ? {
              ...it,
              status: 'done',
              outputs: results,
              warnings
            }
          : it
      )
    )
  }

  const confirmLargePdfsBeforeConvert = async (ids: string[]): Promise<boolean> => {
    const pdfItems = itemsRef.current.filter(it => ids.includes(it.id) && it.source === 'pdf')
    for (const pdfItem of pdfItems) {
      const explicitSelectionCount = pdfItem.conversionOptions.pdf.selectedPages?.length
      if (explicitSelectionCount !== undefined && explicitSelectionCount <= 20) continue
      let pageCount: number
      try {
        pageCount = await getPdfPageCount(pdfItem.file)
      } catch (error) {
        log.warn('PDF page count check failed', { fileName: pdfItem.file.name, error })
        continue
      }
      if (pageCount <= 20) continue
      const proceed = await new Promise<boolean>(resolve => {
        setConfirmModal({
          message: t('confirmations.pdfTooManyPages', {
            fileName: pdfItem.file.name,
            pageCount
          }),
          onConfirm: () => {
            setConfirmModal(null)
            resolve(true)
          },
          onCancel: () => {
            setConfirmModal(null)
            resolve(false)
          }
        })
      })
      if (!proceed) return false
    }
    return true
  }

  const convertSingleItem = async (id: string): Promise<void> => {
    const current = itemsRef.current.find(it => it.id === id)
    if (!current) return
    if (!getSupportedTargets(current.source).includes(current.target)) {
      markFailed(id, t('errors.unsupportedConversion'))
      return
    }
    if (current.source === 'pdf' && hasExplicitlyEmptySelectedPages(current)) {
      markFailed(id, t('errors.noPagesSelected'))
      return
    }
    markConverting(id)
    try {
      const bridge = getRequiredBridge(bridgeRef.current)
      const htmlBackground = {
        ...DEFAULT_HTML_BACKGROUND_OPTIONS,
        ...current.conversionOptions.html?.background
      }
      const htmlOptions = current.conversionOptions.html
        ? {
            textControl: current.conversionOptions.html.textControl,
            background: htmlBackground
          }
        : undefined
      const imageOptions = current.conversionOptions.image ?? DEFAULT_IMAGE_OPTIONS
      const imageToPdfOptions =
        current.source === 'image' && current.target === 'pdf'
          ? (current.conversionOptions.imageToPdf ?? DEFAULT_IMAGE_TO_PDF_OPTIONS)
          : undefined
      const txtImageOptions =
        current.source === 'txt' && ['png', 'jpg', 'webp'].includes(current.target)
          ? (current.conversionOptions.txtImage ?? DEFAULT_TXT_IMAGE_OPTIONS)
          : undefined
      const bridgeImageOptions =
        current.source === 'txt' && ['png', 'jpg', 'webp'].includes(current.target)
          ? undefined
          : imageOptions
      const result = await convertViaBridge(bridge, current.file, current.source, current.target, {
        pdf: current.conversionOptions.pdf,
        encode: current.conversionOptions.htmlEncode,
        decode: htmlOptions,
        layout: current.conversionOptions.html?.htmlLayout,
        image: bridgeImageOptions,
        imageToPdf: imageToPdfOptions,
        txtImage: txtImageOptions
      })
      const results = Array.isArray(result) ? result : [result]
      markDone(id, results)
    } catch (error) {
      log.warn('Conversion failed', { id, fileName: current.file.name, error })
      markFailed(id, t(`errors.${getConversionErrorKey(error)}` as const))
    }
  }

  const convertAll = async () => {
    const isRunning = itemsRef.current.some(it => isRunningStatus(it.status))
    if (isRunning) return

    const batchIds = itemsRef.current.filter(it => isConvertibleStatus(it.status)).map(i => i.id)
    if (batchIds.length === 0) return

    const userConfirmed = await confirmLargePdfsBeforeConvert(batchIds)
    if (!userConfirmed) return

    const batchIdSet = new Set(batchIds)
    setIsConvertingAll(true)
    setBatchProgress({ active: true, total: batchIds.length, processed: 0 })
    setItems(prev => prev.map(item => (batchIdSet.has(item.id) ? queueItem(item) : item)))

    try {
      for (const id of batchIds) {
        try {
          await convertSingleItem(id)
        } finally {
          setBatchProgress(prev => ({ ...prev, processed: prev.processed + 1 }))
        }
      }
    } finally {
      setIsConvertingAll(false)
      setBatchProgress(prev => ({ ...prev, active: false }))
    }
  }

  const acceptAttr = useMemo(
    () => '.pdf,.txt,.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg,.html,.htm,.md,.markdown',
    []
  )

  const handleDownloadAll = async () => {
    const allOutputs = downloadableItems.flatMap(it => it.outputs ?? [])
    if (allOutputs.length === 0) return
    setIsPreparingDownload(true)
    try {
      if (allOutputs.length === 1 && allOutputs[0]) {
        downloadBlobFile(allOutputs[0])
        await Promise.resolve()
      } else {
        await downloadResultArchive(allOutputs, 'hamster-conversions.zip')
      }
    } finally {
      setIsPreparingDownload(false)
    }
  }

  const handleRowDownload = async (item: FileItem) => {
    const outputs = item.outputs
    if (!outputs || outputs.length === 0) return
    setIsPreparingDownload(true)
    try {
      if (outputs.length === 1 && outputs[0]) {
        downloadBlobFile(outputs[0])
        await Promise.resolve()
      } else {
        await downloadResultArchive(outputs, replaceExtension(item.file.name, 'zip'))
      }
    } finally {
      setIsPreparingDownload(false)
    }
  }

  const enterMultiSelectMode = () => {
    setMultiSelectMode(true)
    setSelectedItemIds(new Set())
  }

  const exitMultiSelectMode = () => {
    setMultiSelectMode(false)
    setSelectedItemIds(new Set())
  }

  const selectAll = () => {
    setSelectedItemIds(
      new Set(items.filter(it => isSelectableForBatch(it.status)).map(it => it.id))
    )
  }

  const deselectAll = () => setSelectedItemIds(new Set())

  const bulkDelete = () => {
    const idsToDelete = new Set(selectedItemIds)
    setItems(prev => prev.filter(it => !idsToDelete.has(it.id)))
    setGroups(prev => {
      const remainingItems = items.filter(it => !idsToDelete.has(it.id))
      const itemMap = new Map(remainingItems.map(it => [it.id, it]))
      return removeEmptyGroups(prev, itemMap)
    })
    setSelectedItemIds(new Set())
  }

  const bulkTargetChange = (target: TargetFormat) => {
    setItems(prev =>
      prev.map(it => (selectedItemIds.has(it.id) ? updateItemTargetKeepStatus(it, target) : it))
    )
  }
  const createGroup = () => {
    const selectedItems = items.filter(it => selectedItemIds.has(it.id))
    if (selectedItems.length < 2) return

    const members = selectedItems.map(toGroupMember)
    const commonTargets = getCommonGroupTargets(members)
    if (commonTargets.length === 0) return

    const firstTarget = selectedItems[0]?.target
    const allShareTarget =
      firstTarget !== undefined && selectedItems.every(it => it.target === firstTarget)
    const initialTarget =
      allShareTarget && commonTargets.includes(firstTarget) ? firstTarget : commonTargets[0]

    const selectedIds = new Set(selectedItems.map(it => it.id))
    const nextItems = items.map(it =>
      selectedIds.has(it.id) ? updateItemTargetKeepStatus(it, initialTarget) : it
    )
    const updatedMembers = selectedItems
      .map(it => nextItems.find(x => x.id === it.id))
      .filter((it): it is FileItem => it !== undefined)
      .map(toGroupMember)

    const conversionOptions: ConversionOptions = updatedMembers.reduce(
      (acc, member) => {
        const picked = pickTargetRelatedOptions(
          member.conversionOptions,
          initialTarget,
          member.source
        )
        return Object.assign(acc, picked)
      },
      { pdf: { ocr: false } } as ConversionOptions
    )

    fallbackGroupId += 1
    const newGroup: GroupItem = {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${fallbackGroupId}`,
      fileIds: selectedItems.map(it => it.id),
      target: initialTarget,
      conversionOptions,
      collapsed: false
    }

    setItems(nextItems)
    setGroups(prev => [...prev, newGroup])
    setSelectedItemIds(new Set())
    setMultiSelectMode(false)
  }
  const changeGroupTarget = (groupId: string, target: TargetFormat) => {
    const group = groups.find(g => g.id === groupId)
    if (!group) return

    const memberIds = new Set(group.fileIds)
    const nextItems = items.map(it =>
      memberIds.has(it.id) ? updateItemTargetKeepStatus(it, target) : it
    )

    const nextMembers = group.fileIds
      .map(id => nextItems.find(it => it.id === id))
      .filter((it): it is FileItem => it !== undefined)
      .map(toGroupMember)

    const nextConversionOptions: ConversionOptions = nextMembers.reduce(
      (acc, member) => {
        const picked = pickTargetRelatedOptions(member.conversionOptions, target, member.source)
        return Object.assign(acc, picked)
      },
      { pdf: { ocr: false } } as ConversionOptions
    )

    setItems(nextItems)
    setGroups(prev =>
      prev.map(g =>
        g.id === groupId ? { ...g, target, conversionOptions: nextConversionOptions } : g
      )
    )
  }

  const toggleGroupCollapsed = (groupId: string) => {
    setGroups(prev => prev.map(g => (g.id === groupId ? { ...g, collapsed: !g.collapsed } : g)))
  }

  const toggleGroupSelectAll = (groupId: string) => {
    const group = groups.find(g => g.id === groupId)
    if (!group) return

    const selectableIds = group.fileIds
      .map(id => items.find(it => it.id === id))
      .filter((it): it is FileItem => it !== undefined)
      .filter(it => isSelectableForBatch(it.status))
      .map(it => it.id)

    const allSelected =
      selectableIds.length > 0 && selectableIds.every(id => selectedItemIds.has(id))

    setSelectedItemIds(prev => {
      const next = new Set(prev)
      if (allSelected) {
        for (const id of selectableIds) {
          next.delete(id)
        }
      } else {
        for (const id of selectableIds) {
          next.add(id)
        }
      }
      return next
    })
  }

  const convertGroup = async (groupId: string) => {
    const group = groups.find(g => g.id === groupId)
    if (!group) return

    const isRunning = itemsRef.current.some(it => isRunningStatus(it.status)) || isConvertingAll
    if (isRunning) return

    const memberIds = new Set(group.fileIds)
    const batchIds = itemsRef.current
      .filter(it => memberIds.has(it.id) && isConvertibleStatus(it.status))
      .map(it => it.id)
    if (batchIds.length === 0) return

    const userConfirmed = await confirmLargePdfsBeforeConvert(batchIds)
    if (!userConfirmed) return

    const batchIdSet = new Set(batchIds)
    setIsConvertingAll(true)
    setBatchProgress({ active: true, total: batchIds.length, processed: 0 })
    setItems(prev => prev.map(item => (batchIdSet.has(item.id) ? queueItem(item) : item)))

    try {
      for (const id of batchIds) {
        try {
          await convertSingleItem(id)
        } finally {
          setBatchProgress(prev => ({ ...prev, processed: prev.processed + 1 }))
        }
      }
    } finally {
      setIsConvertingAll(false)
      setBatchProgress(prev => ({ ...prev, active: false }))
    }
  }

  const applyGroupSettings = (groupId: string, next: SettingsOptions) => {
    const group = groups.find(g => g.id === groupId)
    if (!group) return

    const members = group.fileIds
      .map(id => items.find(it => it.id === id))
      .filter((it): it is FileItem => it !== undefined)
      .map(toGroupMember)

    const visibleSections = getGroupSettingsSections(members, group.target)
    let updatedMembers = members

    for (const sectionId of visibleSections) {
      let sectionOptions: Partial<ConversionOptions> = {}

      if (sectionId === 'htmlOptions' && next.html) {
        sectionOptions = {
          html: {
            textControl: next.html.textControl,
            background: next.html.background,
            htmlLayout: next.html.htmlLayout
          }
        }
      } else if (sectionId === 'imageTarget' && next.image) {
        sectionOptions = {
          image: {
            quality: next.image.quality ?? DEFAULT_IMAGE_OPTIONS.quality,
            maxWidth: normalizeImageDimension(next.image.maxWidth),
            maxHeight: normalizeImageDimension(next.image.maxHeight),
            keepAspectRatio: next.image.keepAspectRatio ?? DEFAULT_IMAGE_OPTIONS.keepAspectRatio,
            removeExif: next.image.removeExif ?? DEFAULT_IMAGE_OPTIONS.removeExif
          }
        }
      } else if (sectionId === 'imageToPdf' && next.imageToPdf) {
        sectionOptions = {
          imageToPdf: {
            marginPt: next.imageToPdf.margin ?? DEFAULT_IMAGE_TO_PDF_OPTIONS.marginPt,
            fit: next.imageToPdf.fit ?? DEFAULT_IMAGE_TO_PDF_OPTIONS.fit,
            pageMode: next.imageToPdf.pageMode ?? DEFAULT_IMAGE_TO_PDF_OPTIONS.pageMode,
            rotationDeg: next.imageToPdf.rotationDeg ?? DEFAULT_IMAGE_TO_PDF_OPTIONS.rotationDeg,
            scalePercent: next.imageToPdf.scalePercent ?? DEFAULT_IMAGE_TO_PDF_OPTIONS.scalePercent
          }
        }
      }

      updatedMembers = applyGroupSectionOptionsToApplicableMembers(
        sectionOptions,
        updatedMembers,
        sectionId,
        group.target
      )
    }

    const memberIdToIndex = new Map(group.fileIds.map((id, index) => [id, index]))
    const nextItems = items.map(it => {
      const index = memberIdToIndex.get(it.id)
      if (index === undefined) return it
      const updated = updatedMembers[index]
      if (!updated) return it
      return { ...it, conversionOptions: updated.conversionOptions }
    })

    const nextConversionOptions = updatedMembers.reduce(
      (acc, member) => {
        const picked = pickTargetRelatedOptions(
          member.conversionOptions,
          group.target,
          member.source
        )
        return Object.assign(acc, picked)
      },
      { pdf: { ocr: false } } as ConversionOptions
    )

    const nextGroup: GroupItem = {
      ...group,
      conversionOptions: nextConversionOptions
    }

    setItems(nextItems)
    setGroups(prev => prev.map(g => (g.id === groupId ? nextGroup : g)))
    setActiveGroupSettingsId(null)
  }

  const groupSettingsOptions = (group: GroupItem): SettingsOptions => ({
    pdf: group.conversionOptions.pdf,
    html: group.conversionOptions.html,
    htmlEncode: group.conversionOptions.htmlEncode,
    image: group.conversionOptions.image
      ? {
          quality: group.conversionOptions.image.quality,
          maxWidth: group.conversionOptions.image.maxWidth,
          maxHeight: group.conversionOptions.image.maxHeight,
          keepAspectRatio: group.conversionOptions.image.keepAspectRatio,
          removeExif: group.conversionOptions.image.removeExif
        }
      : undefined,
    txtImage: group.conversionOptions.txtImage,
    imageToPdf: group.conversionOptions.imageToPdf
      ? {
          margin: group.conversionOptions.imageToPdf.marginPt,
          fit: group.conversionOptions.imageToPdf.fit,
          pageMode: group.conversionOptions.imageToPdf.pageMode,
          rotationDeg: group.conversionOptions.imageToPdf.rotationDeg,
          scalePercent: group.conversionOptions.imageToPdf.scalePercent
        }
      : undefined
  })

  const groupedItemIds = useMemo(() => {
    const set = new Set<string>()
    for (const g of groups) {
      for (const id of g.fileIds) {
        set.add(id)
      }
    }
    return set
  }, [groups])

  const renderEntries = useMemo(() => {
    const itemIdToGroup = new Map<string, GroupItem>()
    for (const g of groups) {
      for (const id of g.fileIds) {
        itemIdToGroup.set(id, g)
      }
    }
    const renderedGroups = new Set<string>()
    const result: (
      | { type: 'group'; group: GroupItem; members: FileItem[] }
      | { type: 'item'; item: FileItem }
    )[] = []
    for (const it of items) {
      const group = itemIdToGroup.get(it.id)
      if (group) {
        if (!renderedGroups.has(group.id)) {
          const members = group.fileIds
            .map(id => items.find(x => x.id === id))
            .filter((x): x is FileItem => x !== undefined)
          result.push({ type: 'group', group, members })
          renderedGroups.add(group.id)
        }
      } else {
        result.push({ type: 'item', item: it })
      }
    }
    return result
  }, [items, groups])

  const renderFileRow = (
    it: FileItem,
    options: { isGroupMember?: boolean; rowId?: string } = {}
  ) => {
    const { isGroupMember = false, rowId } = options
    const supportedTargets = getSupportedTargets(it.source)
    const targets = supportedTargets.filter(target => {
      if (it.source === 'image' && /\.(gif|svg)$/i.test(it.file.name)) {
        return !['png', 'jpg', 'webp'].includes(target)
      }
      return true
    })
    const previewableOutputs = getPreviewableOutputs(it.outputs || [])
    const canPreview = it.status === 'done' && previewableOutputs.length > 0
    const isOptionsDisabled =
      it.status === 'queued' ||
      it.status === 'converting' ||
      it.status === 'done' ||
      isPreparingDownload
    const settingsSections = getSettingsSections(it.source, it.target, it.file.name, it.status)
    const settingsDisabled =
      settingsSections.length === 0 || isRunningStatus(it.status) || isPreparingDownload
    const isRowSelectable = isSelectableForBatch(it.status)
    return (
      <tr
        key={it.id}
        id={rowId}
        className={`file-table__row${isGroupMember ? ' file-table__row--group-member' : ''}`}
        onClick={multiSelectMode && isRowSelectable ? () => toggleItemSelection(it.id) : undefined}
      >
        {multiSelectMode && (
          <td className="file-table__cell file-table__cell--checkbox">
            <input
              type="checkbox"
              className="file-table__row-checkbox"
              checked={selectedItemIds.has(it.id)}
              onChange={() => toggleItemSelection(it.id)}
              onClick={e => e.stopPropagation()}
              disabled={!isRowSelectable}
              aria-label={it.file.name}
            />
          </td>
        )}
        <td className="file-table__cell file-table__cell--name">
          <span className="file-table__filename" title={it.file.name}>
            {truncateMiddle(it.file.name)}
          </span>
        </td>
        <td className="file-table__cell file-table__cell--source">{it.source}</td>
        <td className="file-table__cell file-table__cell--target">
          <div className="file-table__target-controls">
            <select
              className="file-table select"
              value={it.target}
              onChange={e => changeTarget(it.id, e.target.value as TargetFormat)}
              onClick={e => e.stopPropagation()}
              disabled={isOptionsDisabled}
            >
              {targets.map(target => (
                <option key={target} value={target}>
                  {t(`formats.targets.${target}`)}
                </option>
              ))}
            </select>
          </div>
        </td>
        <td className={`file-table__cell file-table__cell--status status status--${it.status}`}>
          {t(`status.${it.status}` as const)}
          {it.status === 'failed' && it.errorMessage && (
            <div className="status__detail status__detail--error">{it.errorMessage}</div>
          )}
          {it.warnings && it.warnings.length > 0 && (
            <div className="status__detail status__detail--warning">
              {it.warnings.map(warning => (
                <div key={typeof warning === 'string' ? warning : warning.message}>
                  {typeof warning === 'string' ? warning : warning.message}
                </div>
              ))}
            </div>
          )}
          {it.status === 'done' && it.outputs && (
            <div className="status__detail status__detail--count">
              {t('output.count', { count: it.outputs.length })}
            </div>
          )}
        </td>
        {!multiSelectMode && (
          <td className="file-table__cell file-table__cell--actions">
            <div className="row-actions">
              {it.status === 'done' && (
                <>
                  <button
                    type="button"
                    className="btn btn--ghost row-action-btn"
                    onClick={() => setActivePreviewItemId(it.id)}
                    aria-label={canPreview ? t('actions.preview') : t('actions.previewUnsupported')}
                    title={canPreview ? undefined : t('actions.previewUnsupported')}
                    disabled={!canPreview || isPreparingDownload}
                  >
                    {canPreview ? '🔍' : '⊘'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost row-action-btn"
                    onClick={() => handleRowDownload(it)}
                    aria-label={t('actions.download')}
                    disabled={isPreparingDownload}
                  >
                    ↓
                  </button>
                </>
              )}
              <button
                type="button"
                className="btn btn--ghost row-action-btn"
                onClick={() => setActiveSettingsItemId(it.id)}
                aria-label={t('actions.settings')}
                title={t('actions.settings')}
                disabled={settingsDisabled}
              >
                ⚙
              </button>
              <button
                type="button"
                className="btn btn--ghost row-action-btn"
                onClick={() => copyItem(it.id)}
                aria-label={t('actions.copy')}
                title={t('actions.copy')}
                disabled={isRunningStatus(it.status) || isConvertingAll || isPreparingDownload}
              >
                ⧉
              </button>
              <button
                type="button"
                className="btn btn--ghost row-action-btn"
                onClick={() => removeItem(it.id)}
                aria-label={t('actions.remove')}
                disabled={isConvertingAll || isRunningStatus(it.status) || isPreparingDownload}
              >
                ×
              </button>
            </div>
          </td>
        )}
      </tr>
    )
  }

  const renderGroupHeader = (group: GroupItem, members: FileItem[]) => {
    const commonTargets = getCommonGroupTargets(members.map(toGroupMember))
    const groupSettingsSections = getGroupSettingsSections(members.map(toGroupMember), group.target)
    const anyRunning = members.some(it => isRunningStatus(it.status))
    const eligibleMembers = members.filter(it => isConvertibleStatus(it.status))
    const selectableMembers = members.filter(it => isSelectableForBatch(it.status))
    const allSelectableSelected =
      selectableMembers.length > 0 && selectableMembers.every(it => selectedItemIds.has(it.id))
    const someSelectableSelected = selectableMembers.some(it => selectedItemIds.has(it.id))
    const headerDisabled = anyRunning || isConvertingAll || isPreparingDownload
    const groupIndex = groups.findIndex(g => g.id === group.id) + 1
    const memberRowIds = members.map(it => `group-${group.id}-member-${it.id}`)
    return (
      <tr
        key={`group-header-${group.id}`}
        className="group-header"
        aria-label={t('group.title', { index: groupIndex, count: members.length })}
      >
        <td colSpan={5}>
          <div className="group-header__inner">
            <button
              type="button"
              className="btn btn--ghost group-header__collapse-btn"
              onClick={() => toggleGroupCollapsed(group.id)}
              aria-expanded={!group.collapsed}
              aria-controls={memberRowIds.join(' ')}
              aria-label={group.collapsed ? t('group.expand') : t('group.collapse')}
            >
              {group.collapsed ? '▶' : '▼'}
            </button>
            <span className="group-header__title">
              {t('group.title', { index: groupIndex, count: members.length })}
            </span>
            <select
              className="group-header__target-select"
              value={group.target}
              onChange={e => changeGroupTarget(group.id, e.target.value as TargetFormat)}
              disabled={headerDisabled}
              aria-label={t('table.target')}
            >
              {commonTargets.map(target => (
                <option key={target} value={target}>
                  {t(`formats.targets.${target}`)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn--ghost group-header__settings-btn"
              onClick={() => setActiveGroupSettingsId(group.id)}
              disabled={headerDisabled || groupSettingsSections.length === 0}
              aria-label={t('group.settings')}
              title={
                groupSettingsSections.length === 0
                  ? t('group.noSettingsForTarget')
                  : t('group.settings')
              }
            >
              ⚙
            </button>
            <button
              type="button"
              className="btn btn--primary group-header__convert-btn"
              onClick={() => convertGroup(group.id)}
              disabled={headerDisabled || eligibleMembers.length === 0}
              aria-label={t('group.convert')}
            >
              {t('group.convert')}
            </button>
            {multiSelectMode && (
              <input
                type="checkbox"
                className="group-header__select-all"
                checked={allSelectableSelected}
                onChange={() => toggleGroupSelectAll(group.id)}
                disabled={headerDisabled || selectableMembers.length === 0}
                aria-label={t('group.selectAll')}
                ref={el => {
                  if (el) {
                    el.indeterminate = someSelectableSelected && !allSelectableSelected
                  }
                }}
              />
            )}
          </div>
        </td>
      </tr>
    )
  }

  const selectedItems = items.filter(it => selectedItemIds.has(it.id))
  const selectedCommonTargets =
    selectedItems.length > 0 ? getCommonGroupTargets(selectedItems.map(toGroupMember)) : []
  const canCreateGroup =
    selectedItems.length >= 2 &&
    selectedCommonTargets.length > 0 &&
    selectedItems.every(it => !groupedItemIds.has(it.id))
  const canBulkTarget = selectedItems.length > 0 && selectedCommonTargets.length > 0
  const toolbarMessageKey = ((): string | null => {
    if (selectedItems.length === 0) return null
    if (selectedItems.some(it => groupedItemIds.has(it.id))) return 'group.alreadyInGroup'
    if (selectedCommonTargets.length === 0) return 'multiSelect.noCommonTarget'
    return null
  })()

  const toggleItemSelection = (id: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div className="app">
      <FullscreenLoading
        visible={isConvertingAll || isPreparingDownload}
        label={fullscreenLoadingLabel}
      />
      <ParserIframeBridge ref={bridgeRef} />
      <Header />

      <main className="container">
        <section className="hero">
          <div className="hero__brand">
            <img
              src={assetUrl('logos/hamster_logo.png')}
              alt="Hamster"
              className="hero__brand__logo"
            />
          </div>
          <h1 className="hero__title">{t('appName')}</h1>
          <p className="hero__subtitle">{t('tagline')}</p>
        </section>

        <section className="panel">
          <div className="panel__header">
            <h2>{t('upload.title')}</h2>
            <div className="format-row">
              <span>{t('formats.to')}</span>
              <span className="supported">
                {t('formats.supported')}: {SUPPORTED_FORMATS.join(', ')}
              </span>
            </div>
          </div>

          <FileDropzone accept={acceptAttr} onFiles={onFilesAdded} />

          {rejectedFileNames.length > 0 && (
            <div className="upload-feedback upload-feedback--error" role="alert">
              <strong>{t('errors.unsupportedFormat', { formats: SUPPORTED_FORMAT_LIST })}</strong>
              <span>{rejectedFileNames.join(', ')}</span>
            </div>
          )}

          {items.length > 0 && (
            <div className="table-wrap">
              <table className="file-table">
                <thead>
                  <tr>
                    {multiSelectMode && (
                      <th
                        className="file-table__cell file-table__cell--checkbox"
                        aria-label={t('multiSelect.toggle')}
                      />
                    )}
                    <th>{t('table.fileName')}</th>
                    <th>{t('table.source')}</th>
                    <th>{t('table.target')}</th>
                    <th>{t('table.status')}</th>
                    {!multiSelectMode && <th>{t('table.action')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {renderEntries.map(entry => {
                    if (entry.type === 'group') {
                      const { group, members } = entry
                      const memberRowIds = members.map(it => `group-${group.id}-member-${it.id}`)
                      return (
                        <Fragment key={group.id}>
                          {renderGroupHeader(group, members)}
                          {!group.collapsed &&
                            members.map((it, index) =>
                              renderFileRow(it, {
                                isGroupMember: true,
                                rowId: memberRowIds[index]
                              })
                            )}
                        </Fragment>
                      )
                    }
                    return renderFileRow(entry.item)
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className={multiSelectMode ? 'actions actions--multi-select' : 'actions'}>
            <BottomActions
              multiSelectMode={multiSelectMode}
              items={items}
              selectedItemIds={selectedItemIds}
              selectedCommonTargets={selectedCommonTargets}
              canCreateGroup={canCreateGroup}
              canBulkTarget={canBulkTarget}
              toolbarMessageKey={toolbarMessageKey}
              isConvertingAll={isConvertingAll}
              isPreparingDownload={isPreparingDownload}
              canDownloadArchive={canDownloadArchive}
              batchProgress={batchProgress}
              acceptAttr={acceptAttr}
              addFilesInputRef={addFilesInputRef}
              onCreateGroup={createGroup}
              onBulkDelete={bulkDelete}
              onBulkTargetChange={bulkTargetChange}
              onSelectAll={selectAll}
              onDeselectAll={deselectAll}
              onExitMultiSelectMode={exitMultiSelectMode}
              onAddFilesClick={() => addFilesInputRef.current?.click()}
              onFilesAdded={onFilesAdded}
              onConvertAll={convertAll}
              onDownloadAll={handleDownloadAll}
              onEnterMultiSelectMode={enterMultiSelectMode}
              onClearAll={clearAll}
              t={t}
            />
          </div>
        </section>
      </main>

      <Footer />
      {confirmModal && (
        <ConfirmModal
          open
          message={confirmModal.message}
          onCancel={confirmModal.onCancel}
          onConfirm={confirmModal.onConfirm}
        />
      )}
      {activePreviewItem && (
        <PreviewModal
          open
          results={getPreviewableOutputs(activePreviewItem.outputs || [])}
          onClose={() => setActivePreviewItemId(null)}
        />
      )}
      {activeSettingsItem && (
        <SettingsModal
          open
          source={activeSettingsItem.source}
          target={activeSettingsItem.target}
          fileName={activeSettingsItem.file.name}
          status={activeSettingsItem.status}
          options={{
            pdf: activeSettingsItem.conversionOptions.pdf,
            html: activeSettingsItem.conversionOptions.html,
            htmlEncode: activeSettingsItem.conversionOptions.htmlEncode,
            image: activeSettingsItem.conversionOptions.image,
            txtImage: activeSettingsItem.conversionOptions.txtImage,
            imageToPdf: activeSettingsItem.conversionOptions.imageToPdf
              ? {
                  margin: activeSettingsItem.conversionOptions.imageToPdf.marginPt,
                  fit: activeSettingsItem.conversionOptions.imageToPdf.fit,
                  pageMode: activeSettingsItem.conversionOptions.imageToPdf.pageMode,
                  rotationDeg: activeSettingsItem.conversionOptions.imageToPdf.rotationDeg,
                  scalePercent: activeSettingsItem.conversionOptions.imageToPdf.scalePercent
                }
              : undefined
          }}
          file={activeSettingsItem.file}
          readOnly={activeSettingsItem.status === 'done'}
          onCancel={() => setActiveSettingsItemId(null)}
          onConfirm={next => {
            applySettingsOptions(activeSettingsItem.id, next)
            setActiveSettingsItemId(null)
          }}
        />
      )}
      {activeGroupSettings && (
        <SettingsModal
          open
          settingsScope="group-target"
          visibleSectionsOverride={getGroupSettingsSections(
            activeGroupSettings.fileIds
              .map(id => items.find(it => it.id === id))
              .filter((it): it is FileItem => it !== undefined)
              .map(toGroupMember),
            activeGroupSettings.target
          )}
          target={activeGroupSettings.target}
          options={groupSettingsOptions(activeGroupSettings)}
          onCancel={() => setActiveGroupSettingsId(null)}
          onConfirm={next => {
            applyGroupSettings(activeGroupSettings.id, next)
          }}
        />
      )}
    </div>
  )
}

export default App
