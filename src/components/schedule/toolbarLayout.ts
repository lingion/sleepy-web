/** ScheduleToolbarLayout.kt: spend spacing, then action scale, then group week controls. */
export function toolbarLayout(width: number, start: number, end: number, center: number, grouped = 112,tightStart=Math.max(0,start-8),tightEnd=Math.max(0,end-8)) {
  const largestAt=(internal:number)=>Math.max(tightStart+(start-tightStart)*internal/8,tightEnd+(end-tightEnd)*internal/8)
  for (const [inset, gap, internal] of [[12, 8, 8], [8, 4, 4], [4, 0, 0], [0, 0, 0]]) {
    const side = largestAt(internal)
    if (center + 2 * (inset + gap + side) + 2 <= width) return { inset, gap, internal, sideScale: 1, fitScale: 1, grouped: false }
  }
  const tight = largestAt(0)
  for (const sideScale of [.95, .9, .85, .8, .75, .7, 2 / 3]) {
    if (center + tight * sideScale * 2 + 2 <= width) return { inset: 0, gap: 0, internal: 0, sideScale, fitScale: 1, grouped: false }
  }
  const sideScale = 2 / 3
  return { inset: 0, gap: 0, internal: 0, sideScale, fitScale: Math.min(1, width / (grouped + tight * sideScale * 2 + 2)), grouped: true }
}
