import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { type Plugin, defineConfig } from 'vite'

// 条件化别名：仅在本地开发时且路径存在时使用 sibling 目录
const localDevAlias: Record<string, string> = {}
const pdfParserPath = path.resolve(__dirname, '../PdfParser/src/index.ts')
const htmlParserPath = path.resolve(__dirname, '../HtmlParser/dist/index.js')
const documentParserPath = path.resolve(__dirname, '../DocumentParser/dist/index.js')
const typesPath = path.resolve(__dirname, '../types/src/index.ts')
const pdfParserStandardFontsPath = path.resolve(
  __dirname,
  'node_modules/@hamster-note/pdf-parser/dist/standard_fonts'
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

// 拦截 pdf-parser 中的 import("pdfjs-dist") 调用，替换为包装模块
// 解决中文乱码问题：pdf.js 需要 CMap 数据才能正确解码 CJK 文本
const interceptPdfjsImportPlugin = (): Plugin => ({
  name: 'intercept-pdfjs-import',
  enforce: 'pre',
  transform(code, id) {
    // 只处理 pdf-parser 模块
    const isPdfParserModule = id.includes('@hamster-note/pdf-parser') || id.includes('/PdfParser/')
    if (!isPdfParserModule || !code.includes('import("pdfjs-dist")')) {
      return null
    }

    console.log('[intercept-pdfjs-import] Intercepting pdfjs-dist import in:', id)

    // 将 import("pdfjs-dist") 替换为我们的包装模块
    const modifiedCode = code.replace(
      'import("pdfjs-dist")',
      'import("/src/lib/pdfjs-wrapper.ts")'
    )

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
    if (!existsSync(pdfParserStandardFontsPath)) {
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

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [interceptPdfjsImportPlugin(), ensurePdfParserStandardFontUrlPlugin(), react()],
  optimizeDeps: {
    exclude: ['@hamster-note/pdf-parser']
  },
  resolve: {
    alias: localDevAlias
  },
  server: {
    port: 5073,
    host: '0.0.0.0'
  },
  preview: {
    port: 5073
  }
})
