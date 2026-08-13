# Design: Document Converter Feature Enhancements

## Context

### Project Background

The Hamster Document Converter is a Vite + React + TypeScript frontend for document format conversion. It uses `@system-ui-js/development-base` for shared configuration and supports i18next with three languages (zh-CN, zh-TW, en) plus light/dark theme modes.

### Technical Stack

- **Build Tool**: Vite (dev port 5073)
- **Framework**: React 18 + TypeScript
- **Testing**: Vitest + React Testing Library (unit), Playwright (E2E)
- **Styling**: CSS variables in `theme.css`, BEM-style classes in `global.css`
- **State**: Local React state (no Redux/Zustand)
- **Modules**: ESM (`"type": "module"`)
- **TypeScript**: No `any`, use `type` not `interface`
- **Path Alias**: `@/*` → `./src/*`

### Existing Architecture

The converter uses a dispatcher pattern:

1. `convertFile()` receives `ConversionRequest` with source, target, file, options
2. Looks up adapter in `adapters[source][target]` map
3. Adapter performs actual conversion and returns `ConversionResult[]`
4. E2E mode (`window.__E2E__ = true`) uses fake results for testing

## Goals / Non-Goals

### Goals

- Extend converter to support HTML source format and HTML-related conversions
- Add visual loading feedback for all long-running operations
- Provide granular PDF page control for image output conversions
- Lock completed row targets to prevent accidental changes
- Add per-row OCR configuration for PDF→PDF conversions
- Replace generic image target with concrete format targets (PNG, JPG, WEBP)
- Optimize PDF page selector with skeleton-first lazy rendering
- Maintain zero lint warnings and comprehensive test coverage

### Non-Goals

- Do NOT add preview, editor, sanitizer UI
- Do NOT add server APIs or batch ZIP functionality
- Do NOT add markdown, DOCX, or EPUB formats
- Do NOT implement BMP output (canvas unreliable for `image/bmp`)
- Do NOT support SVG/GIF image-to-image conversion
- Do NOT add global OCR settings or language selection
- Do NOT introduce Redux/Zustand or new state libraries
- Do NOT render converted HTML in DOM (no `dangerouslySetInnerHTML`)

## Decisions

### Decision 1: HTML Parser Integration via Adapter Map

**Decision**: Move PDF→HTML from `convertFile()` special-case into `adapters.pdf.html` adapter behavior.

**Rationale**:

- Unified routing makes the converter more maintainable
- All conversions follow the same adapter lookup pattern
- Easier to test and extend

**Alternatives Considered**:

- Keep special-case in `convertFile()`: Rejected because it creates inconsistency in the routing model
- Create separate HTML conversion pipeline: Rejected because it duplicates existing infrastructure

**Not Chosen Because**:

- Special-case approach was the original implementation but created technical debt
- Separate pipeline would require duplicating error handling, progress tracking, and result formatting

### Decision 2: E2E Fake Results with Source-Aware Branching

**Decision**: Branch `createE2EResult()` on both `source` and `target` for HTML workflows.

**Rationale**:

- HTML-target downloads need to preserve uploaded filename extensions
- Different source formats need different fake output behaviors
- Source-aware branching keeps test assertions deterministic

**Alternatives Considered**:

- Single generic fake result: Rejected because it wouldn't allow filename extension assertions
- Real parser calls in E2E: Rejected because it adds latency and potential flakiness

### Decision 3: OCR Text Layer as Invisible White Text

**Decision**: Use `doc.setTextColor(255,255,255)` + `doc.setFontSize(1)` + `doc.text(text, 16, 16)` as MVP OCR text placement.

**Rationale**:

- jsPDF opacity APIs are unreliable across versions
- White text on white/light background is effectively invisible but selectable
- Simple placement avoids complex coordinate reconstruction

**Alternatives Considered**:

- Precise coordinate reconstruction from image parser: Rejected as too complex for MVP
- Visible text overlay: Rejected because it would obscure the original page image
- Server-side OCR with coordinate mapping: Rejected because it requires backend infrastructure

### Decision 4: Skeleton-First Lazy Rendering for PDF Modal

**Decision**: Create page shell entries immediately when `numPages` is known, then use IntersectionObserver for lazy thumbnail rendering.

**Rationale**:

