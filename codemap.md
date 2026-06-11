# Repository Atlas: hamster-convertor

## Project Responsibility

Hamster Document Converter — 免费、简洁的多语言文档格式转换前端。基于 Vite + React + TypeScript 构建，支持 PDF/TXT/HTML/Image 之间的格式转换。核心转换逻辑在同源 iframe 沙箱中执行，通过 postMessage 协议与 host 应用通信。

## System Entry Points

| Entry Point | Location | Purpose |
|-------------|----------|---------|
| 应用入口 | `src/main.tsx` | React 渲染挂载，加载全局样式和 i18n |
| 根组件 | `src/App.tsx` | 状态编排、文件管理、转换调度 |
| iframe 入口 | `packages/parser-runtime/src/main.ts` | 沙箱运行时初始化，建立 MessagePort 连接 |
| 协议定义 | `packages/parser-protocol/src/index.ts` | 桥接通信消息类型和类型守卫 |
| Vite 配置 | `vite.config.ts` | Host 构建配置，含 pdfjs CMap 拦截插件 |
| 构建入口 | `package.json` | yarn build = parser-runtime + vite build |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser                                                         │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Host App (src/)                                           │  │
│  │  ├─ App.tsx — FileItem[] 状态管理 + 转换编排               │  │
│  │  ├─ components/ — UI 组件（Header, FileDropzone, Modals）  │  │
│  │  ├─ lib/parser-bridge/ — MessagePort 客户端 + 代理         │  │
│  │  └─ i18n/ — 三语言国际化                                   │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │  Iframe Sandbox (parser-runtime/)                          │  │
│  │  ├─ server.ts — ProtocolServer + 任务队列                  │  │
│  │  ├─ conversion/ — 13 种格式转换适配器                      │  │
│  │  └─ lib/pdfjs-wrapper.ts — CJK 文本支持                   │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │  Shared Protocol (@hamster-note/parser-protocol)           │  │
│  │  └─ 纯类型包：消息类型 + 类型守卫 + 解析器类型声明         │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Directory Map (Aggregated)

| Directory | Responsibility Summary | Detailed Map |
|-----------|------------------------|--------------|
| `src/` | 主应用源码：React 入口、根组件、状态管理、转换编排 | [View Map](src/codemap.md) |
| `src/components/` | UI 组件：模态框、文件上传、Header/Footer、解析器桥接 | [View Map](src/components/codemap.md) |
| `src/hooks/` | React Hook：PDF 页面列表加载与缩略图懒渲染 | [View Map](src/hooks/codemap.md) |
| `src/i18n/` | 国际化：i18next 三语言（zh-CN/zh-TW/en） | [View Map](src/i18n/codemap.md) |
| `src/lib/` | 工具库：转换类型定义、下载、文件名处理、PDF 工具、预览 | [View Map](src/lib/codemap.md) |
| `src/lib/parser-bridge/` | 宿主↔iframe 通信：MessagePort 客户端、代理、URL 工具 | [View Map](src/lib/parser-bridge/codemap.md) |
| `src/types/` | TypeScript 类型声明：第三方库和内部解析器模块 | [View Map](src/types/codemap.md) |
| `packages/` | 解析器基础设施层：iframe 沙箱 + 通信协议 | [View Map](packages/codemap.md) |
| `packages/parser-protocol/` | 纯类型包：host↔iframe 桥接通信协议定义 | [View Map](packages/parser-protocol/codemap.md) |
| `packages/parser-runtime/` | iframe 运行时：格式转换引擎 + 任务队列 + pdf.js 适配 | [View Map](packages/parser-runtime/codemap.md) |

## Supported Conversion Matrix

| Source → Target | HTML | TXT | PNG | JPG | WebP | PDF |
|-----------------|------|-----|-----|-----|------|-----|
| **PDF**         | ✅   | ✅  | ✅  | ✅  | ✅   | —   |
| **TXT**         | ✅   | —   | —   | —   | —    | —   |
| **Image**       | ✅   | ✅  | ✅  | ✅  | ✅   | ✅  |
| **HTML**        | —    | ✅  | —   | —   | —    | —   |

## Key Commands

```bash
yarn dev                  # 开发服务器 (port 5073)
yarn build                # 生产构建 (parser-runtime + vite)
yarn test:run             # 单元测试 (vitest)
yarn test:e2e             # 端到端测试 (playwright)
yarn lint                 # ESLint 检查
yarn format               # Prettier 格式化
```
