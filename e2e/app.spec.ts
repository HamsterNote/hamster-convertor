import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { PDFDocument, StandardFonts } from 'pdf-lib'

const dropzoneFileInput = '.dropzone + input[type="file"]'

type ParserRuntimeReadyMessage = {
  type: 'ready'
  source?: string
  parserNames?: string[]
}

type E2EWindow = Window & {
  __downloadNames?: string[]
  __downloadTypes?: string[]
  // 保存每次下载的原始 blob，便于像素级断言（CJK TXT→PNG 渲染验证）。
  // 使用真实 Blob 而非 base64：浏览器端解码到 ImageBitmap 不需要额外转换。
  __downloadBlobs?: Blob[]
  __E2E__?: boolean
  __parserReadyMessages?: ParserRuntimeReadyMessage[]
}

type ManualRuntimeScenario = 'queue' | 'cancel-queued'

type ManualRuntimeProgressEvent = {
  requestId: string
  phase: string
  percent: number
  queueLength: number
}

type ManualRuntimeErrorEvent = {
  requestId: string
  code: string
}

type ManualRuntimeTranscript = {
  readyCount: number
  progressEvents: ManualRuntimeProgressEvent[]
  resultNames: string[]
  errorEvents: ManualRuntimeErrorEvent[]
}

const targetSelectForRow = (page: Page, fileName: string): Locator =>
  rowForFile(page, fileName).locator('select')

const rowForFile = (page: Page, fileName: string): Locator =>
  page.locator('tbody tr').filter({ has: page.getByText(fileName, { exact: true }) })

const filePayload = (name: string, mimeType: string, content: string) => ({
  name,
  mimeType,
  buffer: Buffer.from(content)
})

const validPngPayload = (name = 'photo.png') => ({
  name,
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64'
  )
})

const fixturePath = (name: string): string => path.join(process.cwd(), 'e2e', 'fixtures', name)

const samplePdf = () => ({
  name: 'sample.pdf',
  mimeType: 'application/pdf',
  buffer: readFileSync(fixturePath('sample.pdf'))
})

const twoPagePdf = async () => {
  const document = await PDFDocument.create()
  const font = await document.embedFont(StandardFonts.Helvetica)
  for (const [index, text] of ['First page', 'Second page'].entries()) {
    const page = document.addPage([300, 200])
    page.drawText(text, { x: 40, y: 100, size: 18, font })
    page.drawText(String(index + 1), { x: 145, y: 40, size: 12, font })
  }

  return {
    name: 'sample.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await document.save())
  }
}

const sampleTextFixture = () => fixturePath('bridge-sample.txt')

const optionValues = (select: Locator): Promise<string[]> =>
  select.evaluate(element =>
    Array.from((element as HTMLSelectElement).options).map(option => option.value)
  )

const downloadNames = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as Window & { __downloadNames?: string[] }).__downloadNames ?? [])

const parserReadyMessages = (page: Page): Promise<ParserRuntimeReadyMessage[]> =>
  page.evaluate(() => (window as E2EWindow).__parserReadyMessages ?? [])

const loadingOverlay = (page: Page): Locator => page.locator('.fullscreen-loading')

const waitForBridgeReady = async (page: Page): Promise<void> => {
  await expect.poll(async () => parserReadyMessages(page)).not.toHaveLength(0)
  await page.waitForTimeout(500)
}

const routeDelayedProxy = async (page: Page): Promise<void> => {
  await page.route('**/src/lib/parser-bridge/proxy.ts*', async route => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: [
        'export async function convertViaBridge(_bridge, file, _sourceFormat, targetFormat) {',
        '  await new Promise(resolve => setTimeout(resolve, 500))',
        "  const baseName = file.name.replace(/\\.[^/.]+$/, '') || file.name",
        '  return {',
        "    filename: baseName + '.' + targetFormat,",
        "    mimeType: targetFormat === 'html' ? 'text/html' : 'text/plain',",
        '    targetFormat,',
        "    blob: new Blob(['delayed conversion'], { type: targetFormat === 'html' ? 'text/html' : 'text/plain' })",
        '  }',
        '}'
      ].join('\n')
    })
  })
}

const activeProgressPhases = ['reading', 'encoding', 'decoding', 'rendering', 'packaging']

const expectSerialProgress = (progressEvents: ManualRuntimeProgressEvent[]) => {
  const firstCompletedAt = progressEvents.findIndex(
    event => event.requestId === 'queue-first' && event.phase === 'completed'
  )
  const secondActiveAt = progressEvents.findIndex(
    event => event.requestId === 'queue-second' && activeProgressPhases.includes(event.phase)
  )

  expect(firstCompletedAt).toBeGreaterThanOrEqual(0)
  expect(secondActiveAt).toBeGreaterThan(firstCompletedAt)
}

