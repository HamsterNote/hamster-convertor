# src/lib/

## Responsibility

src/lib/ 是文档转换应用的**核心业务逻辑层**，负责：

1. **转换类型与协议定义** — 定义所有格式转换相关的类型（`SourceFormat`、`TargetFormat`、`ConversionRequest`、`ConversionResult`）、支持的转换路径矩阵、以及 `UnsupportedConversionError` 错误类。
2. **HTML 布局后处理** — 对 PDF→HTML 转换结果进行 charset 注入、px→vw 响应式缩放、分页/连续模式 CSS 注入等后处理（`applyHtmlLayout`）。
3. **PDF 底层工具** — 封装 pdfjs-dist 的 Worker 配置、文件读取、文档加载、页数查询（`pdf-utils.ts`），以及自动注入 CMap 解决中文乱码的 wrapper（`pdfjs-wrapper.ts`）。
4. **文件下载** — 提供单文件 Blob 下载和多文件 ZIP 打包下载能力（`download.ts`）。
5. **文件名截断** — 提供基于 Canvas 测量的中省略号截断工具，用于 UI 展示长文件名（`filename.ts`）。
6. **预览过滤** — 从转换结果中筛选可预览的输出格式（`preview.ts`）。
7. **iframe 解析器桥接** — 通过 `parser-bridge/` 子目录管理与隔离 iframe 解析器运行时的 MessagePort 通信（详见其独立 codemap）。

**注意**：`converter.ts` 中的 `convertPdfToHtml` 和 `convertFile` 函数已弃用，会直接抛出错误，实际转换已迁移至 iframe 解析器桥接架构。

## Design

### 模块分层

```
converter.ts          类型定义层：所有转换相关的 type/interface/error
    │
    ├── pdf-utils.ts      PDF 工具层：pdfjs-dist 封装（Worker、读取、加载）
    ├── pdfjs-wrapper.ts  PDF 工具层：getDocument 包装器（CMap 注入）
    ├── download.ts       输出层：Blob/ZIP 下载
    ├── filename.ts       UI 工具层：文件名截断
    ├── preview.ts        UI 工具层：可预览格式筛选
    │
    └── parser-bridge/    通信层：iframe 桥接（client + proxy + url）
```

### 关键模式

1. **类型驱动设计** — `converter.ts` 集中定义所有类型，其他模块通过 `import type` 引用，形成清晰的类型依赖图。`SourceFormat` 和 `TargetFormat` 是整个系统的核心枚举。

2. **转换路径矩阵** — `supportedTargets` 常量以 `Record<SourceFormat, readonly TargetFormat[]>` 形式声明合法转换路径，`getSupportedTargets()` 是唯一的查询入口。

3. **HTML 后处理管道** — `applyHtmlLayout()` 串联三步操作：`ensureCharsetDeclaration()` → `convertPxToVw()`（条件）→ `injectStyleIntoHead()`，输出完整的可展示 HTML。

4. **Canvas 测量 + 二分查找** — `truncateMiddle()` 使用 Canvas API 精确测量文本像素宽度，通过二分查找 (`findLongestFittingHead`) 找到最优截断点，回退方案使用字符预算启发式。

5. **防御式 PDF 包装** — `pdfjs-wrapper.ts` 拦截 `getDocument` 调用，自动注入 CMap 参数（`/cmaps/`），解决中文 PDF 乱码问题，无需调用方感知。

6. **弃用守卫** — `convertFile()` 和 `convertPdfToHtml()` 保留导出但实现为抛出错误，确保不会意外绕过 iframe 桥接架构。

### 核心类型

```typescript
type SourceFormat = 'pdf' | 'txt' | 'image' | 'html'
type TargetFormat = 'html' | 'txt' | 'png' | 'jpg' | 'webp' | 'pdf'

type ConversionResult = {
  blob: Blob
  filename: string
  mimeType: string
  targetFormat: TargetFormat
  label?: string
  warnings?: ConversionWarning[]
}

type ConversionRequest = {
  file: File
  source: SourceFormat
  target: TargetFormat
  options?: { pdf?: ..., decode?: HtmlDecodeOptions, layout?: HtmlLayoutOptions, image?: ..., imageToPdf?: ... }
}
```

## Flow

### 数据进入

```
用户上传文件 → App.tsx (onFilesAdded)
    │
    ├── extToFormat() 识别 SourceFormat
    ├── getSupportedTargets() 确定默认 TargetFormat
    │
    ▼
用户点击"转换" → App.tsx (convertAll → convertSingleItem)
    │
    ├── getPdfPageCount() (pdf-utils.ts) — 大 PDF 确认弹窗
    ├── convertViaBridge() (parser-bridge/proxy.ts) — 实际转换
    │       │
    │       ├── readFileAsArrayBuffer() — File → ArrayBuffer
    │       ├── generateRequestId() (parser-bridge/client.ts)
    │       └── bridgeRef.convert() → MessagePort → iframe 运行时
    │
    ▼
转换结果返回 → ConversionResult[]
    │
    ├── markDone() 更新 UI 状态
    ├── getPreviewableOutputs() (preview.ts) — 筛选可预览项
    │
    ▼
用户下载 → downloadBlobFile() / downloadResultArchive()
    │
    └── URL.createObjectURL → <a> 标签点击 → 自动清理
```

