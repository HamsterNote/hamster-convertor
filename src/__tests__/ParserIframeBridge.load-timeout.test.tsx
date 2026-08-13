import { render } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ParserIframeBridge, type ParserIframeBridgeRef } from '../components/ParserIframeBridge'

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

    const request = {
      requestId: 'req-001',
      type: 'convert' as const,
      filename: 'test.pdf',
      sourceFormat: 'pdf',
      targetFormat: 'html',
      buffer: new ArrayBuffer(8)
    }

    const bridge = ref.current
    if (!bridge) {
      throw new Error('Parser iframe bridge ref was not initialized')
    }
    const convertPromise = bridge.convert(request)

    vi.advanceTimersByTime(1500)

    await expect(convertPromise).rejects.toMatchObject({
      code: 'IFRAME_LOAD_TIMEOUT'
    })
  })
})
