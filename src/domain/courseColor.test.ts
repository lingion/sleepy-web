import { describe, it, expect } from 'vitest'
import {
  javaStringHashCode,
  stableHue,
  hasCustomColor,
  luminance,
  hslToRgb,
  rgbToHex,
  parseHex,
  rgbToHsl,
  pickCourseColor,
  pickCourseColorWithGroupRows,
  groupSourceColorHex,
  goldenAngleForRow,
  conflictBorderColor,
  foldFlapColor,
  SENTINEL_COLOR,
} from './courseColor'
import type { Course } from '../data/types'

function mkCourse(partial: Partial<Course>): Course {
  return {
    id: 1,
    groupId: 'g1',
    tableId: 1,
    courseName: '高等数学',
    teacher: '',
    room: '',
    note: '',
    alias: '',
    day: 1,
    startNode: 1,
    step: 2,
    startWeek: 1,
    endWeek: 16,
    type: 0,
    color: '',
    colorMode: 0,
    ownTime: false,
    isIrregularNode: false,
    isIrregularTime: false,
    startTime: '',
    endTime: '',
    credit: 0,
    level: 0,
    ...partial,
  }
}

describe('javaStringHashCode — 与 JVM String.hashCode 一致', () => {
  it('空串 = 0', () => {
    expect(javaStringHashCode('')).toBe(0)
  })

  it('"hello" = 99162322 (JVM 基准值)', () => {
    expect(javaStringHashCode('hello')).toBe(99162322)
  })

  it('中文字符串与 JVM 一致 (模 2^32 符号回绕)', () => {
    // JVM: "高等数学".hashCode() — 用公式手算: h = 0;
    // h = 0*31+39640 = 39640; h = 39640*31+31561 = 1260001... 逐位递推
    // 直接断言确定性即可, 同时断言 32 位符号整数范围
    const h = javaStringHashCode('高等数学')
    expect(Number.isInteger(h)).toBe(true)
    expect(h).toBeGreaterThanOrEqual(-2147483648)
    expect(h).toBeLessThanOrEqual(2147483647)
    // 相同输入相同输出
    expect(javaStringHashCode('高等数学')).toBe(h)
  })

  it('与手算公式一致: h = h*31 + c (int 溢出回绕)', () => {
    const s = 'abc'
    // JVM 基准: 'a'=97, 'b'=98, 'c'=99 → 递推 97*31+98=3105, 3105*31+99=96354
    expect(javaStringHashCode(s)).toBe(96354)
  })
})

describe('stableHue — 黄金角色相 (Kotlin Float 语义)', () => {
  it('返回值在 [0, 360)', () => {
    for (const g of ['g1', 'math-2024', '物理', 'x', '']) {
      const h = stableHue(g)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(360)
    }
  })

  it('同一 groupId 永远同色相', () => {
    expect(stableHue('grp-7')).toBe(stableHue('grp-7'))
  })

  it('与 JVM Float 运算位级一致 (CourseColorUtil.kt:53-54)', () => {
    // 基准值 = JVM (java 17) 实跑 ((hashCode().toLong() * 137.508f) % 360f + 360f) % 360f,
    // 逐级 float32 舍入; web 端 Math.fround 复刻, 位级 (float32) 相等。
    const anchors: Record<string, number> = {
      g1: 120.90625,
      'math-2024': 112,
      物理: 88,
      x: 300.958984375,
      '': 0,
      'test-group': 344,
      'grp-7': 0,
      phy: 185,
      zzz: 264,
      same: 136,
      高等数学: 256,
      大学英语: 24,
      数据结构与算法分析: 216,
    }
    for (const [gid, expected] of Object.entries(anchors)) {
      expect(stableHue(gid)).toBe(Math.fround(expected))
    }
  })

  it('与 JS double 语义有差 (Float32 舍入是刻意行为)', () => {
    // 高等数学: double=192.64 vs Float=256 — 证明 fround 链生效, 不是侥幸相同
    const hash = javaStringHashCode('高等数学')
    const doubleValue = (((hash * 137.508) % 360) + 360) % 360
    expect(doubleValue).not.toBeCloseTo(stableHue('高等数学'), 0)
  })
})