### HTML 后处理流程

```
iframe 运行时返回 HTML 字符串
    │
    ▼
applyHtmlLayout(html, layoutOptions)
    │
    ├── ensureCharsetDeclaration() — 注入 <meta charset="utf-8">
    │
    ├── [paginated 模式] → 注入分页 CSS（page-break-after, box-shadow）
    │
    └── [continuous 模式]
        ├── [actual 宽度] → 注入滚动 CSS，保持原始 px
        └── [fit 宽度] → convertPxToVw() 将 px 转 vw
                ├── 遍历 hamster-note-page div，提取宽高
                ├── 计算 aspectRatio → padding-bottom 百分比
                └── convertTextStylesToVw() — 转换 span 内联样式
```

### 文件名截断流程

```
truncateMiddle("very-long-filename.pdf")
    │
    ├── Canvas 可用？
    │   ├── 是 → ctx.measureText() 精确测量
    │   │       ├── 文件名宽度 ≤ maxWidthPx？→ 直接返回
    │   │       └── 二分查找最长前缀 → head + "..." + tail
    │   └── 否 → 字符预算启发式（FALLBACK_PX_PER_CHAR = 7.5）
    │
    └── 返回截断后的字符串
```

## Integration

### 上游依赖

| 依赖                                  | 用途                           | 文件                                                |
| ------------------------------------- | ------------------------------ | --------------------------------------------------- |
| `pdfjs-dist`                          | PDF 解析引擎                   | `pdf-utils.ts`, `pdfjs-wrapper.ts`                  |
| `pdfjs-dist/build/pdf.worker.mjs?url` | PDF.js Worker（Vite URL 导入） | `pdf-utils.ts`                                      |
| `jszip`                               | ZIP 打包（动态导入）           | `download.ts`                                       |
| `@hamster-note/parser-protocol`       | iframe 桥接协议类型            | `parser-bridge/client.ts`, `parser-bridge/proxy.ts` |
| `loglevel`                            | 日志（通过 App.tsx 间接使用）  | —                                                   |

### 下游消费者

| 消费者                                  | 使用的导出                                                                                                                          | 用途                   |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `src/App.tsx`                           | `ConversionResult`, `ConversionWarning`, `SourceFormat`, `TargetFormat`, `getSupportedTargets`, `HtmlDecodeOptions`, `ExifCategory` | 类型定义与转换路径查询 |
| `src/App.tsx`                           | `downloadBlobFile`, `downloadResultArchive`                                                                                         | 单文件/批量下载        |
| `src/App.tsx`                           | `truncateMiddle`                                                                                                                    | 文件表格中文件名显示   |
| `src/App.tsx`                           | `getPdfPageCount`                                                                                                                   | 大 PDF 转换前确认      |
| `src/App.tsx`                           | `getPreviewableOutputs`                                                                                                             | 预览按钮可用性判断     |
| `src/App.tsx`                           | `convertViaBridge` (parser-bridge)                                                                                                  | 实际转换调用           |
| `src/components/ParserIframeBridge.tsx` | `createBridgeClient`, `BridgeError`, `BridgeErrorCode` (parser-bridge)                                                              | iframe 生命周期管理    |

### 文件职责映射

| 文件                | 行数 | 职责                                                               |
| ------------------- | ---- | ------------------------------------------------------------------ |
| `converter.ts`      | 318  | 类型定义、转换路径矩阵、HTML 后处理（`applyHtmlLayout`）、弃用守卫 |
| `pdf-utils.ts`      | 63   | pdfjs-dist 封装：Worker 配置、ArrayBuffer 读取、文档加载、页数查询 |
| `pdfjs-wrapper.ts`  | 48   | `getDocument` 包装器：自动注入 CMap 参数解决中文乱码               |
| `download.ts`       | 36   | Blob 下载（单文件 + ZIP 打包），动态导入 jszip                     |
| `filename.ts`       | 98   | Canvas 测量 + 二分查找文件名截断，含 SSR 回退方案                  |
| `preview.ts`        | 18   | 可预览格式列表定义与筛选函数                                       |
| `parser-bridge/`    | —    | iframe 桥接通信层（详见 `parser-bridge/codemap.md`）               |
| `converter/`        | 0    | 空目录（预留）                                                     |
| `filename.test.ts`  | —    | filename.ts 单元测试                                               |
| `pdf-utils.test.ts` | —    | pdf-utils.ts 单元测试                                              |
