/**
 * parser-protocol 类型守卫测试
 *
 * 验证各种消息类型的验证逻辑：
 * - 未知消息类型被拒绝
 * - 缺少 requestId 被拒绝
 * - 非 ArrayBuffer 的输出有效载荷被拒绝
 */

import { describe, expect, it } from 'vitest'
import {
  isParserBridgeRequest,
  isParserBridgeCancelRequest,
  isParserBridgeResponse,
  isParserBridgeProgress,
  isParserBridgeConversionResultPayload,
  isParserBridgeError,
  isParserBridgeReadyMessage,
  isParserBridgeConversionOptions,
} from '../../packages/parser-protocol/src/index'

describe('isParserBridgeRequest', () => {
  it('接受有效的转换请求', () => {
    const valid = {
      requestId: 'req-001',
      type: 'convert',
      filename: 'test.pdf',
      sourceFormat: 'pdf',
      targetFormat: 'html',
      buffer: new ArrayBuffer(8),
    }
    expect(isParserBridgeRequest(valid)).toBe(true)
  })

  it('拒绝缺少 requestId 的请求', () => {
    const invalid = {
      type: 'convert',
      filename: 'test.pdf',
      sourceFormat: 'pdf',
      targetFormat: 'html',
      buffer: new ArrayBuffer(8),
    }
    expect(isParserBridgeRequest(invalid)).toBe(false)
  })

  it('拒绝 requestId 非字符串的请求', () => {
    const invalid = {
      requestId: 123,
      type: 'convert',
      filename: 'test.pdf',
      sourceFormat: 'pdf',
      targetFormat: 'html',
      buffer: new ArrayBuffer(8),
    }
    expect(isParserBridgeRequest(invalid)).toBe(false)
  })

  it('拒绝未知 type 的请求', () => {
    const invalid = {
      requestId: 'req-001',
      type: 'unknown',
      filename: 'test.pdf',
      sourceFormat: 'pdf',
      targetFormat: 'html',
      buffer: new ArrayBuffer(8),
    }
    expect(isParserBridgeRequest(invalid)).toBe(false)
  })

  it('拒绝 buffer 非 ArrayBuffer 的请求', () => {
    const invalid = {
      requestId: 'req-001',
      type: 'convert',
      filename: 'test.pdf',
      sourceFormat: 'pdf',
      targetFormat: 'html',
      buffer: 'not-an-arraybuffer',
    }
    expect(isParserBridgeRequest(invalid)).toBe(false)
  })

  it('拒绝非对象输入', () => {
    expect(isParserBridgeRequest(null)).toBe(false)
    expect(isParserBridgeRequest(undefined)).toBe(false)
    expect(isParserBridgeRequest('string')).toBe(false)
    expect(isParserBridgeRequest(42)).toBe(false)
  })
})

describe('isParserBridgeCancelRequest', () => {
  it('接受有效的取消请求', () => {
    const valid = {
      requestId: 'req-001',
      type: 'cancel',
    }
    expect(isParserBridgeCancelRequest(valid)).toBe(true)
  })

  it('拒绝缺少 requestId 的取消请求', () => {
    const invalid = {
      type: 'cancel',
    }
    expect(isParserBridgeCancelRequest(invalid)).toBe(false)
  })

  it('拒绝未知 type 的取消请求', () => {
    const invalid = {
      requestId: 'req-001',
      type: 'unknown',
    }
    expect(isParserBridgeCancelRequest(invalid)).toBe(false)
  })
})

