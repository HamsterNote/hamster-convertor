# 变更提案：集成 @hamster-note/html-parser 转换支持

## 背景与目标

### 原始需求

接入 `@hamster-note/html-parser`，支持以下转换路径：

- **PDF → HTML**：将 PDF 文档转换为 HTML 格式
- **TXT → HTML**：将纯文本转换为 HTML 格式
- **HTML → TXT**：将 HTML 文档提取为纯文本

### 当前状态

项目已支持基本的文档转换界面，但核心转换逻辑需要接入专用的解析器库。本次变更将 `@hamster-note/html-parser` 集成到现有的转换器架构中。

## 变更内容

### 核心变更

1. **转换器架构扩展**
   - 在 `src/lib/converter.ts` 中支持 `SourceFormat = 'pdf' | 'txt' | 'image' | 'html'`
   - 将所有请求的转换注册到适配器映射表中
   - 重构 PDF → HTML 的实现，从 `convertFile()` 的特殊情况移入 `pdf.html` 适配器行为

2. **UI 源格式检测**
   - 在 `src/App.tsx` 中接受 `.html` 和 `.htm` 输入
   - 通过现有的下拉流程暴露有效目标格式

3. **国际化支持**
   - 在 `src/i18n/locales/en.json`、`zh-CN.json` 和 `zh-TW.json` 中添加 `formats.targets.html` 标签

### 实现能力

- [x] PDF → HTML：通过适配器映射表路由，保持现有输出行为不变
- [x] TXT → HTML：使用解析器中间表示，转义 HTML 敏感字符
- [x] HTML → TXT：提取可见文本，按页顺序连接，去除标签
- [x] 不支持的转换对仍返回现有的错误处理
- [x] 所有 QA 验证均由代理自动执行

### 影响范围

- **前端界面**：文件上传、格式检测、目标下拉菜单
- **转换核心**：适配器映射表、解析器集成
- **测试覆盖**：单元测试、集成测试、端到端测试
- **国际化**：三个语言文件的标签更新

## 验证标准

### 定义完成（可验证条件）

- `yarn vitest run src/__tests__/converter.contract.test.ts src/__tests__/converter.txt-adapter.test.ts src/__tests__/convert.integration.test.ts` 通过
- `yarn playwright test e2e/app.spec.ts --project=chromium` 通过
- `yarn lint && yarn build` 通过
- 没有源文件将转换后的 HTML 渲染到 React DOM 中
- 输出下载使用正确的扩展名和 MIME 类型：`.html` → `text/html`，`.txt` → `text/plain`

## 交付成果

- 统一的转换器适配器注册（PDF → HTML、TXT → HTML、HTML → TXT）
- UI 源格式支持和 i18n 目标标签
- 使用现有 Vitest/Playwright 基础设施的测试后覆盖
- 所有转换路径的代理执行 QA 证据
