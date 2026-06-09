import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import type { ConversionResult } from '../lib/converter'
import { loadPdfDocument } from '../lib/pdf-utils'
import PreviewModal from './PreviewModal'

vi.mock('../lib/pdf-utils', () => ({
  loadPdfDocument: vi.fn()
}))

let mockUrlCounter = 0
const mockCreateObjectURL = vi.fn(() => {
  mockUrlCounter += 1
  return `blob:mock-url-${mockUrlCounter}`
})
const mockRevokeObjectURL = vi.fn()
const mockGetContext = vi.fn(() => ({}) as CanvasRenderingContext2D)

beforeAll(() => {
  Object.defineProperty(globalThis.URL, 'createObjectURL', {
    value: mockCreateObjectURL,
    writable: true,
    configurable: true
  })
  Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
    value: mockRevokeObjectURL,
    writable: true,
    configurable: true
  })
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: mockGetContext,
    writable: true,
    configurable: true
  })
})

const revokeObjectURLSpy = mockRevokeObjectURL
const createObjectURLSpy = mockCreateObjectURL
const loadPdfDocumentMock = vi.mocked(loadPdfDocument)

function makeResult(
  filename: string,
  mimeType = 'text/html',
  targetFormat: ConversionResult['targetFormat'] = 'html'
): ConversionResult {
  const blob = new Blob(['<p>hello</p>'], { type: mimeType })
  Object.defineProperty(blob, 'arrayBuffer', {
    value: vi.fn(async () => new ArrayBuffer(8)),
    configurable: true
  })

  return {
    blob,
    filename,
    mimeType,
    targetFormat
  }
}

