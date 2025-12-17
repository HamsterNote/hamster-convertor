import { useTranslation } from 'react-i18next'

const LANGS = [
  { code: 'zh-CN', labelKey: 'languages.zhCN' },
  { code: 'zh-TW', labelKey: 'languages.zhTW' },
  { code: 'en', labelKey: 'languages.en' }
]

function Header() {
  const { t, i18n } = useTranslation()

  return (
    <header className="header">
      <div className="container header__inner">
        <a className="brand" href="#" aria-label={t('appName')}>
          <span className="brand__logo" aria-hidden>
            🐹
          </span>
          <span className="brand__title">{t('appName')}</span>
        </a>

        <nav className="nav">
          <span className="nav__label">{t('language')}</span>
          <select
            className="nav__select"
            value={i18n.language}
            onChange={e => i18n.changeLanguage(e.target.value)}
          >
            {LANGS.map(l => (
              <option key={l.code} value={l.code}>
                {t(l.labelKey)}
              </option>
            ))}
          </select>
        </nav>
      </div>
    </header>
  )
}

export default Header
