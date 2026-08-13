# src/lib/parser-bridge/

## Responsibility

parser-bridge 是宿主应用与 iframe 隔离的解析器运行时之间的通信桥梁。它封装了基于 `MessagePort` 的双向消息协议，提供类型安全的请求-响应机制，使应用层无需关心底层 postMessage 细节即可发起文档转换请求。

核心职责：

- 管理 MessagePort 连接的生命周期（创建、就绪检测、销毁）
- 维护待处理请求队列，支持超时、取消、进度查询
- 将底层消息协议抽象为 Promise-based API
- 提供类型化的错误码体系（`BridgeError` / `BridgeErrorCode`）

## Design

### 架构分层

```
App.tsx（应用层）
    ↓ 调用
proxy.ts（高层代理：File → ConversionResult[]）
    ↓ 委托
ParserIframeBridge.tsx（React 组件：iframe 生命周期管理）
    ↓ 使用
client.ts（底层客户端：MessagePort 消息收发）
    ↓ 依赖
url.ts（工具：解析器运行时 URL 解析）
```

### 关键模式

1. **Bridge 模式**：通过 `MessageChannel` 在宿主与 iframe 间建立专用、安全的通信通道，避免使用 `window.postMessage` 的全局广播。

2. **工厂函数**：`createBridgeClient(port: MessagePort)` 创建绑定到特定端口的客户端实例，内部维护 `Map<string, PendingRequest>` 跟踪未完成请求。

3. **状态机**：`BridgeStatus` 类型定义了 `idle → loading → ready | error` 的状态转换，由 `ParserIframeBridge` 组件管理。

4. **请求 ID 生成**：`generateRequestId()` 使用 `crypto.randomUUID()` 或回退方案生成唯一标识符，确保请求可追踪。

### 核心类型

```typescript
// 客户端接口
type BridgeClient = {
  sendConvert(
    request: ParserBridgeRequest
  ): Promise<ConversionResultPayload | ConversionResultPayload[]>
  sendCancel(requestId: string): Promise<void>
  getProgress(): ParserBridgeProgress | null
  dispose(): void
}

// 代理层结果
type ConversionResult = {
  filename: string
  mimeType: string
  targetFormat: TargetFormat
  blob: Blob
  warnings?: string[]
}
```

### 错误处理

`BridgeErrorCode` 枚举了五种错误场景：

- `IFRAME_LOAD_TIMEOUT`：iframe 加载超时
- `BRIDGE_DISPOSED`：桥接已销毁
- `DUPLICATE_REQUEST_ID`：重复请求 ID
- `UNKNOWN_REQUEST_ID`：未知请求 ID（取消时）
- `CONVERT_TIMEOUT`：转换超时（默认 120 秒）

## Flow

### 转换请求完整流程

```
1. App 调用 convertViaBridge(bridgeRef, file, 'pdf', 'html', options)
           ↓
2. proxy.ts 读取文件为 ArrayBuffer
           ↓
3. 构造 ParserBridgeRequest（含 generateRequestId()）
           ↓
4. 调用 bridgeRef.convert(request) → 委托给 BridgeClient.sendConvert()
           ↓
5. client.ts 将请求存入 pending Map，设置 120s 超时，通过 port.postMessage() 发送
           ↓
6. iframe 内的解析器运行时接收消息，执行转换
           ↓
7. 运行时通过同一 MessagePort 发回 convert:result 或 convert:error
           ↓
8. client.ts 的 handleMessage 匹配 requestId，清除超时，resolve/reject Promise
           ↓
9. proxy.ts 将 payload 转换为 ConversionResult[]（含 Blob 构造）
           ↓
10. App 接收结果，更新 UI 状态
```

### 取消流程

```
App 调用 bridgeRef.cancel(requestId)
    ↓
BridgeClient.sendCancel() 清除 pending 条目，reject Promise
    ↓
通过 port.postMessage({ type: 'cancel', requestId }) 通知运行时
    ↓
运行时中止正在进行的转换任务
```

### 连接建立流程

```
1. ParserIframeBridge 挂载，创建 iframe（src=getParserRuntimeUrl()）
2. iframe 加载完成，发送 { type: 'ready' } 到 window
3. 组件创建 MessageChannel，得到 port1 + port2
4. 通过 iframe.contentWindow.postMessage 转移 port2 到 iframe
5. 用 port1 创建 BridgeClient，状态变为 ready
```

## Integration

### 上游依赖

| 依赖                                    | 用途                                                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `@hamster-note/parser-protocol`         | 定义协议消息类型（`ParserBridgeRequest`、`ParserBridgeProgress`、`ParserBridgeConversionResultPayload` 等） |
| `src/lib/converter.ts`                  | 提供 `TargetFormat` 类型定义                                                                                |
| `src/components/ParserIframeBridge.tsx` | React 组件层，管理 iframe 生命周期并暴露 `ParserIframeBridgeRef` 接口                                       |

### 下游消费者

| 消费者                   | 使用方式                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `src/App.tsx`            | 导入 `convertViaBridge`，在 `convertAll()` 中调用；渲染 `<ParserIframeBridge>` 组件 |
| `ParserIframeBridge.tsx` | 导入 `createBridgeClient`、`BridgeError`、`BridgeErrorCode`、`getParserRuntimeUrl`  |

### 文件职责映射

| 文件        | 职责                                                                   |
| ----------- | ---------------------------------------------------------------------- |
| `client.ts` | 底层 MessagePort 客户端：请求收发、超时管理、错误处理                  |
| `proxy.ts`  | 高层代理：File → ArrayBuffer → Request → Response → ConversionResult[] |
| `url.ts`    | 工具函数：根据 BASE_URL 解析 parser-runtime/index.html 路径            |

### 外部系统

- **parser-runtime iframe**：独立构建的解析器运行时（`public/parser-runtime/index.html`），在同源 iframe 中执行实际的 PDF/HTML/TXT/Image 解析
- **MessageChannel API**：浏览器原生 API，提供专用的双向通信通道
