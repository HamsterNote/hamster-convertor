# Proposal: Document Converter Feature Enhancements

## Why

The Hamster Document Converter project needed several key enhancements to improve user experience and extend conversion capabilities:

1. **HTML Parser Integration**: The existing converter architecture lacked support for HTML source files and HTML-related conversions (PDF→HTML, TXT→HTML, HTML→TXT). Users needed these capabilities for document interoperability.

2. **UI Loading States**: Conversion and download operations lacked visual feedback, leaving users uncertain about operation progress. Full-screen loading overlays were needed for better UX during long-running operations.

3. **PDF Page Selection**: When converting PDF to images, users needed granular control over which pages to include, rather than converting all pages by default.

4. **File Conversion Interactions**: Completed rows allowed target changes, which could confuse users. Additionally, per-file OCR configuration was needed for PDF→PDF conversions with scanned documents.

5. **Concrete Image Formats**: The generic "image" target was replaced with specific formats (PNG, JPG, WEBP) to give users precise control over output formats and enable image-to-image conversion.

## What Changes

### 1. HTML Parser Support (`add-html-parser`)

- Integrated `@hamster-note/html-parser` into the converter adapter architecture
- Added `html` as a supported `SourceFormat`
- Implemented PDF→HTML, TXT→HTML, and HTML→TXT conversion paths
- Refactored existing PDF→HTML special-case into the unified adapter map
- Added UI support for `.html` and `.htm` file uploads
- Added i18n labels for HTML target format across all locales (zh-CN, zh-TW, en)

### 2. Conversion UI Optimizations (`conversion-ui-optimizations`)

- Created reusable `FullscreenLoading` component with accessibility support
- Implemented PDF page selector modal with thumbnail previews
- Added pre-conversion PDF page selection for PDF→image conversions
- Added row deletion capability for all rows (disabled during busy states)
- Added global download loading overlay for both row and global downloads
- Integrated page selection state into conversion options

### 3. File Conversion Interactions (`optimize-file-conversion-interactions`)

- Disabled target selection for completed (`done`) rows
- Added per-row OCR checkbox for PDF target files
- Implemented PDF→PDF conversion path with optional OCR text embedding
- Used `@hamster-note/image-parser` for OCR text recognition
- Added duplicate same-name re-upload support (creates independent rows)
- Extended `ConversionOptions` with `{ pdf: { ocr: boolean } }`

### 4. PDF Image Format Conversion (`pdf-image-format-conversion`)

- Replaced generic `image` target with concrete `png`, `jpg`, `webp` targets
- Implemented PDF→PNG/JPG/WEBP conversion with page selection support
- Implemented raster image→PNG/JPG/WEBP conversion (excluding SVG/GIF)
- Added shared canvas image encoding utilities with proper MIME type handling
- Added white background for JPG encoding to handle transparency
- Optimized PDF page selector modal with skeleton-first lazy rendering
- Added IntersectionObserver-based lazy thumbnail loading

## Capabilities

- [x] Upload and convert `.html`/`.htm` files to TXT
- [x] Convert PDF files to HTML format
- [x] Convert TXT files to HTML format
- [x] Full-screen loading overlay during conversion and download operations
- [x] PDF page selection modal with multi-select, select all, deselect all
- [x] Per-row page count summary for PDF→image conversions
- [x] Row deletion for completed and pending files
- [x] Locked target selection for completed conversions
- [x] Per-row OCR checkbox for PDF→PDF conversions
- [x] OCR text layer embedding in output PDF using invisible white text
- [x] Duplicate same-name file uploads create independent rows
- [x] Concrete image format targets: PNG, JPG, WEBP
- [x] PDF→PNG/JPG/WEBP conversion with selected pages
- [x] Raster image→PNG/JPG/WEBP conversion
- [x] Lazy thumbnail rendering in PDF page selector
- [x] Skeleton-first modal loading for better perceived performance

## Impact

### Affected Components

- `src/App.tsx` - Main UI logic, file list, conversion flow, state management
- `src/lib/converter.ts` - Conversion routing, types, adapter registration
- `src/lib/converter/pdf-adapters.ts` - PDF conversion adapters
- `src/lib/converter/txt-adapter.ts` - TXT conversion adapters
- `src/lib/converter/image-adapters.ts` - Image conversion adapters
- `src/components/FullscreenLoading.tsx` - Loading overlay component
- `src/components/PdfPageSelectorModal.tsx` - PDF page selection modal
- `src/i18n/locales/*.json` - Translation files for all new UI labels
- `src/styles/global.css` - Component styles for modal, loading, row actions

### Test Coverage

- Vitest unit tests for converter contracts, adapters, and integration
- React Testing Library tests for App component behavior
- Playwright E2E tests for full user workflows (written, environment-limited execution)
- 77+ unit tests passing across 11 test files
- Zero lint warnings (ESLint with `--max-warnings=0`)

### Architecture Changes

- Extended `SourceFormat` from `'pdf' | 'txt' | 'image'` to include `'html'`
- Extended `TargetFormat` to include concrete image formats
- Added `ConversionOptions` type with `selectedImagePages` and `ocr` fields
- Refactored adapter map from special-case routing to unified dispatch
- Added shared `encodeCanvasToImage` utility for image encoding

## Success Criteria

- Users can upload HTML/HTM files and convert them to TXT
- Users can convert PDF and TXT files to HTML
- Converter routing is adapter-map based with no special-cases
- Full-screen loading overlays appear during conversion and download
- PDF→image rows show page selector with working select/deselect
- Completed rows cannot change target format
- PDF→PDF conversion supports optional OCR text layer
- Duplicate file uploads create independent rows
- Concrete image format targets (PNG/JPG/WEBP) are available and working
- PDF page selector uses lazy loading with skeleton shells
- All Vitest tests pass
- `yarn lint && yarn build` passes with zero warnings
