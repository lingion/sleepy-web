import type { ReactNode } from 'react'

/** Separate glyph replay, as labelBackdrop / lensContent in the Android controls.
 * The real buttons retain their accessible names. Neither replay owns input or semantics.
 */
export function LensLabels({ children }: { children: ReactNode }) {
  return <>
    <div className="glass-destinations" aria-hidden="true">{children}</div>
    <div className="glass-content-lens" aria-hidden="true">
      <div className="glass-content-warp"><div className="glass-content-source">{children}</div></div>
    </div>
  </>
}
