import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '../i18n'
import App from '../App'

describe('app upload feedback', () => {
  beforeEach(() => {
    window.localStorage.setItem('i18nextLng', 'en')
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
})
