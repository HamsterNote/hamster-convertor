import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { ParserIframeBridge, type ParserIframeBridgeRef } from '../components/ParserIframeBridge'
import { createRef } from 'react'

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
    port2._handlers.forEach(h => h(new MessageEvent('message', { data })))
  }
  port2.postMessage = (data: unknown) => {
    port1._handlers.forEach(h => h(new MessageEvent('message', { data })))
  }

  return { port1, port2 }
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

  it('rejects convert when bridge not ready', async () => {
    const ref = createRef<ParserIframeBridgeRef>()
    render(<ParserIframeBridge ref={ref} />)
    const request = makeConvertRequest('req-001')
    await expect(ref.current!.convert(request)).rejects.toThrow('Bridge not ready')
  })

  it('completes ready handshake and makes convert available', async () => {
    const ref = createRef<ParserIframeBridgeRef>()
    render(<ParserIframeBridge ref={ref} />)

    const iframe = document.querySelector('iframe')
    simulateReady(iframe)

    const request = makeConvertRequest('req-handshake')
    const convertPromise = ref.current!.convert(request)

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
    expect(result.filename).toBe('test.html')
  })

  it('convert sends request through MessagePort', async () => {
    const ref = createRef<ParserIframeBridgeRef>()
    render(<ParserIframeBridge ref={ref} />)

    const iframe = document.querySelector('iframe')
    simulateReady(iframe)

    const postMessageSpy = vi.spyOn(mockChannel.port1, 'postMessage')

    const request = makeConvertRequest('req-port')
    const convertPromise = ref.current!.convert(request)

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
    const convertPromise = ref.current!.convert(request)

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

    const progress = ref.current!.getProgress()
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
    const convertPromise = ref.current!.convert(request)

    await ref.current!.cancel('req-cancel')

    await expect(convertPromise).rejects.toThrow('cancelled')
  })

  it('unmount rejects pending with BRIDGE_DISPOSED and cleans up listeners', async () => {
    const ref = createRef<ParserIframeBridgeRef>()
    const { unmount } = render(<ParserIframeBridge ref={ref} />)

    const iframe = document.querySelector('iframe')
    simulateReady(iframe)

    const request = makeConvertRequest('req-unmount')
    const convertPromise = ref.current!.convert(request)

    const closeSpy = vi.spyOn(mockChannel.port1, 'close')

    unmount()

    await expect(convertPromise).rejects.toThrow('Bridge disposed')
    expect(closeSpy).toHaveBeenCalled()
    expect(mockChannel.port1._handlers.size).toBe(0)

    closeSpy.mockRestore()
  })
})
