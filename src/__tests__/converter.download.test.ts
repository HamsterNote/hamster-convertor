import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversionResult } from '../lib/converter'
import { downloadBlobFile, downloadResultArchive } from '../lib/download'

const zipMocks = vi.hoisted(() => ({
  file: vi.fn(),
  generateAsync: vi.fn()
}))

vi.mock('jszip', () => ({
  default: vi.fn(() => ({
    file: zipMocks.file,
    generateAsync: zipMocks.generateAsync
  }))
}))

const makeResult = (filename: string, content: string): ConversionResult => ({
  blob: new Blob([content], { type: 'text/plain' }),
  filename,
  mimeType: 'text/plain',
  targetFormat: 'txt'
})

describe('converter download helpers', () => {
  const originalCreateObjectUrl = URL.createObjectURL
  const originalRevokeObjectUrl = URL.revokeObjectURL
  const originalCreateElement = document.createElement.bind(document)

  let anchorElement: HTMLAnchorElement | undefined
  let clicked: ReturnType<typeof vi.fn>
  let downloadedBlob: Blob | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    clicked = vi.fn()
    downloadedBlob = undefined
    anchorElement = undefined
    zipMocks.generateAsync.mockResolvedValue(new Blob(['zip'], { type: 'application/zip' }))

    URL.createObjectURL = vi.fn((blob: Blob) => {
      downloadedBlob = blob
      return 'blob:download-url'
    })
    URL.revokeObjectURL = vi.fn()

    vi.spyOn(document, 'createElement').mockImplementation(((
      tagName: string,
      options?: ElementCreationOptions
    ) => {
      const element = originalCreateElement(tagName, options)
      if (tagName.toLowerCase() === 'a') {
        anchorElement = element as HTMLAnchorElement
        Object.defineProperty(anchorElement, 'click', {
          configurable: true,
          value: clicked
        })
      }
      return element
    }) as typeof document.createElement)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    URL.createObjectURL = originalCreateObjectUrl
    URL.revokeObjectURL = originalRevokeObjectUrl
  })

  it('creates an anchor and clicks it for a single Blob download', () => {
    const result = makeResult('sample.txt', 'hello')

    downloadBlobFile(result)

    expect(URL.createObjectURL).toHaveBeenCalledWith(result.blob)
    expect(anchorElement?.download).toBe('sample.txt')
    expect(anchorElement?.rel).toBe('noopener')
    expect(clicked).toHaveBeenCalledOnce()
  })

  it('creates a ZIP archive with the converted result filenames', async () => {
    const first = makeResult('first.txt', 'one')
    const second = makeResult('second.txt', 'two')

    await downloadResultArchive([first, second], 'converted-results')

    expect(zipMocks.file).toHaveBeenCalledWith('first.txt', first.blob)
    expect(zipMocks.file).toHaveBeenCalledWith('second.txt', second.blob)
    expect(zipMocks.generateAsync).toHaveBeenCalledWith({ type: 'blob' })
    expect(anchorElement?.download).toBe('converted-results.zip')
    expect(downloadedBlob?.type).toBe('application/zip')
  })

  it('revokes object URLs after the download timeout', () => {
    downloadBlobFile(makeResult('sample.txt', 'hello'))

    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:download-url')
  })
})
