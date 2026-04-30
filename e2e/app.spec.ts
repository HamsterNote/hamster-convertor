import { expect, test, type Locator, type Page } from '@playwright/test'

const dropzoneFileInput = '.dropzone + input[type="file"]'

const targetSelectForRow = (page: Page, fileName: string): Locator =>
  page.locator('tbody tr').filter({ hasText: fileName }).locator('select')

const rowForFile = (page: Page, fileName: string): Locator =>
  page.locator('tbody tr').filter({ hasText: fileName })

const filePayload = (name: string, mimeType: string, content: string) => ({
  name,
  mimeType,
  buffer: Buffer.from(content)
})

const samplePdf = () => filePayload('sample.pdf', 'application/pdf', 'fake pdf')

const optionValues = (select: Locator): Promise<string[]> =>
  select.evaluate(element =>
    Array.from((element as HTMLSelectElement).options).map(option => option.value)
  )

const downloadNames = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as Window & { __downloadNames?: string[] }).__downloadNames ?? [])

test.describe('converter app', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const e2eWindow = window as Window & {
        __downloadNames?: string[]
        __downloadTypes?: string[]
        __E2E__?: boolean
      }
      window.localStorage.setItem('i18nextLng', 'en')
      e2eWindow.__E2E__ = true
      e2eWindow.__downloadNames = []
      e2eWindow.__downloadTypes = []
      URL.createObjectURL = (blob: Blob) => {
        e2eWindow.__downloadTypes?.push(blob.type)
        return `blob:e2e-${e2eWindow.__downloadTypes?.length ?? 0}`
      }
      URL.revokeObjectURL = () => undefined
      HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
        e2eWindow.__downloadNames?.push(this.download)
      }
      Math.random = () => 0.9
    })
    await page.goto('/')
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
    await expect.poll(async () => downloadNames(page)).toEqual(['fake.txt'])

    await page.locator('.actions').getByRole('button', { name: 'Download' }).click()
    await expect
      .poll(async () => downloadNames(page))
      .toEqual(['fake.txt', 'hamster-conversions.zip'])

    const clearButton = page.getByRole('button', { name: 'Clear all' })
    await clearButton.click()
    await expect(table).toBeHidden()
  })

  test('shows PDF target options for text and images', async ({ page }) => {
    await page.locator(dropzoneFileInput).setInputFiles(samplePdf())

    const values = await optionValues(targetSelectForRow(page, 'sample.pdf'))

    expect(values).toContain('txt')
    expect(values).toContain('image')
  })

  test('shows feedback when selected files are unsupported', async ({ page }) => {
    await page
      .locator(dropzoneFileInput)
      .setInputFiles(
        filePayload(
          'report.docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'fake docx'
        )
      )

    const alert = page.getByRole('alert')
    await expect(alert).toContainText('Unsupported file type')
    await expect(alert).toContainText('report.docx')
    await expect(page.locator('table.file-table')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Convert all' })).toBeDisabled()
  })

  test('shows only image as TXT target option', async ({ page }) => {
    await page
      .locator(dropzoneFileInput)
      .setInputFiles(filePayload('notes.txt', 'text/plain', 'hello text'))

    await expect(await optionValues(targetSelectForRow(page, 'notes.txt'))).toEqual(['image'])
  })

  test('shows PDF and TXT as image target options', async ({ page }) => {
    await page
      .locator(dropzoneFileInput)
      .setInputFiles(filePayload('photo.png', 'image/png', 'fake image'))

    await expect(await optionValues(targetSelectForRow(page, 'photo.png'))).toEqual(['pdf', 'txt'])
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

  test('keeps row failures isolated from successful conversions', async ({ page }) => {
    await page
      .locator(dropzoneFileInput)
      .setInputFiles([
        filePayload('notes.txt', 'text/plain', 'hello text'),
        filePayload('fail-notes.txt', 'text/plain', 'bad text')
      ])

    await page.getByRole('button', { name: 'Convert all' }).click()

    await expect(rowForFile(page, 'notes.txt').locator('.status')).toContainText('Done', {
      timeout: 15000
    })
    await expect(rowForFile(page, 'fail-notes.txt').locator('.status')).toContainText('Failed')
    await expect(rowForFile(page, 'fail-notes.txt').locator('.status')).toContainText(
      'Conversion failed, please retry'
    )
  })

  test('downloads PDF to image multi-output result as a row ZIP', async ({ page }) => {
    await page.locator(dropzoneFileInput).setInputFiles(samplePdf())
    await targetSelectForRow(page, 'sample.pdf').selectOption('image')

    await page.getByRole('button', { name: 'Convert all' }).click()

    const pdfRow = rowForFile(page, 'sample.pdf')
    await expect(pdfRow.locator('.status')).toContainText('Done', { timeout: 15000 })
    await expect(pdfRow.locator('.status')).toContainText('2 outputs')

    await pdfRow.getByRole('button', { name: 'Download' }).click()

    await expect.poll(async () => downloadNames(page)).toEqual(['sample.zip'])
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
})
