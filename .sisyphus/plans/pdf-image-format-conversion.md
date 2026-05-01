# PDF Image Format Conversion and Lazy Page Modal

## TL;DR

> **Summary**: Optimize the PDF page selection modal so page shells load before thumbnails and visible pages render lazily, then replace generic image outputs with concrete PNG/JPG/WEBP conversion targets for PDF and raster image inputs.
> **Deliverables**:
>
> - PDF page selector skeleton-first loading and viewport lazy thumbnail rendering
> - Concrete PNG/JPG/WEBP target formats in UI, converter types, E2E mocks, and i18n
> - PDF→PNG/JPG/WEBP conversion preserving selected pages
> - Raster image→PNG/JPG/WEBP conversion, excluding SVG/GIF inputs
> - Vitest and Playwright coverage using tests-after strategy
>   **Effort**: Medium
>   **Parallel**: YES - 3 waves
>   **Critical Path**: Task 1 → Task 2 → Task 3 → Task 5 → Final Verification Wave

## Context

### Original Request

- “PDF -> 图片，PDF 页面选择模态框优化一下，进入模态框首先 Loading 一下，加载出所有页面元素的外壳，先不加载页面实际内容，然后页面元素上显示 Loading 等待加载完成，然后使用懒加载，加载可视区域的 Page，因为 Page 都是已经预加载了外壳，所以不影响全选和全不选功能”
- “PDF -> 图片改成 各种图片后缀 而不是叫‘图片’，先利用原来转 png 的能力，把 png 转为 jpg、webp、bmp”
- “基于上面的能力，扩展出 图片互转能力”

### Interview Summary

- UI decision: replace generic `image` target with concrete image targets.
- Supported output targets this iteration: `png`, `jpg`, `webp`.
- BMP decision: explicitly excluded this iteration because canvas does not reliably encode `image/bmp` and user selected “先不支持 BMP”.
- Image-to-image special cases: exclude SVG and GIF inputs for image互转.
- Test strategy: tests-after using existing Vitest and Playwright infrastructure.

### Metis Review (gaps addressed)

- Metis invocation timed out without usable output; self-review guardrails are incorporated explicitly.
- Guardrails added: do not add BMP dependency or fake BMP output, do not silently rasterize SVG/GIF in image互转, preserve PDF selected-pages behavior, preserve existing PDF→TXT/PDF and image→PDF/TXT behavior, and make all acceptance criteria agent-executable.

## Work Objectives

### Core Objective

Deliver a concrete-format image conversion model and a faster PDF page selection modal without requiring human verification or manual decisions during implementation.

### Deliverables

- Converter type/model supports `png`, `jpg`, and `webp` as `TargetFormat` values.
- PDF source supports `txt`, `png`, `jpg`, `webp`, `pdf` targets.
- TXT source continues to support one image output path, and that path must be `png` as the replacement target for existing TXT→image behavior.
- Image source supports `pdf`, `txt`, `png`, `jpg`, `webp` only for raster inputs `png`, `jpg`, `jpeg`, `webp`, `bmp`; `gif` and `svg` files remain uploadable for existing non-image互转 conversions only if existing behavior supports them, but must not expose PNG/JPG/WEBP image互转 choices for them.
- PDF page selector opens with initial loading, then displays all page cards/shells with per-card loading indicators while thumbnails render lazily for visible cards.
- All i18n locales show PNG/JPG/WEBP labels and no generic “图片/Image” target for PDF/image output.

### Definition of Done (verifiable conditions with commands)

- `yarn test:run` passes.
- `yarn test:e2e` passes.
- `yarn lint` passes.
- PDF→PNG/JPG/WEBP conversion produces filenames with matching extensions and MIME types.
- Image→PNG/JPG/WEBP conversion produces filenames with matching extensions and MIME types.
- PDF page selection modal can select/deselect all before all thumbnails finish rendering because all page shells exist.
- No UI option exposes BMP as an output target.
- No UI option exposes SVG/GIF image互转 to PNG/JPG/WEBP.

### Must Have

- Use existing local React state style in `src/App.tsx`.
- Use existing adapter routing style in `src/lib/converter.ts`.
- Use browser canvas encoding for PNG/JPG/WEBP.
- For JPG output, fill a white background before encoding so transparency does not become black/undefined.
- Keep page selection validation for empty selected pages.
- Clean up object URLs and observers on modal close/unmount.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)

