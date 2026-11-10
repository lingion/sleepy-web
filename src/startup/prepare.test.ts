import { describe, expect, it, vi } from 'vitest'
import { createStartup } from './prepare'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

describe('startup readiness', () => {
  it('starts route loading alongside data preparation and shares StrictMode work', async () => {
    const data = deferred(), route = deferred()
    const events: string[] = []
    const prepare = createStartup({
      prepareData: () => { events.push('data'); return data.promise },
      prepareRoute: () => { events.push('route'); return route.promise },
    })
    const first = prepare(), second = prepare()
    expect(prepare.isReady()).toBe(false)
    expect(second).toBe(first)
    expect(events).toEqual(['data', 'route'])
    let ready = false
    void first.then(() => { ready = true })
    data.resolve()
    await data.promise
    expect(prepare.isReady()).toBe(false)
    expect(ready).toBe(false)
    route.resolve()
    await first
    expect(prepare.isReady()).toBe(true)
    expect(ready).toBe(true)
    expect(events).toHaveLength(2)
  })

  it('never reports ready when public schedule validation fails', async () => {
    const error = new Error('Invalid schedule')
    const prepare = createStartup({ prepareData: vi.fn().mockRejectedValue(error), prepareRoute: vi.fn().mockResolvedValue(undefined) })
    await expect(prepare()).rejects.toBe(error)
    expect(prepare.isReady()).toBe(false)
  })
})