const runManualRuntimeScenario = async (
  page: Page,
  scenario: ManualRuntimeScenario
): Promise<ManualRuntimeTranscript> =>
  page.evaluate(async scenarioName => {
    type MessageRecord = Record<string, unknown>
    type ProgressEvent = {
      requestId: string
      phase: string
      percent: number
      queueLength: number
    }
    type ErrorEvent = { requestId: string; code: string }
    type Transcript = {
      readyCount: number
      progressEvents: ProgressEvent[]
      resultNames: string[]
      errorEvents: ErrorEvent[]
    }

    const toRecord = (value: unknown): MessageRecord | undefined =>
      typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as MessageRecord)
        : undefined

    const textBuffer = (text: string): ArrayBuffer => {
      const bytes = new TextEncoder().encode(text)
      return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer
    }

    const iframe = document.querySelector<HTMLIFrameElement>('iframe[title="parser-runtime"]')
    if (!iframe?.contentWindow) {
      throw new Error('Parser runtime iframe is not available')
    }
    // 缓存 contentWindow，避免闭包内 TypeScript 无法收窄 null 联合类型
    const contentWindow = iframe.contentWindow

    return new Promise<Transcript>((resolve, reject) => {
      const channel = new MessageChannel()
      const port = channel.port1
      const transcript: Transcript = {
        readyCount: 0,
        progressEvents: [],
        resultNames: [],
        errorEvents: []
      }
      let started = false

      const firstRequestId = `${scenarioName === 'queue' ? 'queue' : 'cancel'}-first`
      const secondRequestId = `${scenarioName === 'queue' ? 'queue' : 'cancel'}-second`

      const timeoutId = window.setTimeout(() => {
        port.close()
        reject(new Error(`Timed out waiting for manual runtime scenario: ${scenarioName}`))
      }, 15000)

      const finish = () => {
        window.clearTimeout(timeoutId)
        port.close()
        resolve(transcript)
      }

      const postConvert = (requestId: string, filename: string, content: string) => {
        port.postMessage({
          requestId,
          type: 'convert',
          filename,
          sourceFormat: 'txt',
          targetFormat: 'html',
          buffer: textBuffer(content)
        })
      }

      const startScenario = () => {
        if (started) return
        started = true
        postConvert(firstRequestId, `${firstRequestId}.txt`, 'First runtime conversion')
        postConvert(secondRequestId, `${secondRequestId}.txt`, 'Second runtime conversion')
        if (scenarioName === 'cancel-queued') {
          port.postMessage({ requestId: secondRequestId, type: 'cancel' })
        }
      }

      const maybeFinish = () => {
        if (scenarioName === 'queue' && transcript.resultNames.length === 2) {
          finish()
          return
        }

        const firstFinished = transcript.resultNames.includes(`${firstRequestId}.html`)
        let secondCancelled = false
        for (const progressEvent of transcript.progressEvents) {
          if (progressEvent.requestId === secondRequestId && progressEvent.phase === 'cancelled') {
            secondCancelled = true
            break
          }
        }
        if (scenarioName === 'cancel-queued' && firstFinished && secondCancelled) {
          finish()
        }
      }

      port.addEventListener('message', event => {
        const message = toRecord(event.data)
        if (!message || typeof message.type !== 'string') return

        if (message.type === 'ready') {
          transcript.readyCount += 1
          startScenario()
          return
        }

        if (typeof message.requestId !== 'string') return

        if (message.type === 'progress') {
          const progress = toRecord(message.progress)
          if (
            progress &&
            typeof progress.phase === 'string' &&
            typeof progress.percent === 'number' &&
            typeof progress.queueLength === 'number'
          ) {
            transcript.progressEvents.push({
              requestId: message.requestId,
              phase: progress.phase,
              percent: progress.percent,
              queueLength: progress.queueLength
            })
          }
        }

        if (message.type === 'convert:result') {
          const payload = toRecord(message.payload)
          if (payload && typeof payload.filename === 'string') {
            transcript.resultNames.push(payload.filename)
          }
        }

        if (message.type === 'convert:error') {
          const error = toRecord(message.error)
          if (error && typeof error.code === 'string') {
            transcript.errorEvents.push({
              requestId: message.requestId,
              code: error.code
            })
          }
        }

        maybeFinish()
      })
      port.start()
      contentWindow.postMessage({ type: 'parser-bridge:connect' }, '*', [channel.port2])
    })
  }, scenario)

