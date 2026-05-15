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
  plugins: [ensurePdfParserStandardFontUrlPlugin(), react()],
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
