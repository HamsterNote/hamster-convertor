import { useEffect, useMemo, useRef, useState } from 'react'
import log from 'loglevel'
import Header from './components/Header'
import FileDropzone from './components/FileDropzone'
import Footer from './components/Footer'
import { useTranslation } from 'react-i18next'
import { convertPdfToHtml } from './lib/converter'
import { downloadHtmlArchive, downloadHtmlFile } from './lib/download'

type SupportedFormat = 'pdf' | 'doc' | 'docx' | 'txt' | 'html' | 'epub' | 'md'
type TargetFormat = 'html'

type FileItem = {
  id: string
  file: File
  source: SupportedFormat
  target: TargetFormat
  status: 'ready' | 'queued' | 'converting' | 'done' | 'failed'
  html?: string
  warnings?: string[]
  errorMessage?: string
}

const SUPPORTED_FORMATS: SupportedFormat[] = [
  'pdf',
  'doc',
  'docx',
  'txt',
  'html',
  'epub',
  'md'
]

const extToFormat = (name: string): SupportedFormat => {
  const ext = name.split('.').pop()?.toLowerCase()
  const extMap: Record<string, SupportedFormat> = {
    pdf: 'pdf',
    doc: 'doc',
    docx: 'docx',
    txt: 'txt',
    html: 'html',
    htm: 'html',
    epub: 'epub',
    md: 'md',
    markdown: 'md'
  }

  if (ext && ext in extMap) {
    return extMap[ext]
  }
  return 'pdf'
}