- Do not implement BMP output.
- Do not add a second image-format selector beside the existing target selector.
- Do not silently treat `image` as a user-visible target label after migration.
- Do not change OCR semantics.
- Do not change PDF→HTML/TXT/PDF behavior except type compatibility updates.
- Do not add server-side conversion or workers beyond existing pdfjs worker usage.
- Do not leave unrevoked blob URLs or active IntersectionObservers.

## Verification Strategy

> ZERO HUMAN INTERVENTION - all verification is agent-executed.

- Test decision: tests-after + Vitest + Playwright
- QA policy: Every task has agent-executed scenarios
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy

### Parallel Execution Waves

> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: Task 1 shared target model; Task 2 image encoding helper; Task 4 modal skeleton/lazy foundation
Wave 2: Task 3 PDF concrete image outputs; Task 5 image→image adapter; Task 6 UI/i18n wiring
Wave 3: Task 7 tests and E2E updates; Task 8 regression commands/evidence

### Dependency Matrix (full, all tasks)

- Task 1 blocks Tasks 3, 5, 6, 7.
- Task 2 blocks Tasks 3, 5, 7.
- Task 3 depends on Tasks 1 and 2; blocks Task 7.
- Task 4 can run after reading current modal; blocks Task 7 modal assertions.
- Task 5 depends on Tasks 1 and 2; blocks Task 7.
- Task 6 depends on Task 1; should coordinate with Tasks 3 and 5 target names.
- Task 7 depends on Tasks 3, 4, 5, 6.
- Task 8 depends on all implementation and test tasks.

### Agent Dispatch Summary (wave → task count → categories)

- Wave 1 → 3 tasks → quick, quick, visual-engineering
- Wave 2 → 3 tasks → quick, quick, visual-engineering
- Wave 3 → 2 tasks → unspecified-high, quick

## TODOs

> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Replace Generic Image Target With Concrete Image Targets

  **What to do**: Update shared conversion types and routing so `TargetFormat` includes `png`, `jpg`, and `webp` instead of relying on user-facing `image` for image outputs. In `src/lib/converter.ts`, change supported targets to `pdf: ['txt', 'png', 'jpg', 'webp', 'pdf']`, `txt: ['png']`, and `image: ['pdf', 'txt', 'png', 'jpg', 'webp']`; keep `html` support only for PDF HTML special case. Update E2E fake conversion results to emit correct MIME/extension/target for `png`, `jpg`, and `webp`. Keep `SourceFormat` as `pdf | txt | image`.
  **Must NOT do**: Do not expose BMP. Do not remove existing `pdf`, `txt`, or `html` behaviors. Do not introduce a second format selector.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: focused type/router change across a few files.
  - Skills: [] - no special skill needed.
  - Omitted: [`frontend-ui-ux`] - UI wiring is handled in Task 6.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: Tasks 3, 5, 6, 7 | Blocked By: none

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `src/lib/converter.ts:15-17` - current `SourceFormat` and `TargetFormat` definitions.
  - Pattern: `src/lib/converter.ts:52-60` - current `supportedTargets` and `getSupportedTargets` model.
  - Pattern: `src/lib/converter.ts:190-233` - E2E fake conversion path must mirror new concrete targets.
  - Pattern: `src/lib/converter.ts:238-272` - adapter map and `convertFile` dispatch.
  - Pattern: `src/App.tsx:265-287` - app validates supported targets before conversion.

  **Acceptance Criteria** (agent-executable only):
  - [ ] TypeScript accepts `TargetFormat` values `png`, `jpg`, and `webp`.
  - [ ] `getSupportedTargets('pdf')` returns `txt,png,jpg,webp,pdf` in that order.
  - [ ] `getSupportedTargets('txt')` returns only `png` for image output compatibility.
  - [ ] `getSupportedTargets('image')` returns `pdf,txt,png,jpg,webp` before per-file SVG/GIF UI filtering from Task 6.
  - [ ] E2E fake path returns `image/png`, `image/jpeg`, or `image/webp` with matching filename extension when target is `png`, `jpg`, or `webp`.

  **QA Scenarios** (MANDATORY - task incomplete without these):

  ```
  Scenario: Supported target model exposes concrete formats
    Tool: Bash
    Steps: Add or update a Vitest test that imports `getSupportedTargets`, then run `yarn test:run -- converter`.
    Expected: Assertions prove pdf/txt/image supported targets match the exact ordered lists above.
    Evidence: .sisyphus/evidence/task-1-target-model.txt

  Scenario: Unsupported legacy generic image target is not routed for new UI paths
    Tool: Bash
    Steps: Run a unit test that calls convertFile with an unsupported generic image target only if the type allows legacy compatibility; otherwise run TypeScript/lint to prove no UI code uses target value `image`.
    Expected: No app-facing target option uses generic `image`; existing tests compile with concrete targets.
    Evidence: .sisyphus/evidence/task-1-no-generic-image.txt
  ```

  **Commit**: NO | Message: `feat(converter): add concrete image targets` | Files: `src/lib/converter.ts`, related tests

