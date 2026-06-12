import {
  type ConversionOptions,
  type ConversionResult,
  convertRuntime,
  type ExifCategory,
  type ImageOptions,
  type ImageToPdfOptions,
  type SourceFormat,
  type TargetFormat
} from './conversion'

type ParserBridgeRequest = {
  requestId: string
  type: 'convert'
  filename: string
  sourceFormat: string
  targetFormat: string
  buffer: ArrayBuffer
  options?: Record<string, unknown>
}

type ParserBridgeCancelRequest = {
  requestId: string
  type: 'cancel'
}

type ParserBridgeProgressPhase =
  | 'queued'
  | 'reading'
  | 'encoding'
  | 'decoding'
  | 'rendering'
  | 'packaging'
  | 'completed'
  | 'error'
  | 'cancelled'

type ParserBridgeProgress = {
  requestId: string
  phase: ParserBridgeProgressPhase
  percent: number
  queueLength: number
  message?: string
}

type ParserBridgeConversionResultPayload = {
  filename: string
  mimeType: string
  targetFormat: string
  buffer: ArrayBuffer
  warnings?: string[]
}

type ParserBridgeError = {
  code: string
  message: string
  details?: Record<string, unknown>
}

type ParserBridgeResponse = {
  requestId: string
  type: 'convert:result' | 'convert:error' | 'progress'
  payload?: ParserBridgeConversionResultPayload | ParserBridgeConversionResultPayload[]
  error?: ParserBridgeError
  progress?: ParserBridgeProgress
}

export type ConversionTask = {
  requestId: string
  filename: string
  sourceFormat: string
  targetFormat: string
  buffer: ArrayBuffer
  options?: Record<string, unknown>
  status: 'queued' | 'active' | 'completed' | 'cancelled' | 'error'
  progress?: ParserBridgeProgress
  result?: ParserBridgeConversionResultPayload[]
  error?: ParserBridgeError
}

export type ProtocolServer = {
  enqueue(task: ConversionTask): void
  cancel(requestId: string): boolean
  getQueueLength(): number
  getActiveTask(): ConversionTask | null
  getProgress(requestId: string): ParserBridgeProgress | null
  dispose(): void
}

const conversionStages: readonly Exclude<
  ParserBridgeProgressPhase,
  'queued' | 'completed' | 'error' | 'cancelled'
>[] = ['reading', 'encoding', 'decoding', 'rendering', 'packaging']

const stagePercents: Record<ParserBridgeProgressPhase, number> = {
  queued: 0,
  reading: 15,
  encoding: 35,
  decoding: 55,
  rendering: 75,
  packaging: 90,
  completed: 100,
  error: 100,
  cancelled: 100
}

const stageMessages: Record<ParserBridgeProgressPhase, string> = {
  queued: 'Request queued',
  reading: 'Reading source buffer',
  encoding: 'Encoding intermediate document',
  decoding: 'Decoding target format',
  rendering: 'Rendering output document',
  packaging: 'Packaging converted file',
  completed: 'Conversion completed',
  error: 'Conversion failed',
  cancelled: 'Conversion cancelled'
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isArrayBuffer = (value: unknown): value is ArrayBuffer => value instanceof ArrayBuffer

const isNumberArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every(item => typeof item === 'number')

const EXIF_CATEGORIES = [
  'all',
  'geolocation',
  'camera',
  'datetime',
  'software',
  'authorCopyright'
] as const satisfies readonly ExifCategory[]

const ROTATION_DEGREES = [
  0, 90, 180, 270
] as const satisfies readonly ImageToPdfOptions['rotationDeg'][]

const isSourceFormat = (value: string): value is SourceFormat =>
  ['pdf', 'txt', 'image', 'html', 'docx'].includes(value)

const isTargetFormat = (value: string): value is TargetFormat =>
  ['html', 'txt', 'png', 'jpg', 'webp', 'pdf'].includes(value)

const isParserBridgeRequest = (value: unknown): value is ParserBridgeRequest => {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.requestId === 'string' &&
    value.type === 'convert' &&
    typeof value.filename === 'string' &&
    typeof value.sourceFormat === 'string' &&
    typeof value.targetFormat === 'string' &&
    isArrayBuffer(value.buffer)
  )
}

const isParserBridgeCancelRequest = (value: unknown): value is ParserBridgeCancelRequest => {
  if (!isRecord(value)) {
    return false
  }

  return typeof value.requestId === 'string' && value.type === 'cancel'
}

