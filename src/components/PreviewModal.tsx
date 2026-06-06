import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ConversionResult } from '../lib/converter'

type PreviewModalProps = {
  open: boolean
  result: ConversionResult
  onClose: () => void
}

/**
 * 全屏预览模态框组件
 * 使用 iframe 内嵌显示转换结果，支持 HTML、图片、PDF、文本等格式
 * 通过 URL.createObjectURL 创建 blob 链接，关闭时自动释放
 */
export default function PreviewModal({ open, result, onClose }: PreviewModalProps) {
  const { t } = useTranslation()
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const objectUrlRef = useRef<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // 释放 object URL 的工具函数
  const revokeCurrentUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }, [])

  // 当 result 变化时，创建新的 object URL
  useEffect(() => {
    if (!result) {
      return
    }

    // 创建 blob URL 用于 iframe 预览
    const url = URL.createObjectURL(result.blob)
    objectUrlRef.current = url
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewUrl(url)

    setIsLoading(true)

    return () => {
      revokeCurrentUrl()
    }
  }, [result, revokeCurrentUrl])

  // 当 modal 关闭时清理状态
  useEffect(() => {
    if (!open) {
      revokeCurrentUrl()
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreviewUrl(null)

      setIsLoading(true)
    }
  }, [open, revokeCurrentUrl])

  // 处理 ESC 键关闭
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // iframe 加载完成回调
  const handleIframeLoad = () => {
    setIsLoading(false)
  }

  if (!open) return null

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="preview-modal-overlay"
      onClick={handleOverlayClick}
      onKeyDown={e => e.key === 'Escape' && onClose()}
    >
      <div
        className="preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('preview.title', { filename: result.filename })}
      >
        {/* 标题栏 */}
        <div className="preview-modal__header">
          <h2 className="preview-modal__title">{result.filename}</h2>
          <button
            type="button"
            className="preview-modal__close"
            onClick={onClose}
            aria-label={t('preview.close')}
          >
            ×
          </button>
        </div>

        {/* 内容区域 */}
        <div className="preview-modal__body">
          {isLoading && (
            <div className="preview-modal__loading">
              <span className="preview-modal__spinner" aria-hidden />
              <span>{t('preview.loading')}</span>
            </div>
          )}
          {previewUrl && (
            <iframe
              ref={iframeRef}
              className="preview-modal__iframe"
              src={previewUrl}
              title={result.filename}
              onLoad={handleIframeLoad}
              sandbox="allow-same-origin"
              style={{ display: isLoading ? 'none' : 'block' }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
