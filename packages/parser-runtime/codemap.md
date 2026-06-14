# packages/parser-runtime/

## Responsibility

`parser-runtime` 是 Hamster 文档转换系统的**沙箱化 iframe 运行时**。它作为独立的 Vite 应用构建，部署到 `/parser-runtime/` 路径下，被宿主页面（Host App）通过 `<iframe>` 加载。其核心职责是：

1. **在 iframe 沙箱内执行所有文档格式转换**，隔离第三方解析器库（pdfjs-dist、pdf-lib、jspdf 等）的副作用，防止影响宿主页面性能与安全。
2. **通过 `MessagePort` 协议与宿主通信**，接收转换请求（含 ArrayBuffer 二进制数据），执行转换后返回结果。
3. **提供任务队列与取消语义**，支持并发请求排队、进度上报、以及正在执行任务的取消（在阶段边界检查）。
4. **适配 pdfjs-dist 的 CJK 文本解码**，通过 Vite 构建插件拦截 `import("pdfjs-dist")` 调用，自动注入 CMap 参数，解决中文 PDF 乱码问题。

## Design

### 文件结构与职责划分

```
packages/parser-runtime/
├── index.html              # iframe 入口 HTML，加载 /src/main.ts
├── package.json            # 包配置，依赖 5 个 @hamster-note 解析器 + PDF 相关库
├── vite.config.ts          # Vite 构建配置，含 2 个自定义插件
├── tsconfig.json           # TypeScript 配置，extends @system-ui-js/development-base
└── src/
    ├── main.ts             # 运行时入口：注册解析器、监听 MessageChannel 连接
    ├── server.ts           # 协议服务器：任务队列、进度上报、取消语义、转换调度
    ├── conversion/         # 格式转换引擎（详见子 codemap.md）
    │   ├── index.ts        # 类型定义 + 适配器路由表 + 统一入口 convertRuntime()
    │   ├── adapters.ts     # 13 个转换适配器的具体实现
    │   ├── utils.ts        # 通用工具函数（blob/缓冲区互转、HTML 布局、Canvas 编码等）
    │   └── exif.ts         # JPEG EXIF 元数据按类别剥离
    ├── lib/                # 第三方库适配层（详见子 codemap.md）
    │   └── pdfjs-wrapper.ts  # pdfjs-dist 包装器：Worker 路径 + CMap 注入
    ├── types/              # 类型声明（详见子 codemap.md）
    │   └── parser-packages.d.ts  # @hamster-note/pdf-parser 模块声明
    └── __tests__/          # 测试套件
        ├── conversion-runtime.test.ts   # 转换逻辑单元测试
        ├── exif.test.ts                 # EXIF 剥离测试
        ├── server-integration.test.ts   # server 层集成测试
        ├── queue.test.ts                # 队列/取消语义测试
        └── fixtures/                    # 测试用文件夹
```

### 核心设计模式

1. **沙箱隔离模式（Sandbox Isolation）**：整个运行时运行在 `<iframe sandbox="allow-scripts allow-same-origin">` 内，通过 `MessagePort` 与宿主单向通信，将第三方库的内存/CPU 开销与安全风险隔离在 iframe 域中。

2. **协议服务器模式（Protocol Server）**：`server.ts` 中的 `createProtocolServer(port)` 实现了一个基于 `MessagePort` 的协议服务器，封装了任务队列（FIFO）、进度阶段（queued → reading → encoding → decoding → rendering → packaging → completed/error/cancelled）、以及取消语义（queued 任务直接移除，active 任务在阶段边界检查）。

3. **策略模式 + 路由表（Strategy + Adapter Map）**：`conversion/index.ts` 将所有源→目标格式对映射到具体的 `RuntimeConversionAdapter` 函数，通过二维路由表 `adapters[source][target]` 进行分发。

4. **动态导入（Lazy Loading）**：所有重型第三方依赖（pdfjs-dist、pdf-lib、jspdf、各 parser 包）均使用 `await import()` 按需加载，减少初始包体积。

5. **构建时拦截（Build-time Interception）**：`vite.config.ts` 中的两个自定义插件：
   - `interceptPdfjsImportPlugin`：将 `@hamster-note/pdf-parser` 内部的 `import("pdfjs-dist")` 重写为 `import("/src/lib/pdfjs-wrapper.ts")`
   - `ensurePdfParserStandardFontUrlPlugin`：修正标准字体 URL 并在构建时拷贝字体资源

6. **中间文档抽象（IntermediateDocument）**：多个转换适配器遵循 `Parser.encode() → IntermediateDocument → Decoder.decode()` 的流水线，将解析与编解码解耦。

### 关键类型

