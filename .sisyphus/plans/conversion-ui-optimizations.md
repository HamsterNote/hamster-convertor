# Conversion UI Optimizations

## TL;DR

> **Summary**: Add blocking full-screen loading for convert/download operations, add pre-conversion PDF page selection for PDF→image, and make row deletion available for all rows while disabled during busy states.
> **Deliverables**:
>
> - Reusable full-screen loading overlay with i18n labels.
> - PDF page selector modal with rendered page previews, select all, deselect all, and multi-select.
> - Selected pages plumbed through conversion options so PDF→image outputs only selected pages.
> - Row actions that show download and delete together where applicable.
> - Vitest and Playwright coverage for loading, page selection, download loading, and deletion.
>   **Effort**: Medium
>   **Parallel**: YES - 3 waves
>   **Critical Path**: Task 1 → Task 3 → Task 4 → Task 7 → Final Verification

## Context

### Original Request

1. 点击 全部转换 之后，增加 全屏 Loading，直到全部转换完成
2. PDF -> 图片，增加页数多选按钮，点击弹出模态框，展示 PDF 底图，让用户可以全选、取消全选、单页多选，点击完成之后，在这个文件一行显示“已选择 x 页”
3. 点击下载（单行和全部都是），出现全屏 Loading，等文件准备完毕再隐藏 Loading
4. 增加删除按钮，删除单行的能力

### Interview Summary

- PDF→image page selection happens before conversion.
- Conversion output includes only selected PDF pages.
- Deletion is disabled during global conversion or download preparation.
- Testing is tests-after using existing Vitest + Playwright infrastructure.

### Metis Review (gaps addressed)

- Zero selected pages: do not permit it; default all pages selected after page metadata loads, disable “Done” if selection becomes empty.
- Selection persistence: preserve selected pages while switching away from image and back for the same file; clear stale conversion outputs when target changes.
- Download busy state: use one global blocking overlay for row and all downloads; disable deletion and relevant actions globally while active.
- Preview performance: render modal previews as thumbnails using pdfjs canvas and object URLs; revoke URLs on modal close/file change/unmount.
- E2E fake output: honor selected pages in `createE2EResult` so tests verify output count.

## Work Objectives

### Core Objective

Make conversion and download operations visibly blocking, give users explicit PDF→image page control before conversion, and allow deleting any row when the app is not busy.

### Deliverables

- `src/components/FullscreenLoading.tsx`
- `src/components/PdfPageSelectorModal.tsx`
- Updates to `src/App.tsx`, `src/lib/converter.ts`, `src/lib/converter/pdf-adapters.ts`, `src/lib/download.ts` only as needed.
- i18n additions in `src/i18n/locales/en.json`, `zh-CN.json`, `zh-TW.json`.
- Style additions in `src/styles/global.css` and/or `src/styles/theme.css`.
- Updated tests in `src/__tests__/app.upload.test.tsx`, converter tests, and `e2e/app.spec.ts`.

### Definition of Done (verifiable conditions with commands)

- `yarn lint` passes with zero warnings.
- `yarn test:run` passes.
- `yarn test:e2e` passes.
- `yarn build` passes.
- Manual/agent Playwright evidence proves: convert-all overlay appears/disappears; download overlay appears/disappears; PDF page modal can select all/deselect/select pages; row shows “已选择 x 页”; delete removes done and non-done rows when not busy.

### Must Have

- Full-screen overlay appears immediately after clicking “全部转换” / “Convert all” and remains until all queued conversions finish or fail.
- Full-screen overlay appears for row download and global download, including ZIP preparation, and hides in `finally` on success or failure.
- PDF→image rows expose a page-select button before conversion.
- Modal renders PDF page backgrounds/previews, not just page numbers.
- Modal supports select all, cancel all, single-page toggles, multi-page selection, Cancel, and Done.
- Row summary uses i18n and displays Chinese “已选择 x 页” in zh-CN.
- Converter renders only selected pages for PDF→image.
- Delete button is present for every row, including completed rows; disabled while global busy.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)

