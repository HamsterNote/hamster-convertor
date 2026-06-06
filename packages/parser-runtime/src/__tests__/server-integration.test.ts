/**
 * ProtocolServer 集成测试
 *
 * 端到端验证完整转换流水线：
 * - 通过 port 消息触发 enqueue → 阶段进度 → 成功结果
 * - 端到端取消流程（queued + active）
 * - dispose 后所有行为被拒绝
 * - ready 消息握手
 * - 错误处理路径
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversionTask, ProtocolServer } from '../server'
import { createProtocolServer } from '../server'

// ============================================================================
// Mock setup
// ============================================================================

const conversionMock = vi.hoisted(() => vi.fn())

vi.mock('../conversion', () => ({
  convertRuntime: conversionMock
}))

// ============================================================================
// 类型定义
// ============================================================================

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

type ParserBridgeResponse = {
  requestId: string
  type: 'convert:result' | 'convert:error' | 'progress'
  error?: { code: string; message: string }
  progress?: {
    phase: ParserBridgeProgressPhase
    percent: number
    queueLength: number
  }
  payload?: {
    filename: string
    mimeType: string
    targetFormat: string
    buffer: ArrayBuffer
    warnings?: string[]
  }
}

type ReadyMessage = { type: 'ready' }

type PostedMessage = ParserBridgeResponse | ReadyMessage

type MessageListener = (event: MessageEvent<unknown>) => void

// ============================================================================
// FakeMessagePort
// ============================================================================

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

// ============================================================================
// 辅助函数
// ============================================================================

const createPort = () => new FakeMessagePort()

const createTask = (requestId: string): ConversionTask => ({
  requestId,
  filename: `${requestId}.pdf`,
  sourceFormat: 'pdf',
  targetFormat: 'html',
  buffer: new ArrayBuffer(8),
  status: 'queued'
})

const createConvertRequest = (requestId: string) => ({
  requestId,
  type: 'convert' as const,
  filename: `${requestId}.pdf`,
  sourceFormat: 'pdf',
  targetFormat: 'html',
  buffer: new ArrayBuffer(8)
})

const createCancelRequest = (requestId: string) => ({
  requestId,
  type: 'cancel' as const
})

const isResponse = (msg: PostedMessage): msg is ParserBridgeResponse =>
  'requestId' in msg && ['convert:result', 'convert:error', 'progress'].includes(msg.type)

const getResponses = (port: FakeMessagePort) => port.messages.filter(isResponse)

const getResultIds = (port: FakeMessagePort) =>
  getResponses(port)
    .filter(r => r.type === 'convert:result')
    .map(r => r.requestId)

const getErrors = (port: FakeMessagePort) =>
  getResponses(port).filter(r => r.type === 'convert:error')

const getError = (port: FakeMessagePort, requestId: string) =>
  getErrors(port).find(r => r.requestId === requestId)

const getPhases = (port: FakeMessagePort, requestId: string) =>
  getResponses(port)
    .filter(r => r.requestId === requestId && r.type === 'progress')
    .map(r => r.progress?.phase)
    .filter((p): p is ParserBridgeProgressPhase => typeof p === 'string')

const hasReady = (port: FakeMessagePort) =>
  port.messages.some(m => !isResponse(m) && m.type === 'ready')

const waitFor = async (predicate: () => boolean) => {
  for (let i = 0; i < 50; i++) {
    if (predicate()) return
    await new Promise<void>(resolve => globalThis.setTimeout(resolve, 0))
  }
  throw new Error('Timed out waiting for condition')
}

// ============================================================================
// Tests
// ============================================================================

describe('ProtocolServer integration', () => {
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

  // =========================================================================
  // Ready 握手
  // =========================================================================

  it('emits ready message on startup', () => {
    expect(hasReady(port)).toBe(true)
  })

  it('starts listening on the port', () => {
    expect(port.started).toBe(true)
  })

  // =========================================================================
  // 通过 port 消息触发的端到端转换
  // =========================================================================

  it('processes convert request received via port message', async () => {
    port.dispatch(createConvertRequest('e2e-1'))

    await waitFor(() => getResultIds(port).includes('e2e-1'))

    const result = getResponses(port).find(
      r => r.requestId === 'e2e-1' && r.type === 'convert:result'
    )
    expect(result).toBeDefined()
    expect(result?.payload?.filename).toBe('e2e-1.html')
    expect(result?.payload?.mimeType).toBe('text/html;charset=utf-8')
  })

  it('reports full stage progression for a single request', async () => {
    port.dispatch(createConvertRequest('stages'))

    await waitFor(() => getResultIds(port).includes('stages'))

    const phases = getPhases(port, 'stages')
    expect(phases).toEqual([
      'queued',
      'reading',
      'encoding',
      'decoding',
      'rendering',
      'packaging',
      'completed'
    ])
  })

  it('reports correct percent values in progress messages', async () => {
    port.dispatch(createConvertRequest('pct'))

    await waitFor(() => getResultIds(port).includes('pct'))

    const progressMsgs = getResponses(port).filter(
      r => r.requestId === 'pct' && r.type === 'progress'
    )
    const percents = progressMsgs.map(r => r.progress?.percent)
    expect(percents).toEqual([0, 15, 35, 55, 75, 90, 100])
  })

  // =========================================================================
  // 端到端取消
  // =========================================================================

  it('cancels queued task via port cancel message', async () => {
    // 先让一个任务进入 active 状态
    port.dispatch(createConvertRequest('active'))
    await waitFor(() => getPhases(port, 'active').includes('reading'))

    // 排队一个新任务并立即取消
    port.dispatch(createConvertRequest('to-cancel'))
    port.dispatch(createCancelRequest('to-cancel'))

    await waitFor(() => getResultIds(port).includes('active'))

    expect(getPhases(port, 'to-cancel')).toContain('cancelled')
    expect(getResultIds(port)).not.toContain('to-cancel')
  })

  it('cancels active task via port cancel message', async () => {
    port.dispatch(createConvertRequest('active-cancel'))
    await waitFor(() => getPhases(port, 'active-cancel').includes('reading'))

    port.dispatch(createCancelRequest('active-cancel'))
    await waitFor(() => server?.getProgress('active-cancel')?.phase === 'cancelled')

    expect(getPhases(port, 'active-cancel')).toContain('cancelled')
    expect(getResultIds(port)).not.toContain('active-cancel')
  })

  // =========================================================================
  // dispose 后行为
  // =========================================================================

  it('dispose clears the queue', async () => {
    // 塞入多个任务
    server?.enqueue(createTask('d1'))
    server?.enqueue(createTask('d2'))
    server?.enqueue(createTask('d3'))

    server?.dispose()

    expect(server?.getQueueLength()).toBe(0)
  })

  it('dispose closes the port', () => {
    server?.dispose()
    expect(port.closed).toBe(true)
  })

  it('dispose removes message listener', () => {
    server?.dispose()
    const countBefore = port.messages.length
    port.dispatch(createConvertRequest('after-dispose'))
    // 不应产生新的响应
    expect(port.messages).toHaveLength(countBefore)
  })

  // =========================================================================
  // 多任务端到端
  // =========================================================================

  it('processes multiple port-triggered tasks in FIFO order', async () => {
    port.dispatch(createConvertRequest('first'))
    port.dispatch(createConvertRequest('second'))
    port.dispatch(createConvertRequest('third'))

    await waitFor(() => getResultIds(port).length === 3)

    expect(getResultIds(port)).toEqual(['first', 'second', 'third'])
  })

  // =========================================================================
  // 错误路径
  // =========================================================================

  it('reports INVALID_PROTOCOL_MESSAGE for malformed port messages', async () => {
    port.dispatch({ requestId: 'bad', type: 'convert', filename: 'bad.pdf' })

    await waitFor(() => getError(port, 'bad') !== undefined)

    expect(getError(port, 'bad')?.error?.code).toBe('INVALID_PROTOCOL_MESSAGE')
  })

  it('reports DUPLICATE_REQUEST_ID for repeated requestId via port', async () => {
    port.dispatch(createConvertRequest('dup'))
    port.dispatch(createConvertRequest('dup'))

    await waitFor(() => getError(port, 'dup') !== undefined)

    expect(getError(port, 'dup')?.error?.code).toBe('DUPLICATE_REQUEST_ID')
  })

  // =========================================================================
  // progress message 结构验证
  // =========================================================================

  it('progress messages contain valid queueLength', async () => {
    server?.enqueue(createTask('ql-check'))

    await waitFor(() => getResultIds(port).includes('ql-check'))

    const progressMsgs = getResponses(port).filter(
      r => r.requestId === 'ql-check' && r.type === 'progress'
    )
    for (const msg of progressMsgs) {
      expect(typeof msg.progress?.queueLength).toBe('number')
      expect(msg.progress?.queueLength).toBeGreaterThanOrEqual(0)
    }
  })

  // =========================================================================
  // 结果 payload 结构验证
  // =========================================================================

  it('result payload has correct structure', async () => {
    port.dispatch(createConvertRequest('payload-check'))

    await waitFor(() => getResultIds(port).includes('payload-check'))

    const result = getResponses(port).find(
      r => r.requestId === 'payload-check' && r.type === 'convert:result'
    )
    expect(result?.payload).toBeDefined()
    expect(typeof result?.payload?.filename).toBe('string')
    expect(typeof result?.payload?.mimeType).toBe('string')
    expect(typeof result?.payload?.targetFormat).toBe('string')
    expect(result?.payload?.buffer).toBeInstanceOf(ArrayBuffer)
  })
})
