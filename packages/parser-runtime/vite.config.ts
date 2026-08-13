import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import { rewritePdfjsImport } from './src/lib/pdfjs-import-rewrite'

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

const interceptPdfjsImportPlugin = (): Plugin => ({
  name: 'intercept-pdfjs-import',
  enforce: 'pre',
  transform(code, id) {
    const modifiedCode = rewritePdfjsImport(code, id)
    if (modifiedCode === null) {
      return null
    }

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

// 与根 vite.config.ts 保持一致的 BASE_PATH 处理逻辑：
// - 默认根部署：base = '/parser-runtime/'
// - 子路径部署 BASE_PATH=/beta/：base = '/beta/parser-runtime/'
// 注意：这里要避免出现 '//parser-runtime/' 这种重复斜杠。
const resolveRuntimeBase = (): string => {
  const raw = process.env.BASE_PATH
  if (!raw || raw === '/') {
    return '/parser-runtime/'
  }
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`
  const withTrailing = withLeading.endsWith('/') ? withLeading : `${withLeading}/`
  return `${withTrailing}parser-runtime/`.replace(/\/+/g, '/')
}

export default defineConfig({
  base: resolveRuntimeBase(),
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
