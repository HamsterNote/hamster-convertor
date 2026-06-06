import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { ParserIframeBridge, type ParserIframeBridgeRef } from '../components/ParserIframeBridge'
import { createRef } from 'react'

describe('ParserIframeBridge load timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('times out with IFRAME_LOAD_TIMEOUT for invalid URL', async () => {
    const ref = createRef<ParserIframeBridgeRef>()
    render(
      <ParserIframeBridge ref={ref} src="/__missing-parser-runtime__/index.html" timeout={1000} />
    )

    vi.advanceTimersByTime(1500)

    const request = {
      requestId: 'req-001',
      type: 'convert' as const,
      filename: 'test.pdf',
      sourceFormat: 'pdf',
      targetFormat: 'html',
      buffer: new ArrayBuffer(8)
    }

    await expect(ref.current!.convert(request)).rejects.toMatchObject({
      code: 'IFRAME_LOAD_TIMEOUT'
    })
  })
})
