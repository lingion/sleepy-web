import { Component, createElement, lazy, Suspense, type ComponentProps, type ComponentType, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { preparePageTranslations } from '../i18n'

function LoadFailure({ error, retry, back }: { error: unknown; retry: () => void; back?: () => void }) {
  const { t } = useTranslation()
  return <div role="alert" style={{ padding: 24 }}>
    <p>{t('read_failed', { v1: error instanceof Error ? error.message : String(error) })}</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <button type="button" className="m3-button-filled" onClick={retry}>{t('update_retry')}</button>
      {back && <button type="button" className="m3-button-text" onClick={back}>{t('back')}</button>}
    </div>
  </div>
}

class PageFailure extends Component<{
  renderPage: () => ReactNode; retry: () => void; back?: () => void
}, { failed: boolean; error?: unknown }> {
  state: { failed: boolean; error?: unknown } = { failed: false }
  static getDerivedStateFromError(error: unknown) { return { failed: true, error } }
  render() {
    return this.state.failed
      ? <LoadFailure error={this.state.error} back={this.props.back} retry={() => {
        this.props.retry()
        this.setState({ failed: false })
      }} />
      : this.props.renderPage()
  }
}

/** A stable boundary keeps the previous page visible during a transition. */
export function PageSuspense({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  return <Suspense fallback={<p role="status">{t('loading')}</p>}>{children}</Suspense>
}

/** Preloading also permits a synchronous first render after bootstrap is ready. */
export function lazyPage<T extends ComponentType<any>>(loader: () => Promise<{ default: T }>, prepare = preparePageTranslations) {
  let ready: T | undefined
  let pending: Promise<{ default: T }> | undefined
  const preload = () => pending ??= Promise.all([loader(), prepare?.()]).then(([module]) => { ready = module.default; return module }, error => {
    pending = undefined
    throw error
  })
  let Lazy = lazy(preload)
  return Object.assign((props: ComponentProps<T>) => {
    const callbacks = props as { onBack?: () => void; onDone?: () => void; onDismiss?: () => void }
    return <PageFailure
      renderPage={() => createElement(ready ?? Lazy, props)}
      retry={() => { pending = undefined; Lazy = lazy(preload) }}
      back={callbacks.onBack ?? callbacks.onDone ?? callbacks.onDismiss}
    />
  }, { preload })
}
