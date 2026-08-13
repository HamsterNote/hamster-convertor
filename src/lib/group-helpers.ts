/**
 * Group helper types and pure functions for batch-group-conversion.
 *
 * Design principles:
 * - All functions are pure (no side effects, immutable returns).
 * - Section classification uses explicit metadata, not label-string matching.
 * - Source-only (excluded from Group settings): `pdfPages`, `pdfOcr`, `htmlEncodeOptions`, `txtImage`.
 * - Target-related (included in Group settings): `htmlOptions`, `imageTarget`, `imageToPdf`.
 */

import type {
  SourceFormat,
  TargetFormat,
  TxtImageOptions,
  HtmlEncodeOptions,
  ExifCategory
} from './converter'
import { getSupportedTargets } from './converter'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Conversion options mirroring the shape in App.tsx.
 * Defined here so group-helpers and its tests don't depend on App.tsx.
 */
export type ConversionOptions = {
  pdf: {
    ocr: boolean
    selectedPages?: number[]
  }
  html?: {
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
    background?: {
      includeBackground?: boolean
      backgroundQuality?: number
    }
    htmlLayout?: {
      mode: 'paginated' | 'continuous'
      widthMode?: 'actual' | 'fit'
    }
  }
  htmlEncode?: HtmlEncodeOptions
  image?: {
    quality: number
    maxWidth?: number
    maxHeight?: number
    keepAspectRatio: boolean
    removeExif?: {
      enabled: boolean
      categories: ExifCategory[]
    }
  }
  imageToPdf?: {
    marginPt: number
    fit: 'original' | 'showAll'
    pageMode: 'auto' | 'single' | 'multi'
    rotationDeg: 0 | 90 | 180 | 270
    scalePercent: number
  }
  pdfPageSetup?: {
    paperSize: 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal' | 'B5' | 'auto'
    orientation: 'portrait' | 'landscape' | 'auto'
  }
  txtImage?: TxtImageOptions
  markdown?: {
    /** raw=保留原始 Markdown 文本；plain=解析后提取纯文本 */
    txtMode?: 'raw' | 'plain'
  }
}

/** Settings section identifiers matching SettingsModal's SettingsSection type. */
export type SettingsSection =
  | 'pdfPages'
  | 'pdfOcr'
  | 'htmlOptions'
  | 'htmlEncodeOptions'
  | 'imageTarget'
  | 'txtImage'
  | 'imageToPdf'
  | 'pdfPageSetup'
  | 'markdown'

/** Group item stored in app state. References file IDs; never duplicates FileItem data. */
export type GroupItem = {
  id: string
  fileIds: string[]
  target: TargetFormat
  conversionOptions: ConversionOptions
  collapsed: boolean
}

/**
 * Minimal member shape required by group helper functions.
 * Subset of FileItem — avoids importing the full type.
 */
export type GroupMember = {
  id: string
  source: SourceFormat
  target: TargetFormat
  fileName: string
  conversionOptions: ConversionOptions
}

// ─── Section metadata (explicit, not label-string matching) ──────────────────

/**
 * Metadata classifying each SettingsSection by:
 * - `targetRelated`: whether this section is target-related (true) or source-only (false).
 * - `applicable`: predicate receiving (source, target) → whether the section applies.
 *
 * `pdfPages` and `pdfOcr` are source-only and excluded from group settings entirely.
 */
const SECTION_META: Record<
  SettingsSection,
  {
    targetRelated: boolean
    applicable: (source: SourceFormat, target: TargetFormat) => boolean
  }
> = {
  pdfPages: { targetRelated: false, applicable: s => s === 'pdf' },
  pdfOcr: { targetRelated: false, applicable: (s, t) => s === 'pdf' && t === 'pdf' },
  htmlOptions: { targetRelated: true, applicable: (_s, t) => t === 'html' },
  htmlEncodeOptions: { targetRelated: false, applicable: (s, t) => s === 'html' && t === 'html' },
  imageTarget: {
    targetRelated: true,
    applicable: (s, t) => s !== 'txt' && ['png', 'jpg', 'webp'].includes(t)
  },
  txtImage: {
    targetRelated: false,
    applicable: (s, t) => s === 'txt' && ['png', 'jpg', 'webp'].includes(t)
  },
  imageToPdf: { targetRelated: true, applicable: (s, t) => s === 'image' && t === 'pdf' },
  pdfPageSetup: { targetRelated: true, applicable: (_s, t) => t === 'pdf' },
  markdown: { targetRelated: false, applicable: (s, t) => s === 'markdown' && t === 'txt' }
}

