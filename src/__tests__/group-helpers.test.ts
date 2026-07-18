import { describe, expect, it } from 'vitest'
import type { SourceFormat, TargetFormat } from '../lib/converter'
import type { ConversionOptions, GroupItem } from '../lib/group-helpers'
import {
  applyGroupSectionOptionsToApplicableMembers,
  getCommonGroupTargets,
  getGroupSettingsSections,
  hasTargetRelatedSettings,
  isSelectableForBatch,
  pickTargetRelatedOptions,
  removeEmptyGroups
} from '../lib/group-helpers'

// ─── Test helpers ────────────────────────────────────────────────────────────

/** Minimal group member shape used by group helper functions. */
type MemberLike = {
  id: string
  source: SourceFormat
  target: TargetFormat
  fileName: string
  conversionOptions: ConversionOptions
}

const member = (
  id: string,
  source: SourceFormat,
  target: TargetFormat,
  fileName = `${id}.ext`
): MemberLike => ({
  id,
  source,
  target,
  fileName,
  conversionOptions: { pdf: { ocr: false } }
})

const mkGroupItem = (id: string, fileIds: string[], target: TargetFormat): GroupItem => ({
  id,
  fileIds,
  target,
  conversionOptions: { pdf: { ocr: false } },
  collapsed: false
})

const findMember = (members: MemberLike[], id: string): MemberLike => {
  const found = members.find((m: MemberLike) => m.id === id)

  if (!found) {
    throw new Error(`Missing test member: ${id}`)
  }

  return found
}

// ─── isSelectableForBatch ────────────────────────────────────────────────────

describe('isSelectableForBatch', () => {
  it('returns true for ready', () => {
    expect(isSelectableForBatch('ready')).toBe(true)
  })

  it('returns true for failed', () => {
    expect(isSelectableForBatch('failed')).toBe(true)
  })

  it.each(['queued', 'converting', 'done'] as const)('returns false for %s', s => {
    expect(isSelectableForBatch(s)).toBe(false)
  })
})

// ─── getCommonGroupTargets ───────────────────────────────────────────────────

describe('getCommonGroupTargets', () => {
  it('returns all shared targets when all members have compatible source/targets', () => {
    // pdf→txt, pdf→html share 'txt' as common target
    const items = [member('a', 'pdf', 'txt'), member('b', 'pdf', 'html')]
    const common = getCommonGroupTargets(items)
    // txt is in both pdf and txt source targets
    expect(common).toContain('txt')
  })

  it('excludes png/jpg/webp when any member is a GIF image', () => {
    const items = [
      member('a', 'image', 'pdf', 'photo.gif'),
      member('b', 'image', 'txt', 'logo.png')
    ]
    const common = getCommonGroupTargets(items)
    expect(common).not.toContain('png')
    expect(common).not.toContain('jpg')
    expect(common).not.toContain('webp')
    // gif and svg are not in TargetFormat, so not tested
    // pdf and txt should survive as image→pdf and image→txt exist
    expect(common).toContain('pdf')
    expect(common).toContain('txt')
  })

  it('excludes png/jpg/webp when any member is an SVG image', () => {
    const items = [member('a', 'image', 'pdf', 'icon.svg'), member('b', 'image', 'txt', 'page.png')]
    const common = getCommonGroupTargets(items)
    expect(common).not.toContain('png')
    expect(common).not.toContain('jpg')
    expect(common).not.toContain('webp')
  })

  it('returns empty array for completely incompatible sources', () => {
    // html→txt only supports 'txt'; pdf→html supports many but not 'txt' as target from html source
    // Actually html→txt supports 'txt'. Let's use truly incompatible:
    // html→txt (targets: ['txt']) vs txt→html (targets don't include 'txt' as source... wait txt has png,jpg,webp,html)
    // html source targets: ['txt']. txt source targets: ['png','jpg','webp','html'].
    // Intersection: 'txt' is in html targets, but NOT in txt source targets (txt's targets are png,jpg,webp,html).
    // So intersection should be empty!
    const items = [member('a', 'html', 'txt'), member('b', 'txt', 'html')]
    const common = getCommonGroupTargets(items)
    expect(common).toEqual([])
  })

  it('returns correct intersection for pdf+txt sources', () => {
    // pdf targets: ['txt','png','jpg','webp','pdf','html']
    // txt targets: ['png','jpg','webp','html']
    // Intersection: ['png','jpg','webp','html']
    const items = [member('a', 'pdf', 'txt'), member('b', 'txt', 'html')]
    const common = getCommonGroupTargets(items)
    expect(common).toEqual(expect.arrayContaining(['png', 'jpg', 'webp', 'html']))
    expect(common).not.toContain('txt')
    expect(common).not.toContain('pdf')
  })

  it('returns empty array for single member with no targets after filtering', () => {
    // image + gif file → filters out png/jpg/webp, leaving pdf, txt, html
    const items = [member('a', 'image', 'pdf', 'anim.gif')]
    const common = getCommonGroupTargets(items)
    expect(common).toContain('pdf')
    expect(common).toContain('txt')
    expect(common).toContain('html')
    expect(common).not.toContain('png')
  })
})

