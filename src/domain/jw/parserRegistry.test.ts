/**
 * JwParserRegistry 测试 — 分发 + 兜底裁决 (T8 契约)
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parserFor, selectBest, allCandidates, FACTORIES as REGISTRY, TYPE_PRIORITY } from './parserRegistry'
import { JwOldZfParser } from './oldZfParser'

const HERE = import.meta.dirname

function fixture(name: string): string {
  return readFileSync(join(HERE, '__fixtures__', name), 'utf8')
}

describe('parserFor — 显式分发', () => {
  it('zf → JwOldZfParser(type=0); zf_1 → type=1', () => {
    const p = parserFor('zf', '<html><table id="Table1"></table></html>')
    expect(p).toBeInstanceOf(JwOldZfParser)
    expect((p as JwOldZfParser).zfType).toBe(0)
    const p1 = parserFor('zf_1', '<html></html>')
    expect((p1 as JwOldZfParser).zfType).toBe(1)
  })

  it('eams5 → JwEams5Parser', () => {
    expect(parserFor('eams5', '<html/>').constructor.name).toBe('JwEams5Parser')
  })

  it('未注册协议 → 抛 "协议 X 暂不支持"', () => {
    expect(() => parserFor('not_registered', '<html/>')).toThrow('协议 not_registered 暂不支持')
  })
})

describe('selectBest — 兜底裁决', () => {
  it('zf-old fixture: 无声明 type 也能裁决出 Table1 课程', () => {
    const html = fixture('zf-old-standard_single_course.html')
    const [courses, attempts] = selectBest(html)
    expect(courses.length).toBeGreaterThan(0)
    expect(courses[0].name).toBe('高等数学')
    expect(attempts.length).toBe(REGISTRY.size)
  })

  it('declaredType 命中且 >0 课 → 强制使用', () => {
    const html = fixture('qz-base-crazy-normal_grid.html')
    const [courses] = selectBest(html, 'qz_crazy')
    expect(courses).toHaveLength(7)
  })

  it('declaredType 0 课 → 回退通用裁决', () => {
    const html = fixture('zf-old-standard_single_course.html')
    // 声明 qz 但页面无 kbtable → qz 0 课 → 通用裁决出 zf-old
    const [courses] = selectBest(html, 'qz')
    expect(courses.length).toBeGreaterThan(0)
    expect(courses[0].name).toBe('高等数学')
  })

  it('全 0 课 (登录页) → 空列表', () => {
    const [courses] = selectBest(fixture('zf-old-login_page.html'))
    expect(courses).toHaveLength(0)
  })
})

describe('allCandidates — 优先级序', () => {
  it('候选顺序 = TYPE_PRIORITY 升序 (已注册协议)', () => {
    const candidates = allCandidates('<html/>')
    const priorities = candidates
      .map(([t]) => TYPE_PRIORITY.find(([tt]) => tt === t)?.[1] ?? 999)
    const sorted = [...priorities].sort((a, b) => a - b)
    expect(priorities).toEqual(sorted)
    expect(candidates.length).toBe(REGISTRY.size)
  })
})
