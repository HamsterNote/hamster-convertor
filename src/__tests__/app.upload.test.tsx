import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import i18n from '../i18n'
import type { ConversionResult } from '../lib/converter'

vi.mock('../lib/converter', () => ({
  convertFile: vi.fn(),
  getSupportedTargets: vi.fn((source: string) => {
    const targets: Record<string, string[]> = {
      pdf: ['pdf', 'txt', 'png', 'jpg', 'webp'],
      txt: ['png'],
      image: ['pdf', 'txt', 'png', 'jpg', 'webp']
    }
    return targets[source] ?? ['txt']
  })
}))

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

const getFileTargetSelects = () => {
  const table = screen.getByRole('table')
  return table.querySelectorAll('select.file-table.select')
}

describe('app upload feedback', () => {
  beforeEach(async () => {
    window.localStorage.setItem('i18nextLng', 'en')
    await i18n.changeLanguage('en')
    vi.clearAllMocks()
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
    const { convertFile } = await import('../lib/converter')
    vi.mocked(convertFile).mockResolvedValue([
      {
        blob: new Blob(['fake'], { type: 'text/plain' }),
        filename: 'result.txt',
        mimeType: 'text/plain',
        targetFormat: 'txt'
      }
    ])

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
    const { convertFile } = await import('../lib/converter')
    vi.mocked(convertFile).mockRejectedValue(new Error('conversion failed'))

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
    const { convertFile } = await import('../lib/converter')
    vi.mocked(convertFile).mockResolvedValue([
      {
        blob: new Blob(['fake'], { type: 'text/plain' }),
        filename: 'result.txt',
        mimeType: 'text/plain',
        targetFormat: 'txt'
      }
    ])

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
    const { convertFile } = await import('../lib/converter')
    let resolveConversion: ((value: ConversionResult[]) => void) | undefined
    const conversionPromise = new Promise<ConversionResult[]>(resolve => {
      resolveConversion = resolve
    })
    vi.mocked(convertFile).mockReturnValue(conversionPromise)

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

    resolveConversion?.([
      {
        blob: new Blob(['fake'], { type: 'text/plain' }),
        filename: 'result.txt',
        mimeType: 'text/plain',
        targetFormat: 'txt'
      }
    ])

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
  })

  it('shows full-screen loading during convert-all and hides on failure', async () => {
    const { convertFile } = await import('../lib/converter')
    let rejectConversion: ((error: Error) => void) | undefined
    const conversionPromise = new Promise<ConversionResult[]>((_, reject) => {
      rejectConversion = reject
    })
    vi.mocked(convertFile).mockReturnValue(conversionPromise)

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

  it('shows page-select button for PDF source with image target only', async () => {
    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['pdf'], 'sample.pdf', { type: 'application/pdf' })] }
    })

    await screen.findByRole('row', { name: /sample\.pdf/ })
    expect(screen.queryByRole('button', { name: 'Select pages' })).not.toBeInTheDocument()

    const tableSelects = getFileTargetSelects()
    fireEvent.change(tableSelects[0], { target: { value: 'png' } })
    expect(screen.getByRole('button', { name: 'Select pages' })).toBeInTheDocument()

    fireEvent.change(tableSelects[0], { target: { value: 'jpg' } })
    expect(screen.getByRole('button', { name: 'Select pages' })).toBeInTheDocument()

    fireEvent.change(tableSelects[0], { target: { value: 'webp' } })
    expect(screen.getByRole('button', { name: 'Select pages' })).toBeInTheDocument()

    fireEvent.change(tableSelects[0], { target: { value: 'txt' } })
    expect(screen.queryByRole('button', { name: 'Select pages' })).not.toBeInTheDocument()

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['image'], 'photo.png', { type: 'image/png' })] }
    })

    await screen.findByRole('row', { name: /photo\.png/ })
    const updatedTableSelects = getFileTargetSelects()
    fireEvent.change(updatedTableSelects[1], { target: { value: 'pdf' } })
    expect(screen.queryAllByRole('button', { name: 'Select pages' })).toHaveLength(0)
  })

  it('confirms selected PDF image pages and passes them to convertFile', async () => {
    const { convertFile } = await import('../lib/converter')
    vi.mocked(convertFile).mockResolvedValue([
      {
        blob: new Blob(['fake'], { type: 'image/png' }),
        filename: 'page-001.png',
        mimeType: 'image/png',
        targetFormat: 'png'
      }
    ])

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
      expect(convertFile).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'pdf',
          target: 'png',
          options: expect.objectContaining({
            pdf: expect.objectContaining({ selectedImagePages: [1, 3] })
          })
        })
      )
    })
  })

  it('shows delete button for completed rows', async () => {
    const { convertFile } = await import('../lib/converter')
    vi.mocked(convertFile).mockResolvedValue([
      {
        blob: new Blob(['fake'], { type: 'text/plain' }),
        filename: 'result.txt',
        mimeType: 'text/plain',
        targetFormat: 'txt'
      }
    ])

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
  })

  it('removes a completed row when delete is clicked', async () => {
    const { convertFile } = await import('../lib/converter')
    vi.mocked(convertFile).mockResolvedValue([
      {
        blob: new Blob(['fake'], { type: 'text/plain' }),
        filename: 'result.txt',
        mimeType: 'text/plain',
        targetFormat: 'txt'
      }
    ])

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
    const { convertFile } = await import('../lib/converter')
    let resolveConversion: ((value: ConversionResult[]) => void) | undefined
    const conversionPromise = new Promise<ConversionResult[]>(resolve => {
      resolveConversion = resolve
    })
    vi.mocked(convertFile).mockReturnValue(conversionPromise)

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

    resolveConversion?.([
      {
        blob: new Blob(['fake'], { type: 'text/plain' }),
        filename: 'result.txt',
        mimeType: 'text/plain',
        targetFormat: 'txt'
      }
    ])
  })

  it('shows full-screen loading during async download preparation', async () => {
    const { convertFile } = await import('../lib/converter')
    const { downloadResultArchive } = await import('../lib/download')
    let resolveDownload: (() => void) | undefined
    vi.mocked(convertFile).mockResolvedValue([
      {
        blob: new Blob(['first'], { type: 'text/plain' }),
        filename: 'first.txt',
        mimeType: 'text/plain',
        targetFormat: 'txt'
      },
      {
        blob: new Blob(['second'], { type: 'text/plain' }),
        filename: 'second.txt',
        mimeType: 'text/plain',
        targetFormat: 'txt'
      }
    ])
    vi.mocked(downloadResultArchive).mockReturnValue(
      new Promise<void>(resolve => {
        resolveDownload = resolve
      })
    )

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

    const rowDownloadButton = screen.getAllByRole('button', { name: 'Download' })[0]
    fireEvent.click(rowDownloadButton)

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Preparing download...')
    })

    resolveDownload?.()

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
  })
})
