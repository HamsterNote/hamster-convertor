# Iframe Parser Runtime

## Overview

The iframe parser runtime moves browser-only parser execution (pdfjs, canvas,
html2canvas, jsPDF, ONNX) out of the host React app into a same-origin iframe.
This decouples parser dependencies from the host bundle and provides a clean
isolation boundary for conversion failures, memory leaks, and third-party code.

## Architecture

```
                       Main Window (host)
   ┌─────────────────────────────────────────────────────┐
   │  <ParserIframeBridge ref={bridgeRef} />             │
   │  ┌────────────────────────────────────────────────┐ │
   │  │  Client (client.ts)                            │ │
   │  │  - sendConvert()  → pending Map + timeout      │ │
   │  │  - sendCancel()   → mark cancelled + reject    │ │
   │  │  - getProgress()  → last known progress        │ │
   │  └──────────┬─── MessageChannel port1 ────────────┘ │
   │             │   (transfer: [port2] via postMessage)  │
   └─────────────┼───────────────────────────────────────┘
                 │
   ┌─────────────┴───────────────────────────────────────┐
   │  Iframe (same-origin, sandbox="allow-scripts        │
   │   allow-same-origin")                                │
   │  ┌────────────────────────────────────────────────┐ │
   │  │  Server (server.ts)                            │ │
   │  │  - createProtocolServer(port)                  │ │
   │  │  - FIFO queue, single active task              │ │
   │  │  - Stage-based progress + cancel boundaries    │ │
   │  └──────────────────┬─────────────────────────────┘ │
   │                     │                                │
   │  ┌──────────────────┴─────────────────────────────┐ │
   │  │  Conversion Runtime (conversion/)              │ │
   │  │  - pdf→html/txt/png/jpg/webp/pdf               │ │
   │  │  - txt→png/html                                │ │
   │  │  - image→pdf/txt/png/jpg/webp/html             │ │
   │  │  - html→txt                                    │ │
   │  └────────────────────────────────────────────────┘ │
   └─────────────────────────────────────────────────────┘
```

## Sandbox Tradeoff

The iframe uses `sandbox="allow-scripts allow-same-origin"`. This is
intentional: pdfjs workers, HTML canvas operations, and image decoding
require same-origin access. The tradeoff is that malicious code in the
runtime could access the host origin's storage (cookies, localStorage).
The runtime contains only our own conversion code, not third-party
scripts, but this is a conscious relaxation from full sandbox isolation.

## Protocol Messages

Full type definitions live in `packages/parser-protocol/src/index.ts`.
Brief reference:

| Direction | Message Type             | Payload                                     |
|-----------|--------------------------|---------------------------------------------|
| iframe→host | `ready`                | none                                        |
| host→iframe | `parser-bridge:connect` | MessagePort transfer                        |
| host→iframe | `convert`              | ParserBridgeRequest (requestId, filename, sourceFormat, targetFormat, buffer, options) |
| iframe→host | `convert:result`       | ParserBridgeConversionResultPayload (filename, mimeType, targetFormat, buffer, warnings) |
| iframe→host | `convert:error`        | BridgeError (code, message, details)        |
| iframe→host | `progress`             | ParserBridgeProgress (requestId, phase, percent, queueLength, message) |
| host→iframe | `cancel`               | ParserBridgeCancelRequest (requestId)       |

Progress phases: `queued (0%)` → `reading (15%)` → `encoding (35%)` →
`decoding (55%)` → `rendering (75%)` → `packaging (90%)` → `completed (100%)`.

## Queue and Cancel Semantics

### FIFO Queue
- Requests are queued in FIFO order. At most one active task per iframe.
- The server holds a single `activeTask` reference and a `queue[]` array.
- `processNext()` is a serial async loop: dequeue → run stages → run
  conversion → emit result → dequeue next.

### Queued Cancel
- Immediate removal from `queue[]`.
- Emits `cancelled` progress for the removed request.
- Always returns success; the task never enters the conversion pipeline.

### Active Cancel
- Records the requestId in `cancelledActiveRequestIds`.
- Best-effort: the server checks the cancelled set at each stage boundary
  (between `reading`/`encoding`/`decoding`/`rendering`/`packaging`).
- At the next boundary, it emits `cancelled` progress, breaks the stage
  loop, and does NOT call `runConversion()`.
- If the request is already past all stages and executing `runConversion`,
  cancel is not guaranteed — the conversion completes and the result is
  discarded as a "late result."

