# Optimize File Conversion Interactions

## TL;DR

> **Summary**: Add locked target selection for completed rows, per-file OCR configuration for PDF output, scoped PDF→PDF conversion with optional OCR text embedding, and regression coverage for duplicate same-name re-upload after completion.
> **Deliverables**:
>
> - Completed rows cannot change target type.
> - Per-row checkbox labeled `是否进行 OCR`, visible/enabled only for target `pdf`.
> - `pdf→pdf` conversion path with OCR unchecked copy output and OCR checked text embedding using `@hamster-note/image-parser`.
> - TDD Vitest + Playwright regression tests.
>   **Effort**: Medium
>   **Parallel**: YES - 3 waves
>   **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 7 → Final Verification Wave

## Context

### Original Request

1. 文件列表中，已经转换成功的文件，不可修改目标类型。
2. 增加配置文件，用来配置转换用的参数；本次增加 PDF→PDF / PDF 输出 OCR checkbox，文案：`是否进行 OCR`。勾选后根据 PDF 底图使用 `@hamster-note/image-parser` 识别文字并放入输出 PDF，主要用于影印版 PDF。
3. 如果一个文件转换完成了，支持相同文件再传一次，列表中会出现两个同名文件。

### Interview Summary

- OCR 配置为每行独立，不是全局配置。
- OCR checkbox 仅当目标类型为 `pdf` 时显示/启用。
- 新增转换路径范围：仅 `pdf→pdf`；不要在本次新增 `txt→pdf`。
- 测试策略：TDD，先补失败测试再实现。

### Metis Review (gaps addressed)

- OCR 文本放置风险：本计划定义 MVP 为保留原 PDF 页面视觉内容，并把 OCR 文本作为不可见/近不可见、可选择文本层追加到对应输出 PDF 页面；不做复杂坐标重建。
- 范围膨胀风险：本计划禁止新增 `txt→pdf`、语言选择、全局 OCR、OCR 进度条、批量 OCR 控制。
- 重复上传风险：现有随机 ID 已支持重复项；本计划以测试锁定行为，不要求重写上传逻辑。
- 状态边界：目标锁定仅适用于 `status === 'done'`，不扩展到 `failed`。

## Work Objectives

### Core Objective

Improve file conversion interactions while keeping behavior explicit, row-scoped, and regression-tested.

### Deliverables

- TDD tests covering completed-row target lock, per-row OCR checkbox visibility/state, `pdf→pdf` converter support, OCR invocation, and duplicate same-name re-upload.
- UI state extension for per-file conversion options.
- Converter request/options extension for PDF OCR.
- PDF adapter implementation for `pdf→pdf`.
- i18n keys for OCR label in zh-CN, zh-TW, and en.

### Definition of Done (verifiable conditions with commands)

- `yarn vitest run src/__tests__/app.upload.test.tsx` passes.
- `yarn vitest run src/__tests__/converter.contract.test.ts` passes.
- `yarn vitest run src/__tests__/convert.integration.test.ts` passes.
- `yarn playwright test e2e/app.spec.ts` passes.
- `yarn lint` passes with zero warnings.
- `yarn build` passes.

### Must Have

- Completed rows (`done`) have a disabled target select and cannot be changed by UI interaction.
- Failed rows remain editable/retryable.
- OCR checkbox default is unchecked.
- OCR checkbox is per-row and only visible/enabled when the row target is `pdf`.
- `pdf→pdf` appears as a supported target for PDF source files.
- OCR checked path calls `@hamster-note/image-parser` against rendered page images and embeds recognized text into the output PDF.
- Duplicate same-name re-upload after a completed conversion renders a second row with the same file name.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)

- MUST NOT add `txt→pdf` in this work.
- MUST NOT add global OCR settings, OCR language selection, OCR progress UI, or batch OCR controls.
- MUST NOT deduplicate uploads by name, size, lastModified, content hash, or object identity.
- MUST NOT lock target selection for `failed` rows.
- MUST NOT introduce `any`; use project TypeScript conventions.
- MUST NOT leave human/manual verification as acceptance criteria.

## Verification Strategy

> ZERO HUMAN INTERVENTION - all verification is agent-executed.

- Test decision: TDD with Vitest + Playwright.
- QA policy: Every task has agent-executed scenarios.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy

