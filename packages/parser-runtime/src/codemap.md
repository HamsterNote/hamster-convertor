# packages/parser-runtime/src/

## Responsibility

此目录是 **parser-runtime iframe 沙箱的运行时核心**，负责在浏览器 iframe 内接收 Host 发起的文档转换请求，调度转换任务队列，并通过 MessageChannel 协议将结果返回给 Host。

核心职责：
1. **入口引导**（`main.ts`）— 初始化所有解析器模块，监听 Host 的连接握手，建立 MessagePort 通信通道
2. **协议服务器**（`server.ts`）— 实现请求/响应协议，管理任务队列、并发控制、取消语义和进度上报
3. **格式转换引擎**（`conversion/`）— 执行实际的文件格式转换（PDF/TXT/Image/HTML 互转）
4. **第三方库适配**（`lib/`）— 包装 pdfjs-dist，解决 Worker 路径和 CJK 文本解码问题
5. **类型声明**（`types/`）— 为缺少内置类型的解析器包提供 TypeScript 类型定义

## Design

### 整体架构模式

```
┌─────────────────────────────────────────────────────────────────┐
│  Host (App.tsx / ParserIframeBridge)                            │
│    │  postMessage { type: 'parser-bridge:connect' } + MessagePort│
│    ▼                                                            │
│  iframe (main.ts)                                               │
│    │  接收 MessagePort，创建 ProtocolServer                      │
│    ▼                                                            │
│  server.ts (ProtocolServer)                                     │
│    │  任务队列 → 进度上报 → 调用 convertRuntime()                │
│    ▼                                                            │
│  conversion/index.ts                                            │
│    │  路由表查找适配器                                           │
│    ▼                                                            │
│  conversion/adapters.ts                                         │
│    │  13 个转换适配器（动态导入外部依赖）                          │
│    ▼                                                            │
│  ConversionResult[]                                             │
└─────────────────────────────────────────────────────────────────┘
```

### 关键设计模式

1. **MessageChannel 协议模式**：Host 通过 `postMessage` 发送 `parser-bridge:connect` 消息携带 `MessagePort`，iframe 收到后创建 `ProtocolServer` 绑定该端口，后续所有请求/响应通过此端口进行，避免广播消息。

2. **任务队列模式**：`server.ts` 内置 FIFO 队列，同一时刻只处理一个任务（`processing` 锁），支持任务取消（queued 任务直接移除，active 任务标记取消后在阶段边界生效）。

3. **阶段式进度上报**：转换过程分为 `queued → reading → encoding → decoding → rendering → packaging → completed/error/cancelled` 七个阶段，每个阶段上报进度百分比和消息。

4. **策略/路由表模式**：`conversion/index.ts` 使用二维映射 `Record<SourceFormat, Partial<Record<TargetFormat, Adapter>>>` 将格式对路由到具体适配器函数。

5. **动态导入（Lazy Loading）**：所有重型外部依赖（pdfjs-dist、pdf-lib、jspdf 等）均使用 `await import()` 按需加载。

### 文件结构

| 文件 | 职责 | 行数 |
|---|---|---|
| `main.ts` | 入口：注册解析器模块，监听连接握手，创建 ProtocolServer | 66 |
| `server.ts` | 协议服务器：任务队列、进度上报、取消语义、调用转换引擎 | 624 |
| `conversion/` | 格式转换引擎：13 个适配器 + 路由表 + 工具函数 | 子目录 |
| `lib/` | pdfjs-dist 适配层：Worker 配置 + CMap 注入 | 子目录 |
| `types/` | 第三方解析器包的 TypeScript 类型声明 | 子目录 |
| `__tests__/` | 单元测试 + 集成测试 | 子目录 |

### 核心类型

| 类型 | 定义位置 | 用途 |
|---|---|---|
| `ParserRuntimeReadyMessage` | `main.ts` | 向 Host 发送就绪通知，携带支持的解析器名称列表 |
| `ParserBridgeRequest` | `server.ts` | 转换请求体（requestId、filename、sourceFormat、targetFormat、buffer） |
| `ParserBridgeCancelRequest` | `server.ts` | 取消请求体（requestId + type: 'cancel'） |
| `ParserBridgeProgress` | `server.ts` | 进度上报体（phase、percent、queueLength、message） |
| `ParserBridgeResponse` | `server.ts` | 响应联合类型（convert:result / convert:error / progress） |
| `ConversionTask` | `server.ts` | 内部任务对象，跟踪任务状态和结果 |
| `ProtocolServer` | `server.ts` | 服务器接口（enqueue、cancel、getQueueLength、dispose 等） |

## Flow

### 启动与连接流程

```
1. iframe 加载 main.ts
   │
   ├─ 导入 5 个解析器模块（document/html/image/pdf/txt）
   ├─ 构建 parserNames 列表
   │
   ▼
2. postMessage({ source: 'hamster-parser-runtime', type: 'ready', parserNames })
   │  → 发送给 window.parent (Host)
   │
   ▼
3. Host 收到 ready 消息
   │  → 创建 MessageChannel
   │  → postMessage({ type: 'parser-bridge:connect' }, '*', [channel.port2])
   │
   ▼
4. main.ts 监听 message 事件
   │  → 检测 isConnectMessage && event.ports.length > 0
   │  → createProtocolServer(event.ports[0])
   │
   ▼
5. ProtocolServer 初始化
   ├─ port.addEventListener('message', onMessage)
   ├─ port.start()
   └─ emitReady() → port.postMessage({ type: 'ready' })
```