function makeFakePdfDocument() {
  return {
    numPages: 2,
    getPage: vi.fn(async () => ({
      getViewport: vi.fn((_options: { scale: number }) => ({ width: 200, height: 300 })),
      render: vi.fn((_options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => ({
        promise: Promise.resolve(),
        cancel: vi.fn()
      }))
    })),
    cleanup: vi.fn(),
    destroy: vi.fn()
  }
}

describe('PreviewModal', () => {
  const onClose = vi.fn()

  beforeEach(async () => {
    vi.clearAllMocks()
    revokeObjectURLSpy.mockClear()
    createObjectURLSpy.mockClear()
    mockGetContext.mockClear()
    loadPdfDocumentMock.mockResolvedValue(makeFakePdfDocument())
    window.localStorage.setItem('i18nextLng', 'en')
    await i18n.changeLanguage('en')
  })

  afterEach(() => {
    cleanup()
  })

  it('renders nothing when open=false', () => {
    const { queryByRole } = render(
      <PreviewModal open={false} results={[makeResult('a.html')]} onClose={onClose} />
    )
    expect(queryByRole('dialog')).toBeNull()
  })

  it('single result: shows iframe and no tab bar', () => {
    render(<PreviewModal open results={[makeResult('a.html')]} onClose={onClose} />)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()

    // No tab bar
    expect(document.querySelector('.preview-modal__tabs')).toBeNull()

    const content = document.querySelector('.preview-modal__content')
    const iframe = document.querySelector('iframe')
    if (!(content instanceof HTMLElement)) {
      throw new Error('Expected preview content')
    }
    if (!(iframe instanceof HTMLIFrameElement)) {
      throw new Error('Expected iframe preview')
    }
    expect(document.querySelector('.preview-modal__pdf-viewer')).toBeNull()
    expect(content).toContainElement(iframe)
    expect(iframe).toHaveClass('preview-modal__iframe')
    expect(iframe.hasAttribute('sandbox')).toBe(true)
    expect(iframe.getAttribute('sandbox')).toBe('')

    // Loading spinner initially visible (iframe hidden)
    expect(iframe.style.display).toBe('none')
  })

  it('keeps preview document surfaces white in CSS', () => {
    const css = readFileSync('src/styles/global.css', 'utf8')

    expect(css).toMatch(
      /\.preview-modal__content,\s*\.preview-modal__pdf-viewer\s*\{[\s\S]*background:\s*#fff;/
    )
    expect(css).toMatch(/\.preview-modal__iframe\s*\{[\s\S]*background:\s*#fff;/)
  })

  it('multi-result: shows tab bar with result filenames', () => {
    const results = [makeResult('first.html'), makeResult('second.txt', 'text/plain')]
    render(<PreviewModal open results={results} onClose={onClose} />)

    const tabs = document.querySelector('.preview-modal__tabs')
    expect(tabs).not.toBeNull()

    expect(screen.getByRole('tab', { name: 'first.html' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'second.txt' })).toBeInTheDocument()
  })

  it('tab switching revokes previous blob URL and loads next result', () => {
    const results = [makeResult('first.html'), makeResult('second.txt', 'text/plain')]
    render(<PreviewModal open results={results} onClose={onClose} />)

    // First tab should be active by default
    const firstTab = screen.getByRole('tab', { name: 'first.html' })
    expect(firstTab.getAttribute('aria-selected')).toBe('true')

    // Switch to second tab
    const secondTab = screen.getByRole('tab', { name: 'second.txt' })
    fireEvent.click(secondTab)

    // Second tab should be active
    expect(secondTab.getAttribute('aria-selected')).toBe('true')
    expect(firstTab.getAttribute('aria-selected')).toBe('false')

    // URL.revokeObjectURL should have been called for the previous blob URL
    expect(revokeObjectURLSpy).toHaveBeenCalled()
  })

  it('respects initialIndex prop for active tab', () => {
    const results = [makeResult('first.html'), makeResult('second.txt', 'text/plain')]
    render(<PreviewModal open results={results} initialIndex={1} onClose={onClose} />)

    const firstTab = screen.getByRole('tab', { name: 'first.html' })
    const secondTab = screen.getByRole('tab', { name: 'second.txt' })

    expect(firstTab.getAttribute('aria-selected')).toBe('false')
    expect(secondTab.getAttribute('aria-selected')).toBe('true')
  })

  it('pressing Escape calls onClose', () => {
    render(<PreviewModal open results={[makeResult('a.html')]} onClose={onClose} />)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clicking overlay calls onClose, clicking inner modal does not', () => {
    render(<PreviewModal open results={[makeResult('a.html')]} onClose={onClose} />)

    const overlay = document.querySelector('.preview-modal-overlay')
    const inner = document.querySelector('.preview-modal')

    expect(overlay).not.toBeNull()
    expect(inner).not.toBeNull()

    if (inner) {
      fireEvent.click(inner)
      expect(onClose).not.toHaveBeenCalled()
    }

    if (overlay) {
      fireEvent.click(overlay)
      expect(onClose).toHaveBeenCalledTimes(1)
    }
  })

  it('closing modal revokes the active blob URL', () => {
    const { rerender } = render(
      <PreviewModal open results={[makeResult('a.html')]} onClose={onClose} />
    )

    revokeObjectURLSpy.mockClear()

    // Close the modal
    rerender(<PreviewModal open={false} results={[makeResult('a.html')]} onClose={onClose} />)

    expect(revokeObjectURLSpy).toHaveBeenCalled()
  })

  it('iframe loads and hides spinner', () => {
    render(<PreviewModal open results={[makeResult('a.html')]} onClose={onClose} />)

    const iframe = document.querySelector('iframe')
    if (!(iframe instanceof HTMLIFrameElement)) {
      throw new Error('Expected iframe preview')
    }

    // Simulate iframe load
    fireEvent.load(iframe)

    // After load, iframe should be visible
    expect(iframe.style.display).toBe('block')

    // Spinner should be hidden
    const spinner = document.querySelector('.preview-modal__spinner')
    expect(spinner).toBeNull()
  })

  it('PDF result: renders all pages into canvases and skips iframe', async () => {
    render(
      <PreviewModal
        open
        results={[makeResult('a.pdf', 'application/pdf', 'pdf')]}
        onClose={onClose}
      />
    )

    const viewer = document.querySelector('.preview-modal__pdf-viewer')
    if (!(viewer instanceof HTMLElement)) {
      throw new Error('Expected PDF viewer')
    }
    expect(document.querySelector('iframe')).toBeNull()
    expect(document.querySelector('.preview-modal__spinner')).not.toBeNull()

    await waitFor(() => {
      expect(viewer.querySelectorAll('canvas')).toHaveLength(2)
    })

    expect(loadPdfDocumentMock).toHaveBeenCalledTimes(1)
    expect(document.querySelector('iframe')).toBeNull()
    expect(document.querySelector('.preview-modal__spinner')).toBeNull()
  })

  it('PDF load failure: shows a clear error and no iframe', async () => {
    loadPdfDocumentMock.mockRejectedValueOnce(new Error('mock load failed'))

    render(
      <PreviewModal
        open
        results={[makeResult('broken.pdf', 'application/pdf', 'pdf')]}
        onClose={onClose}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Unable to render PDF preview: mock load failed')).toBeVisible()
    })

    expect(document.querySelector('.pdf-modal__error')).not.toBeNull()
    expect(document.querySelector('.preview-modal__pdf-viewer')).toBeNull()
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('switching from PDF to HTML removes PDF viewer and shows iframe', async () => {
    const results = [
      makeResult('first.pdf', 'application/pdf', 'pdf'),
      makeResult('second.html', 'text/html', 'html')
    ]
    render(<PreviewModal open results={results} onClose={onClose} />)

    const viewer = document.querySelector('.preview-modal__pdf-viewer')
    if (!(viewer instanceof HTMLElement)) {
      throw new Error('Expected PDF viewer')
    }

    await waitFor(() => {
      expect(viewer.querySelectorAll('canvas')).toHaveLength(2)
    })

    fireEvent.click(screen.getByRole('tab', { name: 'second.html' }))

    await waitFor(() => {
      expect(document.querySelector('iframe')).not.toBeNull()
    })

    expect(document.querySelector('.preview-modal__pdf-viewer')).toBeNull()
  })
})