- [x] 2. Add Shared Canvas Image Encoding Utilities

  **What to do**: Create or localize a typed helper used by PDF and image adapters to encode a canvas to PNG/JPG/WEBP. The helper must map target to `{ extension, mimeType, quality? }`, call `canvas.toBlob`, and throw a clear error when encoding fails. For JPG, draw/render onto an opaque white background before encoding; for PNG/WEBP preserve transparency when source/rendering supports it. Keep implementation browser-only, matching current adapter assumptions.
  **Must NOT do**: Do not add BMP support. Do not add a heavy image processing dependency. Do not use `any`.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: small utility with unit coverage.
  - Skills: [] - no special skill needed.
  - Omitted: [`visual-engineering`] - no UI work.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: Tasks 3, 5, 7 | Blocked By: none

  **References**:
  - Pattern: `src/lib/converter/pdf-adapters.ts:154-176` - current PDF page canvas-to-PNG helper to generalize.
  - Pattern: `src/lib/converter/image-adapters.ts:56-67` - current browser image loading pattern.
  - Pattern: `src/__tests__/converter.pdf-adapters.test.ts:84-89` - current `HTMLCanvasElement.prototype.toBlob` mock pattern.
  - Project convention: `AGENTS.md` says TypeScript uses no `any` and type aliases.

  **Acceptance Criteria**:
  - [ ] Helper returns extension/mime pairs: `png`→`.png`/`image/png`, `jpg`→`.jpg`/`image/jpeg`, `webp`→`.webp`/`image/webp`.
  - [ ] JPG encoding path fills white background before drawing source content or before PDF render when needed.
  - [ ] Encoding failure throws an Error containing the target format or MIME type.
  - [ ] Unit tests cover PNG/JPG/WEBP MIME selection and failed `toBlob(null)`.

  **QA Scenarios**:

  ```
  Scenario: Canvas encodes each supported target
    Tool: Bash
    Steps: Run `yarn test:run -- converter` after adding helper tests or adapter tests that exercise png/jpg/webp toBlob MIME arguments.
    Expected: Tests observe canvas.toBlob called with image/png, image/jpeg, and image/webp.
    Evidence: .sisyphus/evidence/task-2-canvas-encoding.txt

  Scenario: Encoding failure is surfaced
    Tool: Bash
    Steps: Run the unit test where mocked toBlob callback receives null.
    Expected: Conversion rejects with a clear Error and does not return a mislabeled Blob.
    Evidence: .sisyphus/evidence/task-2-encoding-failure.txt
  ```

  **Commit**: NO | Message: `refactor(converter): share image encoding helpers` | Files: `src/lib/converter/*`, tests

