## Conversion UI Optimizations - Learnings

### Generated: 2026-04-30

### Project Conventions

- ESM modules (`"type": "module"`)
- TypeScript: no `any`, use `type` not `interface`
- Path alias: `@/*` → `./src/*`
- CSS: BEM-style classes, CSS variables in theme.css
- i18n: i18next with zh-CN, zh-TW, en locales
- Testing: Vitest + React Testing Library (unit), Playwright (e2e)
- Port: dev=5073, preview=5073

### Key Files

- `src/App.tsx` - Main app logic, file list, conversion
- `src/lib/converter.ts` - Conversion orchestration, E2E fake results
- `src/lib/converter/pdf-adapters.ts` - PDF conversion adapters
- `src/lib/download.ts` - Download helpers
- `src/styles/theme.css` - CSS variables, light/dark mode
- `src/styles/global.css` - Component styles
- `src/i18n/locales/*.json` - Translation files

### Existing Patterns

- FileItem has: id, file, source, target, status, outputs, warnings, errorMessage, conversionOptions
- ConversionOptions: { pdf: { ocr: boolean } }
- Status: 'ready' | 'queued' | 'converting' | 'done' | 'failed'
- Row actions: done rows show Download, others show Remove (×)
- convertAll() loops through items, no global busy state currently
- E2E mode: window.**E2E** = true triggers fake results in createE2EResult()
- PDF→image fake E2E returns [1, 2] as two fake pages

### PDF.js Usage

- Worker URL: `pdfjs-dist/build/pdf.worker.mjs?url`
- configurePdfJsWorker() sets workerSrc
- loadPdfDocument() returns document with numPages
- renderPageToBlob() renders at scale 2, converts canvas to PNG blob

### Testing Patterns

- Unit tests mock `../lib/converter` module
- E2E tests use page.addInitScript() to set **E2E** and intercept downloads
- Language switching via localStorage + i18n.changeLanguage()

### Wave Dependencies

- Wave 1: T1 (converter), T2 (loading), T3 (modal), T6 (i18n/styles) - all parallel
- Wave 2: T4 (App integration), T5 (download/delete), T7 (tests) - depend on Wave 1
- Wave 3: T8 (E2E) - depends on Wave 2

### selectedImagePages Feature (Added 2026-04-30)

- Extended `ConversionOptions` and `ConversionRequest.pdf` with `selectedImagePages?: number[]`
- Page numbers are 1-based externally, converted to 0-based internally
- Validation: filters to integers between 1 and `pdfDocument.numPages`, deduplicates, sorts ascending
- Throws `Error('No pages selected')` if filtered set is empty
- E2E fake results use `selectedImagePages ?? [1, 2]`
- Tests added in `converter.pdf-adapters.test.ts`: single page, multi-page dedup/sort, empty throws, undefined renders all

## FullscreenLoading Component - 2026-04-30

### Implementation Details

- Created `src/components/FullscreenLoading.tsx` with props `{ visible: boolean; label: string }`
- Returns `null` when not visible, avoiding any DOM footprint
- Uses fixed positioning with `z-index: 50` to overlay above header (z-index: 10)
- Includes `role='status'` and `aria-live='polite'` for accessibility
- Pure CSS spinner using border animation (no third-party packages)
- Supports light/dark themes via CSS variables from theme.css

### CSS Classes (BEM)

- `.fullscreen-loading` - fixed overlay, backdrop blur, veil background
- `.fullscreen-loading__card` - centered panel with padding and shadow
- `.fullscreen-loading__spinner` - rotating border spinner using primary-500
- `.fullscreen-loading__label` - label text below spinner

### i18n Keys Added

- `loading.converting`: 'Converting...' / '转换中...' / '轉換中...'
- `loading.preparingDownload`: 'Preparing download...' / '准备下载中...' / '準備下載中...'

### Test Coverage

- Test file: `src/__tests__/FullscreenLoading.test.tsx`
- 3 tests: not visible (null render), visible overlay structure, custom label

### Verification

- `yarn build`: PASS (tsc + vite build)
- `yarn test:run`: PASS (53 tests including 3 new)

## Task 8 E2E Hardening - 2026-04-30

- Added Playwright coverage for zh-CN PDF page selection summary, exact selected-page output count, convert-all loading, ZIP download loading, global download, and completed row deletion.
- `src/App.tsx` now treats `selectedImagePages: undefined` as the default all-pages path and only blocks PDF→image when the explicit selection is empty.
- E2E fake conversion waits one short paint interval so `.fullscreen-loading` can be observed reliably during convert-all.
- Evidence files saved under `.sisyphus/evidence/task-8-*.txt` for lint, unit tests, E2E tests, and build.
