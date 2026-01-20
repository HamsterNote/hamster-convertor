type DownloadFile = {
  name: string
  content: string
}

const ensureDownloadAnchor = (url: string, name: string) => {
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.rel = 'noopener'
  link.click()
}

const triggerBlobDownload = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob)
  try {
    ensureDownloadAnchor(url, name)
    // 延迟释放 URL，确保下载已启动
    setTimeout(() => {
      URL.revokeObjectURL(url)
    }, 100)
  } catch (error) {
    // 确保 URL 被释放
    URL.revokeObjectURL(url)
    throw error
  }
}

export const downloadHtmlFile = (file: DownloadFile) => {
  const blob = new Blob([file.content], { type: 'text/html;charset=utf-8' })
  triggerBlobDownload(blob, file.name)
}

export const downloadHtmlArchive = async (
  files: DownloadFile[],
  archiveName: string
) => {
  const html = files
    .map((file) => `<!-- ${file.name} -->\n${file.content}\n\n`)
    .join('')
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  triggerBlobDownload(blob, archiveName.replace(/\.zip$/, '.html'))
}
