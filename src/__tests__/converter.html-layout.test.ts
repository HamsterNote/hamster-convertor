import { describe, expect, it } from 'vitest'
import { applyHtmlLayout } from '../lib/converter'

// 模拟真实 html-parser decodeToHtml 返回的 HTML 片段（不含 <html>/<head>/<meta charset>）
const chineseFragment = `<div class="hamster-note-document"><style> .hamster-note-document { position: relative; display: block; contain: layout style size; } .hamster-note-document .hamster-note-page { position: relative; overflow: hidden; background-repeat: no-repeat; background-position: top center; background-size: contain; } .hamster-note-document .hamster-note-text { position: absolute; white-space: pre; transform-origin: 0 0; } </style><div class="hamster-note-page" id="page-1" style="width:612px;height:792px;background-image:url('data:image/png;base64,...');"><span class="hamster-note-text" id="text-1" style="font-size:14px;left:72px;top:60px;">架构设计：Chrome浏览器</span></div></div>`

// 模拟完整 HTML 文档（含 charset）— 来自 html-parser decode() 或外部工具
const fullDocument = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>测试文档</title></head><body><div class="hamster-note-document"><style> .hamster-note-text { position: absolute; white-space: pre; } </style><div class="hamster-note-page" style="width:612px;height:792px;"><span class="hamster-note-text" style="font-size:14px;">架构设计：Chrome浏览器</span></div></div></body></html>`

describe('applyHtmlLayout charset and document structure', () => {
  describe('fragment input (no charset, no <html>/<head>)', () => {
    it('wraps fragment in full HTML document with <meta charset="utf-8">', () => {
      const result = applyHtmlLayout(chineseFragment, { mode: 'paginated' })

      // 必须包含 charset 声明 — 这是修复中文乱码的关键
      expect(result).toContain('<meta charset="utf-8">')
    })

    it('preserves Chinese text unchanged in the output', () => {
      const result = applyHtmlLayout(chineseFragment, { mode: 'paginated' })

      // 中文文本不能被改变或编码
      expect(result).toContain('架构设计：Chrome浏览器')
    })

    it('produces a valid HTML document structure with <html>, <head>, <body>', () => {
      const result = applyHtmlLayout(chineseFragment, { mode: 'paginated' })

      expect(result).toContain('<!DOCTYPE html>')
      expect(result).toContain('<html')
      expect(result).toContain('<head>')
      expect(result).toContain('</head>')
      expect(result).toContain('<body>')
      expect(result).toContain('</body>')
      expect(result).toContain('</html>')
    })

    it('injects layout CSS inside <head>', () => {
      const result = applyHtmlLayout(chineseFragment, { mode: 'paginated' })

      // layout style 应在 <head> 内，而不是在 body 外面
      const headContent = result.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? ''
      expect(headContent).toContain('data-hamster-html-layout')
      expect(headContent).toContain('hamster-note-document')
    })
  })

  describe('full document input (already has charset)', () => {
    it('preserves existing charset meta tag', () => {
      const result = applyHtmlLayout(fullDocument, { mode: 'paginated' })

      // 无论有无自闭合斜杠，都应保留 charset 声明
      expect(result).toMatch(/<meta\s+charset="utf-8"/i)
    })

    it('preserves Chinese text in full document', () => {
      const result = applyHtmlLayout(fullDocument, { mode: 'paginated' })

      expect(result).toContain('架构设计：Chrome浏览器')
    })

    it('injects layout CSS into existing <head>', () => {
      const result = applyHtmlLayout(fullDocument, { mode: 'paginated' })

      const headContent = result.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? ''
      expect(headContent).toContain('data-hamster-html-layout')
    })

    it('does not duplicate charset meta tags', () => {
      const result = applyHtmlLayout(fullDocument, { mode: 'paginated' })

      const charsetCount = (result.match(/<meta\s+charset="utf-8"/gi) ?? []).length
      expect(charsetCount).toBe(1)
    })
  })

  describe('continuous fit-width mode', () => {
    it('wraps fragment with charset and layout CSS for continuous mode', () => {
      const result = applyHtmlLayout(chineseFragment, { mode: 'continuous', widthMode: 'fit' })

      expect(result).toContain('<meta charset="utf-8">')
      expect(result).toContain('架构设计：Chrome浏览器')
    })

    it('converts px to vw and adds fit-width layout CSS', () => {
      const result = applyHtmlLayout(chineseFragment, { mode: 'continuous', widthMode: 'fit' })

      // fit-width 应转换 px 为 vw
      expect(result).toContain('vw')
      // 添加 padding-bottom 实现宽高比
      expect(result).toContain('padding-bottom')
    })
  })

  describe('paginated mode layout CSS', () => {
    it('adds page shadow and gap styles', () => {
      const result = applyHtmlLayout(chineseFragment, { mode: 'paginated' })

      expect(result).toContain('box-shadow')
      expect(result).toContain('margin-bottom')
      expect(result).toContain('border-radius')
    })
  })
})