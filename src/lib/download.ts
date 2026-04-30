import type { ConversionResult } from './converter'

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
    setTimeout(() => {
      URL.revokeObjectURL(url)
    }, 100)
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

export const downloadBlobFile = (result: ConversionResult) => {
  triggerBlobDownload(result.blob, result.filename)
}

export const downloadResultArchive = async (results: ConversionResult[], archiveName: string) => {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  results.forEach(result => {
    zip.file(result.filename, result.blob)
  })
  const blob = await zip.generateAsync({ type: 'blob' })
  triggerBlobDownload(blob, archiveName.endsWith('.zip') ? archiveName : `${archiveName}.zip`)
}