- Do not introduce Redux/Zustand or a new state library.
- Do not build range input, drag reorder, zoom controls, OCR changes, new formats, or persistent storage.
- Do not refactor unrelated Header/Footer/Dropzone behavior.
- Do not use `any`; follow project TypeScript convention.
- Do not add untranslated visible text.
- Do not leave object URLs or canvases leaking after modal close.

## Verification Strategy

> ZERO HUMAN INTERVENTION - all verification is agent-executed.

- Test decision: tests-after + existing Vitest, React Testing Library, and Playwright.
- QA policy: Every task has agent-executed scenarios.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy

### Parallel Execution Waves

> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: Task 1 data model/converter, Task 2 loading component/styles, Task 3 PDF modal component foundation, Task 6 i18n/style tokens.
Wave 2: Task 4 App integration, Task 5 row actions/delete/download busy, Task 7 tests.
Wave 3: Task 8 E2E/QA hardening and final fixes.

### Dependency Matrix (full, all tasks)

- T1 blocks T4, T7, T8.
- T2 blocks T4, T5, T7, T8.
- T3 blocks T4, T7, T8.
- T6 blocks T3, T4, T5, T7, T8.
- T4 blocks T7, T8.
- T5 blocks T7, T8.
- T7 blocks T8.

### Agent Dispatch Summary (wave → task count → categories)

- Wave 1 → 4 tasks → quick, visual-engineering, quick, writing/quick.
- Wave 2 → 3 tasks → visual-engineering, quick, unspecified-high.
- Wave 3 → 1 task → unspecified-high.

## TODOs

> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Extend conversion options for selected PDF image pages

  **What to do**: Extend `ConversionOptions` in `src/App.tsx:17-21` and `ConversionRequest.options.pdf` in `src/lib/converter.ts:28-37` with `selectedImagePages: number[] | undefined`. Use 1-based page numbers everywhere outside array indexes. Update `convertPdfToImage` in `src/lib/converter/pdf-adapters.ts:220-240` to render only selected pages when provided; otherwise render all pages. Validate by filtering to integers between 1 and `pdfDocument.numPages`, de-duplicate, sort ascending, and throw a normal `Error` if the final selected set is empty. Update `createE2EResult` in `src/lib/converter.ts:192-199` so fake PDF→image returns exactly selected pages or `[1, 2]` when no selection exists.
  **Must NOT do**: Do not change non-PDF or non-image conversions. Do not switch internal UI numbering to 0-based. Do not alter OCR semantics.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: focused type and adapter change.
  - Skills: [] - no special skill needed.
  - Omitted: [`frontend-ui-ux`] - no UI work in this task.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [4, 7, 8] | Blocked By: []

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `src/App.tsx:17-33` - local `ConversionOptions` and `FileItem` shape to extend.
  - API/Type: `src/lib/converter.ts:28-37` - exported conversion request option contract.
  - Pattern: `src/lib/converter/pdf-adapters.ts:135-140` - load PDF and access `numPages`.
  - Pattern: `src/lib/converter/pdf-adapters.ts:154-176` - existing page render helper.
  - Pattern: `src/lib/converter/pdf-adapters.ts:220-240` - current all-pages PDF→image behavior to narrow.
  - Test: `src/__tests__/convert.integration.test.ts` - integration-test style if converter test additions fit there.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `yarn test:run` includes a test proving selected pages `[2]` yields one PDF→image output for E2E/mocked path.
  - [ ] `yarn test:run` includes a test proving undefined selection keeps all-page behavior.
  - [ ] `yarn lint` reports no `any` or type warnings.

  **QA Scenarios** (MANDATORY - task incomplete without these):

  ```
  Scenario: Selected pages narrow converter output
    Tool: Bash
    Steps: Run `yarn test:run` after adding a converter test that calls PDF→image with selectedImagePages [2].
    Expected: Test passes and output filenames/count correspond only to page 2.
    Evidence: .sisyphus/evidence/task-1-selected-pages.txt

  Scenario: Empty/invalid selected pages fail safely
    Tool: Bash
    Steps: Run `yarn test:run` after adding a converter test with selectedImagePages [] or invalid values.
    Expected: Conversion rejects with a normal Error and no partial outputs are returned.
    Evidence: .sisyphus/evidence/task-1-empty-selection-error.txt
  ```

  **Commit**: NO | Message: `feat(converter): support selected pdf image pages` | Files: [`src/App.tsx`, `src/lib/converter.ts`, `src/lib/converter/pdf-adapters.ts`, tests]

