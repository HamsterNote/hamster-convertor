import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type {
  ParserBridgeConversionResultPayload,
  ParserBridgeProgress,
  ParserBridgeRequest
} from '@hamster-note/parser-protocol'
import type { BridgeClient, BridgeErrorCodeType } from '../lib/parser-bridge/client'
import { BridgeError, BridgeErrorCode, createBridgeClient } from '../lib/parser-bridge/client'
import { getParserRuntimeUrl } from '../lib/parser-bridge/url'

export type ParserIframeBridgeRef = {
  convert: (request: ParserBridgeRequest) => Promise<ParserBridgeConversionResultPayload>
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

export const ParserIframeBridge = forwardRef<ParserIframeBridgeRef, ParserIframeBridgeProps>(
  ({ src = getParserRuntimeUrl(), timeout = DEFAULT_TIMEOUT }, ref) => {
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const statusRef = useRef<BridgeStatus>({ kind: 'idle' })

    useImperativeHandle(ref, () => ({
      convert: (request: ParserBridgeRequest) => {
        const status = statusRef.current
        if (status.kind === 'ready') {
          return status.client.sendConvert(request)
        }
        if (status.kind === 'error') {
          return Promise.reject(new BridgeError(status.code, status.message))
        }
        return Promise.reject(new BridgeError(BridgeErrorCode.BRIDGE_DISPOSED, 'Bridge not ready'))
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
        return Promise.reject(new BridgeError(BridgeErrorCode.BRIDGE_DISPOSED, 'Bridge not ready'))
      }
    }))

    useEffect(() => {
      const iframe = iframeRef.current
      if (!iframe) return

      const abortController = new AbortController()
      const timeoutId = setTimeout(() => {
        statusRef.current = {
          kind: 'error',
          code: BridgeErrorCode.IFRAME_LOAD_TIMEOUT,
          message: `Iframe load timeout: ${src}`
        }
      }, timeout)

      statusRef.current = { kind: 'loading', timeoutId }

      const handleMessage = (event: MessageEvent) => {
        if (event.source !== iframe.contentWindow) return
        const data = event.data as Record<string, unknown>
        if (!data || typeof data !== 'object') return
        if (data.type !== 'ready') return

        clearTimeout(timeoutId)

        const channel = new MessageChannel()
        const port1 = channel.port1
        const port2 = channel.port2

        iframe.contentWindow?.postMessage({ type: 'parser-bridge:connect' }, '*', [port2])

        const client = createBridgeClient(port1)
        statusRef.current = { kind: 'ready', client }
      }

      window.addEventListener('message', handleMessage, { signal: abortController.signal })

      return () => {
        abortController.abort()
        clearTimeout(timeoutId)
        const status = statusRef.current
        if (status.kind === 'ready') {
          status.client.dispose()
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
