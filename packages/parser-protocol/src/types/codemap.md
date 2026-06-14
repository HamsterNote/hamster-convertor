# packages/parser-protocol/src/types/

## Responsibility

此目录为 `@hamster-note/*` 系列解析器包提供**纯类型声明**（`.d.ts`），不包含任何运行时代码。其职责是：

1. 定义各解析器（PDF、HTML、图片、TXT、通用文档）的公共 API 接口
2. 声明统一的 `ParserInput` 类型（`ArrayBuffer | ArrayBufferView | Blob`）
3. 声明各解析器的 `encode()` 和 `decode()` 方法签名
4. 为 `parser-protocol/src/index.ts` 提供类型推断基础，派生出 `HtmlParserEncodeInput`、`PdfParserDecodeResult` 等别名

## Design

### 统一接口模式

所有解析器遵循一致的静态类模式：

```typescript
type ParserInput = ArrayBuffer | ArrayBufferView | Blob

class XxxParser {
  static readonly exts: readonly string[]      // 支持的文件扩展名
  static encode(input: ParserInput): Promise<Record<string, unknown>>   // 文件 → 中间文档
  static decode(intermediate: Record<string, unknown>): Promise<...>    // 中间文档 → 文件
}
```

### 差异化设计

| 解析器     | 特殊能力                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------- |
| PdfParser  | `EncodeOptions`（maxPages、pageLoadTimeoutMs）、`DecodeOptions`（fonts）、`onProgress` 回调 |
| HtmlParser | `DecodeOptions`（textControl 文本样式、background 背景选项）                                |
| 其他       | 标准 encode/decode，无额外选项                                                              |

### 中间文档抽象

所有解析器的 `encode()` 输出均为 `Record<string, unknown>`，这是一种**格式无关的中间表示**（Intermediate Document），使得不同格式的解析器可以组合使用（如 PDF → 中间文档 → HTML）。

## Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         类型推断链                                       │
│                                                                         │
│  .d.ts 类型声明                                                          │
│       ↓                                                                 │
│  index.ts 通过 `typeof import(...)` 推断                                │
│       ↓                                                                 │
│  导出类型别名（HtmlParserEncodeInput、PdfParserDecodeResult 等）         │
│       ↓                                                                 │
│  parser-runtime/conversion/adapters.ts 使用这些类型                      │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         运行时调用链                                     │
│                                                                         │
│  parser-runtime/main.ts                                                 │
│       ↓                                                                 │
│  import * as PdfParser from '@hamster-note/pdf-parser'                  │
│       ↓                                                                 │
│  PdfParser.encode(buffer) → Record<string, unknown>                     │
│       ↓                                                                 │
│  PdfParser.decode(intermediate, options?, onProgress?) → ParserInput    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Integration

### 上游依赖

无运行时依赖。这些 `.d.ts` 文件通过 `declare module` 语法为外部 npm 包提供类型声明：

- `@hamster-note/document-parser`
- `@hamster-note/html-parser`
- `@hamster-note/image-parser`
- `@hamster-note/pdf-parser`
- `@hamster-note/txt-parser`

### 下游消费者

| 消费者                                          | 用途                                                   |
| ----------------------------------------------- | ------------------------------------------------------ |
| `parser-protocol/src/index.ts`                  | 通过 `typeof import(...)` 派生类型别名                 |
| `parser-runtime/src/main.ts`                    | 导入实际解析器模块，注册到 parserModules 映射          |
| `parser-runtime/src/conversion/adapters.ts`     | 使用类型声明进行类型转换，调用各解析器的 encode/decode |
| `parser-runtime/src/types/parser-packages.d.ts` | 为运行时环境提供补充声明                               |

### 类型导出

类型通过两种方式对外暴露：

1. **直接导出**：各 `.d.ts` 文件通过 `declare module` 全局可用
2. **派生别名**：`index.ts` 中的 `HtmlParserEncodeInput`、`PdfParserEncodeInput`、`HtmlParserDecodeResult`、`PdfParserDecodeResult`
