import path from 'path'
import { existsSync } from 'fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 条件化别名：仅在本地开发时且路径存在时使用 sibling 目录
const localDevAlias: Record<string, string> = {}
const pdfParserPath = path.resolve(__dirname, '../PdfParser/src/index.ts')
const htmlParserPath = path.resolve(__dirname, '../HtmlParser/dist/index.js')
const documentParserPath = path.resolve(__dirname, '../DocumentParser/dist/index.js')
const typesPath = path.resolve(__dirname, '../types/src/index.ts')
const pdfjsPath = path.resolve(
  __dirname,
  '../PdfParser/node_modules/pdfjs-dist/legacy/build/pdf.mjs'
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
if (existsSync(pdfjsPath)) {
  localDevAlias['pdfjs-dist'] = pdfjsPath
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: localDevAlias
  },
  server: {
    port: 5073,
    host: process.env.CI ? '0.0.0.0' : '127.0.0.1'
  },
  preview: {
    port: 5073
  }
})
