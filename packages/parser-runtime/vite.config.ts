import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'

// 条件化别名：仅在本地开发时且路径存在时使用 sibling 目录。
// 这里复用根 Vite 配置的 parser alias 规则，但路径从 packages/parser-runtime 反推到仓库外层。
const localDevAlias: Record<string, string> = {}
const pdfParserPath = path.resolve(__dirname, '../../../PdfParser/src/index.ts')
const htmlParserPath = path.resolve(__dirname, '../../../HtmlParser/dist/index.js')
const documentParserPath = path.resolve(__dirname, '../../../DocumentParser/dist/index.js')
const typesPath = path.resolve(__dirname, '../../../types/src/index.ts')
const pdfParserStandardFontsCandidates = [
  path.resolve(__dirname, 'node_modules/@hamster-note/pdf-parser/dist/standard_fonts'),
  path.resolve(__dirname, '../../node_modules/@hamster-note/pdf-parser/dist/standard_fonts')
]
const pdfParserStandardFontsPath = pdfParserStandardFontsCandidates.find(candidate =>
  existsSync(candidate)
)

if (existsSync(pdfParserPath)) {
  localDevAlias['@hamster-note/pdf-parser'] = pdfParserPath
}
if (existsSync(htmlParserPath)) {
  localDevAlias['@hamster-note/html-parser'] = htmlParserPath
}
if (existsSync(documentParserPath)) {
  localDevAlias['@hamster-note/document-parser'] = documentParserPath
}
if (existsSync(typesPath)) {
  localDevAlias['@hamster-note/types'] = typesPath
}

const pdfParserStandardFontsExpression = 'new URL("./standard_fonts/", import.meta.url).href'

// 拦截 pdf-parser 中的 import("pdfjs-dist") 调用，替换为 runtime 内部包装模块。
// 解决中文乱码问题：pdf.js 需要 CMap 数据才能正确解码 CJK 文本。
const interceptPdfjsImportPlugin = (): Plugin => ({
  name: 'intercept-pdfjs-import',
  enforce: 'pre',
  transform(code, id) {
    // 只处理 pdf-parser 模块，避免影响 runtime 或其他第三方依赖的 pdfjs 使用方式。
    const isPdfParserModule = id.includes('@hamster-note/pdf-parser') || id.includes('/PdfParser/')
    if (!isPdfParserModule || !code.includes('import("pdfjs-dist")')) {
      return null
    }

    // 将 import("pdfjs-dist") 替换为 runtime 自己的包装模块。
    const modifiedCode = code.replace('import("pdfjs-dist")', 'import("/src/lib/pdfjs-wrapper.ts")')

    return {
      code: modifiedCode,
      map: null
    }
  }
})

const ensurePdfParserStandardFontUrlPlugin = (): Plugin => ({
  name: 'ensure-pdf-parser-standard-font-url',
  enforce: 'pre',
  transform(code, id) {
    const isPdfParserModule = id.includes('@hamster-note/pdf-parser') || id.includes('/PdfParser/')
    if (!isPdfParserModule || !code.includes(pdfParserStandardFontsExpression)) {
      return null
    }

    return {
      code: code.replaceAll(
        pdfParserStandardFontsExpression,
        `${pdfParserStandardFontsExpression}.replace(/\\/?$/, '/')`
      ),
      map: null
    }
  },
  generateBundle() {
    if (!pdfParserStandardFontsPath) {
      return
    }

    for (const entry of readdirSync(pdfParserStandardFontsPath, { withFileTypes: true })) {
      if (!entry.isFile()) {
        continue
      }

      this.emitFile({
        type: 'asset',
        fileName: `assets/standard_fonts/${entry.name}`,
        source: readFileSync(path.join(pdfParserStandardFontsPath, entry.name))
      })
    }
  }
})

export default defineConfig({
  base: '/parser-runtime/',
  plugins: [interceptPdfjsImportPlugin(), ensurePdfParserStandardFontUrlPlugin()],
  optimizeDeps: {
    exclude: ['@hamster-note/pdf-parser']
  },
  resolve: {
    alias: localDevAlias
  },
  server: {
    port: 5074,
    host: '0.0.0.0'
  },
  preview: {
    port: 5074,
    host: '0.0.0.0'
  },
  build: {
    outDir: path.resolve(__dirname, '../../dist/parser-runtime'),
    emptyOutDir: true
  }
})