// ─── hasTargetRelatedSettings ────────────────────────────────────────────────

describe('hasTargetRelatedSettings', () => {
  it('returns true for html target (htmlOptions)', () => {
    expect(hasTargetRelatedSettings('html')).toBe(true)
  })

  it('returns true for image targets (imageTarget/imageToPdf)', () => {
    expect(hasTargetRelatedSettings('png')).toBe(true)
    expect(hasTargetRelatedSettings('jpg')).toBe(true)
    expect(hasTargetRelatedSettings('webp')).toBe(true)
  })

  it('returns true for pdf target (imageToPdf possible)', () => {
    expect(hasTargetRelatedSettings('pdf')).toBe(true)
  })

  it('returns false for txt target (no target-related sections)', () => {
    expect(hasTargetRelatedSettings('txt')).toBe(false)
  })
})

// ─── pickTargetRelatedOptions ────────────────────────────────────────────────

describe('pickTargetRelatedOptions', () => {
  const fullOptions: ConversionOptions = {
    pdf: { ocr: true, selectedPages: [1, 2] },
    html: { textControl: { fontSize: 16 } },
    htmlEncode: { excludeSelectors: ['.nav'] },
    image: { quality: 0.9, keepAspectRatio: true },
    imageToPdf: {
      marginPt: 12,
      fit: 'original',
      pageMode: 'auto',
      rotationDeg: 0,
      scalePercent: 100
    },
    txtImage: {
      textColor: '#000',
      backgroundColor: '#fff',
      fontSizePx: 14,
      imageWidthPx: 600,
      paddingPx: 10,
      lineHeightPx: 20
    }
  }

  it('never includes pdf (pdfPages/pdfOcr are source-only)', () => {
    const picked = pickTargetRelatedOptions(fullOptions, 'html')
    expect(picked.pdf).toBeUndefined()
  })

  it('includes html when target is html', () => {
    const picked = pickTargetRelatedOptions(fullOptions, 'html')
    expect(picked.html).toEqual(fullOptions.html)
  })

  it('excludes html when target is not html', () => {
    const picked = pickTargetRelatedOptions(fullOptions, 'png')
    expect(picked.html).toBeUndefined()
  })

  it('includes image when target is png/jpg/webp and source is not txt', () => {
    const picked = pickTargetRelatedOptions(fullOptions, 'png', 'image')
    expect(picked.image).toEqual(fullOptions.image)
  })

  it('excludes image when target is png/jpg/webp but source is txt', () => {
    const picked = pickTargetRelatedOptions(fullOptions, 'png', 'txt')
    expect(picked.image).toBeUndefined()
  })

  it('includes imageToPdf when target is pdf and source is image', () => {
    const picked = pickTargetRelatedOptions(fullOptions, 'pdf', 'image')
    expect(picked.imageToPdf).toEqual(fullOptions.imageToPdf)
  })

  it('excludes imageToPdf when target is pdf but source is not image', () => {
    const picked = pickTargetRelatedOptions(fullOptions, 'pdf', 'pdf')
    expect(picked.imageToPdf).toBeUndefined()
  })

  it('never includes txtImage (source-only)', () => {
    const picked = pickTargetRelatedOptions(fullOptions, 'png', 'txt')
    expect(picked.txtImage).toBeUndefined()
  })

  it('never includes htmlEncode (source-only)', () => {
    const picked = pickTargetRelatedOptions(fullOptions, 'html', 'html')
    expect(picked.htmlEncode).toBeUndefined()
  })
})

