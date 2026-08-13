# packages/parser-protocol/src/

## Responsibility

此目录是 `@hamster-note/parser-protocol` 包的源码根目录，承担两项核心职责：

1. **定义 iframe 桥接通信协议类型**：声明 host ↔ iframe 解析器运行时之间 `postMessage` 所用的全部消息类型（请求、响应、进度、取消、就绪）以及运行时类型守卫函数
2. **聚合解析器包类型声明**：通过 `types/` 子目录的 `.d.ts` 文件为 `@hamster-note/*` 系列解析器包提供类型声明，并在此处通过 `typeof import(...)` 派生出类型别名供下游使用

本包为**纯类型包**，仅含类型定义与类型守卫工具函数，不包含业务逻辑。

## Design

### 桥接协议消息体系

采用 **请求-响应 + 进度推送** 的消息模式，所有消息通过 `postMessage` 在主框架与 iframe 之间传递：

| 方向          | 类型                        | 用途                               |
| ------------- | --------------------------- | ---------------------------------- |
| host → iframe | `ParserBridgeRequest`       | 发起转换请求，携带文件 ArrayBuffer |
| host → iframe | `ParserBridgeCancelRequest` | 取消进行中的转换                   |
| iframe → host | `ParserBridgeReadyMessage`  | iframe 加载完成，声明就绪          |
| iframe → host | `ParserBridgeResponse`      | 转换结果 / 错误 / 进度报告         |

### 进度报告阶段枚举

`ParserBridgeProgressPhase` 定义了完整的转换生命周期：`queued → reading → encoding/decoding → rendering → packaging → completed | error | cancelled`

### 类型守卫模式

为所有协议消息类型提供运行时验证函数（`isParserBridgeRequest`、`isParserBridgeResponse` 等），确保 `postMessage` 接收到的数据结构合法。守卫内部使用 `isRecord` / `isString` / `isNumber` / `isArrayBuffer` 基础校验器组合验证。

### 转换选项透传

`ParserBridgeConversionOptions` 聚合了所有解析器可能需要的选项（PDF 页数限制、HTML 文本样式、图片质量/EXIF、渲染参数等），通过 `options` 字段透传给具体解析器。

### 类型推断链

`types/` 子目录中的 `.d.ts` 通过 `declare module` 为外部 npm 包提供类型声明 → `index.ts` 通过 `typeof import(...)` 推断出 `HtmlParserEncodeInput`、`PdfParserDecodeResult` 等类型别名 → 下游模块直接使用这些别名获得完整类型安全。

## Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                    桥接通信协议流程                                 │
│                                                                    │
│  host (ParserIframeBridge)              iframe (parser-runtime)    │
│       │                                        │                  │
│       │  1. iframe 加载完成                      │                  │
│       │ ◄────────────────────────────────────── │ ParserBridgeReadyMessage
│       │                                        │                  │
│       │  2. 发送转换请求                         │                  │
│       │  ParserBridgeRequest ─────────────────► │                  │
│       │  { requestId, type:'convert',           │                  │
│       │    buffer, sourceFormat, targetFormat } │                  │
│       │                                        │                  │
│       │  3. 进度报告（可多次）                    │                  │
│       │ ◄────────────────────────────────────── │ ParserBridgeProgress
│       │  { phase, percent, queueLength }        │                  │
│       │                                        │                  │
│       │  4a. 成功结果                            │                  │
│       │ ◄────────────────────────────────────── │ ParserBridgeResponse
│       │  { type:'convert:result',               │   type:'convert:result' │
│       │    payload: { buffer, mimeType } }      │                  │
│       │                                        │                  │
│       │  4b. 或错误结果                          │                  │
│       │ ◄────────────────────────────────────── │ ParserBridgeResponse
│       │  { type:'convert:error',                │   type:'convert:error'  │
│       │    error: { code, message } }           │                  │
│       │                                        │                  │
│       │  5. 取消（可选）                         │                  │
│       │  ParserBridgeCancelRequest ───────────► │                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    类型推断与消费链                                  │
│                                                                    │
│  types/*.d.ts  (declare module '@hamster-note/*-parser')           │
│       │                                                            │
│       ▼                                                            │
│  index.ts  (typeof import(...))                                    │
│       │  → HtmlParserEncodeInput                                   │
│       │  → HtmlParserDecodeResult                                  │
│       │  → PdfParserEncodeInput                                    │
│       │  → PdfParserDecodeResult                                   │
│       ▼                                                            │
│  parser-runtime/conversion/adapters.ts  (使用类型别名)              │
└──────────────────────────────────────────────────────────────────┘
```

## Integration

### 上游依赖

| 依赖                            | 类型       | 说明                                           |
| ------------------------------- | ---------- | ---------------------------------------------- |
| `@hamster-note/html-parser`     | 类型推断源 | 通过 `types/html-parser.d.ts` 提供类型声明     |
| `@hamster-note/pdf-parser`      | 类型推断源 | 通过 `types/pdf-parser.d.ts` 提供类型声明      |
| `@hamster-note/image-parser`    | 类型推断源 | 通过 `types/image-parser.d.ts` 提供类型声明    |
| `@hamster-note/txt-parser`      | 类型推断源 | 通过 `types/txt-parser.d.ts` 提供类型声明      |
| `@hamster-note/document-parser` | 类型推断源 | 通过 `types/document-parser.d.ts` 提供类型声明 |

无运行时依赖，全部为编译期类型引用。

### 下游消费者

| 消费者                                      | 导入内容                                           | 用途                                    |
| ------------------------------------------- | -------------------------------------------------- | --------------------------------------- |
| `src/lib/parser-bridge/proxy.ts`            | `ParserBridgeRequest`                              | 向 iframe 发送转换请求时的类型约束      |
| `src/lib/parser-bridge/client.ts`           | 协议消息类型 + 守卫函数                            | iframe 端接收/验证/发送消息             |
| `src/components/ParserIframeBridge.tsx`     | `ParserBridgeReadyMessage`, `ParserBridgeResponse` | React 组件中处理 iframe 消息            |
| `src/__tests__/app.upload.test.tsx`         | `ParserBridgeConversionResultPayload`              | 测试中构造模拟响应数据                  |
| `parser-runtime/src/conversion/adapters.ts` | 类型别名                                           | 调用各解析器 encode/decode 时的类型安全 |

### 文件清单

| 文件                         | 职责                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `index.ts`                   | 桥接协议类型定义、类型守卫函数、解析器类型别名                                   |
| `types/document-parser.d.ts` | `@hamster-note/document-parser` 类型声明                                         |
| `types/html-parser.d.ts`     | `@hamster-note/html-parser` 类型声明（含 DecodeOptions）                         |
| `types/pdf-parser.d.ts`      | `@hamster-note/pdf-parser` 类型声明（含 EncodeOptions/DecodeOptions/onProgress） |
| `types/image-parser.d.ts`    | `@hamster-note/image-parser` 类型声明                                            |
| `types/txt-parser.d.ts`      | `@hamster-note/txt-parser` 类型声明                                              |
| `types/codemap.md`           | types 子目录的架构文档                                                           |