/** All section identifiers for iteration. */
const ALL_SECTIONS: SettingsSection[] = [
  'pdfPages',
  'pdfOcr',
  'htmlOptions',
  'htmlEncodeOptions',
  'imageTarget',
  'txtImage',
  'imageToPdf',
  'pdfPageSetup',
  'markdown'
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

const IMAGE_TARGETS: readonly TargetFormat[] = ['png', 'jpg', 'webp']

/**
 * Is the file a GIF or SVG image? Used to exclude png/jpg/webp targets
 * for these animated/vector formats (same logic as App.tsx:630-635).
 */
const isGifOrSvg = (fileName: string): boolean => /\.(gif|svg)$/i.test(fileName)

/**
 * Get supported targets for a source, filtering out png/jpg/webp for GIF/SVG files.
 * Mirrors the filtering logic in App.tsx:630-635.
 */
const getFilteredTargets = (source: SourceFormat, fileName: string): TargetFormat[] => {
  const all = getSupportedTargets(source)
  if (source === 'image' && isGifOrSvg(fileName)) {
    return all.filter(t => !IMAGE_TARGETS.includes(t))
  }
  return all
}

// ─── Exported helpers ────────────────────────────────────────────────────────

/**
 * Is this status eligible for batch selection?
 * Only `ready` and `failed` items can be added to a group.
 */
export const isSelectableForBatch = (
  status: 'ready' | 'queued' | 'converting' | 'done' | 'failed'
): boolean => status === 'ready' || status === 'failed'

/**
 * Compute the intersection of supported targets across all group members,
 * applying GIF/SVG restrictions per member.
 *
 * Returns `[]` when members have no common targets (incompatible selection).
 */
export const getCommonGroupTargets = (members: GroupMember[]): TargetFormat[] => {
  if (members.length === 0) return []

  // Compute filtered targets for each member
  const perMember = members.map(m => new Set(getFilteredTargets(m.source, m.fileName)))

  // Intersect all sets
  let result = [...perMember[0]]
  for (let i = 1; i < perMember.length; i++) {
    result = result.filter(t => perMember[i].has(t))
  }
  return result
}

/**
 * Does this target have any target-related settings sections?
 * `txt` has none; all other targets have at least one applicable section
 * (htmlOptions for html, imageTarget for png/jpg/webp, imageToPdf for pdf).
 */
export const hasTargetRelatedSettings = (target: TargetFormat): boolean => target !== 'txt'

/**
 * Pick only target-related options from ConversionOptions, excluding source-only
 * fields (`pdf`, `htmlEncode`, `txtImage`).
 *
 * `target` determines which fields are included:
 * - `html` target → includes `html`
 * - `png`/`jpg`/`webp` target → includes `image` (when source≠txt)
 * - `pdf` target → includes `imageToPdf` (when source=image)
 *
 * `source` is optional; when omitted, `image`/`imageToPdf` are included based
 * on target alone without source-level filtering.
 */
export const pickTargetRelatedOptions = (
  options: ConversionOptions,
  target: TargetFormat,
  source?: SourceFormat
): Partial<ConversionOptions> => {
  const result: Partial<ConversionOptions> = {}
  // pdf, htmlEncode, txtImage are source-only → always excluded

  if (target === 'html') {
    result.html = options.html
  }

  if (IMAGE_TARGETS.includes(target) && source !== 'txt') {
    result.image = options.image
  }

  if (target === 'pdf' && source === 'image') {
    result.imageToPdf = options.imageToPdf
  }

  if (target === 'pdf') {
    result.pdfPageSetup = options.pdfPageSetup
  }

  return result
}

/**
 * Get the union of applicable target-related settings sections for a group
 * of members at a given target. Excludes source-only sections (`pdfPages`, `pdfOcr`).
 *
 * Each member's (source, target) pair is evaluated; the result is deduplicated.
 * The optional `groupTarget` parameter, when provided, overrides member targets
 * for section determination (useful when previewing a target change).
 */
export const getGroupSettingsSections = (
  members: GroupMember[],
  groupTarget?: TargetFormat
): SettingsSection[] => {
  const sectionSet = new Set<SettingsSection>()

  for (const m of members) {
    const effectiveTarget = groupTarget ?? m.target
    for (const section of ALL_SECTIONS) {
      const meta = SECTION_META[section]
      // Skip source-only sections (pdfPages, pdfOcr)
      if (!meta.targetRelated) continue
      if (meta.applicable(m.source, effectiveTarget)) {
        sectionSet.add(section)
      }
    }
  }

  return [...sectionSet]
}

/**
 * Apply section-level options to only those members for which the section is applicable.
 *
 * `sectionOptions` is a Partial<ConversionOptions> containing fields for the
 * section being applied (e.g., `{ imageToPdf: {...} }` for the `imageToPdf` section).
 *
 * The `sectionId` identifies which section's applicability rules to use.
 *
 * When `targetOverride` is provided, applicability is evaluated against that target
 * instead of each member's current `target`. This is used by `applyGroupSettings`
 * so that section applicability is always checked against `group.target`, even when
 * a member's per-row target has diverged from the group target.
 *
 * Returns a new array with updated members; originals are never mutated.
 */
export const applyGroupSectionOptionsToApplicableMembers = (
  sectionOptions: Partial<ConversionOptions>,
  members: GroupMember[],
  sectionId: SettingsSection,
  targetOverride?: TargetFormat
): GroupMember[] => {
  const meta = SECTION_META[sectionId]
  return members.map(m => {
    // Use the override target when provided, otherwise fall back to member's own target
    const effectiveTarget = targetOverride ?? m.target
    // Only apply to members where this section is applicable
    if (!meta.applicable(m.source, effectiveTarget)) return m
    // Merge section options into the member's conversionOptions immutably
    return {
      ...m,
      conversionOptions: {
        ...m.conversionOptions,
        ...sectionOptions
      }
    }
  })
}

/**
 * Remove groups whose `fileIds` no longer map to any existing item.
 * `items` is a Map from item ID to member data for O(1) lookups.
 */
export const removeEmptyGroups = <M>(groups: GroupItem[], items: Map<string, M>): GroupItem[] =>
  groups.filter(g => g.fileIds.some(id => items.has(id)))
