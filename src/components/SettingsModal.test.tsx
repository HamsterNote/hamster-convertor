import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import SettingsModal, { getSettingsSections } from './SettingsModal'

describe('SettingsModal', () => {
  const onCancel = vi.fn()
  const onConfirm = vi.fn()
  const onOpenPdfPageSelector = vi.fn()

  const defaultProps = {
    open: true,
    source: 'pdf' as const,
    target: 'html' as const,
    fileName: 'test.pdf',
    status: 'ready' as const,
    readOnly: false,
    onCancel,
    onConfirm,
    onOpenPdfPageSelector
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
    const { queryByRole } = render(<SettingsModal {...defaultProps} open={false} />)
    expect(queryByRole('dialog')).toBeNull()
  })

  it('renders nothing when no sections apply', () => {
    render(<SettingsModal {...defaultProps} source="html" target="pdf" />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders PDF pages section when source is pdf', () => {
    render(<SettingsModal {...defaultProps} />)
    expect(screen.getByText('PDF Pages')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select pages' })).toBeInTheDocument()
  })

  it('renders PDF OCR section when source is pdf and target is pdf', () => {
    render(<SettingsModal {...defaultProps} target="pdf" />)
    expect(screen.getByText('PDF OCR')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'OCR' })).toBeInTheDocument()
  })

  it('does not render PDF OCR section when target is not pdf', () => {
    render(<SettingsModal {...defaultProps} source="pdf" target="html" />)
    expect(screen.queryByText('PDF OCR')).not.toBeInTheDocument()
  })

  it('renders HTML options section when target is html', () => {
    render(<SettingsModal {...defaultProps} target="html" />)
    expect(screen.getByText('HTML Options')).toBeInTheDocument()
    expect(screen.getByText('Background options')).toBeInTheDocument()
  })

  it('renders image target options when target is png', () => {
    render(<SettingsModal {...defaultProps} source="image" target="png" />)
    expect(screen.getByText('Image Options')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Max width' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Max height' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Keep aspect ratio' })).toBeInTheDocument()
  })

  it('does not show quality for PNG target', () => {
    render(<SettingsModal {...defaultProps} source="image" target="png" />)
    expect(screen.queryByRole('slider', { name: 'Quality' })).not.toBeInTheDocument()
    expect(screen.queryByText('Quality')).not.toBeInTheDocument()
  })

  it('shows quality for JPG target', () => {
    render(<SettingsModal {...defaultProps} source="image" target="jpg" />)
    expect(screen.getByText('Quality')).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Quality' })).toBeInTheDocument()
  })

  it('shows quality for WebP target', () => {
    render(<SettingsModal {...defaultProps} source="image" target="webp" />)
    expect(screen.getByText('Quality')).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Quality' })).toBeInTheDocument()
  })

  it('renders image-to-PDF options when source is image and target is pdf', () => {
    render(<SettingsModal {...defaultProps} source="image" target="pdf" />)
    expect(screen.getByText('Image to PDF Options')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Margin (pt)' })).toBeInTheDocument()
  })

  it('calls onOpenPdfPageSelector when select pages button is clicked', () => {
    render(<SettingsModal {...defaultProps} source="pdf" target="html" />)
    fireEvent.click(screen.getByRole('button', { name: 'Select pages' }))
    expect(onOpenPdfPageSelector).toHaveBeenCalledTimes(1)
  })

  it('when readOnly=true, all inputs are disabled and only Done button visible', () => {
    render(<SettingsModal {...defaultProps} readOnly />)

    // Title should show read-only variant
    expect(screen.getByText('Settings (read-only)')).toBeInTheDocument()

    // All interactive elements should be disabled
    const textboxes = screen.queryAllByRole('textbox')
    textboxes.forEach(input => {
      expect(input).toBeDisabled()
    })

    const spinbuttons = screen.queryAllByRole('spinbutton')
    spinbuttons.forEach(input => {
      expect(input).toBeDisabled()
    })

    const checkboxes = screen.queryAllByRole('checkbox')
    checkboxes.forEach(checkbox => {
      expect(checkbox).toBeDisabled()
    })

    const radios = screen.queryAllByRole('radio')
    radios.forEach(radio => {
      expect(radio).toBeDisabled()
    })

    const selects = screen.queryAllByRole('combobox')
    selects.forEach(select => {
      expect(select).toBeDisabled()
    })

    const sliders = screen.queryAllByRole('slider')
    sliders.forEach(slider => {
      expect(slider).toBeDisabled()
    })

    // Only Done button should be present, no Cancel
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()

    // Select pages button should be hidden in read-only mode
    expect(screen.queryByRole('button', { name: 'Select pages' })).not.toBeInTheDocument()
  })

  it('renders multiple sections in two-column layout', () => {
    render(<SettingsModal {...defaultProps} source="pdf" target="html" />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    // When multiple sections, body should have columns class
    const body = dialog.querySelector('.settings-modal__body--columns')
    expect(body).toBeInTheDocument()
  })

  it('clicking Cancel button calls onCancel', () => {
    render(<SettingsModal {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('clicking Done button calls onConfirm with current options', () => {
    render(<SettingsModal {...defaultProps} source="image" target="jpg" />)
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('pressing ESC key calls onCancel', () => {
    render(<SettingsModal {...defaultProps} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('shows selected pages count when pages are selected', () => {
    const options = {
      pdf: {
        ocr: false,
        selectedPages: [1, 2, 3]
      }
    }
    render(<SettingsModal {...defaultProps} source="pdf" options={options} />)
    expect(screen.getByText('3 pages selected')).toBeInTheDocument()
  })
})

describe('getSettingsSections', () => {
  it('returns empty array when no sections apply', () => {
    const sections = getSettingsSections('html', 'pdf', 'test.html', 'ready')
    expect(sections).toEqual([])
  })

  it('returns single section for pdf source with html target', () => {
    const sections = getSettingsSections('pdf', 'html', 'test.pdf', 'ready')
    expect(sections).toContain('pdfPages')
    expect(sections).toContain('htmlOptions')
    expect(sections).not.toContain('pdfOcr')
    expect(sections).not.toContain('imageTarget')
    expect(sections).not.toContain('imageToPdf')
  })

  it('returns pdfOcr when source is pdf and target is pdf', () => {
    const sections = getSettingsSections('pdf', 'pdf', 'test.pdf', 'ready')
    expect(sections).toContain('pdfOcr')
    expect(sections).toContain('pdfPages')
  })

  it('returns imageTarget for png target', () => {
    const sections = getSettingsSections('image', 'png', 'test.png', 'ready')
    expect(sections).toEqual(['imageTarget'])
  })

  it('returns imageTarget for jpg target', () => {
    const sections = getSettingsSections('image', 'jpg', 'test.jpg', 'ready')
    expect(sections).toEqual(['imageTarget'])
  })

  it('returns imageTarget for webp target', () => {
    const sections = getSettingsSections('image', 'webp', 'test.webp', 'ready')
    expect(sections).toEqual(['imageTarget'])
  })

  it('returns imageToPdf when source is image and target is pdf', () => {
    const sections = getSettingsSections('image', 'pdf', 'test.png', 'ready')
    expect(sections).toEqual(['imageToPdf'])
  })

  it('returns multiple sections for complex conversion', () => {
    const sections = getSettingsSections('pdf', 'png', 'test.pdf', 'ready')
    expect(sections).toContain('pdfPages')
    expect(sections).toContain('imageTarget')
  })
})
