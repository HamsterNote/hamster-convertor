import type { ConversionResult } from './converter'

/**
 * 可在预览模态框中直接展示的目标格式列表。
 * PDF/HTML/TXT 与常见图片格式均可在 iframe 或浏览器原生渲染中安全预览。
 */
export const PREVIEWABLE_TARGETS = ['pdf', 'html', 'txt', 'png', 'jpg', 'webp'] as const

type PreviewableTarget = (typeof PREVIEWABLE_TARGETS)[number]

const isPreviewableTarget = (target: string): target is PreviewableTarget =>
  (PREVIEWABLE_TARGETS as readonly string[]).includes(target)

/**
 * 从一次转换的结果列表中筛选出可直接预览的输出。
 */
export const getPreviewableOutputs = (results: ConversionResult[]): ConversionResult[] =>
  results.filter(result => isPreviewableTarget(result.targetFormat))
