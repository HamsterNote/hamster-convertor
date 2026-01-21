# INTERNATIONALIZATION

## OVERVIEW

i18next + react-i18next + browser-languagedetector 三语言支持。

## WHERE TO LOOK

| Task | File                      | Notes                                                      |
| ---- | ------------------------- | ---------------------------------------------------------- |
| 配置 | `src/i18n/index.ts`       | 检测顺序: querystring → localStorage → navigator → htmlTag |
| 翻译 | `src/i18n/locales/*.json` | zh-CN, zh-TW, en                                           |
| 使用 | `useTranslation()`        | hook 返回 `{ t, i18n }`                                    |

## CONVENTIONS

- **回退语言**: en
- **缓存**: localStorage 存储 `i18nextLng`
- **检测**: 浏览器自动检测，可手动切换

## NOTES

- 语言切换实时生效（App.tsx 监听 `i18n.language`）
- 标题动态更新：`document.title = \`${t('appName')} | ...\``
