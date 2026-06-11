# src/i18n/

## Responsibility

提供应用的国际化（i18n）支持，管理三语言翻译资源（en、zh-CN、zh-TW），并通过 i18next 框架实现自动语言检测与切换。

## Design

**核心依赖**
- `i18next` — 国际化框架核心
- `react-i18next` — React 绑定，提供 `useTranslation()` hook
- `i18next-browser-languagedetector` — 浏览器语言自动检测

**架构模式**
- 静态导入：三个 JSON 翻译文件在 `index.ts` 中作为 ES module 静态导入，打包时内联
- 单例初始化：`i18n` 实例在模块加载时立即初始化，全局唯一
- 命名空间：所有翻译统一放在 `translation` 命名空间下

**语言检测优先级**（`detection.order`）
1. `querystring` — URL 参数 `?lng=zh-CN`
2. `localStorage` — 缓存的 `i18nextLng` 值
3. `navigator` — 浏览器语言设置
4. `htmlTag` — `<html lang="...">` 属性

**翻译文件结构**（每个 locale 约 195 个 key）
```
├── appName, tagline, language        — 全局元数据
├── nav                               — 导航
├── upload                            — 文件上传区域
├── formats                           — 格式选择（from/to/targets）
├── actions                           — 操作按钮（addFiles, convertAll, download...）
├── table                             — 表头（fileName, source, target, status, action）
├── status                            — 转换状态（ready, queued, converting, done, failed）
├── loading                           — 加载提示（含进度插值）
├── errors                            — 错误消息（含插值变量）
├── warnings                          — 警告消息
├── options                           — 转换选项（OCR, HTML背景, 文字控制, PDF页面）
├── output                            — 输出计数（含复数）
├── preview                           — 预览模态框
├── pdfPageSelector                   — PDF 页面选择器
├── htmlOptionsModal                  — HTML 选项模态框
├── settingsModal                     — 设置模态框（图片/EXIF/旋转/缩放）
├── confirmations                     — 确认对话框
└── footer                            — 页脚（版权/链接）
```

## Flow

**初始化流程**
```
main.tsx
  └─ import './i18n'           //  side-effect 导入，触发初始化
       └─ index.ts
            ├─ import 3 个 locale JSON
            ├─ i18n.use(LanguageDetector)    // 注册检测插件
            ├─ i18n.use(initReactI18next)    // 注册 React 绑定
            └─ i18n.init({                   // 配置并初始化
                 fallbackLng: 'en',
                 supportedLngs: ['en', 'zh-CN', 'zh-TW'],
                 resources: { en, zh-CN, zh-TW },
                 detection: { order, caches }
               })
```

**组件使用流程**
```
任意组件
  └─ const { t, i18n } = useTranslation()
       ├─ t('appName')                     // 简单取值
       ├─ t('loading.convertingWithProgress', { processed, total })  // 插值
       ├─ t('output.count', { count: 3 })  // 复数
       └─ i18n.changeLanguage('zh-TW')     // 手动切换语言（Header 组件）
```

**语言切换实时生效**
- `Header.tsx` 通过 `i18n.changeLanguage()` 切换
- 切换后所有使用 `useTranslation()` 的组件自动重渲染
- 用户选择持久化到 `localStorage`

## Integration

**入口依赖**
| 文件 | 关系 | 说明 |
|------|------|------|
| `src/main.tsx` | 初始化入口 | `import './i18n'` 触发 side-effect 初始化 |

**消费者（使用 `useTranslation()` 的组件）**
| 文件 | 使用的翻译 key |
|------|----------------|
| `src/App.tsx` | appName, tagline, upload.*, formats.*, actions.*, table.*, status.*, loading.*, errors.*, output.*, confirmations.* |
| `src/components/Header.tsx` | appName, language — 含 `i18n.changeLanguage()` |
| `src/components/Footer.tsx` | footer.* |
| `src/components/FileDropzone.tsx` | upload.* |
| `src/components/ConfirmModal.tsx` | confirmations.*, actions.cancel, actions.continue |
| `src/components/SettingsModal.tsx` | settingsModal.*, options.* |
| `src/components/HtmlOptionsModal.tsx` | htmlOptionsModal.*, options.* |
| `src/components/HtmlDecodeOptionsModal.tsx` | options.* |
| `src/components/PdfPageSelectorModal.tsx` | pdfPageSelector.* |
| `src/components/PdfPageSelectorInline.tsx` | settingsModal.pdfPagesTitle, options.pdfPages.*, pdfPageSelector.* |
| `src/components/PreviewModal.tsx` | preview.* |

**测试依赖**
| 文件 | 关系 | 说明 |
|------|------|------|
| `__tests__/locale-parity.test.ts` | 质量保障 | 验证三个 locale JSON 的 key 集合完全一致 |
| 各组件 `*.test.tsx` | 测试辅助 | 通过 `import i18n` + `I18nextProvider` 提供翻译上下文 |

**外部依赖**
| 包 | 用途 |
|----|------|
| `i18next` | 核心框架 |
| `react-i18next` | React hooks (`useTranslation`) |
| `i18next-browser-languagedetector` | 浏览器语言自动检测 |
