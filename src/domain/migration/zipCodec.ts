/**
 * ZIP 容器读写 (fflate) — MigrationPackageCodec 的 ZIP 层 1:1。
 * 重复条目守卫: fflate 解包按名聚合看不到重复, 这里独立扫中央目录枚举全部条目名。
 */

import { zipSync, unzipSync } from 'fflate'
import { MigrationPackageException } from './backupFormat'

function toU8(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}
function fromU8(b: Uint8Array): string {
  return new TextDecoder().decode(b)
}

export function writeZip(entries: Array<[string, string]>): Uint8Array {
  const files: Record<string, Uint8Array> = {}
  for (const [name, text] of entries) files[name] = toU8(text)
  return zipSync(files, { level: 6 })
}

/**
 * 扫中央目录 (PK\x01\x02) 枚举条目名 — 大小/计数取自 EOCD (PK\x05\x06),
 * 重复名会全部出现 (unzipSync 聚合后不可见)。坏 ZIP 抛 MigrationPackageException。
 */
export function listZipNames(bytes: Uint8Array): string[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const LE16 = (o: number) => dv.getUint16(o, true)
  const LE32 = (o: number) => dv.getUint32(o, true)
  // EOCD 在最尾 64KB 内
  let eocd = -1
  const min = Math.max(0, bytes.byteLength - 65557)
  for (let i = bytes.byteLength - 22; i >= min; i--) {
    if (LE32(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new MigrationPackageException('backup ZIP unreadable: EOCD not found')
  const total = LE16(eocd + 10)
  let off = LE32(eocd + 16)
  const names: string[] = []
  for (let n = 0; n < total; n++) {
    if (LE32(off) !== 0x02014b50) throw new MigrationPackageException('backup ZIP unreadable: bad central entry')
    const nameLen = LE16(off + 28)
    const extraLen = LE16(off + 30)
    const commentLen = LE16(off + 32)
    names.push(fromU8(bytes.subarray(off + 46, off + 46 + nameLen)))
    off += 46 + nameLen + extraLen + commentLen
  }
  return names
}

/** 全部条目 → name→文本; 重复条目名直接拒绝 (Android duplicate zip entry 同语义) */
export function readZipEntries(bytes: Uint8Array): Record<string, string> {
  const names = listZipNames(bytes)
  const seen = new Set<string>()
  for (const name of names) {
    if (!seen.add(name)) throw new MigrationPackageException(`duplicate zip entry: ${name}`)
  }
  const out: Record<string, string> = {}
  const files = unzipSync(bytes, {
    filter: (f) => !f.name.endsWith('/') && f.originalSize < 32 * 1024 * 1024,
  })
  for (const [name, data] of Object.entries(files)) out[name] = fromU8(data)
  return out
}