- [x] 2. Add reusable full-screen loading overlay

  **What to do**: Create `src/components/FullscreenLoading.tsx` with props `{ visible: boolean; label: string }`. Render nothing when not visible. When visible, render fixed full-screen overlay with `role="status"`, `aria-live="polite"`, visible label, and CSS spinner. Add BEM-style classes such as `.fullscreen-loading`, `.fullscreen-loading__card`, `.fullscreen-loading__spinner`, `.fullscreen-loading__label` in `src/styles/global.css` or `theme.css`. Use existing CSS variables from `src/styles/theme.css:1-35` and button/status styling conventions from `src/styles/theme.css:71-132`.
  **Must NOT do**: Do not use a third-party spinner package. Do not block rendering by conditionally hiding the whole app.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: UI component and CSS.
  - Skills: [] - no specific skill needed.
  - Omitted: [`playwright`] - browser automation belongs to QA tasks.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [4, 5, 7, 8] | Blocked By: []

  **References**:
  - Pattern: `src/components/FileDropzone.tsx` - component prop typing/import style.
  - Pattern: `src/styles/theme.css:1-35` - colors, radius, shadows.
  - Pattern: `src/styles/global.css:285-290` - existing action layout nearby; add overlay styles without disrupting table styles.
  - API/Type: `src/i18n/locales/zh-CN.json:23-30` - action/loading labels should come from locale files.

  **Acceptance Criteria**:
  - [ ] Component has no visible text hardcoded except through `label` prop.
  - [ ] Overlay covers viewport with z-index above header/footer and preserves dark/light theme variables.
  - [ ] `yarn test:run` includes component/app assertion for visible status text when active.

  **QA Scenarios**:

  ```
  Scenario: Overlay appears with accessible status
    Tool: Bash
    Steps: Run `yarn test:run` for the overlay/app test that queries `role=status`.
    Expected: Test finds the supplied label while visible and no status when hidden.
    Evidence: .sisyphus/evidence/task-2-loading-visible.txt

  Scenario: Overlay styling does not break build
    Tool: Bash
    Steps: Run `yarn build`.
    Expected: Build succeeds with CSS included and no TypeScript errors.
    Evidence: .sisyphus/evidence/task-2-build.txt
  ```

  **Commit**: NO | Message: `feat(ui): add fullscreen loading overlay` | Files: [`src/components/FullscreenLoading.tsx`, `src/styles/global.css`, locale files, tests]

