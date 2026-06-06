/**
 * parser-bridge 集成测试：通过 mock bridge 验证 convertViaBridge 端到端
 *
 * 测试范围：
 * - 正常转换返回 ConversionResult（含 Blob）
 * - 转换失败正确抛错
 * - options 正确透传
 * - warnings 正确传递
 * - 不支持的 target format 被拒绝
 * - 多文件并发生成唯一 requestId
 */

import { describe, expect, it, vi, afterEach } from 'vitest'
import { convertViaBridge } from '../lib/parser-bridge/proxy'
import type { ParserIframeBridgeRef } from '../components/ParserIframeBridge'

const createTestFile = (name: string, content: string): File => {
  const buffer = new TextEncoder().encode(content)
  return new File([buffer], name, { type: 'application/pdf' })
}

const createSimpleMockBridge = (
  onConvert: (request: {
    requestId: string
    filename: string
    sourceFormat: string
    targetFormat: string
    buffer: ArrayBuffer
    options?: Record<string, unknown>
  }) => { filename: string; mimeType: string; targetFormat: string; buffer: ArrayBuffer; warnings?: string[] } | Error
): ParserIframeBridgeRef => ({
  convert: vi.fn(async (request) => {
    const result = onConvert(request)
    if (result instanceof Error) {
      throw result
    }
    return result
  }),
  getProgress: vi.fn(() => null),
  cancel: vi.fn(async () => undefined)
})

describe('convertViaBridge integration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('completes full conversion round-trip returning blob with correct fields', async () => {
    const bridge = createSimpleMockBridge((request) => ({
      filename: request.filename.replace(/\.pdf$/i, '.html'),
      mimeType: 'text/html;charset=utf-8',
      targetFormat: 'html',
      buffer: new TextEncoder().encode('<html>converted</html>').buffer
    }))

    const file = createTestFile('test.pdf', '%PDF-1.4 mock content')
    const result = await convertViaBridge(bridge, file, 'pdf', 'html')

    expect(bridge.convert).toHaveBeenCalledTimes(1)

    const callArgs = (bridge.convert as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArgs.type).toBe('convert')
    expect(callArgs.filename).toBe('test.pdf')
    expect(callArgs.sourceFormat).toBe('pdf')
    expect(callArgs.targetFormat).toBe('html')
    expect(callArgs.buffer).toBeInstanceOf(ArrayBuffer)
    expect(typeof callArgs.requestId).toBe('string')
    expect(callArgs.requestId.length).toBeGreaterThan(0)

    expect(result.filename).toBe('test.html')
    expect(result.mimeType).toBe('text/html;charset=utf-8')
    expect(result.targetFormat).toBe('html')
    expect(result.blob).toBeInstanceOf(Blob)
    expect(result.warnings).toBeUndefined()
  })

  it('propagates bridge error to caller', async () => {
    const bridge = createSimpleMockBridge(() => {
      throw new Error('CONVERSION_FAILED: bad input')
    })

    const file = createTestFile('bad.pdf', 'corrupted')
    await expect(convertViaBridge(bridge, file, 'pdf', 'html')).rejects.toThrow(
      'CONVERSION_FAILED'
    )
  })

  it('passes options through to bridge request', async () => {
    let capturedOptions: Record<string, unknown> | undefined
    const bridge = createSimpleMockBridge((request) => {
      capturedOptions = request.options
      return {
        filename: 'options.html',
        mimeType: 'text/html;charset=utf-8',
        targetFormat: 'html',
        buffer: new ArrayBuffer(4)
      }
    })

    const file = createTestFile('options.pdf', '%PDF')
    const options = {
      pdf: { ocr: true, selectedPages: [1, 3] },
      decode: {
        background: { includeBackground: true, backgroundQuality: 0.6 }
      }
    }

    await convertViaBridge(bridge, file, 'pdf', 'html', options)

    expect(capturedOptions).toEqual(options)
  })

  it('propagates warnings from bridge result', async () => {
    const bridge = createSimpleMockBridge(() => ({
      filename: 'warn.html',
      mimeType: 'text/html;charset=utf-8',
      targetFormat: 'html',
      buffer: new ArrayBuffer(4),
      warnings: ['OCR quality low', 'Missing font fallback']
    }))

    const file = createTestFile('warn.pdf', '%PDF')
    const result = await convertViaBridge(bridge, file, 'pdf', 'html')

    expect(result.warnings).toEqual(['OCR quality low', 'Missing font fallback'])
  })

  it('rejects unsupported target format from bridge result', async () => {
    const bridge = createSimpleMockBridge(() => ({
      filename: 'output.xyz',
      mimeType: 'application/octet-stream',
      targetFormat: 'xyz',
      buffer: new ArrayBuffer(4)
    }))

    const file = createTestFile('bad-target.pdf', '%PDF')
    await expect(convertViaBridge(bridge, file, 'pdf', 'html')).rejects.toThrow(
      'Unsupported bridge target format'
    )
  })

  it('generates unique requestIds for concurrent calls', async () => {
    const capturedRequestIds: string[] = []
    const bridge = createSimpleMockBridge((request) => {
      capturedRequestIds.push(request.requestId)
      return {
        filename: `${request.filename}.html`,
        mimeType: 'text/html;charset=utf-8',
        targetFormat: 'html',
        buffer: new ArrayBuffer(1)
      }
    })

    const file1 = createTestFile('a.pdf', 'A')
    const file2 = createTestFile('b.pdf', 'B')

    const [r1, r2] = await Promise.all([
      convertViaBridge(bridge, file1, 'pdf', 'html'),
      convertViaBridge(bridge, file2, 'pdf', 'html')
    ])

    expect(capturedRequestIds).toHaveLength(2)
    expect(capturedRequestIds[0]).not.toBe(capturedRequestIds[1])
    expect(r1.filename).toBe('a.pdf.html')
    expect(r2.filename).toBe('b.pdf.html')
  })

  it('reads file content as ArrayBuffer and passes to bridge', async () => {
    const content = 'PDF binary content here'
    let capturedBuffer: ArrayBuffer | undefined

    const bridge = createSimpleMockBridge((request) => {
      capturedBuffer = request.buffer
      return {
        filename: 'reader.html',
        mimeType: 'text/html;charset=utf-8',
        targetFormat: 'html',
        buffer: new ArrayBuffer(1)
      }
    })

    const file = createTestFile('reader.pdf', content)
    await convertViaBridge(bridge, file, 'pdf', 'html')

    expect(capturedBuffer).toBeInstanceOf(ArrayBuffer)
    const decoded = new TextDecoder().decode(capturedBuffer)
    expect(decoded).toBe(content)
  })
})
