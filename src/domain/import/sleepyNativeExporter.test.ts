import { describe, it, expect } from 'vitest'
import { exportSleepyV1File, exportSleepyV1ShareText } from './sleepyNativeExporter'
import { parseSleepyV1 } from './sleepyNativeParser'
import { AUTO_COLOR } from './sleepyNativeFormat'
import { DEFAULT_TIME_JSON, parseNodes } from '../timeTable'
import type { Course } from '../../data/types'

/**
 * sleepy-v1 导出器 — Kotlin SleepyNativeExporterTest.kt + SleepyNativeAliasTest.kt 1:1 移植
 * 字段级往返 / 字节级往返 / 同名异组强制 token / Nd 折叠 / chk / share 形态 / 调色板输出 / 别名列
 */
function parse(text: string) {
  return parseSleepyV1(text, 1, AUTO_COLOR)
}

function course(p: Partial<Course> & { courseName: string }): Course {
  return {
    id: 0, groupId: p.groupId ?? '', tableId: 1, courseName: p.courseName,
    teacher: p.teacher ?? '', room: p.room ?? '', note: p.note ?? '', alias: p.alias ?? '',
    day: p.day ?? 1, startNode: p.startNode ?? 1, step: p.step ?? 2,
    startWeek: p.startWeek ?? 1, endWeek: p.endWeek ?? 16, type: p.type ?? 0,
    color: p.color ?? '#FF6750A4', colorMode: 0,
    ownTime: p.ownTime ?? false, startTime: p.startTime ?? '', endTime: p.endTime ?? '',
    isIrregularNode: false, isIrregularTime: false, credit: 0, level: 0,
  }
}

const SPARSE_TIME = '[{"node":1,"start":"08:30","end":"09:15"},{"node":3,"start":"10:00","end":"10:45"},{"node":4,"start":"10:55","end":"11:40"},{"node":5,"start":"14:00","end":"14:45"},{"node":7,"start":"16:00","end":"16:45"},{"node":8,"start":"16:55","end":"17:40"},{"node":9,"start":"19:00","end":"19:45"},{"node":10,"start":"19:55","end":"20:40"},{"node":11,"start":"20:50","end":"21:35"},{"node":12,"start":"21:45","end":"22:30"}]'

