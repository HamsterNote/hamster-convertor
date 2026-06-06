import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversionTask, ProtocolServer } from '../server'
import { createProtocolServer } from '../server'

const conversionMock = vi.hoisted(() => vi.fn())

vi.mock('../conversion', () => ({
  convertRuntime: conversionMock
}))

type ParserBridgeProgressPhase =
  | 'queued'
  | 'reading'
  | 'encoding'
  | 'decoding'
  | 'rendering'
  | 'packaging'
  | 'completed'
  | 'error'
  | 'cancelled'

type ParserBridgeRequest = {
  requestId: string
  type: 'convert'
  filename: string
  sourceFormat: string
  targetFormat: string
  buffer: ArrayBuffer
}

type ParserBridgeResponse = {
  requestId: string
  type: 'convert:result' | 'convert:error' | 'progress'
  error?: {
    code: string
    message: string
  }
  progress?: {
    phase: ParserBridgeProgressPhase
  }
}

type ReadyMessage = {
  type: 'ready'
}

type PostedMessage = ParserBridgeResponse | ReadyMessage

type MessageListener = (event: MessageEvent<unknown>) => void

class FakeMessagePort {
  readonly messages: PostedMessage[] = []
  private readonly listeners = new Set<MessageListener>()
  started = false
  closed = false

  postMessage(message: unknown) {
    this.messages.push(message as PostedMessage)
  }

  addEventListener(type: 'message', listener: MessageListener) {
    if (type === 'message') {
      this.listeners.add(listener)
    }
  }

  removeEventListener(type: 'message', listener: MessageListener) {
    if (type === 'message') {
      this.listeners.delete(listener)
    }
  }

  start() {
    this.started = true
  }

  close() {
    this.closed = true
    this.listeners.clear()
  }

  dispatch(message: unknown) {
    const event = { data: message } as MessageEvent<unknown>
    for (const listener of this.listeners) {
      listener(event)
    }
  }
}

const createPort = () => new FakeMessagePort()

const createTask = (requestId: string): ConversionTask => ({
  requestId,
  filename: `${requestId}.pdf`,
  sourceFormat: 'pdf',
  targetFormat: 'html',
  buffer: new ArrayBuffer(8),
  status: 'queued'
})

const createRequest = (requestId: string): ParserBridgeRequest => ({
  requestId,
  type: 'convert',
  filename: `${requestId}.pdf`,
  sourceFormat: 'pdf',
  targetFormat: 'html',
  buffer: new ArrayBuffer(8)
})

const isParserBridgeResponse = (message: PostedMessage): message is ParserBridgeResponse =>
  'requestId' in message && ['convert:result', 'convert:error', 'progress'].includes(message.type)

const getResponses = (port: FakeMessagePort) => port.messages.filter(isParserBridgeResponse)

const getResultIds = (port: FakeMessagePort) =>
  getResponses(port)
    .filter(response => response.type === 'convert:result')
    .map(response => response.requestId)

const getError = (port: FakeMessagePort, requestId: string) =>
  getResponses(port).find(
    response => response.requestId === requestId && response.type === 'convert:error'
  )

const getPhases = (port: FakeMessagePort, requestId: string) =>
  getResponses(port)
    .filter(response => response.requestId === requestId && response.type === 'progress')
    .map(response => response.progress?.phase)
    .filter((phase): phase is ParserBridgeProgressPhase => typeof phase === 'string')

const waitFor = async (predicate: () => boolean) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) {
      return
    }

    await new Promise<void>(resolve => globalThis.setTimeout(resolve, 0))
  }

  throw new Error('Timed out waiting for ProtocolServer test condition')
}

