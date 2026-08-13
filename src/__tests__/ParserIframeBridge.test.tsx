import { cleanup, render } from '@testing-library/react'
import { createRef, type RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ParserIframeBridge, type ParserIframeBridgeRef } from '../components/ParserIframeBridge'

type MockPort = {
  postMessage: (data: unknown) => void
  addEventListener: (type: string, handler: (event: MessageEvent) => void) => void
  removeEventListener: (type: string, handler: (event: MessageEvent) => void) => void
  start: () => void
  close: () => void
  _handlers: Set<(event: MessageEvent) => void>
}

function createMockPort(): MockPort {
  const handlers = new Set<(event: MessageEvent) => void>()
  return {
    postMessage: () => {},
    addEventListener: (type, handler) => {
      if (type === 'message') handlers.add(handler)
    },
    removeEventListener: (type, handler) => {
      if (type === 'message') handlers.delete(handler)
    },
    start: () => {},
    close: () => {
      handlers.clear()
    },
    _handlers: handlers
  }
}

function createMockMessageChannel() {
  const port1 = createMockPort()
  const port2 = createMockPort()

  port1.postMessage = (data: unknown) => {
    port2._handlers.forEach(handler => {
      handler(new MessageEvent('message', { data }))
    })
  }
  port2.postMessage = (data: unknown) => {
    port1._handlers.forEach(handler => {
      handler(new MessageEvent('message', { data }))
    })
  }

  return { port1, port2 }
}

const getBridge = (ref: RefObject<ParserIframeBridgeRef | null>): ParserIframeBridgeRef => {
  const bridge = ref.current
  if (!bridge) {
    throw new Error('Parser iframe bridge ref was not initialized')
  }
  return bridge
}

