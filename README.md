🐹 仓鼠文档转换 (Hamster Document Converter)

免费、简洁的多语言文档格式转换前端。当前仅包含界面与交互，核心转换逻辑后续接入您的专用库。

- 技术栈：Vite + React + TypeScript
- 代码规范：ESLint + Prettier
- 多语言：i18n（简体中文、繁体中文、英文）
- 自适应：响应式 CSS，适配手机端
- 主题色：暖色系，主色为偏橙的黄色
- 已支持文件类型（界面）：pdf、doc、docx、txt、html、epub、md

本地开发：

- 安装依赖：yarn install
- 启动开发：yarn dev（默认 <http://localhost:5073>）

构建与预览：

- 构建：yarn build（同时构建 host 与 iframe 解析器运行时）
- 预览：yarn preview
- 单独构建解析器运行时：yarn build:parser-runtime
- 单元测试：yarn test:run
- 端到端测试：yarn test:e2e（需先 `yarn test:e2e:install` 安装 Chromium）

iframe 解析器运行时：

- 详细架构、协议消息、队列/取消语义、构建/测试命令见 `docs/parser-iframe-runtime.md`。
- 所有 PDF/HTML/TXT/image 解析在 `/parser-runtime/index.html` 同源 iframe 内执行，host 通过 `<ParserIframeBridge />` 转发请求。

目录结构：

- public/favicon.svg：暖色调的小仓鼠图标
- src/components：Header、FileDropzone、Footer
- src/i18n：i18next 初始化与多语言文案
- src/styles：主题变量与全局样式（包含移动端自适应）
- src/App.tsx：主界面（文件列表、格式选择、按钮等）

多语言（i18n）：

- 默认根据浏览器语言自动检测，可在右上角手动切换。
- 文案存放在 src/i18n/locales/\*.json。

如何接入核心转换库（后续）：

1. 在 App.tsx 的 convertAll 中接入实际转换逻辑。
2. 依据每个文件项的 source 与 target 格式，调用你的库 API。
3. 将进度/结果回传到列表，更新 status 为 converting/done/failed。
4. 如需全局任务队列/并发控制，可在此处扩展队列管理。

支持的格式（界面）：pdf、doc、docx、txt、html、epub、md。

代码规范：

- Lint：yarn lint
- 格式化：yarn format

部署（Beta 版到 GitHub Pages）：

- Beta 版通过 tag 触发自动部署，工作流见 `.github/workflows/deploy-beta.yml`
- 触发规则：推送形如 `v1.0.0-beta`、`v2.3.4-beta` 的 tag
  - 普通版本号 `v1.0.0`（不带 `-beta`）当前不会触发部署，留待后续生产版本工作流接入
- 发布位置：`gh-pages` 分支的 `beta/` 子目录，对应 URL 为 `https://<owner>.github.io/<repo>/beta/`
- 构建变量：CI 中以 `BASE_PATH=/beta/` 构建，确保所有静态资源（logo、cmaps、parser-runtime iframe）路径都带 `/beta/` 前缀
- `main` 分支不再自动部署，仅由 `e2e.yml` 进行 lint/test/build/E2E 验证

发布 Beta 版的操作步骤：

```bash
git tag v1.0.0-beta
git push origin v1.0.0-beta
```

[USER ACTION REQUIRED] 首次使用前需在 GitHub 仓库手动配置：

1. 进入仓库 `Settings` → `Pages`
2. `Build and deployment` → `Source` 选择 `Deploy from a branch`
3. `Branch` 选择 `gh-pages`，目录选 `/ (root)`，保存
4. 确认 `Settings` → `Actions` → `General` → `Workflow permissions` 允许 `Read and write permissions`（peaceiris/actions-gh-pages 需要写入 gh-pages 分支）

本地预览 `/beta/` 构建产物：

```bash
BASE_PATH=/beta/ yarn build
yarn preview
# 浏览器访问 http://127.0.0.1:5073/beta/
```

许可证：MIT（见 LICENSE）。
