import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Table } from '../data/types'
import type { useOccurrenceActions } from '../components/schedule/useOccurrenceActions'
import { lazyPage } from './lazyPage'

export type OccurrenceActions = ReturnType<typeof useOccurrenceActions>
const Host = lazyPage(() => import('./OccurrenceActionsHost'))

/** Interaction code loads on the first action; the timetable stays mounted. */
export function useDeferredOccurrenceActions(table: Table | undefined, host = Host) {
  const ActiveHost = host
  const { t } = useTranslation()
  const [requested, setRequested] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)
  const ready = useRef<OccurrenceActions>()
  const pending = useRef<Promise<OccurrenceActions | undefined>>()
  const finish = useRef<((actions?: OccurrenceActions) => void)>()
  const retry = useRef<() => void>()
  const generation = useRef(0)
  const settle = useCallback((actions?: OccurrenceActions) => {
    ready.current = actions
    finish.current?.(actions)
    finish.current = undefined
    pending.current = undefined
  }, [])
  const close = useCallback(() => {
    ++generation.current
    settle()
    retry.current = undefined
    setRequested(false)
    setError(null)
  }, [settle])
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; ++generation.current; settle(); retry.current = undefined }
  }, [settle])
  const get = async (): Promise<OccurrenceActions | undefined> => {
    if (ready.current) return ready.current
    if (pending.current) return pending.current
    const requestGeneration = generation.current
    const request = new Promise<OccurrenceActions | undefined>(resolve => { finish.current = resolve })
    pending.current = request
    void host.preload().then(() => {
      if (mounted.current && requestGeneration === generation.current) setRequested(true)
    }, failure => {
      if (mounted.current && requestGeneration === generation.current) {
        settle()
        setError(failure instanceof Error ? failure.message : String(failure))
      }
    })
    return request
  }
  const run = async (action: (actions: OccurrenceActions) => Promise<boolean | void>) => {
    const requestGeneration = generation.current
    retry.current = () => { setError(null); void run(action) }
    const actions = await get()
    if (!actions || !mounted.current || requestGeneration !== generation.current) return false
    retry.current = undefined
    return action(actions)
  }
  return {
    move: async (...args: Parameters<OccurrenceActions['move']>) => await run(actions => actions.move(...args)) === true,
    remove: async (...args: Parameters<OccurrenceActions['remove']>) => await run(actions => actions.remove(...args)) === true,
    openEdit: async (...args: Parameters<OccurrenceActions['openEdit']>) => { await run(actions => actions.openEdit(...args)) },
    overlays: <>
      {requested && <ActiveHost table={table} onReady={settle} onBack={close} />}
      {error && <div role="alert" style={{ padding: 24 }}><p className="m3-body-medium">{t('read_failed', { v1: error })}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="m3-button-filled" onClick={() => retry.current?.()}>{t('update_retry')}</button>
          <button type="button" className="m3-button-text" onClick={close}>{t('back')}</button>
        </div>
      </div>}
    </>,
  }
}
