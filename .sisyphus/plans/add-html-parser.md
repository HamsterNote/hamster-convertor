# Add @hamster-note/html-parser Conversion Support

## TL;DR

> **Summary**: Integrate `@hamster-note/html-parser` into the existing converter architecture so PDF -> HTML, TXT -> HTML, and HTML -> TXT are supported through the unified adapter map.
> **Deliverables**:
>
> - Unified converter adapter registration for PDF -> HTML, TXT -> HTML, HTML -> TXT
> - `html` source-format support in UI/source detection and i18n target labels
> - Tests-after coverage using existing Vitest/Playwright infrastructure
> - Agent-executed QA evidence for all conversion paths
>   **Effort**: Medium
>   **Parallel**: YES - 3 waves
>   **Critical Path**: Task 1 -> Task 2 -> Task 4 -> Final Verification Wave

## Context

### Original Request

接入 `@hamster-note/html-parser`，支持 PDF -> HTML，TXT -> HTML，HTML -> TXT

### Interview Summary

- Test strategy: tests-after using existing Vitest/Playwright infrastructure.
- PDF -> HTML handling: refactor existing special-case path into the unified adapter map.
- UX default: keep current generated-file/download/status behavior only; do not add preview/editor.

### Metis Review (gaps addressed)

- Default applied: accept both `.html` and `.htm` as HTML source files.
- Default applied: HTML -> TXT extracts visible parser text only; no metadata, alt-text augmentation, stylesheet text, or hidden DOM interpretation.
- Default applied: TXT -> HTML preserves line-oriented text using parser intermediate representation; escape HTML-sensitive characters via parser output, never by React rendering.
- Guardrail added: do not render converted HTML in the DOM to avoid XSS scope creep.
- Guardrail added: refactor PDF -> HTML without changing existing output filename, MIME type, status, and error semantics.

## Work Objectives

### Core Objective

Route and implement PDF -> HTML, TXT -> HTML, and HTML -> TXT through the existing converter abstraction using `@hamster-note/html-parser`.

### Deliverables

- `src/lib/converter.ts` supports `SourceFormat = 'pdf' | 'txt' | 'image' | 'html'` and registers all requested conversions in the adapter map.
- PDF -> HTML existing implementation is moved from `convertFile()` special-case into `pdf.html` adapter behavior without output changes.
- TXT -> HTML converts TXT input into an intermediate document using the existing TXT parser pattern, then emits HTML via `HtmlParser`.
- HTML -> TXT parses HTML using `HtmlParser.encode()` and writes deterministic plain text.
- `src/App.tsx` accepts `.html` and `.htm` inputs and exposes valid targets through existing dropdown flow.
- `src/i18n/locales/en.json`, `zh-CN.json`, and `zh-TW.json` include `formats.targets.html`.
- Unit/integration/E2E tests cover requested conversions and unsupported-pair behavior.

### Definition of Done (verifiable conditions with commands)

- `yarn vitest run src/__tests__/converter.contract.test.ts src/__tests__/converter.txt-adapter.test.ts src/__tests__/convert.integration.test.ts` passes.
- `yarn playwright test e2e/app.spec.ts --project=chromium` passes.
- `yarn lint && yarn build` passes.
- No source file renders converted HTML into React DOM.
- Output downloads use correct extensions and MIME types: `.html` => `text/html`, `.txt` => `text/plain`.

### Must Have

- Support exactly these requested conversions: PDF -> HTML, TXT -> HTML, HTML -> TXT.
- Preserve existing PDF -> HTML behavior while moving routing into adapter map.
- Accept `.html` and `.htm` source files as `html`.
- Use existing `ConversionResult[]` shape and status flow.
- Keep all QA agent-executed with evidence files.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)

- Do not add preview, editor, sanitizer UI, server APIs, batch ZIP, markdown, DOCX, EPUB, or extra conversion formats.
- Do not render converted HTML with `dangerouslySetInnerHTML` or inject it into the app DOM.
- Do not replace the existing converter architecture with a new abstraction.
- Do not loosen TypeScript with `any`.
- Do not skip existing parser mocks or test conventions.

## Verification Strategy

> ZERO HUMAN INTERVENTION - all verification is agent-executed.

- Test decision: tests-after + existing Vitest/jsdom and Playwright chromium.
- QA policy: Every task has agent-executed scenarios.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy

### Parallel Execution Waves

> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: Task 1 converter architecture and adapters, Task 2 UI/i18n source support, Task 3 parser mocks/fixtures
Wave 2: Task 4 unit/integration tests, Task 5 E2E coverage
Wave 3: Task 6 build/lint/regression hardening

### Dependency Matrix (full, all tasks)

- Task 1: blocks Task 4, Task 5, Task 6
- Task 2: blocks Task 5, Task 6
- Task 3: blocks Task 4, Task 5
- Task 4: blocked by Task 1 and Task 3; blocks Task 6
- Task 5: blocked by Task 1, Task 2, and Task 3; blocks Task 6
- Task 6: blocked by Tasks 1-5

### Agent Dispatch Summary (wave → task count → categories)

- Wave 1 → 3 tasks → quick, quick, quick
- Wave 2 → 2 tasks → quick, unspecified-low
- Wave 3 → 1 task → unspecified-low

## TODOs

> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Refactor Converter Routing and Add Parser-Backed Adapters

  **What to do**: In `src/lib/converter.ts`, add `html` to `SourceFormat`; remove the PDF -> HTML special-case from `convertFile()`; register PDF -> HTML under `adapters.pdf.html`; register `txt.html`; add `html: { txt: ... }`. Keep `convertFile()` as generic adapter lookup plus existing unsupported-conversion error behavior. Implement or relocate adapter functions by following existing patterns in `src/lib/converter/pdf-adapters.ts` and `src/lib/converter/txt-adapter.ts`. For TXT -> HTML, obtain the intermediate document exactly as existing TXT conversion obtains parser output, then call `HtmlParser.decode(intermediateDocument)` to produce a standalone HTML file; if the parser returns `File`, use it as the blob source, and if it returns `ArrayBuffer`, wrap it in `new Blob([arrayBuffer], { type: 'text/html' })`. For HTML -> TXT, call `HtmlParser.encode(input)` and extract visible text from parsed pages in page order; join page/line text deterministically with `\n`, trim trailing whitespace, and return a `Blob` with MIME `text/plain`.
  **Must NOT do**: Do not render HTML in React; do not add extra formats; do not change existing PDF -> HTML filename/MIME/warning semantics.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: bounded TypeScript converter changes in known files.
  - Skills: [] - No specialized skill needed.
  - Omitted: [`frontend-ui-ux`] - No visual design work.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: Task 4, Task 5, Task 6 | Blocked By: none

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `src/lib/converter.ts:1-315` - dispatcher, dynamic imports, adapter map, `ConversionResult[]`, unsupported conversion behavior.
  - Pattern: `src/lib/converter.ts:178-192` - existing PDF -> HTML behavior to preserve when moving into adapter map.
  - Pattern: `src/lib/converter/pdf-adapters.ts:1-368` - PDF adapter implementation style.
  - Pattern: `src/lib/converter/txt-adapter.ts:1-121` - TXT parser/adapter style.
  - API/Type: `src/types/html-parser.d.ts:1-44` - `HtmlParser.encode`, `decode`, `decodeToHtml`, `HtmlDocument` page APIs.
  - External: `https://github.com/HamsterNote/HtmlParser/blob/main/src/index.ts` - source-derived API behavior; no direct HTML -> TXT method exists.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `getSupportedTargets('pdf')` includes `html` through adapter map, not a `convertFile()` special case.
  - [ ] `getSupportedTargets('txt')` includes `html`.
  - [ ] `getSupportedTargets('html')` returns exactly `['txt']`.
  - [ ] PDF -> HTML output remains `.html` with `text/html` MIME.
  - [ ] TXT -> HTML output is escaped HTML, not raw unescaped source text in a way that executes markup.
  - [ ] HTML -> TXT output is deterministic visible text joined by newlines.

  **QA Scenarios** (MANDATORY - task incomplete without these):

  ```
  Scenario: Converter supports all requested pairs
    Tool: Bash
    Steps: yarn vitest run src/__tests__/converter.contract.test.ts
    Expected: Tests prove pdf->html, txt->html, html->txt are supported and invalid pairs still reject.
    Evidence: .sisyphus/evidence/task-1-converter-contract.txt

  Scenario: Unsupported conversion still fails cleanly
    Tool: Bash
    Steps: yarn vitest run src/__tests__/converter.contract.test.ts -t unsupported
    Expected: Unsupported source/target combinations return the existing unsupported conversion error, not crashes.
    Evidence: .sisyphus/evidence/task-1-unsupported-error.txt
  ```

  **Commit**: YES | Message: `feat(converter): route html parser conversions through adapters` | Files: `src/lib/converter.ts`, optional converter adapter files under `src/lib/converter/`

