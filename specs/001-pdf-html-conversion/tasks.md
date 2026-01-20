# Tasks: PDF 转 HTML 转换

**Input**: Design documents from `/specs/001-pdf-html-conversion/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: The examples below include test tasks. Tests are OPTIONAL - only include them if explicitly requested in the feature specification. If the constitution mandates tests or a waiver for behavior changes, include a test task or waiver task accordingly.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Validate current dependencies and add @system-ui-js/pdf-parser + @system-ui-js/html-parser in package.json
- [x] T002 [P] Confirm i18n keys for new status/error strings in src/i18n/locales/zh-CN.json
- [x] T003 [P] Confirm i18n keys for new status/error strings in src/i18n/locales/zh-TW.json
- [x] T004 [P] Confirm i18n keys for new status/error strings in src/i18n/locales/en.json

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Implement pdf → html adapter in src/lib/converter.ts
- [x] T006 [P] Add conversion result type extensions (warnings/error) in src/lib/converter.ts
- [x] T007 Add conversion state storage for HTML outputs in src/App.tsx
- [x] T008 Add download packaging utility in src/lib/download.ts
- [x] T009 [P] Wire download archive builder in src/lib/download.ts

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - 一键完成 PDF 转 HTML (Priority: P1) 🎯 MVP

**Goal**: Upload PDFs, run “Convert All”, and download HTML outputs in a single archive.

**Independent Test**: Upload a PDF, run conversion, and download a valid HTML archive.

### Tests for User Story 1 (OPTIONAL - required by constitution or explicit request)

- [ ] T010 [P] [US1] Integration test for convertPdfToHtml in src/__tests__/convert.integration.test.ts

### Implementation for User Story 1

- [x] T011 [P] [US1] Update convertAll flow to call converter in src/App.tsx
- [x] T012 [US1] Persist per-file conversion outputs in src/App.tsx
- [x] T013 [US1] Enable download button to trigger archive download in src/App.tsx
- [x] T014 [US1] Surface conversion warnings in UI strings via src/i18n/locales/zh-CN.json
- [x] T015 [US1] Surface conversion warnings in UI strings via src/i18n/locales/zh-TW.json
- [x] T016 [US1] Surface conversion warnings in UI strings via src/i18n/locales/en.json

**Checkpoint**: User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - 转换过程可感知 (Priority: P2)

**Goal**: Show clear conversion status transitions for each file during processing.

**Independent Test**: Start conversion and observe status transitions queued → converting → done/failed.

### Tests for User Story 2 (OPTIONAL - required by constitution or explicit request)

- [ ] T017 [P] [US2] Integration test for status transitions in src/__tests__/convert.integration.test.ts

### Implementation for User Story 2

- [x] T018 [US2] Ensure status lifecycle updates are consistent in src/App.tsx
- [x] T019 [US2] Add error messaging for non-PDF files in src/i18n/locales/zh-CN.json
- [x] T020 [US2] Add error messaging for non-PDF files in src/i18n/locales/zh-TW.json
- [x] T021 [US2] Add error messaging for non-PDF files in src/i18n/locales/en.json

**Checkpoint**: User Story 2 should be fully functional and testable independently

---

## Phase 5: User Story 3 - 转换失败可恢复 (Priority: P3)

**Goal**: Allow retrying failed conversions while keeping successful results intact.

**Independent Test**: Simulate a failure, re-run “Convert All”, and confirm only failed items re-enter conversion.

### Tests for User Story 3 (OPTIONAL - required by constitution or explicit request)

- [ ] T022 [P] [US3] Integration test for retry behavior in src/__tests__/convert.integration.test.ts

### Implementation for User Story 3

- [x] T023 [US3] Update retry logic to enqueue failed items only in src/App.tsx

**Checkpoint**: User Story 3 should be fully functional and testable independently

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T024 [P] Run quickstart.md validation steps in specs/001-pdf-html-conversion/quickstart.md
- [x] T025 Performance check for conversion loop and UI responsiveness in src/App.tsx

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - May integrate with US1 but should be independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - May integrate with US1/US2 but should be independently testable

### Parallel Opportunities

- Phase 1 tasks T002-T004 can run in parallel (different locale files)
- Phase 2 tasks T006 and T009 can run in parallel (converter types vs download utility)
- User Story 1 tasks T014-T016 can run in parallel (locale updates)
- User Story 2 tasks T019-T021 can run in parallel (locale updates)
- Tests T010, T017, T022 can run in parallel with other non-conflicting changes

---

## Parallel Example: User Story 1

```bash
Task: "[US1] Update convertAll flow to call converter in src/App.tsx"
Task: "[US1] Surface conversion warnings in UI strings via src/i18n/locales/zh-CN.json"
Task: "[US1] Surface conversion warnings in UI strings via src/i18n/locales/zh-TW.json"
Task: "[US1] Surface conversion warnings in UI strings via src/i18n/locales/en.json"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. Stop and validate User Story 1 independently

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deliver MVP
3. Add User Story 2 → Test independently → Deliver
4. Add User Story 3 → Test independently → Deliver
5. Each story adds value without breaking previous stories
