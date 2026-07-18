import type { ParserBridgeConversionResultPayload } from '@hamster-note/parser-protocol'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { ParserIframeBridgeRef } from '../components/ParserIframeBridge'
import i18n from '../i18n'
import { convertViaBridge } from '../lib/parser-bridge/proxy'

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
      txt: ['png', 'jpg', 'webp', 'html'],
      image: ['pdf', 'txt', 'png', 'jpg', 'webp', 'html'],
      html: ['txt'],
      docx: ['txt', 'html']
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

vi.mock('../lib/parser-bridge/proxy', async () => {
  const actual = await vi.importActual<typeof import('../lib/parser-bridge/proxy')>(
    '../lib/parser-bridge/proxy'
  )
  return {
    ...actual,
    convertViaBridge: vi.fn(actual.convertViaBridge)
  }
})

vi.mock('../hooks/usePdfPageList', () => ({
  usePdfPageList: vi.fn(() => ({
    pageShells: [
      { pageNumber: 1, thumbnailUrl: null, status: 'loaded' },
      { pageNumber: 2, thumbnailUrl: null, status: 'loaded' },
      { pageNumber: 3, thumbnailUrl: null, status: 'loaded' }
    ],
    loading: false,
    error: null,
    gridRef: { current: null }
  }))
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
  return Array.from(table.querySelectorAll<HTMLSelectElement>('select.file-table.select'))
}

const getFileRows = () => {
  const table = screen.getByRole('table')
  return Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'))
}

const getGroupHeaders = () => {
  const table = screen.getByRole('table')
  return Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr.group-header'))
}

const getGroupMemberRows = () => {
  const table = screen.getByRole('table')
  return Array.from(
    table.querySelectorAll<HTMLTableRowElement>('tbody tr.file-table__row--group-member')
  )
}

const enterMultiSelectMode = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Multi-select' }))
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Cancel selection' })).toBeInTheDocument()
  })
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
  targetFormat = 'txt',
  warnings
}: {
  contents?: string
  filename?: string
  mimeType?: string
  targetFormat?: string
  warnings?: string[]
} = {}): ParserBridgeConversionResultPayload => ({
  filename,
  mimeType,
  targetFormat,
  buffer: textToArrayBuffer(contents),
  warnings
})

