🐹 仓鼠文档转换 (Hamster Document Converter)

免费、简洁的多语言文档格式转换前端。当前仅包含界面与交互，核心转换逻辑后续接入您的专用库。

- 技术栈：Vite + React + TypeScript
- 代码规范：ESLint + Prettier
- 多语言：i18n（简体中文、繁体中文、英文）
- 自适应：响应式 CSS，适配手机端
- 主题色：暖色系，主色为偏橙的黄色
- 已支持文件类型（界面）：pdf、doc、docx、txt、html、epub、md

本地开发：
- 安装依赖：pnpm install
- 启动开发：pnpm dev（默认 http://localhost:5073）

构建与预览：
- 构建：pnpm build
- 预览：pnpm preview

目录结构：
- public/favicon.svg：暖色调的小仓鼠图标
- src/components：Header、FileDropzone、Footer
- src/i18n：i18next 初始化与多语言文案
- src/styles：主题变量与全局样式（包含移动端自适应）
- src/App.tsx：主界面（文件列表、格式选择、按钮等）

多语言（i18n）：
- 默认根据浏览器语言自动检测，可在右上角手动切换。
- 文案存放在 src/i18n/locales/*.json。

如何接入核心转换库（后续）：
1) 在 App.tsx 的 convertAll 中接入实际转换逻辑。
2) 依据每个文件项的 source 与 target 格式，调用你的库 API。
3) 将进度/结果回传到列表，更新 status 为 converting/done/failed。
4) 如需全局任务队列/并发控制，可在此处扩展队列管理。

支持的格式（界面）：pdf、doc、docx、txt、html、epub、md。

代码规范：
- Lint：pnpm lint
- 格式化：pnpm format

许可证：MIT（见 LICENSE）。