### Parallel Execution Waves

> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: Task 1 test specs, Task 2 converter contract tests, Task 3 UI state/i18n foundation.
Wave 2: Task 4 PDF→PDF adapter, Task 5 UI behavior implementation, Task 6 duplicate upload regression.
Wave 3: Task 7 E2E coverage, Task 8 integration/lint/build stabilization.

### Dependency Matrix (full, all tasks)

| Task | Depends On | Blocks |
| ---- | ---------- | ------ |
| 1    | none       | 5, 7   |
| 2    | none       | 4, 8   |
| 3    | none       | 4, 5   |
| 4    | 2, 3       | 7, 8   |
| 5    | 1, 3       | 7, 8   |
| 6    | 1          | 7, 8   |
| 7    | 4, 5, 6    | F1-F4  |
| 8    | 4, 5, 6, 7 | F1-F4  |

### Agent Dispatch Summary (wave → task count → categories)

| Wave | Task Count | Categories                         |
| ---- | ---------: | ---------------------------------- |
| 1    |          3 | quick, quick, visual-engineering   |
| 2    |          3 | deep, visual-engineering, quick    |
| 3    |          2 | unspecified-high, unspecified-high |

## TODOs

> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Add failing UI tests for completed target lock and OCR controls

  **What to do**: In `src/__tests__/app.upload.test.tsx` or a nearby App-focused test file, add TDD coverage that uploads a PDF, drives conversion to `done`, asserts the target `<select>` for that completed row is disabled, and asserts failed/ready rows remain editable. Add tests that a row with target `pdf` shows a checkbox labeled `是否进行 OCR`, the checkbox defaults unchecked, and rows whose target is not `pdf` do not expose an enabled OCR checkbox.
  **Must NOT do**: Do not implement source changes in this task beyond minimal test-only setup/mocks. Do not assert on brittle table indexes if accessible labels or row scoping are available.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: Focused test addition using existing patterns.
  - Skills: `[]` - No extra skill required.
  - Omitted: [`frontend-ui-ux`] - This is test-first specification, not visual design.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [5, 7] | Blocked By: []

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `src/__tests__/app.upload.test.tsx` - use existing React Testing Library upload patterns.
  - Pattern: `src/App.tsx:119-143` - upload handler appends file rows.
  - Pattern: `src/App.tsx:151-153` - current target change handler.
  - Pattern: `src/App.tsx:295-306` - current target select rendering and disabled condition.
  - Test: `src/test/setup.ts` - global jsdom/test setup.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `yarn vitest run src/__tests__/app.upload.test.tsx` fails before implementation for missing completed-row lock/OCR UI behavior.
  - [ ] Test names explicitly mention `done` target lock, OCR checkbox default unchecked, and OCR checkbox only for PDF target.
  - [ ] Tests use accessible queries or row-scoped queries; no arbitrary timeout sleeps.

  **QA Scenarios** (MANDATORY - task incomplete without these):

  ```
  Scenario: Completed row target select is locked by test spec
    Tool: Bash
    Steps: Run `yarn vitest run src/__tests__/app.upload.test.tsx --runInBand` if supported, otherwise `yarn vitest run src/__tests__/app.upload.test.tsx`.
    Expected: Command fails before implementation with assertion showing target select should be disabled for a completed row.
    Evidence: .sisyphus/evidence/task-1-ui-tests.txt

  Scenario: Non-PDF target does not expose enabled OCR checkbox by test spec
    Tool: Bash
    Steps: Run `yarn vitest run src/__tests__/app.upload.test.tsx`.
    Expected: Command fails before implementation with assertion showing OCR checkbox visibility/enabled-state mismatch.
    Evidence: .sisyphus/evidence/task-1-ocr-tests.txt
  ```

  **Commit**: NO | Message: `test(app): specify conversion interaction behavior` | Files: [`src/__tests__/app.upload.test.tsx`]