- Users can select/deselect pages before thumbnails load
- Reduces perceived loading time
- All pages are selectable from the start

**Alternatives Considered**:

- Eager thumbnail loading: Rejected because it blocks modal interaction for large PDFs
- `<img loading="lazy">` only: Rejected because actual `pdfDocument.getPage()`/render must be lazy, not just image loading

### Decision 5: Concrete Image Targets Instead of Generic "image"

**Decision**: Replace user-facing `image` target with `png`, `jpg`, `webp` targets.

**Rationale**:

- Users get precise format control
- Enables image-to-image conversion
- Matches common user expectations for format conversion tools

**Alternatives Considered**:

- Keep generic "image" + secondary format selector: Rejected because it adds UI complexity
- Add all formats including BMP: Rejected because canvas doesn't reliably encode `image/bmp`

## Risks / Trade-offs

### Risk 1: Playwright E2E Environment Limitation

**Description**: Playwright Chromium cannot be installed on `ubuntu26.04-x64` platform.

**Impact**: E2E tests are written and syntactically correct but cannot be executed in this environment.

**Mitigation**:

- E2E test code is reviewed manually for correctness
- Unit tests provide comprehensive coverage
- CI/CD pipeline on supported OS can run E2E tests

**Status**: Documented in evidence files; all unit tests pass (77/77).

### Risk 2: Blob URL Leaks in PDF Page Selector

**Description**: In-flight thumbnail renders can finish after modal close, leaving unreclaimed blob URLs.

**Impact**: Memory leak in long-running sessions with many PDF modal interactions.

**Mitigation**:

- Added `isMountedRef` checks in IntersectionObserver callback
- Revoke blob URLs if component unmounts during `renderPageThumbnail`
- Disconnect observers and revoke URLs on modal close/unmount

**Status**: Fixed in post-review updates (2026-05-01).

### Risk 3: TypeScript Build Errors from Refactoring

**Description**: Changing `TargetFormat` from including `'image'` to concrete formats breaks existing comparisons like `target !== 'image'`.

**Impact**: TypeScript compilation errors and potential runtime bugs.

**Mitigation**:

- Updated all target comparisons across codebase
- Added runtime validation in adapters to reject unsupported targets
- Fixed getContext mock cast in tests

**Status**: Fixed; `yarn lint` and `yarn build` pass.

### Risk 4: Modal Focus Management and Accessibility

**Description**: `PdfPageSelectorModal` lacks focus trap and Escape/backdrop close keyboard support.

**Impact**: Accessibility concerns for keyboard users.

**Mitigation**:

- Modal has `role="dialog"` and `aria-modal="true"`
- Keyboard-accessible buttons
- Pre-existing issue noted as out of scope for this work

**Status**: Pre-existing limitation; no functional blocker.

### Risk 5: Empty OCR Results

**Description**: OCR on pages with no recognizable text produces empty results.

**Impact**: Conversion fails with `EMPTY_OCR` error code.

**Mitigation**:

- Throw `EmptyOcrError` with code `EMPTY_OCR`
- UI maps to `errors.emptyOcr` localized message
- User can uncheck OCR to get plain PDF copy

**Status**: Implemented and tested.

## Migration Plan

### No Breaking Changes

All changes are additive or backward-compatible:

- HTML source support is new functionality
- Loading overlays are new UI components
- PDF page selection is an optional enhancement
- Target locking only affects `done` rows (previously editable)
- OCR checkbox defaults to unchecked
- Concrete image targets replace generic target without removing functionality

### Deployment Considerations

1. Ensure `@hamster-note/html-parser` is installed in production
2. Verify i18n locale files are bundled correctly
3. Confirm PDF.js worker URL is accessible in production build
4. Test lazy loading behavior on slower devices

## Testing Strategy

### Unit Tests (Vitest)

- Converter contract tests: routing, supported targets, error handling
- Adapter tests: PDF, TXT, image adapter behaviors
- Integration tests: end-to-end conversion with mocks
- App component tests: upload, conversion, state management

### E2E Tests (Playwright)

- Full user workflows: upload → convert → download
- Language switching and i18n verification
- PDF page selection flow
- Loading overlay visibility
- Row deletion behavior

### QA Evidence

- Command outputs saved as `.txt` evidence files
- Screenshot evidence for UI behavior (where environment supports)
- Lint and build verification with zero warnings
