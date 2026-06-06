import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import HtmlOptionsModal from './HtmlOptionsModal'

describe('HtmlOptionsModal', () => {
  const onCancel = vi.fn()
  const onConfirm = vi.fn()

  const defaultOptions = {
    background: {
      includeBackground: true,
      backgroundQuality: 0.85,
      excludeTextFromBackground: true
    },
    htmlLayout: {
      mode: 'paginated' as const,
      widthMode: 'actual' as const
    }
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    window.localStorage.setItem('i18nextLng', 'en')
    await i18n.changeLanguage('en')
  })

  afterEach(() => {
    cleanup()
  })

  it('renders nothing when open=false', () => {
    const { queryByRole } = render(
      <HtmlOptionsModal
        open={false}
        options={defaultOptions}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    )
    expect(queryByRole('dialog')).toBeNull()
  })

  it('renders title HTML conversion options when editable', () => {
    render(
      <HtmlOptionsModal open options={defaultOptions} onCancel={onCancel} onConfirm={onConfirm} />
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText('HTML conversion options')).toBeInTheDocument()
  })

  it('renders all three sections', () => {
    render(
      <HtmlOptionsModal open options={defaultOptions} onCancel={onCancel} onConfirm={onConfirm} />
    )
    expect(screen.getByText('Background options')).toBeInTheDocument()
    expect(screen.getByText('Text controls')).toBeInTheDocument()
    expect(screen.getByText('Layout options')).toBeInTheDocument()
  })

  it('when readOnly=true, all inputs are disabled and no Cancel button visible', () => {
    render(
      <HtmlOptionsModal
        open
        options={defaultOptions}
        readOnly
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    )

    // Title should show read-only variant
    expect(screen.getByText('HTML conversion options (read-only)')).toBeInTheDocument()

    // All textboxes/inputs should be disabled
    const textboxes = screen.getAllByRole('textbox')
    textboxes.forEach(input => {
      expect(input).toBeDisabled()
    })

    const spinbuttons = screen.queryAllByRole('spinbutton')
    spinbuttons.forEach(input => {
      expect(input).toBeDisabled()
    })

    const checkboxes = screen.getAllByRole('checkbox')
    checkboxes.forEach(checkbox => {
      expect(checkbox).toBeDisabled()
    })

    const radios = screen.getAllByRole('radio')
    radios.forEach(radio => {
      expect(radio).toBeDisabled()
    })

    const comboboxes = screen.getAllByRole('combobox')
    comboboxes.forEach(select => {
      expect(select).toBeDisabled()
    })

    // Only Done button should be present, no Cancel
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('editing a field then clicking Confirm calls onConfirm with modified options', () => {
    render(
      <HtmlOptionsModal open options={defaultOptions} onCancel={onCancel} onConfirm={onConfirm} />
    )

    // Change font size
    const fontSizeInput = screen.getByRole('spinbutton', { name: /font size/i })
    fireEvent.change(fontSizeInput, { target: { value: '16' } })

    // Change layout to continuous
    const continuousRadio = screen.getByRole('radio', { name: 'Continuous' })
    fireEvent.click(continuousRadio)

    // Click confirm
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    const call = onConfirm.mock.calls[0]
    if (!call) throw new Error('Expected onConfirm to be called')
    const result = call[0]
    expect(result.textControl).toEqual({ fontSize: 16 })
    expect(result.background).toEqual(defaultOptions.background)
    expect(result.htmlLayout).toEqual({ mode: 'continuous', widthMode: 'actual' })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('clicking Cancel button calls onCancel', () => {
    render(
      <HtmlOptionsModal open options={defaultOptions} onCancel={onCancel} onConfirm={onConfirm} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('pressing ESC key calls onCancel', () => {
    render(
      <HtmlOptionsModal open options={defaultOptions} onCancel={onCancel} onConfirm={onConfirm} />
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
