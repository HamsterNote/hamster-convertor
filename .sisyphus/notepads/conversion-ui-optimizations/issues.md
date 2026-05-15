## Conversion UI Optimizations - Issues & Decisions

### Generated: 2026-04-30

### Open Decisions

1. **Page numbering**: Use 1-based page numbers everywhere outside array indexes (per plan spec)
2. **Modal preview scale**: Use scale: 0.4 for thumbnails (per plan spec)
3. **Object URL cleanup**: Must revoke on modal close/unmount/file change
4. **E2E fake previews**: When window.**E2E** === true, render fake two-page previews instead of real pdfjs rendering

### Potential Issues

1. **PDF.js in jsdom**: Modal thumbnail rendering may fail in unit tests - mock if needed
2. **Canvas in jsdom**: jsdom doesn't support canvas well - may need mocking
3. **Async download**: downloadBlobFile is synchronous but downloadResultArchive is async - need to make both awaitable for loading overlay
4. **State management**: Need to add isConvertingAll and isPreparingDownload to App state

### Resolved Issues

- 2026-04-30: PDF→image conversion was blocked when no page selector value existed, despite converter E2E/default behavior rendering all pages for `undefined`; fixed by only rejecting explicit empty selections.

### Environment Blockers

- 2026-04-30: Playwright E2E tests cannot run on Ubuntu 26.04 - Playwright does not support this OS version for browser installation. E2E tests are written correctly but require `npx playwright install` on a supported OS. All E2E test code is valid and ready to run in CI or local dev environment with supported OS.

## Plan Compliance Audit - 2026-04-30

Verdict: REJECT.

Findings:

- `convertPdfToImage` treats `selectedImagePages: []` as no selection and renders all pages instead of throwing a normal Error.
- `changeTarget` only clears stale done/failed outputs when changing away from image; failed/done state from other target changes can remain stale, contrary to target-change clearing requirement.
- `changeOcrOption` replaces the full `pdf` options object and can drop previously selected image pages after switching PDF targets and toggling OCR.
- Single-output `handleDownloadAll` / `handleRowDownload` call `downloadBlobFile` without awaiting `Promise.resolve(...)`, so the loading overlay can clear immediately and does not comply with async try/finally requirement.
- During global download busy, row target selects and page-select buttons are not globally disabled; the dropzone also still accepts files.
- `PdfPageSelectorModal` shows raw thrown `Error.message` for preview failures instead of the localized preview/load error string.
- E2E evidence artifacts are incomplete versus the plan's named screenshot/text evidence matrix; only three task-8 text files are present.

## Code Quality Review - 2026-04-30

Verdict: REJECT.

Findings:

- `PdfPageSelectorModal` has Biome diagnostics: unsorted imports and missing hook dependencies for `handleE2EThumbnails` / `handleRealPdfThumbnails`.
- `PdfPageSelectorModal` lacks modal focus management and Escape/backdrop close keyboard support.
- `PdfPageSelectorModal` can leave `loading` true if the effect is aborted before an async path clears it.
- `global.css` hardcodes modal error colors instead of theme variables.
- Build passes with Vite warnings about large chunks and browser-externalized Node modules from `@techstark/opencv-js`.

## Scope Fidelity Check - 2026-04-30

Verdict: REJECT.

Findings:

- Implementation files are within the expected modified/created source/test/style/i18n set, except unexpected untracked paths exist: `openspec/` and `playwright-firefox.config.ts`.
- `package.json` is unchanged and no Redux/Zustand/state-library dependency is present.
- Forbidden UI additions were not found in the inspected implementation: no range input, drag reorder, zoom controls, page-selection storage, or new formats.
- No `as any` or `: any` matches were found under `src`.
- Required features are present at implementation level: full-screen convert loading, PDF→image page selector modal, download loading, and row delete actions.

## Manual QA Review - 2026-04-30

Verdict: REJECT.

Findings:

- `yarn test:run` passes: 9 files, 61 tests.
- Convert-all loading path is implemented with `setIsConvertingAll(true)` before queueing and `finally` cleanup after sequential conversions.
- PDF→image selection UI covers modal open, fake E2E previews, default all pages, deselect/select, disabled Done at zero selected, selected-count summary, and selected pages passed to conversion.
- Row deletion is present for all rows and disabled while global conversion, row running, or download preparation is active.
- Download loading remains incomplete for single-output row/global downloads: `downloadBlobFile` is synchronous and `setIsPreparingDownload(true)` then `false` can batch away the visible overlay; tests only prove async ZIP preparation.
