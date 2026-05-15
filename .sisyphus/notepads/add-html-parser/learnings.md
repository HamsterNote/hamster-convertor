# Learnings and Conventions

## 2026-05-01: Initial Codebase Analysis

### Project Structure

- Vite + React + TypeScript converter frontend
- Uses @hamster-note/html-parser, @hamster-note/pdf-parser, @hamster-note/txt-parser, @hamster-note/image-parser
- ESM modules, type aliases preferred over interfaces
- Dev port 5073

### Key Files

- `src/lib/converter.ts` - Main dispatcher, adapter map, `convertFile()`
- `src/lib/converter/pdf-adapters.ts` - PDF adapter implementations
- `src/lib/converter/txt-adapter.ts` - TXT adapter implementations
- `src/lib/converter/image-adapters.ts` - Image adapter implementations
- `src/App.tsx` - UI, file upload, target selection, conversion flow
- `src/types/html-parser.d.ts` - HtmlParser type definitions
- `src/test/mocks/html-parser.ts` - Mock HtmlParser for tests
- `src/test/fixtures.ts` - Fixture loader utilities

### Current State

- SourceFormat = 'pdf' | 'txt' | 'image' (missing 'html')
- TargetFormat = 'html' | 'txt' | 'png' | 'jpg' | 'webp' | 'pdf'
- PDF -> HTML is special-cased in convertFile() (not in adapter map)
- Adapter map has pdf: {txt, png, jpg, webp, pdf}, txt: {png}, image: {pdf, txt, png, jpg, webp}
- No html source support in UI (SUPPORTED_FORMATS, extToFormat)
- No i18n labels for html target

### HtmlParser API (from types/html-parser.d.ts)

- `HtmlParser.encode(fileOrBuffer: File | ArrayBuffer): Promise<HtmlDocument>`
- `HtmlParser.decodeToHtml(intermediateDocument: IntermediateDocument): Promise<string>`
- `HtmlParser.decode(intermediateDocument: IntermediateDocument): Promise<File | ArrayBuffer>`
- HtmlDocument has `getPages(): Promise<HtmlPage[]>`, `getPage(n)`, `getPureText(): string`

### Test Patterns

- Vitest with vi.mock() for module mocking
- Existing mocks in src/test/mocks/
- Fixtures loaded from src/test/fixtures/ via loadPdfFixture()
- normalizeHtml.ts uses cheerio for stable HTML comparison
- E2E tests in e2e/app.spec.ts with Playwright
- E2E mode activated by window.**E2E** = true

### Conversion Flow

1. User uploads file -> extToFormat() determines source format
2. FileItem created with source, default target (first supported)
3. User can change target via dropdown
4. convertAll() calls convertFile() for each item
5. convertFile() checks adapters[source][target] and calls adapter
6. Results displayed, download available

### Guardrails from Plan

- Do NOT render converted HTML in DOM (no dangerouslySetInnerHTML)
- Do NOT add preview/editor/sanitizer UI
- Preserve existing PDF->HTML output semantics when moving to adapter
- HTML -> TXT extracts visible text only (no metadata, alt-text, stylesheets)
- TXT -> HTML escapes HTML-sensitive characters

### 2026-05-01: E2E Mock Behavior

- `createE2EResult()` must branch on both `source` and `target` for HTML workflows.
- TXT -> HTML and HTML -> TXT need source-aware fake filenames so download assertions can check extensions.
- `e2e/app.spec.ts` should assert target-option lists that match `getSupportedTargets()` rather than hardcoded legacy expectations.
