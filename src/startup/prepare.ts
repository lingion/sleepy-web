/** One real readiness promise, shared by StrictMode's repeated effects. */
export function createStartup(tasks: {
  prepareData: () => Promise<unknown>
  prepareRoute: () => Promise<unknown>
}): (() => Promise<void>) & { isReady: () => boolean } {
  let pending: Promise<void> | undefined
  let ready = false
  return Object.assign(() => pending ??= Promise.all([tasks.prepareData(), tasks.prepareRoute()]).then(() => { ready = true }), {
    isReady: () => ready,
  })
}