describe('ProtocolServer queue', () => {
  let server: ProtocolServer | null
  let port: FakeMessagePort
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    conversionMock.mockImplementation(async (request: ConversionTask) => [
      {
        filename: request.filename.replace(/\.[^/.]+$/, '.html'),
        mimeType: 'text/html;charset=utf-8',
        targetFormat: 'html',
        buffer: request.buffer
      }
    ])
    port = createPort()
    server = createProtocolServer(port as unknown as MessagePort)
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    server?.dispose()
    server = null
    warnSpy.mockRestore()
  })

  it('processes tasks in FIFO order', async () => {
    server?.enqueue(createTask('first'))
    server?.enqueue(createTask('second'))
    server?.enqueue(createTask('third'))

    await waitFor(() => getResultIds(port).length === 3)

    expect(getResultIds(port)).toEqual(['first', 'second', 'third'])
  })

  it('never has more than one active task', async () => {
    server?.enqueue(createTask('first'))
    server?.enqueue(createTask('second'))
    server?.enqueue(createTask('third'))

    await waitFor(() => getResultIds(port).length === 3)

    const activeStagePhases: readonly ParserBridgeProgressPhase[] = [
      'reading',
      'encoding',
      'decoding',
      'rendering',
      'packaging'
    ]
    const activeRequestIds = new Set<string>()
    let maxActiveCount = 0

    for (const response of getResponses(port)) {
      if (response.type !== 'progress' || !response.progress) {
        continue
      }

      if (activeStagePhases.includes(response.progress.phase)) {
        activeRequestIds.add(response.requestId)
      }

      if (['completed', 'cancelled', 'error'].includes(response.progress.phase)) {
        activeRequestIds.delete(response.requestId)
      }

      maxActiveCount = Math.max(maxActiveCount, activeRequestIds.size)
    }

    expect(maxActiveCount).toBeLessThanOrEqual(1)
  })

  it('cancels queued task immediately', async () => {
    server?.enqueue(createTask('active'))
    server?.enqueue(createTask('queued'))

    expect(server?.cancel('queued')).toBe(true)
    expect(server?.getQueueLength()).toBe(0)

    await waitFor(() => getResultIds(port).includes('active'))

    expect(server?.getProgress('queued')?.phase).toBe('cancelled')
    expect(getPhases(port, 'queued')).toEqual(['queued', 'cancelled'])
    expect(getResultIds(port)).not.toContain('queued')
  })

  it('cancels active task at stage boundary', async () => {
    server?.enqueue(createTask('active'))
    await waitFor(() => getPhases(port, 'active').includes('reading'))

    expect(server?.cancel('active')).toBe(true)
    await waitFor(() => server?.getProgress('active')?.phase === 'cancelled')

    expect(getPhases(port, 'active')).toEqual(['queued', 'reading', 'cancelled'])
    expect(getResultIds(port)).not.toContain('active')
  })

  it('rejects duplicate request IDs', async () => {
    server?.enqueue(createTask('same'))
    server?.enqueue(createTask('same'))

    await waitFor(() => getError(port, 'same') !== undefined)

    expect(getError(port, 'same')?.error?.code).toBe('DUPLICATE_REQUEST_ID')
  })

  it('ignores late results after cancel', async () => {
    server?.enqueue(createTask('active'))
    await waitFor(() => getPhases(port, 'active').includes('reading'))

    expect(server?.cancel('active')).toBe(true)
    await waitFor(() => server?.getProgress('active')?.phase === 'cancelled')
    await new Promise<void>(resolve => globalThis.setTimeout(resolve, 5))

    expect(server?.getProgress('active')?.phase).toBe('cancelled')
    expect(getPhases(port, 'active')).toEqual(['queued', 'reading', 'cancelled'])
    expect(getResultIds(port)).toEqual([])
  })

  it('validates protocol messages received on the port', async () => {
    port.dispatch(createRequest('from-port'))
    port.dispatch({ requestId: 'bad', type: 'convert', filename: 'bad.pdf' })

    await waitFor(() => getResultIds(port).includes('from-port'))

    expect(getError(port, 'bad')?.error?.code).toBe('INVALID_PROTOCOL_MESSAGE')
  })
})
