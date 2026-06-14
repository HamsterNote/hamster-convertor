# packages/

## Responsibility

此目录是仓鼠文档转换器的**解析器基础设施层**，以 monorepo 子包形式组织，负责在 iframe 沙箱中执行所有文件格式转换操作，并通过标准化的 postMessage 协议与 host 应用通信。

包含两个子包：

- **`parser-protocol/`** — 纯类型包，定义 host ↔ iframe 之间的桥接通信协议（消息类型、类型守卫、解析器类型声明）
- **`parser-runtime/`** — iframe 运行时，实际执行 PDF/HTML/TXT/Image 之间的格式转换，内含转换引擎、任务队列、pdf.js 适配层

核心职责：

1. 将文档转换逻辑隔离在同源 iframe 内，避免阻塞 host 主线程
2. 提供统一的请求-响应-进度协议，host 无需了解具体解析器细节
3. 支持 13 种源→目标格式转换组合（PDF/TXT/Image/HTML → HTML/TXT/PNG/JPG/WebP/PDF）

## Design

### 架构分层

```
┌─────────────────────────────────────────────────────────────────────┐
│  Host 应用 (src/)                                                    │
│  ├─ ParserIframeBridge.tsx — React 组件，管理 iframe 生命周期         │
│  ├─ lib/parser-bridge/proxy.ts — 发送转换请求的代理层                 │
│  └─ App.tsx — 调用 proxy 发起转换                                    │
├─────────────────────────────────────────────────────────────────────┤
│  协议层: @hamster-note/parser-protocol                               │
│  ├─ 消息类型 (ParserBridgeRequest/Response/Progress/Ready)           │
│  ├─ 运行时类型守卫 (isParserBridgeRequest 等)                        │
│  └─ 解析器包类型声明 (.d.ts) + 派生类型别名                           │
├─────────────────────────────────────────────────────────────────────┤
│  运行时层: @hamster-note/parser-runtime                              │
│  ├─ main.ts — iframe 入口，注册解析器，建立 MessagePort 连接          │
│  ├─ server.ts — 协议服务器，任务队列，进度推送，取消语义              │
│  ├─ conversion/ — 转换引擎（路由表 + 13 个适配器 + 工具函数）        │
│  └─ lib/ — pdfjs-dist 适配层（Worker 配置 + CJK 文本支持）           │
├─────────────────────────────────────────────────────────────────────┤
│  外部解析器包 (@hamster-note/*-parser)                               │
│  ├─ pdf-parser — PDF 编解码                                         │
│  ├─ html-parser — HTML 编解码                                       │
│  ├─ image-parser — 图片 OCR + 编解码                                │
│  ├─ txt-parser — 纯文本编解码                                       │
│  └─ document-parser — 通用文档解析                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 关键设计模式

| 模式                     | 应用位置                 | 说明                                                                               |
| ------------------------ | ------------------------ | ---------------------------------------------------------------------------------- |
| **策略模式**             | `conversion/adapters.ts` | 每个源→目标格式对对应一个 `RuntimeConversionAdapter` 函数                          |
| **路由表模式**           | `conversion/index.ts`    | `adapters` 二维映射 `Record<SourceFormat, Partial<Record<TargetFormat, Adapter>>>` |
| **请求-响应 + 进度推送** | `server.ts`              | 通过 MessagePort 实现异步转换，支持多次进度报告                                    |
| **中间文档抽象**         | 各适配器                 | `encode()` → `IntermediateDocument` → `decode()` 流水线                            |
| **动态导入**             | `adapters.ts`            | 所有外部依赖使用 `await import()` 懒加载，减少首屏体积                             |
| **包装器模式**           | `lib/pdfjs-wrapper.ts`   | 包装 pdfjs-dist，自动注入 CMap 配置解决 CJK 乱码                                   |
| **类型推断链**           | `parser-protocol/src/`   | `.d.ts` → `typeof import(...)` → 类型别名 → 下游消费                               |
| **容错降级链**           | `conversion/adapters.ts` | PDF→TXT 先尝试 pdf-parser，失败降级到 pdfjs-dist                                   |

### 桥接通信协议

所有消息通过 `MessagePort.postMessage()` 传递（非直接 `window.postMessage`）：

| 方向          | 消息类型         | 载荷                                                                    |
| ------------- | ---------------- | ----------------------------------------------------------------------- |
| iframe → host | `ready`          | `{ source: 'hamster-parser-runtime', parserNames: string[] }`           |
| host → iframe | `convert`        | `{ requestId, filename, sourceFormat, targetFormat, buffer, options? }` |
| iframe → host | `progress`       | `{ requestId, phase, percent, queueLength, message? }`                  |
| iframe → host | `convert:result` | `{ requestId, payload: { filename, mimeType, targetFormat, buffer } }`  |
| iframe → host | `convert:error`  | `{ requestId, error: { code, message, details? } }`                     |
| host → iframe | `cancel`         | `{ requestId }`                                                         |

### 转换矩阵

| 源 \ 目标 | html | txt | png | jpg | webp | pdf |
| :-------: | :--: | :-: | :-: | :-: | :--: | :-: |
|  **pdf**  |  ✓   |  ✓  |  ✓  |  ✓  |  ✓   |  ✓  |
|  **txt**  |  ✓   |  —  |  ✓  |  ✓  |  ✓   |  —  |
| **image** |  ✓   |  ✓  |  ✓  |  ✓  |  ✓   |  ✓  |
| **html**  |  —   |  ✓  |  —  |  —  |  —   |  —  |

## Flow

### 完整转换流程

```
用户在 App.tsx 选择文件并点击转换
  │
  ▼
