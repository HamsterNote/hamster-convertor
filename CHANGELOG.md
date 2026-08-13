# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- 新增 Markdown 文件支持（`.md` / `.markdown`），新增源格式 `markdown` 与目标格式 `md`（使用 `@hamster-note/markdown-parser`，通过 yalc 本地链接）
  - md → html、md → txt（支持 `raw` 保留原文 / `plain` 提取纯文本两种模式）、md → png/jpg/webp、md → pdf
  - html → md
  - 设置弹窗新增 “Markdown Options” 段，允许在 md → txt 时选择输出模式
  - 三语言（en / zh-CN / zh-TW）同步新增对应文案
  - 新增 vitest 单元测试与 Playwright e2e 用例覆盖以上路径
- 集成 PDF 到 HTML 转换功能（使用 @hamster-note/pdf-parser 和 @hamster-note/html-parser）
- 支持下载转换后的单个 HTML 文件
- 支持下载多个 HTML 文件的归档包
- 添加单元测试框架（Vitest）
- 添加端到端测试框架（Playwright）
- 添加测试命令（test, test:run, test:integration, test:e2e 等）
- 添加日志记录（loglevel）

### Changed

- 改进错误处理，显示详细的错误消息和警告信息
- 改进用户界面，转换完成后的文件可单独下载
- 更新多语言文本，添加错误和警告相关的翻译
- 转换按钮行为优化，避免重复触发
- 升级 `@hamster-note/pdf-parser` 至 `^0.6.0`：`PdfParser.encode/decode` 新增可选 `options`（`maxPages`、`pageLoadTimeoutMs`）和 `onProgress` 进度回调参数；现有单参数调用保持兼容
- 升级 `@hamster-note/html-parser` 至 `^0.6.0`：HTML 解析改为基于隐藏 iframe 的真实 DOM 测量（替换原 DOMParser 启发式估算），并新增 `setIframeHostDocument` 用于注入宿主文档
- 同步更新 `src/types/{pdf,html}-parser.d.ts` 类型声明以匹配新签名

### Fixed

- 修复上传面板中的文件上传框未撑满容器宽度的问题
- 修复转换失败时不显示错误信息的问题
- 修复 parser 包 scope 不一致问题：统一改为 `@hamster-note/*`，并补齐 package.json 依赖声明

### Configuration

- 更新 tsconfig.json，添加路径别名配置
- 更新 vite.config.ts，添加解析别名支持本地包
- 更新配置文件（.eslintignore, .gitignore, .prettierignore）
- 添加 playwright.config.ts 和 vitest.config.ts

### Dependencies

- 升级 @system-ui-js/development-base 至 0.1.3
- 新增 @hamster-note/document-parser@0.3.1
- 新增 @hamster-note/html-parser@0.5.0
- 新增 @hamster-note/pdf-parser@0.3.0
- 新增 @hamster-note/types@0.5.3
- 新增 loglevel@1.9.1
- 新增测试相关依赖：
  - @testing-library/dom, @testing-library/jest-dom, @testing-library/react
  - vitest, jsdom, cheerio
  - @playwright/test
  - @types/node
