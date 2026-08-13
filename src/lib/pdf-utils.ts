import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

export type PdfJsModule = {
  GlobalWorkerOptions?: {
    workerSrc?: string
  }
  getDocument: (options: { data: Uint8Array }) => {
    promise: Promise<PdfJsDocument>
  }
}

export type PdfJsDocument = {
  numPages: number
  getPage: (pageNumber: number) => Promise<PdfJsPage>
}

export type PdfJsPage = {
  getViewport: (options: { scale: number }) => { width: number; height: number }
  render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
    promise: Promise<void>
  }
}

export const configurePdfJsWorker = (pdfjs: PdfJsModule): void => {
  if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  }
}

export const readFileAsArrayBuffer = async (file: File): Promise<ArrayBuffer> => {
  const fileWithArrayBuffer = file as File & { arrayBuffer?: () => Promise<ArrayBuffer> }
  if (fileWithArrayBuffer.arrayBuffer) {
    return fileWithArrayBuffer.arrayBuffer()
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result)
        return
      }
      reject(new Error('FileReader returned an unsupported result'))
    })
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('Failed to read file'))
    })
    reader.readAsArrayBuffer(file)
  })
}

export const loadPdfDocument = async (arrayBuffer: ArrayBuffer): Promise<PdfJsDocument> => {
  const pdfjs = (await import('pdfjs-dist')) as unknown as PdfJsModule
  configurePdfJsWorker(pdfjs)
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) })
  return loadingTask.promise
}

export const getPdfPageCount = async (file: File): Promise<number> => {
  const buffer = await readFileAsArrayBuffer(file)
  const doc = await loadPdfDocument(buffer)
  return doc.numPages
}