- [x] 2. Update UI Source Detection and i18n Labels

  **What to do**: In `src/App.tsx`, add `html` to supported source formats and map `.html` and `.htm` extensions to `html` in `extToFormat()`. Ensure the target dropdown uses existing `getSupportedTargets()` output and shows HTML target labels. Add `formats.targets.html` to `src/i18n/locales/en.json`, `src/i18n/locales/zh-CN.json`, and `src/i18n/locales/zh-TW.json` with labels matching existing locale tone: English `HTML`, Simplified Chinese `HTML`, Traditional Chinese `HTML`.
  **Must NOT do**: Do not redesign the upload/dropdown UI; do not add preview or editor UI.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: small UI/i18n updates.
  - Skills: [] - No specialized skill needed.
  - Omitted: [`frontend-ui-ux`] - No new interaction design.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: Task 5, Task 6 | Blocked By: none

  **References**:
  - Pattern: `src/App.tsx:38-59` - `SUPPORTED_FORMATS` and `extToFormat()`.
  - Pattern: `src/App.tsx:143-168` - file items derive source/target during upload.
  - Pattern: `src/App.tsx:249-301` - conversion flow consumes source/target.
  - Pattern: `src/i18n/locales/en.json:17-23` - target labels; mirror in `zh-CN.json` and `zh-TW.json`.

  **Acceptance Criteria**:
  - [ ] `.html` upload is accepted as source `html`.
  - [ ] `.htm` upload is accepted as source `html`.
  - [ ] HTML appears as a target label where applicable in all three languages.
  - [ ] No new UI elements are introduced.

  **QA Scenarios**:

  ```
  Scenario: HTML file is accepted in UI
    Tool: Playwright
    Steps: Open app, upload fixture named sample.html through the existing file input/dropzone, inspect row target dropdown.
    Expected: File row is accepted, not marked unsupported; target dropdown offers TXT.
    Evidence: .sisyphus/evidence/task-2-html-source-ui.png

  Scenario: HTM extension is accepted
    Tool: Playwright
    Steps: Upload fixture named sample.htm through the existing file input/dropzone.
    Expected: File row is accepted as HTML source with TXT as available target.
    Evidence: .sisyphus/evidence/task-2-htm-source-ui.png
  ```

  **Commit**: YES | Message: `feat(ui): expose html conversion targets` | Files: `src/App.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/zh-CN.json`, `src/i18n/locales/zh-TW.json`

- [x] 3. Extend Test Mocks and Fixtures for HTML Parser Paths

  **What to do**: Update `src/test/mocks/html-parser.ts` so mocked `HtmlParser.encode()`, `decode()`, and `decodeToHtml()` can support PDF -> HTML, TXT -> HTML, and HTML -> TXT tests with deterministic output. Add `src/test/fixtures/sample.html` containing visible text, nested tags, and HTML-sensitive content like `<script>` as escaped text expectations. Extend `src/test/fixtures.ts` with `loadHtmlFixture()` following `loadPdfFixture()` style if file fixtures are used by tests. Add TXT fixture helper only if existing tests cannot create File objects inline.
  **Must NOT do**: Do not make mocks more permissive than real API shape; do not hide conversion bugs by returning success for every input without assertions.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: test support files only.
  - Skills: [] - No specialized skill needed.
  - Omitted: [`librarian`] - Package API research already completed.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: Task 4, Task 5 | Blocked By: none

  **References**:
  - Pattern: `src/test/mocks/*.ts` - existing parser mock conventions.
  - Pattern: `src/test/fixtures.ts` - fixture loader pattern.
  - Pattern: `src/test/fixtures/sample.pdf` - binary fixture location.
  - Pattern: `src/test/normalizeHtml.ts` - stable HTML comparison helper.

  **Acceptance Criteria**:
  - [ ] Tests can construct deterministic mock HTML parser outputs.
  - [ ] `loadHtmlFixture()` returns a browser-compatible `File` or fixture data consistent with existing fixture helpers.
  - [ ] Fixtures include nested visible text and HTML-sensitive characters.

  **QA Scenarios**:

  ```
  Scenario: Mock parser supports HTML encode and decode paths
    Tool: Bash
    Steps: yarn vitest run src/__tests__/converter.contract.test.ts
    Expected: Tests importing mocked @hamster-note/html-parser pass without module/type errors.
    Evidence: .sisyphus/evidence/task-3-html-mock-contract.txt

  Scenario: HTML fixture loads deterministically
    Tool: Bash
    Steps: yarn vitest run src/__tests__/convert.integration.test.ts
    Expected: Integration tests can load sample.html without path, MIME, or encoding errors.
    Evidence: .sisyphus/evidence/task-3-html-fixture.txt
  ```

  **Commit**: YES | Message: `test(converter): add html parser fixtures and mocks` | Files: `src/test/mocks/html-parser.ts`, `src/test/fixtures.ts`, `src/test/fixtures/sample.html`

