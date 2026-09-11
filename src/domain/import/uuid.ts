/**
 * Java 互操作原语 — 与 Android 端逐字节一致的辅助:
 * - MD5 (UUID.nameUUIDFromBytes 的底层)
 * - nameUUIDFromBytes — java.util.UUID 语义 (MD5 + version 3 + IETF variant)
 * - javaStringHash — String.hashCode() (s*31^(n-1) 多项式, 32 位环绕)
 * 移植蓝本: SleepyNativeParser.assignFinalGroupIds / ScheduleExporter.exportIcs UID
 */

function rotl(x: number, c: number): number {
  return ((x << c) | (x >>> (32 - c))) | 0
}

const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

const MD5_K = new Uint32Array(64)
for (let i = 0; i < 64; i++) {
  MD5_K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0
}

/** MD5 摘要 — 返回 16 字节。与 RFC 1321 一致 (标准向量见测试)。 */
export function md5(bytes: Uint8Array): Uint8Array {
  const bitLen = bytes.length * 8
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64
  const buf = new Uint8Array(paddedLen)
  buf.set(bytes)
  buf[bytes.length] = 0x80
  const view = new DataView(buf.buffer)
  view.setUint32(paddedLen - 8, bitLen >>> 0, true)
  view.setUint32(paddedLen - 4, Math.floor(bitLen / 4294967296), true)

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476
  const M = new Int32Array(16)
  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i++) M[i] = view.getInt32(off + i * 4, true)
    let A = a0, B = b0, C = c0, D = d0
    for (let i = 0; i < 64; i++) {
      let F: number
      let g: number
      if (i < 16) { F = (B & C) | (~B & D); g = i }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16 }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16 }
      else { F = C ^ (B | ~D); g = (7 * i) % 16 }
      F = (F + A + MD5_K[i] + M[g]) | 0
      A = D
      D = C
      C = B
      B = (B + rotl(F, MD5_S[i])) | 0
    }
    a0 = (a0 + A) | 0
    b0 = (b0 + B) | 0
    c0 = (c0 + C) | 0
    d0 = (d0 + D) | 0
  }
  const out = new Uint8Array(16)
  const ov = new DataView(out.buffer)
  ov.setInt32(0, a0, true)
  ov.setInt32(4, b0, true)
  ov.setInt32(8, c0, true)
  ov.setInt32(12, d0, true)
  return out
}

function toHex(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

export function md5Hex(bytes: Uint8Array): string {
  return toHex(md5(bytes))
}

/**
 * java.util.UUID.nameUUIDFromBytes — MD5 后置 version=3 / IETF variant 位,
 * 输出 8-4-4-4-12 小写。与 Android 端 groupId 逐字节一致。
 */
export function nameUUIDFromBytes(input: string): string {
  const h = md5(new TextEncoder().encode(input))
  h[6] = (h[6] & 0x0f) | 0x30
  h[8] = (h[8] & 0x3f) | 0x80
  const hex = toHex(h)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Java String.hashCode() — 按 UTF-16 code unit 的 31 的多项式, 32 位环绕。 */
export function javaStringHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return h
}