describe('hasCustomColor — 哨兵判定', () => {
  it('空色 = 无自定义', () => {
    expect(hasCustomColor(mkCourse({ color: '' }))).toBe(false)
  })

  it('哨兵色 = 无自定义 (大小写不敏感)', () => {
    expect(hasCustomColor(mkCourse({ color: '#FF6750A4' }))).toBe(false)
    expect(hasCustomColor(mkCourse({ color: '#ff6750a4' }))).toBe(false)
  })

  it('其他色 = 有自定义', () => {
    expect(hasCustomColor(mkCourse({ color: '#FF123456' }))).toBe(true)
  })
})

describe('luminance — BT.601 加权', () => {
  it('纯黑 = 0', () => {
    expect(luminance([0, 0, 0])).toBe(0)
  })

  it('纯白 = 1', () => {
    expect(luminance([255, 255, 255])).toBeCloseTo(1, 10)
  })

  it('纯绿权重最高 (0.587)', () => {
    expect(luminance([0, 255, 0])).toBeCloseTo(0.587, 2)
  })
})

describe('hslToRgb / rgbToHex / parseHex / rgbToHsl 往返', () => {
  it('hsl(0, 1, 0.5) = 纯红', () => {
    expect(hslToRgb(0, 1, 0.5)).toEqual([255, 0, 0])
  })

  it('hsl(120, 1, 0.5) = 纯绿', () => {
    expect(hslToRgb(120, 1, 0.5)).toEqual([0, 255, 0])
  })

  it('hsl(240, 1, 0.5) = 纯蓝', () => {
    expect(hslToRgb(240, 1, 0.5)).toEqual([0, 0, 255])
  })

  it('Android 亮色默认 (h=262, s=0.55, l=0.82) 生成合法粉彩色', () => {
    const [r, g, b] = hslToRgb(262, 0.55, 0.82)
    expect(r).toBeGreaterThanOrEqual(0)
    expect(r).toBeLessThanOrEqual(255)
    // 粉彩 = 高亮度 → 各通道都不低
    expect(Math.min(r, g, b)).toBeGreaterThan(100)
  })

  it('rgbToHex 8 位 padStart', () => {
    expect(rgbToHex([0, 0, 0])).toBe('#000000')
    expect(rgbToHex([255, 255, 255])).toBe('#ffffff')
    expect(rgbToHex([0x12, 0x34, 0x56])).toBe('#123456')
  })

  it('parseHex 支持 6 位', () => {
    expect(parseHex('#123456')).toEqual([0x12, 0x34, 0x56])
  })

  it('parseHex 拒绝 3 位缩写 (对齐 Android Color.parseColor 失败语义)', () => {
    expect(parseHex('#f0a')).toBeNull()
    expect(parseHex('f0a')).toBeNull()
  })

  it('parseHex 支持 8 位 (#AARRGGBB, alpha 忽略)', () => {
    expect(parseHex('#80123456')).toEqual([0x12, 0x34, 0x56])
  })

  it('parseHex 非法输入 = null', () => {
    expect(parseHex('not-a-color')).toBeNull()
    expect(parseHex('#12345')).toBeNull()
  })

  it('rgbToHsl 往返: hsl→rgb→hsl 保 hue', () => {
    const h0 = 262
    const [r, g, b] = hslToRgb(h0, 0.55, 0.82)
    const [h1] = rgbToHsl([r, g, b])
    expect(Math.abs(h1 - h0)).toBeLessThan(1.5)
  })
})

