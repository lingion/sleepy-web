/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_ACCESS_KEY_HASH?: string
  readonly VITE_PUBLIC_SCHEDULE_PATH?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