- [x] 3. Generalize PDF to PNG/JPG/WEBP Conversion

  **What to do**: Update `convertPdfToImage` or rename internally to reflect concrete image targets while preserving exported API compatibility if tests import it. Determine output format from `request.target` (`png`, `jpg`, `webp`). Render only selected pages, then encode each page with the shared helper. Filenames must be `${baseName}-page-001.${extension}` and `targetFormat` must equal concrete target. Keep empty/invalid selected page handling unchanged.
  **Must NOT do**: Do not change PDF→TXT or PDF→PDF OCR behavior. Do not render unselected pages. Do not output PNG blobs while naming them JPG/WEBP.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: adapter refactor with existing test patterns.
  - Skills: [] - no special skill needed.
  - Omitted: [`visual-engineering`] - no UI work.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: Task 7 | Blocked By: Tasks 1, 2

  **References**:
  - Pattern: `src/lib/converter/pdf-adapters.ts:220-253` - current PDF→image selected-page conversion.
  - Pattern: `src/lib/converter/pdf-adapters.ts:228-239` - selected pages filtering, dedupe, sort, and empty validation.
  - Pattern: `src/__tests__/converter.pdf-adapters.test.ts:115-132` - current PDF page output assertions to update for concrete targets.
  - Pattern: `src/__tests__/converter.pdf-adapters.test.ts:147-206` - selected page behavior that must remain intact.

  **Acceptance Criteria**:
  - [ ] PDF→PNG outputs PNG MIME, `.png` filenames, concrete targetFormat `png`.
  - [ ] PDF→JPG outputs JPEG MIME, `.jpg` filenames, concrete targetFormat `jpg`.
  - [ ] PDF→WEBP outputs WEBP MIME, `.webp` filenames, concrete targetFormat `webp`.
  - [ ] Selected pages still filter, dedupe, sort, and reject empty selections.
  - [ ] Existing PDF→TXT and OCR-related tests still pass.

  **QA Scenarios**:

  ```
  Scenario: PDF selected pages convert to JPG only
    Tool: Bash
    Steps: Add/update Vitest case with a three-page mock PDF, target `jpg`, selectedImagePages [3,1,1], then run `yarn test:run -- converter.pdf-adapters.test.ts`.
    Expected: Results are page 001 and 003 only, filenames end `.jpg`, MIME is image/jpeg, only selected pages render.
    Evidence: .sisyphus/evidence/task-3-pdf-jpg-selected.txt

  Scenario: Invalid PDF selected pages still fail
    Tool: Bash
    Steps: Run updated empty-selection unit test for target `webp` with out-of-range pages.
    Expected: Conversion rejects with `No pages selected` and produces no output.
    Evidence: .sisyphus/evidence/task-3-pdf-empty-selection.txt
  ```

  **Commit**: NO | Message: `feat(converter): support pdf to concrete image formats` | Files: `src/lib/converter/pdf-adapters.ts`, tests

- [x] 4. Rework PDF Page Selector Modal to Skeleton-First Lazy Rendering

  **What to do**: Change `src/components/PdfPageSelectorModal.tsx` so opening the modal first shows a modal-level loading state while reading the file and loading the PDF document. As soon as `numPages` is known, create page shell entries for every page with `pageNumber` and a thumbnail status (`idle | loading | loaded | failed`) but no thumbnail URL. Render all page cards immediately from shells. Use IntersectionObserver rooted to the scrollable grid (or viewport fallback if root is unavailable) to render thumbnails only for visible/near-visible cards. Each shell must show a per-page spinner/loading label until thumbnail URL is ready. Select all/deselect all must use the full shell list, not only loaded thumbnails. Revoke blob URLs and disconnect observers on close/unmount/file change.
  **Must NOT do**: Do not rely only on `<img loading="lazy">`; actual `pdfDocument.getPage()`/render must be lazy. Do not block select all until thumbnails load. Do not leak object URLs.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: UI state, accessibility, responsive styles, and lazy rendering.
  - Skills: [] - no special skill needed.
  - Omitted: [`git-master`] - no git operation in this task.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: Task 7 | Blocked By: none

  **References**:
  - Pattern: `src/components/PdfPageSelectorModal.tsx:125-139` - current component state and refs.
  - Pattern: `src/components/PdfPageSelectorModal.tsx:167-209` - current eager per-page thumbnail loop to replace.
  - Pattern: `src/components/PdfPageSelectorModal.tsx:211-263` - current effect/AbortController cleanup pattern to preserve.
  - Pattern: `src/components/PdfPageSelectorModal.tsx:277-283` - select all/deselect all currently based on `pages`.
  - Pattern: `src/components/PdfPageSelectorModal.tsx:317-343` - current card rendering.
  - Pattern: `src/styles/global.css:427-450` - existing modal spinner styles.
  - Pattern: `src/styles/global.css:468-517` - existing modal grid/card/thumbnail styles.

  **Acceptance Criteria**:
  - [ ] Modal-level loading appears before page shells are known.
  - [ ] After PDF `numPages` is known, `.pdf-modal__card` count equals total page count even before thumbnails load.
  - [ ] Each not-yet-rendered page card shows a visible loading indicator inside the card.
  - [ ] Select all selects every page shell, including unloaded thumbnails.
  - [ ] Deselect all clears every page shell, including unloaded thumbnails.
  - [ ] Closing/reopening with a different file aborts stale renders and revokes stale blob URLs.

  **QA Scenarios**:

  ```
  Scenario: Page shells appear before thumbnails finish
    Tool: Bash
    Steps: Add/update a React test with delayed page render promises; open modal and await shell count before resolving thumbnail promises.
    Expected: All expected `.pdf-modal__card` elements are present with per-card loading indicators while thumbnails are unresolved.
    Evidence: .sisyphus/evidence/task-4-shells-before-thumbnails.txt

  Scenario: Select all works with unloaded thumbnails
    Tool: Playwright
    Steps: Open sample PDF modal, immediately click localized Select All/取消全选 controls after shell count appears but before forcing all thumbnails visible.
    Expected: Selection count and button states reflect all pages, not just loaded thumbnails.
    Evidence: .sisyphus/evidence/task-4-select-all-lazy.png
  ```

  **Commit**: NO | Message: `feat(ui): lazy render pdf page thumbnails` | Files: `src/components/PdfPageSelectorModal.tsx`, `src/styles/global.css`, tests

