import type { ReactElement } from 'react'

type Props = {
  visible: boolean
  label: string
}

function FullscreenLoading({ visible, label }: Props): ReactElement | null {
  if (!visible) {
    return null
  }

  return (
    <div aria-live="polite" className="fullscreen-loading" role="status">
      <div className="fullscreen-loading__card">
        <div aria-hidden="true" className="fullscreen-loading__spinner" />
        <p className="fullscreen-loading__label">{label}</p>
      </div>
    </div>
  )
}

export default FullscreenLoading
