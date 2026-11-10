const ACCESS_HASH = import.meta.env.VITE_PUBLIC_ACCESS_KEY_HASH?.trim().toLowerCase() || ''
const SESSION_KEY = 'sleepy-public-access'

export function publicAccessRequired(): boolean {
  return Boolean(ACCESS_HASH)
}

export function publicAccessGranted(): boolean {
  return !ACCESS_HASH || sessionStorage.getItem(SESSION_KEY) === ACCESS_HASH
}

export async function grantPublicAccess(key: string): Promise<boolean> {
  if (!ACCESS_HASH) return true
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  if (hash !== ACCESS_HASH) return false
  sessionStorage.setItem(SESSION_KEY, hash)
  return true
}

export function revokePublicAccess(): void {
  sessionStorage.removeItem(SESSION_KEY)
}
