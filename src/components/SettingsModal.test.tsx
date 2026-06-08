import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import SettingsModal, { getSettingsSections } from './SettingsModal'

vi.mock('../hooks/usePdfPageList', () => ({
  usePdfPageList: vi.fn(() => ({
    pageShells: [
      { pageNumber: 1, thumbnailUrl: null, status: 'loaded' },
      { pageNumber: 2, thumbnailUrl: null, status: 'loaded' }
    ],
    loading: false,
    error: null,
    gridRef: { current: null }
  }))
}))

const mockFile = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' })

describe('SettingsModal', () => {
  const onCancel = vi.fn()
  const onConfirm = vi.fn()

  const defaultProps = {
    open: true,
    source: 'pdf' as const,
    target: 'html' as const,
    fileName: 'test.pdf',
    file: mockFile,
    status: 'ready' as const,
    readOnly: false,
    onCancel,
    onConfirm
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

  it('renders PDF pages section with inline selector when source is pdf', () => {
    render(<SettingsModal {...defaultProps} />)
    expect(screen.getByText('PDF Pages')).toBeInTheDocument()
    const stickyHeader = screen
      .getByText('PDF Pages')
      .closest('.pdf-page-selector-inline__sticky-header')
    expect(stickyHeader).toBeInTheDocument()
    expect(within(stickyHeader as HTMLElement).getByText('0 pages selected')).toBeInTheDocument()
    // Inline selector renders page cards
    expect(screen.getByRole('button', { name: 'Page 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Page 2' })).toBeInTheDocument()
    // Select all / deselect all controls
    expect(screen.getByRole('button', { name: 'Select all' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Deselect all' })).toBeInTheDocument()
    // Collapse button (PDF page selector has its own collapse button)
    const collapseButtons = screen.getAllByRole('button', { name: /collapse|expand/i })
    expect(collapseButtons.length).toBeGreaterThan(0)
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

  it('toggles PDF page selection via inline selector', () => {
    render(<SettingsModal {...defaultProps} source="pdf" target="html" />)
    const page1Btn = screen.getByRole('button', { name: 'Page 1' })
    expect(page1Btn).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(page1Btn)
    expect(page1Btn).toHaveAttribute('aria-pressed', 'true')
  })

  it('select all button is disabled when all pages are selected', () => {
    render(<SettingsModal {...defaultProps} source="pdf" target="html" />)
    const selectAllBtn = screen.getByRole('button', { name: 'Select all' })
    expect(selectAllBtn).not.toBeDisabled()
    fireEvent.click(selectAllBtn)
    expect(selectAllBtn).toBeDisabled()
  })

  it('deselect all button is disabled when no pages are selected', () => {
    render(<SettingsModal {...defaultProps} source="pdf" target="html" />)
    const deselectAllBtn = screen.getByRole('button', { name: 'Deselect all' })
    expect(deselectAllBtn).toBeDisabled()
  })

  it('collapses and expands inline PDF selector', () => {
    render(<SettingsModal {...defaultProps} source="pdf" target="html" />)
    const collapseButtons = screen.getAllByRole('button', { name: 'Collapse' })
    const pdfCollapseBtn = collapseButtons.find(btn =>
      btn.classList.contains('pdf-page-selector-inline__collapse-btn')
    )
    expect(pdfCollapseBtn).toBeDefined()
    fireEvent.click(pdfCollapseBtn!)
    expect(screen.queryByRole('button', { name: 'Page 1' })).not.toBeInTheDocument()
    const expandButtons = screen.getAllByRole('button', { name: 'Expand' })
    const pdfExpandBtn = expandButtons.find(btn =>
      btn.classList.contains('pdf-page-selector-inline__collapse-btn')
    )
    expect(pdfExpandBtn).toBeDefined()
    fireEvent.click(pdfExpandBtn!)
    expect(screen.getByRole('button', { name: 'Page 1' })).toBeInTheDocument()
  })

  it('persists image-to-PDF rotation and scale when confirmed and reopened', () => {
    const { rerender } = render(<SettingsModal {...defaultProps} source="image" target="pdf" />)

    fireEvent.change(screen.getByLabelText('Rotation'), { target: { value: '90' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Scale (%)' }), {
      target: { value: '150' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    const confirmedOptions = onConfirm.mock.calls[0]?.[0]
    expect(confirmedOptions).toEqual(
      expect.objectContaining({
        imageToPdf: expect.objectContaining({
          rotationDeg: 90,
          scalePercent: 150
        })
      })
    )

    rerender(
      <SettingsModal {...defaultProps} source="image" target="pdf" options={confirmedOptions} />
    )

    expect(screen.getByLabelText('Rotation')).toHaveValue('90')
    expect(screen.getByRole('spinbutton', { name: 'Scale (%)' })).toHaveValue(150)
  })

  it('shows and hides EXIF category list with removeExif checkbox', () => {
    render(<SettingsModal {...defaultProps} source="image" target="jpg" />)

    expect(screen.queryByText('EXIF categories')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Remove EXIF metadata' }))
    expect(screen.getByText('EXIF categories')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'All metadata' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Remove EXIF metadata' }))
    expect(screen.queryByText('EXIF categories')).not.toBeInTheDocument()
  })

  it('keeps EXIF all category mutually exclusive with subcategories', () => {
    render(<SettingsModal {...defaultProps} source="image" target="jpg" />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Remove EXIF metadata' }))
    const allMetadata = screen.getByRole('checkbox', { name: 'All metadata' })
    const geolocation = screen.getByRole('checkbox', { name: 'Geolocation' })

    fireEvent.click(allMetadata)
    expect(allMetadata).toBeChecked()
    expect(geolocation).not.toBeChecked()

    fireEvent.click(geolocation)
    expect(allMetadata).not.toBeChecked()
    expect(geolocation).toBeChecked()

    fireEvent.click(allMetadata)
    expect(allMetadata).toBeChecked()
    expect(geolocation).not.toBeChecked()
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

    // PDF page cards should be disabled in read-only mode
    const pageCards = screen.queryAllByRole('button', { name: /Page \d+/ })
    pageCards.forEach(card => {
      expect(card).toBeDisabled()
    })

    // Only Done button should be present, no Cancel
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
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

  it('returns image max dimensions as positive integer options', () => {
    render(<SettingsModal {...defaultProps} source="image" target="png" />)
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Max width' }), {
      target: { value: '200.8' }
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Max height' }), {
      target: { value: '120' }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        image: expect.objectContaining({
          maxWidth: 200,
          maxHeight: 120,
          keepAspectRatio: true
        })
      })
    )
  })

  it('returns selected EXIF categories only when removeExif is enabled', () => {
    render(<SettingsModal {...defaultProps} source="image" target="jpg" />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Remove EXIF metadata' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Camera and lens' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Date and time' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        image: expect.objectContaining({
          removeExif: {
            enabled: true,
            categories: ['camera', 'datetime']
          }
        })
      })
    )
  })

  it('pressing ESC key calls onCancel', () => {
    render(<SettingsModal {...defaultProps} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('collapses and expands HTML Options section by clicking the section header row', () => {
    render(<SettingsModal {...defaultProps} source="pdf" target="html" />)
    expect(screen.getByText('Background options')).toBeInTheDocument()

    // Click the header div itself, NOT the inner collapse button
    const sectionHeaders = document.querySelectorAll('.settings-modal__section-header')
    const htmlOptionsHeader = Array.from(sectionHeaders).find(header =>
      header.textContent?.includes('HTML Options')
    )
    expect(htmlOptionsHeader).toBeDefined()

    fireEvent.click(htmlOptionsHeader!)
    expect(screen.queryByText('Background options')).not.toBeInTheDocument()

    fireEvent.click(htmlOptionsHeader!)
    expect(screen.getByText('Background options')).toBeInTheDocument()
  })

  it('shows selected pages count in inline selector header', () => {
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
