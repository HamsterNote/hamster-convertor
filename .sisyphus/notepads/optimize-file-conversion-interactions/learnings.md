# Learnings

## Project Conventions

- TypeScript: use `type` not `interface`, no `any`
- i18n: zh-CN, zh-TW, en locales in `src/i18n/locales/*.json`
- TargetFormat: 'html' | 'txt' | 'image' | 'pdf'
- SourceFormat: 'pdf' | 'txt' | 'image'
- Tests: Vitest + React Testing Library + Playwright

## Current State

- `supportedTargets.pdf` = ['txt', 'image'] — needs 'pdf'
- `FileItem` has no conversionOptions — needs `conversionOptions: { pdf: { ocr: boolean } }`
- `ConversionRequest` has no options — needs `options?: { pdf?: { ocr: boolean } }`
- Target select disabled for `converting` || `queued` — needs to also include `done`
- E2E fake conversion in `createE2EResult` needs pdf target support
- ImageParser mock in `src/test/mocks/image-parser.ts` exists and returns `{ outline: undefined, text: 'mock ocr text' }`
- EmptyOcrError exists in `image-adapters.ts`
- `errors.emptyOcr` i18n key already exists

## Key Files

- `src/App.tsx` — main UI, file list, conversion logic
- `src/lib/converter.ts` — conversion routing, types
- `src/lib/converter/pdf-adapters.ts` — PDF adapters
- `src/lib/converter/image-adapters.ts` — image adapters, OCR pattern
- `src/__tests__/app.upload.test.tsx` — upload tests (minimal)
- `src/__tests__/converter.contract.test.ts` — contract tests
- `src/__tests__/convert.integration.test.ts` — integration tests
- `e2e/app.spec.ts` — E2E tests

## OCR Implementation Pattern (from image-adapters.ts)

1. Import `ImageParser` from `@hamster-note/image-parser`
2. Call `ImageParser.encode(arrayBuffer)`
3. Extract text from `intermediateDocument.text`
4. Throw `EmptyOcrError` if no text

## PDF Rendering Pattern (from pdf-adapters.ts)

1. `loadPdfDocument(arrayBuffer)` loads via pdfjs-dist
2. `renderPageToBlob(page)` renders to canvas → PNG blob
3. Pages have `getViewport({ scale })` and `render({ canvasContext, viewport })`

## jsPDF Pattern (from image-adapters.ts)

1. `const { jsPDF } = await import('jspdf')`
2. `new jsPDF({ unit: 'px', format: [width, height] })`
3. `doc.addImage(url, 0, 0, width, height)`
4. `doc.output('blob')` for result

## Decision Log

- OCR text layer: use `doc.setTextColor(255,255,255)` + `doc.setFontSize(1)` + `doc.text(text, 16, 16)` as MVP
- Per-row OCR: stored in `FileItem.conversionOptions.pdf.ocr`
- Default OCR: `false` (unchecked)
- Lock target: disabled for `queued`, `converting`, `done`
- Show OCR checkbox: only when target === 'pdf'
- Enable OCR checkbox: only when status is 'ready' or 'failed'
- Hide for non-PDF targets

## 2026-04-30 PDF to PDF Adapter

- `convertPdfToPdf` lives in `src/lib/converter/pdf-adapters.ts` and preserves original bytes when OCR is disabled.
- OCR-enabled PDF output renders pages to PNG in browser contexts, adds each image as a jsPDF page background, then writes white 1px text at `(16, 16)`.
- Vitest/jsdom has no canvas context, so the OCR path falls back to existing PDF text extraction when rendering is unavailable.
- Clone ArrayBuffers before passing them to PDF.js if they may be reused, because PDF.js can detach transferred buffers.
- 2026-04-30: Added E2E coverage in `e2e/app.spec.ts` for PDF-to-PDF OCR visibility/toggle, done-state target locking, same-name re-upload rows, and OCR hiding for TXT targets.
- 2026-04-30: App upload tests can mock `PdfPageSelectorModal` to drive selected page confirmation without jsdom/PDF.js canvas dependencies.
- 2026-04-30: App-level download overlay coverage should mock `downloadResultArchive` with a controlled pending promise and use the row download button when multiple outputs are present.
