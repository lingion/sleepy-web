import { describe, it, expect } from 'vitest'
import { md5Hex, nameUUIDFromBytes, javaStringHash } from './uuid'

/**
 * Java 互操作原语锁定 — 与 JVM 逐字节一致:
 * MD5 标准向量 (RFC 1321) / nameUUIDFromBytes 用 hashlib+uuid 预生成 / String.hashCode()
 */
describe('uuid — java interop primitives', () => {
  it('md5 rfc1321 vectors', () => {
    expect(md5Hex(new TextEncoder().encode(''))).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(md5Hex(new TextEncoder().encode('a'))).toBe('0cc175b9c0f1b6a831c399e269772661')
    expect(md5Hex(new TextEncoder().encode('abc'))).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(md5Hex(new TextEncoder().encode('message digest'))).toBe('f96b697d7cb7938d525a2f31aaf161d0')
    // python hashlib 预生成锚点
    expect(md5Hex(new TextEncoder().encode('123456789'))).toBe('25f9e794323b453885f5181f1b624d0b')
    // 长度 ≡ 56 mod 64 边界 (填充跨块)
    expect(md5Hex(new TextEncoder().encode('a'.repeat(64)))).toBe('014842d480b571495a4a0363793f7367')
  })

  it('nameUUIDFromBytes matches Java UUID.nameUUIDFromBytes semantics', () => {
    // python 预生成 (md5 + version 3 + IETF variant)
    expect(nameUUIDFromBytes('test')).toBe('098f6bcd-4621-3373-8ade-4e832627b4f6')
    expect(nameUUIDFromBytes('高数|g1')).toBe('41c9cf2c-a852-3dd3-9500-377dd4fea56c')
    // 同输入同输出 (Kotlin 测试 groupId_deterministic 的跨端等价)
    expect(nameUUIDFromBytes('高数|g1')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-3[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('javaStringHash matches JVM String.hashCode', () => {
    expect(javaStringHash('')).toBe(0)
    expect(javaStringHash('a')).toBe(97)
    // "hello".hashCode() = 99162322 (Java 经典锚)
    expect(javaStringHash('hello')).toBe(99162322)
    expect(javaStringHash('高数')).toBe(1254808)
  })
})