- [x] 3. Add PDF page selector modal with thumbnail rendering

  **What to do**: Create `src/components/PdfPageSelectorModal.tsx`. Props must include `open`, `file`, `selectedPages`, `onCancel`, `onConfirm`, and localized labels from parent or internal `useTranslation`. When opened, read `file.arrayBuffer()`, load with `pdfjs-dist` using the same worker URL pattern as `src/lib/converter/pdf-adapters.ts:2` and `configurePdfJsWorker` logic from `src/lib/converter/pdf-adapters.ts:129-140`, render each page at thumbnail scale (use `scale: 0.4` or similar) to canvas, convert each canvas to object URL/data URL, and display as selectable page cards. Default selection: all pages selected when no prior selection is supplied. Include buttons: select all, deselect all, cancel, done. Disable Done when zero pages selected. Revoke object URLs on close/unmount/reload. Show loading state inside modal while pages render; show localized error if PDF cannot be read.
  **Must NOT do**: Do not add zoom, page range input, drag reorder, persistent storage, or server-side rendering. Do not create full-resolution thumbnails.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: modal, thumbnail grid, accessibility.
  - Skills: [] - no special skill needed.
  - Omitted: [`git-master`] - no git operations requested.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [4, 7, 8] | Blocked By: [6 for final labels]

  **References**:
  - Pattern: `src/lib/converter/pdf-adapters.ts:2` - pdfjs worker URL import.
  - Pattern: `src/lib/converter/pdf-adapters.ts:129-140` - worker setup and document loading.
  - Pattern: `src/lib/converter/pdf-adapters.ts:154-176` - canvas render to blob pattern.
  - Pattern: `src/styles/global.css:238-266` - compact table/control styling; modal should use same CSS variable system.
  - i18n: `src/i18n/locales/zh-CN.json:56-61` - add under `options.pdfPages` or similar.

  **Acceptance Criteria**:
  - [ ] Modal has `role="dialog"`, `aria-modal="true"`, localized title, and keyboard-accessible buttons.
  - [ ] Select all selects every loaded page; deselect all clears selection and disables Done.
  - [ ] Clicking page cards toggles selection independently.
  - [ ] Object URLs are revoked on modal close/unmount.

  **QA Scenarios**:

  ```
  Scenario: Select page cards and confirm
    Tool: Playwright
    Steps: Upload sample.pdf, choose target image, open page selector, deselect all, click page 2, click Done.
    Expected: Modal closes and row summary shows exactly 1 selected page in current locale.
    Evidence: .sisyphus/evidence/task-3-page-select-modal.png

  Scenario: Corrupt PDF preview fails safely
    Tool: Playwright
    Steps: Upload a .pdf payload with invalid PDF content if pdfjs rejects in non-E2E mode, open selector.
    Expected: Modal shows localized error and Cancel closes without crashing app.
    Evidence: .sisyphus/evidence/task-3-preview-error.png
  ```

  **Commit**: NO | Message: `feat(ui): add pdf page selector modal` | Files: [`src/components/PdfPageSelectorModal.tsx`, `src/styles/global.css`, locale files, tests]

- [x] 4. Integrate convert-all loading and PDF page selection into App

  **What to do**: Update `src/App.tsx` with `isConvertingAll`, `activePdfPageSelectorItemId`, and per-item `conversionOptions.pdf.selectedImagePages`. Render `<FullscreenLoading visible={isConvertingAll || isPreparingDownload} label={...} />` near the app root. Wrap `convertAll` in `try/finally` to set `isConvertingAll` true before queueing and false after the loop completes. In target column, show a localized page-select button only when `it.source === 'pdf' && it.target === 'image' && it.status !== 'done'`. Button opens modal for that item. Store confirmed pages on the file item and show summary text under the target select: `已选择 x 页` in zh-CN / localized equivalent elsewhere. When target changes away from image, preserve selected pages but clear `outputs`, `warnings`, `errorMessage`, and reset `status` to `ready` if it was `done` or `failed` only when changing target. Ensure selected pages are passed through `convertFile` at `src/App.tsx:217-222`.
  **Must NOT do**: Do not show page selector for PDF→PDF OCR. Do not allow conversion of PDF→image with zero selected pages. Do not keep stale done outputs after target changes.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: app UI integration and state behavior.
  - Skills: [] - no special skill needed.
  - Omitted: [`deep`] - scope is contained to `App.tsx` integration.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [7, 8] | Blocked By: [1, 2, 3, 6]

  **References**:
  - Pattern: `src/App.tsx:105-120` - current state and derived booleans.
  - Pattern: `src/App.tsx:159-166` - current option update pattern.
  - Pattern: `src/App.tsx:195-233` - convert-all async loop.
  - Pattern: `src/App.tsx:303-340` - target cell conditional controls.
  - Pattern: `src/App.tsx:342-362` - status details where summary-style text already appears.
  - Component: `src/components/FullscreenLoading.tsx` from Task 2.
  - Component: `src/components/PdfPageSelectorModal.tsx` from Task 3.

  **Acceptance Criteria**:
  - [ ] Clicking Convert all displays full-screen loading before first conversion and hides after all conversions finish/fail.
  - [ ] PDF→image rows show a page-select button and selected-page summary before conversion.
  - [ ] Conversion request receives selected pages and PDF→image output count matches selection.
  - [ ] Zero selected pages blocks confirmation or conversion with localized feedback.

  **QA Scenarios**:

  ```
  Scenario: Convert-all overlay and selected pages
    Tool: Playwright
    Steps: Upload sample.pdf, set target image, select only page 2, click Convert all.
    Expected: Full-screen loading appears, row reaches Done, status output count is 1 output, loading disappears.
    Evidence: .sisyphus/evidence/task-4-convert-loading-selected-page.png

  Scenario: Failed conversion clears loading
    Tool: Playwright
    Steps: Upload fail-notes.txt, click Convert all.
    Expected: Loading appears then disappears; failed row shows localized conversion error.
    Evidence: .sisyphus/evidence/task-4-convert-failure-loading.png
  ```

  **Commit**: NO | Message: `feat(app): integrate conversion loading and page selection` | Files: [`src/App.tsx`, components, locale files, tests]