- [x] 5. Add Raster Image to PNG/JPG/WEBP Conversion Adapter

  **What to do**: Extend `src/lib/converter/image-adapters.ts` with an image→image adapter that loads raster input into an `HTMLImageElement`, draws it to canvas at natural dimensions, and encodes to target `png`, `jpg`, or `webp` using the shared helper. Reuse existing object URL lifecycle style. For same-format conversion, still re-encode and output a new Blob with normalized extension/MIME. Ensure unsupported SVG/GIF image互转 requests throw clearly or are prevented before adapter invocation by UI filtering; if adapter receives them, fail clearly rather than silently rasterizing.
  **Must NOT do**: Do not perform OCR in image→image. Do not support SVG/GIF image互转. Do not implement BMP output.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: adapter addition using existing image adapter patterns.
  - Skills: [] - no special skill needed.
  - Omitted: [`visual-engineering`] - UI filtering is Task 6.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: Task 7 | Blocked By: Tasks 1, 2

  **References**:
  - Pattern: `src/lib/converter/image-adapters.ts:56-67` - current object URL image loading helper.
  - Pattern: `src/lib/converter/image-adapters.ts:74-100` - image→PDF adapter object URL cleanup.
  - Pattern: `src/__tests__/converter.image-adapters.test.ts:56-88` - Image and URL mocking pattern.
  - Pattern: `src/__tests__/converter.image-adapters.test.ts:90-103` - expected conversion result assertions.

  **Acceptance Criteria**:
  - [ ] PNG/JPG/JPEG/WEBP/BMP inputs can convert to PNG/JPG/WEBP when browser image decode succeeds.
  - [ ] SVG/GIF input conversion to PNG/JPG/WEBP is rejected clearly if invoked.
  - [ ] Output filename replaces original extension with target extension.
  - [ ] Output MIME and `targetFormat` match target.
  - [ ] Object URL is revoked in success and failure paths.

  **QA Scenarios**:

  ```
  Scenario: PNG converts to WEBP
    Tool: Bash
    Steps: Add Vitest case using mocked Image/canvas for `photo.png` target `webp`, then run `yarn test:run -- converter.image-adapters.test.ts`.
    Expected: Result filename is `photo.webp`, MIME is `image/webp`, targetFormat is `webp`, object URL revoked.
    Evidence: .sisyphus/evidence/task-5-image-webp.txt

  Scenario: GIF image互转 is rejected
    Tool: Bash
    Steps: Add Vitest case for `animated.gif` target `png` and run the image adapter suite.
    Expected: Conversion rejects clearly and does not call canvas encoding as if GIF were supported.
    Evidence: .sisyphus/evidence/task-5-gif-rejected.txt
  ```

  **Commit**: NO | Message: `feat(converter): add raster image format conversion` | Files: `src/lib/converter/image-adapters.ts`, tests

