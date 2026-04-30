import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import App from '../App'

vi.mock('../lib/converter', () => ({
  convertFile: vi.fn(),
  getSupportedTargets: vi.fn((source: string) => {
    const targets: Record<string, string[]> = {
      pdf: ['pdf', 'txt', 'image'],
      txt: ['image'],
      image: ['pdf', 'txt']
    }
    return targets[source] ?? ['txt']
  })
}))

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
})
