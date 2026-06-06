import type { ParserBridgeRequest } from '@hamster-note/parser-protocol'
import type { ParserIframeBridgeRef } from '../../components/ParserIframeBridge'
import type { TargetFormat } from '../converter'
import { generateRequestId } from './client'

export type ConversionResult = {
  filename: string
  mimeType: string
  targetFormat: TargetFormat
  blob: Blob
  warnings?: string[]
}

const isTargetFormat = (value: string): value is TargetFormat =>
  ['html', 'txt', 'png', 'jpg', 'webp', 'pdf'].includes(value)

const readFileAsArrayBuffer = async (file: File): Promise<ArrayBuffer> => {
  if (file.arrayBuffer) {
    return file.arrayBuffer()
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result)
        return
      }

      reject(new Error('FileReader returned an unsupported result'))
    })
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('Failed to read file'))
    })
    reader.readAsArrayBuffer(file)
  })
}

export async function convertViaBridge(
  bridgeRef: ParserIframeBridgeRef,
  file: File,
  sourceFormat: string,
  targetFormat: TargetFormat,
  options?: Record<string, unknown>
): Promise<ConversionResult> {
  const buffer = await readFileAsArrayBuffer(file)
  const request: ParserBridgeRequest = {
    requestId: generateRequestId(),
    type: 'convert',
    filename: file.name,
    sourceFormat,
    targetFormat,
    buffer,
    options
  }

  const result = await bridgeRef.convert(request)
  if (!isTargetFormat(result.targetFormat)) {
    throw new Error(`Unsupported bridge target format: ${result.targetFormat}`)
  }

  return {
    filename: result.filename,
    mimeType: result.mimeType,
    targetFormat: result.targetFormat,
    blob: new Blob([result.buffer], { type: result.mimeType }),
    warnings: result.warnings
  }
}