const getRequestId = (value: unknown): string => {
  if (!isRecord(value) || typeof value.requestId !== 'string') {
    return '__unknown__'
  }

  return value.requestId
}

const createError = (
  code: string,
  message: string,
  details?: Record<string, unknown>
): ParserBridgeError => ({ code, message, details })

const createTaskFromRequest = (request: ParserBridgeRequest): ConversionTask => ({
  requestId: request.requestId,
  filename: request.filename,
  sourceFormat: request.sourceFormat,
  targetFormat: request.targetFormat,
  buffer: request.buffer,
  options: request.options,
  status: 'queued'
})

const readNestedRecord = (
  record: Record<string, unknown>,
  key: string
): Record<string, unknown> | undefined => {
  const value = record[key]
  return isRecord(value) ? value : undefined
}

const clampNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.min(Math.max(value, min), max)
}

const normalizeImageDimension = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    return undefined
  }

  return Math.floor(value)
}

const normalizeRotationDeg = (value: unknown): ImageToPdfOptions['rotationDeg'] =>
  ROTATION_DEGREES.includes(value as ImageToPdfOptions['rotationDeg'])
    ? (value as ImageToPdfOptions['rotationDeg'])
    : 0

const normalizeExifCategories = (value: unknown): ExifCategory[] => {
  if (!Array.isArray(value)) {
    return []
  }

  const categories = value.filter((item): item is ExifCategory =>
    EXIF_CATEGORIES.includes(item as ExifCategory)
  )
  const uniqueCategories = [...new Set(categories)]
  return uniqueCategories.includes('all') ? ['all'] : uniqueCategories
}

const normalizeImageOptions = (value?: Record<string, unknown>): ImageOptions | undefined => {
  if (!value) {
    return undefined
  }

  const removeExif = readNestedRecord(value, 'removeExif')

  return {
    quality: clampNumber(value.quality, 0.92, 0.1, 1),
    maxWidth: normalizeImageDimension(value.maxWidth),
    maxHeight: normalizeImageDimension(value.maxHeight),
    keepAspectRatio: typeof value.keepAspectRatio === 'boolean' ? value.keepAspectRatio : true,
    removeExif: {
      enabled: typeof removeExif?.enabled === 'boolean' ? removeExif.enabled : false,
      categories: normalizeExifCategories(removeExif?.categories)
    }
  }
}

const normalizeImageToPdfOptions = (
  value?: Record<string, unknown>
): ImageToPdfOptions | undefined => {
  if (!value) {
    return undefined
  }

  // 验证 fit：只允许 'cover' 或 'contain'，默认 'cover'
  const validFits: ImageToPdfOptions['fit'][] = ['cover', 'contain']
  const fit = validFits.includes(value.fit as ImageToPdfOptions['fit'])
    ? (value.fit as ImageToPdfOptions['fit'])
    : 'cover'

  // 验证 pageMode：只允许 'auto'、'single'、'multi'，默认 'auto'
  const validPageModes: ImageToPdfOptions['pageMode'][] = ['auto', 'single', 'multi']
  const pageMode = validPageModes.includes(value.pageMode as ImageToPdfOptions['pageMode'])
    ? (value.pageMode as ImageToPdfOptions['pageMode'])
    : 'auto'

  return {
    marginPt: typeof value.marginPt === 'number' ? value.marginPt : 24,
    fit,
    pageMode,
    rotationDeg: normalizeRotationDeg(value.rotationDeg),
    scalePercent: clampNumber(value.scalePercent, 100, 10, 300)
  }
}

const normalizeConversionOptions = (
  options?: Record<string, unknown>
): ConversionOptions | undefined => {
  if (!options) {
    return undefined
  }

  const pdf = readNestedRecord(options, 'pdf')
  const decode = readNestedRecord(options, 'decode')
  const layout = readNestedRecord(options, 'layout')
  const image = readNestedRecord(options, 'image')
  const imageToPdf = readNestedRecord(options, 'imageToPdf')
  const normalized: ConversionOptions = {}

  if (pdf) {
    normalized.pdf = {
      ocr: typeof pdf.ocr === 'boolean' ? pdf.ocr : undefined,
      selectedPages: isNumberArray(pdf.selectedPages) ? pdf.selectedPages : undefined,
      selectedImagePages: isNumberArray(pdf.selectedImagePages) ? pdf.selectedImagePages : undefined
    }
  }

  if (decode) {
    normalized.decode = decode as ConversionOptions['decode']
  }

  if (layout) {
    normalized.layout = layout as ConversionOptions['layout']
  }

  const normalizedImage = normalizeImageOptions(image)
  if (normalizedImage) {
    normalized.image = normalizedImage
  }

  const normalizedImageToPdf = normalizeImageToPdfOptions(imageToPdf)
  if (normalizedImageToPdf) {
    normalized.imageToPdf = normalizedImageToPdf
  }

  return normalized
}

