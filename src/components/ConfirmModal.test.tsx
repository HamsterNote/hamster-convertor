import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import i18n from '../i18n'
import { ConfirmModal } from './ConfirmModal'

const renderWithI18n = (ui: React.ReactElement) => {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>)
}

afterEach(() => {
  cleanup()
})

describe('ConfirmModal', () => {
  const baseProps = {
    open: true,
    message: 'Are you sure you want to proceed?',
    onConfirm: vi.fn(),
    onCancel: vi.fn()
  }

  it('renders nothing when open=false', () => {
    const { container } = renderWithI18n(<ConfirmModal {...baseProps} open={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders message text when open=true', () => {
    renderWithI18n(<ConfirmModal {...baseProps} />)
    expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument()
  })

  it('shows default title when title prop is omitted', () => {
    renderWithI18n(<ConfirmModal {...baseProps} />)
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading).toBeInTheDocument()
    expect(heading.textContent).toBeTruthy()
  })

  it('calls onConfirm exactly once when Confirm button is clicked', () => {
    const onConfirm = vi.fn()
    renderWithI18n(<ConfirmModal {...baseProps} onConfirm={onConfirm} />)
    const confirmButton = screen.getByRole('button', { name: /continue/i })
    fireEvent.click(confirmButton)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel exactly once when Cancel button is clicked', () => {
    const onCancel = vi.fn()
    renderWithI18n(<ConfirmModal {...baseProps} onCancel={onCancel} />)
    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    fireEvent.click(cancelButton)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when ESC key is pressed', () => {
    const onCancel = vi.fn()
    renderWithI18n(<ConfirmModal {...baseProps} onCancel={onCancel} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when overlay is clicked but not when inner box is clicked', () => {
    const onCancel = vi.fn()
    renderWithI18n(<ConfirmModal {...baseProps} onCancel={onCancel} />)

    const overlay = document.querySelector('.pdf-modal-overlay')
    const inner = document.querySelector('.pdf-modal')

    expect(overlay).not.toBeNull()
    expect(inner).not.toBeNull()

    if (inner) {
      fireEvent.click(inner)
      expect(onCancel).not.toHaveBeenCalled()
    }

    if (overlay) {
      fireEvent.click(overlay)
      expect(onCancel).toHaveBeenCalledTimes(1)
    }
  })

  it('renders custom confirmLabel and cancelLabel', () => {
    renderWithI18n(
      <ConfirmModal {...baseProps} confirmLabel="Yes, proceed" cancelLabel="No, go back" />
    )
    expect(screen.getByRole('button', { name: 'Yes, proceed' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'No, go back' })).toBeInTheDocument()
  })

  it('applies danger variant class to confirm button', () => {
    renderWithI18n(<ConfirmModal {...baseProps} variant="danger" />)
    const confirmButton = screen.getByRole('button', { name: /continue/i })
    expect(confirmButton).toHaveClass('confirm-modal__confirm--danger')
  })
})