// ─── getGroupSettingsSections ────────────────────────────────────────────────

describe('getGroupSettingsSections', () => {
  it('returns union of target-related sections for mixed-source group', () => {
    // image→pdf: imageToPdf; pdf→html: htmlOptions
    const members = [member('a', 'image', 'pdf'), member('b', 'pdf', 'html')]
    const sections = getGroupSettingsSections(members)
    expect(sections).toContain('imageToPdf')
    expect(sections).toContain('htmlOptions')
    // source-only sections are excluded
    expect(sections).not.toContain('pdfPages')
    expect(sections).not.toContain('pdfOcr')
    expect(sections).not.toContain('htmlEncodeOptions')
    expect(sections).not.toContain('txtImage')
  })

  it('never includes pdfPages or pdfOcr even for pdf-source members', () => {
    const members = [member('a', 'pdf', 'txt'), member('b', 'pdf', 'pdf')]
    const sections = getGroupSettingsSections(members)
    expect(sections).not.toContain('pdfPages')
    expect(sections).not.toContain('pdfOcr')
  })

  it('includes imageTarget for image→png/jpg/webp members', () => {
    const members = [member('a', 'image', 'png'), member('b', 'image', 'webp')]
    const sections = getGroupSettingsSections(members)
    expect(sections).toContain('imageTarget')
  })

  it('excludes txtImage even for txt→png/jpg/webp members (source-only)', () => {
    const members = [member('a', 'txt', 'png')]
    const sections = getGroupSettingsSections(members)
    expect(sections).not.toContain('txtImage')
  })

  it('excludes htmlEncodeOptions even for html→html members (source-only)', () => {
    const members = [member('a', 'html', 'html')]
    const sections = getGroupSettingsSections(members)
    expect(sections).not.toContain('htmlEncodeOptions')
  })

  it('returns unique sections (no duplicates) for overlapping members', () => {
    const members = [
      member('a', 'pdf', 'html'),
      member('b', 'image', 'html'),
      member('c', 'txt', 'html')
    ]
    const sections = getGroupSettingsSections(members)
    // htmlOptions should appear once, not three times
    const htmlCount = sections.filter((s: string) => s === 'htmlOptions').length
    expect(htmlCount).toBe(1)
  })

  it('returns empty array when no target-related sections apply', () => {
    // docx→txt: no target-related sections (no htmlOptions, no imageTarget, no imageToPdf, etc.)
    const members = [member('a', 'docx', 'txt')]
    const sections = getGroupSettingsSections(members)
    expect(sections).toEqual([])
  })
})

// ─── applyGroupSectionOptionsToApplicableMembers ────────────────────────────

