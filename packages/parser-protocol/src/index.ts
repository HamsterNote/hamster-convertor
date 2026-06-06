/**
 * @hamster-note/parser-protocol
 *
 * 共享协议类型，用于 iframe 解析器桥接通信。
 * 所有类型均为纯类型定义，无运行时依赖。
 */

// ============================================================================
// 基础类型
// ============================================================================

/**
 * 解析器桥接请求 - 从主框架发送到 iframe
 */
export type ParserBridgeRequest = {
  requestId: string
  type: 'convert'
  filename: string
  sourceFormat: string
  targetFormat: string
  buffer: ArrayBuffer
  options?: Record<string, unknown>
}

/**
 * 取消请求 - 从主框架发送到 iframe
 */
export type ParserBridgeCancelRequest = {
  requestId: string
  type: 'cancel'
}

/**
 * 进度报告阶段
 */
export type ParserBridgeProgressPhase =
  | 'queued'
  | 'reading'
  | 'encoding'
  | 'decoding'
  | 'rendering'
  | 'packaging'
  | 'completed'
  | 'error'
  | 'cancelled'

/**
 * 进度报告 - 从 iframe 发送到主框架
 */
export type ParserBridgeProgress = {
  requestId: string
  phase: ParserBridgeProgressPhase
  percent: number
  queueLength: number
  message?: string
}

/**
 * 转换结果有效载荷
 */
export type ParserBridgeConversionResultPayload = {
  filename: string
  mimeType: string
  targetFormat: string
  buffer: ArrayBuffer
  warnings?: string[]
}

/**
 * 错误信息
 */
export type ParserBridgeError = {
  code: string
  message: string
  details?: Record<string, unknown>
}

/**
 * 转换响应 - 从 iframe 发送到主框架
 */
export type ParserBridgeResponse = {
  requestId: string
  type: 'convert:result' | 'convert:error' | 'progress'
  payload?: ParserBridgeConversionResultPayload
  error?: ParserBridgeError
  progress?: ParserBridgeProgress
}

/**
 * 就绪消息 - iframe 加载完成后发送
 */
export type ParserBridgeReadyMessage = {
  type: 'ready'
}

/**
 * 转换选项 - 透传给具体解析器
 */
export type ParserBridgeConversionOptions = {
  /** 最大页数限制（PDF 等） */
  maxPages?: number
  /** 页面加载超时时间（毫秒） */
  pageLoadTimeoutMs?: number
  /** 文本控制选项（HTML 解码） */
  textControl?: {
    fontSize?: number
    lineHeight?: number
    fontWeight?: number
    italic?: boolean
    color?: string
    fontFamily?: string
    vertical?: string
    dir?: string
  }
  /** 背景选项（HTML 解码） */
  background?: {
    includeBackground?: boolean
    backgroundQuality?: number
    excludeTextFromBackground?: boolean
  }
  /** 渲染选项 */
  render?: {
    scale?: number
    views?: ('TEXT' | 'THUMBNAIL')[]
  }
  /** 其他自定义选项 */
  [key: string]: unknown
}

// ============================================================================
// 类型守卫函数
// ============================================================================

/**
 * 检查值是否为非空对象
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 检查值是否为字符串
 */
function isString(value: unknown): value is string {
  return typeof value === 'string'
}

/**
 * 检查值是否为数字
 */
function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value)
}

/**
 * 检查值是否为 ArrayBuffer
 */
function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer
}

/**
 * 验证 ParserBridgeRequest
 *
 * 拒绝条件：
 * - 非对象
 * - requestId 缺失或非字符串
 * - type 不是 'convert'
 * - filename 缺失或非字符串
 * - sourceFormat 缺失或非字符串
 * - targetFormat 缺失或非字符串
 * - buffer 缺失或非 ArrayBuffer
 */
export function isParserBridgeRequest(value: unknown): value is ParserBridgeRequest {
  if (!isRecord(value)) return false

  const { requestId, type, filename, sourceFormat, targetFormat, buffer } = value

  return (
    isString(requestId) &&
    type === 'convert' &&
    isString(filename) &&
    isString(sourceFormat) &&
    isString(targetFormat) &&
    isArrayBuffer(buffer)
  )
}

/**
 * 验证 ParserBridgeCancelRequest
 *
 * 拒绝条件：
 * - 非对象
 * - requestId 缺失或非字符串
 * - type 不是 'cancel'
 */
export function isParserBridgeCancelRequest(value: unknown): value is ParserBridgeCancelRequest {
  if (!isRecord(value)) return false

  const { requestId, type } = value

  return isString(requestId) && type === 'cancel'
}

