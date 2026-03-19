import { expect, test } from '@playwright/test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const sampleFile = join(currentDir, '..', 'src', 'test', 'fixtures', 'sample.pdf')
const dropzoneFileInput = '.dropzone + input[type="file"]'

test.describe('converter app', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('i18nextLng', 'en')
      ;(window as Window & { __E2E__?: boolean }).__E2E__ = true
      Math.random = () => 0.9
    })
    await page.goto('/')
  })

  test('uploads file and converts it', async ({ page }) => {
    const convertButton = page.getByRole('button', { name: 'Convert all' })
    await expect(convertButton).toBeDisabled()

    await page.locator(dropzoneFileInput).setInputFiles(sampleFile)

    const table = page.locator('.file-table')
    await expect(table).toBeVisible()
    await expect(table).toContainText('sample.pdf')
    await expect(table).toContainText('Ready')

    await convertButton.click()

    await expect(page.locator('.status')).toHaveText('Done', {
      timeout: 15000
    })

    const clearButton = page.getByRole('button', { name: 'Clear all' })
    await clearButton.click()
    await expect(table).toBeHidden()
  })

  test('switches language to zh-CN', async ({ page }) => {
    const langSelect = page.locator('.nav__select')
    await langSelect.selectOption('zh-CN')

    await expect(page.getByRole('button', { name: '全部转换' })).toBeVisible()
    await expect(page.getByRole('button', { name: '清空' })).toBeVisible()
    await expect(page.locator('.panel__header h2')).toHaveText('上传文件')
  })

  test('removes a file row', async ({ page }) => {
    await page.locator(dropzoneFileInput).setInputFiles(sampleFile)

    const rows = page.locator('.file-table tbody tr')
    await expect(rows).toHaveCount(1)

    await page.getByRole('button', { name: 'Remove' }).click()
    await expect(page.locator('.file-table')).toBeHidden()
  })
})