- `ProtocolServer`：协议服务器接口，含 `enqueue()`、`cancel()`、`getQueueLength()`、`getActiveTask()`、`getProgress()`、`dispose()`
- `ConversionTask`：单个转换任务的状态对象，含 requestId、状态机（queued → active → completed/cancelled/error）、进度、结果
- `ConversionRequest` / `ConversionResult`：统一的转换请求与返回体
- `ParserBridgeRequest` / `ParserBridgeResponse`：跨 iframe 的协议消息类型
- `ParserBridgeProgressPhase`：进度阶段枚举，含百分比与消息文本映射

### 错误体系

| 错误码                     | 触发场景                   |
| -------------------------- | -------------------------- |
| `UNSUPPORTED_CONVERSION`   | 不支持的源→目标格式对      |
| `DUPLICATE_REQUEST_ID`     | 重复的请求 ID              |
| `INVALID_PROTOCOL_MESSAGE` | 不符合协议的消息格式       |
| `CONVERSION_FAILED`        | 转换过程中的一般性失败     |
| `OCR_REQUIRED`             | PDF 文本提取失败，需要 OCR |
| `EMPTY_OCR`                | OCR 处理后无文本           |
| `NO_PAGES_SELECTED`        | 页码过滤后为空             |
| `UNSUPPORTED_IMAGE_FORMAT` | SVG/GIF 等不支持的图片格式 |

## Flow

### 1. 初始化与连接建立

```
Host (ParserIframeBridge.tsx)
  │  <iframe src="/parser-runtime/index.html" sandbox="allow-scripts allow-same-origin" />
  ▼
iframe 加载 index.html → main.ts
  │  1. 注册 5 个解析器模块到 parserModules 映射
  │  2. postMessage → window.parent { source: 'hamster-parser-runtime', type: 'ready', parserNames: [...] }
  ▼
Host 收到 'ready' 消息
  │  1. 创建 MessageChannel(port1, port2)
  │  2. iframe.contentWindow.postMessage({ type: 'parser-bridge:connect' }, '*', [port2])
  ▼
main.ts 监听 'message' 事件
  │  1. 提取 event.ports[0]（即 port1 的对端）
  │  2. createProtocolServer(port) → 创建协议服务器
  │  3. 协议服务器发送 { type: 'ready' } 确认连接就绪
  ▼
Host 通过 createBridgeClient(port1) 创建客户端 → 双向 MessagePort 通道建立
```

### 2. 转换请求处理流程

```
Host 调用 bridgeClient.sendConvert(request)
  │  通过 MessagePort 发送 { type: 'convert', requestId, filename, sourceFormat, targetFormat, buffer, options? }
  ▼
server.ts onMessage()
  │  1. isParserBridgeRequest() 校验消息格式
  │  2. createTaskFromRequest() → ConversionTask { status: 'queued' }
  │  3. enqueue(task) → 推入队列，emitProgress('queued')
  │  4. processNext() → 消费队列
  ▼
processTask(task)
  │  1. task.status = 'active'
  │  2. runStages(task) → 逐阶段 emitProgress（reading → encoding → decoding → rendering → packaging）
  │     每个阶段间 yield（nextStageTick），检查 cancelled 状态
  │  3. runConversion(task) → 调用 convertRuntime()（conversion/index.ts）
  │  4. completeTask(task, result) → emitProgress('completed'), postMessage result
  ▼
convertRuntime(request)（conversion/index.ts）
  │  1. 校验 sourceFormat / targetFormat
  │  2. 从 adapters 路由表查找适配器
  │  3. adapter(request) → ConversionResult[]
  ▼
具体适配器（adapters.ts）
  │  - 动态 import 解析器库
  │  - Parser.encode(buffer) → IntermediateDocument
  │  - Decoder.decode(intermediate) → 输出 buffer
  │  - 返回 ConversionResult[]
  ▼
结果通过 MessagePort 返回 Host
```

### 3. 取消流程

```
Host 调用 bridgeClient.sendCancel(requestId)
  │  发送 { type: 'cancel', requestId }
  ▼
server.ts cancel(requestId)
  │
  ├─ 若任务在队列中（queued）→ 直接移除，emitProgress('cancelled')
  │
  └─ 若任务正在执行（active）→ 加入 cancelledActiveRequestIds 集合
     │
     ▼ 在 runStages() 的每个阶段边界检查 → cancelActiveAtBoundary()
        emitProgress('cancelled')
```

### 4. PDF.js CMap 适配流程

