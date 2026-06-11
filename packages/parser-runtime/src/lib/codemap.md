# packages/parser-runtime/src/lib/

## Responsibility

本目录是 parser-runtime 对第三方 PDF 库 `pdfjs-dist` 的**适配层**。它包装原始的 `pdfjs-dist` 模块，解决两个关键问题：

1. **Worker 路径配置** — 设置 `GlobalWorkerOptions.workerSrc` 指向正确的 worker 文件 URL，避免回退到 fake worker 导致转换失败。
2. **CJK 文本解码** — 自动注入 CMap（Character Map）参数（`cMapUrl`、`cMapPacked`、`useWorkerFetch`），使 pdf.js 能正确解码中文、日文、韩文等 CJK 文本，避免乱码。

## Design

### 包装模式（Wrapper Pattern）

目录唯一的源文件 `pdfjs-wrapper.ts` 采用经典的**装饰器/包装器**模式：

- 保留原始 `pdfjsLib.getDocument` 函数引用
- 导出一个同名的 `wrappedGetDocument`，在调用前注入默认参数
- 使用 `export * from 'pdfjs-dist'` 透传所有其他导出

```
┌─────────────────────────────────────────────────┐
│  @hamster-note/pdf-parser                       │
│  └── import("pdfjs-dist")                       │
│         │                                       │
│         ▼  (被 Vite 插件重写)                    │
│  /src/lib/pdfjs-wrapper.ts                      │
│  ┌─────────────────────────────────────────┐    │
│  │ wrappedGetDocument(src)                 │    │
│  │   if (src 无 cMapUrl) → 注入 CMap 参数   │    │
│  │   → originalGetDocument(src)            │    │
│  └─────────────────────────────────────────┘    │
│  + re-export everything from pdfjs-dist         │
└─────────────────────────────────────────────────┘
```

### 关键类型

- `GetDocumentSrc` — 从 `pdfjsLib.getDocument` 推导的参数类型
- `CMapParams` — CMap 相关配置的类型别名（`cMapUrl`, `cMapPacked`, `useWorkerFetch`）

### 判断逻辑

`wrappedGetDocument` 仅在 `src` 参数是**普通对象**（非 `Array`、非 `URL`、非 `Uint8Array`、非 `ArrayBuffer`）且**未设置 `cMapUrl`** 时，才注入默认 CMap 配置。这避免了对 `Uint8Array` 直接传入等简单用法的干扰。

## Flow

```
1. 模块加载时:
   pdfjs-dist 被 import → 设置 GlobalWorkerOptions.workerSrc = pdfWorkerUrl

2. PDF 解析时:
   @hamster-note/pdf-parser 调用 import("pdfjs-dist")
     │
     ▼ (Vite 构建插件 interceptPdfjsImportPlugin 将路径重写为 /src/lib/pdfjs-wrapper.ts)
     │
     ▼
   wrappedGetDocument(src)
     │
     ├─ src 是普通对象且无 cMapUrl?
     │   ├─ 是 → 注入 { cMapUrl: '/cmaps/', cMapPacked: true, useWorkerFetch: true }
     │   └─ 否 → 保持原样
     │
     ▼
   originalGetDocument(处理后的 src)
     │
     ▼
   返回 PDFDocumentProxy (pdf.js 标准 API)
```

## Integration

### 上游依赖

| 依赖 | 用途 |
|------|------|
| `pdfjs-dist` | Mozilla 的 PDF 解析库，本模块是它的薄包装 |
| Vite 构建插件 (`interceptPdfjsImportPlugin`) | 在 `vite.config.ts` 中将 `@hamster-note/pdf-parser` 的 `import("pdfjs-dist")` 重写为指向本模块 |

### 下游消费者

| 消费者 | 使用方式 |
|--------|----------|
| `@hamster-note/pdf-parser` | 通过 Vite 插件重写后的 import 路径间接使用本模块的 `getDocument` |
| `src/conversion/adapters.ts` | 直接 import `pdfjs-dist`（走 worker 配置路径），以及通过 `@hamster-note/pdf-parser` 间接使用本模块 |

### 构建时集成

Vite 插件 `interceptPdfjsImportPlugin`（位于 `packages/parser-runtime/vite.config.ts`）是本模块的核心集成点：

- **触发条件**：模块路径包含 `@hamster-note/pdf-parser` 或 `/PdfParser/`，且源码中包含 `import("pdfjs-dist")`
- **替换行为**：将 `import("pdfjs-dist")` 替换为 `import("/src/lib/pdfjs-wrapper.ts")`
- **目的**：确保所有 PDF 解析都经过 CMap 配置，解决 CJK 文本乱码问题

### 公共 API

```typescript
// 包装后的 getDocument（自动注入 CMap 配置）
export const getDocument = wrappedGetDocument

// 透传的 GlobalWorkerOptions（已在模块加载时配置 workerSrc）
export const GlobalWorkerOptions = pdfjsLib.GlobalWorkerOptions

// pdfjs-dist 的所有其他导出（如 version、各种类型等）
export * from 'pdfjs-dist'
```