describe('ParserIframeBridge', () => {
  let originalMessageChannel: typeof MessageChannel
  let mockChannel: { port1: MockPort; port2: MockPort }

  beforeEach(() => {
    vi.useFakeTimers()
    originalMessageChannel = globalThis.MessageChannel
    mockChannel = createMockMessageChannel()
    globalThis.MessageChannel = vi.fn(() => mockChannel) as unknown as typeof MessageChannel
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    globalThis.MessageChannel = originalMessageChannel
  })

  const simulateReady = (iframe: HTMLIFrameElement | null) => {
    const contentWindow = iframe?.contentWindow ?? { postMessage: vi.fn() }
    const event = new MessageEvent('message', {
      data: { type: 'ready', source: 'hamster-parser-runtime' }
    })
    Object.defineProperty(event, 'source', {
      value: contentWindow,
      configurable: true
    })
    window.dispatchEvent(event)
  }

  const makeConvertRequest = (requestId: string) => ({
    requestId,
    type: 'convert' as const,
    filename: 'test.pdf',
    sourceFormat: 'pdf',
    targetFormat: 'html',
    buffer: new ArrayBuffer(8)
  })

  it('renders iframe with correct attributes', () => {
    render(<ParserIframeBridge />)
    const iframe = document.querySelector('iframe')
    expect(iframe).toBeTruthy()
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin')
    expect(iframe?.hasAttribute('hidden')).toBe(true)
  })

  it('exposes convert, getProgress, and cancel via ref', () => {
    const ref = createRef<ParserIframeBridgeRef>()
    render(<ParserIframeBridge ref={ref} />)
    expect(ref.current).toBeTruthy()
    expect(typeof ref.current?.convert).toBe('function')
    expect(typeof ref.current?.getProgress).toBe('function')
    expect(typeof ref.current?.cancel).toBe('function')
  })

  it('waits for the bridge handshake before converting', async () => {
    const ref = createRef<ParserIframeBridgeRef>()
    render(<ParserIframeBridge ref={ref} />)

    const bridge = getBridge(ref)

    const postMessageSpy = vi.spyOn(mockChannel.port1, 'postMessage')
    const request = makeConvertRequest('req-001')
    const settlement = bridge.convert(request).then(
      result => ({ kind: 'result' as const, result }),
      (error: unknown) => ({ kind: 'error' as const, error })
    )

    expect(postMessageSpy).not.toHaveBeenCalled()

    const iframe = document.querySelector('iframe')
    simulateReady(iframe)
    await Promise.resolve()

    expect(postMessageSpy).toHaveBeenCalledWith(request)

    mockChannel.port2.postMessage({
      requestId: 'req-001',
      type: 'convert:result',
      payload: {
        filename: 'test.html',
        mimeType: 'text/html',
        targetFormat: 'html',
        buffer: new ArrayBuffer(4)
      }
    })

    const settled = await settlement
    if (settled.kind === 'error') {
      throw settled.error
    }
    expect(Array.isArray(settled.result)).toBe(false)
  })

  it('completes ready handshake and makes convert available', async () => {
    const ref = createRef<ParserIframeBridgeRef>()
    render(<ParserIframeBridge ref={ref} />)

    const iframe = document.querySelector('iframe')
    simulateReady(iframe)

    const request = makeConvertRequest('req-handshake')
    const convertPromise = getBridge(ref).convert(request)

    mockChannel.port2.postMessage({
      requestId: 'req-handshake',
      type: 'convert:result',
      payload: {
        filename: 'test.html',
        mimeType: 'text/html',
        targetFormat: 'html',
        buffer: new ArrayBuffer(4)
      }
    })

    const result = await convertPromise
    if (Array.isArray(result)) {
      throw new Error('Expected one conversion result')
    }
    expect(result.filename).toBe('test.html')
  })

  it('convert sends request through MessagePort', async () => {
    const ref = createRef<ParserIframeBridgeRef>()
    render(<ParserIframeBridge ref={ref} />)

    const iframe = document.querySelector('iframe')
    simulateReady(iframe)

    const postMessageSpy = vi.spyOn(mockChannel.port1, 'postMessage')

    const request = makeConvertRequest('req-port')
    const convertPromise = getBridge(ref).convert(request)

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-port',
        type: 'convert',
        filename: 'test.pdf'
      })
    )

    mockChannel.port2.postMessage({
      requestId: 'req-port',
      type: 'convert:result',
      payload: {
        filename: 'test.html',
        mimeType: 'text/html',
        targetFormat: 'html',
        buffer: new ArrayBuffer(4)
      }
    })

    await convertPromise
    postMessageSpy.mockRestore()
  })

  it('progress updates are reflected by getProgress', async () => {
    const ref = createRef<ParserIframeBridgeRef>()
    render(<ParserIframeBridge ref={ref} />)

    const iframe = document.querySelector('iframe')
    simulateReady(iframe)

    const request = makeConvertRequest('req-progress')
    const bridge = getBridge(ref)
    const convertPromise = bridge.convert(request)

    mockChannel.port2.postMessage({
      requestId: 'req-progress',
      type: 'progress',
      progress: {
        requestId: 'req-progress',
        phase: 'reading',
        percent: 25,
        queueLength: 1
      }
    })

    const progress = bridge.getProgress()
    expect(progress).not.toBeNull()
    expect(progress?.phase).toBe('reading')
    expect(progress?.percent).toBe(25)

    mockChannel.port2.postMessage({
      requestId: 'req-progress',
      type: 'convert:result',
      payload: {
        filename: 'test.html',
        mimeType: 'text/html',
        targetFormat: 'html',
        buffer: new ArrayBuffer(4)
      }
    })

    await convertPromise
  })

  it('cancel rejects pending conversion', async () => {
    const ref = createRef<ParserIframeBridgeRef>()
    render(<ParserIframeBridge ref={ref} />)

    const iframe = document.querySelector('iframe')
    simulateReady(iframe)

    const request = makeConvertRequest('req-cancel')
    const bridge = getBridge(ref)
    const convertPromise = bridge.convert(request)

    await bridge.cancel('req-cancel')

    await expect(convertPromise).rejects.toThrow('cancelled')
  })

  it('cancels a conversion queued before the bridge handshake', async () => {
    const ref = createRef<ParserIframeBridgeRef>()
    render(<ParserIframeBridge ref={ref} />)

    const bridge = getBridge(ref)
    const request = makeConvertRequest('req-loading-cancel')
    const convertPromise = bridge.convert(request)
    const postMessageSpy = vi.spyOn(mockChannel.port1, 'postMessage')

    await bridge.cancel(request.requestId)
    await expect(convertPromise).rejects.toThrow('cancelled')

    simulateReady(document.querySelector('iframe'))
    await Promise.resolve()

    expect(postMessageSpy).not.toHaveBeenCalledWith(request)
  })

  it('rejects conversions requested through a stale handle after unmount', async () => {
    const ref = createRef<ParserIframeBridgeRef>()
    const { unmount } = render(<ParserIframeBridge ref={ref} />)
    const bridge = getBridge(ref)

    unmount()

    await expect(bridge.convert(makeConvertRequest('req-after-unmount'))).rejects.toMatchObject({
      code: 'BRIDGE_DISPOSED'
    })
  })

  it('unmount rejects pending with BRIDGE_DISPOSED and cleans up listeners', async () => {
    const ref = createRef<ParserIframeBridgeRef>()
    const { unmount } = render(<ParserIframeBridge ref={ref} />)

    const iframe = document.querySelector('iframe')
    simulateReady(iframe)

    const request = makeConvertRequest('req-unmount')
    const convertPromise = getBridge(ref).convert(request)

    const closeSpy = vi.spyOn(mockChannel.port1, 'close')

    unmount()

    await expect(convertPromise).rejects.toThrow('Bridge disposed')
    expect(closeSpy).toHaveBeenCalled()
    expect(mockChannel.port1._handlers.size).toBe(0)

    closeSpy.mockRestore()
  })
})
