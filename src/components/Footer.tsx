import { useTranslation } from 'react-i18next'

function Footer() {
  const { t } = useTranslation()
  const year = new Date().getFullYear()
  return (
    <footer className="footer">
      <div className="container">
        <div className="row">
          <p>{t('footer.copyright', { year })}</p>
        </div>
        <div className="row">
          <div className="row__item">
            <img src="/logos/github_icon.png" alt="GitHub" className="footer__logo" />
            <a href={t('footer.openSourceUrl')} target="_blank" rel="noopener noreferrer">
              {t('footer.openSource')}
            </a>
          </div>
          <div className="row__item">
            <img src="/logos/github_issues.png" alt="GitHub Issues" className="footer__logo" />
            <a href={t('footer.githubIssuesUrl')} target="_blank" rel="noopener noreferrer">
              {t('footer.githubIssues')}
            </a>
          </div>
          <div className="row__item">
            <img src="/logos/feedback.png" alt="Feedback" className="footer__logo" />
            <a href={t('footer.feedbackUrl')} target="_blank" rel="noopener noreferrer">
              {t('footer.feedback')}
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