ParserIframeBridge.tsx
  │  1. 挂载 <iframe src="/parser-runtime/index.html">
  │  2. 监听 iframe 的 'ready' 消息
  │  3. 通过 MessageChannel 建立专用端口连接
  │
  ▼
lib/parser-bridge/proxy.ts
  │  4. 调用 convertFile(buffer, sourceFormat, targetFormat, options)
  │  5. 构造 ParserBridgeRequest { requestId, type:'convert', ... }
  │  6. 通过 MessagePort 发送给 iframe
  │
  ▼ ═══════════════ postMessage 边界 ═══════════════
  │
parser-runtime/main.ts
  │  7. 接收 'parser-bridge:connect' 消息，建立 MessagePort
  │  8. 创建 ProtocolServer 实例
  │
  ▼
server.ts (createProtocolServer)
  │  9. 解析消息 → isParserBridgeRequest() 验证
  │ 10. 创建 ConversionTask，加入队列
  │ 11. 发送 progress { phase: 'queued' }
  │ 12. processNext() 串行处理队列
  │
  ▼
conversion/index.ts (convertRuntime)
  │ 13. 校验 sourceFormat/targetFormat
  │ 14. 从 adapters 路由表查找适配器
  │ 15. 调用适配器函数
  │
  ▼
conversion/adapters.ts (具体适配器)
  │ 16. 动态导入所需解析器包
  │ 17. 执行转换逻辑（可能经过 IntermediateDocument 中间格式）
  │ 18. 返回 ConversionResult[]
  │
  ▼
server.ts
  │ 19. 发送 progress { phase: 'completed' }
  │ 20. 发送 convert:result { payload: results }
  │
  ▼ ═══════════════ postMessage 边界 ═══════════════
  │
ParserIframeBridge.tsx
  │ 21. 接收结果，回调给 App.tsx
  │
  ▼
App.tsx — 更新 UI，显示转换结果
```

### 任务队列与取消语义

```
enqueue(task) → 推入队列 → emitProgress('queued')
  │
  ▼
processNext() 循环:
  ├─ 取出队首任务 → status = 'active'
  ├─ runStages() 依次推送 reading → encoding → decoding → rendering → packaging
  ├─ 每个阶段检查 cancelledActiveRequestIds（支持阶段间取消）
  ├─ runConversion() 执行实际转换
  └─ completeTask() 或 handleTaskError()

cancel(requestId):
  ├─ 若在队列中 → 直接移除，emitProgress('cancelled')
  └─ 若正在执行 → 加入 cancelledActiveRequestIds，等当前阶段结束后取消
```

## Integration

### 子包依赖关系

```
@hamster-note/parser-protocol (纯类型，无运行时)
  │
  │  类型导出
  ▼
@hamster-note/parser-runtime (运行时)
  │
  │  动态导入
  ▼
