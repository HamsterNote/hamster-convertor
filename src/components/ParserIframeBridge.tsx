import type {
  ParserBridgeConversionResultPayload,
  ParserBridgeProgress,
  ParserBridgeRequest
} from '@hamster-note/parser-protocol'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { BridgeClient, BridgeErrorCodeType } from '../lib/parser-bridge/client'
import { BridgeError, BridgeErrorCode, createBridgeClient } from '../lib/parser-bridge/client'
import { getParserRuntimeUrl } from '../lib/parser-bridge/url'

export type ParserIframeBridgeRef = {
  convert: (
    request: ParserBridgeRequest
  ) => Promise<ParserBridgeConversionResultPayload | ParserBridgeConversionResultPayload[]>
  getProgress: () => ParserBridgeProgress | null
  cancel: (requestId: string) => Promise<void>
}

export type ParserIframeBridgeProps = {
  src?: string
  timeout?: number
}

const DEFAULT_TIMEOUT = 30000

type BridgeStatus =
  | { kind: 'idle' }
  | { kind: 'loading'; timeoutId: ReturnType<typeof setTimeout> }
  | { kind: 'ready'; client: BridgeClient }
  | { kind: 'error'; code: BridgeErrorCodeType; message: string }

type PendingConversion = {
  request: ParserBridgeRequest
  resolve: (
    value: ParserBridgeConversionResultPayload | ParserBridgeConversionResultPayload[]
  ) => void
  reject: (error: Error) => void
}

export const ParserIframeBridge = forwardRef<ParserIframeBridgeRef, ParserIframeBridgeProps>(
  ({ src = getParserRuntimeUrl(), timeout = DEFAULT_TIMEOUT }, ref) => {
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const statusRef = useRef<BridgeStatus>({ kind: 'idle' })
    const pendingConversionsRef = useRef<PendingConversion[]>([])

    useImperativeHandle(ref, () => ({
      convert: (request: ParserBridgeRequest) => {
        const status = statusRef.current
        if (status.kind === 'ready') {
          return status.client.sendConvert(request)
        }
        if (status.kind === 'error') {
          return Promise.reject(new BridgeError(status.code, status.message))
        }
        if (status.kind === 'idle') {
          return Promise.reject(
            new BridgeError(BridgeErrorCode.BRIDGE_DISPOSED, 'Bridge is not mounted')
          )
        }
        return new Promise((resolve, reject) => {
          pendingConversionsRef.current.push({ request, resolve, reject })
        })
      },
      getProgress: () => {
        const status = statusRef.current
        if (status.kind === 'ready') {
          return status.client.getProgress()
        }
        return null
      },
      cancel: (requestId: string) => {
        const status = statusRef.current
        if (status.kind === 'ready') {
          return status.client.sendCancel(requestId)
        }
        if (status.kind === 'error') {
          return Promise.reject(new BridgeError(status.code, status.message))
        }
        if (status.kind === 'loading') {
          const pendingIndex = pendingConversionsRef.current.findIndex(
            pending => pending.request.requestId === requestId
          )
          if (pendingIndex === -1) {
            return Promise.reject(
              new BridgeError(BridgeErrorCode.UNKNOWN_REQUEST_ID, `Request ${requestId} not found`)
            )
          }

          const [pending] = pendingConversionsRef.current.splice(pendingIndex, 1)
          pending.reject(
            new BridgeError(BridgeErrorCode.BRIDGE_DISPOSED, `Request ${requestId} was cancelled`)
          )
          return Promise.resolve()
        }
        return Promise.reject(
          new BridgeError(BridgeErrorCode.BRIDGE_DISPOSED, 'Bridge is not mounted')
        )
      }
    }))

    useEffect(() => {
      const iframe = iframeRef.current
      if (!iframe) return

      const abortController = new AbortController()
      const pendingConversionsQueue = pendingConversionsRef.current
      const timeoutId = setTimeout(() => {
        const message = `Iframe load timeout: ${src}`
        statusRef.current = { kind: 'error', code: BridgeErrorCode.IFRAME_LOAD_TIMEOUT, message }
        const pendingConversions = pendingConversionsQueue.splice(0)
        for (const pending of pendingConversions) {
          pending.reject(new BridgeError(BridgeErrorCode.IFRAME_LOAD_TIMEOUT, message))
        }
      }, timeout)

      statusRef.current = { kind: 'loading', timeoutId }

      const handleMessage = (event: MessageEvent) => {
        if (event.source !== iframe.contentWindow) return
        const data = event.data as Record<string, unknown>
        if (!data || typeof data !== 'object') return
        if (data.type !== 'ready') return
        if (statusRef.current.kind !== 'loading') return

        clearTimeout(timeoutId)

        const channel = new MessageChannel()
        const port1 = channel.port1
        const port2 = channel.port2

        iframe.contentWindow?.postMessage({ type: 'parser-bridge:connect' }, '*', [port2])

        const client = createBridgeClient(port1)
        statusRef.current = { kind: 'ready', client }

        const pendingConversions = pendingConversionsQueue.splice(0)
        for (const pending of pendingConversions) {
          client.sendConvert(pending.request).then(pending.resolve, pending.reject)
        }
      }

      window.addEventListener('message', handleMessage, { signal: abortController.signal })

      return () => {
        abortController.abort()
        clearTimeout(timeoutId)
        const status = statusRef.current
        if (status.kind === 'ready') {
          status.client.dispose()
        }
        const pendingConversions = pendingConversionsQueue.splice(0)
        for (const pending of pendingConversions) {
          pending.reject(
            new BridgeError(
              BridgeErrorCode.BRIDGE_DISPOSED,
              'Bridge disposed before becoming ready'
            )
          )
        }
        statusRef.current = { kind: 'idle' }
      }
    }, [src, timeout])

    return (
      <iframe
        ref={iframeRef}
        src={src}
        sandbox="allow-scripts allow-same-origin"
        hidden
        title="parser-runtime"
      />
    )
  }
)

ParserIframeBridge.displayName = 'ParserIframeBridge'
