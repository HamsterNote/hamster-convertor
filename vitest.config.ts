import path from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@system-ui-js/pdf-parser': path.resolve(
        __dirname,
        '../PdfParser/src/index.ts'
      ),
      '@system-ui-js/html-parser': path.resolve(
        __dirname,
        '../HtmlParser/dist/index.js'
      ),
      '@hamster-note/document-parser': path.resolve(
        __dirname,
        '../DocumentParser/dist/index.js'
      ),
      '@hamster-note/types': path.resolve(__dirname, '../types/src/index.ts'),
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
    hookTimeout: 10000
  }
})