/**
 * 验证 ParserBridgeProgress
 *
 * 拒绝条件：
 * - 非对象
 * - requestId 缺失或非字符串
 * - phase 缺失或不在允许列表中
 * - percent 缺失或非数字
 * - queueLength 缺失或非数字
 */
export function isParserBridgeProgress(value: unknown): value is ParserBridgeProgress {
  if (!isRecord(value)) return false

  const { requestId, phase, percent, queueLength } = value

  const validPhases: readonly string[] = [
    'queued',
    'reading',
    'encoding',
    'decoding',
    'rendering',
    'packaging',
    'completed',
    'error',
    'cancelled'
  ]

  return (
    isString(requestId) &&
    isString(phase) &&
    validPhases.includes(phase) &&
    isNumber(percent) &&
    isNumber(queueLength)
  )
}

/**
 * 验证 ParserBridgeConversionResultPayload
 *
 * 拒绝条件：
 * - 非对象
 * - filename 缺失或非字符串
 * - mimeType 缺失或非字符串
 * - targetFormat 缺失或非字符串
 * - buffer 缺失或非 ArrayBuffer
 */
export function isParserBridgeConversionResultPayload(
  value: unknown
): value is ParserBridgeConversionResultPayload {
  if (!isRecord(value)) return false

  const { filename, mimeType, targetFormat, buffer } = value

  return isString(filename) && isString(mimeType) && isString(targetFormat) && isArrayBuffer(buffer)
}

/**
 * 验证 ParserBridgeError
 *
 * 拒绝条件：
 * - 非对象
 * - code 缺失或非字符串
 * - message 缺失或非字符串
 */
export function isParserBridgeError(value: unknown): value is ParserBridgeError {
  if (!isRecord(value)) return false

  const { code, message } = value

  return isString(code) && isString(message)
}

/**
 * 验证 ParserBridgeResponse
 *
 * 拒绝条件：
 * - 非对象
 * - requestId 缺失或非字符串
 * - type 不是 'convert:result' | 'convert:error' | 'progress'
 * - type 为 'convert:result' 时 payload 无效
 * - type 为 'convert:error' 时 error 无效
 * - type 为 'progress' 时 progress 无效
 */
export function isParserBridgeResponse(value: unknown): value is ParserBridgeResponse {
  if (!isRecord(value)) return false

  const { requestId, type, payload, error, progress } = value

  if (!isString(requestId)) return false

  if (type === 'convert:result') {
    return isParserBridgeConversionResultPayload(payload)
  }

  if (type === 'convert:error') {
    return isParserBridgeError(error)
  }

  if (type === 'progress') {
    return isParserBridgeProgress(progress)
  }

  return false
}

/**
 * 验证 ParserBridgeReadyMessage
 *
 * 拒绝条件：
 * - 非对象
 * - type 不是 'ready'
 */
export function isParserBridgeReadyMessage(value: unknown): value is ParserBridgeReadyMessage {
  if (!isRecord(value)) return false

  return value.type === 'ready'
}

/**
 * 验证 ParserBridgeConversionOptions
 *
 * 所有字段均为可选，仅检查是否为对象
 */
export function isParserBridgeConversionOptions(
  value: unknown
): value is ParserBridgeConversionOptions {
  return isRecord(value)
}

// ============================================================================
// 类型别名 - 基于解析器包的类型推断
// ============================================================================

/**
 * 从 @hamster-note/html-parser 的 encode 参数推断
 * Parameters<typeof HtmlParser.encode>[0]
 */
export type HtmlParserEncodeInput = Parameters<
  typeof import('@hamster-note/html-parser').HtmlParser.encode
>[0]

/**
 * 从 @hamster-note/html-parser 的 decode 返回类型推断
 * Awaited<ReturnType<typeof HtmlParser.decode>>
 */
export type HtmlParserDecodeResult = Awaited<
  ReturnType<typeof import('@hamster-note/html-parser').HtmlParser.decode>
>

/**
 * 从 @hamster-note/pdf-parser 的 encode 参数推断
 * Parameters<typeof PdfParser.encode>[0]
 */
export type PdfParserEncodeInput = Parameters<
  typeof import('@hamster-note/pdf-parser').PdfParser.encode
>[0]

/**
 * 从 @hamster-note/pdf-parser 的 decode 返回类型推断
 * Awaited<ReturnType<typeof PdfParser.decode>>
 */
export type PdfParserDecodeResult = Awaited<
  ReturnType<typeof import('@hamster-note/pdf-parser').PdfParser.decode>
>