describe('isParserBridgeProgress', () => {
  it('接受有效的进度报告', () => {
    const valid = {
      requestId: 'req-001',
      phase: 'encoding',
      percent: 50,
      queueLength: 3,
    }
    expect(isParserBridgeProgress(valid)).toBe(true)
  })

  it('接受所有有效的 phase 值', () => {
    const phases = [
      'queued',
      'reading',
      'encoding',
      'decoding',
      'rendering',
      'packaging',
      'completed',
      'error',
      'cancelled',
    ]

    for (const phase of phases) {
      const valid = {
        requestId: 'req-001',
        phase,
        percent: 0,
        queueLength: 0,
      }
      expect(isParserBridgeProgress(valid)).toBe(true)
    }
  })

  it('拒绝无效的 phase 值', () => {
    const invalid = {
      requestId: 'req-001',
      phase: 'invalid-phase',
      percent: 50,
      queueLength: 3,
    }
    expect(isParserBridgeProgress(invalid)).toBe(false)
  })

  it('拒绝缺少 percent 的进度报告', () => {
    const invalid = {
      requestId: 'req-001',
      phase: 'encoding',
      queueLength: 3,
    }
    expect(isParserBridgeProgress(invalid)).toBe(false)
  })

  it('拒绝 percent 非数字的进度报告', () => {
    const invalid = {
      requestId: 'req-001',
      phase: 'encoding',
      percent: 'fifty',
      queueLength: 3,
    }
    expect(isParserBridgeProgress(invalid)).toBe(false)
  })
})

describe('isParserBridgeConversionResultPayload', () => {
  it('接受有效的转换结果有效载荷', () => {
    const valid = {
      filename: 'output.html',
      mimeType: 'text/html',
      targetFormat: 'html',
      buffer: new ArrayBuffer(16),
    }
    expect(isParserBridgeConversionResultPayload(valid)).toBe(true)
  })

  it('接受包含可选 warnings 的有效载荷', () => {
    const valid = {
      filename: 'output.html',
      mimeType: 'text/html',
      targetFormat: 'html',
      buffer: new ArrayBuffer(16),
      warnings: ['minor issue'],
    }
    expect(isParserBridgeConversionResultPayload(valid)).toBe(true)
  })

  it('拒绝 buffer 非 ArrayBuffer 的有效载荷', () => {
    const invalid = {
      filename: 'output.html',
      mimeType: 'text/html',
      targetFormat: 'html',
      buffer: 'not-an-arraybuffer',
    }
    expect(isParserBridgeConversionResultPayload(invalid)).toBe(false)
  })

  it('拒绝 buffer 为 Uint8Array 的有效载荷', () => {
    const invalid = {
      filename: 'output.html',
      mimeType: 'text/html',
      targetFormat: 'html',
      buffer: new Uint8Array(16),
    }
    expect(isParserBridgeConversionResultPayload(invalid)).toBe(false)
  })

  it('拒绝缺少 filename 的有效载荷', () => {
    const invalid = {
      mimeType: 'text/html',
      targetFormat: 'html',
      buffer: new ArrayBuffer(16),
    }
    expect(isParserBridgeConversionResultPayload(invalid)).toBe(false)
  })
})

describe('isParserBridgeError', () => {
  it('接受有效的错误信息', () => {
    const valid = {
      code: 'CONVERT_FAILED',
      message: '转换失败',
    }
    expect(isParserBridgeError(valid)).toBe(true)
  })

  it('接受包含 details 的错误信息', () => {
    const valid = {
      code: 'CONVERT_FAILED',
      message: '转换失败',
      details: { reason: 'invalid format' },
    }
    expect(isParserBridgeError(valid)).toBe(true)
  })

  it('拒绝缺少 code 的错误信息', () => {
    const invalid = {
      message: '转换失败',
    }
    expect(isParserBridgeError(invalid)).toBe(false)
  })

  it('拒绝缺少 message 的错误信息', () => {
    const invalid = {
      code: 'CONVERT_FAILED',
    }
    expect(isParserBridgeError(invalid)).toBe(false)
  })
})

