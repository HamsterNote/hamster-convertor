/**
 * parser-bridge-client 单元测试
 *
 * 验证 createBridgeClient 核心行为：
 * - 取消后忽略迟到的结果（stale result）
 * - 重复 requestId 保护
 * - dispose 清理所有 pending 请求和监听器
 * - 超时后自动拒绝
 * - 已 dispose 后操作被拒绝
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createBridgeClient,
  BridgeError,
  BridgeErrorCode,
  type BridgeClient
} from '../lib/parser-bridge/client'

type MessageListener = (event: MessageEvent<unknown>) => void

/**
 * 轻量 FakeMessagePort，可手动触发消息
 */
class FakeMessagePort {
  readonly messages: unknown[] = []
  private readonly listeners = new Set<MessageListener>()
  closed = false

  postMessage(message: unknown) {
    this.messages.push(message)
  }

  addEventListener(type: string, listener: MessageListener) {
    if (type === 'message') {
      this.listeners.add(listener)
    }
  }

  removeEventListener(type: string, listener: MessageListener) {
    if (type === 'message') {
      this.listeners.delete(listener)
    }
  }

  start() {
    // noop
  }

  close() {
    this.closed = true
    this.listeners.clear()
  }

  /**
   * 模拟从服务端发来的消息
   */
  dispatch(message: unknown) {
    const event = { data: message } as MessageEvent<unknown>
    for (const listener of [...this.listeners]) {
      listener(event)
    }
  }
}

const makeRequest = (requestId: string) => ({
  requestId,
  type: 'convert' as const,
  filename: `${requestId}.pdf`,
  sourceFormat: 'pdf',
  targetFormat: 'html',
  buffer: new ArrayBuffer(8)
})

const makeResult = (requestId: string) => ({
  requestId,
  type: 'convert:result',
  payload: {
    filename: `${requestId}.html`,
    mimeType: 'text/html;charset=utf-8',
    targetFormat: 'html',
    buffer: new ArrayBuffer(16)
  }
})

const makeError = (requestId: string, code = 'CONVERSION_FAILED', message = '失败') => ({
  requestId,
  type: 'convert:error',
  error: { code, message }
})

const makeProgress = (requestId: string, phase: string, percent: number) => ({
  requestId,
  type: 'progress',
  progress: { requestId, phase, percent, queueLength: 0 }
})

/**
 * 辅助：吞掉已知的 rejection，避免 unhandled rejection
 */
const swallowReject = (promise: Promise<unknown>) => {
  promise.catch(() => undefined)
}

