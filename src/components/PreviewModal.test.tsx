import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import PreviewModal from './PreviewModal'
import type { ConversionResult } from '../lib/converter'

let mockUrlCounter = 0
const mockCreateObjectURL = vi.fn(() => {
  mockUrlCounter += 1
  return `blob:mock-url-${mockUrlCounter}`
})
const mockRevokeObjectURL = vi.fn()

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
})

const revokeObjectURLSpy = mockRevokeObjectURL
const createObjectURLSpy = mockCreateObjectURL

function makeResult(filename: string, mimeType = 'text/html'): ConversionResult {
  return {
    blob: new Blob(['<p>hello</p>'], { type: mimeType }),
    filename,
    mimeType,
    targetFormat: 'html'
  }
}

describe('PreviewModal', () => {
  const onClose = vi.fn()

  beforeEach(async () => {
    vi.clearAllMocks()
    revokeObjectURLSpy.mockClear()
    createObjectURLSpy.mockClear()
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

    // Iframe present with empty sandbox
    const iframe = document.querySelector('iframe')
    expect(iframe).not.toBeNull()
    expect(iframe!.hasAttribute('sandbox')).toBe(true)
    expect(iframe!.getAttribute('sandbox')).toBe('')

    // Loading spinner initially visible (iframe hidden)
    expect(iframe!.style.display).toBe('none')
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
    expect(iframe).not.toBeNull()

    // Simulate iframe load
    fireEvent.load(iframe!)

    // After load, iframe should be visible
    expect(iframe!.style.display).toBe('block')

    // Spinner should be hidden
    const spinner = document.querySelector('.preview-modal__spinner')
    expect(spinner).toBeNull()
  })

  it('PDF fallback: hides spinner after timeout even if onLoad never fires', () => {
    vi.useFakeTimers()
    render(
      <PreviewModal open results={[makeResult('a.pdf', 'application/pdf')]} onClose={onClose} />
    )

    const iframe = document.querySelector('iframe')
    expect(iframe).not.toBeNull()
    expect(iframe!.style.display).toBe('none')

    // Spinner visible before timeout
    expect(document.querySelector('.preview-modal__spinner')).not.toBeNull()

    // Advance past the 800ms fallback timeout
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // Iframe should now be visible
    expect(iframe!.style.display).toBe('block')

    // Spinner should be hidden
    expect(document.querySelector('.preview-modal__spinner')).toBeNull()

    vi.useRealTimers()
  })
})
