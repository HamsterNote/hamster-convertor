# PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-17T07:49:39Z
**Branch:** (current)
**License:** GPL v3.0

## OVERVIEW

Vite + React + TypeScript 多语言文档转换前端。使用 @system-ui-js/development-base 统一配置，支持 i18next 三语言（zh-CN/zh-TW/en）和浅/暗色模式。

## STRUCTURE

```text
./
├── src/
│   ├── components/     # Header, FileDropzone, Footer
│   ├── i18n/           # i18next config + locales
│   ├── styles/         # theme.css, global.css
│   ├── App.tsx         # 主逻辑（文件列表、转换）
│   └── main.tsx        # 入口
├── public/logos/       # 静态资源
└── .github/workflows/  # deploy.yml
```

## WHERE TO LOOK

| Task     | Location                       | Notes                                     |
| -------- | ------------------------------ | ----------------------------------------- |
| 核心逻辑 | `src/App.tsx`                  | `convertAll()` 已集成 PDF 到 HTML 转换    |
| i18n     | `src/i18n/index.ts`            | 语言检测顺序: qs → ls → nav → html        |
| 主题     | `src/styles/theme.css`         | 暖色系 #f6a700，支持 prefers-color-scheme |
| CI 部署  | `.github/workflows/deploy.yml` | 修复路径问题：`dist` 而不是 `dist-demo`   |

## CONVENTIONS (THIS PROJECT)

- **配置来源**: ESLint/Prettier/TSConfig 复用 `@system-ui-js/development-base`
- **路径别名**: `@/*` → `./src/*`
- **模块系统**: ESM (`"type": "module"`)
- **TypeScript**: 无 `any`，使用 `type` 非 `interface`
- **端口**: dev=5073, preview=5073

## ANTI-PATTERNS (THIS PROJECT)

- ~~CI 失败~~: `deploy.yml` 调用 `yarn build:demo`，package.json 只有 `build` → **已修复**
- ~~README 不一致~~: 文档写 `pnpm`，项目用 `yarn` → **已修复**
- ~~缺失: 无测试、无 CHANGELOG~~ → **已添加测试和 CHANGELOG**

## COMMANDS

```bash
yarn dev          # 端口 5073
yarn build        # 生产构建
yarn lint         # ESLint（零警告）
yarn format       # Prettier 格式化
```

## NOTES

- `src/App.tsx:59-69` - Demo 模式转换（随机成功/失败）
- `src/styles/theme.css` - CSS 变量主题系统
- 依赖 `@system-ui-js/development-base@0.1.3` 提供共享配置

## Recent Changes

- 001-pdf-html-conversion: Added PDF-to-HTML conversion, Vitest and Playwright tests, and loglevel logging