- [x] 4. Add Unit and Integration Coverage for Requested Conversions

  **What to do**: Extend `src/__tests__/converter.contract.test.ts` to verify supported targets for `pdf`, `txt`, and `html`, including `html -> txt` and invalid pairs. Add or extend adapter tests: TXT -> HTML should verify escaping and line preservation; HTML -> TXT should verify visible text extraction order and whitespace normalization. Extend `src/__tests__/convert.integration.test.ts` to cover PDF -> HTML via adapter route and HTML -> TXT using `sample.html`. Use `normalizeHtml()` for HTML output comparisons where useful.
  **Must NOT do**: Do not rely only on snapshots for behavioral assertions; include explicit MIME, filename extension, and content assertions.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: tests follow existing patterns.
  - Skills: [] - No specialized skill needed.
  - Omitted: [`playwright`] - This task is Vitest only.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: Task 6 | Blocked By: Task 1, Task 3

  **References**:
  - Test: `src/__tests__/converter.contract.test.ts` - routing and supported target tests.
  - Test: `src/__tests__/converter.txt-adapter.test.ts` - TXT adapter test style.
  - Test: `src/__tests__/convert.integration.test.ts` - integration tests with real fixtures and parser mocks.
  - Test helper: `src/test/normalizeHtml.ts` - stable HTML assertions.

  **Acceptance Criteria**:
  - [ ] `yarn vitest run src/__tests__/converter.contract.test.ts src/__tests__/converter.txt-adapter.test.ts src/__tests__/convert.integration.test.ts` passes.
  - [ ] Tests assert target support for `pdf -> html`, `txt -> html`, `html -> txt`.
  - [ ] Tests assert HTML-sensitive TXT input does not become executable raw markup in HTML output.
  - [ ] Tests assert HTML -> TXT excludes tags and preserves visible text order.

  **QA Scenarios**:

  ```
  Scenario: Unit/integration happy paths pass
    Tool: Bash
    Steps: yarn vitest run src/__tests__/converter.contract.test.ts src/__tests__/converter.txt-adapter.test.ts src/__tests__/convert.integration.test.ts
    Expected: All targeted Vitest suites pass.
    Evidence: .sisyphus/evidence/task-4-vitest-happy.txt

  Scenario: HTML-sensitive input is safe in TXT -> HTML
    Tool: Bash
    Steps: yarn vitest run src/__tests__/converter.txt-adapter.test.ts -t "html"
    Expected: Output contains escaped text or parser-safe HTML; no raw executable `<script>` from source TXT.
    Evidence: .sisyphus/evidence/task-4-html-escaping.txt
  ```

  **Commit**: YES | Message: `test(converter): cover html parser conversion paths` | Files: `src/__tests__/converter.contract.test.ts`, `src/__tests__/converter.txt-adapter.test.ts`, `src/__tests__/convert.integration.test.ts`, optional new `src/__tests__/converter.html-adapter.test.ts`

