import { describe, it, expect } from 'vitest'
import {
  detectVersion, escape, unescape, PALETTE, AUTO_COLOR,
  colorToToken, colorFromToken, parseClock, parseDate, parseNodeSpan,
  parseWeekSpec, parseDay, ND_PRESET, matchesNdPreset, crc32Utf8,
} from './sleepyNativeFormat'
import { DEFAULT_TIME_JSON, parseNodes } from '../timeTable'

/**
 * sleepy-v1 原生格式纯函数层 — Kotlin SleepyNativeFormatTest.kt 1:1 移植
 * magic 识别 / 转义往返 / 调色板 / lenient 时钟·日期·周次·节次 / Nd 预设 / crc32
 */
describe('sleepyNativeFormat — pure layer', () => {
  // ---- magic 识别 (规范 §6.1) ----
  it('magic plain', () => {
    expect(detectVersion('#sleepy-v1\nC高数|1|1-2')).toBe(1)
  })

  it('magic case insensitive full pattern', () => {
    expect(detectVersion('#SLEEPY-V1')).toBe(1)
    expect(detectVersion('#Sleepy-V1')).toBe(1)
  })

  it('magic variants hit', () => {
    expect(detectVersion('##sleepy-v1')).toBe(1)
    expect(detectVersion('# sleepy-v1')).toBe(1)
    expect(detectVersion('#sleepy v1')).toBe(1)
    expect(detectVersion('#sleepy_v1')).toBe(1)
    expect(detectVersion('＃sleepy-v1')).toBe(1)
    expect(detectVersion('#sleepy-v1。')).toBe(1)
    expect(detectVersion('#sleepy－v1')).toBe(1)
  })

  it('magic quote prefix and late position', () => {
    expect(detectVersion('> > #sleepy-v1')).toBe(1)
    const chatter = Array.from({ length: 20 }, (_, i) => `转发语第 ${i + 1} 行`).join('\n')
    expect(detectVersion(`${chatter}\n#sleepy-v1\nC高数|1|1-2`)).toBe(1)
  })

  it('magic outside window miss', () => {
    const chatter = Array.from({ length: 40 }, (_, i) => `第 ${i + 1} 行`).join('\n')
    expect(detectVersion(`${chatter}\n#sleepy-v1`)).toBe(-1)
  })

  it('magic future version detected', () => {
    expect(detectVersion('#sleepy-v2')).toBe(2)
  })

  it('magic miss on other formats (§6.3-R reverse matrix)', () => {
    expect(detectVersion('{"name":"x","courses":[]}')).toBe(-1)
    expect(detectVersion('BEGIN:VCALENDAR')).toBe(-1)
    expect(detectVersion('<html><body></body></html>')).toBe(-1)
    expect(detectVersion('课程,教师,星期\n高数,张三,1')).toBe(-1)
    expect(detectVersion('高数 张三 周一 1-2 1-16 3')).toBe(-1)
    expect(detectVersion('')).toBe(-1)
  })

  // ---- 转义往返 (规范 §3.3) ----
  it('escape/unescape round trip all reserved', () => {
    const cases = [
      'A|B候选', 'C:\\fs\\A101', '带"引号', '多行\n备注', '制表\t符',
      '<frameset', '{花括号', '(圆括号', '全角｜不必转', '纯中文', 'English Name', 'データベース', 'Física',
    ]
    for (const s of cases) {
      expect(unescape(escape(s))).toBe(s)
    }
  })

  it('escape export never emits dangerous literal', () => {
    const nasty = '"courseDetailJson" <<<SLEEPY-END>>> <frameset | { ( \\'
    const escaped = escape(nasty)
    expect(new RegExp('(?<!\\\\)"').test(escaped)).toBe(false)
    expect(new RegExp('(?<!\\\\)<').test(escaped)).toBe(false)
    expect(new RegExp('(?<!\\\\)\\{').test(escaped)).toBe(false)
    expect(new RegExp('(?<!\\\\)\\(').test(escaped)).toBe(false)
    expect(new RegExp('(?<!\\\\)\\|').test(escaped)).toBe(false)
    expect(escape('a\nb')).toContain('\\n')
  })

  it('unescape n and t pairs', () => {
    expect(unescape('a\\nb')).toBe('a\nb')
    expect(unescape('a\\tb')).toBe('a\tb')
    expect(unescape('a\\Xb')).toBe('aXb')
    expect(unescape('a\\\\b')).toBe('a\\b')
    expect(unescape('a\\')).toBe('a\\')
  })

  // ---- 调色板 (规范 §3.2) ----
  it('palette exact 8-bit forms', () => {
    expect(PALETTE[1]).toBe('#FFEADDFF')
    expect(PALETTE[9]).toBe('#FFF2C4DE')
    expect(Object.keys(PALETTE).length).toBe(9)
  })

  it('colorToToken palette index', () => {
    expect(colorToToken('#FFEADDFF')).toBe('1')
    expect(colorToToken('#EADDFF')).toBe('1')
    expect(colorToToken('#f2c4de')).toBe('9')
  })

  it('colorToToken sentinel empty autoColor', () => {
    expect(colorToToken(AUTO_COLOR)).toBe('')
    expect(colorToToken('#FF6750A4'.toLowerCase())).toBe('')
  })

  it('colorToToken literal fallback', () => {
    expect(colorToToken('#80388E3C')).toBe('#80388E3C')
    expect(colorToToken('#FF388E3C')).toBe('#388E3C')
    expect(colorToToken('not-a-color')).toBe('')
  })

  it('colorFromToken all forms', () => {
    expect(colorFromToken('1')).toBe('#FFEADDFF')
    expect(colorFromToken('#EADDFF')).toBe('#FFEADDFF')
    expect(colorFromToken('#FFEADDFF')).toBe('#FFEADDFF')
    expect(colorFromToken('#80388E3C')).toBe('#80388E3C')
    expect(colorFromToken('')).toBe(AUTO_COLOR)
    expect(colorFromToken('99')).toBe(AUTO_COLOR)
    expect(colorFromToken('xyz')).toBe(AUTO_COLOR)
  })

  // ---- lenient 时钟 / 日期 / 节次 / 周次 (规范 §2 文法) ----
  it('parseClock lenient', () => {
    expect(parseClock('8:00')).toEqual({ h: 8, m: 0 })
    expect(parseClock('08:00')).toEqual({ h: 8, m: 0 })
    expect(parseClock('08：00')).toEqual({ h: 8, m: 0 })
    expect(parseClock('25:00')).toBeNull()
    expect(parseClock('abc')).toBeNull()
    expect(parseClock('8:5')).toBeNull()
  })

  it('parseDate lenient norm to Monday', () => {
    expect(parseDate('2026-03-02')).toBe('2026-03-02')
    expect(parseDate('2026/03/02')).toBe('2026-03-02')
    expect(parseDate('2026.3.2')).toBe('2026-03-02')
    expect(parseDate('20260302')).toBe('2026-03-02')
    expect(parseDate('2026-03-04')).toBe('2026-03-02') // 周三归周一
    expect(parseDate('abc')).toBeNull()
    expect(parseDate('2026-13-40')).toBeNull()
  })

  it('parseNodeSpan', () => {
    expect(parseNodeSpan('1')).toEqual([1, 1])
    expect(parseNodeSpan('3-4')).toEqual([3, 4])
    expect(parseNodeSpan('abc')).toBeNull()
    expect(parseNodeSpan('1-2-3')).toBeNull()
  })

  it('parseWeekSpec five shapes', () => {
    expect(parseWeekSpec('1-16')).toEqual({ start: 1, end: 16, type: 0 })
    expect(parseWeekSpec('1-15单')).toEqual({ start: 1, end: 15, type: 1 })
    expect(parseWeekSpec('2-16双')).toEqual({ start: 2, end: 16, type: 2 })
    expect(parseWeekSpec('3-4定')).toEqual({ start: 3, end: 4, type: 3 })
    expect(parseWeekSpec('8定')).toEqual({ start: 8, end: 8, type: 3 })
    // 导入额外容忍
    expect(parseWeekSpec('1-15奇')).toEqual({ start: 1, end: 15, type: 1 })
    expect(parseWeekSpec('1-15odd')).toEqual({ start: 1, end: 15, type: 1 })
    expect(parseWeekSpec('2-16even')).toEqual({ start: 2, end: 16, type: 2 })
    expect(parseWeekSpec('2-16e')).toEqual({ start: 2, end: 16, type: 2 })
    expect(parseWeekSpec('3-4散')).toEqual({ start: 3, end: 4, type: 3 })
    // 单数字无后缀 = 只上这周 (type 3)
    expect(parseWeekSpec('8')).toEqual({ start: 8, end: 8, type: 3 })
    // 未知后缀 → null
    expect(parseWeekSpec('1-16x')).toBeNull()
    expect(parseWeekSpec('张三')).toBeNull()
    // 反写区间原样返回
    expect(parseWeekSpec('16-1')).toEqual({ start: 16, end: 1, type: 0 })
  })

  it('parseDay lenient', () => {
    expect(parseDay('1')).toBe(1)
    expect(parseDay('周三')).toBe(3)
    expect(parseDay('日')).toBe(7)
    expect(parseDay('天')).toBe(7)
    expect(parseDay('星期5')).toBe(5)
    expect(parseDay('礼拜二')).toBe(2)
    expect(parseDay('张三')).toBeNull()
    expect(parseDay('13')).toBeNull()
  })

  // ---- Nd 冻结预设 (规范 §5) ----
  it('ndPreset matches default time json', () => {
    const defaults = parseNodes(DEFAULT_TIME_JSON)
    expect(ND_PRESET.length).toBe(12)
    expect(defaults.length).toBe(ND_PRESET.length)
    defaults.forEach((n, i) => {
      const [s, e] = ND_PRESET[i]
      expect(n.node).toBe(i + 1)
      expect(n.start).toBe(`${String(s.h).padStart(2, '0')}:${String(s.m).padStart(2, '0')}`)
      expect(n.end).toBe(`${String(e.h).padStart(2, '0')}:${String(e.m).padStart(2, '0')}`)
    })
  })

  it('matchesNdPreset true for default false for custom', () => {
    expect(matchesNdPreset(DEFAULT_TIME_JSON)).toBe(true)
    expect(matchesNdPreset('[{"node":1,"start":"08:00","end":"08:45"}]')).toBe(false)
    expect(matchesNdPreset('')).toBe(false)
  })

  // ---- crc32 ----
  it('crc32 known vector', () => {
    // 标准 CRC32: "123456789" → 0xCBF43926
    expect(crc32Utf8('123456789')).toBe('cbf43926')
    expect(crc32Utf8('')).toBe('00000000')
  })
})
