# Design: Conversion UI Optimizations & File Conversion Interactions

## Context

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
- ConversionOptions: { pdf: { ocr: boolean, selectedImagePages?: number[] } }
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

## Goals / Non-Goals

### Goals (conversion-ui-optimizations):

1. Make conversion and download operations visibly blocking
2. Give users explicit PDF→image page control before conversion
3. Allow deleting any row when the app is not busy

### Non-Goals (conversion-ui-optimizations):

- Do not introduce Redux/Zustand or a new state library
- Do not build range input, drag reorder, zoom controls, OCR changes, new formats, or persistent storage
- Do not refactor unrelated Header/Footer/Dropzone behavior
- Do not use `any`
- Do not add untranslated visible text
- Do not leave object URLs or canvases leaking after modal close

### Goals (optimize-file-conversion-interactions):

1. Prevent changing target type for completed rows
2. Allow per-row OCR configuration for PDF output
3. Support duplicate same-name re-upload after completion

### Non-Goals (optimize-file-conversion-interactions):

- MUST NOT add `txt→pdf`
- MUST NOT add global OCR settings, OCR language selection, OCR progress UI, or batch OCR controls
- MUST NOT deduplicate uploads by name, size, lastModified, content hash, or object identity
- MUST NOT lock target selection for `failed` rows

## Decisions

### From conversion-ui-optimizations/notepads/decisions.md:

1. **Page numbering**: Use 1-based page numbers everywhere outside array indexes
2. **Modal preview scale**: Use scale: 0.4 for thumbnails
3. **Object URL cleanup**: Must revoke on modal close/unmount/file change
4. **E2E fake previews**: When window.**E2E** === true, render fake two-page previews instead of real pdfjs rendering

### From optimize-file-conversion-interactions/notepads/learnings.md (Decision Log):

1. **OCR text layer**: use `doc.setTextColor(255,255,255)` + `doc.setFontSize(1)` + `doc.text(text, 16, 16)` as MVP
2. **Per-row OCR**: stored in `FileItem.conversionOptions.pdf.ocr`
3. **Default OCR**: `false` (unchecked)
4. **Lock target**: disabled for `queued`, `converting`, `done`
5. **Show OCR checkbox**: only when target === 'pdf'
6. **Enable OCR checkbox**: only when status is 'ready' or 'failed'
7. **Hide for non-PDF targets**

### Task 8 E2E Hardening Decisions:

1. Preserve `undefined` PDF image page selections as "all pages" to match converter defaults
2. Keep E2E-only conversion latency in the fake conversion path so loading-overlay assertions observe real UI state

## Risks / Trade-offs

### From conversion-ui-optimizations/notepads/issues.md:

**Open Risks:**

1. PDF.js in jsdom: Modal thumbnail rendering may fail in unit tests - mock if needed
2. Canvas in jsdom: jsdom doesn't support canvas well - may need mocking
3. Async download: downloadBlobFile is synchronous but downloadResultArchive is async - need to make both awaitable for loading overlay
4. State management: Need to add isConvertingAll and isPreparingDownload to App state

**Resolved Issues:**

- 2026-04-30: PDF→image conversion was blocked when no page selector value existed, despite converter E2E/default behavior rendering all pages for `undefined`; fixed by only rejecting explicit empty selections.

**Environment Blockers:**

- 2026-04-30: Playwright E2E tests cannot run on Ubuntu 26.04 - Playwright does not support this OS version for browser installation.

### From optimize-file-conversion-interactions/notepads/issues.md:

- `yarn build` is blocked by pre-existing TypeScript `BlobPart` errors in `src/__tests__/convert.integration.test.ts`
- `yarn playwright test e2e/app.spec.ts` is blocked because Chromium is not installed under `.cache/ms-playwright`

### Plan Compliance Audit Findings (REJECT):

- `convertPdfToImage` treats `selectedImagePages: []` as no selection and renders all pages instead of throwing
- `changeTarget` only clears stale done/failed outputs when changing away from image
- `changeOcrOption` can drop previously selected image pages after switching PDF targets
- Single-output download calls don't await properly
- During global download busy, row target selects and page-select buttons are not globally disabled
- `PdfPageSelectorModal` shows raw Error.message instead of localized preview/load error string
- E2E evidence artifacts are incomplete

### Code Quality Review Findings (REJECT):

- `PdfPageSelectorModal` has Biome diagnostics: unsorted imports and missing hook dependencies
- `PdfPageSelectorModal` lacks modal focus management and Escape/backdrop close keyboard support
- `PdfPageSelectorModal` can leave `loading` true if the effect is aborted
- `global.css` hardcodes modal error colors instead of theme variables
- Build passes with Vite warnings about large chunks

## Wave Dependencies

### Conversion UI Optimizations Waves:

- Wave 1: T1 (converter), T2 (loading), T3 (modal), T6 (i18n/styles) - all parallel
- Wave 2: T4 (App integration), T5 (download/delete), T7 (tests) - depend on Wave 1
- Wave 3: T8 (E2E) - depends on Wave 2

### Optimize File Conversion Interactions Waves:

- Wave 1: T1 test specs, T2 converter contract tests, T3 UI state/i18n foundation
- Wave 2: T4 PDF→PDF adapter, T5 UI behavior implementation, T6 duplicate upload regression
- Wave 3: T7 E2E coverage, T8 integration/lint/build stabilization