@hamster-note/*-parser (外部解析器包)
  ├─ pdf-parser
  ├─ html-parser
  ├─ image-parser
  ├─ txt-parser
  ├─ document-parser
  └─ types (共享类型：IntermediateDocument)
```

### 上游依赖（被 packages/ 消费）

| 依赖                            | 类型               | 用途                              |
| ------------------------------- | ------------------ | --------------------------------- |
| `@hamster-note/pdf-parser`      | 运行时（动态导入） | PDF 编解码，中间文档生成          |
| `@hamster-note/html-parser`     | 运行时（动态导入） | HTML 编解码                       |
| `@hamster-note/image-parser`    | 运行时（动态导入） | 图片 OCR、格式转换                |
| `@hamster-note/txt-parser`      | 运行时（动态导入） | 纯文本编解码                      |
| `@hamster-note/document-parser` | 运行时（动态导入） | 通用文档解析                      |
| `@hamster-note/types`           | 编译期类型         | `IntermediateDocument` 等共享类型 |
| `pdfjs-dist`                    | 运行时（动态导入） | PDF 文本提取、页面渲染            |
| `pdf-lib`                       | 运行时（动态导入） | PDF 页面裁剪/合并                 |
| `jspdf`                         | 运行时（动态导入） | PDF 输出生成                      |
| `piexifjs`                      | 运行时（静态导入） | JPEG EXIF 元数据读写              |

### 下游消费者（消费 packages/ 的代码）

| 消费者                                  | 导入内容                   | 用途                                                          |
| --------------------------------------- | -------------------------- | ------------------------------------------------------------- |
| `src/components/ParserIframeBridge.tsx` | 协议消息类型 + 守卫函数    | React 组件中管理 iframe 生命周期、处理消息                    |
| `src/lib/parser-bridge/proxy.ts`        | `ParserBridgeRequest` 类型 | 向 iframe 发送转换请求                                        |
| `src/lib/parser-bridge/client.ts`       | 协议消息类型 + 守卫函数    | iframe 端消息验证                                             |
| `src/App.tsx`                           | 间接依赖                   | 通过 ParserIframeBridge 触发转换                              |
| `src/__tests__/*.test.tsx`              | 协议类型                   | 构造测试用的模拟数据                                          |
| 根 `vite.config.ts`                     | `parser-runtime` 构建产物  | 将 `/parser-runtime/` 路径代理到 iframe 运行时                |
| 根 `tsconfig.json`                      | `parser-protocol` 源码路径 | TypeScript 项目引用，路径别名 `@hamster-note/parser-protocol` |

### 构建集成

```bash
# 根 package.json 中的构建命令
yarn build:parser-runtime    # cd packages/parser-runtime && yarn build
yarn build                   # 先构建 parser-runtime，再构建 host（vite build）

# parser-runtime 构建产物输出到
dist/parser-runtime/         # 包含 index.html + 所有 JS/CSS 资源

# parser-protocol 仅用于编译期类型
# 通过 tsconfig.json 的 references + paths 映射，无需单独构建即可被 host 消费
```

### Vite 插件（parser-runtime 构建时）

| 插件                                   | 作用                                                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `interceptPdfjsImportPlugin`           | 将 `@hamster-note/pdf-parser` 中的 `import("pdfjs-dist")` 重写为 `/src/lib/pdfjs-wrapper.ts`，解决 CJK 文本乱码 |
| `ensurePdfParserStandardFontUrlPlugin` | 确保 pdf-parser 的标准字体 URL 格式正确，并在构建时复制字体文件                                                 |

### 文件结构

```
packages/
├── codemap.md                          # 本文件
├── parser-protocol/                    # @hamster-note/parser-protocol
│   ├── package.json                    # 纯类型包，无运行时依赖
│   ├── tsconfig.json
│   ├── codemap.md
│   └── src/
│       ├── index.ts                    # 协议类型定义 + 类型守卫 + 解析器类型别名
│       ├── codemap.md
│       └── types/
│           ├── codemap.md
│           ├── document-parser.d.ts    # @hamster-note/document-parser 类型声明
│           ├── html-parser.d.ts        # @hamster-note/html-parser 类型声明
│           ├── image-parser.d.ts       # @hamster-note/image-parser 类型声明
│           ├── pdf-parser.d.ts         # @hamster-note/pdf-parser 类型声明
│           └── txt-parser.d.ts         # @hamster-note/txt-parser 类型声明
└── parser-runtime/                     # @hamster-note/parser-runtime
    ├── package.json                    # 运行时包，依赖各解析器 + PDF 库
    ├── tsconfig.json
    ├── vite.config.ts                  # Vite 配置 + 两个自定义插件
    ├── index.html                      # iframe 入口 HTML
    ├── codemap.md
    └── src/
        ├── main.ts                     # iframe 入口，注册解析器，建立连接
        ├── server.ts                   # 协议服务器，任务队列，进度推送
        ├── codemap.md
        ├── types/
        │   ├── codemap.md
        │   └── parser-packages.d.ts    # 缺失类型声明的补充
        ├── conversion/
        │   ├── codemap.md
        │   ├── index.ts               # 类型定义 + 路由表 + convertRuntime() 入口
        │   ├── adapters.ts            # 13 个转换适配器实现
        │   ├── exif.ts                # JPEG EXIF 元数据剥离
        │   └── utils.ts               # 通用工具函数
        ├── lib/
        │   ├── codemap.md
        │   └── pdfjs-wrapper.ts       # pdfjs-dist 包装器（Worker + CMap 配置）
        └── __tests__/
            ├── conversion-runtime.test.ts
            ├── exif.test.ts
            ├── server-integration.test.ts
            ├── queue.test.ts
            └── fixtures/
                └── exif.ts
```
