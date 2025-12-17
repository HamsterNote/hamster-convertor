import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

type Props = {
  accept: string
  onFiles: (files: File[]) => void
}

function FileDropzone({ accept, onFiles }: Props) {
  const { t } = useTranslation()
  const [isOver, setIsOver] = useState(false)

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsOver(false)
      const files = Array.from(e.dataTransfer.files)
      if (files.length) onFiles(files)
    },
    [onFiles]
  )

  const handleBrowse = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    if (files.length) onFiles(files)
    e.currentTarget.value = ''
  }

  return (
    <div
      className={`dropzone ${isOver ? 'dropzone--over' : ''}`}
      onDragOver={e => {
        e.preventDefault()
        setIsOver(true)
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={handleDrop}
    >
      <div className="dropzone__content">
        <p>{t('upload.drop')}</p>
        <span className="muted">{t('upload.or')}</span>
        <label className="btn btn--secondary">
          {t('upload.browse')}
          <input
            type="file"
            accept={accept}
            multiple
            style={{ display: 'none' }}
            onChange={handleBrowse}
          />
        </label>
      </div>
    </div>
  )
}

export default FileDropzone
