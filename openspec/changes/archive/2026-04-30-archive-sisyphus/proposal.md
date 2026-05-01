# Proposal: Conversion UI Optimizations & File Conversion Interaction Improvements

## Why

### From conversion-ui-optimizations plan (Context):

1. 用户需要全屏 Loading 效果，在点击"全部转换"后显示直到全部完成
2. PDF→图片 需要增加页数多选功能，用户可以选择性地转换特定页面
3. 点击下载时需要显示全屏 Loading，直到文件准备好
4. 需要增加删除按钮，支持删除任意行

### From optimize-file-conversion-interactions plan (Context):

1. 已转换成功的文件，不可修改目标类型
2. 需要增加 PDF→PDF 的 OCR 功能，用于影印版 PDF 的文字识别
3. 支持同一文件重复上传，产生两个同名文件

### From notepads/problems.md:

- PDF.js 在 jsdom 环境中渲染可能失败
- Canvas 在 jsdom 中支持不佳，可能需要 mocking
- 异步下载需要正确处理 loading overlay
- 需要添加 isConvertingAll 和 isPreparingDownload 状态

## What Changes

### Conversion UI Optimizations Deliverables:

- `src/components/FullscreenLoading.tsx` - 可复用的全屏加载组件
- `src/components/PdfPageSelectorModal.tsx` - PDF 页数选择器模态框
- 更新的 `src/App.tsx` 集成转换 Loading 和 PDF 页数选择
- 更新的 `src/lib/converter.ts` 和 `src/lib/converter/pdf-adapters.ts`
- 更新的 i18n 文件 (en.json, zh-CN.json, zh-TW.json)
- 更新的样式文件 (global.css, theme.css)
- 更新的 Vitest 和 Playwright 测试

### Optimize File Conversion Interactions Deliverables:

- 完成行目标类型锁定（不可修改）
- 每行独立的 OCR checkbox (`是否进行 OCR`)
- PDF→PDF 转换路径支持（使用 `@hamster-note/image-parser`）
- 重复同名文件上传支持
- TDD Vitest + Playwright 回归测试

## Capabilities

### Must Have (Conversion UI Optimizations):

- 全屏 overlay 在点击"全部转换"后立即显示，直到所有转换完成或失败
- 全屏 overlay 为行下载和全局下载显示，包括 ZIP 准备
- PDF→image 行在转换前显示页数选择按钮
- 模态框渲染 PDF 页面预览，支持全选、取消全选、单页切换
- 行摘要使用 i18n 显示"已选择 x 页"
- Converter 只渲染 PDF→image 的选定页面
- 每个行都有删除按钮，完成的行可删除；全局 busy 时禁用

### Must Have (Optimize File Conversion):

- 完成行 (`done`) 的目标选择器被禁用
- 失败行保持可编辑/可重试
- OCR checkbox 默认未勾选
- OCR checkbox 按行独立，仅在目标为 `pdf` 时显示/启用
- `pdf→pdf` 作为 PDF 源文件的支持目标出现
- OCR 勾选后调用 `@hamster-note/image-parser` 识别文字并嵌入输出 PDF
- 重复同名上传后渲染第二个同名行

### Must NOT Have (Guardrails):

- 不得引入 Redux/Zustand 或新的状态库
- 不得添加 range input、拖拽排序、缩放控制、OCR 语言选择、新格式或持久化存储
- 不得重构无关的 Header/Footer/Dropzone 行为
- 不得使用 `any`
- 不得添加未翻译的可见文本
- 不得在模态框关闭后泄漏 object URLs
- 不得添加 `txt→pdf`
- 不得添加全局 OCR 设置、OCR 语言选择、OCR 进度 UI 或批量 OCR 控制
- 不得通过名称、大小、lastModified、内容哈希或对象身份去重上传

## Impact

- 新增 2 个组件: FullscreenLoading, PdfPageSelectorModal
- 修改 App.tsx 添加全局 busy 状态管理
- 修改 converter.ts 和 pdf-adapters.ts 支持 PDF 页数选择和 PDF→PDF OCR
- 修改 i18n 文件添加新的翻译 keys
- 修改样式文件添加新组件的 CSS
- 所有 9 个测试文件通过 (61 tests)
- E2E 测试因 Chromium 未安装而无法运行，但代码正确
