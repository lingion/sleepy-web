type GlassRuntime = Pick<typeof import('./optics'), 'installLensOptics' | 'proveOpaqueBackdrop'> & {
  lensBackdropPadding: number
}

let prepared: GlassRuntime | undefined
let pending: Promise<void> | undefined

/** Prepare before publishing liquid preferences or mounting a liquid page. */
export function prepareGlassRuntime(style: 'classic' | 'liquid_glass'): Promise<void> {
  if (style !== 'liquid_glass' || prepared) return Promise.resolve()
  return pending ??= import('./optics').then(optics => {
    prepared = {
      installLensOptics: optics.installLensOptics,
      proveOpaqueBackdrop: optics.proveOpaqueBackdrop,
      lensBackdropPadding: optics.opticalSamplingPadding(optics.liquidGlassStyle('lens')),
    }
  }).catch(error => {
    pending = undefined
    throw error
  })
}

/** Missing preparation is a broken publication contract, never a no-op. */
export function getPreparedGlassRuntime(): GlassRuntime {
  if (!prepared) throw new Error('Glass runtime not prepared')
  return prepared
}
