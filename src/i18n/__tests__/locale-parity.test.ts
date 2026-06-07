import { describe, expect, it } from 'vitest'
import en from '../locales/en.json'
import zhCN from '../locales/zh-CN.json'
import zhTW from '../locales/zh-TW.json'

type LocaleRecord = Record<string, unknown>

const locales = {
  en,
  'zh-CN': zhCN,
  'zh-TW': zhTW
} satisfies Record<string, LocaleRecord>

const requiredConversionUiKeys = [
  'actions.preview',
  'actions.settings',
  'actions.previewUnsupported',
  'settingsModal.title',
  'settingsModal.viewTitle',
  'settingsModal.pdfPagesTitle',
  'settingsModal.pdfOcrTitle',
  'settingsModal.htmlOptionsTitle',
  'settingsModal.imageOptionsTitle',
  'settingsModal.imageToPdfTitle',
  'settingsModal.quality',
  'settingsModal.maxWidth',
  'settingsModal.maxHeight',
  'settingsModal.keepAspectRatio',
  'settingsModal.estimate',
  'settingsModal.reset',
  'settingsModal.heuristicEstimate',
  'settingsModal.margin',
  'settingsModal.fit',
  'settingsModal.fitCover',
  'settingsModal.fitContain',
  'settingsModal.pageMode',
  'settingsModal.pageModeAuto',
  'settingsModal.pageModeSingle',
  'settingsModal.pageModeMulti',
  'preview.title',
  'preview.close',
  'preview.loading'
] as const

const isRecord = (value: unknown): value is LocaleRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const flattenKeys = (value: LocaleRecord, prefix = ''): string[] =>
  Object.entries(value).flatMap(([key, child]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key
    return isRecord(child) ? flattenKeys(child, nextKey) : [nextKey]
  })

const getPathValue = (value: LocaleRecord, path: string): unknown =>
  path.split('.').reduce<unknown>((current, segment) => {
    if (!isRecord(current)) return undefined
    return current[segment]
  }, value)

describe('locale parity', () => {
  it('keeps locale key sets aligned with English', () => {
    const englishKeys = flattenKeys(en).sort()

    for (const [localeName, locale] of Object.entries(locales)) {
      expect(flattenKeys(locale).sort(), localeName).toEqual(englishKeys)
    }
  })

  it('contains required conversion UI keys in every locale', () => {
    for (const [localeName, locale] of Object.entries(locales)) {
      for (const key of requiredConversionUiKeys) {
        const value = getPathValue(locale, key)
        expect(typeof value, `${localeName}:${key}`).toBe('string')
        expect((value as string).trim(), `${localeName}:${key}`).not.toBe('')
      }
    }
  })
})
