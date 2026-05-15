import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const documentParserPath = path.resolve(__dirname, '../DocumentParser/dist/index.js')
const typesPath = path.resolve(__dirname, './src/types/hamster-note-types.d.ts')
const mockPdfParserPath = path.resolve(__dirname, './src/test/mocks/pdf-parser.ts')
const mockHtmlParserPath = path.resolve(__dirname, './src/test/mocks/html-parser.ts')
const mockTxtParserPath = path.resolve(__dirname, './src/test/mocks/txt-parser.ts')
const mockImageParserPath = path.resolve(__dirname, './src/test/mocks/image-parser.ts')

const alias: Record<string, string> = {
  '@hamster-note/pdf-parser': mockPdfParserPath,
  '@hamster-note/html-parser': mockHtmlParserPath,
  '@hamster-note/txt-parser': mockTxtParserPath,
  '@hamster-note/image-parser': mockImageParserPath,
  '@hamster-note/types': typesPath
}

if (existsSync(documentParserPath)) {
  alias['@hamster-note/document-parser'] = documentParserPath
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