function App() {
  const { t, i18n } = useTranslation()
  const [items, setItems] = useState<FileItem[]>([])
  const itemsRef = useRef<FileItem[]>(items)

  // 同步 itemsRef 到最新状态
  useEffect(() => {
    itemsRef.current = items
  }, [items])

  const hasPending = items.some((it) =>
    ['ready', 'queued', 'converting'].includes(it.status)
  )
  const downloadableItems = items.filter(
    (it) => it.status === 'done' && it.html
  )
  const canDownloadArchive =
    items.length > 0 && !hasPending && downloadableItems.length > 0

  useEffect(() => {
    document.title = `${t('appName')} | Hamster Document Converter`
  }, [i18n.language, t])

  const onFilesAdded = (files: File[]) => {
    const next: FileItem[] = files.map((f) => ({
      id: `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2)}`,
      file: f,
      source: extToFormat(f.name),
      target: 'html' as TargetFormat,
      status: 'ready'
    }))
    setItems((prev) => [...prev, ...next])
  }

  const clearAll = () => setItems([])

  const convertAll = async () => {
    const isRunning = itemsRef.current.some((it) =>
      ['queued', 'converting'].includes(it.status)
    )
    if (isRunning) return

    const idsToConvert = itemsRef.current
      .filter((it) => it.status === 'ready' || it.status === 'failed')
      .map((i) => i.id)
    if (idsToConvert.length === 0) return

    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        status: it.status === 'done' ? 'done' : 'queued',
        errorMessage: undefined
      }))
    )

    for (const id of idsToConvert) {
      const current = itemsRef.current.find((it) => it.id === id)
      if (!current) continue
      if (current.source !== 'pdf') {
        setItems((prev) =>
          prev.map((it) =>
            it.id === id
              ? {
                  ...it,
                  status: 'failed',
                  errorMessage: t('errors.unsupportedFormat')
                }
              : it
          )
        )
        continue
      }

      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, status: 'converting' } : it))
      )

      try {
        const buffer = await current.file.arrayBuffer()
        const { html, warnings } = await convertPdfToHtml(
          new Uint8Array(buffer)
        )
        setItems((prev) =>
          prev.map((it) =>
            it.id === id
              ? {
                  ...it,
                  status: 'done',
                  html,
                  warnings
                }
              : it
          )
        )
      } catch (error) {
        log.warn('Conversion failed', {
          id,
          fileName: current.file.name,
          error
        })
        setItems((prev) =>
          prev.map((it) =>
            it.id === id
              ? {
                  ...it,
                  status: 'failed',
                  errorMessage: t('errors.conversionFailed')
                }
              : it
          )
        )
      }
    }
  }

  const acceptAttr = useMemo(
    () => '.pdf,.doc,.docx,.txt,.html,.htm,.epub,.md,.markdown',
    []
  )

  return (
    <div className='app'>
      <Header />

      <main className='container'>
        <section className='hero'>
          <div className='hero__brand'>
            <img
              src='/logos/hamster_logo.png'
              alt='Hamster'
              className='hero__brand__logo'
            />
          </div>
          <h1 className='hero__title'>{t('appName')}</h1>
          <p className='hero__subtitle'>{t('tagline')}</p>
        </section>

        <section className='panel'>
          <div className='panel__header'>
            <h2>{t('upload.title')}</h2>
            <div className='format-row'>
              <label>
                {t('formats.to')} <span className='format-target'>HTML</span>
              </label>
              <span className='supported'>
                {t('formats.supported')}: {SUPPORTED_FORMATS.join(', ')}
              </span>
            </div>
          </div>

          <FileDropzone accept={acceptAttr} onFiles={onFilesAdded} />

          {items.length > 0 && (
            <div className='table-wrap'>
              <table className='file-table'>
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
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.file.name}</td>
                      <td>{it.source}</td>
                      <td>html</td>
                      <td className={`status status--${it.status}`}>
                        {t(`status.${it.status}` as const)}
                        {it.status === 'failed' && it.errorMessage && (
                          <div
                            style={{ fontSize: '0.85em', marginTop: '0.25rem' }}
                          >
                            {it.errorMessage}
                          </div>
                        )}
                        {it.warnings && it.warnings.length > 0 && (
                          <div
                            style={{
                              fontSize: '0.85em',
                              marginTop: '0.25rem',
                              color: 'var(--color-primary-700)'
                            }}
                          >
                            {it.warnings.map((w, idx) => (
                              <div key={idx}>{w}</div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        {it.status === 'done' ? (
                          <button
                            className='btn btn--ghost'
                            onClick={() => {
                              if (!it.html) return
                              const htmlName = it.file.name.replace(
                                /\.[^/.]+$/,
                                ''
                              )
                              downloadHtmlFile({
                                name: `${htmlName}.html`,
                                content: it.html
                              })
                            }}
                            aria-label={t('actions.download')}
                          >
                            ↓
                          </button>
                        ) : (
                          <button
                            className='btn btn--ghost'
                            onClick={() =>
                              setItems((prev) =>
                                prev.filter((x) => x.id !== it.id)
                              )
                            }
                            aria-label={t('actions.remove')}
                          >
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className='actions'>
            <label className='btn btn--secondary'>
              {t('actions.addFiles')}
              <input
                type='file'
                style={{ display: 'none' }}
                multiple
                accept={acceptAttr}
                onChange={(e) => {
                  const files = e.target.files ? Array.from(e.target.files) : []
                  if (files.length) onFilesAdded(files)
                  e.currentTarget.value = ''
                }}
              />
            </label>
            <button
              className='btn btn--primary'
              disabled={items.length === 0}
              onClick={convertAll}
            >
              {t('actions.convertAll')}
            </button>
            <button
              className='btn btn--ghost'
              disabled={!canDownloadArchive}
              onClick={() =>
                downloadHtmlArchive(
                  downloadableItems.map((item) => ({
                    name: `${item.file.name.replace(/\.[^/.]+$/, '')}.html`,
                    content: item.html ?? ''
                  })),
                  'hamster-html.html'
                )
              }
            >
              {t('actions.download')}
            </button>
            <button
              className='btn btn--ghost'
              disabled={items.length === 0}
              onClick={clearAll}
            >
              {t('actions.clearAll')}
            </button>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}

export default App