- [x] 6. Wire App UI, i18n, and Per-File Target Filtering

  **What to do**: Update `src/App.tsx` so the target dropdown displays PNG/JPG/WEBP labels and the PDF page selector appears when source is PDF and target is one of `png | jpg | webp`. Update conversion validation so explicit empty selected pages applies to those PDF image targets. Add per-file target filtering: for image source files with `.gif` or `.svg`, do not show `png`, `jpg`, or `webp` targets; leave `pdf`/`txt` choices only if existing behavior supports them. Update accepted/supported format copy only if needed; do not remove upload acceptance for GIF/SVG unless implementation chooses to prevent unsupported conversions at upload time. Update `src/i18n/locales/en.json`, `zh-CN.json`, and `zh-TW.json` target labels.
  **Must NOT do**: Do not add a separate format dropdown. Do not show BMP anywhere. Do not leave `formats.targets.image` as the user-facing PDF/image output label.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: UI state, labels, and conditional rendering.
  - Skills: [] - no special skill needed.
  - Omitted: [`librarian`] - no external docs needed.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: Task 7 | Blocked By: Task 1

  **References**:
  - Pattern: `src/App.tsx:38-58` - supported upload extensions and source detection.
  - Pattern: `src/App.tsx:176-198` - target change state reset behavior currently tied to generic `image`.
  - Pattern: `src/App.tsx:270-276` - empty selected page validation currently tied to target `image`.
  - Pattern: `src/App.tsx:387-410` - target dropdown rendering.
  - Pattern: `src/App.tsx:427-445` - PDF page selector button condition currently tied to target `image`.
  - Pattern: `src/App.tsx:553-564` - modal integration.
  - Pattern: `src/i18n/locales/zh-CN.json:13-22` - current target labels include `image`.

  **Acceptance Criteria**:
  - [ ] PDF rows show target options TXT, PNG, JPG, WEBP, PDF.
  - [ ] PNG/JPG/JPEG/WEBP/BMP image rows show PDF, TXT, PNG, JPG, WEBP.
  - [ ] GIF/SVG image rows do not show PNG/JPG/WEBP image互转 options.
  - [ ] PDF page selector button appears for PDF target PNG/JPG/WEBP and not for TXT/PDF.
  - [ ] Empty selected PDF pages block conversion for PNG/JPG/WEBP.
  - [ ] en/zh-CN/zh-TW labels are present for png/jpg/webp and no user-facing generic image label remains in target dropdown.

  **QA Scenarios**:

  ```
  Scenario: PDF target dropdown exposes concrete image formats
    Tool: Playwright
    Steps: Upload sample.pdf, inspect target select options.
    Expected: Options include PNG, JPG, WEBP and do not include generic Image/图片.
    Evidence: .sisyphus/evidence/task-6-pdf-targets.png

  Scenario: SVG/GIF image互转 options are hidden
    Tool: Playwright
    Steps: Upload `icon.svg` and `animated.gif`, inspect each target select.
    Expected: PNG/JPG/WEBP options are absent for those rows; BMP is absent everywhere.
    Evidence: .sisyphus/evidence/task-6-special-image-filtering.png
  ```

  **Commit**: NO | Message: `feat(ui): expose concrete image format targets` | Files: `src/App.tsx`, `src/i18n/locales/*.json`, tests