### Late Results After Cancel
- The client marks cancelled requests with a `cancelled` flag.
- Incoming `convert:result` or `convert:error` for cancelled requestIds
  are removed from the pending Map and ignored.
- The server also checks `cancelledActiveRequestIds` in `completeTask()`
  and logs a warning instead of posting a result.

### Error Codes
- `IFRAME_LOAD_TIMEOUT` — iframe did not emit `ready` within 30s.
- `BRIDGE_DISPOSED` — bridge unmounted before request completed.
- `DUPLICATE_REQUEST_ID` — requestId already in flight.
- `UNKNOWN_REQUEST_ID` — cancel/progress query for nonexistent ID.
- `CONVERT_TIMEOUT` — conversion took >120s.
- `OCR_REQUIRED`, `EMPTY_OCR`, `NO_PAGES_SELECTED`, `UNSUPPORTED_CONVERSION` — runtime conversion errors mapped from adapters.

## Host API

```tsx
import { ParserIframeBridge } from '../components/ParserIframeBridge'
import type { ParserIframeBridgeRef } from '../components/ParserIframeBridge'

function MyComponent() {
  const bridgeRef = useRef<ParserIframeBridgeRef>(null)
  return (
    <>
      <ParserIframeBridge ref={bridgeRef} />
      <button onClick={() => {
        bridgeRef.current?.convert({
          requestId: generateRequestId(),
          type: 'convert',
          filename: 'doc.pdf',
          sourceFormat: 'pdf',
          targetFormat: 'html',
          buffer: fileArrayBuffer,
          options: { pdf: { ocr: true } }
        })
      }}>
        Convert
      </button>
    </>
  )
}
```

### Ref Methods

| Method | Signature | Behavior |
|--------|-----------|----------|
| `convert` | `(request) => Promise<ConversionResultPayload>` | Sends a convert request, returns result or rejects with BridgeError |
| `getProgress` | `() => ParserBridgeProgress \| null` | Returns the last known progress for the active request, or null |
| `cancel` | `(requestId: string) => Promise<void>` | Sends cancel, rejects the client-side promise immediately |

## Build / Dev / Test Commands

### Root (host + runtime)

| Command | Description |
|---------|-------------|
| `yarn build` | Builds parser runtime then host app |
| `yarn build:parser-runtime` | Builds iframe runtime standalone |
| `yarn dev` | Dev server on port 5073 |
| `yarn preview` | Preview production build on port 5073 |
| `yarn lint` | ESLint (zero warning target) |
| `yarn format` | Prettier formatting |
| `yarn test:run` | Vitest unit + integration tests |
| `yarn test:e2e` | Playwright E2E tests |
| `yarn test:e2e:headed` | Playwright E2E with visible browser |
| `yarn test:e2e:install` | Install Chromium for Playwright |

### Inside `packages/parser-runtime/`

| Command | Description |
|---------|-------------|
| `yarn build` | Build iframe runtime to root `dist/parser-runtime/` |
| `yarn dev` | Dev server on port 5174 (for testing iframe in isolation) |

The runtime is served at `/parser-runtime/index.html` under the host's base
path. The `getParserRuntimeUrl()` helper in `src/lib/parser-bridge/url.ts`
handles Vite dev, production, and GitHub Pages base-path variants.

### Platform Note (Playwright Chromium)
`yarn test:e2e` requires Chromium installed via `yarn test:e2e:install`.
On platforms where `playwright install` cannot resolve system dependencies
(notably `ubuntu26.04-x64`), E2E tests are skipped with a documented
platform limitation. All bridge protocol and queue logic is covered by
Vitest, which runs on any platform.

## Known Limits

1. **Single iframe instance** — the host renders one `ParserIframeBridge`.
   One active task at a time; queued tasks wait.
2. **Host bundle still includes some pdf-related code paths** — residual
   pdfjs worker and plugin references remain in the host Vite config.
   These are inert (no parser runtime code) but inflate the host bundle
   by ~447 KB for the pdfjs worker asset.
3. **E2E platform constraint** — as noted above, `ubuntu26.04-x64` cannot
   run Playwright Chromium. Test coverage relies on Vitest for that
   platform.
4. **No module-level multiprocessing** — the iframe runs on the main
   thread of its own window, not a Web Worker. This keeps pdfjs worker
   spawning and canvas APIs available, but a single heavy conversion
   blocks the iframe's event loop for other queued tasks.