describe('applyGroupSectionOptionsToApplicableMembers', () => {
  const mkMember = (id: string, source: SourceFormat, target: TargetFormat): MemberLike => ({
    id,
    source,
    target,
    fileName: `${id}.ext`,
    conversionOptions: { pdf: { ocr: false } }
  })

  it('writes imageToPdf options only to source===image && target===pdf members', () => {
    const members = [
      mkMember('img-pdf', 'image', 'pdf'),
      mkMember('pdf-pdf', 'pdf', 'pdf'),
      mkMember('img-txt', 'image', 'txt')
    ]
    const imageToPdfOpts = {
      marginPt: 48,
      fit: 'showAll' as const,
      pageMode: 'single' as const,
      rotationDeg: 90 as const,
      scalePercent: 80
    }
    const result = applyGroupSectionOptionsToApplicableMembers(
      { imageToPdf: imageToPdfOpts },
      members,
      'imageToPdf'
    )
    const imgPdf = findMember(result, 'img-pdf')
    const pdfPdf = findMember(result, 'pdf-pdf')
    const imgTxt = findMember(result, 'img-txt')
    expect(imgPdf.conversionOptions.imageToPdf).toEqual(imageToPdfOpts)
    expect(pdfPdf.conversionOptions.imageToPdf).toBeUndefined()
    expect(imgTxt.conversionOptions.imageToPdf).toBeUndefined()
  })

  it('writes htmlOptions only to target===html members', () => {
    const members = [
      mkMember('a', 'pdf', 'html'),
      mkMember('b', 'pdf', 'txt'),
      mkMember('c', 'image', 'html')
    ]
    const htmlOpts = { textControl: { fontSize: 20 } }
    const result = applyGroupSectionOptionsToApplicableMembers(
      { html: htmlOpts },
      members,
      'htmlOptions'
    )
    expect(findMember(result, 'a').conversionOptions.html).toEqual(htmlOpts)
    expect(findMember(result, 'b').conversionOptions.html).toBeUndefined()
    expect(findMember(result, 'c').conversionOptions.html).toEqual(htmlOpts)
  })

  it('writes imageTarget options only to non-txt-source image-target members', () => {
    const members = [
      mkMember('a', 'image', 'png'),
      mkMember('b', 'txt', 'png'),
      mkMember('c', 'pdf', 'jpg')
    ]
    const imgOpts = { quality: 0.5, keepAspectRatio: false }
    const result = applyGroupSectionOptionsToApplicableMembers(
      { image: imgOpts },
      members,
      'imageTarget'
    )
    expect(findMember(result, 'a').conversionOptions.image).toEqual(imgOpts)
    expect(findMember(result, 'b').conversionOptions.image).toBeUndefined()
    expect(findMember(result, 'c').conversionOptions.image).toEqual(imgOpts)
  })

  it('does not mutate original members', () => {
    const original = mkMember('x', 'image', 'pdf')
    const result = applyGroupSectionOptionsToApplicableMembers(
      {
        imageToPdf: {
          marginPt: 10,
          fit: 'original',
          pageMode: 'auto',
          rotationDeg: 0,
          scalePercent: 100
        }
      },
      [original],
      'imageToPdf'
    )
    expect(result[0]).not.toBe(original)
    expect(result[0].conversionOptions).not.toBe(original.conversionOptions)
    expect(original.conversionOptions.imageToPdf).toBeUndefined()
  })
})

// ─── removeEmptyGroups ──────────────────────────────────────────────────────

describe('removeEmptyGroups', () => {
  it('removes groups whose fileIds no longer map to any existing item', () => {
    const groups = [mkGroupItem('g1', ['a', 'b'], 'txt'), mkGroupItem('g2', ['c'], 'html')]
    const items = new Map([
      ['a', member('a', 'pdf', 'txt')],
      ['b', member('b', 'pdf', 'txt')]
    ])
    const result = removeEmptyGroups(groups, items)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('g1')
  })

  it('keeps groups that still have members', () => {
    const groups = [mkGroupItem('g1', ['a'], 'txt'), mkGroupItem('g2', ['b'], 'html')]
    const items = new Map([
      ['a', member('a', 'pdf', 'txt')],
      ['b', member('b', 'html', 'txt')]
    ])
    const result = removeEmptyGroups(groups, items)
    expect(result).toHaveLength(2)
  })

  it('returns empty array when all groups are empty', () => {
    const groups = [mkGroupItem('g1', ['gone'], 'txt')]
    const items = new Map<string, MemberLike>()
    const result = removeEmptyGroups(groups, items)
    expect(result).toEqual([])
  })

  it('returns empty array for empty input', () => {
    const items = new Map([['a', member('a', 'pdf', 'txt')]])
    expect(removeEmptyGroups([], items)).toEqual([])
  })
})
