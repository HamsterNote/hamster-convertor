import log from 'loglevel'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import FileDropzone from './components/FileDropzone'
import Footer from './components/Footer'
import FullscreenLoading from './components/FullscreenLoading'
import Header from './components/Header'
import PdfPageSelectorModal from './components/PdfPageSelectorModal'
import {
  type ConversionResult,
  type ConversionWarning,
  convertFile,
  getSupportedTargets,
  type SourceFormat,
  type TargetFormat
} from './lib/converter'
import { downloadBlobFile, downloadResultArchive } from './lib/download'

type ConversionOptions = {
  pdf: {
    ocr: boolean
    selectedPages?: number[]
  }
}

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
  'htm'
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
    htm: 'html'
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

const createFileItemId = (file: File): string => {
  fallbackFileItemId += 1

  const randomId =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${fallbackFileItemId}`

  return `${file.name}-${file.size}-${file.lastModified}-${randomId}`
}

type ConversionErrorKey = 'conversionFailed' | 'emptyOcr' | 'ocrRequired'

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

function App() {
  const { t } = useTranslation()
  const [items, setItems] = useState<FileItem[]>([])
  const [rejectedFileNames, setRejectedFileNames] = useState<string[]>([])
  const itemsRef = useRef<FileItem[]>(items)
  const addFilesInputRef = useRef<HTMLInputElement>(null)
  const [isConvertingAll, setIsConvertingAll] = useState(false)
  const [isPreparingDownload, setIsPreparingDownload] = useState(false)
  const [activePdfPageSelectorItemId, setActivePdfPageSelectorItemId] = useState<string | null>(
    null
  )

  const activePdfItem = activePdfPageSelectorItemId
    ? items.find(it => it.id === activePdfPageSelectorItemId)
    : undefined

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  const hasPending = items.some(it => isPendingStatus(it.status))
  const downloadableItems = items.filter(
    it => it.status === 'done' && it.outputs && it.outputs.length > 0
  )
  const canDownloadArchive = items.length > 0 && !hasPending && downloadableItems.length > 0

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
  }

  const clearAll = () => setItems([])

  const changeTarget = (id: string, target: TargetFormat) => {
    setItems(prev =>
      prev.map(it => {
        if (it.id !== id) return it
        const hadImageTarget = ['png', 'jpg', 'webp'].includes(it.target)
        const newItem = { ...it, target }
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

  const changeOcrOption = (id: string, ocr: boolean) => {
    setItems(prev =>
      prev.map(it =>
        it.id === id
          ? { ...it, conversionOptions: { pdf: { ...it.conversionOptions.pdf, ocr } } }
          : it
      )
    )
  }

  const changeSelectedPages = (id: string, selectedPages: number[] | undefined) => {
    setItems(prev =>
      prev.map(it =>
        it.id === id
          ? {
              ...it,
              conversionOptions: { pdf: { ...it.conversionOptions.pdf, selectedPages } }
            }
          : it
      )
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

  const convertAll = async () => {
    const isRunning = itemsRef.current.some(it => isRunningStatus(it.status))
    if (isRunning) return

    const idsToConvert = itemsRef.current
      .filter(it => isConvertibleStatus(it.status))
      .map(i => i.id)
    if (idsToConvert.length === 0) return

    setIsConvertingAll(true)
    setItems(prev => prev.map(queueItem))

    try {
      for (const id of idsToConvert) {
        const current = itemsRef.current.find(it => it.id === id)
        if (!current) continue
        if (!getSupportedTargets(current.source).includes(current.target)) {
          markFailed(id, t('errors.unsupportedConversion'))
          continue
        }

        if (current.source === 'pdf' && hasExplicitlyEmptySelectedPages(current)) {
          markFailed(id, t('errors.noPagesSelected'))
          continue
        }

        markConverting(id)

        try {
          const results = await convertFile({
            file: current.file,
            source: current.source,
            target: current.target,
            options: current.conversionOptions
          })
          markDone(id, results)
        } catch (error) {
          log.warn('Conversion failed', {
            id,
            fileName: current.file.name,
            error
          })
          markFailed(id, t(`errors.${getConversionErrorKey(error)}` as const))
        }
      }
    } finally {
      setIsConvertingAll(false)
    }
  }

  const acceptAttr = useMemo(() => '.pdf,.txt,.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg,.html,.htm', [])

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

  return (
    <div className="app">
      <FullscreenLoading
        visible={isConvertingAll || isPreparingDownload}
        label={isPreparingDownload ? t('loading.preparingDownload') : t('loading.converting')}
      />
      <Header />

      <main className="container">
        <section className="hero">
          <div className="hero__brand">
            <img src="/logos/hamster_logo.png" alt="Hamster" className="hero__brand__logo" />
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
                    <th>{t('table.fileName')}</th>
                    <th>{t('table.source')}</th>
                    <th>{t('table.target')}</th>
                    <th>{t('table.status')}</th>
                    <th>{t('table.action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => {
                    const supportedTargets = getSupportedTargets(it.source)
                    const targets = supportedTargets.filter(target => {
                      if (it.source === 'image' && /\.(gif|svg)$/i.test(it.file.name)) {
                        return !['png', 'jpg', 'webp'].includes(target)
                      }
                      return true
                    })
                    return (
                      <tr key={it.id}>
                        <td>{it.file.name}</td>
                        <td>{it.source}</td>
                        <td>
                          <select
                            className="file-table select"
                            value={it.target}
                            onChange={e => changeTarget(it.id, e.target.value as TargetFormat)}
                            disabled={
                              it.status === 'converting' ||
                              it.status === 'queued' ||
                              it.status === 'done' ||
                              isPreparingDownload
                            }
                          >
                            {targets.map(target => (
                              <option key={target} value={target}>
                                {t(`formats.targets.${target}`)}
                              </option>
                            ))}
                          </select>
                          {it.source === 'pdf' && it.target === 'pdf' && (
                            <label className="file-table ocr-label">
                              <input
                                type="checkbox"
                                checked={it.conversionOptions.pdf.ocr}
                                onChange={e => changeOcrOption(it.id, e.target.checked)}
                                disabled={
                                  it.status === 'queued' ||
                                  it.status === 'converting' ||
                                  it.status === 'done' ||
                                  isPreparingDownload
                                }
                              />
                              {t('options.ocr')}
                            </label>
                          )}
                          {it.source === 'pdf' && it.status !== 'done' && (
                            <div>
                              <button
                                type="button"
                                className="btn btn--ghost page-selector-btn"
                                onClick={() => setActivePdfPageSelectorItemId(it.id)}
                                disabled={isPreparingDownload}
                              >
                                {t('actions.selectPages')}
                              </button>
                              {it.conversionOptions.pdf.selectedPages !== undefined && (
                                <div className="selected-pages-summary">
                                  {t('options.pdfPages.selectedCount', {
                                    count: it.conversionOptions.pdf.selectedPages.length
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className={`status status--${it.status}`}>
                          {t(`status.${it.status}` as const)}
                          {it.status === 'failed' && it.errorMessage && (
                            <div className="status__detail status__detail--error">
                              {it.errorMessage}
                            </div>
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
                        <td>
                          <div className="row-actions">
                            {it.status === 'done' && (
                              <button
                                type="button"
                                className="btn btn--ghost"
                                onClick={() => handleRowDownload(it)}
                                aria-label={t('actions.download')}
                                disabled={isPreparingDownload}
                              >
                                ↓
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn--ghost"
                              onClick={() => removeItem(it.id)}
                              aria-label={t('actions.remove')}
                              disabled={
                                isConvertingAll || isRunningStatus(it.status) || isPreparingDownload
                              }
                            >
                              ×
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="actions">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => addFilesInputRef.current?.click()}
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
              onClick={convertAll}
            >
              {t('actions.convertAll')}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={!canDownloadArchive || isConvertingAll || isPreparingDownload}
              onClick={handleDownloadAll}
            >
              {t('actions.download')}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={items.length === 0 || isConvertingAll || isPreparingDownload}
              onClick={clearAll}
            >
              {t('actions.clearAll')}
            </button>
          </div>
        </section>
      </main>

      <Footer />
      {activePdfItem && (
        <PdfPageSelectorModal
          open
          file={activePdfItem.file}
          selectedPages={activePdfItem.conversionOptions.pdf.selectedPages}
          onCancel={() => setActivePdfPageSelectorItemId(null)}
          onConfirm={pages => {
            changeSelectedPages(activePdfItem.id, pages)
            setActivePdfPageSelectorItemId(null)
          }}
        />
      )}
    </div>
  )
}

export default App
