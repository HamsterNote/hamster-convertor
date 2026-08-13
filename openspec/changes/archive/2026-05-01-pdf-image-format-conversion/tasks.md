# Tasks

## Plan: pdf-image-format-conversion

### Implementation Tasks

- [x] 1. Replace Generic Image Target With Concrete Image Targets
  - Update shared conversion types and routing so `TargetFormat` includes `png`, `jpg`, and `webp`
  - Update `src/lib/converter.ts` supported targets
  - Update E2E fake conversion results

- [x] 2. Add Shared Canvas Image Encoding Utilities
  - Create typed helper for encoding canvas to PNG/JPG/WEBP
  - Map target to `{ extension, mimeType, quality? }`
  - Handle JPG white background
  - Add unit tests

- [x] 3. Generalize PDF to PNG/JPG/WEBP Conversion
  - Update `convertPdfToImage` to determine output format from `request.target`
  - Render only selected pages
  - Filenames: `${baseName}-page-001.${extension}`

- [x] 4. Rework PDF Page Selector Modal to Skeleton-First Lazy Rendering
  - Add modal-level loading state
  - Create page shell entries with thumbnail status
  - Use IntersectionObserver for lazy thumbnail rendering
  - Select all/deselect all must use full shell list
  - Revoke blob URLs and disconnect observers on close/unmount

- [x] 5. Add Raster Image to PNG/JPG/WEBP Conversion Adapter
  - Extend `src/lib/converter/image-adapters.ts`
  - Load raster input into `HTMLImageElement`, draw to canvas
  - Reject SVG/GIF image互转 requests
  - Add unit tests

- [x] 6. Wire App UI, i18n, and Per-File Target Filtering
  - Update `src/App.tsx` target dropdown
  - Show PDF page selector for PDF + png/jpg/webp targets
  - Filter GIF/SVG image互转 options
  - Update en/zh-CN/zh-TW labels

- [x] 7. Update Unit and E2E Test Coverage
  - Extend PDF adapter tests for concrete targets
  - Extend image adapter tests for new conversion
  - Extend app tests for modal visibility and target filtering
  - Update E2E tests for concrete targets

- [x] 8. Run Final Local Validation and Capture Evidence
  - Run `yarn lint`
  - Run `yarn test:run`
  - Run `yarn test:e2e`
  - Run `yarn build`
  - Capture evidence in `.sisyphus/evidence/`

### Final Verification Wave

- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high (+ playwright)
- [x] F4. Scope Fidelity Check — deep
