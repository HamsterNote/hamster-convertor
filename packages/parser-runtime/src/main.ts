import * as DocumentParser from '@hamster-note/document-parser'
import * as HtmlParser from '@hamster-note/html-parser'
import * as ImageParser from '@hamster-note/image-parser'
import * as PdfParser from '@hamster-note/pdf-parser'
import * as TxtParser from '@hamster-note/txt-parser'
import type { IntermediateDocument } from '@hamster-note/types'
import { createProtocolServer, type ProtocolServer } from './server'

type ParserRuntimeReadyMessage = {
  source: 'hamster-parser-runtime'
  type: 'ready'
  parserNames: string[]
}

type ParserRuntimeState = {
  parserNames: string[]
  lastDocument?: IntermediateDocument
}

type ParserRuntimeConnectMessage = {
  type: 'parser-bridge:connect'
}

const parserModules = {
  document: DocumentParser,
  html: HtmlParser,
  image: ImageParser,
  pdf: PdfParser,
  txt: TxtParser
} as const

const runtimeState: ParserRuntimeState = {
  parserNames: Object.keys(parserModules)
}

const readyMessage: ParserRuntimeReadyMessage = {
  source: 'hamster-parser-runtime',
  type: 'ready',
  parserNames: runtimeState.parserNames
}

let protocolServer: ProtocolServer | null = null

const isConnectMessage = (value: unknown): value is ParserRuntimeConnectMessage =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  'type' in value &&
  value.type === 'parser-bridge:connect'

const postReady = () => {
  window.parent.postMessage(readyMessage, '*')
}

window.addEventListener('message', event => {
  if (!isConnectMessage(event.data) || event.ports.length === 0) {
    return
  }

  protocolServer?.dispose()
  protocolServer = createProtocolServer(event.ports[0])
  console.info('[parser-runtime] Protocol server connected')
})

console.info('[parser-runtime] Ready with parser packages:', runtimeState.parserNames)
postReady()