- [x] 7. Update Unit and E2E Test Coverage

  **What to do**: Update existing tests to concrete target names and add tests for new behavior. Extend `src/__tests__/converter.pdf-adapters.test.ts` for PDF→PNG/JPG/WEBP and selected-page behavior. Extend `src/__tests__/converter.image-adapters.test.ts` for image→PNG/JPG/WEBP and SVG/GIF rejection. Extend `src/__tests__/app.upload.test.tsx` for PDF page selector visibility on concrete targets and GIF/SVG target filtering. Update `e2e/app.spec.ts` to select concrete image targets and verify output counts/download names. Keep tests-after sequencing: implement first, then add/update tests until passing.
  **Must NOT do**: Do not weaken existing assertions to make tests pass. Do not delete meaningful PDF page selection E2E coverage.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: cross-cutting test updates across unit and E2E suites.
  - Skills: [] - no special skill needed.
  - Omitted: [`visual-engineering`] - UI implementation should already be done.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: Task 8 | Blocked By: Tasks 3, 4, 5, 6

  **References**:
  - Test: `src/__tests__/converter.pdf-adapters.test.ts:115-206` - PDF image and selected pages coverage.
  - Test: `src/__tests__/converter.image-adapters.test.ts:56-133` - image adapter mocks and assertions.
  - Test: `src/__tests__/app.upload.test.tsx:398-462` - page selector button and selected pages flow.
  - Test: `e2e/app.spec.ts:200-243` - PDF image multi-output and page selection E2E coverage.

  **Acceptance Criteria**:
  - [ ] Unit tests cover PDF→PNG/JPG/WEBP outputs.
  - [ ] Unit tests cover image→PNG/JPG/WEBP outputs.
  - [ ] Unit tests cover SVG/GIF image互转 exclusion/rejection.
  - [ ] App tests cover page selector for PNG/JPG/WEBP and not TXT/PDF.
  - [ ] E2E tests use concrete image target options and still verify selected PDF page output count.

  **QA Scenarios**:

  ```
  Scenario: Full unit test suite passes
    Tool: Bash
    Steps: Run `yarn test:run`.
    Expected: All Vitest tests pass with concrete target format expectations.
    Evidence: .sisyphus/evidence/task-7-vitest.txt

  Scenario: Browser E2E passes with concrete image targets
    Tool: Bash
    Steps: Run `yarn test:e2e`.
    Expected: Playwright tests pass; PDF selected page flow still produces exact output count.
    Evidence: .sisyphus/evidence/task-7-playwright.txt
  ```

  **Commit**: NO | Message: `test(converter): cover concrete image format flows` | Files: `src/__tests__/*`, `e2e/app.spec.ts`

- [x] 8. Run Final Local Validation and Capture Evidence

  **What to do**: Run the required project validation commands and capture outputs under `.sisyphus/evidence/`. If any command fails, fix the implementation or tests within the plan scope and rerun until passing. Required commands: `yarn lint`, `yarn test:run`, `yarn test:e2e`, and `yarn build` if build is available and not duplicative of CI.
  **Must NOT do**: Do not skip E2E. Do not use weakening flags unless a real test fixture update is intentionally part of the implementation.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: validation and small fixes only.
  - Skills: [] - no special skill needed.
  - Omitted: [`git-master`] - commit is not requested by this plan task.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: Final Verification Wave | Blocked By: Task 7

  **References**:
  - Command reference: `AGENTS.md` lists `yarn build`, `yarn lint`, and project commands.
  - CI reference from exploration: `.github/workflows/deploy.yml` and `.github/workflows/e2e.yml` run unit/E2E checks.

  **Acceptance Criteria**:
  - [ ] `yarn lint` passes.
  - [ ] `yarn test:run` passes.
  - [ ] `yarn test:e2e` passes.
  - [ ] `yarn build` passes if command exists in `package.json`.
  - [ ] Evidence files contain command outputs or concise summaries with timestamps.

  **QA Scenarios**:

  ```
  Scenario: All validation commands pass
    Tool: Bash
    Steps: Run `yarn lint && yarn test:run && yarn test:e2e && yarn build` if build exists.
    Expected: Exit code 0 for every command.
    Evidence: .sisyphus/evidence/task-8-validation.txt

  Scenario: No forbidden scope surfaced in validation
    Tool: Bash
    Steps: Inspect failing tests/build output if any and confirm fixes do not add BMP, SVG image互转, GIF image互转, server-side conversion, or OCR redesign.
    Expected: Final diff remains within declared scope and all commands pass.
    Evidence: .sisyphus/evidence/task-8-scope-check.txt
  ```

  **Commit**: NO | Message: `chore: validate image format conversion work` | Files: validation evidence only if tracked by workflow

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.

- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high (+ playwright)
- [x] F4. Scope Fidelity Check — deep

## Commit Strategy

- Commit once after all implementation tasks and final verification pass.
- Suggested message: `feat(converter): add concrete image format conversions`
- Include only source, style, i18n, and test changes needed for this plan.

## Success Criteria

- Generic image target is no longer user-facing for PDF/image output format choices.
- PDF→PNG/JPG/WEBP and raster image→PNG/JPG/WEBP work through the existing table target selector.
- PDF page selector has page shells available before thumbnails finish and lazy-renders visible thumbnails.
- BMP, SVG image互转, and GIF image互转 are explicitly absent from this iteration.
- `yarn lint`, `yarn test:run`, and `yarn test:e2e` pass.