- [x] 5. Add global download loading and always-available row delete

  **What to do**: Update `src/App.tsx:237-255` download handlers to be async and wrap both row and global downloads in `try/finally` with `isPreparingDownload`. Await both single and archive downloads by making `downloadBlobFile` either return `Promise<void>` or by using `await Promise.resolve(downloadBlobFile(...))`; keep `downloadResultArchive` awaited. Change row actions at `src/App.tsx:364-383` so completed rows show both Download and Delete buttons, while non-completed rows show Delete. Delete buttons call `removeItem` and are disabled when `isConvertingAll || isPreparingDownload || isRunningStatus(it.status)`. Disable clear/add/convert/download controls during global busy as appropriate: Convert all disabled while busy, Download all disabled while busy, Clear all disabled while busy, Add files disabled while busy if possible.
  **Must NOT do**: Do not implement cancellation. Do not delete rows while queued/converting or while global overlay is active. Do not remove the existing `aria-label` pattern.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: contained handler and row-action update.
  - Skills: [] - no special skill needed.
  - Omitted: [`visual-engineering`] - use existing button styles; no new complex UI.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [7, 8] | Blocked By: [2, 6]

  **References**:
  - Pattern: `src/App.tsx:153-157` - current remove/clear helpers.
  - Pattern: `src/App.tsx:237-255` - current download handlers.
  - Pattern: `src/App.tsx:364-383` - current mutually exclusive action buttons.
  - API: `src/lib/download.ts:24-36` - single and ZIP download helpers.
  - Test: `e2e/app.spec.ts:53-86` - existing row/global download flow.
  - Test: `e2e/app.spec.ts:222-230` - existing remove row test.

  **Acceptance Criteria**:
  - [ ] Row delete button exists for completed rows and removes the row when clicked outside busy states.
  - [ ] Row and global download display full-screen loading and hide it after file preparation triggers.
  - [ ] Delete, clear, convert, and download buttons are disabled during global busy.
  - [ ] Existing download filenames remain unchanged.

  **QA Scenarios**:

  ```
  Scenario: Completed row can be downloaded then deleted
    Tool: Playwright
    Steps: Upload sample.pdf, convert to txt, click row Download, wait for overlay to disappear, click row Delete.
    Expected: Download name is recorded and row is removed from table.
    Evidence: .sisyphus/evidence/task-5-download-delete.png

  Scenario: Delete disabled during download preparation
    Tool: Playwright
    Steps: Create a multi-output PDF→image row, click row Download to prepare ZIP.
    Expected: Full-screen loading is visible and row Delete button is disabled until loading disappears.
    Evidence: .sisyphus/evidence/task-5-delete-disabled-download.png
  ```

  **Commit**: NO | Message: `feat(app): show download loading and completed row delete` | Files: [`src/App.tsx`, `src/lib/download.ts`, tests]

