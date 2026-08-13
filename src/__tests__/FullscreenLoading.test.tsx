import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import FullscreenLoading from '../components/FullscreenLoading'

describe('FullscreenLoading', () => {
  it('renders nothing when not visible', () => {
    const { container } = render(<FullscreenLoading label="Loading" visible={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders overlay with spinner and label when visible', () => {
    render(<FullscreenLoading label="Converting..." visible />)

    const overlay = screen.getByRole('status')
    expect(overlay).toBeInTheDocument()
    expect(overlay).toHaveAttribute('aria-live', 'polite')
    expect(overlay).toHaveClass('fullscreen-loading')

    expect(screen.getByText('Converting...')).toBeInTheDocument()

    const spinner = overlay.querySelector('.fullscreen-loading__spinner')
    expect(spinner).toBeInTheDocument()
    expect(spinner).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders the provided label text', () => {
    render(<FullscreenLoading label="Preparing download..." visible />)
    expect(screen.getByText('Preparing download...')).toBeInTheDocument()
  })
})
