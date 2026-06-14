# src/types/

## Responsibility

为文档转换器提供 TypeScript 类型声明，解决第三方库（pdfjs-dist、jszip）和内部解析器模块（@hamster-note/\*）缺少类型定义的问题。定义解析器的统一接口契约和中间文档格式。

## Design

**模式：模块声明 + 统一解析器接口**

- **模块声明**：使用 `declare module` 为无类型的第三方库提供类型（pdfjs-dist、jszip）
- **中间文档抽象**：`IntermediateDocument` 作为所有解析器的统一中间表示格式
- **解析器接口约定**：
  - `encode()`：原始文件 → IntermediateDocument
  - `decode()`：IntermediateDocument → 目标格式
  - `ParserInput = ArrayBuffer | ArrayBufferView | Blob` 统一输入类型
- **进度报告**：`ProgressReport` + `ProgressReporter` 支持长时间操作的进度回调

**核心类型层次**：

```
IntermediateDocument (基础文档)
    ├── PdfParser (PDF 编解码)
    └── HtmlParser (HTML 编解码 + 渲染)
```

## Flow

**数据流向**：

1. 文件输入 → `ParserInput` (ArrayBuffer/ArrayBufferView/Blob)
2. 解析器 `encode()` → `IntermediateDocument` (中间表示)
3. 解析器 `decode()` → 目标格式输出
4. HTML 特殊路径：`IntermediateDocument` → `HtmlDocument` → `HtmlPage` → DOM 渲染

**进度流**：

- 解析器调用 → `ProgressReporter` 回调 → `ProgressReport` (stage/current/total)

## Integration

**依赖**：

- `pdfjs-dist`：PDF 解析底层库（提供 PDFDocumentProxy、PDFPageProxy 等）
- `@hamster-note/types`：核心类型定义（IntermediateDocument、Number2）

**消费者**：

- `src/services/` 下的解析器实现使用这些类型
- `src/App.tsx` 的 `convertAll()` 通过解析器 API 进行文档转换
- iframe parser-runtime 使用这些类型进行文档解析和渲染

**关键文件**：
| 文件 | 职责 |
|------|------|
| `global.d.ts` | 扩展 Window 接口（E2E 测试标志） |
| `hamster-note-types.d.ts` | 核心类型：IntermediateDocument、Number2 |
| `pdf-parser.d.ts` | PdfParser 类型定义（含进度报告） |
| `html-parser.d.ts` | HtmlParser/HtmlDocument/HtmlPage 类型 |
| `pdf-parser-deps.d.ts` | pdfjs-dist 库的完整类型声明 |
| `jszip.d.ts` | JSZip 库类型声明 |
| `system-ui-js__pdf-parser.d.ts` | PdfParser 备用声明（较简略） |
