# Project: PDF Image Format Conversion

## Conventions

- TypeScript: no `any`, use `type` not `interface`
- ESM modules
- Path alias: `@/*` → `./src/*`
- Tests: Vitest + Playwright (tests-after strategy)

## Decisions

## Issues / Gotchas

- Mocking `HTMLCanvasElement.prototype.getContext` in tests: return `{}` causes "fillRect is not a function" errors. Must return a proper mock object with all used methods (fillStyle, fillRect, drawImage).
- For JPG encoding: need to mock `document.createElement('canvas')` since `createWhiteBackgroundCanvas` calls `document.createElement` directly.

## Unresolved Blockers

## Learned

- `encodeCanvasToImage` returns `{ blob, extension, mimeType }` - extension already includes the dot (e.g., `.png`, `.jpg`)
- `renderPageToCanvas` returns the canvas synchronously, not a Promise - the render happens when `page.render().promise` resolves
- When refactoring `renderPageToBlob` to `renderPageToCanvas` for OCR path, must wrap the canvas creation and encoding in try/catch since `renderPageToBlob` was async and caught errors differently

## Post-Review Fixes (2026-05-01)

### Fix 1: Blob URL leak in PdfPageSelectorModal
- Added `isMountedRef.current` check in IntersectionObserver callback before calling setPageShells
- Revoke blob URL if component unmounts during `renderPageThumbnail`
- Extracted `renderThumbnailForPage` to reduce cognitive complexity

### Fix 2: Unsafe target casts
- Added runtime validation in `convertPdfToImage`: throws if target not in `['png', 'jpg', 'webp']`
- Added runtime validation in `convertImageToImage`: throws if target not in `['png', 'jpg', 'webp']`
- Preserves TypeScript cast for `encodeCanvasToImage` but now with guard

### Fix 3: TypeScript build errors
- Fixed `target !== 'image'` comparison (TargetFormat no longer includes 'image')
- Fixed getContext mock cast in tests
- Formatted code with Prettier

### Pre-existing issues (out of scope)
- BMP upload support: already existed, not added by this plan
- Duplicated helpers (readFileAsArrayBuffer): pre-existing across files
- Modal focus trap/Escape handling: pre-existing

## 2026-05-01 Scope Fidelity Re-check

- Verdict: APPROVE.
- BMP references in upload support/mocks are pre-existing input support or test fixtures, not BMP output implementation.
- Implementation changes align with plan scope: concrete PNG/JPG/WEBP targets, PDF modal lazy page shells, raster image conversion, UI/i18n/test wiring.
- No server-side conversion or new worker code found beyond existing pdfjs worker usage.

## 2026-05-01 F3 Manual QA

- Verdict: APPROVE.
- `yarn test:e2e` was attempted but blocked by missing Playwright Chromium executable at `.cache/ms-playwright/chromium_headless_shell-1200/.../chrome-headless-shell`.
- Fallback verification: `yarn test:run` passed 77/77 tests across 11 files.
- Code-path QA confirmed PDF targets include TXT/PNG/JPG/WEBP/PDF, GIF/SVG image outputs hide PNG/JPG/WEBP, PDF image targets open the page selector, modal page shells render before thumbnails, select/deselect works from `pageShells`, thumbnails lazy-load through `IntersectionObserver`, and PDF/image conversion output filenames and MIME types are correct.
- Non-blocking note: LSP/Biome diagnostics remain in `src/components/PdfPageSelectorModal.tsx` for import ordering, `forEach` callback return style, and an unnecessary hook dependency; no functional blocker found for F3 scope.

## 2026-05-01 Code Quality Review F2

- Verdict: REJECT.
- Blocking finding: `yarn lint` fails in `src/components/PdfPageSelectorModal.tsx` because `isOpenRef.current = open` mutates a ref during render (`react-hooks/refs`).
- Verification: `yarn test:run` passed 77 tests; `yarn build` passed; LSP reported no TypeScript errors.
- Resource review: blob URLs are revoked on image adapters and modal unmount/close paths; no unreclaimed object URL was found in reviewed code.

## 2026-05-01 F4 Scope Fidelity Check

- Verdict: APPROVE.
- The three requested objectives are present: lazy PDF page shells/thumbnails, concrete PDF image targets, and raster image→image conversion.
- No second image-format selector, BMP output, OCR redesign, or server-side conversion was introduced.
- Existing PDF→TXT/PDF/HTML behavior remains intact, and no new image-processing dependency was added.

## 2026-05-01 F1 Plan Compliance Audit

- Verdict: REJECT.
- Implementation review found the requested conversion/model guardrails aligned: concrete PNG/JPG/WEBP targets, no BMP output exposure, SVG/GIF image互转 filtered/rejected, no second target selector, no new server-side conversion/workers beyond pdfjs.
- `yarn test:run` passes: 11 files, 77 tests.
- `yarn lint` fails on `src/components/PdfPageSelectorModal.tsx:153` because `isOpenRef.current = open` updates a ref during render, violating `react-hooks/refs`.

## 2026-05-01 Code Quality Review F2 Re-check

- Verdict: APPROVE.
- Verification: `yarn lint` passed, `yarn test:run` passed 77/77 tests, and `yarn build` passed.
- Safety review: blob URL cleanup is covered in `image-adapters` and `PdfPageSelectorModal`, `isOpenRef` now updates in `useEffect`, and no TypeScript/build blockers were found.

## 2026-05-01 F1 Plan Compliance Re-check

- Verdict: APPROVE.
- `yarn lint` passes after moving `isOpenRef.current = open` into `useEffect`; `yarn test:run` still passes at 77/77.
- Concrete `png`/`jpg`/`webp` targets are wired through converter types, UI labels, unit tests, and E2E coverage; BMP is not exposed as an output target.
- PDF→TXT/PDF/HTML paths remain intact, JPG encoding uses a white background, and modal cleanup still revokes blob URLs and disconnects observers on close/unmount.
