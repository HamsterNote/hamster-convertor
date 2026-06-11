# packages/parser-protocol/

## Responsibility

`@hamster-note/parser-protocol` 是一个**纯类型包**，为 iframe 解析器桥接通信提供共享协议定义。它定义了：

1. **消息协议类型**：主框架（host）与 iframe 解析器运行时之间通过 `postMessage` 通信的所有消息格式
2. **类型守卫函数**：运行时验证函数，确保接收到的消息符合协议规范
3. **解析器类型声明**：为 `@hamster-note/*` 系列解析器包提供 `.d.ts` 声明，支持类型推断

**核心约束**：此包不包含任何运行时业务逻辑，仅导出类型和验证函数。

## Design

### 消息协议模型

采用**请求-响应模式**，通过 `MessagePort` 进行跨 iframe 通信：

```
主框架 (host)                          iframe 解析器运行时
     │                                        │
     │──── ParserBridgeRequest ──────────────>│  (convert 请求)
     │                                        │
     │<──── ParserBridgeProgress ─────────────│  (进度报告)
     │                                        │
     │<──── ParserBridgeResponse ─────────────│  (结果/错误)
     │                                        │
     │──── ParserBridgeCancelRequest ────────>│  (取消请求)
     │                                        │
     │<──── ParserBridgeReadyMessage ─────────│  (就绪信号)
```

### 关键类型

| 类型 | 方向 | 用途 |
|------|------|------|
| `ParserBridgeRequest` | host → iframe | 转换请求，携带文件 buffer、源/目标格式 |
| `ParserBridgeCancelRequest` | host → iframe | 取消进行中的请求 |
| `ParserBridgeProgress` | iframe → host | 进度报告（阶段、百分比、队列长度） |
| `ParserBridgeResponse` | iframe → host | 转换结果或错误 |
| `ParserBridgeReadyMessage` | iframe → host | iframe 加载完成信号 |
| `ParserBridgeConversionOptions` | 内嵌于 Request | 透传给具体解析器的选项 |

### 进度阶段（ParserBridgeProgressPhase）

```
queued → reading → encoding → decoding → rendering → packaging → completed
                                                                  → error
                                                                  → cancelled
```

### 类型守卫模式

所有消息类型都有对应的 `is*()` 验证函数（如 `isParserBridgeRequest()`），用于运行时类型检查。这些守卫：
- 拒绝非对象输入
- 逐字段验证类型和必要性
- 对 `type` 字段做字面量匹配

### 解析器类型声明

`src/types/` 目录下的 `.d.ts` 文件为各解析器包提供类型声明，遵循统一接口：

```typescript
type ParserInput = ArrayBuffer | ArrayBufferView | Blob

class XxxParser {
  static readonly exts: readonly string[]
  static encode(input: ParserInput): Promise<Record<string, unknown>>
  static decode(intermediate: Record<string, unknown>): Promise<ParserInput>
}
```

通过 `typeof import(...)` 语法，`index.ts` 从这些声明派生出类型别名（如 `HtmlParserEncodeInput`、`PdfParserDecodeResult`）。

## Flow

### 数据流：转换请求的生命周期

```
1. proxy.ts 构造 ParserBridgeRequest
   │  - 读取文件为 ArrayBuffer
   │  - 生成唯一 requestId
   │  - 填充 sourceFormat、targetFormat
   ▼
2. client.ts 通过 MessagePort 发送请求
   │  - port.postMessage(request)
   │  - 设置 120s 超时
   ▼
3. iframe 运行时接收并验证
   │  - isParserBridgeRequest(data) 类型守卫
   │  - 分发到对应解析器的 encode/decode
   ▼
4. iframe 运行时发送进度更新
   │  - ParserBridgeProgress 消息
   │  - 阶段: queued → reading → encoding → ...
   ▼
5. iframe 运行时发送最终响应
   │  - 成功: ParserBridgeResponse (type: 'convert:result')
   │  - 失败: ParserBridgeResponse (type: 'convert:error')
   ▼
6. client.ts 解析响应并 resolve/reject Promise
   │  - isParserBridgeResponse() 验证
   ▼
7. proxy.ts 将结果转换为 ConversionResult[]
   │  - ArrayBuffer → Blob
   │  - 返回给调用方
```

### 取消流

```
proxy.ts → client.sendCancel(requestId)
         → port.postMessage({ requestId, type: 'cancel' })
         → 本地 reject pending Promise
```

## Integration

### 上游依赖

| 依赖 | 类型 | 用途 |
|------|------|------|
| `@hamster-note/types` | devDep | 共享类型定义 |
| `@hamster-note/html-parser` | devDep | 提供 HTML 解析器类型推断源 |
| `@hamster-note/pdf-parser` | devDep | 提供 PDF 解析器类型推断源 |
| `@hamster-note/txt-parser` | devDep | 提供 TXT 解析器类型推断源 |
| `@hamster-note/image-parser` | devDep | 提供图片解析器类型推断源 |
| `@hamster-note/document-parser` | devDep | 提供通用文档解析器类型推断源 |

**注意**：所有依赖均为 `devDependencies`，仅用于类型推断，不产生运行时依赖。

### 下游消费者

| 消费者 | 导入内容 | 用途 |
|--------|----------|------|
| `src/lib/parser-bridge/client.ts` | `ParserBridgeRequest`, `ParserBridgeCancelRequest`, `ParserBridgeProgress`, `ParserBridgeConversionResultPayload` | 实现 BridgeClient，管理请求/响应/超时 |
| `src/lib/parser-bridge/proxy.ts` | `ParserBridgeRequest` | 构造请求并调用 bridge，转换结果为 `ConversionResult` |
| `packages/parser-runtime/` | 类型守卫函数、协议类型 | iframe 端验证和处理消息 |

### 包导出

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  }
}
```

仅导出 `dist/index.js` 和对应类型声明，消费者通过 `import { ... } from '@hamster-note/parser-protocol'` 引入。

### 构建

- `yarn build`：执行 `tsc -b`，编译 `src/` 到 `dist/`
- 输出 ES2022 + ESM 格式
- 启用 `composite` 支持项目引用