- [x] 2. Add failing converter contract tests for scoped PDF→PDF and OCR option propagation

  **What to do**: In `src/__tests__/converter.contract.test.ts` and/or `src/__tests__/convert.integration.test.ts`, add TDD tests for `getSupportedTargets('pdf')` including `pdf`, `convertFile({ source: 'pdf', target: 'pdf' })` returning one `application/pdf` result, OCR unchecked not importing/calling `@hamster-note/image-parser`, and OCR checked invoking the mocked image parser. Add an explicit negative assertion that `txt→pdf` remains unsupported in this work.
  **Must NOT do**: Do not add `txt→pdf`; do not change mocks to always pass without verifying call behavior.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: Bounded converter contract tests.
  - Skills: `[]` - No extra skill required.
  - Omitted: [`playwright`] - Unit/integration converter behavior only.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [4, 8] | Blocked By: []

  **References**:
  - Pattern: `src/__tests__/converter.contract.test.ts` - conversion routing test style.
  - Pattern: `src/__tests__/convert.integration.test.ts` - integration snapshot/fixture style.
  - API/Type: `src/lib/converter.ts:28-32` - `ConversionRequest` currently lacks options and must be extended later.
  - API/Type: `src/lib/converter.ts:46-54` - supported targets map.
  - Test Mock: `src/test/mocks/` - parser mocks configured by `vitest.config.ts`.

  **Acceptance Criteria**:
  - [ ] `yarn vitest run src/__tests__/converter.contract.test.ts` fails before implementation because `pdf` is not yet a supported PDF target.
  - [ ] `yarn vitest run src/__tests__/convert.integration.test.ts` fails before implementation for missing PDF→PDF/OCR behavior.
  - [ ] Tests assert `txt→pdf` is unsupported.

  **QA Scenarios**:

  ```
  Scenario: PDF→PDF contract is specified
    Tool: Bash
    Steps: Run `yarn vitest run src/__tests__/converter.contract.test.ts`.
    Expected: Pre-implementation failure identifies missing `pdf` target support for PDF source.
    Evidence: .sisyphus/evidence/task-2-contract.txt

  Scenario: txt→pdf remains out of scope
    Tool: Bash
    Steps: Run `yarn vitest run src/__tests__/converter.contract.test.ts`.
    Expected: Test includes and enforces unsupported conversion for `source: 'txt', target: 'pdf'`.
    Evidence: .sisyphus/evidence/task-2-out-of-scope.txt
  ```

  **Commit**: NO | Message: `test(converter): specify pdf to pdf ocr contract` | Files: [`src/__tests__/converter.contract.test.ts`, `src/__tests__/convert.integration.test.ts`, `src/test/mocks/*`]

- [x] 3. Add row-scoped conversion options types and i18n foundations

  **What to do**: Extend app/converter types so each `FileItem` carries `conversionOptions: { pdf: { ocr: boolean } }`. Extend `ConversionRequest` with optional `options?: { pdf?: { ocr: boolean } }`. Initialize OCR unchecked (`false`) for every new file row. Add i18n keys for the OCR checkbox in `src/i18n/locales/en.json`, `zh-CN.json`, and `zh-TW.json`; Chinese Simplified label must be exactly `是否进行 OCR`.
  **Must NOT do**: Do not add global React state for OCR. Do not add settings files outside `src/i18n`/`src/App.tsx` unless already used by project patterns.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: UI state and localized label foundation.
  - Skills: `[]` - No extra skill required.
  - Omitted: [`git-master`] - No git operation requested.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [4, 5] | Blocked By: []

  **References**:
  - API/Type: `src/App.tsx:17-26` - extend `FileItem`.
  - Pattern: `src/App.tsx:130-136` - initialize new file row state.
  - API/Type: `src/lib/converter.ts:28-32` - extend `ConversionRequest` to accept options.
  - Pattern: `src/i18n/locales/en.json`, `src/i18n/locales/zh-CN.json`, `src/i18n/locales/zh-TW.json` - add localized keys under existing table/options structure.

  **Acceptance Criteria**:
  - [ ] TypeScript accepts a per-row OCR boolean initialized to `false` for all uploaded files.
  - [ ] `ConversionRequest` can carry OCR option without weakening types to `any`.
  - [ ] Simplified Chinese locale contains exact text `是否进行 OCR`.
  - [ ] `yarn vitest run src/__tests__/app.upload.test.tsx` still reaches expected pre-implementation failures from Task 1, not TypeScript/import failures.

  **QA Scenarios**:

  ```
  Scenario: OCR option is row-scoped and typed
    Tool: Bash
    Steps: Run `yarn vitest run src/__tests__/app.upload.test.tsx`.
    Expected: No TypeScript error about missing conversion option fields; behavioral tests may still fail until Task 5.
    Evidence: .sisyphus/evidence/task-3-types.txt

  Scenario: OCR label is localized
    Tool: Bash
    Steps: Run `yarn vitest run src/__tests__/app.upload.test.tsx` with test querying `是否进行 OCR`.
    Expected: Query can resolve the i18n label once UI is present; before Task 5 failure is due missing checkbox, not missing translation key text.
    Evidence: .sisyphus/evidence/task-3-i18n.txt
  ```

  **Commit**: NO | Message: `feat(app): add row conversion option state` | Files: [`src/App.tsx`, `src/lib/converter.ts`, `src/i18n/locales/en.json`, `src/i18n/locales/zh-CN.json`, `src/i18n/locales/zh-TW.json`]