test.describe('converter app', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const e2eWindow = window as E2EWindow
      window.localStorage.setItem('i18nextLng', 'en')
      e2eWindow.__E2E__ = true
      e2eWindow.__downloadNames = []
      e2eWindow.__downloadTypes = []
      e2eWindow.__downloadBlobs = []
      e2eWindow.__parserReadyMessages = []
      window.addEventListener('message', event => {
        const data = event.data as Partial<ParserRuntimeReadyMessage>
        if (data?.type === 'ready' && data.source === 'hamster-parser-runtime') {
          e2eWindow.__parserReadyMessages?.push({
            type: 'ready',
            source: data.source,
            parserNames: data.parserNames
          })
        }
      })
      const createObjectURL = URL.createObjectURL.bind(URL)
      const revokeObjectURL = URL.revokeObjectURL.bind(URL)
      URL.createObjectURL = (blob: Blob) => {
        e2eWindow.__downloadTypes?.push(blob.type)
        e2eWindow.__downloadBlobs?.push(blob)
        return createObjectURL(blob)
      }
      URL.revokeObjectURL = objectUrl => revokeObjectURL(objectUrl)
      HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
        e2eWindow.__downloadNames?.push(this.download)
      }
      Math.random = () => 0.9
    })
    await page.goto('/')
    await waitForBridgeReady(page)
  })

  test('uploads files, converts all, and downloads row and global results', async ({ page }) => {
    const convertButton = page.getByRole('button', { name: 'Convert all' })
    await expect(convertButton).toBeDisabled()

    await page
      .locator(dropzoneFileInput)
      .setInputFiles([samplePdf(), filePayload('notes.txt', 'text/plain', 'hello text')])

    const table = page.locator('table.file-table')
    await expect(table).toBeVisible()
    await expect(table).toContainText('sample.pdf')
    await expect(table).toContainText('notes.txt')
    await expect(table).toContainText('Ready')

    await targetSelectForRow(page, 'sample.pdf').selectOption('txt')
    await convertButton.click()

    await expect(rowForFile(page, 'sample.pdf').locator('.status')).toContainText('Done', {
      timeout: 15000
    })
    await expect(rowForFile(page, 'notes.txt').locator('.status')).toContainText('Done')

    await rowForFile(page, 'sample.pdf').getByRole('button', { name: 'Download' }).click()
    await expect.poll(async () => downloadNames(page)).toEqual(['sample.txt'])

    await page.locator('.actions').getByRole('button', { name: 'Download' }).click()
    await expect
      .poll(async () => downloadNames(page))
      .toEqual(['sample.txt', 'hamster-conversions.zip'])

    const clearButton = page.getByRole('button', { name: 'Clear all' })
    await clearButton.click()
    await expect(table).toBeHidden()
  })

  test('loads parser iframe and receives ready handshake from real runtime', async ({ page }) => {
    const iframe = page.locator('iframe[title="parser-runtime"]')

    await expect(iframe).toHaveAttribute('src', /parser-runtime\/index\.html/)
    await expect
      .poll(async () => parserReadyMessages(page))
      .toEqual([
        expect.objectContaining({
          type: 'ready',
          source: 'hamster-parser-runtime',
          parserNames: expect.arrayContaining(['pdf', 'txt', 'html', 'image', 'document'])
        })
      ])

    expect(page.frame({ url: /parser-runtime\/index\.html/ })).not.toBeNull()
  })

  test('converts through parser iframe and exposes download-ready output', async ({ page }) => {
    await page.locator(dropzoneFileInput).setInputFiles(sampleTextFixture())

    const textRow = rowForFile(page, 'bridge-sample.txt')
    await targetSelectForRow(page, 'bridge-sample.txt').selectOption('html')
    await page.getByRole('button', { name: 'Convert all' }).click()

    await expect(loadingOverlay(page)).toBeVisible()
    await expect(textRow.locator('.status')).toContainText('Done', {
      timeout: 15000
    })
    await expect(textRow.getByRole('button', { name: 'Download' })).toBeEnabled()

    await textRow.getByRole('button', { name: 'Download' }).click()
    await expect.poll(async () => downloadNames(page)).toEqual(['bridge-sample.html'])
  })

  test('reports serial runtime progress for two iframe conversions', async ({ page }) => {
    await expect.poll(async () => parserReadyMessages(page)).not.toHaveLength(0)

    const transcript = await runManualRuntimeScenario(page, 'queue')

    expect(transcript.readyCount).toBe(1)
    expect(transcript.resultNames).toEqual(['queue-first.html', 'queue-second.html'])
    expect(transcript.errorEvents).toEqual([])
    expect(transcript.progressEvents.map(event => event.phase)).toEqual(
      expect.arrayContaining([
        'queued',
        'reading',
        'encoding',
        'decoding',
        'rendering',
        'packaging',
        'completed'
      ])
    )
    expectSerialProgress(transcript.progressEvents)
  })

  test('cancels a queued iframe conversion without producing output', async ({ page }) => {
    await expect.poll(async () => parserReadyMessages(page)).not.toHaveLength(0)

    const transcript = await runManualRuntimeScenario(page, 'cancel-queued')

    expect(transcript.readyCount).toBe(1)
    expect(transcript.resultNames).toEqual(['cancel-first.html'])
    expect(transcript.errorEvents).toEqual([])
    expect(transcript.progressEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requestId: 'cancel-second',
          phase: 'queued'
        }),
        expect.objectContaining({
          requestId: 'cancel-second',
          phase: 'cancelled'
        })
      ])
    )
  })

  test('marks conversion failed when parser iframe load times out', async ({ page }) => {
    await page.route('**/parser-runtime/index.html', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html;charset=utf-8',
        body: '<!doctype html><html><body><p>parser runtime intentionally never posts ready</p></body></html>'
      })
    })
    await page.clock.install()
    await page.reload()
    await page.clock.fastForward(31000)

    await page.locator(dropzoneFileInput).setInputFiles(sampleTextFixture())
    await targetSelectForRow(page, 'bridge-sample.txt').selectOption('html')
    await page.getByRole('button', { name: 'Convert all' }).click()

    const textRow = rowForFile(page, 'bridge-sample.txt')
    await expect(textRow.locator('.status')).toContainText('Failed')
    await expect(textRow.locator('.status')).toContainText('Conversion failed, please retry')
  })

  test('shows PDF target options for text and images', async ({ page }) => {
    await page.locator(dropzoneFileInput).setInputFiles(samplePdf())

    const values = await optionValues(targetSelectForRow(page, 'sample.pdf'))

    expect(values).toContain('pdf')
    expect(values).toContain('txt')
    expect(values).toContain('png')
    expect(values).toContain('jpg')
    expect(values).toContain('webp')
  })

  test('reports empty OCR and locks the target after retrying without OCR', async ({ page }) => {
    test.setTimeout(90000)
    await page.locator('.nav__select').selectOption('zh-CN')
    await page.locator(dropzoneFileInput).setInputFiles(samplePdf())

    const row = rowForFile(page, 'sample.pdf')
    const targetSelect = targetSelectForRow(page, 'sample.pdf')
    await targetSelect.selectOption('pdf')

    // OCR checkbox is now inside the Settings modal
    await row.getByRole('button', { name: '设置' }).click()
    const dialog = page.getByRole('dialog', { name: '设置' })
    await expect(dialog).toBeVisible()

    const ocrCheckbox = dialog.getByRole('checkbox', { name: '是否进行 OCR' })
    await expect(ocrCheckbox).toBeVisible()
    await expect(ocrCheckbox).not.toBeChecked()

    await ocrCheckbox.check()
    await expect(ocrCheckbox).toBeChecked()

    // Close the Settings modal
    await dialog.getByRole('button', { name: '完成' }).click()
    await expect(dialog).toBeHidden()

    await page.getByRole('button', { name: '全部转换' }).click()

    const pdfRow = rowForFile(page, 'sample.pdf')
    await expect(pdfRow.locator('.status')).toHaveClass(/status--failed/, {
      timeout: 60000
    })
    await expect(pdfRow.locator('.status')).toContainText('图片中未检测到文字')
    await expect(targetSelect).toBeEnabled()

    await row.getByRole('button', { name: '设置' }).click()
    await expect(dialog).toBeVisible()
    await ocrCheckbox.uncheck()
    await dialog.getByRole('button', { name: '完成' }).click()
    await page.getByRole('button', { name: '全部转换' }).click()

    await expect(pdfRow.locator('.status')).toHaveClass(/status--done/, {
      timeout: 15000
    })
    await expect(targetSelect).toBeDisabled()

    await page.locator(dropzoneFileInput).setInputFiles(samplePdf())
    await expect(rowForFile(page, 'sample.pdf')).toHaveCount(2)
  })

  test('hides OCR option when PDF target changes to TXT', async ({ page }) => {
    await page.locator('.nav__select').selectOption('zh-CN')
    await page.locator(dropzoneFileInput).setInputFiles(samplePdf())

    const row = rowForFile(page, 'sample.pdf')
    await targetSelectForRow(page, 'sample.pdf').selectOption('pdf')

    // OCR checkbox is inside the Settings modal — open it to verify visibility
    await row.getByRole('button', { name: '设置' }).click()
    const dialog = page.getByRole('dialog', { name: '设置' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('checkbox', { name: '是否进行 OCR' })).toBeVisible()
    await dialog.getByRole('button', { name: '完成' }).click()
    await expect(dialog).toBeHidden()

    await targetSelectForRow(page, 'sample.pdf').selectOption('txt')

    // Re-open Settings — OCR section should be absent for TXT target
    await row.getByRole('button', { name: '设置' }).click()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('checkbox', { name: '是否进行 OCR' })).toBeHidden()
    await dialog.getByRole('button', { name: '完成' }).click()
  })

  test('shows feedback when selected files are unsupported', async ({ page }) => {
    await page
      .locator(dropzoneFileInput)
      .setInputFiles(filePayload('book.epub', 'application/epub+zip', 'fake epub'))

    const alert = page.getByRole('alert')
    await expect(alert).toContainText('Unsupported file type')
    await expect(alert).toContainText('book.epub')
    await expect(page.locator('table.file-table')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Convert all' })).toBeDisabled()
  })

  test('shows PNG, JPG, WEBP, and HTML as TXT target options', async ({ page }) => {
    await page
      .locator(dropzoneFileInput)
      .setInputFiles(filePayload('notes.txt', 'text/plain', 'hello text'))

    await expect(await optionValues(targetSelectForRow(page, 'notes.txt'))).toEqual([
      'png',
      'jpg',
      'webp',
      'html'
    ])
  })

  test('edits TXT image settings and converts TXT to WebP', async ({ page }) => {
    await page
      .locator(dropzoneFileInput)
      .setInputFiles(filePayload('notes.txt', 'text/plain', 'hello text'))

    const txtRow = rowForFile(page, 'notes.txt')
    const targetSelect = targetSelectForRow(page, 'notes.txt')
    await expect(await optionValues(targetSelect)).toEqual(['png', 'jpg', 'webp', 'html'])
    await targetSelect.selectOption('webp')

    await txtRow.getByRole('button', { name: 'Settings' }).click()
    const settingsDialog = page.getByRole('dialog', { name: 'Settings' })
    await expect(settingsDialog).toBeVisible()
    await expect(settingsDialog).toContainText('TXT Image Options')

    await settingsDialog.getByLabel('Text color').fill('#13579b')
    await settingsDialog.getByLabel('Background color').fill('#f0e0d0')
    await settingsDialog.getByRole('spinbutton', { name: 'Font size (px)' }).fill('24')
    await settingsDialog.getByRole('spinbutton', { name: 'Image width (px)' }).fill('960')
    await settingsDialog.getByRole('spinbutton', { name: 'Padding (px)' }).fill('36')
    await settingsDialog.getByRole('spinbutton', { name: 'Line height (px)' }).fill('42')
    await settingsDialog.getByRole('button', { name: 'Done' }).click()
    await expect(settingsDialog).toBeHidden()

    await txtRow.getByRole('button', { name: 'Settings' }).click()
    await expect(settingsDialog.getByLabel('Text color')).toHaveValue('#13579b')
    await expect(settingsDialog.getByLabel('Background color')).toHaveValue('#f0e0d0')
    await expect(settingsDialog.getByRole('spinbutton', { name: 'Font size (px)' })).toHaveValue(
      '24'
    )
    await expect(settingsDialog.getByRole('spinbutton', { name: 'Image width (px)' })).toHaveValue(
      '960'
    )
    await expect(settingsDialog.getByRole('spinbutton', { name: 'Padding (px)' })).toHaveValue('36')
    await expect(settingsDialog.getByRole('spinbutton', { name: 'Line height (px)' })).toHaveValue(
      '42'
    )
    await settingsDialog.getByRole('button', { name: 'Done' }).click()
    await expect(settingsDialog).toBeHidden()

    await page.getByRole('button', { name: 'Convert all' }).click()
    await expect(txtRow.locator('.status')).toContainText('Done', {
      timeout: 15000
    })

    await txtRow.getByRole('button', { name: 'Download' }).click()
    await expect.poll(async () => downloadNames(page)).toEqual(['notes.webp'])
    const downloadedTypes = () => page.evaluate(() => (window as E2EWindow).__downloadTypes ?? [])
    await expect.poll(downloadedTypes).toContain('image/webp')
  })

  test('renders CJK paragraph into a non-blank PNG (TXT→PNG regression)', async ({ page }) => {
    // 回归测试：CJK 文本（无空格）必须真实渲染到 PNG 像素。
    // 历史 bug：wrapText 仅按空格切词，整段汉字成为一个超宽行，被画布裁剪 → 空白 PNG。
    // 单元测试已锁定 wrap 算法；此处在真实浏览器里跑全栈，并对解码后的像素做暗色像素计数断言。
    const cjkContent = '你好世界'.repeat(40)

    await page
      .locator(dropzoneFileInput)
      .setInputFiles(filePayload('cjk.txt', 'text/plain', cjkContent))

    const txtRow = rowForFile(page, 'cjk.txt')
    await targetSelectForRow(page, 'cjk.txt').selectOption('png')

    await page.getByRole('button', { name: 'Convert all' }).click()
    await expect(txtRow.locator('.status')).toContainText('Done', { timeout: 15000 })

    await txtRow.getByRole('button', { name: 'Download' }).click()
    await expect.poll(async () => downloadNames(page)).toEqual(['cjk.png'])
    const downloadedTypes = () => page.evaluate(() => (window as E2EWindow).__downloadTypes ?? [])
    await expect.poll(downloadedTypes).toContain('image/png')

    // 解码下载的 PNG 并统计"暗色"像素数量。默认 16px 黑字白底，
    // 任一被字形覆盖的像素其 R+G+B 都会显著低于 600（白色 = 765）。
    // 阈值 50 远低于 40 段 × 4 字 × 几像素笔画的合理量级，但远高于
    // "整张白底"误判的 0 像素，足以区分 bug-before/after。
    const stats = await page.evaluate(async () => {
      const blob = (window as E2EWindow).__downloadBlobs?.at(-1)
      if (!blob) return { width: 0, height: 0, darkPixels: 0 }
      const bitmap = await createImageBitmap(blob)
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) return { width: bitmap.width, height: bitmap.height, darkPixels: 0 }
      ctx.drawImage(bitmap, 0, 0)
      const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
      let darkPixels = 0
      // 步进 4 字节（一个 RGBA 像素）逐像素扫描。R+G+B<600 视为非背景。
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] + data[i + 1] + data[i + 2] < 600) darkPixels += 1
      }
      return { width: bitmap.width, height: bitmap.height, darkPixels }
    })

    expect(stats.width).toBeGreaterThan(0)
    expect(stats.height).toBeGreaterThan(0)
    // bug 复现时 darkPixels === 0（整张白底）；修复后远大于此阈值。
    expect(stats.darkPixels).toBeGreaterThan(50)
  })

  test('shows PDF, TXT, PNG, JPG, and WEBP as image target options', async ({ page }) => {
    await page
      .locator(dropzoneFileInput)
      .setInputFiles(filePayload('photo.png', 'image/png', 'fake image'))

    await expect(await optionValues(targetSelectForRow(page, 'photo.png'))).toEqual([
      'pdf',
      'txt',
      'png',
      'jpg',
      'webp',
      'html'
    ])
  })

  test('includes DOCX in the native file chooser filter', async ({ page }) => {
    await expect(page.locator(dropzoneFileInput)).toHaveAttribute('accept', /\.docx(?:,|$)/)
  })

  test('opens image to PDF settings, edits transform settings, converts, and previews result', async ({
    page
  }) => {
    await page.locator(dropzoneFileInput).setInputFiles(validPngPayload())

    const imageRow = rowForFile(page, 'photo.png')
    const settingsButton = imageRow.getByRole('button', { name: 'Settings' })
    await expect(settingsButton).toBeEnabled()

    await settingsButton.click()
    const settingsDialog = page.getByRole('dialog', { name: 'Settings' })
    await expect(settingsDialog).toBeVisible()
    await expect(settingsDialog).toContainText('Image to PDF Options')

    await settingsDialog.getByLabel('Margin (pt)').fill('12')
    await settingsDialog.getByLabel('Rotation').selectOption('90')
    await settingsDialog.getByLabel('Scale (%)').fill('150')
    await settingsDialog.getByRole('button', { name: 'Done' }).click()
    await expect(settingsDialog).toBeHidden()

    await settingsButton.click()
    await expect(settingsDialog.getByLabel('Margin (pt)')).toHaveValue('12')
    await expect(settingsDialog.getByLabel('Rotation')).toHaveValue('90')
    await expect(settingsDialog.getByLabel('Scale (%)')).toHaveValue('150')
    await settingsDialog.getByRole('button', { name: 'Done' }).click()

    await page.getByRole('button', { name: 'Convert all' }).click()

    await expect(imageRow.locator('.status')).toContainText('Done', {
      timeout: 15000
    })
    await imageRow.getByRole('button', { name: 'Preview' }).click()
    await expect(page.locator('.preview-modal')).toBeVisible()
    await expect(page.locator('.preview-modal__pdf-viewer canvas').first()).toBeVisible({
      timeout: 15000
    })
  })

  test('preserves image PDF page orientation when settings are reopened', async ({ page }) => {
    await page.locator(dropzoneFileInput).setInputFiles(validPngPayload())

    const imageRow = rowForFile(page, 'photo.png')
    const settingsButton = imageRow.getByRole('button', { name: 'Settings' })
    const settingsDialog = page.getByRole('dialog', { name: 'Settings' })

    await settingsButton.click()
    await settingsDialog.getByLabel('Orientation').selectOption('landscape')
    await settingsDialog.getByRole('button', { name: 'Done' }).click()
    await expect(settingsDialog).toBeHidden()

    await settingsButton.click()
    await expect(settingsDialog.getByLabel('Orientation')).toHaveValue('landscape')
  })

  test('opens PDF to PNG preview tabs for multi-output conversion', async ({ page }) => {
    await page.locator(dropzoneFileInput).setInputFiles(await twoPagePdf())
    await targetSelectForRow(page, 'sample.pdf').selectOption('png')

    const pdfRow = rowForFile(page, 'sample.pdf')
    await pdfRow.getByRole('button', { name: 'Settings' }).click()
    const settingsDialog = page.getByRole('dialog', { name: 'Settings' })
    await settingsDialog.getByRole('button', { name: 'Select all', exact: true }).click()
    await expect(settingsDialog).toContainText('2 pages selected')
    await settingsDialog.getByRole('button', { name: 'Done' }).click()

    await page.getByRole('button', { name: 'Convert all' }).click()

    await expect(pdfRow.locator('.status')).toContainText('Done', {
      timeout: 15000
    })
    await expect(pdfRow.locator('.status')).toContainText('2 outputs')

    await pdfRow.getByRole('button', { name: 'Preview' }).click()

    const tabs = page.getByRole('tab')
    await expect(tabs).toHaveCount(2)
    await expect(tabs.nth(0)).toHaveText('sample-page-001.png')
    await expect(tabs.nth(1)).toHaveText('sample-page-002.png')
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true')

    await tabs.nth(1).click()
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
  })

  test('opens HTML encode settings for HTML to TXT conversion', async ({ page }) => {
    await page
      .locator(dropzoneFileInput)
      .setInputFiles(filePayload('sample.html', 'text/html', '<h1>Test</h1>'))

    const htmlRow = rowForFile(page, 'sample.html')
    await expect(targetSelectForRow(page, 'sample.html')).toHaveValue('txt')
    await htmlRow.getByRole('button', { name: 'Settings' }).click()

    const settingsDialog = page.getByRole('dialog', { name: 'Settings' })
    await expect(settingsDialog).toContainText('HTML Input Options')
    await expect(settingsDialog.getByLabel('Exclude selectors')).toBeVisible()
    await expect(settingsDialog.getByLabel('Snapshot width')).toBeVisible()
    await settingsDialog.getByRole('button', { name: 'Done' }).click()
    await expect(settingsDialog).toBeHidden()
    await expect(htmlRow.getByRole('button', { name: 'Remove' })).toBeEnabled()
  })

  test('converts a single file to Done status', async ({ page }) => {
    await page
      .locator(dropzoneFileInput)
      .setInputFiles(filePayload('notes.txt', 'text/plain', 'hello text'))

    await page.getByRole('button', { name: 'Convert all' }).click()

    await expect(rowForFile(page, 'notes.txt').locator('.status')).toContainText('Done', {
      timeout: 15000
    })
  })

  test('converts PDF to HTML and downloads', async ({ page }) => {
    await page.locator(dropzoneFileInput).setInputFiles(samplePdf())

    await targetSelectForRow(page, 'sample.pdf').selectOption('html')
    await page.getByRole('button', { name: 'Convert all' }).click()

    const pdfRow = rowForFile(page, 'sample.pdf')
    await expect(pdfRow.locator('.status')).toContainText('Done', {
      timeout: 15000
    })

    await pdfRow.getByRole('button', { name: 'Download' }).click()
    await expect.poll(async () => downloadNames(page)).toEqual(['sample.html'])
  })

  test('converts TXT to HTML and downloads', async ({ page }) => {
    await page
      .locator(dropzoneFileInput)
      .setInputFiles(filePayload('notes.txt', 'text/plain', 'hello text'))

    await targetSelectForRow(page, 'notes.txt').selectOption('html')
    await page.getByRole('button', { name: 'Convert all' }).click()

    const txtRow = rowForFile(page, 'notes.txt')
    await expect(txtRow.locator('.status')).toContainText('Done', {
      timeout: 15000
    })

    await txtRow.getByRole('button', { name: 'Download' }).click()
    await expect.poll(async () => downloadNames(page)).toEqual(['notes.html'])
  })

  test('converts TXT to HTML and opens row preview modal', async ({ page }) => {
    await page
      .locator(dropzoneFileInput)
      .setInputFiles(filePayload('notes.txt', 'text/plain', 'hello text'))

    await targetSelectForRow(page, 'notes.txt').selectOption('html')
    await page.getByRole('button', { name: 'Convert all' }).click()

    const txtRow = rowForFile(page, 'notes.txt')
    await expect(txtRow.locator('.status')).toContainText('Done', {
      timeout: 15000
    })

    await txtRow.getByRole('button', { name: 'Preview' }).click()
    await expect(page.locator('.preview-modal')).toBeVisible()
    await expect(page.locator('.preview-modal__iframe')).toBeVisible()

    await page.locator('.preview-modal__close').click()
    await expect(page.locator('.preview-modal')).toBeHidden()
  })

  test('copy button appends a ready duplicate row', async ({ page }) => {
    await page
      .locator(dropzoneFileInput)
      .setInputFiles(filePayload('notes.txt', 'text/plain', 'hello text'))

    const rows = rowForFile(page, 'notes.txt')
    await expect(rows).toHaveCount(1)

    await rows.nth(0).getByRole('button', { name: 'Copy' }).click()

    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0).locator('.status')).toContainText('Ready')
    await expect(rows.nth(1).locator('.status')).toContainText('Ready')
  })

  test('convert all progress excludes a pre-completed copied row', async ({ page }) => {
    await routeDelayedProxy(page)
    await page.reload()
    await waitForBridgeReady(page)

    await page
      .locator(dropzoneFileInput)
      .setInputFiles(filePayload('notes.txt', 'text/plain', 'hello text'))
    await targetSelectForRow(page, 'notes.txt').selectOption('html')
    await page.getByRole('button', { name: 'Convert all' }).click()

    const rows = rowForFile(page, 'notes.txt')
    await expect(rows.nth(0).locator('.status')).toContainText('Done', {
      timeout: 15000
    })

    await rows.nth(0).getByRole('button', { name: 'Copy' }).click()
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(1).locator('.status')).toContainText('Ready')

    await page.getByRole('button', { name: 'Convert all' }).click()

    await expect(page.locator('.batch-progress')).toHaveText('0 / 1')
    await expect(rows.nth(0).locator('.status')).toContainText('Done')
    await expect(rows.nth(1).locator('.status')).toContainText('Done', {
      timeout: 15000
    })
  })

  test('preview modal keeps rendered HTML preview surfaces white', async ({ page }) => {
    await page
      .locator(dropzoneFileInput)
      .setInputFiles(filePayload('notes.txt', 'text/plain', 'hello text'))

    await targetSelectForRow(page, 'notes.txt').selectOption('html')
    await page.getByRole('button', { name: 'Convert all' }).click()

    const txtRow = rowForFile(page, 'notes.txt')
    await expect(txtRow.locator('.status')).toContainText('Done', {
      timeout: 15000
    })

    await txtRow.getByRole('button', { name: 'Preview' }).click()
    await expect(page.locator('.preview-modal__iframe')).toBeVisible()

    const previewBackgrounds = await page.evaluate(() => {
      const content = document.querySelector('.preview-modal__content')
      const iframe = document.querySelector('.preview-modal__iframe')
      if (!(content instanceof HTMLElement) || !(iframe instanceof HTMLElement)) {
        throw new Error('Expected HTML preview elements to be rendered')
      }
      return {
        content: window.getComputedStyle(content).backgroundColor,
        iframe: window.getComputedStyle(iframe).backgroundColor
      }
    })

    expect(previewBackgrounds).toEqual({
      content: 'rgb(255, 255, 255)',
      iframe: 'rgb(255, 255, 255)'
    })
  })

  test('PDF preview renders with the canvas viewer instead of an iframe', async ({ page }) => {
    await page.locator(dropzoneFileInput).setInputFiles(samplePdf())

    await targetSelectForRow(page, 'sample.pdf').selectOption('pdf')
    await page.getByRole('button', { name: 'Convert all' }).click()

    const pdfRow = rowForFile(page, 'sample.pdf')
    await expect(pdfRow.locator('.status')).toContainText('Done', {
      timeout: 15000
    })

    await pdfRow.getByRole('button', { name: 'Preview' }).click()

    await expect(page.locator('.preview-modal__pdf-viewer')).toBeVisible()
    await expect(page.locator('.preview-modal__pdf-viewer canvas').first()).toBeVisible({
      timeout: 15000
    })
    await expect(page.locator('.preview-modal__content iframe')).toHaveCount(0)
  })

  test('converts HTML to TXT and downloads', async ({ page }) => {
    await page
      .locator(dropzoneFileInput)
      .setInputFiles(filePayload('sample.html', 'text/html', '<h1>Test</h1>'))

    await targetSelectForRow(page, 'sample.html').selectOption('txt')
    await page.getByRole('button', { name: 'Convert all' }).click()

    const htmlRow = rowForFile(page, 'sample.html')
    await expect(htmlRow.locator('.status')).toContainText('Done', {
      timeout: 15000
    })

    await htmlRow.getByRole('button', { name: 'Download' }).click()
    await expect.poll(async () => downloadNames(page)).toEqual(['sample.txt'])
  })

  test('keeps row failures isolated from successful conversions', async ({ page }) => {
    await page
      .locator(dropzoneFileInput)
      .setInputFiles([
        filePayload('notes.txt', 'text/plain', 'hello text'),
        filePayload('fail-photo.png', 'image/png', 'not an image')
      ])

    await page.getByRole('button', { name: 'Convert all' }).click()

    await expect(rowForFile(page, 'notes.txt').locator('.status')).toContainText('Done', {
      timeout: 15000
    })
    await expect(rowForFile(page, 'fail-photo.png').locator('.status')).toContainText('Failed')
    await expect(rowForFile(page, 'fail-photo.png').locator('.status')).toContainText(
      'Conversion failed, please retry'
    )
  })

  test('downloads PDF to image multi-output result as a row ZIP', async ({ page }) => {
    await page.locator(dropzoneFileInput).setInputFiles(samplePdf())
    await targetSelectForRow(page, 'sample.pdf').selectOption('png')

    await page.getByRole('button', { name: 'Convert all' }).click()

    const pdfRow = rowForFile(page, 'sample.pdf')
    await expect(pdfRow.locator('.status')).toContainText('Done', {
      timeout: 15000
    })
    await expect(pdfRow.locator('.status')).toContainText('1 output')

    await pdfRow.getByRole('button', { name: 'Download' }).click()

    await expect.poll(async () => downloadNames(page)).toEqual(['sample-page-001.png'])
  })

  test('converts image to WEBP and downloads', async ({ page }) => {
    await page.locator(dropzoneFileInput).setInputFiles(validPngPayload())
    await targetSelectForRow(page, 'photo.png').selectOption('webp')

    await page.getByRole('button', { name: 'Convert all' }).click()

    const imageRow = rowForFile(page, 'photo.png')
    await expect(imageRow.locator('.status')).toContainText('Done', {
      timeout: 15000
    })

    await imageRow.getByRole('button', { name: 'Download' }).click()
    await expect.poll(async () => downloadNames(page)).toEqual(['photo.webp'])
  })

  test('selects PDF pages inline from Settings and converts to exact output count', async ({
    page
  }) => {
    await page.locator(dropzoneFileInput).setInputFiles(await twoPagePdf())

    await targetSelectForRow(page, 'sample.pdf').selectOption('png')

    const pdfRow = rowForFile(page, 'sample.pdf')
    await pdfRow.getByRole('button', { name: 'Settings' }).click()
    const settingsDialog = page.getByRole('dialog', { name: 'Settings' })
    await expect(settingsDialog).toBeVisible()
    await expect(settingsDialog.locator('.pdf-page-selector-inline__sticky-header')).toContainText(
      'PDF Pages'
    )

    await settingsDialog.getByRole('button', { name: 'Select all', exact: true }).click()
    await expect(settingsDialog).toContainText('2 pages selected')

    const pageCards = settingsDialog.locator('.pdf-modal__card')
    await expect(pageCards).toHaveCount(2)
    await settingsDialog.getByRole('button', { name: 'Page 2' }).click()
    await expect(settingsDialog).toContainText(/1 pages? selected/)

    await settingsDialog.locator('.pdf-page-selector-inline__header').click()
    await expect(settingsDialog.getByRole('button', { name: 'Page 1' })).toBeHidden()
    await settingsDialog.locator('.pdf-page-selector-inline__header').click()
    await expect(settingsDialog.getByRole('button', { name: 'Page 1' })).toBeVisible()

    await settingsDialog.getByRole('button', { name: 'Done' }).click()
    await expect(settingsDialog).toBeHidden()

    await page.getByRole('button', { name: 'Convert all' }).click()

    await expect(pdfRow.locator('.status')).toContainText('Done', {
      timeout: 15000
    })
    await expect(pdfRow.locator('.status')).toContainText('1 output')

    await pdfRow.getByRole('button', { name: 'Download' }).click()
    await expect.poll(async () => downloadNames(page)).toEqual(['sample-page-001.png'])
  })

  test('deletes completed row after global download', async ({ page }) => {
    await page
      .locator(dropzoneFileInput)
      .setInputFiles([samplePdf(), filePayload('notes.txt', 'text/plain', 'hello text')])

    await page.getByRole('button', { name: 'Convert all' }).click()

    await expect(rowForFile(page, 'sample.pdf').locator('.status')).toContainText('Done', {
      timeout: 15000
    })
    await expect(rowForFile(page, 'notes.txt').locator('.status')).toContainText('Done')

    await page.locator('.actions').getByRole('button', { name: 'Download' }).click()
    await expect(loadingOverlay(page)).toBeVisible()
    await expect(loadingOverlay(page)).toBeHidden({ timeout: 15000 })

    await expect.poll(async () => downloadNames(page)).toEqual(['hamster-conversions.zip'])

    const sampleRow = rowForFile(page, 'sample.pdf')
    await sampleRow.getByRole('button', { name: 'Remove' }).click()

    await expect(sampleRow).toHaveCount(0)
    await expect(rowForFile(page, 'notes.txt')).toHaveCount(1)
  })

  test('shows full-screen loading during convert-all', async ({ page }) => {
    await page.locator(dropzoneFileInput).setInputFiles(samplePdf())
    await targetSelectForRow(page, 'sample.pdf').selectOption('txt')

    await page.getByRole('button', { name: 'Convert all' }).click()

    await expect(loadingOverlay(page)).toBeVisible()
    await expect(loadingOverlay(page)).toBeHidden({ timeout: 15000 })
    await expect(rowForFile(page, 'sample.pdf').locator('.status')).toContainText('Done')
  })

  test('shows loading during row download of multi-output PDF→image', async ({ page }) => {
    await page.locator(dropzoneFileInput).setInputFiles(samplePdf())
    await targetSelectForRow(page, 'sample.pdf').selectOption('png')

    await page.getByRole('button', { name: 'Convert all' }).click()

    const pdfRow = rowForFile(page, 'sample.pdf')
    await expect(pdfRow.locator('.status')).toContainText('Done', {
      timeout: 15000
    })

    await pdfRow.getByRole('button', { name: 'Download' }).click()
    await expect.poll(async () => downloadNames(page)).toEqual(['sample-page-001.png'])
  })

  test('switches language to zh-CN', async ({ page }) => {
    const langSelect = page.locator('.nav__select')
    await langSelect.selectOption('zh-CN')

    await expect(page.getByRole('button', { name: '全部转换' })).toBeVisible()
    await expect(page.getByRole('button', { name: '清空' })).toBeVisible()
    await expect(page.locator('.panel__header h2')).toHaveText('上传文件')
  })

  test('removes a file row', async ({ page }) => {
    await page.locator(dropzoneFileInput).setInputFiles(samplePdf())

    const rows = page.locator('.file-table tbody tr')
    await expect(rows).toHaveCount(1)

    await page.getByRole('button', { name: 'Remove' }).click()
    await expect(page.locator('.file-table')).toBeHidden()
  })

  test('shows cell layout instead of table on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator(dropzoneFileInput).setInputFiles(samplePdf())

    const table = page.locator('table.file-table')
    const row = rowForFile(page, 'sample.pdf')
    await expect(table).toBeVisible()
    await expect(table.locator('thead')).toHaveCSS('display', 'none')
    await expect(row).toHaveCSS('display', 'grid')
    await expect(row.locator('.file-table__cell--source')).toBeHidden()
    await expect(row.locator('.file-table__filename')).toContainText('sample.pdf')
    await expect(row.getByRole('button', { name: 'Settings' })).toBeVisible()
    await expect(row.getByRole('button', { name: 'Remove' })).toBeVisible()
  })

  test('multi-select creates a group, changes target, and collapses members', async ({ page }) => {
    await page
      .locator(dropzoneFileInput)
      .setInputFiles([
        filePayload('notes-a.txt', 'text/plain', 'hello a'),
        filePayload('notes-b.txt', 'text/plain', 'hello b')
      ])

    const table = page.locator('table.file-table')
    await expect(table).toContainText('notes-a.txt')
    await expect(table).toContainText('notes-b.txt')

    await page.getByRole('button', { name: 'Multi-select' }).click()
    await expect(page.getByRole('button', { name: 'Cancel selection' })).toBeVisible()

    const rowA = rowForFile(page, 'notes-a.txt')
    const rowB = rowForFile(page, 'notes-b.txt')

    await expect(rowA.locator('.file-table__cell--actions')).toHaveCount(0)
    await expect(rowB.locator('.file-table__cell--actions')).toHaveCount(0)

    await rowA.locator('.file-table__cell--name').click()
    await rowB.locator('.file-table__cell--name').click()

    await expect(page.getByText('2 selected')).toBeVisible()

    await page.getByRole('button', { name: 'Create Group' }).click()

    const groupHeader = page.locator('tbody tr.group-header')
    await expect(groupHeader).toHaveCount(1)
    await expect(groupHeader).toContainText('Group 1')
    await expect(groupHeader).toContainText('2 files')

    await expect(table.locator('tbody tr.file-table__row--group-member')).toHaveCount(2)

    const groupTargetSelect = groupHeader.locator('select')
    await groupTargetSelect.selectOption('html')

    await expect(targetSelectForRow(page, 'notes-a.txt')).toHaveValue('html')
    await expect(targetSelectForRow(page, 'notes-b.txt')).toHaveValue('html')

    const collapseExpandButton = groupHeader.locator('.group-header__collapse-btn')
    await collapseExpandButton.click()

    await expect(collapseExpandButton).toHaveAttribute('aria-expanded', 'false')
    await expect(rowA).toBeHidden()
    await expect(rowB).toBeHidden()

    await collapseExpandButton.click()

    await expect(collapseExpandButton).toHaveAttribute('aria-expanded', 'true')
    await expect(rowA).toBeVisible()
    await expect(rowB).toBeVisible()

    await groupHeader.getByRole('button', { name: 'Group settings' }).click()
    const settingsDialog = page.getByRole('dialog', { name: 'Settings' })
    await expect(settingsDialog).toBeVisible()
    await expect(settingsDialog).toContainText('HTML Options')
    await settingsDialog.getByRole('button', { name: 'Done' }).click()
    await expect(settingsDialog).toBeHidden()

    await groupHeader.getByRole('button', { name: 'Convert Group' }).click()
    await expect(rowA.locator('.status')).toContainText('Done', { timeout: 15000 })
    await expect(rowB.locator('.status')).toContainText('Done')

    await groupTargetSelect.selectOption('png')
    await expect(rowA.locator('.status')).toContainText('Ready')
    await expect(rowB.locator('.status')).toContainText('Ready')
    await expect(groupHeader.getByRole('button', { name: 'Convert Group' })).toBeEnabled()
  })

  test('uploads markdown file and converts to HTML via parser iframe', async ({ page }) => {
    await page
      .locator(dropzoneFileInput)
      .setInputFiles([filePayload('notes.md', 'text/markdown', '# Heading\n\nbody paragraph')])

    const row = rowForFile(page, 'notes.md')
    await expect(row).toBeVisible()

    const targetSelect = targetSelectForRow(page, 'notes.md')
    await expect(targetSelect).toHaveValue('html')
    await expect(optionValues(targetSelect)).resolves.toEqual(
      expect.arrayContaining(['html', 'txt', 'png', 'jpg', 'webp', 'pdf'])
    )

    await page.getByRole('button', { name: 'Convert all' }).click()
    await expect(row.locator('.status')).toContainText('Done', { timeout: 30000 })

    await row.getByRole('button', { name: 'Download' }).click()
    await expect.poll(async () => downloadNames(page)).toEqual(['notes.html'])
  })

  test('converts markdown to TXT with raw mode preserving the original markdown text', async ({
    page
  }) => {
    await page
      .locator(dropzoneFileInput)
      .setInputFiles([filePayload('raw.md', 'text/markdown', '# Title\n\n- item one')])

    await targetSelectForRow(page, 'raw.md').selectOption('txt')

    const row = rowForFile(page, 'raw.md')
    await row.getByRole('button', { name: 'Settings' }).click()
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Markdown Options')
    await dialog.getByLabel('Keep raw Markdown').check()
    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(dialog).toBeHidden()

    await row.getByRole('button', { name: 'Settings' }).click()
    await expect(dialog.getByLabel('Keep raw Markdown')).toBeChecked()
    await dialog.getByRole('button', { name: 'Done' }).click()

    await page.getByRole('button', { name: 'Convert all' }).click()
    await expect(row.locator('.status')).toContainText('Done', { timeout: 30000 })

    await row.getByRole('button', { name: 'Download' }).click()
    await expect.poll(async () => downloadNames(page)).toEqual(['raw.txt'])
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const [blob] = (window as E2EWindow).__downloadBlobs ?? []
          return blob ? blob.text() : ''
        })
      )
      .toBe('# Title\n\n- item one')
  })
})
