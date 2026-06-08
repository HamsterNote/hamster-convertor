# 任务清单

## 执行波次 1：基础架构

### Task 1：重构转换器路由并添加解析器支持的适配器

**状态**: ✅ 已完成
**提交**: `feat(converter): route html parser conversions through adapters`
**文件**: `src/lib/converter.ts`, 可选的转换器适配器文件

- [x] 1.1 在 `src/lib/converter.ts` 中添加 `html` 到 `SourceFormat`
- [x] 1.2 从 `convertFile()` 中移除 PDF → HTML 的特殊情况
- [x] 1.3 在适配器映射表中注册 `pdf.html`
- [x] 1.4 在适配器映射表中注册 `txt.html`
- [x] 1.5 在适配器映射表中注册 `html.txt`
- [x] 1.6 实现 TXT → HTML 适配器（使用中间文档 + `HtmlParser.decode()`）
- [x] 1.7 实现 HTML → TXT 适配器（使用 `HtmlParser.encode()` + 可见文本提取）
- [x] 1.8 保持 `convertFile()` 作为通用适配器查找

**验收标准**:

- [x] `getSupportedTargets('pdf')` 通过适配器映射表包含 `html`
- [x] `getSupportedTargets('txt')` 包含 `html`
- [x] `getSupportedTargets('html')` 返回 `['txt']`
- [x] PDF → HTML 输出保持 `.html` 和 `text/html` MIME
- [x] TXT → HTML 输出转义 HTML，不执行标记
- [x] HTML → TXT 输出确定性可见文本

### Task 2：更新 UI 源检测和 i18n 标签

**状态**: ✅ 已完成
**提交**: `feat(ui): expose html conversion targets`
**文件**: `src/App.tsx`, `src/i18n/locales/*.json`

- [x] 2.1 在 `src/App.tsx` 的 `extToFormat()` 中映射 `.html` 和 `.htm` 到 `html`
- [x] 2.2 在 `SUPPORTED_FORMATS` 中添加 `html`
- [x] 2.3 在 `src/i18n/locales/en.json` 中添加 `formats.targets.html`
- [x] 2.4 在 `src/i18n/locales/zh-CN.json` 中添加 `formats.targets.html`
- [x] 2.5 在 `src/i18n/locales/zh-TW.json` 中添加 `formats.targets.html`

**验收标准**:

- [x] `.html` 上传被接受为源格式 `html`
- [x] `.htm` 上传被接受为源格式 `html`
- [x] HTML 在所有三种语言中作为目标标签显示

### Task 3：扩展测试模拟和夹具

**状态**: ✅ 已完成
**提交**: `test(converter): add html parser fixtures and mocks`
**文件**: `src/test/mocks/html-parser.ts`, `src/test/fixtures.ts`, `src/test/fixtures/sample.html`

- [x] 3.1 更新 `HtmlParser.encode()` 模拟
- [x] 3.2 更新 `HtmlParser.decode()` 模拟
- [x] 3.3 更新 `HtmlParser.decodeToHtml()` 模拟
- [x] 3.4 添加 `src/test/fixtures/sample.html`（包含嵌套标签和 HTML 敏感内容）
- [x] 3.5 扩展 `src/test/fixtures.ts` 添加 `loadHtmlFixture()`

**验收标准**:

- [x] 测试可以构建确定性的模拟 HTML 解析器输出
- [x] `loadHtmlFixture()` 返回浏览器兼容的 `File`
- [x] 夹具包含嵌套可见文本和 HTML 敏感字符

## 执行波次 2：测试覆盖

### Task 4：添加单元和集成测试覆盖

**状态**: ✅ 已完成
**提交**: `test(converter): cover html parser conversion paths`
**文件**: `src/__tests__/converter.contract.test.ts`, `src/__tests__/converter.txt-adapter.test.ts`, `src/__tests__/convert.integration.test.ts`

- [x] 4.1 扩展合同测试验证支持的目标格式
- [x] 4.2 添加 TXT → HTML 适配器测试（验证转义和行保留）
- [x] 4.3 添加 HTML → TXT 适配器测试（验证可见文本提取顺序）
- [x] 4.4 扩展集成测试覆盖 PDF → HTML 和 HTML → TXT
- [x] 4.5 使用 `normalizeHtml()` 进行 HTML 输出比较

**验收标准**:

- [x] `yarn vitest run src/__tests__/converter.contract.test.ts src/__tests__/converter.txt-adapter.test.ts src/__tests__/convert.integration.test.ts` 通过
- [x] 测试断言 `pdf -> html`、`txt -> html`、`html -> txt` 的目标支持
- [x] 测试断言 HTML 敏感 TXT 输入不会变成可执行的原始标记
- [x] 测试断言 HTML → TXT 排除标签并保留可见文本顺序

### Task 5：添加 Playwright 端到端测试

**状态**: ✅ 已完成
**提交**: `test(e2e): verify html parser conversion workflows`
**文件**: `e2e/app.spec.ts`

- [x] 5.1 添加 PDF → HTML UI 场景
- [x] 5.2 添加 TXT → HTML UI 场景
- [x] 5.3 添加 HTML → TXT UI 场景
- [x] 5.4 验证文件行成功状态
- [x] 5.5 验证下载扩展名和 MIME 类型

**验收标准**:

- [x] `yarn playwright test e2e/app.spec.ts --project=chromium` 通过
- [x] 端到端验证 PDF → HTML 转换达到成功状态
- [x] 端到端验证 TXT → HTML 转换产生 `.html` 输出
- [x] 端到端验证 HTML → TXT 转换产生 `.txt` 输出

## 执行波次 3：验证强化

### Task 6：全面验证和回归强化

**状态**: ✅ 已完成
**提交**: `chore: validate html parser integration`
**文件**: 仅修复验证失败所需的文件

- [x] 6.1 运行目标 Vitest 套件
- [x] 6.2 运行完整 Vitest（如可行）
- [x] 6.3 运行 Playwright chromium 套件
- [x] 6.4 运行 lint 和生产构建
- [x] 6.5 修复任何类型、lint、测试或构建失败
- [x] 6.6 确认没有引入 `dangerouslySetInnerHTML`
- [x] 6.7 捕获命令输出作为证据

**验收标准**:

- [x] `yarn vitest run src/__tests__/converter.contract.test.ts src/__tests__/converter.txt-adapter.test.ts src/__tests__/convert.integration.test.ts` 通过
- [x] `yarn test:run` 通过或记录无关的预先存在失败
- [x] `yarn playwright test e2e/app.spec.ts --project=chromium` 通过
- [x] `yarn lint && yarn build` 通过
- [x] 搜索确认没有新的 `dangerouslySetInnerHTML` 使用

## 最终验证波次（强制）

> 4 个审查代理并行运行。所有代理必须批准。

- [x] F1. 计划合规审计 — oracle
- [x] F2. 代码质量审查 — unspecified-high
- [x] F3. 实际手动 QA — unspecified-high (+ playwright 如果涉及 UI)
- [x] F4. 范围保真度检查 — deep

## 成功标准

- [x] 用户可以上传 PDF 并通过相同的 UI 流程选择/生成 HTML
- [x] 用户可以上传 TXT 并通过相同的 UI 流程选择/生成 HTML
- [x] 用户可以上传 HTML/HTM 并通过相同的 UI 流程选择/生成 TXT
- [x] 转换器路由基于适配器映射表，没有 PDF → HTML 特殊情况在 `convertFile()` 中
- [x] 所有必需的 Vitest、Playwright、lint 和构建命令通过