- [x] 4. Implement PDF→PDF adapter with optional OCR text layer

  **What to do**: Add `convertPdfToPdf` in `src/lib/converter/pdf-adapters.ts`, register it in `src/lib/converter.ts`, and add `pdf` to `supportedTargets.pdf`. Behavior: with OCR unchecked, return the original file bytes as a new `Blob` with `mimeType: 'application/pdf'`, `targetFormat: 'pdf'`, and original `.pdf` filename preserved via existing filename helper. With OCR checked, load PDF via existing `loadPdfDocument`, render each page using existing page rendering logic, run `ImageParser.encode` on each rendered page image ArrayBuffer, extract text using the same `IntermediateDocument.text` convention used in `image-adapters.ts:69-72`, then create a new PDF with original rendered page image as background and recognized text added as a selectable text layer. MVP placement is fixed: add recognized page text at x=16, y=16 on the same page using `doc.setTextColor(255, 255, 255)` and `doc.setFontSize(1)` before `doc.text(...)`; do not attempt opacity APIs. Preserve one output page per input page. If OCR returns no text for all pages, throw an error with code `EMPTY_OCR` so existing UI maps to `errors.emptyOcr`.
  **Must NOT do**: Do not attempt precise OCR coordinate reconstruction. Do not add server-side processing. Do not add `txt→pdf`. Do not replace existing PDF→txt/image implementations.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: Adapter touches PDF rendering, jsPDF output, dynamic parser imports, and error behavior.
  - Skills: `[]` - No extra skill required.
  - Omitted: [`visual-engineering`] - Core work is conversion pipeline, not UI.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [7, 8] | Blocked By: [2, 3]

  **References**:
  - Pattern: `src/lib/converter.ts:46-54` - supported target map.
  - Pattern: `src/lib/converter.ts:223-257` - adapter registration and routing.
  - Pattern: `src/lib/converter/pdf-adapters.ts:115-156` - load/render PDF pages.
  - Pattern: `src/lib/converter/pdf-adapters.ts:187-206` - PDF→image multi-page output naming/render behavior.
  - Pattern: `src/lib/converter/image-adapters.ts:74-100` - jsPDF image-to-PDF output.
  - Pattern: `src/lib/converter/image-adapters.ts:102-131` - `@hamster-note/image-parser` import and OCR text extraction.
  - API/Type: `src/lib/converter.ts:28-32` - extended `ConversionRequest` options from Task 3.

  **Acceptance Criteria**:
  - [ ] `getSupportedTargets('pdf')` returns `pdf` in addition to existing targets.
  - [ ] `convertFile({ source: 'pdf', target: 'pdf', options: { pdf: { ocr: false } } })` returns one PDF result without invoking `ImageParser.encode`.
  - [ ] `convertFile({ source: 'pdf', target: 'pdf', options: { pdf: { ocr: true } } })` invokes `ImageParser.encode` for rendered page images and returns one PDF result.
  - [ ] `convertFile({ source: 'txt', target: 'pdf' })` throws `UnsupportedConversionError`.
  - [ ] `yarn vitest run src/__tests__/converter.contract.test.ts src/__tests__/convert.integration.test.ts` passes.

  **QA Scenarios**:

  ```
  Scenario: OCR unchecked PDF→PDF copies PDF output
    Tool: Bash
    Steps: Run `yarn vitest run src/__tests__/converter.contract.test.ts -t "PDF to PDF"` or nearest exact test name.
    Expected: Test passes; mocked `ImageParser.encode` call count is 0; output mime type is `application/pdf`.
    Evidence: .sisyphus/evidence/task-4-pdf-copy.txt

  Scenario: OCR checked PDF→PDF calls image parser and handles empty OCR
    Tool: Bash
    Steps: Run `yarn vitest run src/__tests__/convert.integration.test.ts -t "OCR"` or nearest exact test name.
    Expected: Success case embeds OCR text; empty OCR case maps to an `EMPTY_OCR` coded error.
    Evidence: .sisyphus/evidence/task-4-pdf-ocr.txt
  ```

  **Commit**: NO | Message: `feat(converter): support pdf to pdf ocr option` | Files: [`src/lib/converter.ts`, `src/lib/converter/pdf-adapters.ts`, `src/__tests__/converter.contract.test.ts`, `src/__tests__/convert.integration.test.ts`, `src/test/mocks/*`]