- [x] 6. Add i18n labels and styles for new controls

  **What to do**: Update `src/i18n/locales/en.json`, `src/i18n/locales/zh-CN.json`, and `src/i18n/locales/zh-TW.json` with all new labels. Required keys: loading converting, loading preparing download, page selector button, modal title, select all, deselect all, done, cancel, selected page count, preview loading, preview error, no pages selected. Use existing namespaces (`actions`, `options`, `errors`, `output`) or add `pdfPages` under `options`; keep structure consistent in all locales. Add responsive CSS for modal grid, row action grouping, selected-page summary, and overlay. Ensure Chinese zh-CN selected summary is exactly “已选择 {{count}} 页” for plural and singular acceptable in Chinese.
  **Must NOT do**: Do not leave English fallback text visible in zh-CN/zh-TW. Do not add locale keys to only one language.

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: locale copy and style naming consistency.
  - Skills: [] - no special skill needed.
  - Omitted: [`deep`] - not an architecture task.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [3, 4, 5, 7, 8] | Blocked By: []

  **References**:
  - Pattern: `src/i18n/locales/zh-CN.json:23-61` - existing action/options/output keys.
  - Pattern: `src/styles/theme.css:1-35` - theme variables.
  - Pattern: `src/styles/theme.css:71-113` - button states.
  - Pattern: `src/styles/global.css:346-372` - mobile breakpoint.

  **Acceptance Criteria**:
  - [ ] All three locale JSON files have identical new key paths.
  - [ ] `yarn test:run` or a JSON parse check validates locale syntax.
  - [ ] Modal and overlay remain usable at <=640px width.

  **QA Scenarios**:

  ```
  Scenario: zh-CN labels render
    Tool: Playwright
    Steps: Switch language to zh-CN, upload PDF, set target image, open selector.
    Expected: Modal controls show Chinese labels and row summary reads `已选择 x 页`.
    Evidence: .sisyphus/evidence/task-6-zh-cn-labels.png

  Scenario: en labels render
    Tool: Playwright
    Steps: Switch language to en, upload PDF, set target image, open selector.
    Expected: Modal controls and loading labels show English text, no missing translation keys.
    Evidence: .sisyphus/evidence/task-6-en-labels.png
  ```

  **Commit**: NO | Message: `feat(i18n): add loading and pdf page labels` | Files: [`src/i18n/locales/*.json`, `src/styles/global.css`, `src/styles/theme.css`]

- [x] 7. Add automated Vitest coverage for state, converter, and UI behavior

  **What to do**: Extend existing tests in `src/__tests__/app.upload.test.tsx` and/or add focused test files under `src/__tests__/`. Cover: convert-all overlay visible while `convertFile` promise is pending; overlay hides after resolve and reject; PDF→image page-select control appears only for PDF source + image target; confirming selected pages updates row summary and passes selected pages into mocked `convertFile`; delete button exists for completed rows; delete is disabled during busy state; download overlay appears during async ZIP preparation. Mock modal thumbnail rendering if jsdom canvas/pdfjs is not reliable, but keep user-visible behavior tested. Add converter test coverage for selected pages in `src/lib/converter.ts` E2E/fake path or adapter with controlled mocks.
  **Must NOT do**: Do not weaken existing tests. Do not rely on arbitrary timers when promises can be controlled.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: async UI tests and mocks need care.
  - Skills: [] - no special skill needed.
  - Omitted: [`playwright`] - this task is Vitest-focused.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [8] | Blocked By: [1, 2, 3, 4, 5, 6]

  **References**:
  - Test: `src/__tests__/app.upload.test.tsx:6-16` - existing converter mock pattern.
  - Test: `src/__tests__/app.upload.test.tsx:83-117` - async convert and target lock pattern.
  - Test: `src/__tests__/app.upload.test.tsx:135-168` - locale-specific checkbox pattern.
  - API: `src/lib/converter.ts:183-223` - E2E fake conversion path.
  - Command: `package.json:16-18` - Vitest commands.

  **Acceptance Criteria**:
  - [ ] `yarn test:run` passes.
  - [ ] Tests fail if selected pages are not passed to `convertFile`.
  - [ ] Tests fail if loading overlay remains stuck after conversion failure.
  - [ ] Tests fail if completed rows lack a delete button.

  **QA Scenarios**:

  ```
  Scenario: Unit tests prove selected-page plumbing
    Tool: Bash
    Steps: Run `yarn test:run`.
    Expected: Test output shows passing App selected-page/converter tests.
    Evidence: .sisyphus/evidence/task-7-vitest-selected-pages.txt

  Scenario: Unit tests prove busy-state recovery
    Tool: Bash
    Steps: Run `yarn test:run` with tests that resolve and reject controlled conversion/download promises.
    Expected: Overlay appears while pending and disappears after both success and failure.
    Evidence: .sisyphus/evidence/task-7-vitest-busy-recovery.txt
  ```

  **Commit**: NO | Message: `test(app): cover loading page selection and delete actions` | Files: [`src/__tests__/*.test.tsx`, `src/__tests__/*.test.ts`]

