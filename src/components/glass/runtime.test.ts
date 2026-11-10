import { beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  vi.doUnmock('./optics')
})

it('does not evaluate optical implementation in classic and fails loudly if liquid was not prepared', async () => {
  const evaluated = vi.fn()
  vi.doMock('./optics', () => { evaluated(); throw new Error('classic imported optics') })
  const { prepareGlassRuntime, getPreparedGlassRuntime } = await import('./runtime')
  await prepareGlassRuntime('classic')
  expect(evaluated).not.toHaveBeenCalled()
  expect(() => getPreparedGlassRuntime()).toThrow(/not prepared/i)
})

it('joins pending liquid preparation and exposes the original APIs only after complete initialization', async () => {
  let release!: () => void
  const pending = new Promise<void>(done => { release = done })
  const installLensOptics = vi.fn(), proveOpaqueBackdrop = vi.fn(), padding = vi.fn(() => 17)
  const evaluated = vi.fn()
  vi.doMock('./optics', async () => {
    evaluated(); await pending
    return { installLensOptics, proveOpaqueBackdrop, liquidGlassStyle: () => ({ role: 'lens' }), opticalSamplingPadding: padding }
  })
  const { prepareGlassRuntime, getPreparedGlassRuntime } = await import('./runtime')
  const first = prepareGlassRuntime('liquid_glass'), second = prepareGlassRuntime('liquid_glass')
  expect(first).toBe(second)
  expect(() => getPreparedGlassRuntime()).toThrow(/not prepared/i)
  await prepareGlassRuntime('classic')
  release()
  await Promise.all([first, second])
  const prepared = getPreparedGlassRuntime()
  expect(prepared).toEqual({ installLensOptics, proveOpaqueBackdrop, lensBackdropPadding: 17 })
  await prepareGlassRuntime('liquid_glass')
  expect(getPreparedGlassRuntime()).toBe(prepared)
  expect(evaluated).toHaveBeenCalledOnce()
  expect(padding).toHaveBeenCalledOnce()
})

it('does not retain a rejected preparation or expose a partial runtime', async () => {
  const style = vi.fn().mockImplementationOnce(() => { throw new Error('runtime initialization failed') }).mockReturnValue({ role: 'lens' })
  vi.doMock('./optics', () => ({ installLensOptics: vi.fn(), proveOpaqueBackdrop: vi.fn(), liquidGlassStyle: style, opticalSamplingPadding: () => 17 }))
  const { prepareGlassRuntime, getPreparedGlassRuntime } = await import('./runtime')
  await expect(prepareGlassRuntime('liquid_glass')).rejects.toThrow('runtime initialization failed')
  expect(() => getPreparedGlassRuntime()).toThrow(/not prepared/i)
  await prepareGlassRuntime('liquid_glass')
  expect(getPreparedGlassRuntime().lensBackdropPadding).toBe(17)
})

it('retries an import rejection when the optical module becomes available', async () => {
  vi.doMock('./optics', () => { throw new Error('optical download failed') })
  const { prepareGlassRuntime, getPreparedGlassRuntime } = await import('./runtime')
  await expect(prepareGlassRuntime('liquid_glass')).rejects.toMatchObject({ cause: { message: 'optical download failed' } })
  expect(() => getPreparedGlassRuntime()).toThrow(/not prepared/i)
  vi.doMock('./optics', () => ({ installLensOptics: vi.fn(), proveOpaqueBackdrop: vi.fn(), liquidGlassStyle: () => ({}), opticalSamplingPadding: () => 17 }))
  await prepareGlassRuntime('liquid_glass')
  expect(getPreparedGlassRuntime().lensBackdropPadding).toBe(17)
})