- [x] 5. Implement completed-row lock and per-row OCR checkbox UI

  **What to do**: Update `src/App.tsx` rendering and handlers so target select is disabled when `it.status === 'queued' || it.status === 'converting' || it.status === 'done'`. Add a row-scoped OCR checkbox in/near the target cell. Final behavior is fixed: show the OCR checkbox only when `it.target === 'pdf'`; enable it only when the row is not `queued`, `converting`, or `done`; keep it visible but disabled for completed PDF rows so users can see the option used; hide it for non-PDF targets. Pass `current.conversionOptions` into `convertFile` in `convertAll`.
  **Must NOT do**: Do not allow checkbox changes on done/queued/converting rows. Do not mutate completed conversion outputs when toggling ready/failed rows. Do not add a global config panel.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: UI behavior, accessibility, and state wiring.
  - Skills: `[]` - No extra skill required.
  - Omitted: [`deep`] - Conversion internals are handled in Task 4.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [7, 8] | Blocked By: [1, 3]

  **References**:
  - Pattern: `src/App.tsx:151-153` - target update handler.
  - Pattern: `src/App.tsx:181-218` - conversion request creation.
  - Pattern: `src/App.tsx:289-306` - target select in file table.
  - Pattern: `src/App.tsx:308-328` - status details for done/failed rows.
  - Pattern: `src/i18n/locales/*.json` - translation keys from Task 3.

  **Acceptance Criteria**:
  - [ ] Completed row target select is disabled in Vitest and Playwright assertions.
  - [ ] Failed row target select remains enabled.
  - [ ] OCR checkbox defaults unchecked for new PDF-target rows.
  - [ ] OCR checkbox toggles only that row's conversion option.
  - [ ] `convertFile` receives the selected OCR option for each row.
  - [ ] `yarn vitest run src/__tests__/app.upload.test.tsx` passes.

  **QA Scenarios**:

  ```
  Scenario: Completed row target cannot be modified
    Tool: Bash
    Steps: Run `yarn vitest run src/__tests__/app.upload.test.tsx -t "done"` or nearest exact target-lock test.
    Expected: Completed row select has disabled=true; attempted change does not update row target.
    Evidence: .sisyphus/evidence/task-5-target-lock.txt

  Scenario: OCR checkbox is row-scoped
    Tool: Bash
    Steps: Run `yarn vitest run src/__tests__/app.upload.test.tsx -t "OCR"` or nearest exact OCR UI test.
    Expected: Toggling OCR on one PDF row does not toggle another row; non-PDF rows do not expose enabled OCR control.
    Evidence: .sisyphus/evidence/task-5-ocr-row-scope.txt
  ```

  **Commit**: NO | Message: `feat(app): add pdf ocr row controls` | Files: [`src/App.tsx`, `src/i18n/locales/*.json`, `src/__tests__/app.upload.test.tsx`]