- [x] 5. Add Playwright E2E Coverage for HTML Parser Workflows

  **What to do**: Extend `e2e/app.spec.ts` with UI-level scenarios for PDF -> HTML, TXT -> HTML, and HTML -> TXT. Use existing selectors/patterns in that file. Create files in test runtime or use fixtures as existing tests do. Validate file row success status and download extension/MIME where Playwright download APIs are already used; otherwise validate generated filename/extension from UI state and conversion status.
  **Must NOT do**: Do not require human download inspection; do not add flaky timing waits outside existing Playwright patterns.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` - Reason: browser E2E extension using existing app tests.
  - Skills: [] - Use existing Playwright setup; no separate browser skill required in executor unless needed.
  - Omitted: [`frontend-ui-ux`] - No new UI design.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: Task 6 | Blocked By: Task 1, Task 2, Task 3

  **References**:
  - Test: `e2e/app.spec.ts` - existing 20 UI scenarios and selectors.
  - Config: `playwright.config.ts` - chromium project and dev server setup.
  - UI: `src/App.tsx:249-301` - conversion status flow.

  **Acceptance Criteria**:
  - [ ] `yarn playwright test e2e/app.spec.ts --project=chromium` passes.
  - [ ] E2E verifies PDF -> HTML conversion reaches success.
  - [ ] E2E verifies TXT -> HTML conversion reaches success and produces `.html` output.
  - [ ] E2E verifies HTML -> TXT conversion reaches success and produces `.txt` output.

  **QA Scenarios**:

  ```
  Scenario: UI converts TXT to HTML
    Tool: Playwright
    Steps: Open app, upload a .txt file containing two lines and HTML-sensitive text, choose HTML target, click convert.
    Expected: Row reaches success/done state and produced download/output name ends with .html.
    Evidence: .sisyphus/evidence/task-5-txt-to-html-ui.png

  Scenario: UI converts HTML to TXT
    Tool: Playwright
    Steps: Open app, upload sample.html, choose TXT target, click convert.
    Expected: Row reaches success/done state and produced download/output name ends with .txt.
    Evidence: .sisyphus/evidence/task-5-html-to-txt-ui.png
  ```

  **Commit**: YES | Message: `test(e2e): verify html parser conversion workflows` | Files: `e2e/app.spec.ts`, optional E2E fixture files

- [x] 6. Run Full Validation and Regression Hardening

  **What to do**: Run targeted Vitest suites, full Vitest if practical, Playwright chromium suite, lint, and production build. Fix any type, lint, test, or build failures caused by the integration. Confirm no `dangerouslySetInnerHTML` or equivalent HTML injection was introduced. Capture command outputs as evidence.
  **Must NOT do**: Do not skip failing tests; do not weaken assertions to make tests pass; do not use `--no-verify` or disable lint rules.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` - Reason: command validation and small fixes only.
  - Skills: [] - No specialized skill needed.
  - Omitted: [`git-master`] - Commit handling is already per-task; no history operation required.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: Final Verification Wave | Blocked By: Tasks 1-5

  **References**:
  - Config: `vitest.config.ts` - jsdom aliases and parser mocks.
  - Config: `playwright.config.ts` - chromium/webServer.
  - Manifest: `package.json` - scripts and parser dependencies.
  - Project convention: `AGENTS.md` - TypeScript no `any`, yarn commands, lint/build expectations.

  **Acceptance Criteria**:
  - [ ] `yarn vitest run src/__tests__/converter.contract.test.ts src/__tests__/converter.txt-adapter.test.ts src/__tests__/convert.integration.test.ts` passes.
  - [ ] `yarn test:run` passes or any unrelated pre-existing failure is documented with evidence.
  - [ ] `yarn playwright test e2e/app.spec.ts --project=chromium` passes.
  - [ ] `yarn lint && yarn build` passes.
  - [ ] Search confirms no new `dangerouslySetInnerHTML` usage.

  **QA Scenarios**:

  ```
  Scenario: Full validation commands succeed
    Tool: Bash
    Steps: yarn vitest run src/__tests__/converter.contract.test.ts src/__tests__/converter.txt-adapter.test.ts src/__tests__/convert.integration.test.ts && yarn playwright test e2e/app.spec.ts --project=chromium && yarn lint && yarn build
    Expected: All commands exit 0.
    Evidence: .sisyphus/evidence/task-6-validation.txt

  Scenario: No HTML DOM injection introduced
    Tool: Bash
    Steps: Search source for dangerouslySetInnerHTML and direct converted HTML injection patterns.
    Expected: No new unsafe render path exists; converted HTML remains download/output blob only.
    Evidence: .sisyphus/evidence/task-6-xss-guardrail.txt
  ```

  **Commit**: YES | Message: `chore: validate html parser integration` | Files: only files needed to fix validation failures, or no commit if no changes

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.

- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [x] F4. Scope Fidelity Check — deep

## Commit Strategy

- Prefer one commit per completed task when files are meaningfully changed.
- Use conventional messages listed per task.
- Do not commit generated evidence unless project convention requires it.
- Do not push unless explicitly requested by the user.

## Success Criteria

- Users can upload PDF and choose/produce HTML through the same UI flow.
- Users can upload TXT and choose/produce HTML through the same UI flow.
- Users can upload HTML/HTM and choose/produce TXT through the same UI flow.
- Converter routing is adapter-map based with no PDF -> HTML special-case in `convertFile()`.
- All required Vitest, Playwright, lint, and build commands pass.
