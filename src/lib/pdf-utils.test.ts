import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('pdfjs-dist/build/pdf.worker.mjs?url', () => ({ default: 'mock-worker-url' }))

const mockedPdfjs = vi.hoisted(
  (): {
    GlobalWorkerOptions: { workerSrc?: string }
    getDocument: ReturnType<typeof vi.fn>
  } => ({
    GlobalWorkerOptions: {},
    getDocument: vi.fn()
  })
)

vi.mock('pdfjs-dist', () => mockedPdfjs)

import { getPdfPageCount, loadPdfDocument, readFileAsArrayBuffer } from './pdf-utils'

type FileReaderListener = () => void

describe('pdf-utils', () => {
  beforeEach(() => {
    mockedPdfjs.GlobalWorkerOptions = {}
    mockedPdfjs.getDocument = vi.fn()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('readFileAsArrayBuffer uses File.arrayBuffer() when available', async () => {
    const expectedBuffer = new ArrayBuffer(8)
    const file = new File(['pdf'], 'sample.pdf', { type: 'application/pdf' })
    const arrayBuffer = vi.fn<() => Promise<ArrayBuffer>>().mockResolvedValue(expectedBuffer)
    Object.defineProperty(file, 'arrayBuffer', { value: arrayBuffer })

    await expect(readFileAsArrayBuffer(file)).resolves.toBe(expectedBuffer)
    expect(arrayBuffer).toHaveBeenCalledTimes(1)
  })

  it('readFileAsArrayBuffer falls back to FileReader when arrayBuffer is missing', async () => {
    const expectedBuffer = new ArrayBuffer(12)
    const listeners = new Map<string, FileReaderListener>()

    class MockFileReader {
      result: ArrayBuffer | null = null
      error: Error | null = null

      addEventListener(type: string, listener: FileReaderListener): void {
        listeners.set(type, listener)
      }

      readAsArrayBuffer(): void {
        this.result = expectedBuffer
        listeners.get('load')?.()
      }
    }

    vi.stubGlobal('FileReader', MockFileReader)

    const file = new Blob(['pdf'], { type: 'application/pdf' }) as File

    await expect(readFileAsArrayBuffer(file)).resolves.toBe(expectedBuffer)
  })

  it('getPdfPageCount returns numPages from pdfjs getDocument', async () => {
    const expectedBuffer = new ArrayBuffer(4)
    const pdfDocument = { numPages: 7, getPage: vi.fn() }
    mockedPdfjs.getDocument.mockReturnValue({ promise: Promise.resolve(pdfDocument) })
    const file = new File(['pdf'], 'sample.pdf', { type: 'application/pdf' })
    const arrayBuffer = vi.fn<() => Promise<ArrayBuffer>>().mockResolvedValue(expectedBuffer)
    Object.defineProperty(file, 'arrayBuffer', { value: arrayBuffer })

    await expect(getPdfPageCount(file)).resolves.toBe(7)
    expect(mockedPdfjs.getDocument).toHaveBeenCalledWith({ data: new Uint8Array(expectedBuffer) })
  })

  it('loadPdfDocument configures worker source on first call', async () => {
    mockedPdfjs.getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 1, getPage: vi.fn() })
    })

    await loadPdfDocument(new ArrayBuffer(2))

    expect(mockedPdfjs.GlobalWorkerOptions.workerSrc).toBe('mock-worker-url')
  })
})
