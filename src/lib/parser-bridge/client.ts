import type {
  ParserBridgeConversionResultPayload,
  ParserBridgeProgress,
  ParserBridgeRequest,
  ParserBridgeCancelRequest
} from '@hamster-note/parser-protocol'

export const BridgeErrorCode = {
  IFRAME_LOAD_TIMEOUT: 'IFRAME_LOAD_TIMEOUT',
  BRIDGE_DISPOSED: 'BRIDGE_DISPOSED',
  DUPLICATE_REQUEST_ID: 'DUPLICATE_REQUEST_ID',
  UNKNOWN_REQUEST_ID: 'UNKNOWN_REQUEST_ID',
  CONVERT_TIMEOUT: 'CONVERT_TIMEOUT'
} as const

export type BridgeErrorCodeType = (typeof BridgeErrorCode)[keyof typeof BridgeErrorCode]

export class BridgeError extends Error {
  code: BridgeErrorCodeType
  constructor(code: BridgeErrorCodeType, message: string) {
    super(message)
    this.code = code
    this.name = 'BridgeError'
  }
}

let requestIdCounter = 0
export function generateRequestId(): string {
  requestIdCounter += 1
  const randomId =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${requestIdCounter}`
  return `req-${randomId}`
}

type PendingRequest = {
  resolve: (
    value: ParserBridgeConversionResultPayload | ParserBridgeConversionResultPayload[]
  ) => void
  reject: (error: Error) => void
  timeoutId: ReturnType<typeof setTimeout>
  cancelled: boolean
}

export type BridgeClient = {
  sendConvert: (
    request: ParserBridgeRequest
  ) => Promise<ParserBridgeConversionResultPayload | ParserBridgeConversionResultPayload[]>
  sendCancel: (requestId: string) => Promise<void>
  getProgress: () => ParserBridgeProgress | null
  dispose: () => void
}

const CONVERT_TIMEOUT_MS = 120_000

export function createBridgeClient(port: MessagePort): BridgeClient {
  const pending = new Map<string, PendingRequest>()
  let currentProgress: ParserBridgeProgress | null = null
  let disposed = false

  const handleMessage = (event: MessageEvent) => {
    if (disposed) return
    const data = event.data as Record<string, unknown>
    if (!data || typeof data !== 'object') return
    if (typeof data.requestId !== 'string') return

    const requestId = data.requestId

    if (data.type === 'progress' && data.progress && typeof data.progress === 'object') {
      currentProgress = data.progress as ParserBridgeProgress
      return
    }

    const pendingRequest = pending.get(requestId)
    if (!pendingRequest) return

    if (pendingRequest.cancelled) {
      // Stale result rejection: ignore results for cancelled requests
      if (data.type === 'convert:result' || data.type === 'convert:error') {
        pending.delete(requestId)
      }
      return
    }

    clearTimeout(pendingRequest.timeoutId)

    if (data.type === 'convert:result' && data.payload && typeof data.payload === 'object') {
      pending.delete(requestId)
      pendingRequest.resolve(
        data.payload as ParserBridgeConversionResultPayload | ParserBridgeConversionResultPayload[]
      )
    } else if (data.type === 'convert:error' && data.error && typeof data.error === 'object') {
      pending.delete(requestId)
      const error = data.error as { code?: string; message?: string }
      pendingRequest.reject(
        new BridgeError(
          (error.code as BridgeErrorCodeType) || 'UNKNOWN_ERROR',
          error.message || 'Unknown error'
        )
      )
    }
  }

  port.addEventListener('message', handleMessage)
  port.start()

  return {
    sendConvert(request) {
      if (disposed) {
        return Promise.reject(
          new BridgeError(BridgeErrorCode.BRIDGE_DISPOSED, 'Bridge has been disposed')
        )
      }
      if (pending.has(request.requestId)) {
        return Promise.reject(
          new BridgeError(
            BridgeErrorCode.DUPLICATE_REQUEST_ID,
            `Request ${request.requestId} already pending`
          )
        )
      }
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          const pr = pending.get(request.requestId)
          if (pr) {
            pending.delete(request.requestId)
            pr.reject(
              new BridgeError(
                BridgeErrorCode.CONVERT_TIMEOUT,
                `Convert request ${request.requestId} timed out after ${CONVERT_TIMEOUT_MS}ms`
              )
            )
          }
        }, CONVERT_TIMEOUT_MS)
        pending.set(request.requestId, { resolve, reject, timeoutId, cancelled: false })
        port.postMessage(request)
      })
    },
    sendCancel(requestId) {
      if (disposed) {
        return Promise.reject(
          new BridgeError(BridgeErrorCode.BRIDGE_DISPOSED, 'Bridge has been disposed')
        )
      }
      const pendingRequest = pending.get(requestId)
      if (!pendingRequest) {
        return Promise.reject(
          new BridgeError(BridgeErrorCode.UNKNOWN_REQUEST_ID, `Request ${requestId} not found`)
        )
      }
      clearTimeout(pendingRequest.timeoutId)
      pending.delete(requestId)
      pendingRequest.reject(
        new BridgeError(BridgeErrorCode.BRIDGE_DISPOSED, `Request ${requestId} was cancelled`)
      )
      const cancelMsg: ParserBridgeCancelRequest = { requestId, type: 'cancel' }
      port.postMessage(cancelMsg)
      return Promise.resolve()
    },
    getProgress() {
      return currentProgress
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const [requestId, pendingRequest] of pending) {
        clearTimeout(pendingRequest.timeoutId)
        pendingRequest.reject(
          new BridgeError(
            BridgeErrorCode.BRIDGE_DISPOSED,
            `Bridge disposed while request ${requestId} was pending`
          )
        )
      }
      pending.clear()
      port.removeEventListener('message', handleMessage)
      port.close()
    }
  }
}
