import { Suspense, useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { lazyPage } from './lazyPage'

afterEach(cleanup)

it('preloads once and commits the interactive route without a loading frame', async () => {
  const clicked = vi.fn()
  const loader = vi.fn(async () => ({ default: ({ label }: { label: string }) => <button onClick={clicked}>{label}</button> }))
  const Page = lazyPage(loader)
  const first = Page.preload(), second = Page.preload()
  expect(first).toBe(second)
  await first
  render(<Suspense fallback={<p>Pending route</p>}><Page label="Ready route" /></Suspense>)
  expect(screen.queryByText('Pending route')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Ready route' }))
  expect(clicked).toHaveBeenCalledOnce()
  expect(loader).toHaveBeenCalledOnce()
})

it('allows a failed preload to be requested again', async () => {
  const loader = vi.fn()
    .mockRejectedValueOnce(new Error('Temporary connection failure'))
    .mockResolvedValueOnce({ default: () => <p>Recovered page</p> })
  const Page = lazyPage(loader)
  await expect(Page.preload()).rejects.toThrow('Temporary connection failure')
  await Page.preload()
  render(<Suspense fallback={<p>Pending route</p>}><Page /></Suspense>)
  expect(screen.getByText('Recovered page')).toBeTruthy()
})

it('keeps editor state when its parent renders after the initial lazy load', async () => {
  const Page = lazyPage(async () => ({ default: ({ label }: { label: string }) => {
    const [draft, setDraft] = useState('')
    return <input aria-label={label} value={draft} onChange={event => setDraft(event.target.value)} />
  } }))
  const view = render(<Suspense fallback={<p>Pending route</p>}><Page label="Course name" /></Suspense>)
  fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Unsaved draft' } })
  view.rerender(<Suspense fallback={<p>Pending route</p>}><Page label="Updated course name" /></Suspense>)
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Unsaved draft')
})

it('shows a failed download with working retry and back actions', async () => {
  const { initI18n } = await import('../i18n')
  initI18n('en')
  const onBack = vi.fn()
  const loader = vi.fn()
    .mockRejectedValueOnce(new Error('Temporary connection failure'))
    .mockResolvedValueOnce({ default: () => <p>Recovered page</p> })
  const Page = lazyPage(loader)
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    render(<Suspense fallback={<p>Pending route</p>}><Page onBack={onBack} /></Suspense>)
    expect((await screen.findByRole('alert')).textContent).toContain('Temporary connection failure')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Recovered page')).toBeTruthy()
    expect(loader).toHaveBeenCalledTimes(2)
  } finally { errors.mockRestore() }
})

it('waits for page translations and retries their failure together with the page', async () => {
  const prepare = vi.fn().mockRejectedValueOnce(new Error('Translation download failed')).mockResolvedValueOnce(undefined)
  const Page = lazyPage(async () => ({ default: () => <p>Translated page</p> }), prepare)
  await expect(Page.preload()).rejects.toThrow('Translation download failed')
  await Page.preload()
  render(<Suspense fallback={<p>Pending</p>}><Page /></Suspense>)
  expect(screen.getByText('Translated page')).toBeTruthy()
  expect(prepare).toHaveBeenCalledTimes(2)
})
