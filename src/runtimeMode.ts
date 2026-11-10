/** Query flags are fixed for this document, before any database/store is opened. */
export function parseRuntimeMode(search: string): { demo: boolean; embed: boolean; theme?: 'light' | 'dark' } {
  const query = new URLSearchParams(search)
  const theme = query.get('theme')
  return {
    demo: query.get('demo') === '1',
    embed: query.get('embed') === '1',
    theme: theme === 'light' || theme === 'dark' ? theme : undefined,
  }
}

export const runtimeMode = parseRuntimeMode(typeof window === 'undefined' ? '' : window.location.search)
export const DEMO_DATABASE_NAME = 'sleepy-demo-v1'
export const DEMO_STORAGE_PREFIX = 'sleepy-demo-v1:'
