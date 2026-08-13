# Design: PDF Image Format Conversion and Lazy Page Modal

## Context

### Project Conventions

- TypeScript: no `any`, use `type` not `interface`
- ESM modules
- Path alias: `@/*` → `./src/*`
- Tests: Vitest + Playwright (tests-after strategy)

### Learned During Implementation

- `encodeCanvasToImage` returns `{ blob, extension, mimeType }` - extension already includes the dot (e.g., `.png`, `.jpg`)
- `renderPageToCanvas` returns the canvas synchronously, not a Promise - the render happens when `page.render().promise` resolves
- When refactoring `renderPageToBlob` to `renderPageToCanvas` for OCR path, must wrap the canvas creation and encoding in try/catch since `renderPageToBlob` was async and caught errors differently

## Goals / Non-Goals

### Goals

- Optimize PDF page selection modal with skeleton-first loading and viewport lazy thumbnail rendering
- Replace generic image outputs with concrete PNG/JPG/WEBP conversion targets for PDF and raster image inputs
- Support PDF→PNG/JPG/WEBP conversion preserving selected pages
- Support raster image→PNG/JPG/WEBP conversion, excluding SVG/GIF inputs
- Maintain all existing PDF→TXT/PDF and image→PDF/TXT behavior
- Update i18n labels for all locales
- Add Vitest and Playwright coverage using tests-after strategy

### Non-Goals

- Do not implement BMP output.
- Do not add a second image-format selector beside the existing target selector.
- Do not silently treat `image` as a user-visible target label after migration.
- Do not change OCR semantics.
- Do not change PDF→HTML/TXT/PDF behavior except type compatibility updates.
- Do not add server-side conversion or workers beyond existing pdfjs worker usage.
- Do not leave unrevoked blob URLs or active IntersectionObservers.

## Decisions

### Decision 1: Replace Generic Image Target With Concrete Targets

- **Decision**: Replace the generic `image` target format with concrete `png`, `jpg`, and `webp` targets across the entire conversion pipeline.
- **Reason**: User explicitly requested "PDF -> 图片改成 各种图片后缀 而不是叫'图片'" and to "扩展出 图片互转能力".
- **Alternatives considered**: Keep generic `image` target and add a secondary format selector.
- **Why not chosen**: User explicitly said "不要加第二个下拉框" (do not add a second dropdown).

### Decision 2: Exclude BMP Output

- **Decision**: Explicitly exclude BMP as an output target.
- **Reason**: Canvas does not reliably encode `image/bmp`, and user selected "先不支持 BMP" during interview.
- **Alternatives considered**: Add BMP support via external library or fake BMP header.
- **Why not chosen**: Would add unnecessary complexity and a heavy dependency for a rarely-used format.

### Decision 3: Exclude SVG/GIF from Image互转

- **Decision**: Do not expose PNG/JPG/WEBP conversion options for SVG and GIF inputs.
- **Reason**: SVG is vector-based and GIF is animated; silently rasterizing them would lose information and surprise users.
- **Alternatives considered**: Allow SVG/GIF → PNG/JPG/WEBP with a warning.
- **Why not chosen**: User explicitly excluded them during interview; existing upload behavior for other conversions is preserved.

### Decision 4: Tests-After Strategy

- **Decision**: Implement first, then add/update tests until passing.
- **Reason**: Existing project already has Vitest and Playwright infrastructure.
- **Alternatives considered**: TDD (write tests first).
- **Why not chosen**: Tests-after is more pragmatic for refactoring existing behavior with known test patterns.

## Risks / Trade-offs

### Technical Risks

- **Blob URL leaks**: `src/components/PdfPageSelectorModal.tsx` revokes already-tracked thumbnail blob URLs and disconnects the observer on close, but in-flight thumbnail renders can finish after close because `isMountedRef` remains true while the component is still mounted. Those late renders push new blob URLs and update state after the close cleanup has already run, so blob URLs are not reliably revoked on close.
- **LSP/Biome diagnostics**: Modal component has unnecessary hook dependency and `forEach` callback return in observer setup.

### Quality Risks

- **E2E environment limitation**: Playwright chromium browser not installable on ubuntu26.04-x64 platform, requiring manual review fallback.
- **Mocking complexity**: Mocking `HTMLCanvasElement.prototype.getContext` in tests requires returning a proper mock object with all used methods (fillStyle, fillRect, drawImage) to avoid "fillRect is not a function" errors.

### Resolved Issues

- **Blob URL leak**: Fixed by adding `isMountedRef.current` check in IntersectionObserver callback and revoking URLs if component unmounts during `renderPageThumbnail`. Extracted `renderThumbnailForPage` to reduce cognitive complexity.
- **Unsafe target casts**: Added runtime validation in `convertPdfToImage` and `convertImageToImage` to reject unsupported targets before encoding.
- **Ref mutation during render**: Fixed `isOpenRef.current = open` by moving it into `useEffect`.

## Migration Plan

No migration plan needed - this is a new feature implementation, not a breaking change to existing behavior.