- [x] 6. Lock duplicate same-name re-upload behavior with regression tests

  **What to do**: Add or update tests so after a file reaches `done`, uploading the exact same `File` metadata/name again appends a second row with the same displayed file name. If current implementation already passes, do not rewrite upload logic; only adjust code if a browser input quirk prevents selecting the same file again. If needed, reset the hidden file input value after processing files in `FileDropzone` so browser change events fire for the same file selection.
  **Must NOT do**: Do not add deduplication. Do not rename displayed duplicate file names. Do not merge outputs from same-name rows.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: Regression test likely validates existing append/random-ID behavior.
  - Skills: `[]` - No extra skill required.
  - Omitted: [`deep`] - No architectural change expected.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [7, 8] | Blocked By: [1]

  **References**:
  - Pattern: `src/App.tsx:56-65` - random file item ID generation permits duplicates.
  - Pattern: `src/App.tsx:119-143` - `setItems(prev => [...prev, ...next])` append behavior.
  - Pattern: `src/components/FileDropzone.tsx` - file input change handling; inspect only if same-file browser reselection test fails.
  - Test: `src/__tests__/app.upload.test.tsx` - upload interaction tests.

  **Acceptance Criteria**:
  - [ ] Test uploads `sample.pdf`, completes conversion, uploads same-name/same-metadata file again, and sees two rows containing `sample.pdf`.
  - [ ] If `FileDropzone` input reset is required, it is implemented without clearing the app's file list.
  - [ ] `yarn vitest run src/__tests__/app.upload.test.tsx` passes.

  **QA Scenarios**:

  ```
  Scenario: Same completed file can be uploaded again
    Tool: Bash
    Steps: Run `yarn vitest run src/__tests__/app.upload.test.tsx -t "same file"` or nearest exact duplicate-upload test.
    Expected: Two same-name rows are rendered after the second upload.
    Evidence: .sisyphus/evidence/task-6-duplicate-upload.txt

  Scenario: Duplicate rows remain independent
    Tool: Bash
    Steps: Run the same duplicate-upload test suite and assert only the first row has `done` status immediately after re-upload.
    Expected: First row remains done; second row starts ready and has its own target/options state.
    Evidence: .sisyphus/evidence/task-6-independent-rows.txt
  ```

  **Commit**: NO | Message: `test(app): preserve duplicate completed uploads` | Files: [`src/__tests__/app.upload.test.tsx`, `src/components/FileDropzone.tsx`]

- [x] 7. Add Playwright E2E coverage for full interaction flow

  **What to do**: Extend `e2e/app.spec.ts` to cover real browser flows: upload a PDF, select target `pdf`, verify OCR checkbox labeled `是否进行 OCR` appears and defaults unchecked, toggle OCR, convert, assert the completed row target select is disabled, then upload the same file again and assert two same-name rows. Also add an edge test that target `txt` or `image` hides/disables OCR checkbox.
  **Must NOT do**: Do not rely on screenshots as the only assertion. Do not require manual visual confirmation. Do not introduce non-deterministic waits; use existing locators/helpers and `expect` polling.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: Browser E2E requires coordinating UI, mocked conversion, and stable selectors.
  - Skills: [`playwright`] - Required for browser automation/test verification.
  - Omitted: [`deep`] - Implementation decisions already made.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: [F1-F4] | Blocked By: [4, 5, 6]

  **References**:
  - Pattern: `e2e/app.spec.ts` - existing upload/convert/download/i18n E2E flows.
  - Pattern: `e2e/app.spec.ts` helper locators such as row-for-file/dropzone helpers, if present.
  - Pattern: `src/lib/converter.ts:178-218` - E2E fake conversion path; update if needed so `pdf` target path is deterministic.
  - UI: `src/App.tsx:275-355` - file table rendering.

  **Acceptance Criteria**:
  - [ ] `yarn playwright test e2e/app.spec.ts` passes.
  - [ ] E2E asserts OCR checkbox default unchecked and row-scoped visibility for PDF target.
  - [ ] E2E asserts target select disabled after `Done`.
  - [ ] E2E asserts duplicate same-name rows after re-uploading completed file.

  **QA Scenarios**:

  ```
  Scenario: Browser flow converts PDF→PDF with OCR option visible
    Tool: Playwright
    Steps: Run `yarn playwright test e2e/app.spec.ts -g "PDF.*OCR"` or nearest exact test name.
    Expected: Test passes; OCR checkbox is found by label `是否进行 OCR`, toggled, and conversion reaches `Done`.
    Evidence: .sisyphus/evidence/task-7-e2e-ocr.txt

  Scenario: Completed same-name re-upload shows two rows
    Tool: Playwright
    Steps: Run `yarn playwright test e2e/app.spec.ts -g "same file"` or nearest exact test name.
    Expected: Test passes; table contains two rows whose file cell text is the same PDF file name.
    Evidence: .sisyphus/evidence/task-7-e2e-duplicate.txt
  ```

  **Commit**: NO | Message: `test(e2e): cover pdf ocr interactions` | Files: [`e2e/app.spec.ts`, `src/lib/converter.ts`]