const createDeferred = <T,>() => {
  let resolve: ((value: T) => void) | undefined
  let reject: ((error: Error) => void) | undefined
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, resolve, reject }
}

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
    URL.createObjectURL = vi.fn(() => 'blob:mock')
    URL.revokeObjectURL = vi.fn()
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

  it('shows a file row for supported docx uploads', async () => {
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

    expect(await screen.findByRole('cell', { name: 'report.docx' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Convert all' })).toBeEnabled()

    const targetSelect = getFileTargetSelects()[0]
    expect(within(targetSelect).getByRole('option', { name: 'TXT' })).toBeInTheDocument()
    expect(within(targetSelect).getByRole('option', { name: 'HTML' })).toBeInTheDocument()
  })

  it('includes DOCX in the native file chooser filter', () => {
    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    expect(input).toBeInstanceOf(HTMLInputElement)
    expect(input).toHaveAttribute('accept', expect.stringContaining('.docx'))
  })

  it('shows unsupported file feedback when no selectable row is added', async () => {
    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    expect(input).toBeInstanceOf(HTMLInputElement)

    fireEvent.change(input as HTMLInputElement, {
      target: {
        files: [new File(['fake epub'], 'book.epub', { type: 'application/epub+zip' })]
      }
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('Unsupported file type')
    expect(screen.getByRole('alert')).toHaveTextContent('book.epub')
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

  it('Settings button replaces inline OCR controls for pdf target rows', async () => {
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

    expect(screen.queryByRole('checkbox', { name: '是否进行 OCR' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '设置' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '设置' }))

    const dialog = screen.getByRole('dialog', { name: /设置/i })
    const ocrCheckbox = screen.getByRole('checkbox', { name: '是否进行 OCR' })
    expect(dialog).toContainElement(ocrCheckbox)
    expect(ocrCheckbox).not.toBeChecked()

    fireEvent.click(ocrCheckbox)
    expect(ocrCheckbox).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: /完成/i }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /设置/i })).not.toBeInTheDocument()
    })
  })

  it('non-pdf targets do not expose inline OCR controls', async () => {
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
    expect(screen.queryByRole('checkbox', { name: '是否进行 OCR' })).not.toBeInTheDocument()
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

  it('row-scoped OCR via Settings: toggling one row does not affect another', async () => {
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

    const settingsButtons = screen.getAllByRole('button', { name: '设置' })
    expect(settingsButtons).toHaveLength(2)

    fireEvent.click(settingsButtons[0])
    const firstOcr = screen.getByRole('checkbox', { name: '是否进行 OCR' })
    expect(firstOcr).not.toBeChecked()
    fireEvent.click(firstOcr)
    expect(firstOcr).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: /完成/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /设置/i })).not.toBeInTheDocument()
    })

    fireEvent.click(settingsButtons[1])
    const secondOcr = screen.getByRole('checkbox', { name: '是否进行 OCR' })
    expect(secondOcr).not.toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: /完成/i }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /设置/i })).not.toBeInTheDocument()
    })
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

  it('copy action appears in row actions and appends the duplicate to the list end', async () => {
    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    const alphaFile = new File(['alpha'], 'alpha.txt', { type: 'text/plain' })
    const betaFile = new File(['beta'], 'beta.txt', { type: 'text/plain' })
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [alphaFile, betaFile] }
    })

    await screen.findByRole('row', { name: /alpha\.txt/ })
    await screen.findByRole('row', { name: /beta\.txt/ })
    fireEvent.change(getFileTargetSelects()[0], { target: { value: 'html' } })

    const initialRows = getFileRows()
    expect(initialRows).toHaveLength(2)

    const copyButton = within(initialRows[0]).getByRole('button', { name: 'Copy' })
    expect(copyButton).toHaveClass('row-action-btn')
    expect(copyButton.closest('.row-actions')).toBeInTheDocument()
    expect(copyButton).toHaveTextContent('⧉')

    fireEvent.click(copyButton)

    const rows = getFileRows()
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('alpha.txt')
    expect(rows[1]).toHaveTextContent('beta.txt')
    expect(rows[2]).toHaveTextContent('alpha.txt')
    expect(within(rows[2]).getByText('Ready')).toBeInTheDocument()
    expect(getFileTargetSelects()[2]).toHaveValue('html')
  })

  it('copying a done row resets artifacts, keeps source/options, and can convert the copy', async () => {
    bridgeMocks.convert.mockResolvedValue(
      createBridgeResult({
        contents: '<html></html>',
        filename: 'sample.html',
        mimeType: 'text/html',
        targetFormat: 'html',
        warnings: ['minor issue']
      })
    )

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    const pdfFile = new File(['pdf'], 'sample.pdf', { type: 'application/pdf' })
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [pdfFile] }
    })

    await screen.findByRole('row', { name: /sample\.pdf/ })
    fireEvent.change(getFileTargetSelects()[0], { target: { value: 'html' } })

    fireEvent.click(screen.getByRole('button', { name: /settings/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Page 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Page 3' }))
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /settings/i })).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))

    await waitFor(() => {
      expect(screen.getByText('Done')).toBeInTheDocument()
    })

    const firstConvertCall = vi.mocked(convertViaBridge).mock.calls[0]
    expect(firstConvertCall?.[1]).toBe(pdfFile)
    expect(firstConvertCall?.[3]).toBe('html')
    expect(firstConvertCall?.[4]?.pdf).toEqual({ ocr: false, selectedPages: [1, 3] })

    const doneRow = getFileRows()[0]
    expect(within(doneRow).getByText('Done')).toBeInTheDocument()
    expect(within(doneRow).getByText('1 output')).toBeInTheDocument()
    expect(within(doneRow).getByText('minor issue')).toBeInTheDocument()

    fireEvent.click(within(doneRow).getByRole('button', { name: 'Copy' }))

    const rowsAfterCopy = getFileRows()
    expect(rowsAfterCopy).toHaveLength(2)
    expect(within(rowsAfterCopy[0]).getByText('Done')).toBeInTheDocument()
    expect(within(rowsAfterCopy[0]).getByText('1 output')).toBeInTheDocument()
    expect(within(rowsAfterCopy[1]).getByText('Ready')).toBeInTheDocument()
    expect(within(rowsAfterCopy[1]).queryByText('Done')).not.toBeInTheDocument()
    expect(within(rowsAfterCopy[1]).queryByText(/output/)).not.toBeInTheDocument()
    expect(within(rowsAfterCopy[1]).queryByText('minor issue')).not.toBeInTheDocument()
    expect(getFileTargetSelects()[1]).toHaveValue('html')
    expect(getFileTargetSelects()[1]).toBeEnabled()

    fireEvent.click(within(rowsAfterCopy[1]).getByRole('button', { name: 'Remove' }))

    const rowsAfterRemovingCopy = getFileRows()
    expect(rowsAfterRemovingCopy).toHaveLength(1)
    expect(within(rowsAfterRemovingCopy[0]).getByText('Done')).toBeInTheDocument()
    expect(within(rowsAfterRemovingCopy[0]).getByText('1 output')).toBeInTheDocument()
    expect(within(rowsAfterRemovingCopy[0]).getByText('minor issue')).toBeInTheDocument()

    fireEvent.click(within(rowsAfterRemovingCopy[0]).getByRole('button', { name: 'Copy' }))

    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))

    await waitFor(() => {
      expect(vi.mocked(convertViaBridge)).toHaveBeenCalledTimes(2)
    })

    const secondConvertCall = vi.mocked(convertViaBridge).mock.calls[1]
    expect(secondConvertCall?.[1]).toBe(pdfFile)
    expect(secondConvertCall?.[1]).toBe(firstConvertCall?.[1])
    expect(secondConvertCall?.[3]).toBe('html')
    expect(secondConvertCall?.[4]?.pdf).toBe(firstConvertCall?.[4]?.pdf)
    expect(secondConvertCall?.[4]?.pdf).toEqual({ ocr: false, selectedPages: [1, 3] })
  })

  it('disables copy while the source row is queued or converting', async () => {
    let resolveConversion: ((value: ParserBridgeConversionResultPayload) => void) | undefined
    const conversionPromise = new Promise<ParserBridgeConversionResultPayload>(resolve => {
      resolveConversion = resolve
    })
    bridgeMocks.convert.mockReturnValue(conversionPromise)

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['hello'], 'running.txt', { type: 'text/plain' })] }
    })

    await screen.findByRole('row', { name: /running\.txt/ })
    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled()
    })

    resolveConversion?.(createBridgeResult())

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled()
    })
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
    conversionPromise.catch(() => {}).catch(() => {})
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

  it('tracks convert-all batch progress for click-time eligible rows only', async () => {
    const firstBatchFailure = createDeferred<ParserBridgeConversionResultPayload>()
    const secondBatchSuccess = createDeferred<ParserBridgeConversionResultPayload>()
    firstBatchFailure.promise.catch(() => {}).catch(() => {})

    bridgeMocks.convert
      .mockResolvedValueOnce(createBridgeResult({ filename: 'pre-done.txt' }))
      .mockReturnValueOnce(firstBatchFailure.promise)
      .mockReturnValueOnce(secondBatchSuccess.promise)
      .mockResolvedValue(createBridgeResult({ filename: 'late.txt' }))

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['done'], 'pre-done.pdf', { type: 'application/pdf' })] }
    })
    await screen.findByRole('row', { name: /pre-done\.pdf/ })
    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))

    await waitFor(() => {
      expect(screen.getByText('Done')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))
    expect(screen.queryByText('0 / 0')).not.toBeInTheDocument()
    expect(bridgeMocks.convert).toHaveBeenCalledTimes(1)

    fireEvent.change(input as HTMLInputElement, {
      target: {
        files: [
          new File(['fail'], 'current-fail.pdf', { type: 'application/pdf' }),
          new File(['ok'], 'current-ok.pdf', { type: 'application/pdf' })
        ]
      }
    })
    await screen.findByRole('row', { name: /current-fail\.pdf/ })
    await screen.findByRole('row', { name: /current-ok\.pdf/ })

    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))

    await waitFor(() => {
      expect(screen.getByText('0 / 2')).toBeInTheDocument()
    })

    firstBatchFailure.reject?.(new Error('conversion failed'))

    await waitFor(() => {
      expect(screen.getByText('1 / 2')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(bridgeMocks.convert).toHaveBeenCalledTimes(3)
    })

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['late'], 'late-added.pdf', { type: 'application/pdf' })] }
    })
    await screen.findByRole('row', { name: /late-added\.pdf/ })
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    expect(screen.queryByText(/\/ 3$/)).not.toBeInTheDocument()

    secondBatchSuccess.resolve?.(createBridgeResult({ filename: 'current-ok.txt' }))

    await waitFor(() => {
      expect(screen.queryByText('1 / 2')).not.toBeInTheDocument()
    })
    expect(screen.queryByText('2 / 2')).not.toBeInTheDocument()
    expect(screen.getAllByText('Done')).toHaveLength(2)
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(bridgeMocks.convert).toHaveBeenCalledTimes(3)
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

  it('shows PNG/JPG/WebP/HTML and excludes PDF/TXT for TXT target selection', async () => {
    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['hello'], 'notes.txt', { type: 'text/plain' })] }
    })

    await screen.findByRole('row', { name: /notes\.txt/ })
    const txtOptions = Array.from(getFileTargetSelects()[0].querySelectorAll('option')).map(
      option => option.value
    )

    expect(txtOptions).toEqual(['png', 'jpg', 'webp', 'html'])
    expect(txtOptions).not.toContain('pdf')
    expect(txtOptions).not.toContain('txt')
  })

  it('passes edited TXT image settings to the bridge as txtImage options', async () => {
    bridgeMocks.convert.mockResolvedValue(
      createBridgeResult({
        contents: 'webp-bytes',
        filename: 'notes.webp',
        mimeType: 'image/webp',
        targetFormat: 'webp'
      })
    )

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['hello'], 'notes.txt', { type: 'text/plain' })] }
    })

    await screen.findByRole('row', { name: /notes\.txt/ })
    fireEvent.change(getFileTargetSelects()[0], { target: { value: 'webp' } })
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))

    fireEvent.change(screen.getByLabelText('Text color'), { target: { value: '#13579b' } })
    fireEvent.change(screen.getByLabelText('Background color'), { target: { value: '#f0e0d0' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Font size (px)' }), {
      target: { value: '24' }
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Image width (px)' }), {
      target: { value: '960' }
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Padding (px)' }), {
      target: { value: '36' }
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Line height (px)' }), {
      target: { value: '42' }
    })
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /settings/i })).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))

    await waitFor(() => {
      expect(bridgeMocks.convert).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceFormat: 'txt',
          targetFormat: 'webp',
          options: expect.objectContaining({
            txtImage: {
              textColor: '#13579b',
              backgroundColor: '#f0e0d0',
              fontSizePx: 24,
              imageWidthPx: 960,
              paddingPx: 36,
              lineHeightPx: 42
            }
          })
        })
      )
    })

    const callOptions = bridgeMocks.convert.mock.calls[0]?.[0].options as {
      image?: Record<string, unknown>
      txtImage?: Record<string, unknown>
    }
    expect(callOptions.txtImage).toEqual({
      textColor: '#13579b',
      backgroundColor: '#f0e0d0',
      fontSizePx: 24,
      imageWidthPx: 960,
      paddingPx: 36,
      lineHeightPx: 42
    })
    expect(callOptions.image).not.toMatchObject({
      textColor: '#13579b',
      backgroundColor: '#f0e0d0',
      fontSizePx: 24,
      imageWidthPx: 960,
      paddingPx: 36,
      lineHeightPx: 42
    })
  })

  it('selects PDF pages via Settings handoff and passes them to the bridge', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: /settings/i }))
    expect(screen.getByRole('dialog', { name: /settings/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Page 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Page 3' }))
    expect(screen.getByText('2 pages selected')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /done/i }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /settings/i })).not.toBeInTheDocument()
    })

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

  it('disables Settings button when no settings sections apply', async () => {
    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: {
        files: [
          new File(['docx'], 'notes.docx', {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          })
        ]
      }
    })

    await screen.findByRole('row', { name: /notes\.docx/ })
    const settingsButton = screen.getByRole('button', { name: /settings/i })
    expect(settingsButton).toBeInTheDocument()
    expect(settingsButton).toBeDisabled()
  })

  it('opens Settings read-only for done rows', async () => {
    bridgeMocks.convert.mockResolvedValue(
      createBridgeResult({
        contents: '<html></html>',
        filename: 'notes.html',
        mimeType: 'text/html',
        targetFormat: 'html'
      })
    )

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['pdf'], 'notes.pdf', { type: 'application/pdf' })] }
    })

    await screen.findByRole('row', { name: /notes\.pdf/ })
    fireEvent.change(getFileTargetSelects()[0], { target: { value: 'html' } })
    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))

    await waitFor(() => {
      expect(screen.getByText('Done')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /settings/i }))
    expect(screen.getByRole('dialog', { name: /settings \(read-only\)/i })).toBeInTheDocument()

    const includeBackgroundCheckbox = screen.getByRole('checkbox', { name: /include background/i })
    expect(includeBackgroundCheckbox).toBeDisabled()
  })

  it('target cell contains only the target select after migration', async () => {
    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['pdf'], 'sample.pdf', { type: 'application/pdf' })] }
    })

    await screen.findByRole('row', { name: /sample\.pdf/ })
    fireEvent.change(getFileTargetSelects()[0], { target: { value: 'html' } })

    const row = screen.getByRole('row', { name: /sample\.pdf/ })
    const targetCell = row.querySelector('td:nth-child(3)')

    expect(targetCell?.querySelectorAll('select')).toHaveLength(1)
    expect(targetCell?.querySelectorAll('button')).toHaveLength(0)
    expect(targetCell?.querySelectorAll('input[type="checkbox"]')).toHaveLength(0)
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

  it('passes TXT to JPG and WebP targets to the bridge and downloads WebP output', async () => {
    const { downloadBlobFile } = await import('../lib/download')
    bridgeMocks.convert
      .mockResolvedValueOnce(
        createBridgeResult({
          contents: 'jpg-bytes',
          filename: 'notes.jpg',
          mimeType: 'image/jpeg',
          targetFormat: 'jpg'
        })
      )
      .mockResolvedValueOnce(
        createBridgeResult({
          contents: 'webp-bytes',
          filename: 'notes.webp',
          mimeType: 'image/webp',
          targetFormat: 'webp'
        })
      )

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['hello'], 'notes.txt', { type: 'text/plain' })] }
    })

    await screen.findByRole('row', { name: /notes\.txt/ })
    fireEvent.change(getFileTargetSelects()[0], { target: { value: 'jpg' } })
    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))

    await waitFor(() => {
      expect(bridgeMocks.convert).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceFormat: 'txt',
          targetFormat: 'jpg'
        })
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    const selectsAfterCopy = getFileTargetSelects()
    expect(selectsAfterCopy[1]).toHaveValue('jpg')
    fireEvent.change(selectsAfterCopy[1], { target: { value: 'webp' } })
    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))

    await waitFor(() => {
      expect(bridgeMocks.convert).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceFormat: 'txt',
          targetFormat: 'webp'
        })
      )
    })

    const webpRow = getFileRows()[1]
    expect(within(webpRow).getByText('Done')).toBeInTheDocument()
    fireEvent.click(within(webpRow).getByRole('button', { name: 'Download' }))

    await waitFor(() => {
      expect(downloadBlobFile).toHaveBeenCalledTimes(1)
    })

    const downloadResult = vi.mocked(downloadBlobFile).mock.calls[0]?.[0]
    if (!downloadResult) throw new Error('Expected TXT to WebP download result')

    expect(downloadResult.filename).toBe('notes.webp')
    expect(downloadResult.targetFormat).toBe('webp')
    expect(downloadResult.blob.type).toBe('image/webp')
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

    const removeButton = screen.getByRole('button', { name: 'Remove' })
    expect(removeButton).toHaveClass('row-action-btn')

    fireEvent.click(removeButton)

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
    const firstBridgeResult = createBridgeResult({ contents: 'first', filename: 'first.txt' })
    const secondBridgeResult = createBridgeResult({ contents: 'second', filename: 'second.txt' })
    bridgeMocks.convert
      .mockResolvedValueOnce(firstBridgeResult)
      .mockResolvedValueOnce(secondBridgeResult)
      .mockResolvedValue(secondBridgeResult)
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

    // pdf→txt has pdfPages section, so Settings button exists even though target is not html
    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /settings/i }))

    // No html options in the modal for non-html target
    expect(screen.getByRole('dialog', { name: /settings/i })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /include background/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /background quality/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /settings/i })).not.toBeInTheDocument()
    })

    fireEvent.change(targetSelect, { target: { value: 'html' } })

    fireEvent.click(screen.getByRole('button', { name: /settings/i }))

    // Html options ARE present after switching to html target
    const dialog = screen.getByRole('dialog', { name: /settings/i })
    const includeBackgroundCheckbox = screen.getByRole('checkbox', {
      name: /include background/i
    })
    const backgroundQualitySelect = screen.getByRole('combobox', {
      name: /background quality/i
    })

    expect(dialog).toContainElement(includeBackgroundCheckbox)
    expect(dialog).toContainElement(backgroundQualitySelect)
    expect(
      screen.queryByRole('checkbox', { name: /exclude text from background/i })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('checkbox', { name: /exclude images from background/i })
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /settings/i })).not.toBeInTheDocument()
    })
  })

  it('TDD-2: background options rendered inline for html target', async () => {
    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['pdf'], 'sample.pdf', { type: 'application/pdf' })] }
    })

    await screen.findByRole('row', { name: /sample\.pdf/ })
    fireEvent.change(getFileTargetSelects()[0], { target: { value: 'html' } })

    fireEvent.click(screen.getByRole('button', { name: /settings/i }))

    const dialog = screen.getByRole('dialog', { name: /settings/i })
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

    fireEvent.click(screen.getByRole('button', { name: /settings/i }))

    const fontSizeInput = screen.getByRole('spinbutton', { name: /font size/i })
    expect(screen.getByRole('dialog', { name: /settings/i })).toContainElement(fontSizeInput)

    fireEvent.change(fontSizeInput, { target: { value: '18' } })
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /settings/i })).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /settings/i }))

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

    const optionsButtons = screen.getAllByRole('button', { name: /settings/i })
    fireEvent.click(optionsButtons[0])

    const firstRowIncludeBackground = screen.getByRole('checkbox', { name: /include background/i })
    expect(firstRowIncludeBackground).toBeChecked()

    fireEvent.click(firstRowIncludeBackground)
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /settings/i })).not.toBeInTheDocument()
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

    fireEvent.click(screen.getByRole('button', { name: /settings/i }))

    const qualitySelect = screen.getByRole('combobox', {
      name: /background quality/i
    }) as HTMLSelectElement
    changeNativeSelectValue(qualitySelect, '0.6')

    fireEvent.change(screen.getByRole('spinbutton', { name: /font size/i }), {
      target: { value: '18' }
    })
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /settings/i })).not.toBeInTheDocument()
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

    fireEvent.click(screen.getByRole('button', { name: /settings/i }))

    const qualitySelect = screen.getByRole('combobox', {
      name: /background quality/i
    }) as HTMLSelectElement

    expect(qualitySelect.value).toBe('0.85')

    changeNativeSelectValue(qualitySelect, '0.6')
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /settings/i })).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /settings/i }))

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

    fireEvent.click(screen.getByRole('button', { name: /settings/i }))

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

    // txt→png has imageTarget section, so Settings button exists even though target is not html
    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /settings/i }))

    // No html options in the modal for non-html target
    expect(screen.getByRole('dialog', { name: /settings/i })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /include background/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /background quality/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /settings/i })).not.toBeInTheDocument()
    })

    fireEvent.change(getFileTargetSelects()[0], { target: { value: 'html' } })

    fireEvent.click(screen.getByRole('button', { name: /settings/i }))

    // Html options ARE present after switching to html target
    const dialog = screen.getByRole('dialog', { name: /settings/i })
    const includeBackgroundCheckbox = screen.getByRole('checkbox', {
      name: /include background/i
    })
    const backgroundQualitySelect = screen.getByRole('combobox', {
      name: /background quality/i
    })

    expect(dialog).toContainElement(includeBackgroundCheckbox)
    expect(dialog).toContainElement(backgroundQualitySelect)
  })

  it('TDD-image-1: bridge receives image options with defaults when converting image to image', async () => {
    bridgeMocks.convert.mockResolvedValue(
      createBridgeResult({
        contents: 'png-bytes',
        filename: 'photo.png',
        mimeType: 'image/png',
        targetFormat: 'png'
      })
    )

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['jpg'], 'photo.jpg', { type: 'image/jpeg' })] }
    })

    await screen.findByRole('row', { name: /photo\.jpg/ })

    fireEvent.change(getFileTargetSelects()[0], { target: { value: 'png' } })
    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))

    await waitFor(() => {
      expect(bridgeMocks.convert).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceFormat: 'image',
          targetFormat: 'png',
          options: expect.objectContaining({
            image: expect.objectContaining({
              quality: 0.92,
              keepAspectRatio: true
            })
          })
        })
      )
    })
  })

  it('passes configured image max dimensions to the bridge', async () => {
    bridgeMocks.convert.mockResolvedValue(
      createBridgeResult({
        contents: 'png-bytes',
        filename: 'photo.png',
        mimeType: 'image/png',
        targetFormat: 'png'
      })
    )

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['jpg'], 'photo.jpg', { type: 'image/jpeg' })] }
    })

    await screen.findByRole('row', { name: /photo\.jpg/ })

    fireEvent.change(getFileTargetSelects()[0], { target: { value: 'png' } })
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Max width' }), {
      target: { value: '200' }
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Max height' }), {
      target: { value: '120' }
    })
    fireEvent.click(screen.getByRole('button', { name: /done/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))

    await waitFor(() => {
      expect(bridgeMocks.convert).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceFormat: 'image',
          targetFormat: 'png',
          options: expect.objectContaining({
            image: expect.objectContaining({
              maxWidth: 200,
              maxHeight: 120,
              keepAspectRatio: true
            })
          })
        })
      )
    })
  })

  it('passes settings-driven EXIF removal categories to the bridge', async () => {
    bridgeMocks.convert.mockResolvedValue(
      createBridgeResult({
        contents: 'jpg-bytes',
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        targetFormat: 'jpg'
      })
    )

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['jpg'], 'photo.jpg', { type: 'image/jpeg' })] }
    })

    await screen.findByRole('row', { name: /photo\.jpg/ })

    fireEvent.change(getFileTargetSelects()[0], { target: { value: 'jpg' } })
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Remove EXIF metadata' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Camera and lens' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Date and time' }))
    fireEvent.click(screen.getByRole('button', { name: /done/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))

    await waitFor(() => {
      expect(bridgeMocks.convert).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceFormat: 'image',
          targetFormat: 'jpg',
          options: expect.objectContaining({
            image: expect.objectContaining({
              removeExif: {
                enabled: true,
                categories: ['camera', 'datetime']
              }
            })
          })
        })
      )
    })
  })

  it('passes settings-driven image-to-PDF rotation and scale to the bridge', async () => {
    bridgeMocks.convert.mockResolvedValue(
      createBridgeResult({
        contents: 'pdf-bytes',
        filename: 'photo.pdf',
        mimeType: 'application/pdf',
        targetFormat: 'pdf'
      })
    )

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['png'], 'photo.png', { type: 'image/png' })] }
    })

    await screen.findByRole('row', { name: /photo\.png/ })

    fireEvent.change(getFileTargetSelects()[0], { target: { value: 'pdf' } })
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))
    fireEvent.change(screen.getByLabelText('Rotation'), { target: { value: '90' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Scale (%)' }), {
      target: { value: '150' }
    })
    fireEvent.click(screen.getByRole('button', { name: /done/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))

    await waitFor(() => {
      expect(bridgeMocks.convert).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceFormat: 'image',
          targetFormat: 'pdf',
          options: expect.objectContaining({
            imageToPdf: expect.objectContaining({
              rotationDeg: 90,
              scalePercent: 150
            })
          })
        })
      )
    })
  })

  it('passes single-file PDF portrait orientation setting to the bridge', async () => {
    bridgeMocks.convert.mockResolvedValue(
      createBridgeResult({
        contents: 'pdf-bytes',
        filename: 'photo.pdf',
        mimeType: 'application/pdf',
        targetFormat: 'pdf'
      })
    )

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['png'], 'photo.png', { type: 'image/png' })] }
    })

    await screen.findByRole('row', { name: /photo\.png/ })

    fireEvent.change(getFileTargetSelects()[0], { target: { value: 'pdf' } })
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))
    fireEvent.change(screen.getByLabelText('Orientation'), { target: { value: 'portrait' } })
    fireEvent.click(screen.getByRole('button', { name: /done/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))

    await waitFor(() => {
      expect(bridgeMocks.convert).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceFormat: 'image',
          targetFormat: 'pdf',
          options: expect.objectContaining({
            pdfPageSetup: expect.objectContaining({
              orientation: 'portrait'
            })
          })
        })
      )
    })
  })

  it('preserves single-file PDF page setup when settings are reopened', async () => {
    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['png'], 'photo.png', { type: 'image/png' })] }
    })
    await screen.findByRole('row', { name: /photo\.png/ })

    changeNativeSelectValue(getFileTargetSelects()[0], 'pdf')
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))
    changeNativeSelectValue(screen.getByRole('combobox', { name: /orientation/i }), 'landscape')
    fireEvent.click(screen.getByRole('button', { name: /done/i }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /settings/i })).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /settings/i }))

    expect(screen.getByRole('combobox', { name: /orientation/i })).toHaveValue('landscape')
  })

  it('passes the selected Markdown TXT mode to the bridge', async () => {
    bridgeMocks.convert.mockResolvedValue(createBridgeResult({ filename: 'notes.txt' }))
    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['# Heading'], 'notes.md', { type: 'text/markdown' })] }
    })
    await screen.findByRole('row', { name: /notes\.md/ })

    fireEvent.click(screen.getByRole('button', { name: /settings/i }))
    fireEvent.click(screen.getByDisplayValue('raw'))
    fireEvent.click(screen.getByRole('button', { name: /done/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))

    await waitFor(() => {
      expect(bridgeMocks.convert).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceFormat: 'markdown',
          targetFormat: 'txt',
          options: expect.objectContaining({ markdown: { txtMode: 'raw' } })
        })
      )
    })
  })

  it('TDD-image-2: bridge receives imageToPdf options when converting image to pdf', async () => {
    bridgeMocks.convert.mockResolvedValue(
      createBridgeResult({
        contents: 'pdf-bytes',
        filename: 'photo.pdf',
        mimeType: 'application/pdf',
        targetFormat: 'pdf'
      })
    )

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['jpg'], 'photo.jpg', { type: 'image/jpeg' })] }
    })

    await screen.findByRole('row', { name: /photo\.jpg/ })

    fireEvent.change(getFileTargetSelects()[0], { target: { value: 'pdf' } })
    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))

    await waitFor(() => {
      expect(bridgeMocks.convert).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceFormat: 'image',
          targetFormat: 'pdf',
          options: expect.objectContaining({
            imageToPdf: expect.objectContaining({
              marginPt: 24,
              fit: 'original',
              pageMode: 'auto'
            })
          })
        })
      )
    })
  })

  it('TDD-image-3: image options quality stays within 0.1-1.0 canonical range', async () => {
    bridgeMocks.convert.mockResolvedValue(
      createBridgeResult({
        contents: 'png-bytes',
        filename: 'photo.png',
        mimeType: 'image/png',
        targetFormat: 'png'
      })
    )

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['jpg'], 'photo.jpg', { type: 'image/jpeg' })] }
    })

    await screen.findByRole('row', { name: /photo\.jpg/ })

    fireEvent.change(getFileTargetSelects()[0], { target: { value: 'png' } })
    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))

    await waitFor(() => {
      const call = bridgeMocks.convert.mock.calls[0]?.[0]
      const options = call?.options as { image?: { quality?: number } } | undefined
      const quality = options?.image?.quality
      expect(quality).toBeGreaterThanOrEqual(0.1)
      expect(quality).toBeLessThanOrEqual(1.0)
    })
  })

  it('TDD-preview-1: Preview button appears after conversion and opens modal iframe', async () => {
    bridgeMocks.convert.mockResolvedValue(
      createBridgeResult({
        contents: '<html><body>hello</body></html>',
        filename: 'notes.html',
        mimeType: 'text/html',
        targetFormat: 'html'
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

    const previewButton = screen.getByRole('button', { name: 'Preview' })
    expect(previewButton).toBeEnabled()
    expect(previewButton).toHaveClass('row-action-btn')
    expect(previewButton).toHaveTextContent('🔍')

    fireEvent.click(previewButton)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    expect(screen.getByTitle('notes.html')).toBeInTheDocument()
  })

  it('TDD-preview-2: multi-output mock result displays tabs in preview modal', async () => {
    vi.mocked(convertViaBridge).mockResolvedValueOnce([
      {
        filename: 'page-001.png',
        mimeType: 'image/png',
        targetFormat: 'png',
        blob: new Blob(['png1'], { type: 'image/png' })
      },
      {
        filename: 'page-002.png',
        mimeType: 'image/png',
        targetFormat: 'png',
        blob: new Blob(['png2'], { type: 'image/png' })
      }
    ] as never)

    const { container } = render(<App />)
    const input = container.querySelector('.dropzone + input[type="file"]')

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['pdf'], 'report.pdf', { type: 'application/pdf' })] }
    })

    await screen.findByRole('row', { name: /report\.pdf/ })
    fireEvent.change(getFileTargetSelects()[0], { target: { value: 'png' } })
    fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))

    await waitFor(() => {
      expect(screen.getByText('Done')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[0]).toHaveTextContent('page-001.png')
    expect(tabs[1]).toHaveTextContent('page-002.png')
  })

  it('TDD-preview-3: unsupported done output disables Preview with localized label', async () => {
    vi.mocked(convertViaBridge).mockResolvedValueOnce({
      filename: 'result.md',
      mimeType: 'text/markdown',
      targetFormat: 'md',
      blob: new Blob(['# hello'], { type: 'text/markdown' })
    } as never)

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

    const previewButton = screen.getByRole('button', {
      name: 'Preview not available for this format'
    })
    expect(previewButton).toBeDisabled()
    expect(previewButton).toHaveAttribute('title', 'Preview not available for this format')
    expect(previewButton).toHaveClass('row-action-btn')
    expect(previewButton).toHaveTextContent('⊘')
  })

  it('TDD-preview-4: row download still works after preview integration', async () => {
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

    expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument()

    const downloadButton = screen.getAllByRole('button', { name: 'Download' })[0]
    expect(downloadButton).toHaveClass('row-action-btn')

    fireEvent.click(downloadButton)

    await waitFor(() => {
      expect(downloadBlobFile).toHaveBeenCalledTimes(1)
    })
  })

  describe('multi-select mode', () => {
    const getRowCheckboxes = () => {
      const table = screen.getByRole('table')
      return Array.from(table.querySelectorAll<HTMLInputElement>('tbody tr input[type="checkbox"]'))
    }

    it('enters multi-select mode and clears previous selection when toggle is clicked', async () => {
      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      fireEvent.change(input as HTMLInputElement, {
        target: { files: [new File(['a'], 'a.txt', { type: 'text/plain' })] }
      })
      await screen.findByRole('row', { name: /a\.txt/ })

      fireEvent.click(screen.getByRole('button', { name: 'Multi-select' }))

      expect(screen.getByRole('button', { name: 'Cancel selection' })).toBeInTheDocument()
      expect(screen.getByText('0 selected')).toBeInTheDocument()
    })

    it('renders checkboxes only while in multi-select mode', async () => {
      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      fireEvent.change(input as HTMLInputElement, {
        target: { files: [new File(['a'], 'a.txt', { type: 'text/plain' })] }
      })
      await screen.findByRole('row', { name: /a\.txt/ })

      expect(getRowCheckboxes()).toHaveLength(0)

      await enterMultiSelectMode()
      expect(getRowCheckboxes()).toHaveLength(1)
    })

    it('toggles selection by clicking a selectable row', async () => {
      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      fireEvent.change(input as HTMLInputElement, {
        target: { files: [new File(['a'], 'a.txt', { type: 'text/plain' })] }
      })
      await screen.findByRole('row', { name: /a\.txt/ })
      await enterMultiSelectMode()

      const row = getFileRows()[0]
      fireEvent.click(row)
      expect(getRowCheckboxes()[0]).toBeChecked()

      fireEvent.click(row)
      expect(getRowCheckboxes()[0]).not.toBeChecked()
    })

    it('toggles selection by clicking checkbox without double-toggling the row', async () => {
      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      fireEvent.change(input as HTMLInputElement, {
        target: { files: [new File(['a'], 'a.txt', { type: 'text/plain' })] }
      })
      await screen.findByRole('row', { name: /a\.txt/ })
      await enterMultiSelectMode()

      const checkbox = getRowCheckboxes()[0]
      fireEvent.click(checkbox)
      expect(checkbox).toBeChecked()

      fireEvent.click(checkbox)
      expect(checkbox).not.toBeChecked()
    })

    it('disables checkboxes and ignores row clicks for done rows', async () => {
      bridgeMocks.convert.mockResolvedValue(createBridgeResult())

      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      fireEvent.change(input as HTMLInputElement, {
        target: { files: [new File(['a'], 'a.txt', { type: 'text/plain' })] }
      })
      await screen.findByRole('row', { name: /a\.txt/ })

      fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))
      await waitFor(() => {
        expect(screen.getByText('Done')).toBeInTheDocument()
      })

      await enterMultiSelectMode()
      const checkbox = getRowCheckboxes()[0]
      expect(checkbox).toBeDisabled()

      fireEvent.click(getFileRows()[0])
      expect(checkbox).not.toBeChecked()
    })

    it('disables checkboxes and ignores row clicks for converting rows', async () => {
      let resolveConversion: ((value: ParserBridgeConversionResultPayload) => void) | undefined
      const conversionPromise = new Promise<ParserBridgeConversionResultPayload>(resolve => {
        resolveConversion = resolve
      })
      bridgeMocks.convert.mockReturnValue(conversionPromise)

      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      fireEvent.change(input as HTMLInputElement, {
        target: { files: [new File(['a'], 'a.txt', { type: 'text/plain' })] }
      })
      await screen.findByRole('row', { name: /a\.txt/ })

      fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))
      await waitFor(() => {
        expect(screen.getByText('Converting...')).toBeInTheDocument()
      })

      await enterMultiSelectMode()
      const checkbox = getRowCheckboxes()[0]
      expect(checkbox).toBeDisabled()

      fireEvent.click(getFileRows()[0])
      expect(checkbox).not.toBeChecked()

      resolveConversion?.(createBridgeResult())
    })

    it('clears selection and exits multi-select mode when cancel is clicked', async () => {
      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      fireEvent.change(input as HTMLInputElement, {
        target: {
          files: [
            new File(['a'], 'a.txt', { type: 'text/plain' }),
            new File(['b'], 'b.txt', { type: 'text/plain' })
          ]
        }
      })
      await screen.findByRole('row', { name: /a\.txt/ })
      await screen.findByRole('row', { name: /b\.txt/ })

      await enterMultiSelectMode()
      fireEvent.click(getFileRows()[0])
      fireEvent.click(getFileRows()[1])
      expect(screen.getByText('2 selected')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Cancel selection' }))

      expect(screen.queryByText('2 selected')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Multi-select' })).toBeInTheDocument()
    })

    it('keeps target select functional in multi-select mode', async () => {
      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      fireEvent.change(input as HTMLInputElement, {
        target: { files: [new File(['a'], 'a.txt', { type: 'text/plain' })] }
      })
      await screen.findByRole('row', { name: /a\.txt/ })
      await enterMultiSelectMode()

      const targetSelect = getFileTargetSelects()[0]
      changeNativeSelectValue(targetSelect, 'html')
      expect(targetSelect).toHaveValue('html')
    })

    it('shows toolbar buttons gated by selection state in multi-select mode', async () => {
      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      fireEvent.change(input as HTMLInputElement, {
        target: { files: [new File(['a'], 'a.txt', { type: 'text/plain' })] }
      })
      await screen.findByRole('row', { name: /a\.txt/ })
      await enterMultiSelectMode()

      expect(screen.getByRole('button', { name: 'Create Group' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Delete selected' })).toBeDisabled()
      expect(screen.getByRole('combobox', { name: 'Set target format' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Select all' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Deselect all' })).toBeDisabled()
    })

    it('hides row action buttons in multi-select mode', async () => {
      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      fireEvent.change(input as HTMLInputElement, {
        target: { files: [new File(['a'], 'a.txt', { type: 'text/plain' })] }
      })
      await screen.findByRole('row', { name: /a\.txt/ })

      expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()

      await enterMultiSelectMode()
      expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
    })

    it('selects all eligible rows and deselects all', async () => {
      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      fireEvent.change(input as HTMLInputElement, {
        target: {
          files: [
            new File(['a'], 'a.txt', { type: 'text/plain' }),
            new File(['b'], 'b.txt', { type: 'text/plain' })
          ]
        }
      })
      await screen.findByRole('row', { name: /a\.txt/ })
      await enterMultiSelectMode()

      fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
      expect(screen.getByText('2 selected')).toBeInTheDocument()
      expect(getRowCheckboxes().every(cb => cb.checked)).toBe(true)

      fireEvent.click(screen.getByRole('button', { name: 'Deselect all' }))
      expect(screen.getByText('0 selected')).toBeInTheDocument()
      expect(getRowCheckboxes().every(cb => !cb.checked)).toBe(true)
    })

    it('select all skips done, converting, and queued rows', async () => {
      bridgeMocks.convert.mockResolvedValue(createBridgeResult())
      let resolveConversion: ((value: ParserBridgeConversionResultPayload) => void) | undefined
      const conversionPromise = new Promise<ParserBridgeConversionResultPayload>(resolve => {
        resolveConversion = resolve
      })

      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      fireEvent.change(input as HTMLInputElement, {
        target: { files: [new File(['a'], 'a.txt', { type: 'text/plain' })] }
      })
      await screen.findByRole('row', { name: /a\.txt/ })

      fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))
      await waitFor(() => {
        expect(screen.getByText('Done')).toBeInTheDocument()
      })

      fireEvent.change(input as HTMLInputElement, {
        target: { files: [new File(['b'], 'b.txt', { type: 'text/plain' })] }
      })
      await screen.findByRole('row', { name: /b\.txt/ })

      fireEvent.change(input as HTMLInputElement, {
        target: { files: [new File(['c'], 'c.txt', { type: 'text/plain' })] }
      })
      await screen.findByRole('row', { name: /c\.txt/ })

      bridgeMocks.convert.mockReturnValueOnce(conversionPromise)
      fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))
      await waitFor(() => {
        expect(screen.getByText('Converting...')).toBeInTheDocument()
      })

      await enterMultiSelectMode()
      fireEvent.click(screen.getByRole('button', { name: 'Select all' }))

      const checkboxes = getRowCheckboxes()
      expect(checkboxes.filter(cb => cb.checked)).toHaveLength(0)
      expect(checkboxes.filter(cb => cb.disabled)).toHaveLength(3)

      resolveConversion?.(createBridgeResult())
    })
  })

  describe('bottom toolbar actions', () => {
    it('bulk deletes selected rows and keeps multi-select mode', async () => {
      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      fireEvent.change(input as HTMLInputElement, {
        target: {
          files: [
            new File(['a'], 'a.txt', { type: 'text/plain' }),
            new File(['b'], 'b.txt', { type: 'text/plain' })
          ]
        }
      })
      await screen.findByRole('row', { name: /a\.txt/ })
      await enterMultiSelectMode()

      fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
      fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }))

      await waitFor(() => {
        expect(screen.queryByRole('table')).not.toBeInTheDocument()
      })
      expect(screen.getByRole('button', { name: 'Cancel selection' })).toBeInTheDocument()
      expect(screen.getByText('0 selected')).toBeInTheDocument()
    })

    it('bulk target changes selected rows without resetting failed status', async () => {
      bridgeMocks.convert.mockRejectedValue(new Error('conversion failed'))

      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      fireEvent.change(input as HTMLInputElement, {
        target: {
          files: [
            new File(['a'], 'a.txt', { type: 'text/plain' }),
            new File(['b'], 'b.txt', { type: 'text/plain' })
          ]
        }
      })
      await screen.findByRole('row', { name: /a\.txt/ })

      fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))
      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument()
      })

      await enterMultiSelectMode()
      fireEvent.click(screen.getByRole('button', { name: 'Select all' }))

      const targetSelect = screen.getByRole('combobox', {
        name: 'Set target format'
      }) as HTMLSelectElement
      changeNativeSelectValue(targetSelect, 'html')

      await waitFor(() => {
        expect(getFileTargetSelects()[0]).toHaveValue('html')
        expect(getFileTargetSelects()[1]).toHaveValue('html')
      })
      expect(screen.getAllByText('Failed')).toHaveLength(2)
    })

    it('shows no-common-target message for incompatible selections', async () => {
      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      fireEvent.change(input as HTMLInputElement, {
        target: {
          files: [
            new File(['a'], 'a.txt', { type: 'text/plain' }),
            new File(['h'], 'h.html', { type: 'text/html' })
          ]
        }
      })
      await screen.findByRole('row', { name: /a\.txt/ })
      await screen.findByRole('row', { name: /h\.html/ })
      await enterMultiSelectMode()

      fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
      expect(screen.getByText('No common target format for selected files')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Create Group' })).toBeDisabled()
      expect(screen.getByRole('combobox', { name: 'Set target format' })).toBeDisabled()
    })

    it('shows already-in-group message and disables Create Group for grouped selection', async () => {
      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      fireEvent.change(input as HTMLInputElement, {
        target: {
          files: [
            new File(['a'], 'a.txt', { type: 'text/plain' }),
            new File(['b'], 'b.txt', { type: 'text/plain' }),
            new File(['c'], 'c.txt', { type: 'text/plain' })
          ]
        }
      })
      await screen.findByRole('row', { name: /a\.txt/ })
      await enterMultiSelectMode()

      fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
      fireEvent.click(screen.getByRole('button', { name: 'Create Group' }))
      await waitFor(() => {
        expect(getGroupHeaders()).toHaveLength(1)
      })

      await enterMultiSelectMode()
      fireEvent.click(getFileRows()[1])
      fireEvent.click(getFileRows()[3])

      expect(
        screen.getByText('Cannot create a Group from files that are already in a Group')
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Create Group' })).toBeDisabled()
      expect(screen.getByRole('combobox', { name: 'Set target format' })).toBeEnabled()
    })
  })

  describe('group creation and rendering', () => {
    it('creates a group from two selected files', async () => {
      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      fireEvent.change(input as HTMLInputElement, {
        target: {
          files: [
            new File(['a'], 'a.txt', { type: 'text/plain' }),
            new File(['b'], 'b.txt', { type: 'text/plain' })
          ]
        }
      })
      await screen.findByRole('row', { name: /a\.txt/ })
      await enterMultiSelectMode()

      fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
      fireEvent.click(screen.getByRole('button', { name: 'Create Group' }))

      await waitFor(() => {
        expect(getGroupHeaders()).toHaveLength(1)
      })
      expect(screen.getByRole('row', { name: /Group 1 · 2 files/ })).toBeInTheDocument()
      expect(getGroupMemberRows()).toHaveLength(2)
    })

    it('collapses and expands a group', async () => {
      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      fireEvent.change(input as HTMLInputElement, {
        target: {
          files: [
            new File(['a'], 'a.txt', { type: 'text/plain' }),
            new File(['b'], 'b.txt', { type: 'text/plain' })
          ]
        }
      })
      await screen.findByRole('row', { name: /a\.txt/ })
      await enterMultiSelectMode()

      fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
      fireEvent.click(screen.getByRole('button', { name: 'Create Group' }))
      await waitFor(() => {
        expect(getGroupHeaders()).toHaveLength(1)
      })

      const collapseBtn = screen.getByRole('button', { name: 'Collapse group' })
      expect(collapseBtn).toHaveAttribute('aria-expanded', 'true')
      fireEvent.click(collapseBtn)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Expand group' })).toHaveAttribute(
          'aria-expanded',
          'false'
        )
      })
      expect(getGroupMemberRows()).toHaveLength(0)

      fireEvent.click(screen.getByRole('button', { name: 'Expand group' }))
      await waitFor(() => {
        expect(getGroupMemberRows()).toHaveLength(2)
      })
    })

    it('auto-removes empty groups after bulk delete', async () => {
      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      fireEvent.change(input as HTMLInputElement, {
        target: {
          files: [
            new File(['a'], 'a.txt', { type: 'text/plain' }),
            new File(['b'], 'b.txt', { type: 'text/plain' })
          ]
        }
      })
      await screen.findByRole('row', { name: /a\.txt/ })
      await enterMultiSelectMode()

      fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
      fireEvent.click(screen.getByRole('button', { name: 'Create Group' }))
      await waitFor(() => {
        expect(getGroupHeaders()).toHaveLength(1)
      })

      await enterMultiSelectMode()
      fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
      fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }))

      await waitFor(() => {
        expect(screen.queryByRole('table')).not.toBeInTheDocument()
      })
    })

    it('supports multiple top-level groups', async () => {
      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      fireEvent.change(input as HTMLInputElement, {
        target: {
          files: [
            new File(['a'], 'a.txt', { type: 'text/plain' }),
            new File(['b'], 'b.txt', { type: 'text/plain' }),
            new File(['c'], 'c.txt', { type: 'text/plain' }),
            new File(['d'], 'd.txt', { type: 'text/plain' })
          ]
        }
      })
      await screen.findByRole('row', { name: /a\.txt/ })
      await enterMultiSelectMode()

      fireEvent.click(getFileRows()[0])
      fireEvent.click(getFileRows()[1])
      fireEvent.click(screen.getByRole('button', { name: 'Create Group' }))
      await waitFor(() => {
        expect(getGroupHeaders()).toHaveLength(1)
      })

      await enterMultiSelectMode()
      fireEvent.click(getFileRows()[3])
      fireEvent.click(getFileRows()[4])
      fireEvent.click(screen.getByRole('button', { name: 'Create Group' }))
      await waitFor(() => {
        expect(getGroupHeaders()).toHaveLength(2)
      })
    })
  })

  describe('group target and settings', () => {
    it('group target change propagates to members and preserves failed status', async () => {
      bridgeMocks.convert.mockRejectedValue(new Error('conversion failed'))

      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      fireEvent.change(input as HTMLInputElement, {
        target: {
          files: [
            new File(['a'], 'a.txt', { type: 'text/plain' }),
            new File(['b'], 'b.txt', { type: 'text/plain' }),
            new File(['c'], 'c.txt', { type: 'text/plain' })
          ]
        }
      })
      await screen.findByRole('row', { name: /a\.txt/ })

      fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))
      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument()
      })

      await enterMultiSelectMode()
      fireEvent.click(getFileRows()[0])
      fireEvent.click(getFileRows()[1])
      fireEvent.click(screen.getByRole('button', { name: 'Create Group' }))
      await waitFor(() => {
        expect(getGroupHeaders()).toHaveLength(1)
      })

      const groupHeader = getGroupHeaders()[0]
      const groupTargetSelect = within(groupHeader).getByRole('combobox', {
        name: 'Target'
      }) as HTMLSelectElement
      changeNativeSelectValue(groupTargetSelect, 'html')

      await waitFor(() => {
        expect(getFileTargetSelects()[0]).toHaveValue('html')
        expect(getFileTargetSelects()[1]).toHaveValue('html')
      })
      expect(getFileTargetSelects()[2]).toHaveValue('png')
      expect(screen.getAllByText('Failed')).toHaveLength(3)
    })

    it('resets completed members and clears stale outputs when group target changes', async () => {
      bridgeMocks.convert.mockResolvedValue(
        createBridgeResult({ filename: 'old.png', targetFormat: 'png' })
      )
      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      fireEvent.change(input as HTMLInputElement, {
        target: {
          files: [
            new File(['a'], 'a.txt', { type: 'text/plain' }),
            new File(['b'], 'b.txt', { type: 'text/plain' })
          ]
        }
      })
      await screen.findByRole('row', { name: /a\.txt/ })
      await enterMultiSelectMode()
      fireEvent.click(getFileRows()[0])
      fireEvent.click(getFileRows()[1])
      fireEvent.click(screen.getByRole('button', { name: 'Create Group' }))
      await waitFor(() => expect(getGroupHeaders()).toHaveLength(1))

      fireEvent.click(within(getGroupHeaders()[0]).getByRole('button', { name: 'Convert Group' }))
      await waitFor(() => expect(screen.getAllByText('Done')).toHaveLength(2))

      const groupTargetSelect = within(getGroupHeaders()[0]).getByRole('combobox', {
        name: 'Target'
      }) as HTMLSelectElement
      changeNativeSelectValue(groupTargetSelect, 'html')

      await waitFor(() => expect(screen.getAllByText('Ready')).toHaveLength(2))
      expect(screen.queryByText('Done')).not.toBeInTheDocument()
      expect(
        within(getGroupHeaders()[0]).getByRole('button', { name: 'Convert Group' })
      ).toBeEnabled()
    })

    it('group settings apply target-related options only to applicable members', async () => {
      bridgeMocks.convert.mockResolvedValue(
        createBridgeResult({
          contents: 'png-bytes',
          filename: 'photo.png',
          mimeType: 'image/png',
          targetFormat: 'png'
        })
      )

      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      fireEvent.change(input as HTMLInputElement, {
        target: {
          files: [
            new File(['t'], 'notes.txt', { type: 'text/plain' }),
            new File(['i'], 'photo.jpg', { type: 'image/jpeg' })
          ]
        }
      })
      await screen.findByRole('row', { name: /notes\.txt/ })
      await enterMultiSelectMode()

      fireEvent.click(getFileRows()[0])
      fireEvent.click(getFileRows()[1])
      fireEvent.click(screen.getByRole('button', { name: 'Create Group' }))
      await waitFor(() => {
        expect(getGroupHeaders()).toHaveLength(1)
      })

      const groupHeader = getGroupHeaders()[0]
      fireEvent.click(within(groupHeader).getByRole('button', { name: 'Group settings' }))
      const dialog = screen.getByRole('dialog', { name: /settings/i })

      fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'Max width' }), {
        target: { value: '300' }
      })
      fireEvent.click(screen.getByRole('button', { name: /done/i }))

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /settings/i })).not.toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))
      await waitFor(() => {
        expect(bridgeMocks.convert).toHaveBeenCalledTimes(2)
      })

      const calls = bridgeMocks.convert.mock.calls
      const imageCall = calls.find(call => call[0].sourceFormat === 'image')
      const txtCall = calls.find(call => call[0].sourceFormat === 'txt')
      expect((imageCall?.[0].options as { image?: { maxWidth?: number } }).image?.maxWidth).toBe(
        300
      )
      expect((txtCall?.[0].options as { image?: { maxWidth?: number } }).image).toBeUndefined()
    })

    it('group settings use group target for section applicability even when member target diverges', async () => {
      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      fireEvent.change(input as HTMLInputElement, {
        target: {
          files: [
            new File(['t'], 'notes.txt', { type: 'text/plain' }),
            new File(['i'], 'photo.jpg', { type: 'image/jpeg' })
          ]
        }
      })
      await screen.findByRole('row', { name: /notes\.txt/ })
      await enterMultiSelectMode()

      fireEvent.click(getFileRows()[0])
      fireEvent.click(getFileRows()[1])
      fireEvent.click(screen.getByRole('button', { name: 'Create Group' }))
      await waitFor(() => {
        expect(getGroupHeaders()).toHaveLength(1)
      })

      // Group target defaults to first common target (png). Diverge image member's per-row target.
      const memberSelects = getFileTargetSelects()
      changeNativeSelectValue(memberSelects[1], 'html')

      await waitFor(() => {
        expect(memberSelects[1]).toHaveValue('html')
      })

      // Open group settings and change imageTarget option (max width).
      const groupHeader = getGroupHeaders()[0]
      fireEvent.click(within(groupHeader).getByRole('button', { name: 'Group settings' }))
      const dialog = screen.getByRole('dialog', { name: /settings/i })

      fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'Max width' }), {
        target: { value: '500' }
      })
      fireEvent.click(screen.getByRole('button', { name: /done/i }))

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /settings/i })).not.toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))
      await waitFor(() => {
        expect(bridgeMocks.convert).toHaveBeenCalledTimes(2)
      })

      const calls = bridgeMocks.convert.mock.calls
      const imageCall = calls.find(call => call[0].sourceFormat === 'image')
      const txtCall = calls.find(call => call[0].sourceFormat === 'txt')

      // (source=image, groupTarget=png) is applicable for imageTarget even though member target is html
      expect((imageCall?.[0].options as { image?: { maxWidth?: number } }).image?.maxWidth).toBe(
        500
      )
      // (source=txt, groupTarget=png) is not applicable for imageTarget
      expect((txtCall?.[0].options as { image?: { maxWidth?: number } }).image).toBeUndefined()
    })

    it('group settings apply pdfPageSetup orientation to image-to-pdf members', async () => {
      bridgeMocks.convert.mockResolvedValue(
        createBridgeResult({
          contents: 'pdf-bytes',
          filename: 'photo.pdf',
          mimeType: 'application/pdf',
          targetFormat: 'pdf'
        })
      )

      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      fireEvent.change(input as HTMLInputElement, {
        target: {
          files: [
            new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
            new File(['b'], 'b.jpg', { type: 'image/jpeg' })
          ]
        }
      })
      await screen.findByRole('row', { name: /a\.jpg/ })

      const targetSelects = getFileTargetSelects()
      changeNativeSelectValue(targetSelects[0], 'pdf')
      changeNativeSelectValue(targetSelects[1], 'pdf')
      await waitFor(() => {
        expect(targetSelects[0]).toHaveValue('pdf')
        expect(targetSelects[1]).toHaveValue('pdf')
      })

      await enterMultiSelectMode()
      fireEvent.click(getFileRows()[0])
      fireEvent.click(getFileRows()[1])
      fireEvent.click(screen.getByRole('button', { name: 'Create Group' }))
      await waitFor(() => {
        expect(getGroupHeaders()).toHaveLength(1)
      })

      const groupHeader = getGroupHeaders()[0]
      fireEvent.click(within(groupHeader).getByRole('button', { name: 'Group settings' }))
      const dialog = screen.getByRole('dialog', { name: /settings/i })

      changeNativeSelectValue(
        within(dialog).getByRole('combobox', { name: /orientation/i }),
        'portrait'
      )
      fireEvent.click(screen.getByRole('button', { name: /done/i }))

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /settings/i })).not.toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: 'Convert all' }))
      await waitFor(() => {
        expect(bridgeMocks.convert).toHaveBeenCalledTimes(2)
      })

      const calls = bridgeMocks.convert.mock.calls
      for (const call of calls) {
        const pdfPageSetup = (call[0].options as { pdfPageSetup?: { orientation?: string } })
          .pdfPageSetup
        expect(pdfPageSetup?.orientation).toBe('portrait')
      }
    })
  })

  describe('group conversion and select-all', () => {
    it('group select all selects only eligible members', async () => {
      bridgeMocks.convert.mockResolvedValue(createBridgeResult())
      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      fireEvent.change(input as HTMLInputElement, {
        target: {
          files: [
            new File(['a'], 'a.txt', { type: 'text/plain' }),
            new File(['b'], 'b.txt', { type: 'text/plain' }),
            new File(['c'], 'c.txt', { type: 'text/plain' })
          ]
        }
      })
      await screen.findByRole('row', { name: /a\.txt/ })

      await enterMultiSelectMode()
      fireEvent.click(getFileRows()[0])
      fireEvent.click(getFileRows()[1])
      fireEvent.click(getFileRows()[2])
      fireEvent.click(screen.getByRole('button', { name: 'Create Group' }))
      await waitFor(() => {
        expect(getGroupHeaders()).toHaveLength(1)
      })

      bridgeMocks.convert.mockRejectedValueOnce(new Error('fail'))
      bridgeMocks.convert.mockResolvedValue(createBridgeResult())
      fireEvent.click(within(getGroupHeaders()[0]).getByRole('button', { name: 'Convert Group' }))
      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument()
      })
      await waitFor(() => {
        expect(screen.getAllByText('Done')).toHaveLength(2)
      })

      await enterMultiSelectMode()
      const groupHeader = getGroupHeaders()[0]
      fireEvent.click(within(groupHeader).getByRole('checkbox', { name: 'Select all in group' }))

      const memberCheckboxes = getGroupMemberRows().map(row => within(row).getByRole('checkbox'))
      expect(memberCheckboxes[0]).toBeChecked()
      expect(memberCheckboxes[1]).not.toBeChecked()
      expect(memberCheckboxes[2]).not.toBeChecked()
    })

    it('convert group converts only eligible members', async () => {
      bridgeMocks.convert.mockResolvedValue(createBridgeResult())

      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      fireEvent.change(input as HTMLInputElement, {
        target: {
          files: [
            new File(['a'], 'a.txt', { type: 'text/plain' }),
            new File(['b'], 'b.txt', { type: 'text/plain' })
          ]
        }
      })
      await screen.findByRole('row', { name: /a\.txt/ })
      await enterMultiSelectMode()

      fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
      fireEvent.click(screen.getByRole('button', { name: 'Create Group' }))
      await waitFor(() => {
        expect(getGroupHeaders()).toHaveLength(1)
      })

      const groupHeader = getGroupHeaders()[0]
      fireEvent.click(within(groupHeader).getByRole('button', { name: 'Convert Group' }))

      await waitFor(() => {
        expect(bridgeMocks.convert).toHaveBeenCalledTimes(2)
      })
      expect(screen.getAllByText('Done')).toHaveLength(2)
    })

    it('blocks group controls while any member is converting', async () => {
      let resolveConversion: ((value: ParserBridgeConversionResultPayload) => void) | undefined
      const conversionPromise = new Promise<ParserBridgeConversionResultPayload>(resolve => {
        resolveConversion = resolve
      })
      bridgeMocks.convert.mockReturnValue(conversionPromise)

      const { container } = render(<App />)
      const input = container.querySelector('.dropzone + input[type="file"]')

      fireEvent.change(input as HTMLInputElement, {
        target: {
          files: [
            new File(['a'], 'a.txt', { type: 'text/plain' }),
            new File(['b'], 'b.txt', { type: 'text/plain' })
          ]
        }
      })
      await screen.findByRole('row', { name: /a\.txt/ })
      await enterMultiSelectMode()

      fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
      fireEvent.click(screen.getByRole('button', { name: 'Create Group' }))
      await waitFor(() => {
        expect(getGroupHeaders()).toHaveLength(1)
      })

      fireEvent.click(within(getGroupHeaders()[0]).getByRole('button', { name: 'Convert Group' }))
      await waitFor(() => {
        expect(screen.getByText('Converting...')).toBeInTheDocument()
      })

      const groupHeader = getGroupHeaders()[0]
      expect(within(groupHeader).getByRole('combobox', { name: 'Target' })).toBeDisabled()
      expect(within(groupHeader).getByRole('button', { name: 'Group settings' })).toBeDisabled()
      expect(within(groupHeader).getByRole('button', { name: 'Convert Group' })).toBeDisabled()

      resolveConversion?.(createBridgeResult())
    })
  })
})
