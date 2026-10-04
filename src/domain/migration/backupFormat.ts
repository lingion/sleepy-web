/**
 * .sleepybackup ZIP 容器格式常量与守卫 — MigrationBackup.kt / MigrationPackageCodec.kt 1:1。
 * Web 与 Android 读写同一物理文件: manifest.json + modules/<name>.json。
 */

export const FILE_EXTENSION = 'sleepybackup'
export const FORMAT = 'sleepy-migration'
export const VERSION = 1
export const ENTRY_MANIFEST = 'manifest.json'
export const ENTRY_MODULES_DIR = 'modules'

/** MigrationModule 枚举 — entryName ↔ 模块名 */
export const MODULES = {
  DATABASE: 'database',
  PREFERENCES: 'preferences',
  WIDGETS: 'widgets',
  PERSISTED_STATE: 'persisted_state',
  CREDENTIALS: 'credentials',
} as const
export type MigrationModule = (typeof MODULES)[keyof typeof MODULES]

const KNOWN = new Set<string>(Object.values(MODULES))
export function isKnownModule(name: string): name is MigrationModule {
  return KNOWN.has(name)
}

export interface Manifest {
  format: string
  version: number
  createdAt: number
  modules: string[]
}

/** MigrationModuleDeps.REQUIRED: DATABASE 依赖 PERSISTED_STATE, 闭包展开 */
const REQUIRED: Partial<Record<MigrationModule, MigrationModule[]>> = {
  database: ['persisted_state'],
}

export function resolveModuleDeps(selected: MigrationModule[]): MigrationModule[] {
  const out = new Set<MigrationModule>(selected)
  const pending = [...selected]
  while (pending.length > 0) {
    const m = pending.pop()!
    for (const dep of REQUIRED[m] ?? []) {
      if (!out.has(dep)) {
        out.add(dep)
        pending.push(dep)
      }
    }
  }
  return [...out]
}

export function moduleEntryName(module: MigrationModule): string {
  return `${ENTRY_MODULES_DIR}/${module}.json`
}

export class MigrationPackageException extends Error {}

export interface MigrationPackageContent {
  manifest: Manifest
  modules: Partial<Record<MigrationModule, string>>
  unknownModules: string[]
}

export function encodeManifest(manifest: Manifest): string {
  return JSON.stringify({
    format: manifest.format || FORMAT,
    version: manifest.version,
    createdAt: manifest.createdAt,
    modules: manifest.modules,
  })
}

export function decodeManifest(text: string): Manifest {
  const raw = JSON.parse(text) as Record<string, unknown>
  return {
    format: typeof raw.format === 'string' ? raw.format : FORMAT,
    version: typeof raw.version === 'number' ? raw.version : VERSION,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
    modules: Array.isArray(raw.modules) ? raw.modules.map(String) : [],
  }
}

/**
 * MigrationPackageCodec.read 守卫 1:1:
 * 条目名以 / 或含 .. → 拒绝 (zip-slip); 重复条目 → 拒绝; 缺 manifest → 拒绝;
 * format 不符 → 拒绝; version 高于本地 → 拒绝。未知模块名归 unknown。
 */
export function assemblePackage(entries: Record<string, string>): MigrationPackageContent {
  const names = Object.keys(entries)
  for (const name of names) {
    if (name.startsWith('/') || name.includes('..')) {
      throw new MigrationPackageException(`illegal zip entry: ${name}`)
    }
  }
  // 重复检测由 ZIP 解析层负责 (同名后者不会覆盖, 见 zipCodec)
  let manifest: Manifest | null = null
  const known: Partial<Record<MigrationModule, string>> = {}
  const unknown: string[] = []
  for (const name of names) {
    if (name === ENTRY_MANIFEST) {
      try {
        manifest = decodeManifest(entries[name])
      } catch (e) {
        throw new MigrationPackageException(`manifest unreadable: ${e instanceof Error ? e.message : String(e)}`)
      }
    } else if (name.startsWith(`${ENTRY_MODULES_DIR}/`) && name.endsWith('.json')) {
      const base = name.slice(`${ENTRY_MODULES_DIR}/`.length, -'.json'.length)
      if (isKnownModule(base)) known[base] = entries[name]
      else unknown.push(base)
    }
  }
  if (!manifest) throw new MigrationPackageException('manifest.json missing')
  if (manifest.format !== FORMAT) throw new MigrationPackageException(`unknown backup format: ${manifest.format}`)
  if (manifest.version > VERSION) throw new MigrationPackageException(`backup made by newer Sleepy (v${manifest.version})`)
  return { manifest, modules: known, unknownModules: [...unknown].sort() }
}
