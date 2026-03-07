import path from 'path'
import { fileURLToPath } from 'url'
import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@system-ui-js/pdf-parser': path.resolve(__dirname, '../PdfParser/src/index.ts'),
      '@system-ui-js/html-parser': path.resolve(__dirname, '../HtmlParser/dist/index.js'),
      '@hamster-note/document-parser': path.resolve(__dirname, '../DocumentParser/dist/index.js'),
      '@hamster-note/types': path.resolve(__dirname, './src/types/hamster-note-types.d.ts'),
      'pdfjs-dist': path.resolve(
        __dirname,
        '../PdfParser/node_modules/pdfjs-dist/legacy/build/pdf.mjs'
      )
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    testTimeout: 30000,
    hookTimeout: 10000,
    exclude: [...configDefaults.exclude, 'e2e/**']
  }
})