const normalizeWarnings = (warnings: ConversionResult['warnings']): string[] | undefined => {
  if (!warnings || warnings.length === 0) {
    return undefined
  }

  return warnings.map(warning => (typeof warning === 'string' ? warning : warning.message))
}

const isErrorWithCode = (error: unknown): error is Error & { code: string } =>
  error instanceof Error && 'code' in error && typeof error.code === 'string'

const createErrorFromUnknown = (error: unknown): ParserBridgeError => {
  if (isErrorWithCode(error)) {
    return createError(error.code, error.message)
  }

  if (error instanceof Error) {
    return createError('CONVERSION_FAILED', error.message)
  }

  return createError('CONVERSION_FAILED', String(error))
}

const nextStageTick = () => new Promise<void>(resolve => globalThis.setTimeout(resolve, 0))

export function createProtocolServer(port: MessagePort): ProtocolServer {
  const queue: ConversionTask[] = []
  const knownRequestIds = new Set<string>()
  const progressByRequestId = new Map<string, ParserBridgeProgress>()
  const cancelledActiveRequestIds = new Set<string>()
  let activeTask: ConversionTask | null = null
  let disposed = false
  let processing = false

  const postResponse = (response: ParserBridgeResponse) => {
    port.postMessage(response)
  }

  const emitReady = () => {
    port.postMessage({ type: 'ready' })
  }

  const emitProgress = (task: ConversionTask, phase: ParserBridgeProgressPhase) => {
    const progress: ParserBridgeProgress = {
      requestId: task.requestId,
      phase,
      percent: stagePercents[phase],
      queueLength: queue.length,
      message: stageMessages[phase]
    }

    task.progress = progress
    progressByRequestId.set(task.requestId, progress)
    postResponse({ requestId: task.requestId, type: 'progress', progress })
  }

  const emitError = (requestId: string, error: ParserBridgeError) => {
    progressByRequestId.set(requestId, {
      requestId,
      phase: 'error',
      percent: stagePercents.error,
      queueLength: queue.length,
      message: error.message
    })
    postResponse({ requestId, type: 'convert:error', error })
  }

  const rejectDuplicate = (requestId: string) => {
    emitError(
      requestId,
      createError('DUPLICATE_REQUEST_ID', `Request ID already exists: ${requestId}`)
    )
  }

  const rejectInvalidMessage = (message: unknown) => {
    emitError(
      getRequestId(message),
      createError('INVALID_PROTOCOL_MESSAGE', 'Message does not match parser bridge protocol')
    )
  }

  const runConversion = async (
    task: ConversionTask
  ): Promise<ParserBridgeConversionResultPayload[]> => {
    if (!isSourceFormat(task.sourceFormat) || !isTargetFormat(task.targetFormat)) {
      throw createError(
        'UNSUPPORTED_CONVERSION',
        `Unsupported conversion: ${task.sourceFormat} to ${task.targetFormat}`,
        { source: task.sourceFormat, target: task.targetFormat }
      )
    }

    const results = await convertRuntime({
      filename: task.filename,
      sourceFormat: task.sourceFormat,
      targetFormat: task.targetFormat,
      buffer: task.buffer,
      options: normalizeConversionOptions(task.options)
    })
    if (results.length === 0) {
      throw createError('CONVERSION_FAILED', 'Conversion produced no output')
    }

    return results.map(result => ({
      filename: result.filename,
      mimeType: result.mimeType,
      targetFormat: result.targetFormat,
      buffer: result.buffer,
      warnings: normalizeWarnings(result.warnings)
    }))
  }

  const completeTask = (task: ConversionTask, result: ParserBridgeConversionResultPayload[]) => {
    if (disposed || task.status === 'cancelled' || cancelledActiveRequestIds.has(task.requestId)) {
      console.warn(
        '[parser-runtime] Ignored late conversion result after cancellation:',
        task.requestId
      )
      return
    }

    task.status = 'completed'
    task.result = result
    emitProgress(task, 'completed')
    postResponse({
      requestId: task.requestId,
      type: 'convert:result',
      payload: result.length === 1 ? result[0] : result
    })
  }

  const cancelActiveAtBoundary = (task: ConversionTask) => {
    task.status = 'cancelled'
    cancelledActiveRequestIds.delete(task.requestId)
    emitProgress(task, 'cancelled')
  }

  // 将未知错误转换为 ParserBridgeError（提取嵌套三元表达式）
  const toParserError = (error: unknown): ParserBridgeError => {
    if (isRecord(error) && typeof error.code === 'string' && typeof error.message === 'string') {
      const details = isRecord(error.details) ? error.details : undefined
      return createError(error.code, error.message, details)
    }
    return createErrorFromUnknown(error)
  }

  // 处理任务错误
  const handleTaskError = (task: ConversionTask, error: unknown) => {
    const parserError = toParserError(error)
    task.status = 'error'
    task.error = parserError
    emitProgress(task, 'error')
    emitError(task.requestId, parserError)
  }

  // 执行转换阶段迭代
  const runStages = async (task: ConversionTask): Promise<boolean> => {
    for (const stage of conversionStages) {
      if (disposed) {
        return false
      }

      if (cancelledActiveRequestIds.has(task.requestId)) {
        cancelActiveAtBoundary(task)
        return false
      }

      emitProgress(task, stage)
      await nextStageTick()
    }
    return true
  }

  // 处理单个任务的转换执行
  const processTask = async (task: ConversionTask) => {
    const completed = await runStages(task)
    if (!completed) {
      return
    }

    if (!disposed && task.status === 'active') {
      if (cancelledActiveRequestIds.has(task.requestId)) {
        cancelActiveAtBoundary(task)
      } else {
        try {
          completeTask(task, await runConversion(task))
        } catch (error) {
          handleTaskError(task, error)
        }
      }
    }
  }

  const processNext = async () => {
    if (processing || disposed) {
      return
    }

    processing = true

    try {
      while (!disposed && queue.length > 0) {
        const task = queue.shift()
        if (!task) {
          break
        }

        activeTask = task
        task.status = 'active'
        await processTask(task)
        activeTask = null
      }
    } catch (error) {
      if (activeTask) {
        handleTaskError(activeTask, error)
      }
    } finally {
      activeTask = null
      processing = false

      if (!disposed && queue.length > 0) {
        void processNext()
      }
    }
  }

  const enqueue = (task: ConversionTask) => {
    if (disposed) {
      return
    }

    if (knownRequestIds.has(task.requestId)) {
      rejectDuplicate(task.requestId)
      return
    }

    knownRequestIds.add(task.requestId)
    task.status = 'queued'
    queue.push(task)
    emitProgress(task, 'queued')
    void processNext()
  }

  const cancel = (requestId: string): boolean => {
    const queuedIndex = queue.findIndex(task => task.requestId === requestId)
    if (queuedIndex >= 0) {
      const [task] = queue.splice(queuedIndex, 1)
      if (!task) {
        return false
      }

      task.status = 'cancelled'
      emitProgress(task, 'cancelled')
      return true
    }

    if (activeTask?.requestId === requestId) {
      cancelledActiveRequestIds.add(requestId)
      return true
    }

    return false
  }

  const onMessage = (event: MessageEvent<unknown>) => {
    if (disposed) {
      return
    }

    const message = event.data
    if (isParserBridgeRequest(message)) {
      enqueue(createTaskFromRequest(message))
      return
    }

    if (isParserBridgeCancelRequest(message)) {
      cancel(message.requestId)
      return
    }

    rejectInvalidMessage(message)
  }

  port.addEventListener('message', onMessage)
  port.start()
  emitReady()

  return {
    enqueue,
    cancel,
    getQueueLength: () => queue.length,
    getActiveTask: () => activeTask,
    getProgress: (requestId: string) => progressByRequestId.get(requestId) ?? null,
    dispose: () => {
      disposed = true
      queue.length = 0
      cancelledActiveRequestIds.clear()
      port.removeEventListener('message', onMessage)
      port.close()
    }
  }
}