describe('sleepyNativeExporter', () => {
  // ---- 字段级往返 (§8.2) ----
  it('round trip minimal', () => {
    const doc = '#sleepy-v1\nC高数|2|1-2'
    const r = parse(doc)
    const out = exportSleepyV1File(r.tableName, r.startDate, r.maxWeek, r.nodesPerDay, r.timeJson, r.courses as unknown as Course[])
    const r2 = parse(out)
    expect(r2.courses).toHaveLength(1)
    const a = r.courses[0]
    const b = r2.courses[0]
    expect(b.courseName).toBe(a.courseName)
    expect(b.day).toBe(a.day)
    expect(b.startNode).toBe(a.startNode)
    expect(b.step).toBe(a.step)
    expect(b.startWeek).toBe(a.startWeek)
    expect(b.endWeek).toBe(a.endWeek)
    expect(b.type).toBe(a.type)
  })

  it('round trip full table example 3', () => {
    const courses: Course[] = [
      course({ courseName: '高等数学A', day: 1, startNode: 1, step: 2, type: 0, teacher: '张三', room: 'A101', color: '#FFEADDFF', groupId: 'g1' }),
      course({ courseName: '高等数学A', day: 3, startNode: 3, step: 2, type: 0, teacher: '张三', room: 'B202', groupId: 'g1' }),
      course({ courseName: '大学英语', day: 2, startNode: 3, step: 2, startWeek: 1, endWeek: 15, type: 1, teacher: '李四', room: 'C301', groupId: 'g2' }),
      course({ courseName: '数据结构', day: 2, startNode: 3, step: 2, startWeek: 2, endWeek: 16, type: 2, teacher: '王五', room: 'C302', color: '#FF388E3C', groupId: 'g3' }),
      course({ courseName: '体育', day: 4, startNode: 5, step: 2, startWeek: 3, endWeek: 4, type: 3, teacher: '赵六', room: '田径场', groupId: 'g4' }),
      course({ courseName: '物理实验', day: 5, startNode: 8, step: 2, startWeek: 8, endWeek: 8, type: 3, teacher: '钱七', room: '实验楼501', note: '穿实验服', groupId: 'g5' }),
      course({ courseName: 'Java实战', day: 4, startNode: 9, step: 3, type: 0, teacher: '孙八', room: '机房', ownTime: true, startTime: '19:00', endTime: '21:30', groupId: 'g6' }),
      course({ courseName: '电磁场', day: 2, startNode: 6, step: 2, startWeek: 1, endWeek: 8, type: 0, teacher: '周九', room: 'F405', groupId: 'g7' }),
      course({ courseName: '电磁场', day: 2, startNode: 6, step: 2, startWeek: 11, endWeek: 16, type: 0, teacher: '周九', room: 'F405', groupId: 'g7' }),
      course({ courseName: '影视鉴赏', day: 7, startNode: 6, step: 1, startWeek: 10, endWeek: 16, type: 2, room: 'D001', note: 'A|B候选', groupId: 'g8' }),
    ]
    const out = exportSleepyV1File('软件工程2026春', '2026-03-02', 20, 12, SPARSE_TIME, courses)
    const r = parse(out)
    expect(r.droppedLines).toHaveLength(0)
    expect(r.warnings).toHaveLength(0)
    expect(r.courses).toHaveLength(courses.length)
    // 复合 key 对齐后逐条断言
    const key = (c: { courseName: string; day: number; startNode: number; startWeek: number; endWeek: number; note: string }) =>
      `${c.courseName}|${c.day}|${c.startNode}|${c.startWeek}-${c.endWeek}|${c.note}`
    const inByKey = new Map<string, Course[]>()
    for (const c of courses) {
      const k = key(c)
      if (!inByKey.has(k)) inByKey.set(k, [])
      inByKey.get(k)!.push(c)
    }
    const outByKey = new Map<string, typeof r.courses>()
    for (const c of r.courses) {
      const k = key(c)
      if (!outByKey.has(k)) outByKey.set(k, [])
      outByKey.get(k)!.push(c)
    }
    expect([...inByKey.keys()].sort()).toEqual([...outByKey.keys()].sort())
    for (const [k, ins] of inByKey) {
      const outs = outByKey.get(k)!
      expect(outs).toHaveLength(ins.length)
      ins.forEach((c, i) => {
        expect(outs[i].courseName).toBe(c.courseName)
        expect(outs[i].teacher).toBe(c.teacher)
        expect(outs[i].room).toBe(c.room)
        expect(outs[i].note).toBe(c.note)
        expect(outs[i].day).toBe(c.day)
        expect(outs[i].startNode).toBe(c.startNode)
        expect(outs[i].step).toBe(c.step)
        expect(outs[i].startWeek).toBe(c.startWeek)
        expect(outs[i].endWeek).toBe(c.endWeek)
        expect(outs[i].type).toBe(c.type)
        expect(outs[i].color.toUpperCase()).toBe(c.color.toUpperCase())
      })
    }
    // 分组保真: 输入同组 → 输出同组; 输入异组 → 输出异组
    const groupMap = new Map<string, string>()
    for (const c of courses) {
      const oc = r.courses.find((x) => key(x) === key(c))!
      const prev = groupMap.get(c.groupId)
      if (prev !== undefined) expect(oc.groupId).toBe(prev)
      groupMap.set(c.groupId, oc.groupId)
    }
    expect(new Set(groupMap.values()).size).toBe(new Set(courses.map((c) => c.groupId)).size)
    // ownTime 课
    const java = r.courses.find((c) => c.courseName === 'Java实战')!
    expect(java.ownTime).toBe(true)
    expect(java.startTime).toBe('19:00')
    expect(java.endTime).toBe('21:30')
    // 影视鉴赏备注含 | 已转义
    expect(r.courses.find((c) => c.courseName === '影视鉴赏')!.note).toBe('A|B候选')
  })

  // ---- 字节级往返 (§8.2) ----
  it('byte level round trip', () => {
    const cs: Course[] = [
      course({ courseName: '高数', teacher: '张三', room: 'A101', color: '#FFEADDFF', groupId: 'g1' }),
      course({ courseName: '英语', day: 2, startNode: 3, startWeek: 1, endWeek: 15, type: 1, teacher: '李四', room: 'C301', groupId: 'g2' }),
    ]
    const first = exportSleepyV1File('测试表', '2026-03-02', 20, 12, DEFAULT_TIME_JSON, cs)
    const parsed = parse(first)
    const second = exportSleepyV1File(parsed.tableName, parsed.startDate, parsed.maxWeek, parsed.nodesPerDay, parsed.timeJson, parsed.courses as unknown as Course[])
    const stripChk = (s: string) => s.split('\n').filter((l) => !l.startsWith('z|')).join('\n')
    expect(stripChk(second)).toBe(stripChk(first))
  })

  // ---- 同名异组强制 token (§3.4 契约二) ----
  it('same name different groups must emit token', () => {
    const courses: Course[] = [
      course({ courseName: '同名', step: 1, groupId: 'g1' }),
      course({ courseName: '同名', day: 2, step: 1, groupId: 'g2' }),
    ]
    const out = exportSleepyV1File('t', '2026-03-02', 20, 12, '', courses)
    const lines = out.split('\n').filter((l) => l.startsWith('C同名'))
    expect(lines).toHaveLength(2)
    for (const l of lines) {
      const token = l.split('|').pop()!
      expect(token).not.toBe('')
    }
  })

  it('same name twice in same group writes token (Kotlin parity: sameNameCount>1)', () => {
    // Kotlin exportCourses: sameGroupCount>0 && sameNameCount>1 → 写 token (组是否相同不参与)
    const courses: Course[] = [
      course({ courseName: '高数', groupId: 'g1', color: '#FFEADDFF' }),
      course({ courseName: '高数', day: 3, startNode: 3, groupId: 'g1' }),
    ]
    const out = exportSleepyV1File('t', '2026-03-02', 20, 12, '', courses)
    const lines = out.split('\n').filter((x) => x.startsWith('C高数'))
    expect(lines).toHaveLength(2)
    // 两行同 token (同组)
    expect(lines[0].split('|').pop()).toBe(lines[1].split('|').pop())
    expect(lines[0].split('|').pop()).not.toBe('')
    // 往返后同组不变
    const r = parse(out)
    expect(r.courses[0].groupId).toBe(r.courses[1].groupId)
  })

  it('unique name writes empty token', () => {
    const courses: Course[] = [
      course({ courseName: '高数', groupId: 'g1' }),
      course({ courseName: '英语', groupId: 'g2', day: 2 }),
    ]
    const out = exportSleepyV1File('t', '2026-03-02', 20, 12, '', courses)
    for (const l of out.split('\n').filter((x) => x.startsWith('C'))) {
      expect(l.split('|').pop()).toBe('')
    }
  })

  // ---- Nd 折叠 (§5) ----
  it('nd preset collapsed', () => {
    const out = exportSleepyV1File('t', '2026-03-02', 20, 12, DEFAULT_TIME_JSON, [])
    expect(out.includes('\nNd\n') || out.endsWith('Nd')).toBe(true)
    const parsed = parse(out)
    expect(parseNodes(parsed.timeJson)).toHaveLength(12)
  })

  it('sparse time table not collapsed to Nd', () => {
    const custom = '[{"node":1,"start":"08:00","end":"08:45"}]'
    const out = exportSleepyV1File('t', '2026-03-02', 20, 12, custom, [])
    expect(out).toContain('N1|')
    expect(out.includes('\nNd\n') || out.endsWith('Nd')).toBe(false)
  })

  // ---- chk 写入 (§8.1) ----
  it('chk written in file mode', () => {
    const out = exportSleepyV1File('t', '2026-03-02', 20, 12, '', [course({ courseName: '高数' })])
    expect(out).toContain('z|chk=crc32:')
    expect(/chk=crc32:([0-9a-f]{8})/.exec(out)).not.toBeNull()
  })

  // ---- share 形态 (§1.1) ----
  it('share text wrapped no chk', () => {
    const out = exportSleepyV1ShareText('t', '2026-03-02', 20, 12, '', [course({ courseName: '高数' })])
    expect(out.startsWith('【来自Sleepy】')).toBe(true)
    expect(out).toContain('<<<SLEEPY-BEGIN>>>')
    expect(out).toContain('<<<SLEEPY-END>>>')
    expect(out).not.toContain('z|chk=')
  })

  it('share text parse round trip through marker', () => {
    const cs: Course[] = [course({ courseName: '高数', day: 2, startNode: 1, step: 2 })]
    const out = exportSleepyV1ShareText('t', '2026-03-02', 20, 12, '', cs)
    const r = parse(out) // extractMarkedBody 在分派链里 — parseSleepyV1 收到的是原始形态? 不: marker 剥除在 ScheduleParser 分派层
    expect(r.courses).toHaveLength(1)
  })

  // ---- 调色板输出 (§3.2) ----
  it('palette output compact index', () => {
    const out = exportSleepyV1File('t', '2026-03-02', 20, 12, '', [course({ courseName: '课', color: '#FFEADDFF' })])
    expect(out.includes('\nC课|1|1-2|1-16|||1|||\n') || out.includes('\nC课|1|1-2|1-16|||1|||')).toBe(true)
  })

  it('custom hex output 6 digit', () => {
    const out = exportSleepyV1File('t', '2026-03-02', 20, 12, '', [course({ courseName: '课', color: '#FF388E3C' })])
    expect(out).toContain('|#388E3C|')
  })

  it('custom hex output 9 digit kept for transparency', () => {
    const out = exportSleepyV1File('t', '2026-03-02', 20, 12, '', [course({ courseName: '课', color: '#80388E3C' })])
    expect(out).toContain('|#80388E3C|')
  })

  it('auto color empty', () => {
    const out = exportSleepyV1File('t', '2026-03-02', 20, 12, '', [course({ courseName: '课', color: '#FF6750A4' })])
    expect(out).toContain('\nC课|1|1-2|1-16||||||')
  })

  // ---- 空白表名 (§3.5 导入的课表兜底) ----
  it('blank table name falls back to 导入的课表', () => {
    const out = exportSleepyV1File('', '2026-03-02', 20, 12, '', [])
    expect(out).toContain('T导入的课表|')
    const parsed = parse(out)
    expect(parsed.tableName).toBe('导入的课表')
  })

  // ---- 别名列 (issue#26) ----
  it('alias written as 11th column when non empty', () => {
    const out = exportSleepyV1File('测试表', '2026-03-02', 20, 12, '', [course({ courseName: '高等数学', alias: '微积分' })])
    const line = out.split('\n').find((l) => l.startsWith('C高等数学'))!
    expect(line.split('|')).toHaveLength(11)
    expect(line.endsWith('|微积分')).toBe(true)
  })

  it('alias omitted when empty (byte-shape compatible with old v1)', () => {
    const out = exportSleepyV1File('测试表', '2026-03-02', 20, 12, '', [course({ courseName: '高等数学' })])
    const line = out.split('\n').find((l) => l.startsWith('C高等数学'))!
    expect(line.split('|')).toHaveLength(10)
  })

  it('alias round trip with escape', () => {
    const cs: Course[] = [course({ courseName: '高等数学', alias: '高|数' })]
    const out = exportSleepyV1File('t', '2026-03-02', 20, 12, '', cs)
    const r = parse(out)
    expect(r.courses[0].alias).toBe('高|数')
    expect(r.courses[0].courseName).toBe('高等数学')
  })

  // ---- 密度锚 (§10) ----
  it('byte level density anchor', () => {
    const out = exportSleepyV1File('t', '2026-03-02', 20, 12, '', [course({ courseName: '高数', day: 2, startNode: 1, step: 2 })])
    expect(out.length).toBeLessThanOrEqual(100) // 示例① 24B; 含 T 行 + chk 也远小于 100
  })
})
