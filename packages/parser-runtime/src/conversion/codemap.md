# packages/parser-runtime/src/conversion/

## Responsibility

此目录是 **parser-runtime 的文档格式转换引擎**，负责在 iframe 沙箱内执行所有实际的文件格式转换操作。它接收标准化的 `ConversionRequest`（含源文件 ArrayBuffer、源/目标格式、选项），返回一个或多个 `ConversionResult`（含输出 ArrayBuffer、MIME 类型、文件名）。

支持的转换矩阵：

| 源格式 \ 目标 | html | txt | png | jpg | webp | pdf |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **pdf** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **txt** | ✓ | — | ✓ | ✓ | ✓ | — |
| **image** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **html** | — | ✓ | — | — | — | — |

## Design

### 文件结构与职责划分

| 文件 | 职责 | 行数 |
|---|---|---|
| `index.ts` | 类型定义 + 适配器路由表 + 统一入口 `convertRuntime()` | ~150 |
| `adapters.ts` | 所有 13 个转换适配器的具体实现 | ~823 |
| `exif.ts` | JPEG EXIF 元数据按类别剥离 | ~176 |
| `utils.ts` | 通用工具函数（blob/缓冲区互转、HTML 布局注入、Canvas 编码、PDF 页面提取等） | ~363 |

### 核心设计模式

1. **策略模式（Strategy Pattern）**：`RuntimeConversionAdapter` 是统一的适配器函数签名 `(request) => Promise<ConversionResult[]>`，每个源→目标组合对应一个独立适配器函数。

2. **路由表模式**：`index.ts` 中的 `adapters` 对象是一个二维映射 `Record<SourceFormat, Partial<Record<TargetFormat, RuntimeConversionAdapter>>>`，将格式对映射到具体适配器函数。`convertRuntime()` 通过查表分发请求。

3. **动态导入（Lazy Loading）**：`adapters.ts` 内部所有外部依赖（`pdfjs-dist`、`pdf-lib`、`jspdf`、`@hamster-note/pdf-parser`、`@hamster-note/image-parser`、`@hamster-note/html-parser`、`@hamster-note/txt-parser`）均使用 `await import()` 动态加载，避免首次加载时引入大量未使用的库。

4. **中间文档抽象（IntermediateDocument）**：多个适配器遵循 Parser → IntermediateDocument → Decoder 的流水线模式。例如 PDF→HTML 先经 `PdfParser.encode()` 得到中间文档，再经 `HtmlParser.decodeToHtml()` 输出 HTML。

5. **容错降级链**：`convertPdfToTxt` 先尝试 `@hamster-note/pdf-parser`，失败后降级到 `pdfjs-dist` 文本提取，两者均无文本则抛 `OcrRequiredError`。

### 关键类型

- `ConversionRequest`：统一请求体，含 `filename`、`sourceFormat`、`targetFormat`、`buffer`（ArrayBuffer）、`mimeType`（可选）、`options`（可选）
- `ConversionResult`：统一返回体，含 `filename`、`mimeType`、`targetFormat`、`buffer`、`warnings`（可选）
- `ConversionOptions`：可选配置，含 `pdf`（OCR/页码选择）、`decode`（HTML 解码样式）、`layout`（HTML 布局模式）、`image`（质量/尺寸/EXIF）、`imageToPdf`（边距/适配/旋转）
- `RuntimeConversionAdapter`：适配器函数类型签名

### 错误体系

| 错误类 | code | 触发场景 |
|---|---|---|
| `UnsupportedConversionError` | `UNSUPPORTED_CONVERSION` | 不支持的格式对 |
| `OcrRequiredError` | `OCR_REQUIRED` | PDF 文本提取失败，需要 OCR |
| `EmptyOcrError` | `EMPTY_OCR` | OCR 处理后无文本 |
| `NoPagesSelectedError` | `NO_PAGES_SELECTED` | 页码过滤后为空 |
| `UnsupportedImageFormatError` | `UNSUPPORTED_IMAGE_FORMAT` | SVG/GIF 等不支持的图片格式 |

## Flow

### 主入口流程

```
调用方 (server.ts)
  │
  ▼
convertRuntime(request: ConversionRequest)
  │  1. 校验 sourceFormat / targetFormat 是否合法
  │  2. 从 adapters 路由表查找对应适配器
  │  3. 若未找到 → 抛出 UnsupportedConversionError
  │
  ▼
adapter(request)  ──→  ConversionResult[]
  │
  ▼
返回给调用方
```

### 典型适配器内部流程（以 PDF→HTML 为例）