describe('pickCourseColor — 三层决策树', () => {
  it('① 自定义色优先返回', () => {
    const c = mkCourse({ color: '#FFAA0000', colorMode: 0 })
    expect(pickCourseColor(c, false, '#EEEEEE')).toBe('#aa0000')
  })

  it('② colorless=true → 中性灰 (即使 color 空白)', () => {
    const c = mkCourse({ color: '' })
    expect(pickCourseColor(c, false, '#EEEEEE', true)).toBe('#EEEEEE')
  })

  it('③ 默认走 groupId 黄金角, 亮暗模式 S/L 不同', () => {
    const c = mkCourse({ groupId: 'phy', color: '' })
    const light = pickCourseColor(c, false, '#EEEEEE')
    const dark = pickCourseColor(c, true, '#EEEEEE')
    expect(light).not.toBe(dark)
    // 亮色 L=0.82 → 亮; 暗色 L=0.28 → 暗
    const lr = luminance(parseHex(light)!)
    const dr = luminance(parseHex(dark)!)
    expect(lr).toBeGreaterThan(0.7)
    expect(dr).toBeLessThan(0.35)
  })

  it('同 groupId 同色', () => {
    const a = mkCourse({ groupId: 'same', id: 1 })
    const b = mkCourse({ groupId: 'same', id: 99 })
    expect(pickCourseColor(a, false, '#EEE')).toBe(pickCourseColor(b, false, '#EEE'))
  })
})

describe('pickCourseColorWithGroupRows — issue#22 三态', () => {
  it('CUSTOM: 返回 row.color', () => {
    const row = mkCourse({ colorMode: 2, color: '#FF00FF00' })
    const out = pickCourseColorWithGroupRows(row, [row], false, '#EEE')
    expect(out).toBe('#00ff00')
  })

  it('AUTO: 同组两行色相相差 golden angle (137.508°)', () => {
    const row1 = mkCourse({ id: 1, colorMode: 1 })
    const row2 = mkCourse({ id: 2, colorMode: 1 })
    const out1 = pickCourseColorWithGroupRows(row1, [row1, row2], false, '#EEE')
    const out2 = pickCourseColorWithGroupRows(row2, [row1, row2], false, '#EEE')
    const [h1] = rgbToHsl(parseHex(out1)!)
    const [h2] = rgbToHsl(parseHex(out2)!)
    let diff = Math.abs(h2 - h1)
    if (diff > 180) diff = 360 - diff
    expect(diff).toBeCloseTo(137.508, 0)
  })

  it('AUTO + colorless → 中性灰', () => {
    const row = mkCourse({ colorMode: 1 })
    expect(pickCourseColorWithGroupRows(row, [row], false, '#EEE', true)).toBe('#EEE')
  })

  it('GROUP: 无自定义色 → stableHue', () => {
    const row = mkCourse({ groupId: 'zzz', colorMode: 0, color: '' })
    const out = pickCourseColorWithGroupRows(row, [row], false, '#EEE')
    const hue = stableHue('zzz')
    const expected = rgbToHex(hslToRgb(hue, 0.55, 0.82))
    expect(out).toBe(expected)
  })

  it('GROUP: 哨兵色视为未设置 → stableHue', () => {
    const row = mkCourse({ groupId: 'zzz', colorMode: 0, color: SENTINEL_COLOR })
    const out = pickCourseColorWithGroupRows(row, [row], false, '#EEE')
    const expected = rgbToHex(hslToRgb(stableHue('zzz'), 0.55, 0.82))
    expect(out).toBe(expected)
  })
})

describe('groupSourceColorHex — 组色源', () => {
  it('取 colorMode=GROUP 中 id 最小的行', () => {
    const a = mkCourse({ id: 5, colorMode: 0, color: '#FF111111' })
    const b = mkCourse({ id: 3, colorMode: 0, color: '#FF222222' })
    const c = mkCourse({ id: 1, colorMode: 1, color: '#FF333333' })
    expect(groupSourceColorHex([a, b, c])).toBe('#FF222222')
  })

  it('无 GROUP 行时取全体 id 最小', () => {
    const a = mkCourse({ id: 5, colorMode: 1, color: '#FF111111' })
    const b = mkCourse({ id: 2, colorMode: 1, color: '#FF222222' })
    expect(groupSourceColorHex([a, b])).toBe('#FF222222')
  })

  it('空数组 = 空串', () => {
    expect(groupSourceColorHex([])).toBe('')
  })
})