describe('createBridgeClient', () => {
  let port: FakeMessagePort
  let client: BridgeClient

  beforeEach(() => {
    vi.useFakeTimers()
    port = new FakeMessagePort()
    client = createBridgeClient(port as unknown as MessagePort)
  })

  afterEach(() => {
    client.dispose()
    vi.useRealTimers()
  })

  // =========================================================================
  // 基本成功路径
  // =========================================================================

  it('sendConvert resolves when matching convert:result arrives', async () => {
    const request = makeRequest('req-ok')
    const promise = client.sendConvert(request)

    // 发送端口上的消息应该被发出
    expect(port.messages).toHaveLength(1)
    expect(port.messages[0]).toMatchObject({ requestId: 'req-ok', type: 'convert' })

    // 模拟服务端响应
    port.dispatch(makeResult('req-ok'))

    const result = await promise
    expect(result.filename).toBe('req-ok.html')
    expect(result.mimeType).toBe('text/html;charset=utf-8')
  })

  it('sendConvert rejects when matching convert:error arrives', async () => {
    const request = makeRequest('req-err')
    const promise = client.sendConvert(request)

    port.dispatch(makeError('req-err', 'PARSE_FAILED', '解析失败'))

    await expect(promise).rejects.toThrow(BridgeError)
    await expect(promise).rejects.toMatchObject({
      code: 'PARSE_FAILED',
      message: '解析失败'
    })
  })

  // =========================================================================
  // 进度跟踪
  // =========================================================================

  it('getProgress tracks latest progress message', () => {
    expect(client.getProgress()).toBeNull()

    port.dispatch(makeProgress('req-p', 'reading', 15))
    expect(client.getProgress()).toMatchObject({ phase: 'reading', percent: 15 })

    port.dispatch(makeProgress('req-p', 'encoding', 35))
    expect(client.getProgress()).toMatchObject({ phase: 'encoding', percent: 35 })
  })

  // =========================================================================
  // 取消后忽略迟到结果（stale result after cancel）
  // =========================================================================

  it('ignores convert:result arriving after cancel', async () => {
    const request = makeRequest('req-stale')
    const promise = client.sendConvert(request)

    // 取消请求——promise 会 reject，吞掉它
    const cancelPromise = client.sendCancel('req-stale')
    swallowReject(promise)

    await cancelPromise
    await expect(promise).rejects.toMatchObject({ message: expect.stringContaining('cancelled') })

    // 此时迟到的结果不应产生任何副作用
    port.dispatch(makeResult('req-stale'))
    // 无新的 reject，不抛错即通过
  })

  it('ignores convert:error arriving after cancel', async () => {
    const request = makeRequest('req-stale-err')
    const promise = client.sendConvert(request)

    const cancelPromise = client.sendCancel('req-stale-err')
    swallowReject(promise)

    await cancelPromise
    await expect(promise).rejects.toThrow()

    // 迟到的错误也不应有副作用
    port.dispatch(makeError('req-stale-err', 'TIMEOUT', '超时'))
  })

  // =========================================================================
  // 重复 requestId 保护
  // =========================================================================

  it('rejects duplicate requestId with DUPLICATE_REQUEST_ID', async () => {
    const request = makeRequest('req-dup')
    const firstPromise = client.sendConvert(request)

    // 第二次相同 requestId 应该被拒绝
    const dup1 = client.sendConvert(request)
    const dup2 = client.sendConvert(request)
    swallowReject(dup1)
    swallowReject(dup2)

    await expect(dup1).rejects.toThrow(BridgeError)
    await expect(dup1).rejects.toMatchObject({
      code: BridgeErrorCode.DUPLICATE_REQUEST_ID
    })

    // 第一次请求仍然正常
    port.dispatch(makeResult('req-dup'))
    const result = await firstPromise
    expect(result.filename).toBe('req-dup.html')
  })

  // =========================================================================
  // dispose 清理
  // =========================================================================

  it('dispose rejects all pending requests with BRIDGE_DISPOSED', async () => {
    const p1 = client.sendConvert(makeRequest('req-d1'))
    const p2 = client.sendConvert(makeRequest('req-d2'))

    client.dispose()

    await expect(p1).rejects.toThrow(BridgeError)
    await expect(p1).rejects.toMatchObject({ code: BridgeErrorCode.BRIDGE_DISPOSED })
    await expect(p2).rejects.toThrow(BridgeError)
    await expect(p2).rejects.toMatchObject({ code: BridgeErrorCode.BRIDGE_DISPOSED })
  })

  it('dispose closes the underlying port', () => {
    client.dispose()
    expect(port.closed).toBe(true)
  })

  it('dispose removes message listener from port', () => {
    const removeListenerSpy = vi.spyOn(port, 'removeEventListener')
    client.dispose()
    expect(removeListenerSpy).toHaveBeenCalled()
  })

  it('sendConvert after dispose rejects immediately', async () => {
    client.dispose()

    await expect(client.sendConvert(makeRequest('req-after'))).rejects.toThrow(BridgeError)
    await expect(client.sendConvert(makeRequest('req-after'))).rejects.toMatchObject({
      code: BridgeErrorCode.BRIDGE_DISPOSED
    })
  })

  it('sendCancel after dispose rejects immediately', async () => {
    client.dispose()

    await expect(client.sendCancel('any-id')).rejects.toThrow(BridgeError)
    await expect(client.sendCancel('any-id')).rejects.toMatchObject({
      code: BridgeErrorCode.BRIDGE_DISPOSED
    })
  })

  it('second dispose is idempotent', () => {
    client.dispose()
    client.dispose() // 不抛错即通过
    expect(port.closed).toBe(true)
  })

  // =========================================================================
  // sendCancel 边界情况
  // =========================================================================

  it('sendCancel rejects UNKNOWN_REQUEST_ID for non-pending request', async () => {
    await expect(client.sendCancel('nonexistent')).rejects.toThrow(BridgeError)
    await expect(client.sendCancel('nonexistent')).rejects.toMatchObject({
      code: BridgeErrorCode.UNKNOWN_REQUEST_ID
    })
  })

  it('sendCancel sends cancel message through port', async () => {
    const promise = client.sendConvert(makeRequest('req-cancel-msg'))
    swallowReject(promise) // cancel 会导致 reject，提前吞掉

    // 清空之前的消息
    port.messages.length = 0

    await client.sendCancel('req-cancel-msg')

    expect(port.messages).toHaveLength(1)
    expect(port.messages[0]).toMatchObject({ requestId: 'req-cancel-msg', type: 'cancel' })
  })

  // =========================================================================
  // 超时
  // =========================================================================

  it('sendConvert rejects with CONVERT_TIMEOUT after timeout expires', async () => {
    const request = makeRequest('req-timeout')
    const promise = client.sendConvert(request)

    // 快进到超时（120 秒）
    vi.advanceTimersByTime(121_000)

    await expect(promise).rejects.toThrow(BridgeError)
    await expect(promise).rejects.toMatchObject({
      code: BridgeErrorCode.CONVERT_TIMEOUT
    })
  })

  it('cancel clears the timeout so it does not fire', async () => {
    const request = makeRequest('req-cancel-timeout')
    const promise = client.sendConvert(request)
    swallowReject(promise)

    await client.sendCancel('req-cancel-timeout')
    await expect(promise).rejects.toThrow()

    // 快进——不应该产生新的超时错误
    vi.advanceTimersByTime(121_000)
  })

  // =========================================================================
  // 不匹配的 requestId 被忽略
  // =========================================================================

  it('ignores result for unknown requestId', async () => {
    const request = makeRequest('req-known')
    const promise = client.sendConvert(request)

    // 发一个不匹配的 result
    port.dispatch(makeResult('unknown-id'))

    // 正确的 result 应该仍然能工作
    port.dispatch(makeResult('req-known'))
    const result = await promise
    expect(result.filename).toBe('req-known.html')
  })

  // =========================================================================
  // progress 不关联 requestId，只更新全局 currentProgress
  // =========================================================================

  it('progress updates are global, not per-request', async () => {
    const p1 = client.sendConvert(makeRequest('req-g1'))
    const p2 = client.sendConvert(makeRequest('req-g2'))

    port.dispatch(makeProgress('req-g1', 'reading', 15))
    expect(client.getProgress()).toMatchObject({ requestId: 'req-g1', phase: 'reading' })

    port.dispatch(makeProgress('req-g2', 'encoding', 35))
    expect(client.getProgress()).toMatchObject({ requestId: 'req-g2', phase: 'encoding' })

    // 完成两个请求
    port.dispatch(makeResult('req-g1'))
    port.dispatch(makeResult('req-g2'))
    await p1
    await p2
  })
})