- [x] 8. Stabilize full test, lint, and build suite

  **What to do**: Run the full verification suite, fix only defects related to this plan, and capture command outputs as evidence. Required commands: `yarn vitest run src/__tests__/app.upload.test.tsx`, `yarn vitest run src/__tests__/converter.contract.test.ts`, `yarn vitest run src/__tests__/convert.integration.test.ts`, `yarn playwright test e2e/app.spec.ts`, `yarn lint`, and `yarn build`. If formatting issues appear, edit source manually or run the formatter only if it is project-standard and does not rewrite unrelated files; inspect changed files afterward.
  **Must NOT do**: Do not broaden scope to unrelated test failures without isolating them. Do not suppress lint rules. Do not weaken assertions added in Tasks 1, 2, 6, or 7.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: Cross-suite stabilization and regression triage.
  - Skills: `[]` - No extra skill required.
  - Omitted: [`git-master`] - No commit requested within task execution.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: [F1-F4] | Blocked By: [4, 5, 6, 7]

  **References**:
  - Command: `package.json` scripts for test/lint/build names.
  - CI Pattern: `.github/workflows/deploy.yml` - current CI order includes unit tests, build, and E2E.
  - Test: `vitest.config.ts` and `playwright.config.ts` - test runtime setup.

  **Acceptance Criteria**:
  - [ ] `yarn vitest run src/__tests__/app.upload.test.tsx` passes.
  - [ ] `yarn vitest run src/__tests__/converter.contract.test.ts` passes.
  - [ ] `yarn vitest run src/__tests__/convert.integration.test.ts` passes.
  - [ ] `yarn playwright test e2e/app.spec.ts` passes.
  - [ ] `yarn lint` passes with zero warnings.
  - [ ] `yarn build` passes.

  **QA Scenarios**:

  ```
  Scenario: Full planned verification suite passes
    Tool: Bash
    Steps: Run all required commands listed in this task in order.
    Expected: Every command exits 0; outputs are saved to evidence files.
    Evidence: .sisyphus/evidence/task-8-full-suite.txt

  Scenario: Scope guard remains enforced
    Tool: Bash
    Steps: Run `yarn vitest run src/__tests__/converter.contract.test.ts -t "txt"` or nearest negative-scope test.
    Expected: Test confirms `txt→pdf` remains unsupported.
    Evidence: .sisyphus/evidence/task-8-scope-guard.txt
  ```

  **Commit**: YES | Message: `feat(converter): add pdf ocr interaction options` | Files: [`src/App.tsx`, `src/components/FileDropzone.tsx`, `src/lib/converter.ts`, `src/lib/converter/pdf-adapters.ts`, `src/i18n/locales/*.json`, `src/__tests__/*.ts*`, `src/test/mocks/*`, `e2e/app.spec.ts`]

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.

- [x] F1. Plan Compliance Audit — oracle ✅ APPROVED
- [x] F2. Code Quality Review — unspecified-high ✅ APPROVED
- [x] F3. Real Manual QA — unspecified-high (+ playwright) ✅ APPROVED
- [x] F4. Scope Fidelity Check — deep ✅ APPROVED

## Commit Strategy

- Commit only after all tasks and final verification pass.
- Suggested commit message: `feat(converter): add pdf ocr interaction options`
- Include source, tests, and i18n files in one atomic commit.

## Success Criteria

- The UI prevents changing target type for completed rows.
- PDF rows can choose `pdf` as target and optionally enable OCR.
- OCR unchecked PDF→PDF produces an output PDF without invoking image OCR.
- OCR checked PDF→PDF invokes `@hamster-note/image-parser` and creates output PDF with recognized text embedded as a selectable/invisible text layer.
- Re-uploading the same completed file creates another visible same-name row.
- All specified Vitest, Playwright, lint, and build commands pass.
