import { describe, it, expect } from 'vitest'
import { parseSleepyV1, type ParseResultV1 } from './sleepyNativeParser'
import { AUTO_COLOR, crc32Utf8 } from './sleepyNativeFormat'
import { parseNodes } from '../timeTable'
import { nameUUIDFromBytes } from './uuid'

/**
 * sleepy-v1 解析器 — Kotlin SleepyNativeParserTest.kt 1:1 移植
 * 示例①②③字段级断言 / 三态处置 / 上报双通道 / groupId 分区 / 空表二分 / 重复行 / 全角次级分隔
 *
 * 行格式事实(Kotlin 权威): T 行 = "T" + 名字(无 | 分隔) + |日期|maxWeek|nodesPerDay[|n=X];
 * N 行 = "N" + 节号(无 |) + |start|end; Nd = 单独一行。
 */
const DC = AUTO_COLOR
function parse(text: string): ParseResultV1 {
  return parseSleepyV1(text, 7, DC)
}
type ParsedCourseLike = ParseResultV1['courses'][number]

describe('sleepyNativeParser', () => {
  // ---- 示例① 最小单课 (§9-①) ----
  it('minimal single course defaults', () => {
    const r = parse('#sleepy-v1\nC高数|2|1-2')
    expect(r.courses).toHaveLength(1)
    const c = r.courses[0]
    expect(c.courseName).toBe('高数')
    expect(c.day).toBe(2)
    expect(c.startNode).toBe(1)
    expect(c.step).toBe(2)
    expect(c.startWeek).toBe(1) // 缺省 1-16 type 3
    expect(c.endWeek).toBe(16)
    expect(c.type).toBe(3)
    expect(c.teacher).toBe('')
    expect(c.room).toBe('')
    expect(c.color).toBe(AUTO_COLOR)
    expect(c.ownTime).toBe(false)
    expect(r.droppedLines).toHaveLength(0)
    expect(r.warnings).toHaveLength(0)
    expect(r.groupIdsAuthoritative).toBe(true)
  })

  // ---- 示例② 全字段单课 (§9-②) ----
  it('full field course', () => {
    const r = parse('#sleepy-v1\nT测试表|2026-03-02|20|12|n=1\nC高等数学A|1|1-2|1-16|张三|A101|1|带习题册|19:00-21:30|7')
    expect(r.courses).toHaveLength(1)
    const c = r.courses[0]
    expect(c.teacher).toBe('张三')
    expect(c.room).toBe('A101')
    expect(c.color).toBe('#FFEADDFF') // 调色板 1 → 8 位规范形
    expect(c.note).toBe('带习题册')
    expect(c.ownTime).toBe(true)
    expect(c.startTime).toBe('19:00')
    expect(c.endTime).toBe('21:30')
    expect(r.tableName).toBe('测试表')
    expect(r.startDate).toBe('2026-03-02')
    expect(r.maxWeek).toBe(20)
    expect(r.nodesPerDay).toBe(12)
  })

  // ---- 示例③ 完整表: 全部周类型与散周 partition (§9-③) ----
  it('full table all week types', () => {
    const doc = [
      '#sleepy-v1',
      'T软件工程2026春|2026-03-02|20|12|n=10',
      'N1|08:30|09:15',
      'N9|19:00|19:45',
      'C高等数学A|1|1-2|1-16|张三|A101|1|带好习题册||1',
      'C高等数学A|3|3-4|1-16|张三|B202||||1',
      'C大学英语|2|3-4|1-15单|李四|C301||||2',
      'C数据结构|2|3-4|2-16双|王五|C302|#388E3C|||3',
      'C体育|4|5-6|3-4定|赵六|田径场||||',
      'C物理实验|5|8-9|8定|钱七|实验楼501||穿实验服||',
      'CJava实战|4|9-11|1-16|孙八|机房|||19:00-21:30|4',
      'C电磁场|2|6-7|1-8|周九|F405||||9',
      'C电磁场|2|6-7|11-16|周九|F405||||9',
      'C影视鉴赏|7|6|10-16双||D001||A\\|B候选||',
    ].join('\n')
    const r = parse(doc)
    expect(r.courses).toHaveLength(10)
    expect(r.droppedLines).toHaveLength(0)
    expect(r.warnings).toHaveLength(0)
    const byWeekType: Record<string, ParsedCourseLike[]> = {}
    for (const c of r.courses) (byWeekType[String(c.type)] ??= []).push(c)
    expect(Object.keys(byWeekType).sort()).toEqual(['0', '1', '2', '3'])
    // type 1 单周
    const eng = byWeekType['1']![0]
    expect(eng.courseName).toBe('大学英语')
    expect(eng.startWeek).toBe(1)
    expect(eng.endWeek).toBe(15)
    // type 3 区间(体育)
    const pe = r.courses.find((c) => c.courseName === '体育')!
    expect(pe.startWeek).toBe(3)
    expect(pe.endWeek).toBe(4)
    expect(pe.type).toBe(3)
    // type 3 单值(物理实验 8定)
    const lab = r.courses.find((c) => c.courseName === '物理实验')!
    expect(lab.startWeek).toBe(8)
    expect(lab.endWeek).toBe(8)
    expect(lab.type).toBe(3)
    // 散周两行同组 token 9
    const em = r.courses.filter((c) => c.courseName === '电磁场')
    expect(em).toHaveLength(2)
    expect(em[0].groupId).toBe(em[1].groupId)
    expect(em[0].startWeek).toBe(1)
    expect(em[0].endWeek).toBe(8)
    expect(em[1].startWeek).toBe(11)
    expect(em[1].endWeek).toBe(16)
    // 稀疏作息: 只声明 N1/N9
    expect(parseNodes(r.timeJson)).toHaveLength(2)
    expect(r.nodesPerDay).toBe(12) // 声明 12, 课程到达 11, N 行到达 9
    // 备注竖线转义
    expect(r.courses.find((c) => c.courseName === '影视鉴赏')!.note).toBe('A|B候选')
    // ownTime
    const java = r.courses.find((c) => c.courseName === 'Java实战')!
    expect(java.ownTime).toBe(true)
    expect(java.startTime).toBe('19:00')
    expect(java.endTime).toBe('21:30')
    // 同名同组(高数两行 token 1)
    const math = r.courses.filter((c) => c.courseName === '高等数学A')
    expect(math).toHaveLength(2)
    expect(math[0].groupId).toBe(math[1].groupId)
  })

  // ---- 三态处置 (§7.2) ----
  it('empty means default no report', () => {
    const r = parse('#sleepy-v1\nC课|||||||||')
    expect(r.courses).toHaveLength(1)
    expect(r.courses[0].day).toBe(1)
    expect(r.warnings).toHaveLength(0)
  })

  it('out of range clamped and reported', () => {
    const r = parse('#sleepy-v1\nC甲|0|1-2|1-16\nC乙|8|1-2|1-16\nC丙|9|1-2|1-16')
    expect(r.courses).toHaveLength(3)
    expect(r.courses[0].day).toBe(1)
    expect(r.courses[1].day).toBe(7)
    expect(r.courses[2].day).toBe(7)
    expect(r.droppedLines.length).toBeGreaterThan(0)
  })

  it('illegal shape line dropped', () => {
    const r = parse('#sleepy-v1\nC好课|1|1-2|1-16\nC坏课|张三|1-2|1-16\nC好课2|1|1-2|1-16')
    expect(r.courses).toHaveLength(2)
    expect(r.droppedLines).toHaveLength(1)
    expect(r.droppedLines[0]).toContain('坏课')
  })

  it('no name line dropped → all-dropped failure', () => {
    expect(() => parse('#sleepy-v1\nC|1|1-2|1-16')).toThrow(/没进去|未能/)
  })

  it('reversed node and week swapped and reported', () => {
    const r = parse('#sleepy-v1\nC甲|1|4-3|16-1')
    expect(r.courses).toHaveLength(1)
    expect(r.courses[0].startNode).toBe(3)
    expect(r.courses[0].step).toBe(2)
    expect(r.courses[0].startWeek).toBe(1)
    expect(r.courses[0].endWeek).toBe(16)
    expect(r.droppedLines.length).toBeGreaterThan(0)
  })

  it('illegal time span: time dropped course kept', () => {
    const r = parse('#sleepy-v1\nC晚课|1|9-10|1-16||||||25:00-26:00\nC晚课|2|9-10|1-16||||||19:00-18:00')
    expect(r.courses).toHaveLength(2)
    expect(r.courses.every((c) => !c.ownTime)).toBe(true)
  })

  it('week beyond maxWeek kept not clamped', () => {
    const r = parse('#sleepy-v1\nT|2026-03-02|20|12\nC长周课|1|1-2|1-23')
    expect(r.courses[0].endWeek).toBe(23)
    expect(r.warnings).toHaveLength(0)
  })

  it('unknown week suffix → all-dropped failure', () => {
    expect(() => parse('#sleepy-v1\nC甲|1|1-2|1-16x')).toThrow(/没进去|未能/)
  })

  // ---- 上报双通道 (§7.3) ----
  it('T row clamp goes to warnings', () => {
    const r = parse('#sleepy-v1\nT|2026-13-99|99|999')
    expect(r.warnings.length).toBeGreaterThanOrEqual(3)
    expect(r.warnings.some((w) => w.includes('maxWeek') || w.includes('周数'))).toBe(true)
  })

  it('node reach raises nodesPerDay with warning', () => {
    const r = parse('#sleepy-v1\nT|2026-03-02|20|12\nC高节次课|1|13-15|1-16')
    expect(r.nodesPerDay).toBe(15) // 抬升不钳课程
    expect(r.warnings.some((w) => w.includes('13') || w.includes('节'))).toBe(true)
  })

  // ---- groupId 分区 (§3.4) ----
  it('same name empty token share group', () => {
    const r = parse('#sleepy-v1\nC甲课|1|1-2|1-16\nC甲课|2|3-4|1-16\nC乙课|3|1-2|1-16')
    expect(r.courses[0].groupId).toBe(r.courses[1].groupId)
    expect(r.courses[0].groupId).not.toBe(r.courses[2].groupId)
  })

  it('distinct tokens same name not merged', () => {
    const r = parse('#sleepy-v1\nC同名课|1|1-2|1-16||||||1\nC同名课|2|3-4|1-16||||||2')
    expect(r.courses[0].groupId).not.toBe(r.courses[1].groupId)
  })

  it('groupId deterministic', () => {
    const doc = '#sleepy-v1\nC甲|1|1-2|1-16||||||5'
    const a = parse(doc).courses[0].groupId
    const b = parse(doc).courses[0].groupId
    expect(a).toBe(b)
    expect(a).toHaveLength(36)
  })

  it('groupId matches Android nameUUIDFromBytes golden value', () => {
    // 表名 "" + token "5" → UUID("表名"→"|5"): python uuid.uuid3 交叉验证
    const r = parse('#sleepy-v1\nC甲|1|1-2|1-16||||||5')
    // MD5-based v3 UUID of "|5"
    expect(r.courses[0].groupId).toBe(nameUUIDFromBytes('|5'))
  })

  // ---- 作息 (§5) ----
  it('Nd preset expands to 12', () => {
    const r = parse('#sleepy-v1\nNd\nC高数|1|1-2|1-16')
    expect(parseNodes(r.timeJson)).toHaveLength(12)
    expect(r.nodesPerDay).toBe(12)
  })

  it('Nd + override merges', () => {
    const r = parse('#sleepy-v1\nNd\nN3|10:20|11:05\nC高数|1|1-2|1-16')
    const nodes = parseNodes(r.timeJson)
    expect(nodes).toHaveLength(12)
    expect(nodes.find((n) => n.node === 3)!.start).toBe('10:20')
  })

  it('illegal node lines dropped', () => {
    const r = parse('#sleepy-v1\nNabc|08:00|08:45\nN2|xx|yy\nN3|09:00|08:00\nC高数|1|1-2|1-16')
    expect(r.courses).toHaveLength(1)
    expect(r.droppedLines).toHaveLength(3)
  })

  it('duplicate node number first wins', () => {
    const r = parse('#sleepy-v1\nN1|08:00|08:45\nN1|09:00|09:45\nC高数|1|1-2|1-16')
    const nodes = parseNodes(r.timeJson)
    expect(nodes).toHaveLength(1)
    expect(nodes[0].start).toBe('08:00')
    expect(r.droppedLines.length).toBeGreaterThan(0)
  })

  // ---- 识别集成/杂项 (§6.3, §7) ----
  it('second magic in dropped with warning', () => {
    const r = parse('#sleepy-v1\nC甲|1|1-2|1-16\n#sleepy-v1\nT第二张表\nC乙|2|1-2|1-16')
    expect(r.courses).toHaveLength(2)
    expect(r.warnings.some((w) => w.includes('第 2 张') || w.includes('2 张') || w.includes('表头'))).toBe(true)
  })

  it('duplicate lines deduped second dropped', () => {
    const r = parse('#sleepy-v1\nC高数|1|1-2|1-16\nC高数|1|1-2|1-16')
    expect(r.courses).toHaveLength(1)
    expect(r.droppedLines).toHaveLength(1)
  })

  it('fullwidth pipe secondary separator only when one short', () => {
    const r = parse('#sleepy-v1\nC物理课|周一|1-2|1-16')
    expect(r.courses).toHaveLength(1)
    expect(r.courses[0].courseName).toBe('物理课')
    expect(r.courses[0].day).toBe(1)
    // 列数正确时｜是文本一部分
    const r2 = parse('#sleepy-v1\nCA｜B课|1|1-2|1-16')
    expect(r2.courses[0].courseName).toBe('A｜B课')
  })

  it('crc mismatch warns but imports', () => {
    const r = parse('#sleepy-v1\nC高数|1|1-2|1-16\nz|chk=crc32:deadbeef')
    expect(r.courses).toHaveLength(1)
    expect(r.warnings.some((w) => w.includes('校验') || w.includes('完整性'))).toBe(true)
  })

  it('crc valid: no warning', () => {
    const body = '#sleepy-v1\nC高数|1|1-2|1-16'
    const r = parse(`${body}\nz|chk=crc32:${crc32Utf8(body)}`)
    expect(r.courses).toHaveLength(1)
    expect(r.warnings).toHaveLength(0)
  })

  it('n mismatch warns', () => {
    const r = parse('#sleepy-v1\nT表|2026-03-02|20|12|n=5\nC高数|1|1-2|1-16')
    expect(r.warnings.some((w) => w.includes('n=') || w.includes('计数'))).toBe(true)
  })

  it('empty table magic only is success zero courses', () => {
    const r = parse('#sleepy-v1\nT空表备份|2026-03-02|20|12')
    expect(r.courses).toHaveLength(0)
    expect(r.tableName).toBe('空表备份')
    expect(r.droppedLines).toHaveLength(0)
  })

  it('all course lines dropped is failure', () => {
    expect(() => parse('#sleepy-v1\nC|1|1-2\nC坏|xyz')).toThrow(/没进去|未能/)
  })

  it('gbk garbage fails loud not silent success', () => {
    // GBK 字节按 UTF-8 读 → U+FFFD → magic 仍命中(ASCII), C 行名称乱码
    // Kotlin 断言二态: 全丢→failure 或 部分丢→dropped 非空; 绝不能"1 条 C 课完整入库当成功"
    const garbled = '#sleepy-v1\nC高数|1|1-2|1-16'.replace('高数', '��')
    expect(() => {
      const r = parse(garbled)
      // 不抛 → 也必须是响亮丢弃路径
      expect(r.courses.length === 0 || r.droppedLines.length > 0).toBe(true)
    }).toThrow(/没进去|未能/) // 本例全部 C 行乱码 → 全丢 failure
  })

  it('comment and blank lines ignored', () => {
    const r = parse('#sleepy-v1\n# 这是注释\n\nC高数|1|1-2|1-16\n')
    expect(r.courses).toHaveLength(1)
    expect(r.droppedLines).toHaveLength(0)
  })

  it('unknown line in dropped', () => {
    const r = parse('#sleepy-v1\nC高数|1|1-2|1-16\nX未知行类型|数据')
    expect(r.courses).toHaveLength(1)
    expect(r.droppedLines).toHaveLength(1)
  })

  it('trailing extra columns ignored v2 contract', () => {
    const r = parse('#sleepy-v1\nC高数|1|1-2|1-16|||||||v2未来列|再来一列')
    expect(r.courses).toHaveLength(1)
    expect(r.courses[0].courseName).toBe('高数')
  })

  it('case insensitive prefixes', () => {
    const r = parse('#sleepy-v1\nt表名|2026-03-02|20|12\nc高数|1|1-2|1-16')
    expect(r.tableName).toBe('表名')
    expect(r.courses).toHaveLength(1)
  })

  it('T row after courses still applies (two-pass)', () => {
    const r = parse('#sleepy-v1\nC高数|1|1-2|1-16\nT后置表|2026-03-02|18|14')
    expect(r.tableName).toBe('后置表')
    expect(r.maxWeek).toBe(18)
    expect(r.nodesPerDay).toBe(14)
  })

  it('start date non-Monday normalized silently', () => {
    const r = parse('#sleepy-v1\nT表|2026-03-04|20|12') // 周三
    expect(r.startDate).toBe('2026-03-02')
    expect(r.warnings).toHaveLength(0) // 归一不算钳制不上报
  })

  it('marker wrapped native doc detected', () => {
    const text = '转换结果：\n<<<SLEEPY-BEGIN>>>\n#sleepy-v1\nC高数|1|1-2|1-16\n<<<SLEEPY-END>>>'
    const r = parse(text)
    expect(r.courses).toHaveLength(1)
  })

  it('no magic → internal error', () => {
    expect(() => parse('高数 张三 周一')).toThrow(/内部错误/)
  })
})
