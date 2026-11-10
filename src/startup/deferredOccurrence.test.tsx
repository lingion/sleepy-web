import { useLayoutEffect, useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { initI18n } from '../i18n'
import type { Course, Table } from '../data/types'
import { lazyPage } from './lazyPage'
import { useDeferredOccurrenceActions, type OccurrenceActions } from './useDeferredOccurrenceActions'

initI18n('en')
afterEach(cleanup)
const course = { id:1 } as Course
const makeHost = (actions: OccurrenceActions) => ({ table, onReady }: { table: Table | undefined; onReady: (actions: OccurrenceActions) => void; onBack?: () => void }) => {
  useLayoutEffect(() => { onReady({ ...actions, openEdit: async () => { await actions.openEdit(course, table?.id ?? 0) } }) })
  return <p>Action controls</p>
}
function fixture(host: NonNullable<Parameters<typeof useDeferredOccurrenceActions>[1]>) {
  return function View({ tableId = 1 }: { tableId?: number }) {
    const actions = useDeferredOccurrenceActions({ id:tableId } as Table, host)
    return <><p>Timetable remains visible</p><button onClick={() => { void actions.openEdit(course, 1) }}>Adjust occurrence</button>{actions.overlays}</>
  }
}
it('loads on the first action, keeps the timetable, and passes the current table after a rerender', async () => {
  let finish!: () => void
  const gate = new Promise<void>(resolve => { finish = resolve })
  const actions = { move:vi.fn().mockResolvedValue(true), remove:vi.fn().mockResolvedValue(true), openEdit:vi.fn().mockResolvedValue(undefined), overlays:<></> }
  const load = vi.fn(async () => { await gate; return { default:makeHost(actions) } })
  const host = lazyPage(load)
  const View = fixture(host)
  const view = render(<View />)
  expect(load).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('Adjust occurrence'))
  expect(screen.getByText('Timetable remains visible')).toBeTruthy()
  expect(actions.openEdit).not.toHaveBeenCalled()
  await act(async () => { finish(); await gate })
  await waitFor(() => expect(actions.openEdit).toHaveBeenCalledWith(course,1))
  view.rerender(<View tableId={2} />)
  fireEvent.click(screen.getByText('Adjust occurrence'))
  await waitFor(() => expect(actions.openEdit).toHaveBeenLastCalledWith(course,2))
  expect(load).toHaveBeenCalledOnce()
})
it('shows failed downloads and retries the original action without leaving a blank page', async () => {
  const actions = { move:vi.fn().mockResolvedValue(true), remove:vi.fn().mockResolvedValue(true), openEdit:vi.fn().mockResolvedValue(undefined), overlays:<></> }
  const load = vi.fn().mockRejectedValueOnce(new Error('Download interrupted')).mockResolvedValueOnce({ default:makeHost(actions) })
  const View = fixture(lazyPage(load))
  render(<View />)
  fireEvent.click(screen.getByText('Adjust occurrence'))
  expect((await screen.findByRole('alert')).textContent).toContain('Download interrupted')
  expect(screen.getByText('Timetable remains visible')).toBeTruthy()
  expect(screen.getByRole('button', {name:'Retry'}).className).toContain('m3-button-filled')
  expect(screen.getByRole('button', {name:'Back'}).className).toContain('m3-button-text')
  fireEvent.click(screen.getByRole('button', {name:'Retry'}))
  await waitFor(() => expect(actions.openEdit).toHaveBeenCalledOnce())
  expect(screen.queryByRole('alert')).toBeNull()
})

it('cancels an operation when the timetable unmounts during its first download', async () => {
  let finish!: () => void
  const gate = new Promise<void>(resolve => { finish = resolve })
  const actions = { move:vi.fn().mockResolvedValue(true), remove:vi.fn().mockResolvedValue(true), openEdit:vi.fn().mockResolvedValue(undefined), overlays:<></> }
  const View = fixture(lazyPage(async () => { await gate; return { default:makeHost(actions) } }))
  const view = render(<View />)
  fireEvent.click(screen.getByText('Adjust occurrence'))
  view.unmount()
  await act(async () => { finish(); await gate })
  expect(actions.openEdit).not.toHaveBeenCalled()
})

it('opens a fresh host after its render fails and the error is closed', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const opens = vi.fn()
  function FailingHost({ onReady }: { onReady: (actions: OccurrenceActions | undefined) => void }) {
    const [editing, setEditing] = useState(false)
    const [failed, setFailed] = useState(false)
    useLayoutEffect(() => {
      onReady({ move:async () => true, remove:async () => true, openEdit:async () => { opens(); setEditing(true) }, overlays:<></> })
      return () => onReady(undefined)
    })
    if (failed) throw new Error('Host render interrupted')
    return <>{editing && <p role="dialog">Fresh occurrence editor</p>}<button onClick={() => setFailed(true)}>Fail host</button></>
  }
  try {
    const View = fixture(lazyPage(async () => ({ default: FailingHost })))
    render(<View />)
    fireEvent.click(screen.getByText('Adjust occurrence'))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByText('Fail host'))
    expect((await screen.findByRole('alert')).textContent).toContain('Host render interrupted')
    fireEvent.click(screen.getByRole('button', {name:'Back'}))
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByText('Adjust occurrence'))
    await screen.findByRole('dialog')
    expect(opens).toHaveBeenCalledTimes(2)
  } finally {
    log.mockRestore()
  }
})

it('can close a failed download and start a new operation without retrying the cancelled action', async () => {
  const actions = { move:vi.fn().mockResolvedValue(true), remove:vi.fn().mockResolvedValue(true), openEdit:vi.fn().mockResolvedValue(undefined), overlays:<></> }
  const load = vi.fn().mockRejectedValueOnce(new Error('Download interrupted')).mockResolvedValueOnce({ default:makeHost(actions) })
  const View = fixture(lazyPage(load))
  render(<View />)
  fireEvent.click(screen.getByText('Adjust occurrence'))
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', {name:'Back'}))
  fireEvent.click(screen.getByText('Adjust occurrence'))
  await waitFor(() => expect(actions.openEdit).toHaveBeenCalledOnce())
  expect(load).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('alert')).toBeNull()
})
