import type { ParserBridgeConversionResultPayload } from '@hamster-note/parser-protocol'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { ParserIframeBridgeRef } from '../components/ParserIframeBridge'
import i18n from '../i18n'

const bridgeMocks = vi.hoisted<{
  convert: ReturnType<typeof vi.fn<ParserIframeBridgeRef['convert']>>
  getProgress: ReturnType<typeof vi.fn<ParserIframeBridgeRef['getProgress']>>
  cancel: ReturnType<typeof vi.fn<ParserIframeBridgeRef['cancel']>>
}>(() => ({
  convert: vi.fn<ParserIframeBridgeRef['convert']>(),
  getProgress: vi.fn<ParserIframeBridgeRef['getProgress']>(() => null),
  cancel: vi.fn<ParserIframeBridgeRef['cancel']>(() => Promise.resolve())
}))

vi.mock('../lib/converter', () => ({
  getSupportedTargets: vi.fn((source: string) => {
    const targets: Record<string, string[]> = {
      pdf: ['pdf', 'txt', 'png', 'jpg', 'webp', 'html'],
      txt: ['png', 'html'],
      image: ['pdf', 'txt', 'png', 'jpg', 'webp', 'html'],
      html: ['txt']
    }
    return targets[source] ?? ['txt']
  })
}))

vi.mock('../components/ParserIframeBridge', async () => {
  const { forwardRef, useImperativeHandle } = await vi.importActual<typeof import('react')>('react')

  return {
    ParserIframeBridge: forwardRef<ParserIframeBridgeRef>((_props, ref) => {
      useImperativeHandle(ref, () => ({
        convert: bridgeMocks.convert,
        getProgress: bridgeMocks.getProgress,
        cancel: bridgeMocks.cancel
      }))
      return <div data-testid="parser-iframe-bridge" />
    })
  }
})

vi.mock('../lib/download', () => ({
  downloadBlobFile: vi.fn(),
  downloadResultArchive: vi.fn()
}))

vi.mock('../components/PdfPageSelectorModal', () => ({
  default: ({ open, onConfirm }: { open: boolean; onConfirm: (pages: number[]) => void }) =>
    open ? (
      <div role="dialog" aria-label="Select Pages">
        <button type="button" onClick={() => onConfirm([1, 3])}>
          Confirm test pages
        </button>
      </div>
    ) : null
}))

vi.mock('../components/TextControlModal', () => ({
  default: ({
    open,
    onConfirm,
    onCancel
  }: {
    open: boolean
    onConfirm: (options: { respectWhitespaces: boolean; ignoreImages: boolean }) => void
    onCancel: () => void
  }) =>
    open ? (
      <div role="dialog" aria-label="Text Control Settings">
        <button
          type="button"
          onClick={() => onConfirm({ respectWhitespaces: true, ignoreImages: false })}
        >
          Confirm text control
        </button>
        <button type="button" onClick={onCancel}>
          Cancel text control
        </button>
      </div>
    ) : null
}))

const getFileTargetSelects = () => {
  const table = screen.getByRole('table')
  return table.querySelectorAll('select.file-table.select')
}

