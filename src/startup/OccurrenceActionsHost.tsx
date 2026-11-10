import { useLayoutEffect } from 'react'
import type { Table } from '../data/types'
import { useOccurrenceActions } from '../components/schedule/useOccurrenceActions'
import type { OccurrenceActions } from './useDeferredOccurrenceActions'

export default function OccurrenceActionsHost({ table, onReady }: {
  table: Table | undefined; onReady: (actions: OccurrenceActions | undefined) => void; onBack?: () => void
}) {
  const actions = useOccurrenceActions(table)
  useLayoutEffect(() => { onReady(actions); return () => onReady(undefined) })
  return actions.overlays
}