```
convertPdfToHtml(request)
  │
  ├─ 可选：getSelectedPdfBuffer() → 用 pdf-lib 裁剪指定页面
  │
  ├─ 并行动态导入：@hamster-note/pdf-parser + @hamster-note/html-parser
  │
  ├─ PdfParser.encode(buffer) → IntermediateDocument
  │
  ├─ HtmlParser.decodeToHtml(intermediate, decodeOptions) → HTML 字符串
  │
  ├─ applyHtmlLayout(html, layoutOptions)
  │  ├─ ensureCharsetDeclaration() → 注入 <meta charset="utf-8">
  │  ├─ 若 continuous + fit → convertPxToVw() 响应式转换
  │  └─ injectStyleIntoHead() → 注入布局 CSS
  │
  └─ 输出 ConversionResult (text/html;charset=utf-8)
```

### 图片处理流程（Image→Image / PDF→Image）

```
输入 ArrayBuffer
  │
  ├─ URL.createObjectURL() → Object URL
  ├─ new Image() 加载 → 获取 naturalWidth/naturalHeight
  ├─ calculateImageTargetSize() → 计算缩放后尺寸（支持 maxWidth/maxHeight/keepAspectRatio）
  ├─ Canvas 2D 绘制
  ├─ encodeCanvasToImage() → Blob（PNG/JPG/WebP）
  │  └─ JPG 特殊处理：createWhiteBackgroundCanvas() 填充白色背景（透明通道问题）
  ├─ 可选：stripExifCategories() → 按类别剥离 EXIF 元数据
  ├─ URL.revokeObjectURL() 清理
  └─ 输出 ConversionResult
```

### PDF→PDF (OCR) 流程

```
convertPdfToPdf(request)
  │
  ├─ 若 ocr=false → 直接复制 buffer（可选裁剪页面）
  │
  └─ 若 ocr=true → createOcrPdf()
     ├─ 并行导入 @hamster-note/image-parser + jspdf + 加载 PDF 文档
     ├─ 逐页处理 processOcrPage():
     │  ├─ renderPageToCanvas() → Canvas
     │  ├─ encodeCanvasToImage('png') → Blob
     │  ├─ ImageParser.encode(blob) → IntermediateDocument → OCR 文本
     │  ├─ 将页面图片添加到 jsPDF
     │  └─ 将 OCR 文本以白色 1px 字号叠加（可搜索文本层）
     └─ jsPDF.output('blob') → ConversionResult
```

## Integration

### 上游依赖（被此模块消费）

| 依赖 | 用途 | 加载方式 |
|---|---|---|
| `@hamster-note/types` | `IntermediateDocument` 类型 | 静态 import（仅类型） |
| `@hamster-note/pdf-parser` | PDF 解析为中间文档 | 动态 import |
| `@hamster-note/image-parser` | 图片 OCR 为中间文档 | 动态 import |
| `@hamster-note/html-parser` | HTML 编解码 | 动态 import |
| `@hamster-note/txt-parser` | TXT 解析为中间文档 | 动态 import |
| `pdfjs-dist` | PDF 文本提取 & 页面渲染 | 动态 import |
| `pdf-lib` | PDF 页面裁剪/合并 | 动态 import |
| `jspdf` | 生成 PDF 输出 | 动态 import |
| `piexifjs` | JPEG EXIF 元数据读写 | 静态 import |

### 下游消费者（消费此模块的代码）

| 文件 | 用途 |
|---|---|
| `src/server.ts` | 主要消费者：在 iframe 内接收 postMessage 请求，调用 `convertRuntime()` 执行转换，返回结果 |
| `src/__tests__/conversion-runtime.test.ts` | 单元测试：覆盖所有格式对的转换逻辑 |
| `src/__tests__/exif.test.ts` | 单元测试：覆盖 EXIF 剥离逻辑 |
| `src/__tests__/server-integration.test.ts` | 集成测试：mock `convertRuntime` 测试 server 层 |
| `src/__tests__/queue.test.ts` | 队列测试：mock `convertRuntime` 测试并发/取消语义 |

### 与 Host 的通信路径

```
Host (App.tsx / ParserIframeBridge)
  │  postMessage { type: 'convert', request: ConversionRequest }
  ▼
iframe (server.ts)
  │  调用 convertRuntime(request)
  ▼
conversion/index.ts → adapters.ts → 具体适配器
  │
  ▼
ConversionResult[]
  │  postMessage { type: 'result', results: ConversionResult[] }
  ▼
Host 接收结果，更新 UI
```