describe('isParserBridgeResponse', () => {
  it('接受有效的转换结果响应', () => {
    const valid = {
      requestId: 'req-001',
      type: 'convert:result',
      payload: {
        filename: 'output.html',
        mimeType: 'text/html',
        targetFormat: 'html',
        buffer: new ArrayBuffer(16),
      },
    }
    expect(isParserBridgeResponse(valid)).toBe(true)
  })

  it('接受有效的错误响应', () => {
    const valid = {
      requestId: 'req-001',
      type: 'convert:error',
      error: {
        code: 'CONVERT_FAILED',
        message: '转换失败',
      },
    }
    expect(isParserBridgeResponse(valid)).toBe(true)
  })

  it('接受有效的进度响应', () => {
    const valid = {
      requestId: 'req-001',
      type: 'progress',
      progress: {
        requestId: 'req-001',
        phase: 'encoding',
        percent: 50,
        queueLength: 3,
      },
    }
    expect(isParserBridgeResponse(valid)).toBe(true)
  })

  it('拒绝未知 type 的响应', () => {
    const invalid = {
      requestId: 'req-001',
      type: 'unknown',
    }
    expect(isParserBridgeResponse(invalid)).toBe(false)
  })

  it('拒绝缺少 requestId 的响应', () => {
    const invalid = {
      type: 'convert:result',
      payload: {
        filename: 'output.html',
        mimeType: 'text/html',
        targetFormat: 'html',
        buffer: new ArrayBuffer(16),
      },
    }
    expect(isParserBridgeResponse(invalid)).toBe(false)
  })

  it('拒绝 convert:result 类型但 payload 无效的响应', () => {
    const invalid = {
      requestId: 'req-001',
      type: 'convert:result',
      payload: {
        filename: 'output.html',
        mimeType: 'text/html',
        targetFormat: 'html',
        buffer: 'not-an-arraybuffer', // 非 ArrayBuffer
      },
    }
    expect(isParserBridgeResponse(invalid)).toBe(false)
  })

  it('拒绝 convert:error 类型但 error 无效的响应', () => {
    const invalid = {
      requestId: 'req-001',
      type: 'convert:error',
      error: {
        code: 123, // 非字符串
        message: '转换失败',
      },
    }
    expect(isParserBridgeResponse(invalid)).toBe(false)
  })

  it('拒绝 progress 类型但 progress 无效的响应', () => {
    const invalid = {
      requestId: 'req-001',
      type: 'progress',
      progress: {
        requestId: 'req-001',
        phase: 'invalid-phase', // 无效阶段
        percent: 50,
        queueLength: 3,
      },
    }
    expect(isParserBridgeResponse(invalid)).toBe(false)
  })
})

describe('isParserBridgeReadyMessage', () => {
  it('接受有效的就绪消息', () => {
    const valid = {
      type: 'ready',
    }
    expect(isParserBridgeReadyMessage(valid)).toBe(true)
  })

  it('拒绝未知 type 的就绪消息', () => {
    const invalid = {
      type: 'not-ready',
    }
    expect(isParserBridgeReadyMessage(invalid)).toBe(false)
  })

  it('拒绝非对象输入', () => {
    expect(isParserBridgeReadyMessage(null)).toBe(false)
    expect(isParserBridgeReadyMessage(undefined)).toBe(false)
    expect(isParserBridgeReadyMessage('ready')).toBe(false)
  })
})

describe('isParserBridgeConversionOptions', () => {
  it('接受空对象', () => {
    expect(isParserBridgeConversionOptions({})).toBe(true)
  })

  it('接受包含各种选项的对象', () => {
    const valid = {
      maxPages: 10,
      pageLoadTimeoutMs: 5000,
      textControl: {
        fontSize: 14,
        lineHeight: 1.5,
      },
      background: {
        includeBackground: true,
      },
      render: {
        scale: 2,
        views: ['TEXT' as const],
      },
    }
    expect(isParserBridgeConversionOptions(valid)).toBe(true)
  })

  it('拒绝非对象输入', () => {
    expect(isParserBridgeConversionOptions(null)).toBe(false)
    expect(isParserBridgeConversionOptions(undefined)).toBe(false)
    expect(isParserBridgeConversionOptions('options')).toBe(false)
    expect(isParserBridgeConversionOptions(42)).toBe(false)
  })
})
