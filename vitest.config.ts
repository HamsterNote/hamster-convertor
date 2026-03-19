import path from 'path'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const documentParserPath = path.resolve(__dirname, '../DocumentParser/dist/index.js')
const typesPath = path.resolve(__dirname, './src/types/hamster-note-types.d.ts')
const pdfjsPath = path.resolve(
  __dirname,
  '../PdfParser/node_modules/pdfjs-dist/legacy/build/pdf.mjs'
)
const mockPdfParserPath = path.resolve(__dirname, './src/test/mocks/pdf-parser.ts')
const mockHtmlParserPath = path.resolve(__dirname, './src/test/mocks/html-parser.ts')

const alias: Record<string, string> = {
  '@hamster-note/pdf-parser': mockPdfParserPath,
  '@hamster-note/html-parser': mockHtmlParserPath,
  '@hamster-note/types': typesPath
}

if (existsSync(documentParserPath)) {
  alias['@hamster-note/document-parser'] = documentParserPath
}

if (existsSync(pdfjsPath)) {
  alias['pdfjs-dist'] = pdfjsPath
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    testTimeout: 30000,
    hookTimeout: 10000,
    exclude: [...configDefaults.exclude, 'e2e/**']
  }
})
