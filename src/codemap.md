# src/

## Responsibility

src/ 是 Hamster Document Converter 的主应用源码目录。包含 React 应用入口、根组件、以及所有 UI、业务逻辑、国际化和类型定义子模块。负责：

- 应用启动与 React 渲染挂载（`main.tsx`）
- 全局状态管理与文件转换编排（`App.tsx`）
- 组织 UI 组件、工具库、Hook、类型定义和样式资源

## Design

**整体架构**：Vite + React + TypeScript 单页应用，采用组件化 + Hook 架构。

**关键设计模式**：

- **根组件状态编排**：`App.tsx` 作为单一状态源，管理 `FileItem[]` 列表、转换进度、模态框状态。所有子组件通过 props 接收数据和回调。
- **Parser Iframe Bridge**：文档解析在同源 iframe（`/parser-runtime/index.html`）中沙箱执行，host 通过 `<ParserIframeBridge />` 组件 + `convertViaBridge` 代理函数通信。实现了 host 与 parser 运行时的解耦。
- **转换选项分层**：`ConversionOptions` 按格式类型（pdf/html/image/imageToPdf）分别定义选项，通过 `SettingsModal` 让用户逐文件配置。
- **状态机**：`FileItem.status` 遵循 `ready → queued → converting → done/failed` 生命周期。
- **国际化**：通过 `react-i18next` 实现 zh-CN/zh-TW/en 三语言，文案存储在 `i18n/locales/*.json`。
- **主题系统**：CSS 自定义属性（`styles/theme.css`），支持 `prefers-color-scheme` 浅/暗色切换。

**核心抽象**：

| 抽象 | 位置 | 职责 |
|------|------|------|
| `FileItem` | `App.tsx` | 单个待转换文件的完整状态（源文件、目标格式、选项、进度、结果） |
| `ConversionResult` | `lib/converter.ts` | 转换输出（Blob、文件名、MIME 类型、警告） |
| `ParserIframeBridgeRef` | `components/ParserIframeBridge.tsx` | iframe bridge 的 ref 接口，用于发送转换请求 |
| `SourceFormat` / `TargetFormat` | `lib/converter.ts` | 格式类型联合类型，定义支持的转换路径 |

## Flow

**启动流程**：
```
main.tsx
  ├── 导入 styles/theme.css, styles/global.css（全局样式）
  ├── 导入 i18n/（初始化 i18next）
  └── ReactDOM.createRoot → <App />
```

**文件转换数据流**：
```
用户拖拽/选择文件
  → FileDropzone.onFiles()
  → App.onFilesAdded()
    → extToFormat() 识别源格式
    → 创建 FileItem（status: 'ready'）
    → setItems() 更新状态

用户点击 "Convert All"
  → App.convertAll()
    → confirmLargePdfsBeforeConvert() 大文件确认
    → 逐项 convertSingleItem()
      → markConverting(id)
      → convertViaBridge(bridge, file, source, target, options)
        → ParserIframeBridge 发送 postMessage 到 iframe
        → iframe 内 parser-runtime 执行实际转换
        → 返回 ConversionResult[]
      → markDone(id, results) 或 markFailed(id, error)

用户下载
  → 单文件：downloadBlobFile(result)
  → 多文件：downloadResultArchive(results, filename.zip)
```

**渲染结构**：
```
<div className="app">
  <FullscreenLoading />          // 全屏加载遮罩
  <ParserIframeBridge />         // 隐藏的 iframe bridge
  <Header />                     // 顶栏（语言切换等）
  <main className="container">
    <section className="hero">   // 品牌标题区
    <section className="panel">  // 主操作面板
      <FileDropzone />           // 文件拖拽区
      <table>                    // 文件列表表格
      <div className="actions">  // 操作按钮组
  </main>
  <Footer />                     // 底栏
  <ConfirmModal />               // 确认弹窗（大 PDF 提示）
  <PreviewModal />               // 预览弹窗
  <SettingsModal />              // 设置弹窗
</div>
```

## Integration

**内部依赖**：

| 子模块 | 用途 |
|--------|------|
| `components/` | UI 组件：Header、FileDropzone、Footer、各种 Modal、ParserIframeBridge |
| `hooks/` | React Hook：`usePdfPageList` 等 |
| `i18n/` | 国际化配置与文案（zh-CN/zh-TW/en） |
| `lib/` | 工具库：converter 类型定义、download、filename、parser-bridge 代理、pdf-utils、preview |
| `types/` | TypeScript 类型声明（全局类型、第三方库类型） |
| `styles/` | CSS 主题变量与全局样式 |

**外部依赖**：

| 依赖 | 用途 |
|------|------|
| `react` / `react-dom` | UI 框架 |
| `react-i18next` / `i18next` | 国际化 |
| `loglevel` | 日志 |
| `@system-ui-js/development-base` | 共享 ESLint/Prettier/TSConfig 配置 |

**消费者**：

- **parser-runtime iframe**（`/parser-runtime/index.html`）：通过 `ParserIframeBridge` 接收转换请求，执行实际的 PDF/HTML/TXT/image 解析
- **CI/CD**：`.github/workflows/deploy.yml` 构建并部署到 GitHub Pages
- **浏览器**：最终用户通过浏览器访问，拖拽文件进行格式转换

**支持的转换路径**（定义于 `lib/converter.ts`）：

| 源格式 | 可转换为 |
|--------|----------|
| pdf | txt, png, jpg, webp, pdf, html |
| txt | png, html |
| image | pdf, txt, png, jpg, webp, html |
| html | txt |
