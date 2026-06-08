# 设计文档：@hamster-note/html-parser 集成

## 背景上下文

### 技术栈

- **前端框架**：Vite + React + TypeScript
- **代码规范**：ESLint + Prettier，TypeScript 无 `any`
- **测试框架**：Vitest（单元/集成）+ Playwright（端到端）
- **模块化**：ESM（`"type": "module"）
- **架构模式**：基于适配器映射表的转换器架构

### 现有架构

项目使用基于适配器映射表的转换器架构：

- `src/lib/converter.ts`：调度器、动态导入、适配器映射表
- `src/lib/converter/pdf-adapters.ts`：PDF 适配器实现
- `src/lib/converter/txt-adapter.ts`：TXT 适配器实现
- `src/types/html-parser.d.ts`：`HtmlParser` 类型定义

## 目标与非目标

### 目标

- [x] 支持 PDF → HTML、TXT → HTML、HTML → TXT 转换
- [x] 重构 PDF → HTML 到适配器映射表，不改动输出行为
- [x] 保持现有转换器架构，不引入新抽象
- [x] 使用 `@hamster-note/html-parser` 的 `encode()` 和 `decode()` API

### 非目标

- [ ] 添加预览、编辑器、清理器 UI
- [ ] 添加服务器 API、批量 ZIP、Markdown、DOCX、EPUB 支持
- [ ] 在 React DOM 中渲染转换后的 HTML（避免 XSS）
- [ ] 放宽 TypeScript 类型约束

## 关键决策

### 决策 1：重构 PDF → HTML 到适配器映射表

**决策内容**：将现有的 PDF → HTML 特殊处理从 `convertFile()` 移入 `adapters.pdf.html`

**选择原因**：

- 统一所有转换路径到适配器架构
- 消除 `convertFile()` 中的特殊情况代码
- 便于测试和维护

**备选方案**：保留 PDF → HTML 作为 `convertFile()` 中的特殊情况

**不采用原因**：违反统一架构原则，增加代码复杂度

### 决策 2：TXT → HTML 使用解析器中间表示

**决策内容**：先获取 TXT 解析器输出作为中间文档，再调用 `HtmlParser.decode()` 生成 HTML

**选择原因**：

- 遵循现有的 TXT 转换模式
- 确保 HTML 敏感字符被正确转义
- 避免通过 React 渲染进行转义

**备选方案**：直接拼接 HTML 字符串

**不采用原因**：无法保证字符转义的安全性

### 决策 3：HTML → TXT 提取可见文本

**决策内容**：调用 `HtmlParser.encode(input)`，按页顺序提取可见文本，用 `\n` 连接

**选择原因**：

- 确定性输出，不依赖浏览器渲染
- 排除标签和脚本内容
- 保持文本顺序和结构

**备选方案**：使用 `innerText` 或 DOM API 提取

**不采用原因**：可能包含隐藏元素，且在不同浏览器中行为不一致

### 决策 4：不在 DOM 中渲染转换后的 HTML

**决策内容**：转换后的 HTML 仅作为下载 Blob，不注入到应用 DOM 中

**选择原因**：

- 防止 XSS 攻击范围扩大
- 保持应用安全性
- 避免引入 HTML 清理器依赖

**备选方案**：使用 `dangerouslySetInnerHTML` 渲染预览

**不采用原因**：超出项目范围，引入安全风险

## 风险与权衡

### 风险 1：解析器 API 兼容性

**风险描述**：`@hamster-note/html-parser` 的 API 可能与预期不完全一致

**缓解措施**：

- 使用类型定义文件 `src/types/html-parser.d.ts`
- 参考 GitHub 源码仓库确认 API 行为
- 编写适配器函数隔离解析器调用

### 风险 2：测试覆盖不足

**风险描述**：新的转换路径可能未完全覆盖边界情况

**缓解措施**：

- 测试后策略：先实现，再补测试
- 包含 HTML 敏感字符的测试用例（`<script>` 标签等）
- 端到端测试验证 UI 流程

### 风险 3：输出格式变化

**风险描述**：重构 PDF → HTML 可能意外改变输出

**缓解措施**：

- 保持现有文件名、MIME 类型、状态语义不变
- 验证测试确保输出一致性
- 不修改现有输出生成逻辑

### 权衡：测试后 vs 测试先

**选择**：测试后（tests-after）

**原因**：

- 利用现有 Vitest/Playwright 基础设施
- 快速验证集成可行性
- 已知 API 行为，风险可控

## 迁移计划

### 阶段 1：核心适配器（Wave 1）

1. **Task 1**：转换器架构和适配器注册
   - 修改 `src/lib/converter.ts`
   - 添加 `html` 到 `SourceFormat`
   - 实现 `pdf.html`、`txt.html`、`html.txt` 适配器

2. **Task 2**：UI 和 i18n 支持
   - 修改 `src/App.tsx` 接受 `.html` 和 `.htm`
   - 更新三个语言文件的标签

3. **Task 3**：测试模拟和夹具
   - 更新 `src/test/mocks/html-parser.ts`
   - 添加 `src/test/fixtures/sample.html`

### 阶段 2：测试覆盖（Wave 2）

4. **Task 4**：单元和集成测试
   - 扩展合同测试、适配器测试、集成测试

5. **Task 5**：端到端测试
   - 扩展 `e2e/app.spec.ts` 覆盖 UI 流程

### 阶段 3：验证强化（Wave 3）

6. **Task 6**：全面验证
   - 运行所有测试、lint、构建
   - 确认无 `dangerouslySetInnerHTML` 使用
   - 捕获命令输出作为证据

## 依赖矩阵

| 任务   | 阻塞任务     | 被阻塞任务   |
| ------ | ------------ | ------------ |
| Task 1 | 无           | Task 4, 5, 6 |
| Task 2 | 无           | Task 5, 6    |
| Task 3 | 无           | Task 4, 5    |
| Task 4 | Task 1, 3    | Task 6       |
| Task 5 | Task 1, 2, 3 | Task 6       |
| Task 6 | Task 1-5     | 最终验证     |

## 执行策略

### 并行执行波次

- **Wave 1**：3 个任务（Task 1, 2, 3）→ 快速执行
- **Wave 2**：2 个任务（Task 4, 5）→ 快速 + 未指定低
- **Wave 3**：1 个任务（Task 6）→ 未指定低

### 代理分配

- Wave 1 → 3 个代理（quick, quick, quick）
- Wave 2 → 2 个代理（quick, unspecified-low）
- Wave 3 → 1 个代理（unspecified-low）
