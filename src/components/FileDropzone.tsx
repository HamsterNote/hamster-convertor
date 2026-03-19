import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

type Props = {
  accept: string
  onFiles: (files: File[]) => void
}

function FileDropzone({ accept, onFiles }: Props) {
  const { t } = useTranslation()
  const [isOver, setIsOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLButtonElement>) => {
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

  const openFilePicker = () => {
    inputRef.current?.click()
  }

  return (
    <>
      <button
        aria-label={t('upload.drop')}
        className={`dropzone ${isOver ? 'dropzone--over' : ''}`}
        onClick={openFilePicker}
        onDragOver={e => {
          e.preventDefault()
          setIsOver(true)
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={handleDrop}
        type="button"
      >
        <div className="dropzone__content">
          <p>{t('upload.drop')}</p>
          <span className="muted">{t('upload.or')}</span>
          <span aria-hidden="true" className="btn btn--secondary">
            {t('upload.browse')}
          </span>
        </div>
      </button>
      <input
        accept={accept}
        multiple
        onChange={handleBrowse}
        ref={inputRef}
        style={{ display: 'none' }}
        type="file"
      />
    </>
  )
}

export default FileDropzone
