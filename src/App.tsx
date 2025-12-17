import { useEffect, useMemo, useState } from 'react'
import Header from './components/Header'
import FileDropzone from './components/FileDropzone'
import Footer from './components/Footer'
import { useTranslation } from 'react-i18next'

type SupportedFormat = 'pdf' | 'doc' | 'docx' | 'txt' | 'html' | 'epub' | 'md'

type FileItem = {
  id: string
  file: File
  source: SupportedFormat
  target: SupportedFormat
  status: 'ready' | 'queued' | 'converting' | 'done' | 'failed'
}

const SUPPORTED_FORMATS: SupportedFormat[] = ['pdf', 'doc', 'docx', 'txt', 'html', 'epub', 'md']

const extToFormat = (name: string): SupportedFormat => {
  const ext = name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'pdf':
    case 'doc':
    case 'docx':
    case 'txt':
    case 'html':
    case 'htm':
    case 'epub':
    case 'md':
    case 'markdown':
      return (ext.replace('htm', 'html').replace('markdown', 'md') as SupportedFormat)
    default:
      return 'pdf'
  }
}

function App() {
  const { t, i18n } = useTranslation()
  const [items, setItems] = useState<FileItem[]>([])
  const [defaultTarget, setDefaultTarget] = useState<SupportedFormat>('pdf')

  useEffect(() => {
    document.title = `${t('appName')} | Hamster Document Converter`
  }, [i18n.language, t])

  const onFilesAdded = (files: File[]) => {
    const next: FileItem[] = files.map(f => ({
      id: `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2)}`,
      file: f,
      source: extToFormat(f.name),
      target: defaultTarget,
      status: 'ready'
    }))
    setItems(prev => [...prev, ...next])
  }

  const clearAll = () => setItems([])

  const convertAll = async () => {
    // Demo only: simulate conversion
    setItems(prev => prev.map(it => ({ ...it, status: it.status === 'done' ? 'done' : 'queued' })))
    for (const id of items.map(i => i.id)) {
      setItems(prev => prev.map(it => (it.id === id ? { ...it, status: 'converting' } : it)))
      // simulate time
      // eslint-disable-next-line no-await-in-loop
      await new Promise(res => setTimeout(res, 500))
      const ok = Math.random() > 0.05
      setItems(prev => prev.map(it => (it.id === id ? { ...it, status: ok ? 'done' : 'failed' } : it)))
    }
  }

  const acceptAttr = useMemo(
    () => '.pdf,.doc,.docx,.txt,.html,.htm,.epub,.md,.markdown',
    []
  )

  return (
    <div className="app">
      <Header />

      <main className="container">
        <section className="hero">
          <div className="hero__brand">🐹</div>
          <h1 className="hero__title">{t('appName')}</h1>
          <p className="hero__subtitle">{t('tagline')}</p>
        </section>

        <section className="panel">
          <div className="panel__header">
            <h2>{t('upload.title')}</h2>
            <div className="format-row">
              <label>
                {t('formats.to')}
                <select
                  value={defaultTarget}
                  onChange={e => setDefaultTarget(e.target.value as SupportedFormat)}
                >
                  {SUPPORTED_FORMATS.map(f => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <span className="supported">
                {t('formats.supported')}: {SUPPORTED_FORMATS.join(', ')}
              </span>
            </div>
          </div>

          <FileDropzone accept={acceptAttr} onFiles={onFilesAdded} />

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
                  {items.map(it => (
                    <tr key={it.id}>
                      <td>{it.file.name}</td>
                      <td>{it.source}</td>
                      <td>
                        <select
                          value={it.target}
                          onChange={e =>
                            setItems(prev =>
                              prev.map(x => (x.id === it.id ? { ...x, target: e.target.value as SupportedFormat } : x))
                            )
                          }
                        >
                          {SUPPORTED_FORMATS.filter(f => f !== it.source).map(f => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={`status status--${it.status}`}>
                        {t(`status.${it.status}` as const)}
                      </td>
                      <td>
                        <button
                          className="btn btn--ghost"
                          onClick={() => setItems(prev => prev.filter(x => x.id !== it.id))}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="actions">
            <label className="btn btn--secondary">
              {t('actions.addFiles')}
              <input
                type="file"
                style={{ display: 'none' }}
                multiple
                accept={acceptAttr}
                onChange={e => {
                  const files = e.target.files ? Array.from(e.target.files) : []
                  if (files.length) onFilesAdded(files)
                  e.currentTarget.value = ''
                }}
              />
            </label>
            <button className="btn btn--primary" disabled={items.length === 0} onClick={convertAll}>
              {t('actions.convertAll')}
            </button>
            <button className="btn btn--ghost" disabled={items.length === 0} onClick={clearAll}>
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
