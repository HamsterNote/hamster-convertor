# PDF Image Format Conversion and Lazy Page Modal

## Why

### Original Request

- "PDF -> 图片，PDF 页面选择模态框优化一下，进入模态框首先 Loading 一下，加载出所有页面元素的外壳，先不加载页面实际内容，然后页面元素上显示 Loading 等待加载完成，然后使用懒加载，加载可视区域的 Page，因为 Page 都是已经预加载了外壳，所以不影响全选和全不选功能"
- "PDF -> 图片改成 各种图片后缀 而不是叫'图片'，先利用原来转 png 的能力，把 png 转为 jpg、webp、bmp"
- "基于上面的能力，扩展出 图片互转能力"

### Interview Summary

- UI decision: replace generic `image` target with concrete image targets.
- Supported output targets this iteration: `png`, `jpg`, `webp`.
- BMP decision: explicitly excluded this iteration because canvas does not reliably encode `image/bmp` and user selected "先不支持 BMP".
- Image-to-image special cases: exclude SVG and GIF inputs for image互转.
- Test strategy: tests-after using existing Vitest and Playwright infrastructure.

### Metis Review (gaps addressed)

- Metis invocation timed out without usable output; self-review guardrails are incorporated explicitly.
- Guardrails added: do not add BMP dependency or fake BMP output, do not silently rasterize SVG/GIF in image互转, preserve PDF selected-pages behavior, preserve existing PDF→TXT/PDF and image→PDF/TXT behavior, and make all acceptance criteria agent-executable.

## What Changes

### Core Objective

Deliver a concrete-format image conversion model and a faster PDF page selection modal without requiring human verification or manual decisions during implementation.

### Deliverables

- Converter type/model supports `png`, `jpg`, and `webp` as `TargetFormat` values.
- PDF source supports `txt`, `png`, `jpg`, `webp`, `pdf` targets.
- TXT source continues to support one image output path, and that path must be `png` as the replacement target for existing TXT→image behavior.
- Image source supports `pdf`, `txt`, `png`, `jpg`, `webp` only for raster inputs `png`, `jpg`, `jpeg`, `webp`, `bmp`; `gif` and `svg` files remain uploadable for existing non-image互转 conversions only if existing behavior supports them, but must not expose PNG/JPG/WEBP image互转 choices for them.
- PDF page selector opens with initial loading, then displays all page cards/shells with per-card loading indicators while thumbnails render lazily for visible cards.
- All i18n locales show PNG/JPG/WEBP labels and no generic "图片/Image" target for PDF/image output.

### Definition of Done (verifiable conditions with commands)

- `yarn test:run` passes.
- `yarn test:e2e` passes.
- `yarn lint` passes.
- PDF→PNG/JPG/WEBP conversion produces filenames with matching extensions and MIME types.
- Image→PNG/JPG/WEBP conversion produces filenames with matching extensions and MIME types.
- PDF page selection modal can select/deselect all before all thumbnails finish rendering because all page shells exist.
- No UI option exposes BMP as an output target.
- No UI option exposes SVG/GIF image互转 to PNG/JPG/WEBP.

## Capabilities

- Use existing local React state style in `src/App.tsx`.
- Use existing adapter routing style in `src/lib/converter.ts`.
- Use browser canvas encoding for PNG/JPG/WEBP.
- For JPG output, fill a white background before encoding so transparency does not become black/undefined.
- Keep page selection validation for empty selected pages.
- Clean up object URLs and observers on modal close/unmount.

## Impact

- Replaces generic image target with concrete PNG/JPG/WEBP targets across UI, converter types, and i18n
- Adds raster image→PNG/JPG/WEBP conversion capability
- Optimizes PDF page selector modal with skeleton-first loading and lazy thumbnail rendering
- Updates Vitest and Playwright test coverage for new behaviors
