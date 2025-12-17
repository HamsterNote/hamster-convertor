import { useTranslation } from 'react-i18next'

function Footer() {
  const { t } = useTranslation()
  const year = new Date().getFullYear()
  return (
    <footer className="footer">
      <div className="container">
        <p>{t('footer.copyright', { year })}</p>
      </div>
    </footer>
  )
}

export default Footer
