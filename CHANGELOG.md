# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

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

### Fixed

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