- [x] 8. Add Playwright E2E coverage and run final commands

  **What to do**: Update `e2e/app.spec.ts` to cover the complete user flows in a browser. Use existing helpers `dropzoneFileInput`, `targetSelectForRow`, `rowForFile`, `downloadNames` from `e2e/app.spec.ts:4-26`. Because E2E sets `window.__E2E__ = true` at `e2e/app.spec.ts:30-39`, ensure page preview modal has a deterministic E2E path if pdfjs cannot render fake PDF payloads: the implementation may render fake two-page previews when `window.__E2E__ === true`, matching converter fake pages. Add tests for zh-CN “已选择 x 页”, selecting one page then converting to exactly one output, full-screen loading during convert, full-screen loading during row/global download, and deleting completed rows. Run `yarn lint`, `yarn test:run`, `yarn test:e2e`, and `yarn build`; save outputs as evidence.
  **Must NOT do**: Do not remove existing E2E tests. Do not make E2E depend on real network or external PDFs.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: browser QA and full command sweep.
  - Skills: [] - no special skill needed.
  - Omitted: [`git-master`] - no commit requested inside task.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: [Final Verification] | Blocked By: [4, 5, 7]

  **References**:
  - Test: `e2e/app.spec.ts:53-86` - existing upload/convert/download/clear flow.
  - Test: `e2e/app.spec.ts:98-120` - zh-CN and option flow.
  - Test: `e2e/app.spec.ts:198-211` - existing PDF→image multi-output ZIP flow.
  - Test: `e2e/app.spec.ts:222-230` - existing remove-row flow.
  - Command: `package.json:13-22` - lint, test, e2e, build scripts.

  **Acceptance Criteria**:
  - [ ] `yarn lint` passes.
  - [ ] `yarn test:run` passes.
  - [ ] `yarn test:e2e` passes.
  - [ ] `yarn build` passes.
  - [ ] E2E proves selected-page output count and row ZIP/global ZIP behavior remain correct.

  **QA Scenarios**:

  ```
  Scenario: Full PDF→image selected-page flow
    Tool: Playwright
    Steps: Switch to zh-CN, upload sample.pdf, set target image, open selector, deselect all, select page 2, Done, Convert all, row Download.
    Expected: Row summary says `已选择 1 页`, status says one output, row download records `sample.zip`, overlays appear and disappear.
    Evidence: .sisyphus/evidence/task-8-e2e-selected-page-flow.png

  Scenario: Completed row deletion and global download loading
    Tool: Playwright
    Steps: Upload two files, convert all, click global Download, wait for overlay to hide, delete one completed row.
    Expected: Global ZIP download name is recorded and completed row is removed while remaining row persists.
    Evidence: .sisyphus/evidence/task-8-e2e-download-delete.png
  ```

  **Commit**: NO | Message: `test(e2e): cover loading and pdf page selection flows` | Files: [`e2e/app.spec.ts`, evidence]

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.

- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high (+ playwright)
- [x] F4. Scope Fidelity Check — deep

## Commit Strategy

- Commit after all implementation and verification pass.
- Suggested message: `feat(converter): add loading and pdf page selection controls`

## Success Criteria

- All original requested behaviors are implemented and covered by automated tests.
- Busy overlays cannot get stuck after failures.
- PDF→image selected-page count in row, converted output count, row ZIP contents, and global ZIP contents all agree.
- Completed rows can be deleted when app is not busy.