### 请求处理流程

```
Host 发送请求
  │  port.postMessage({ type: 'convert', requestId, filename, sourceFormat, targetFormat, buffer })
  ▼
server.ts onMessage()
  │  → isParserBridgeRequest(message) 校验
  │  → createTaskFromRequest(message) 创建任务对象
  │  → enqueue(task)
  │
  ▼
enqueue()
  ├─ 检查重复 requestId → rejectDuplicate()
  ├─ knownRequestIds.add(requestId)
  ├─ task.status = 'queued'
  ├─ emitProgress(task, 'queued')
  └─ processNext()
       │
       ▼
processNext() [串行处理，processing 锁]
  ├─ task.status = 'active'
  ├─ processTask(task)
  │    │
  │    ▼
  │  runStages(task) — 逐阶段上报进度
  │    ├─ 'reading'   (15%)
  │    ├─ 'encoding'  (35%)
  │    ├─ 'decoding'  (55%)
  │    ├─ 'rendering' (75%)
  │    └─ 'packaging' (90%)
  │    │
  │    ▼
  │  runConversion(task)
  │    ├─ 校验 sourceFormat / targetFormat
  │    ├─ normalizeConversionOptions(task.options)
  │    ├─ convertRuntime({ filename, sourceFormat, targetFormat, buffer, options })
  │    └─ 返回 ConversionResult[]
  │    │
  │    ▼
  │  completeTask(task, result)
  │    ├─ emitProgress(task, 'completed')
  │    └─ postResponse({ type: 'convert:result', payload })
  │
  ▼
Host 收到结果，更新 UI
```

### 取消流程

```
Host 发送取消请求
  │  port.postMessage({ type: 'cancel', requestId })
  ▼
server.ts cancel(requestId)
  │
  ├─ 任务在队列中？
  │   └─ 是 → queue.splice() 移除 → emitProgress('cancelled') → return true
  │
  ├─ 任务是当前活跃任务？
  │   └─ 是 → cancelledActiveRequestIds.add(requestId) → return true
  │       （在下一个阶段边界 runStages() 或 completeTask() 时生效）
  │
  └─ 否 → return false
```

## Integration

### 上游依赖（被此模块消费）

| 依赖 | 用途 | 加载方式 |
|---|---|---|
| `@hamster-note/document-parser` | 文档解析器 | 静态 import（main.ts） |
| `@hamster-note/html-parser` | HTML 解析器 | 静态 import（main.ts） |
| `@hamster-note/image-parser` | 图片解析器 | 静态 import（main.ts） |
| `@hamster-note/pdf-parser` | PDF 解析器 | 静态 import（main.ts） |
| `@hamster-note/txt-parser` | TXT 解析器 | 静态 import（main.ts） |
| `@hamster-note/types` | `IntermediateDocument` 共享类型 | 静态 import（仅类型） |
| `pdfjs-dist` | PDF 文本提取 & 页面渲染 | 动态 import（conversion/） |
| `pdf-lib` | PDF 页面裁剪/合并 | 动态 import（conversion/） |
| `jspdf` | 生成 PDF 输出 | 动态 import（conversion/） |
| `piexifjs` | JPEG EXIF 元数据读写 | 静态 import（conversion/） |

### 下游消费者（消费此模块的代码）

| 消费者 | 用途 | 通信方式 |
|---|---|---|
| Host `App.tsx` / `ParserIframeBridge` | 发起转换请求，接收结果 | MessageChannel (postMessage) |
| `src/__tests__/conversion-runtime.test.ts` | 转换引擎单元测试 | 直接调用 `convertRuntime()` |
| `src/__tests__/server-integration.test.ts` | 协议服务器集成测试 | Mock MessagePort |
| `src/__tests__/queue.test.ts` | 队列并发/取消语义测试 | Mock MessagePort |
| `src/__tests__/exif.test.ts` | EXIF 剥离单元测试 | 直接调用 EXIF 工具函数 |

### 子目录索引

| 子目录 | Codemap | 职责 |
|---|---|---|
| `conversion/` | [conversion/codemap.md](conversion/codemap.md) | 文档格式转换引擎：13 个适配器 + 路由表 + 工具函数 |
| `lib/` | [lib/codemap.md](lib/codemap.md) | pdfjs-dist 适配层：Worker 配置 + CMap 注入 |
| `types/` | [types/codemap.md](types/codemap.md) | 第三方解析器包的 TypeScript 类型声明 |
| `__tests__/` | — | 单元测试 + 集成测试（4 个测试文件 + fixtures） |

### 协议消息清单

| 方向 | type | 用途 |
|---|---|---|
| iframe → Host | `ready` | 声明运行时就绪，携带 parserNames 列表 |
| Host → iframe | `parser-bridge:connect` | 握手，携带 MessagePort |
| Host → iframe | `convert` | 转换请求 |
| Host → iframe | `cancel` | 取消请求 |
| iframe → Host | `progress` | 进度上报 |
| iframe → Host | `convert:result` | 转换成功结果 |
| iframe → Host | `convert:error` | 转换失败错误 |