```
@hamster-note/pdf-parser 调用 import("pdfjs-dist")
  │
  ▼ (Vite 插件 interceptPdfjsImportPlugin 重写为 import("/src/lib/pdfjs-wrapper.ts"))
  │
pdfjs-wrapper.ts
  │  1. 模块加载时设置 GlobalWorkerOptions.workerSrc
  │  2. wrappedGetDocument(src):
  │     ├─ src 是普通对象且无 cMapUrl → 注入 { cMapUrl: '/cmaps/', cMapPacked: true, useWorkerFetch: true }
  │     └─ 否则 → 保持原样
  │  3. 调用 originalGetDocument(处理后的 src)
  ▼
pdf.js 使用 CMap 数据正确解码 CJK 文本
```

## Integration

### 上游依赖（被此包消费）

| 依赖                             | 用途                                    | 加载方式                       |
| -------------------------------- | --------------------------------------- | ------------------------------ |
| `@hamster-note/document-parser`  | 文档解析器                              | 动态 import                    |
| `@hamster-note/html-parser`      | HTML 编解码器                           | 动态 import（本地 yalc 链接）  |
| `@hamster-note/image-parser`     | 图片 OCR 解析器                         | 动态 import                    |
| `@hamster-note/pdf-parser`       | PDF 解析器                              | 动态 import                    |
| `@hamster-note/txt-parser`       | 文本解析器                              | 动态 import                    |
| `@hamster-note/types`            | 共享类型定义（IntermediateDocument 等） | 静态 import（仅类型）          |
| `pdfjs-dist`                     | PDF 文本提取与页面渲染                  | 动态 import（经 wrapper 适配） |
| `pdf-lib`                        | PDF 页面裁剪/合并                       | 动态 import                    |
| `jspdf`                          | PDF 输出生成                            | 动态 import                    |
| `@system-ui-js/development-base` | 共享 ESLint/Prettier/TSConfig 配置      | devDependency                  |

### 下游消费者（消费此包的代码）

| 消费者                          | 文件路径                                | 交互方式                                                                                   |
| ------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------ |
| ParserIframeBridge（Host 组件） | `src/components/ParserIframeBridge.tsx` | 通过 `<iframe>` 加载运行时，建立 `MessagePort` 通道，调用 `sendConvert()` / `sendCancel()` |
| BridgeClient                    | `src/lib/parser-bridge/client.ts`       | 封装 `MessagePort` 通信协议，提供 Promise 化的 `sendConvert()` API                         |
| Host App                        | `src/App.tsx`                           | 通过 `ParserIframeBridge` ref 调用转换功能                                                 |

### 构建与部署

| 项目     | 值                                            |
| -------- | --------------------------------------------- |
| 开发端口 | 5074（独立于 Host 的 5073）                   |
| 构建输出 | `dist/parser-runtime/`（相对于 monorepo 根）  |
| Base URL | `/parser-runtime/`                            |
| 构建命令 | `yarn build:parser-runtime`（从 monorepo 根） |

### 通信协议概览

```
┌─────────────────────────────────────────────────────────┐
│  Host (ParserIframeBridge)                              │
│                                                         │
│  ┌─ window ─────────────────────────────────────────┐   │
│  │  postMessage { type: 'ready', parserNames }      │   │
│  │  ← iframe 发来的 ready 信号                       │   │
│  │  postMessage { type: 'parser-bridge:connect' }   │   │
│  │  → 携带 MessageChannel port2 发送给 iframe       │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─ MessagePort (port1) ────────────────────────────┐   │
│  │  → sendConvert(request)  → { type: 'convert' }   │   │
│  │  → sendCancel(requestId) → { type: 'cancel'  }   │   │
│  │  ← { type: 'progress', progress }                │   │
│  │  ← { type: 'convert:result', payload }           │   │
│  │  ← { type: 'convert:error', error }              │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
          ║ MessagePort (transferable)
┌─────────╩───────────────────────────────────────────────┐
│  iframe (parser-runtime)                                │
│                                                         │
│  ┌─ MessagePort (port2) ────────────────────────────┐   │
│  │  server.ts: onMessage → enqueue → processNext    │   │
│  │  → convertRuntime() → adapter → ConversionResult │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 子目录 codemap 索引

| 子目录            | codemap 路径                | 核心职责                                    |
| ----------------- | --------------------------- | ------------------------------------------- |
| `src/`            | `src/codemap.md`            | 运行时源码入口                              |
| `src/conversion/` | `src/conversion/codemap.md` | 格式转换引擎：13 个适配器、路由表、工具函数 |
| `src/lib/`        | `src/lib/codemap.md`        | pdfjs-dist 适配层：Worker 配置 + CMap 注入  |
| `src/types/`      | `src/types/codemap.md`      | TypeScript 模块声明                         |