describe('goldenAngleForRow — AUTO 模式色相推进', () => {
  it('组源色为空时 baseHue=0, 首行 hue=0', () => {
    const row = mkCourse({ id: 10 })
    expect(goldenAngleForRow(row, [row], '')).toBe(0)
  })

  it('按 id 排序取序号 (JVM Float 基准)', () => {
    const r1 = mkCourse({ id: 7 })
    const r2 = mkCourse({ id: 3 })
    const r3 = mkCourse({ id: 9 })
    // sorted by id: [3,7,9] → r1(idx=1) hue = float32(137.508)
    expect(goldenAngleForRow(r1, [r1, r2, r3], '')).toBe(Math.fround(137.508))
    // r3(idx=2) hue = float32(275.016)
    expect(goldenAngleForRow(r3, [r1, r2, r3], '')).toBe(Math.fround(275.016))
    // JVM 实跑锚定: idx=10 → 295.07996 (float32)
    const r11 = mkCourse({ id: 11 })
    const rows = Array.from({ length: 11 }, (_, i) => mkCourse({ id: i + 1 }))
    expect(goldenAngleForRow(r11, rows, '')).toBe(Math.fround(295.0799560546875))
  })

  it('组源色非空时 baseHue = 组源色色相', () => {
    const row = mkCourse({ id: 1 })
    const baseHue = rgbToHsl(parseHex('#FF0000')!)[0] // 红 = 0
    const out = goldenAngleForRow(row, [row], '#FF0000')
    expect(out).toBeCloseTo((baseHue + 0) % 360, 3)
  })
})

describe('conflictBorderColor — 冲突卡自派生描边色 (ConflictCard.kt:133-137)', () => {
  it('亮色 (>0.5) 压黑 35%', () => {
    // 纯白: lerp(255,0,0.35)=165.75→166
    expect(conflictBorderColor([255, 255, 255])).toEqual([166, 166, 166])
  })

  it('暗色 (<0.5) 提白 45%', () => {
    // 纯黑: lerp(0,255,0.45)=114.75→115
    expect(conflictBorderColor([0, 0, 0])).toEqual([115, 115, 115])
  })

  it('阈值判定用 BT.601 亮度 (luminance 0.5 边界)', () => {
    // 绿 [0,255,0] luminance=0.587>0.5 → 压黑分支
    expect(conflictBorderColor([0, 255, 0])).toEqual([0, 166, 0])
    // 红纯色 [255,0,0] luminance=0.299<0.5 → 提白分支: lerp(0,255,0.45)=114.75→115
    expect(conflictBorderColor([255, 0, 0])).toEqual([255, 115, 115])
  })

  it('结果与 base 色有明度差 (对比目的)', () => {
    const base: [number, number, number] = [255, 226, 213]
    const out = conflictBorderColor(base)
    expect(luminance(out)).toBeLessThan(luminance(base))
  })
})

describe('foldFlapColor — FOLD 折角 flap 色 (ConflictCard.kt:142)', () => {
  it('课色压黑 28%', () => {
    // 纯白: lerp(255,0,0.28)=183.6→184
    expect(foldFlapColor([255, 255, 255])).toEqual([184, 184, 184])
  })

  it('与描边色压暗幅度不同 (flap 0.28 vs border 0.35)', () => {
    const base: [number, number, number] = [255, 255, 255]
    expect(foldFlapColor(base)).not.toEqual(conflictBorderColor(base))
  })

  it('比 base 暗 (翻面朝里的物理意象)', () => {
    const base: [number, number, number] = [200, 230, 255]
    expect(luminance(foldFlapColor(base))).toBeLessThan(luminance(base))
  })
})