const changeNativeSelectValue = (select: HTMLSelectElement, value: string) => {
  const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')
  const setValue = valueDescriptor?.set
  if (!setValue) throw new Error('HTMLSelectElement value setter is unavailable')

  setValue.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

const textToArrayBuffer = (text: string): ArrayBuffer =>
  new TextEncoder().encode(text).buffer.slice(0) as ArrayBuffer

const createBridgeResult = ({
  contents = 'fake',
  filename = 'result.txt',
  mimeType = 'text/plain',
  targetFormat = 'txt'
}: {
  contents?: string
  filename?: string
  mimeType?: string
  targetFormat?: string
} = {}): ParserBridgeConversionResultPayload => ({
  filename,
  mimeType,
  targetFormat,
  buffer: textToArrayBuffer(contents)
})

describe('app upload feedback', () => {
  beforeEach(async () => {
    window.localStorage.setItem('i18nextLng', 'en')
    await i18n.changeLanguage('en')
    vi.clearAllMocks()
    bridgeMocks.convert.mockReset()
    bridgeMocks.getProgress.mockReset()
    bridgeMocks.cancel.mockReset()
    bridgeMocks.getProgress.mockReturnValue(null)
    bridgeMocks.cancel.mockResolvedValue()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows a file row after a supported upload when randomUUID is unavailable', async () => {
    const originalCrypto = globalThis.crypto
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        ...originalCrypto,
        randomUUID: undefined
      }
    })

    try {
      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      expect(input).toBeInstanceOf(HTMLInputElement)

      fireEvent.change(input as HTMLInputElement, {
        target: {
          files: [new File(['hello'], 'notes.txt', { type: 'text/plain' })]
        }
      })

      expect(await screen.findByRole('cell', { name: 'notes.txt' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Convert all' })).toBeEnabled()
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: originalCrypto
      })
    }
  })

  it('shows unsupported file feedback when no selectable row is added', async () => {
    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    expect(input).toBeInstanceOf(HTMLInputElement)

    fireEvent.change(input as HTMLInputElement, {
      target: {
        files: [
          new File(['fake docx'], 'report.docx', {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          })
        ]
      }
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('Unsupported file type')
    expect(screen.getByRole('alert')).toHaveTextContent('report.docx')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Convert all' })).toBeDisabled()
  })

  it('done target lock: target select is disabled for completed rows', async () => {
    bridgeMocks.convert.mockResolvedValue(createBridgeResult())

    window.localStorage.setItem('i18nextLng', 'en')

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: {
        files: [new File(['hello'], 'notes.pdf', { type: 'application/pdf' })]
      }
    })

    const convertBtn = screen.getByRole('button', { name: 'Convert all' })
    fireEvent.click(convertBtn)

    await waitFor(() => {
      expect(screen.getByRole('cell', { name: 'notes.pdf' })).toBeInTheDocument()
    })

    await waitFor(() => {
      const table = screen.getByRole('table')
      const tableSelects = table.querySelectorAll('select.file-table.select')
      expect(tableSelects[0]).toBeDisabled()
    })
  })

  it('done target lock: failed and ready rows remain editable', async () => {
    window.localStorage.setItem('i18nextLng', 'en')

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: {
        files: [new File(['hello'], 'notes.pdf', { type: 'application/pdf' })]
      }
    })

    const selects = screen.getAllByRole('combobox')
    expect(selects[0]).toBeEnabled()
  })

  it('OCR checkbox visible for pdf target rows with zh-CN locale', async () => {
    window.localStorage.setItem('i18nextLng', 'zh-CN')
    await i18n.changeLanguage('zh-CN')

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: {
        files: [new File(['hello'], 'notes.pdf', { type: 'application/pdf' })]
      }
    })

    await screen.findByRole('row', { name: /notes\.pdf/ })
    const ocrCheckbox = screen.getByRole('checkbox', { name: '是否进行 OCR' })
    expect(ocrCheckbox).toBeInTheDocument()
  })

  it('OCR checkbox defaults unchecked', async () => {
    window.localStorage.setItem('i18nextLng', 'zh-CN')
    await i18n.changeLanguage('zh-CN')

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: {
        files: [new File(['hello'], 'notes.pdf', { type: 'application/pdf' })]
      }
    })

    const ocrCheckbox = await screen.findByRole('checkbox', { name: '是否进行 OCR' })
    expect(ocrCheckbox).not.toBeChecked()
  })

  it('non-pdf targets do not expose OCR checkbox', async () => {
    window.localStorage.setItem('i18nextLng', 'zh-CN')
    await i18n.changeLanguage('zh-CN')

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: {
        files: [new File(['fake'], 'photo.png', { type: 'image/png' })]
      }
    })

    await screen.findByRole('row', { name: /photo\.png/ })
    const ocrCheckboxes = screen.queryAllByRole('checkbox', { name: '是否进行 OCR' })
    expect(ocrCheckboxes).toHaveLength(0)
  })

  it('image source with pdf target does not expose OCR checkbox', async () => {
    window.localStorage.setItem('i18nextLng', 'zh-CN')
    await i18n.changeLanguage('zh-CN')

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: {
        files: [new File(['fake'], 'photo.png', { type: 'image/png' })]
      }
    })

    await screen.findByRole('row', { name: /photo\.png/ })

    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: 'pdf' } })

    const ocrCheckboxes = screen.queryAllByRole('checkbox', { name: '是否进行 OCR' })
    expect(ocrCheckboxes).toHaveLength(0)
  })

  it('failed row select remains enabled', async () => {
    bridgeMocks.convert.mockRejectedValue(new Error('conversion failed'))

    window.localStorage.setItem('i18nextLng', 'en')

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: {
        files: [new File(['hello'], 'notes.pdf', { type: 'application/pdf' })]
      }
    })

    const convertBtn = screen.getByRole('button', { name: 'Convert all' })
    fireEvent.click(convertBtn)

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument()
    })

    const table = screen.getByRole('table')
    const tableSelects = table.querySelectorAll('select.file-table.select')
    expect(tableSelects[0]).toBeEnabled()
  })

  it('maps bridge OCR_REQUIRED errors to the existing i18n message', async () => {
    bridgeMocks.convert.mockRejectedValue(
      Object.assign(new Error('ocr required'), { code: 'OCR_REQUIRED' })
    )

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: {
        files: [new File(['hello'], 'scan.pdf', { type: 'application/pdf' })]
      }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))

    await waitFor(() => {
      expect(
        screen.getByText('Scanned PDF requires OCR; text-layer extraction not available')
      ).toBeInTheDocument()
    })
  })

  it('row-scoped OCR: toggling one row does not affect another', async () => {
    window.localStorage.setItem('i18nextLng', 'zh-CN')
    await i18n.changeLanguage('zh-CN')

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    const pdfFile = new File(['page1'], 'a.pdf', { type: 'application/pdf' })
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [pdfFile] }
    })

    await screen.findByRole('row', { name: /a\.pdf/ })

    const pdfFile2 = new File(['page2'], 'b.pdf', { type: 'application/pdf' })
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [pdfFile2] }
    })

    await screen.findByRole('row', { name: /b\.pdf/ })

    const ocrCheckboxes = screen.getAllByRole('checkbox', { name: '是否进行 OCR' })
    expect(ocrCheckboxes).toHaveLength(2)
    expect(ocrCheckboxes[0]).not.toBeChecked()
    expect(ocrCheckboxes[1]).not.toBeChecked()

    fireEvent.click(ocrCheckboxes[0])

    const updatedCheckboxes = screen.getAllByRole('checkbox', { name: '是否进行 OCR' })
    expect(updatedCheckboxes[0]).toBeChecked()
    expect(updatedCheckboxes[1]).not.toBeChecked()
  })

  it('duplicate same-name upload creates independent rows with separate states', async () => {
    bridgeMocks.convert.mockResolvedValue(createBridgeResult())

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    const pdfFile = new File(['hello'], 'notes.pdf', { type: 'application/pdf' })
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [pdfFile] }
    })

    await screen.findByRole('row', { name: /notes\.pdf/ })

    const convertBtn = screen.getByRole('button', { name: 'Convert all' })
    fireEvent.click(convertBtn)

    await waitFor(() => {
      const table = screen.getByRole('table')
      const tableSelects = table.querySelectorAll('select.file-table.select')
      expect(tableSelects[0]).toBeDisabled()
    })

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [pdfFile] }
    })

    const rows = await screen.findAllByRole('row', { name: /notes\.pdf/ })
    expect(rows).toHaveLength(2)

    const table = screen.getByRole('table')
    const tableSelects = table.querySelectorAll('select.file-table.select')
    expect(tableSelects[0]).toBeDisabled()
    expect(tableSelects[1]).toBeEnabled()
  })

  it('shows full-screen loading during convert-all and hides on completion', async () => {
    let resolveConversion: ((value: ParserBridgeConversionResultPayload) => void) | undefined
    const conversionPromise = new Promise<ParserBridgeConversionResultPayload>(resolve => {
      resolveConversion = resolve
    })
    bridgeMocks.convert.mockReturnValue(conversionPromise)

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['hello'], 'notes.txt', { type: 'text/plain' })] }
    })

    await screen.findByRole('row', { name: /notes\.txt/ })
    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument()
    })

    resolveConversion?.(createBridgeResult())

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
  })

  it('shows full-screen loading during convert-all and hides on failure', async () => {
    let rejectConversion: ((error: Error) => void) | undefined
    const conversionPromise = new Promise<ParserBridgeConversionResultPayload>((_, reject) => {
      rejectConversion = reject
    })
    // Attach a no-op catch so vitest does not flag the rejection as unhandled;
    // App.tsx convertAll() catches it via its own try/catch.
    void conversionPromise.catch(() => {})
    bridgeMocks.convert.mockReturnValue(conversionPromise)

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['hello'], 'notes.txt', { type: 'text/plain' })] }
    })

    await screen.findByRole('row', { name: /notes\.txt/ })
    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument()
    })

    rejectConversion?.(new Error('conversion failed'))

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
  })

  it('hides PNG/JPG/WEBP targets for GIF and SVG image files', async () => {
    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    // Upload GIF
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['gif'], 'animated.gif', { type: 'image/gif' })] }
    })
    await screen.findByRole('row', { name: /animated\.gif/ })
    const gifSelect = getFileTargetSelects()[0]
    const gifOptions = Array.from(gifSelect.querySelectorAll('option')).map(o => o.value)
    expect(gifOptions).not.toContain('png')
    expect(gifOptions).not.toContain('jpg')
    expect(gifOptions).not.toContain('webp')
    expect(gifOptions).toContain('pdf')
    expect(gifOptions).toContain('txt')

    // Upload SVG
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['svg'], 'icon.svg', { type: 'image/svg+xml' })] }
    })
    await screen.findByRole('row', { name: /icon\.svg/ })
    const svgSelect = getFileTargetSelects()[1]
    const svgOptions = Array.from(svgSelect.querySelectorAll('option')).map(o => o.value)
    expect(svgOptions).not.toContain('png')
    expect(svgOptions).not.toContain('jpg')
    expect(svgOptions).not.toContain('webp')
    expect(svgOptions).toContain('pdf')
    expect(svgOptions).toContain('txt')
  })

  it('shows page-select button for all PDF source targets', async () => {
    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['pdf'], 'sample.pdf', { type: 'application/pdf' })] }
    })

    await screen.findByRole('row', { name: /sample\.pdf/ })
    expect(screen.getByRole('button', { name: 'Select pages' })).toBeInTheDocument()

    const tableSelects = getFileTargetSelects()
    fireEvent.change(tableSelects[0], { target: { value: 'png' } })
    expect(screen.getByRole('button', { name: 'Select pages' })).toBeInTheDocument()

    fireEvent.change(tableSelects[0], { target: { value: 'jpg' } })
    expect(screen.getByRole('button', { name: 'Select pages' })).toBeInTheDocument()

    fireEvent.change(tableSelects[0], { target: { value: 'webp' } })
    expect(screen.getByRole('button', { name: 'Select pages' })).toBeInTheDocument()

    fireEvent.change(tableSelects[0], { target: { value: 'txt' } })
    expect(screen.getByRole('button', { name: 'Select pages' })).toBeInTheDocument()
  })

  it('confirms selected PDF image pages and passes them to the bridge', async () => {
    bridgeMocks.convert.mockResolvedValue(
      createBridgeResult({ filename: 'page-001.png', mimeType: 'image/png', targetFormat: 'png' })
    )

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['pdf'], 'sample.pdf', { type: 'application/pdf' })] }
    })

    await screen.findByRole('row', { name: /sample\.pdf/ })
    fireEvent.change(getFileTargetSelects()[0], { target: { value: 'png' } })
    fireEvent.click(screen.getByRole('button', { name: 'Select pages' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm test pages' }))

    expect(screen.getByText('2 pages selected')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))

    await waitFor(() => {
      expect(bridgeMocks.convert).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceFormat: 'pdf',
          targetFormat: 'png',
          options: expect.objectContaining({
            pdf: expect.objectContaining({ selectedPages: [1, 3] })
          })
        })
      )
    })
  })

  it('reconstructs bridge output Blob for row downloads', async () => {
    const { downloadBlobFile } = await import('../lib/download')
    bridgeMocks.convert.mockResolvedValue(createBridgeResult())

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['hello'], 'notes.txt', { type: 'text/plain' })] }
    })

    await screen.findByRole('row', { name: /notes\.txt/ })
    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))

    await waitFor(() => {
      expect(screen.getByText('Done')).toBeInTheDocument()
    })

    expect(screen.getAllByRole('button', { name: 'Download' })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Download' })[0])

    await waitFor(() => {
      expect(downloadBlobFile).toHaveBeenCalledTimes(1)
    })

    const downloadResult = vi.mocked(downloadBlobFile).mock.calls[0]?.[0]
    if (!downloadResult) throw new Error('Expected a reconstructed bridge download result')

    expect(downloadResult.filename).toBe('result.txt')
    expect(downloadResult.blob).toBeInstanceOf(Blob)
    expect(downloadResult.blob.type).toBe('text/plain')
    expect(downloadResult.blob.size).toBe(4)
  })

  it('removes a completed row when delete is clicked', async () => {
    bridgeMocks.convert.mockResolvedValue(createBridgeResult())

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['hello'], 'notes.txt', { type: 'text/plain' })] }
    })

    await screen.findByRole('row', { name: /notes\.txt/ })
    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))

    await waitFor(() => {
      expect(screen.getByText('Done')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => {
      expect(screen.queryByRole('row', { name: /notes\.txt/ })).not.toBeInTheDocument()
    })
  })

  it('disables delete button while converting', async () => {
    let resolveConversion: ((value: ParserBridgeConversionResultPayload) => void) | undefined
    const conversionPromise = new Promise<ParserBridgeConversionResultPayload>(resolve => {
      resolveConversion = resolve
    })
    bridgeMocks.convert.mockReturnValue(conversionPromise)

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['hello'], 'notes.txt', { type: 'text/plain' })] }
    })

    await screen.findByRole('row', { name: /notes\.txt/ })
    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()
    })

    resolveConversion?.(createBridgeResult())
  })

  it('shows full-screen loading during async download preparation', async () => {
    const { downloadResultArchive } = await import('../lib/download')
    let resolveDownload: (() => void) | undefined
    const bridgeResults = [
      createBridgeResult({ contents: 'first', filename: 'first.txt' }),
      createBridgeResult({ contents: 'second', filename: 'second.txt' })
    ]
    bridgeMocks.convert
      .mockResolvedValueOnce(bridgeResults[0]!)
      .mockResolvedValueOnce(bridgeResults[1]!)
      .mockResolvedValue(bridgeResults[1]!)
    vi.mocked(downloadResultArchive).mockReturnValue(
      new Promise<void>(resolve => {
        resolveDownload = resolve
      })
    )

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')
    fireEvent.change(input as HTMLInputElement, {
      target: {
        files: [
          new File(['hello'], 'notes-a.txt', { type: 'text/plain' }),
          new File(['world'], 'notes-b.txt', { type: 'text/plain' })
        ]
      }
    })

    await screen.findByRole('row', { name: /notes-a\.txt/ })
    await screen.findByRole('row', { name: /notes-b\.txt/ })
    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))

    await waitFor(() => {
      expect(screen.getAllByText('Done')).toHaveLength(2)
    })

    const downloadButtons = screen.getAllByRole('button', { name: 'Download' })
    const archiveDownloadButton = downloadButtons[downloadButtons.length - 1]
    fireEvent.click(archiveDownloadButton)

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Preparing download...')
    })

    resolveDownload?.()

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
  })

  // TDD: HTML Decode Options UI tests for html-parser@0.8.0 DecodeOptions

  it('TDD-1: HTML decode options visible only when target is html', async () => {
    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['pdf'], 'sample.pdf', { type: 'application/pdf' })] }
    })

    await screen.findByRole('row', { name: /sample\.pdf/ })
    const targetSelect = getFileTargetSelects()[0]

    expect(
      screen.queryByRole('button', { name: /html conversion options/i })
    ).not.toBeInTheDocument()

    fireEvent.change(targetSelect, { target: { value: 'html' } })

    fireEvent.click(screen.getByRole('button', { name: /html conversion options/i }))

    const dialog = screen.getByRole('dialog', { name: /html conversion options/i })
    const includeBackgroundCheckbox = screen.getByRole('checkbox', {
      name: /include background/i
    })
    const excludeTextCheckbox = screen.getByRole('checkbox', {
      name: /exclude text from background/i
    })
    const backgroundQualitySelect = screen.getByRole('combobox', {
      name: /background quality/i
    })

    expect(dialog).toContainElement(includeBackgroundCheckbox)
    expect(dialog).toContainElement(excludeTextCheckbox)
    expect(dialog).toContainElement(backgroundQualitySelect)

    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: /html conversion options/i })
      ).not.toBeInTheDocument()
    })

    fireEvent.change(targetSelect, { target: { value: 'txt' } })

    expect(
      screen.queryByRole('button', { name: /html conversion options/i })
    ).not.toBeInTheDocument()
  })

  it('TDD-2: background options rendered inline for html target', async () => {
    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['pdf'], 'sample.pdf', { type: 'application/pdf' })] }
    })

    await screen.findByRole('row', { name: /sample\.pdf/ })
    fireEvent.change(getFileTargetSelects()[0], { target: { value: 'html' } })

    fireEvent.click(screen.getByRole('button', { name: /html conversion options/i }))

    const dialog = screen.getByRole('dialog', { name: /html conversion options/i })
    const includeBackgroundCheckbox = screen.getByRole('checkbox', { name: /include background/i })
    const backgroundQualitySelect = screen.getByRole('combobox', { name: /background quality/i })

    expect(dialog).toContainElement(includeBackgroundCheckbox)
    expect(dialog).toContainElement(backgroundQualitySelect)

    expect(includeBackgroundCheckbox).toBeChecked()
    expect(backgroundQualitySelect).toHaveValue('0.85')
  })

  it('TDD-3: text control button opens modal with settings', async () => {
    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['pdf'], 'sample.pdf', { type: 'application/pdf' })] }
    })

    await screen.findByRole('row', { name: /sample\.pdf/ })
    fireEvent.change(getFileTargetSelects()[0], { target: { value: 'html' } })

    fireEvent.click(screen.getByRole('button', { name: /html conversion options/i }))

    const fontSizeInput = screen.getByRole('spinbutton', { name: /font size/i })
    expect(screen.getByRole('dialog', { name: /html conversion options/i })).toContainElement(
      fontSizeInput
    )

    fireEvent.change(fontSizeInput, { target: { value: '18' } })
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: /html conversion options/i })
      ).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /html conversion options/i }))

    expect(screen.getByRole('spinbutton', { name: /font size/i })).toHaveValue(18)
  })

  it('TDD-4: row-scoped HTML options - changing one row does not affect another', async () => {
    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['pdf1'], 'first.pdf', { type: 'application/pdf' })] }
    })
    await screen.findByRole('row', { name: /first\.pdf/ })

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['pdf2'], 'second.pdf', { type: 'application/pdf' })] }
    })
    await screen.findByRole('row', { name: /second\.pdf/ })

    const selects = getFileTargetSelects()
    fireEvent.change(selects[0], { target: { value: 'html' } })
    fireEvent.change(selects[1], { target: { value: 'html' } })

    const optionsButtons = screen.getAllByRole('button', { name: /html conversion options/i })
    fireEvent.click(optionsButtons[0])

    const firstRowIncludeBackground = screen.getByRole('checkbox', { name: /include background/i })
    expect(firstRowIncludeBackground).toBeChecked()

    fireEvent.click(firstRowIncludeBackground)
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: /html conversion options/i })
      ).not.toBeInTheDocument()
    })

    fireEvent.click(optionsButtons[1])

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /include background/i })).toBeChecked()
    })
  })

  it('TDD-5: bridge receives HTML decode options', async () => {
    bridgeMocks.convert.mockResolvedValue(
      createBridgeResult({
        contents: '<html></html>',
        filename: 'sample.html',
        mimeType: 'text/html',
        targetFormat: 'html'
      })
    )

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['pdf'], 'sample.pdf', { type: 'application/pdf' })] }
    })

    await screen.findByRole('row', { name: /sample\.pdf/ })

    fireEvent.change(getFileTargetSelects()[0], { target: { value: 'html' } })

    fireEvent.click(screen.getByRole('button', { name: /html conversion options/i }))

    const qualitySelect = screen.getByRole('combobox', {
      name: /background quality/i
    }) as HTMLSelectElement
    changeNativeSelectValue(qualitySelect, '0.6')

    fireEvent.change(screen.getByRole('spinbutton', { name: /font size/i }), {
      target: { value: '18' }
    })
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: /html conversion options/i })
      ).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))

    await waitFor(() => {
      expect(bridgeMocks.convert).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceFormat: 'pdf',
          targetFormat: 'html',
          options: expect.objectContaining({
            decode: {
              textControl: expect.objectContaining({
                fontSize: 18
              }),
              background: {
                includeBackground: true,
                excludeTextFromBackground: true,
                backgroundQuality: 0.6
              }
            },
            layout: expect.objectContaining({
              mode: 'paginated',
              widthMode: 'actual'
            })
          })
        })
      )
    })
  })

  it('TDD-7: background quality select value changes on user interaction', async () => {
    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['pdf'], 'sample.pdf', { type: 'application/pdf' })] }
    })

    await screen.findByRole('row', { name: /sample\.pdf/ })
    fireEvent.change(getFileTargetSelects()[0], { target: { value: 'html' } })

    fireEvent.click(screen.getByRole('button', { name: /html conversion options/i }))

    const qualitySelect = screen.getByRole('combobox', {
      name: /background quality/i
    }) as HTMLSelectElement

    expect(qualitySelect.value).toBe('0.85')

    changeNativeSelectValue(qualitySelect, '0.6')
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: /html conversion options/i })
      ).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /html conversion options/i }))

    expect(screen.getByRole('combobox', { name: /background quality/i })).toHaveValue('0.6')
  })

  it('TDD-8: background quality options stay within html-parser contract', async () => {
    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['pdf'], 'sample.pdf', { type: 'application/pdf' })] }
    })

    await screen.findByRole('row', { name: /sample\.pdf/ })
    fireEvent.change(getFileTargetSelects()[0], { target: { value: 'html' } })

    fireEvent.click(screen.getByRole('button', { name: /html conversion options/i }))

    const qualitySelect = screen.getByRole('combobox', {
      name: /background quality/i
    }) as HTMLSelectElement
    const optionValues = Array.from(qualitySelect.options).map(option => option.value)

    expect(optionValues).toEqual(['0.3', '0.6', '0.85', '1'])
    expect(optionValues).not.toContain('2')
  })

  it('TDD-6: HTML decode options not visible for non-html targets', async () => {
    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['text'], 'notes.txt', { type: 'text/plain' })] }
    })

    await screen.findByRole('row', { name: /notes\.txt/ })

    expect(
      screen.queryByRole('button', { name: /html conversion options/i })
    ).not.toBeInTheDocument()

    fireEvent.change(getFileTargetSelects()[0], { target: { value: 'html' } })

    fireEvent.click(screen.getByRole('button', { name: /html conversion options/i }))

    const dialog = screen.getByRole('dialog', { name: /html conversion options/i })
    const includeBackgroundCheckbox = screen.getByRole('checkbox', {
      name: /include background/i
    })
    const backgroundQualitySelect = screen.getByRole('combobox', {
      name: /background quality/i
    })

    expect(dialog).toContainElement(includeBackgroundCheckbox)
    expect(dialog).toContainElement(backgroundQualitySelect)
  })
})
