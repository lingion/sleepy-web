/**
 * ScheduleParser 分派链 + 六路子解析器回归 — Kotlin 测试 1:1 移植
 * 蓝本: SleepyNativeDispatchTest.kt / SleepyMarkerTest.kt / ScheduleParserTypeTest.kt
 *       / ExcelFramesetHtmlTest.kt / IcsWakeUpImportTest.kt / Ics28NeuPeriodsTest.kt
 *       / NeuRealFixtureImportTest.kt / NeuRoundTripIcsTest.kt / ParseNodesLosslessTest.kt
 *       / WakeUpShareNodesLosslessTest.kt
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectVersion } from './sleepyNativeFormat'
import {
  parseSchedule,
  isExcelFrameset,
  excelSheetRef,
  type ParseResult,
  type ParsedCourse,
} from './scheduleParser'
import {
  exportIcs,
  type ExportTable,
  type ExportCourse,
} from './scheduleExporter'
import { parseTimeSlotRows } from '../timeTable'

const HERE = dirname(fileURLToPath(import.meta.url))

/** Kotlin ScheduleParser.parse(text, id) → Result 语义 */
function parseOrNull(text: string, tableId = 7): ParseResult | Error {
  const r = parseSchedule(text, tableId)
  return r.ok ? r.value : r.error
}

function ok(text: string, tableId = 7): ParseResult {
  const r = parseOrNull(text, tableId)
  if (r instanceof Error) throw r
  return r
}

function parseNodesOf(timeJson: string): Array<{ node: number; start: string; end: string }> {
  try {
    const arr = JSON.parse(timeJson) as Array<{ node: number; start: string; end: string }>
    return [...arr].sort((a, b) => a.node - b.node)
  } catch {
    return []
  }
}

// ============================================================
// SleepyNativeDispatchTest — §6.3 17 例分派误判回归矩阵
// ============================================================
describe('DispatchTest: 原生与其他六路判别互不劫持', () => {
  // §6.3-A: WakeUp 分享文本无 magic → 不被原生分支劫持
  it('caseA WakeUp 分享文本不被原生劫持', () => {
    const share = '【来自Sleepy】\n课程分享：\n\n{"name":"x","startDate":"2026-03-02","courseDetailJson":"..."}'
    const r = parseOrNull(share)
    if (r instanceof Error) {
      expect(r.message).not.toContain('没进去')
      expect(r.message).not.toContain('升级')
    }
  })

  // §6.3-B: 备注含未转义 courseDetailJson 的原生文档 — 原生先行命中
  it('caseB 原生文档含 courseDetailJson 字样原生先行', () => {
    const doc = '#sleepy-v1\nC好课|1|1-2|1-16|张三|A101||"courseDetailJson"在备注||'
    const r = ok(doc)
    expect(r.courses).toHaveLength(1)
    expect(r.courses[0].note).toContain('courseDetailJson')
  })

  // §6.3-C: WakeUp JSON 直贴
  it('caseC WakeUp JSON 照走 WakeUp 分支', () => {
    const json = '{"name":"表","startDate":"2026-03-02","courses":[{"name":"高数","teacher":"张三","position":"A101","day":1,"startNode":1,"step":2,"startWeek":1,"endWeek":16,"type":0}]}'
    expect(ok(json).tableName).toBe('表')
  })

  // §6.3-D: ICS → ICS 分支(失败也不含原生话术)
  it('caseD ICS 不被劫持', () => {
    const ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR'
    const r = parseOrNull(ics)
    if (r instanceof Error) {
      expect(r.message).not.toContain('sleepy-v1')
    }
  })

  // §6.3-F/G: 自由文本与 CSV 不被劫持
  it('caseF 纯文本不被劫持', () => {
    const text = '高数 张三 A101 周一 1-2 1-16 3\n英语 李四 B202 周二 3-4 1-16 0'
    expect(ok(text).courses).toHaveLength(2)
  })

  it('caseG CSV 不被劫持', () => {
    const csv = '课程,教师,星期,节次,周次\n高数,张三,1,1-2,1-16\n英语,李四,3,3-4,1-16'
    expect(ok(csv).courses).toHaveLength(2)
  })

  // §6.3-H: marker 变体包裹的 magic → 剥除后命中
  it('caseH marker 变体包裹 magic 仍命中', () => {
    const doc = '{{{SLEEPY-BEGIN}}}\n#sleepy-v1\nC高数|1|1-2|1-16\n{{{SLEEPY-END}}}'
    expect(ok(doc).courses).toHaveLength(1)
  })

  // §6.3-L: v2 → 显式拒绝
  it('caseL v2 拒绝且报升级话术', () => {
    const r = parseOrNull('#sleepy-v2\nC高数|1|1-2')
    expect(r).toBeInstanceOf(Error)
    expect((r as Error).message).toContain('升级')
    expect((r as Error).message).toContain('v2')
  })

  // §6.3-M: magic 容错变体
  it('caseM magic 变体全命中', () => {
    const variants = ['#SLEEPY-V1', '# sleepy-v1', '##sleepy-v1', '#sleepy v1', '＃sleepy-v1', '#sleepy－v1', '#sleepy-v1。']
    for (const v of variants) {
      const r = ok(`${v}\nC高数|1|1-2|1-16`)
      expect(r.courses).toHaveLength(1)
    }
  })

  // §6.3-N: 微信长转发头
  it('caseN 20 行转发头后 magic 仍命中', () => {
    const chatter = Array.from({ length: 20 }, (_, i) => `转发第 ${i + 1} 行`).join('\n')
    const doc = `${chatter}\n#sleepy-v1\nC高数|1|1-2|1-16`
    expect(ok(doc).courses).toHaveLength(1)
  })

  // §6.3-O: GBK 乱码 → 不静默
  it('caseO GBK 乱码绝不静默成功', () => {
    // Kotlin: src.toByteArray(GBK).toString(UTF_8) — "高数" GBK 字节 B8DF CAFD
    // 不是合法 UTF-8 → U+FFFD; magic 仍 ASCII 命中
    const gbkHex: Record<string, string> = { 高: 'b8df', 数: 'cafd' }
    const garbledName = Object.values(gbkHex)
      .map((h) => Buffer.from(h, 'hex').toString('utf8'))
      .join('')
    const garbled = `#sleepy-v1\nC${garbledName}|1|1-2|1-16`
    const r = parseOrNull(garbled)
    if (!(r instanceof Error)) {
      expect(r.courses.length === 0 || r.droppedLines.length > 0).toBe(true)
    }
  })

  // §6.3-P: 两张表拼接 → 合并 + 警告
  it('caseP 两张表合并出警告', () => {
    const doc = '#sleepy-v1\nC甲|1|1-2|1-16\n#sleepy-v1\nT第二张表\nC乙|2|1-2|1-16'
    const r = ok(doc)
    expect(r.courses).toHaveLength(2)
    expect(r.warnings.some((w) => w.includes('第 2 张'))).toBe(true)
  })

  // §6.3-Q: chk 篡改 → 警告不硬拒
  it('caseQ chk 不匹配只警告不拒绝', () => {
    const doc = '#sleepy-v1\nC高数|1|1-2|1-16\nz|chk=crc32:deadbeef'
    const r = ok(doc)
    expect(r.warnings.some((w) => w.includes('校验'))).toBe(true)
  })

  // §6.3-R: 五路真实样本反向矩阵 — detectVersion 全部 -1
  it('caseR 五路真实样本 detectVersion 全 -1', () => {
    const samples = [
      '{"courses":[]}',
      'BEGIN:VCALENDAR\nEND:VCALENDAR',
      '<html><body><table></table></body></html>',
      '课程,教师,星期\n高数,张三,1',
      '高数 张三 周一 1-2',
    ]
    for (const s of samples) {
      expect(detectVersion(s.trim())).toBe(-1)
    }
  })
})

// ============================================================
// SleepyMarkerTest — <<<SLEEPY-BEGIN/END>>> 标识提取回归
// ============================================================
const COURSES = '高等数学\t张三\tA101\t1\t1-2\t1-16\t0\n大学英语\t李四\tB202\t3\t3-4\t1-16\t1'

describe('MarkerTest: AI 防呆', () => {
  it('标识外开场白/结尾废话被剥除', () => {
    const text = `好的，我已经看了你的课表截图，下面是转换结果：\n<<<SLEEPY-BEGIN>>>\n${COURSES}\n<<<SLEEPY-END>>>\n希望对你有帮助！如果还需要调整格式，随时告诉我～`
    const r = ok(text, 0)
    expect(r.courses).toHaveLength(2)
    expect(r.courses[0].courseName).toBe('高等数学')
    expect(r.courses[0].day).toBe(1)
    expect(r.courses[0].step).toBe(2)
    expect(r.courses[1].courseName).toBe('大学英语')
  })

  it('缺 END 标识仍可解析', () => {
    const text = `转换如下：\n<<<SLEEPY-BEGIN>>>\n${COURSES}`
    expect(ok(text, 0).courses).toHaveLength(2)
  })

  it('缺 BEGIN 标识仍可解析(END 前全要)', () => {
    const text = `${COURSES}\n<<<SLEEPY-END>>>\n祝使用愉快！`
    expect(ok(text, 0).courses).toHaveLength(2)
  })

  it('无标识手工输入走原路径', () => {
    expect(ok(COURSES, 0).courses).toHaveLength(2)
  })

  it('标识在代码围栏内也工作', () => {
    const text = `结果：\n\`\`\`\n<<<SLEEPY-BEGIN>>>\n${COURSES}\n<<<SLEEPY-END>>>\n\`\`\``
    expect(ok(text, 0).courses).toHaveLength(2)
  })

  it('写歪标识(少横线/大小写乱/{{括号)仍提取', () => {
    const text = `转换结果：\n{{SLEEPY BEGIN}}\n${COURSES}\n<<sleepy-end>>\n祝好！`
    expect(ok(text, 0).courses).toHaveLength(2)
  })

  it('Markdown 表格输出可解析', () => {
    const text = [
      '好的，转换结果：',
      '<<<SLEEPY-BEGIN>>>',
      '| 课程 | 老师 | 教室 | 星期 | 节次 | 周次 | 类型 |',
      '|---|---|---|---|---|---|---|',
      '| 高等数学 | 张三 | A101 | 1 | 1-2 | 1-16 | 0 |',
      '| 大学英语 | 李四 | B202 | 3 | 3-4 | 1-16 | 1 |',
      '<<<SLEEPY-END>>>',
    ].join('\n')
    const r = ok(text, 0)
    const named = r.courses.map((c) => c.courseName)
    expect(named).toContain('高等数学')
    expect(named).toContain('大学英语')
    // 表头行 7 列但星期列是文字 → dropped 用户可见
    expect(r.droppedLines.length).toBeGreaterThan(0)
  })

  it('中文星期「周一」被接受', () => {
    const text = '<<<SLEEPY-BEGIN>>>\n高等数学\t张三\tA101\t周一\t1-2\t1-16\t0\n<<<SLEEPY-END>>>'
    const r = ok(text, 0)
    expect(r.courses).toHaveLength(1)
    expect(r.courses[0].day).toBe(1)
  })

  it('全角数字/全角横线归一', () => {
    const text = '<<<SLEEPY-BEGIN>>>\n高等数学\t张三\tＡ１０１\t１\t１－２\t１－１６\t０\n<<<SLEEPY-END>>>'
    const r = ok(text, 0)
    expect(r.courses).toHaveLength(1)
    expect(r.courses[0].day).toBe(1)
    expect(r.courses[0].startNode).toBe(1)
    expect(r.courses[0].step).toBe(2)
    expect(r.courses[0].endWeek).toBe(16)
  })

  it('区间反写 16-1 → 排序(1,16)', () => {
    const text = '<<<SLEEPY-BEGIN>>>\n高等数学\t张三\tA101\t1\t2-1\t16-1\t0\n<<<SLEEPY-END>>>'
    const r = ok(text, 0)
    expect(r.courses[0].startNode).toBe(1)
    expect(r.courses[0].step).toBe(2)
    expect(r.courses[0].startWeek).toBe(1)
    expect(r.courses[0].endWeek).toBe(16)
  })

  it('day 0/8 越界钳到 1..7', () => {
    const text = '<<<SLEEPY-BEGIN>>>\n高等数学\t张三\tA101\t0\t1-2\t1-16\t0\n大学英语\t李四\tB202\t8\t3-4\t1-16\t0\n<<<SLEEPY-END>>>'
    const r = ok(text, 0)
    expect(r.courses).toHaveLength(2)
    expect(r.courses.every((c) => c.day >= 1 && c.day <= 7)).toBe(true)
  })

  it('课程名 **加粗** 剥除', () => {
    const text = '<<<SLEEPY-BEGIN>>>\n**高等数学**\t张三\tA101\t1\t1-2\t1-16\t0\n<<<SLEEPY-END>>>'
    expect(ok(text, 0).courses[0].courseName).toBe('高等数学')
  })

  it('无教师列 CSV 现在可识别', () => {
    const csv = '课程,教室,星期,节次,周次\n高等数学,A101,1,1-2,1-16\n大学英语,B202,3,3-4,1-16'
    const r = ok(csv, 0)
    expect(r.courses).toHaveLength(2)
    expect(r.courses[0].teacher).toBe('')
  })

  it('垃圾行进 droppedLines 不静默', () => {
    const text = `<<<SLEEPY-BEGIN>>>\n${COURSES}\n这是AI瞎说的一行\n高数\t张三\n<<<SLEEPY-END>>>`
    const r = ok(text, 0)
    expect(r.courses).toHaveLength(2)
    expect(r.droppedLines).toHaveLength(2)
    expect(r.droppedLines.some((d) => d.includes('这是AI瞎说的'))).toBe(true)
  })

  // ---- 节次时间收割 ----

  it('纯文本作息表行被收割(声明3/到达4 → 4)', () => {
    const text = `<<<SLEEPY-BEGIN>>>\n第1节 08:00-09:35\n第2节 09:55-11:30\n第3节 13:30-15:05\n${COURSES}\n<<<SLEEPY-END>>>`
    const r = ok(text, 0)
    expect(r.courses).toHaveLength(2)
    expect(r.timeJson).not.toBe('')
    expect(r.nodesPerDay).toBe(4)
    const nodes = parseNodesOf(r.timeJson)
    expect(nodes).toHaveLength(3)
    expect(nodes[0].start).toBe('08:00')
    expect(nodes[0].end).toBe('09:35')
    expect(nodes[2].start).toBe('13:30')
  })

  it('无冒号空格分隔作息行也工作', () => {
    const text = `时间表 1 08:00 09:35\n时间表 2 09:55 11:30\n${COURSES}`
    const r = ok(text, 0)
    expect(r.courses).toHaveLength(2)
    expect(r.nodesPerDay).toBe(4)
  })

  it('无时间行纯文本 timeJson 留空(不伪造)', () => {
    const r = ok(COURSES, 0)
    expect(r.timeJson).toBe('')
    expect(r.nodesPerDay).toBe(4)
  })

  it('CSV 时间列收割首末节边界', () => {
    const csv = [
      '课程,教师,教室,星期,节次,周次,开始时间,结束时间',
      '高等数学,张三,A101,1,1-2,1-16,08:00,09:35',
      '大学英语,李四,B202,3,3-4,1-16,13:30,15:05',
    ].join('\n')
    const r = ok(csv, 0)
    expect(r.courses).toHaveLength(2)
    expect(r.nodesPerDay).toBe(4)
    const byNode = new Map(parseNodesOf(r.timeJson).map((n) => [n.node, n]))
    expect(byNode.get(1)!.start).toBe('08:00')
    expect(byNode.get(2)!.end).toBe('09:35')
    expect(byNode.get(3)!.start).toBe('13:30')
    expect(byNode.get(4)!.end).toBe('15:05')
  })

  it('Sleepy 自家导出 JSON 时间不丢', () => {
    const exported = [
      '{',
      '  "name": "我的课表",',
      '  "startDate": "2026-09-07",',
      '  "tableInfo": {',
      '    "name": "我的课表",',
      '    "startDate": "2026-09-07",',
      '    "maxWeek": 20,',
      '    "nodesPerDay": 3,',
      '    "time": "[{\\"node\\":1,\\"start\\":\\"08:00\\",\\"end\\":\\"09:35\\"},{\\"node\\":2,\\"start\\":\\"09:55\\",\\"end\\":\\"11:30\\"}]"',
      '  },',
      '  "courses": [',
      '    {"name":"高等数学","teacher":"张三","position":"A101","day":1,"startNode":1,"step":2,"startWeek":1,"endWeek":16,"type":0}',
      '  ]',
      '}',
    ].join('\n')
    const r = ok(exported, 0)
    expect(r.courses).toHaveLength(1)
    expect(r.timeJson).not.toBe('')
    // 无损: 声明 nodesPerDay=3 > time 行数 2 → 取声明 3(稀疏 timeJson 不丢声明)
    expect(r.nodesPerDay).toBe(3)
  })

  it('WakeUp 原生 timeList 收割', () => {
    const json = [
      '{',
      '  "name": "WakeUp表",',
      '  "startDate": "2026-09-07",',
      '  "tableInfo": {',
      '    "timeList": [',
      '      {"node": 1, "startTime": "08:00", "endTime": "09:35"},',
      '      {"node": 2, "startTime": "09:55", "endTime": "11:30"}',
      '    ]',
      '  },',
      '  "courses": [',
      '    {"name":"高数","teacher":"张三","position":"A101","day":1,"startNode":1,"step":2,"startWeek":1,"endWeek":16,"type":0}',
      '  ]',
      '}',
    ].join('\n')
    const r = ok(json, 0)
    expect(r.courses).toHaveLength(1)
    expect(r.nodesPerDay).toBe(2)
    expect(r.timeJson).toContain('"node":1')
    expect(r.timeJson).toContain('09:35')
  })

  // ---- TIME 块标识 ----

  it('TIME 块双标识完整', () => {
    const input = '<<<SLEEPY-TIME-BEGIN>>>\n第1节 08:00-09:35\n第2节 09:55-11:30\n<<<SLEEPY-TIME-END>>>\n高等数学\t张三\tA101\t1\t1-2\t1-16\t0'
    const r = ok(input, 0)
    expect(r.courses).toHaveLength(1)
    expect(r.nodesPerDay).toBe(2)
    expect(r.timeJson).toContain('08:00')
  })

  it('TIME 块缺 END 自愈(吞到首个非作息行)', () => {
    const input = '<<<SLEEPY-TIME-BEGIN>>>\n第1节 08:00-09:35\n第2节 09:55-11:30\n高等数学\t张三\tA101\t1\t1-2\t1-16\t0'
    const r = ok(input, 0)
    expect(r.courses).toHaveLength(1)
    expect(r.nodesPerDay).toBe(2)
  })

  it('无 TIME 标识裸作息行混排兼容', () => {
    const input = '第1节 08:00-09:35\n第2节 09:55-11:30\n高等数学\t张三\tA101\t1\t1-2\t1-16\t0'
    const r = ok(input, 0)
    expect(r.courses).toHaveLength(1)
    expect(r.nodesPerDay).toBe(2)
  })

  it('TIME 块在外层 BEGIN/END 内课程仍入库', () => {
    // 架构限制同 Kotlin 注: 此场景不保证 TIME 块保留, 核心是独立 TIME 块
    const input = '<<<SLEEPY-BEGIN>>>\n<<<SLEEPY-TIME-BEGIN>>>\n第1节 08:00-09:35\n<<<SLEEPY-TIME-END>>>\n高等数学\t张三\tA101\t1\t1-2\t1-16\t0\n<<<SLEEPY-END>>>'
    const r = ok(input, 0)
    expect(r.courses).toHaveLength(1)
  })

  it('TIME 块括号变体', () => {
    const input = '{{{SLEEPY-TIME-BEGIN}}}\n第1节 08:00-09:35\n第2节 09:55-11:30\n{{{SLEEPY-TIME-END}}}\n高等数学\t张三\tA101\t1\t1-2\t1-16\t0'
    const r = ok(input, 0)
    expect(r.courses).toHaveLength(1)
    expect(r.nodesPerDay).toBe(2)
  })
})

// ============================================================
// ScheduleParserTypeTest — parseType 语义: 未知 → 3 不回退 0
// ============================================================
describe('TypeTest: 类型列语义', () => {
  // parseType 是 private — Kotlin 走反射; TS 经 CSV 类型列覆盖同等语义
  function typeOfViaCsv(typeCell: string): number {
    const csv = `课程,教师,星期,节次,周次,类型\n高数,张三,1,1-2,1-16,${typeCell}`
    return ok(csv, 0).courses[0].type
  }

  it('空/空白 → 3 按周次', () => {
    expect(typeOfViaCsv('')).toBe(3)
    expect(typeOfViaCsv('   ')).toBe(3)
  })

  it('显式 0 → 0 每周', () => {
    expect(typeOfViaCsv('0')).toBe(0)
    expect(typeOfViaCsv('每周')).toBe(0)
  })

  it('显式 1 → 1 单周', () => {
    expect(typeOfViaCsv('1')).toBe(1)
    expect(typeOfViaCsv('单周')).toBe(1)
  })

  it('显式 2 → 2 双周', () => {
    expect(typeOfViaCsv('2')).toBe(2)
    expect(typeOfViaCsv('双周')).toBe(2)
  })

  it('显式 3/按周次/自定义 → 3', () => {
    expect(typeOfViaCsv('3')).toBe(3)
    expect(typeOfViaCsv('按周次')).toBe(3)
    expect(typeOfViaCsv('自定义')).toBe(3)
  })

  it('未知垃圾 → 3 不回退 0(防单次实验误标每周)', () => {
    expect(typeOfViaCsv('每周都上但我不确定')).toBe(3)
    expect(typeOfViaCsv('??')).toBe(3)
    expect(typeOfViaCsv('99')).toBe(3)
  })

  it('端到端: 类型列缺失 → type=3, 第 6 周单次实验', () => {
    const text = [
      '<<<SLEEPY-BEGIN>>>',
      '<<<SLEEPY-TIME-BEGIN>>>',
      '第1节 08:00-08:45',
      '<<<SLEEPY-TIME-END>>>',
      '迈克尔逊-11#2003-3\t李平\t-\t4\t11-13\t6',
      '<<<SLEEPY-END>>>',
    ].join('\n')
    const r = ok(text, 0)
    expect(r.courses).toHaveLength(1)
    const c = r.courses[0]
    expect(c.type).toBe(3)
    expect(c.startWeek).toBe(6)
    expect(c.endWeek).toBe(6)
    // Kotlin 断言 inWeek(6)=true/inWeek(5,7)=false — inWeek 是落库后实体方法,
    // 解析层保证 startWeek==endWeek==6, inWeek 语义由实体测试锁定
  })

  it('端到端: 显式 type=0 保留每周(兼容旧数据)', () => {
    expect(ok('高数\t张老师\tA101\t1\t1-2\t1-16\t0', 0).courses[0].type).toBe(0)
  })
})

// ============================================================
// ExcelFramesetHtmlTest — issue #6
// ============================================================
const FRAMESET_HTML = [
  '<html xmlns:x="urn:schemas-microsoft-com:office:excel"',
  '      xmlns="http://www.w3.org/TR/REC-html40">',
  '<head>',
  '<meta name="Excel Workbook Frameset">',
  '<meta http-equiv=Content-Type content="text/html; charset=gb2312">',
  '<meta name=ProgId content="Excel.Sheet">',
  '<meta name=Generator content="Microsoft Excel 15">',
  '<link id="shLink" href="大二课表学期1.files/sheet001.html">',
  '</head>',
  '<frameset rows="*,18">',
  '<frame src="大二课表学期1.files/sheet001.html" name="frSheet">',
  '</frameset>',
  '</html>',
].join('\n')

describe('ExcelFramesetHtmlTest: issue #6', () => {
  it('识别 Excel Frameset', () => {
    expect(isExcelFrameset(FRAMESET_HTML)).toBe(true)
  })

  it('提取 shLink 附属文件引用', () => {
    expect(excelSheetRef(FRAMESET_HTML)).toBe('大二课表学期1.files/sheet001.html')
  })

  it('普通 HTML 不误判', () => {
    const normal = '<html><body><table><tr><td>高数 1 1-2 1-16</td></tr></table></body></html>'
    expect(isExcelFrameset(normal)).toBe(false)
  })

  it('Frameset 报错带指引(点名 Excel + CSV 出路)', () => {
    const r = parseOrNull(FRAMESET_HTML, 0)
    expect(r).toBeInstanceOf(Error)
    const msg = (r as Error).message
    expect(msg).toContain('Excel')
    expect(msg.includes('CSV') || msg.includes('csv')).toBe(true)
  })

  it('无表格普通 HTML 保持原报错语义(不提 Excel)', () => {
    const r = parseOrNull('<html><body><p>hello</p></body></html>', 0)
    expect(r).toBeInstanceOf(Error)
    expect((r as Error).message).not.toContain('Excel')
  })
})

// ============================================================
// ParseNodesLosslessTest — v7.10.16k 无损解析
// ============================================================
describe('ParseNodesLosslessTest: 课程到达即承认', () => {
  it('无时间块纯文本仍上报课程最大节次 13', () => {
    const text = '高数 张三 A101 1 1-2 1-16\n体育 李四 操场 3 12-13 1-16\n大物 王五 B202 2 13 1-16'
    const r = ok(text, 999)
    expect(r.nodesPerDay).toBe(13)
    expect(r.timeJson).toBe('')
  })

  it('TIME 块声明 10 节但课程到 13 → 仍取 13', () => {
    const text = '<<<SLEEPY-TIME-BEGIN>>>\n第1节 08:00-08:45\n第10节 19:50-20:35\n<<<SLEEPY-TIME-END>>>\n高数 张三 A101 1 12-13 1-16'
    expect(ok(text, 999).nodesPerDay).toBe(13)
  })
})

// ============================================================
// WakeUpShareNodesLosslessTest — 真实分享文本回归
// ============================================================

// Kotlin fixture 的 courseDetailJson 是 kotlinx prettyPrint 后 URL 编码(空格→+)
function bukeShareText(): string {
  const courses = [
    { name: '迈克尔逊-11#2003-3', teacher: '李平', position: '11#2003', day: 4, startNode: 11, step: 3, startWeek: 6, endWeek: 6, type: 0, color: '#FF6750A4' },
    { name: '自组望远镜和显微镜-11#2005-3', teacher: '王德兴', position: '11#2005', day: 4, startNode: 11, step: 3, startWeek: 7, endWeek: 7, type: 0, color: '#FF6750A4' },
    { name: '分光计-11#2008-3', teacher: '陈淑妍', position: '11#2008', day: 4, startNode: 11, step: 3, startWeek: 9, endWeek: 9, type: 0, color: '#FF6750A4' },
    { name: '光纤传感、光纤通信-11#2007/3006', teacher: '戴强', position: '11#2007/3006', day: 7, startNode: 3, step: 3, startWeek: 6, endWeek: 6, type: 0, color: '#FF6750A4' },
    { name: '密立根油滴-11#2006-3', teacher: '王德兴', position: '11#2006', day: 7, startNode: 3, step: 3, startWeek: 7, endWeek: 7, type: 0, color: '#FF6750A4' },
    { name: '光电效应（11#3001）', teacher: '张晓峻', position: '11#3001', day: 7, startNode: 6, step: 3, startWeek: 9, endWeek: 9, type: 0, color: '#FF6750A4' },
    { name: '光纤传感、光纤通信-11#2007/3006', teacher: '戴强', position: '11#2007/3006', day: 7, startNode: 6, step: 3, startWeek: 6, endWeek: 6, type: 0, color: '#FF6750A4' },
    { name: '演示实验（逸夫楼110）', teacher: '王立媛', position: '逸夫楼110', day: 7, startNode: 6, step: 3, startWeek: 9, endWeek: 9, type: 0, color: '#FF6750A4' },
  ]
  // kotlinx prettyPrint 形态: "[\n    {...},\n    ...\n  ]"(逗号后空格/冒号后空格/花括号内空格)
  const pretty = JSON.stringify(courses)
    .replace(/,/g, ', ')
    .replace(/\{/g, '{ ')
    .replace(/:/g, ': ')
    .replace(/\}/g, ' }')
    .replace(/\[/g, '[\n    ')
    .replace(/\]/g, '\n  ]')
  const encoded = encodeURIComponent(pretty).replace(/%20/g, '+')
  return `【来自Sleepy】\n课程分享：\n\n{\n    "name": "补实验",\n    "startDate": "2026-08-31",\n    "courseDetailJson": "${encoded}"\n}`
}

describe('WakeUpShareNodesLosslessTest: 补实验真实分享', () => {
  it('8 门课全收, startNode=11 step=3 → nodesPerDay=13', () => {
    const r = ok(bukeShareText(), 999)
    expect(r.courses).toHaveLength(8)
    expect(r.nodesPerDay).toBe(13)
    expect(r.timeJson).toBe('')
    expect(r.courses[0].startNode).toBe(11)
  })

  it('CSV 课程到达超出作息声明 → 取 max', () => {
    const csv = [
      '课程,教师,教室,星期,节次,周次,开始时间,结束时间',
      '高数,张三,A101,1,12-13,1-16,,',
      '体育,李四,操场,2,1-2,1-16,08:00,09:40',
    ].join('\n')
    const r = ok(csv, 999)
    expect(r.courses).toHaveLength(2)
    expect(r.nodesPerDay).toBe(13)
  })

  it('HTML 课程到达同样无损', () => {
    const html = [
      '<html><body><table>',
      '<tr><th>课程</th><th>教师</th><th>教室</th><th>星期</th><th>节次</th><th>周次</th></tr>',
      '<tr><td>高数</td><td>张三</td><td>A101</td><td>1</td><td>11-13</td><td>1-16</td></tr>',
      '</table></body></html>',
    ].join('\n')
    const r = ok(html, 999)
    expect(r.courses).toHaveLength(1)
    expect(r.nodesPerDay).toBe(13)
  })
})

// ============================================================
// IcsWakeUpImportTest — WakeUp 课程表导出的 ICS
// ============================================================

/** Kotlin fixture 逐事件重建(单周理论 1-12 / 毛概双周 2,4,6,8 / 创业散周 2,7 / 实训 17 周) */
function wakeUpIcsFixture(): string {
  const vevent = (summary: string, d: string, tStart: string, tEnd: string, until: string, loc: string, nodeLine: string): string =>
    [
      'BEGIN:VEVENT',
      `SUMMARY:${summary}`,
      `DTSTART;TZID=Asia/Shanghai:${d}T${tStart}`,
      `DTEND;TZID=Asia/Shanghai:${d}T${tEnd}`,
      `RRULE:FREQ=WEEKLY;UNTIL=${until}T160000Z;INTERVAL=1`,
      `LOCATION:${loc}`,
      `DESCRIPTION:${nodeLine}`,
      'END:VEVENT',
    ].join('\n')

  const parts = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//YZune//WakeUpSchedule//EN',
    // 算法: 周一 1-2 节, 周 1..12
    vevent('算法设计与分析（理论）', '20260831', '082000', '100000', '20261122', '三教337 王锐', '第1 - 2节\\n三教337\\n王锐'),
    // 毛概: 周四 5-6 节, 相对周 2,4,6,8
    ...(['20260910', '20260924', '20261008', '20261022'].map((d) =>
      vevent('毛泽东思想和中国特色社会主义理论体系概论（理论）', d, '132000', '150000', d === '20260910' ? '20260916' : d === '20260924' ? '20260930' : d === '20261008' ? '20261014' : '20261028', '二教B121 赵丽娜', '第5 - 6节\\n二教B121\\n赵丽娜'),
    )),
    // 创业基础: 周二 9-10 节, 相对周 2 与 7
    vevent('创业基础（理论）', '20260908', '180000', '193000', '20260914', '二教B203 李力', '第9 - 10节\\n二教B203\\n李力'),
    vevent('创业基础（理论）', '20261013', '180000', '193000', '20261019', '二教B203 李力', '第9 - 10节\\n二教B203\\n李力'),
    // 实训: 第 17 周 1-4 节
    vevent('Linux操作系统课程实训（环节）', '20261221', '082000', '120000', '20261227', '三教337 辛钢', '第1 - 4节\\n三教337\\n辛钢'),
    'END:VCALENDAR',
  ]
  return parts.join('\n')
}

describe('IcsWakeUpImportTest: WakeUp ICS', () => {
  it('周次/节次/教师/锚点全对', () => {
    const r = ok(wakeUpIcsFixture(), 999)
    // 学期锚点 = 最早 DTSTART 所在周(2026-08-31 周一)
    expect(r.startDate).toBe('2026-08-31')
    // 算法(1-12周) + 毛概双周合并1条 + 创业基础散周2条 + 实训(17周) = 5 行
    expect(r.courses).toHaveLength(5)

    const algo = r.courses.find((c) => c.courseName.startsWith('算法设计'))!
    expect(algo.teacher).toBe('王锐')
    expect(algo.room).toBe('三教337')
    expect(algo.day).toBe(1)
    expect(algo.startNode).toBe(1)
    expect(algo.step).toBe(2)
    expect(algo.startWeek).toBe(1)
    expect(algo.endWeek).toBe(12) // UNTIL 20261122 → 周12
    expect(algo.type).toBe(0)

    const mao = r.courses.find((c) => c.courseName.startsWith('毛泽东'))!
    expect(mao.startWeek).toBe(2)
    expect(mao.endWeek).toBe(8) // 4 事件 w2,4,6,8 → 双周 [2,8]
    expect(mao.type).toBe(2)
    expect(mao.day).toBe(4)
    expect(mao.startNode).toBe(5)
    expect(mao.step).toBe(2)

    // 创业基础: 散周 2,7 不构成双周序列 → 保持独立两行
    const chuangs = r.courses.filter((c) => c.courseName.startsWith('创业'))
    expect(chuangs).toHaveLength(2)
    expect(new Set(chuangs.map((c) => c.startWeek))).toEqual(new Set([2, 7]))
    for (const c of chuangs) {
      expect(c.type).toBe(0)
      expect(c.day).toBe(2)
      expect(c.startNode).toBe(9)
      expect(c.step).toBe(2)
    }

    const practice = r.courses.find((c) => c.courseName.startsWith('Linux'))!
    expect(practice.startWeek).toBe(17)
    expect(practice.endWeek).toBe(17)
    expect(practice.startNode).toBe(1)
    expect(practice.step).toBe(4)
  })

  it('逐周换教室不误判假单双周(24sp 管理心理学实证)', () => {
    const vevent = (d: string, loc: string, room: string): string =>
      [
        'BEGIN:VEVENT',
        'SUMMARY:管理心理学★',
        `DTSTART;TZID=Asia/Shanghai:${d}T190000`,
        `DTEND;TZID=Asia/Shanghai:${d}T203500`,
        `RRULE:FREQ=WEEKLY;UNTIL=${d}T160000Z;INTERVAL=1`,
        `LOCATION:${loc}`,
        `DESCRIPTION:第9 - 10节\\n${room}\\n段鑫星`,
        'END:VEVENT',
      ].join('\n')
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//YZune//WakeUpSchedule//EN',
      vevent('20240507', '博1-A102 段鑫星', '博1-A102'),
      vevent('20240514', '博5-BC区线上教室 段鑫星', '博5-BC区线上教室'),
      vevent('20240521', '博1-A102 段鑫星', '博1-A102'),
      'END:VCALENDAR',
    ].join('\n')

    const r = ok(ics, 999)
    // 3 个逐周连续事件 → 合并 1 行 [1,3] type=0(首教室); 不得因教室同奇偶拆成假单双周
    expect(r.courses).toHaveLength(1)
    const c = r.courses[0]
    expect(c.type).toBe(0)
    expect(c.startWeek).toBe(1)
    expect(c.endWeek).toBe(3)
    expect(c.day).toBe(2)
    expect(c.startNode).toBe(9)
    expect(c.step).toBe(2)
    expect(c.teacher).toBe('段鑫星')
    expect(c.room).toBe('博1-A102')
  })

  it('真双周(同教室相对周 1,3,5,7)仍识别 type=1', () => {
    const parts = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//YZune//WakeUpSchedule//EN']
    for (const w of [2, 4, 6, 8]) {
      // 锚 2026-08-31 周一; 第 w 学期周的周二
      const d = new Date(Date.UTC(2026, 7, 31) + (w - 1) * 7 * 86400000 + 86400000)
        .toISOString().slice(0, 10).replace(/-/g, '')
      parts.push([
        'BEGIN:VEVENT',
        'SUMMARY:真双周课',
        `DTSTART;TZID=Asia/Shanghai:${d}T102000`,
        `DTEND;TZID=Asia/Shanghai:${d}T120000`,
        `RRULE:FREQ=WEEKLY;UNTIL=${d}T160000Z;INTERVAL=1`,
        'LOCATION:A101 李老师',
        'DESCRIPTION:第5 - 6节\\nA101\\n李老师',
        'END:VEVENT',
      ].join('\n'))
    }
    parts.push('END:VCALENDAR')

    const r = ok(parts.join('\n'), 999)
    expect(r.courses).toHaveLength(1)
    const c = r.courses[0]
    // 首事件在第 2 学期周 → 相对周号 1,3,5,7 → 单周序列
    expect(c.startWeek).toBe(1)
    expect(c.endWeek).toBe(7)
    expect(c.type).toBe(1)
    expect(c.room).toBe('A101')
  })

  it('Sleepy 自家 ICS 往返可回读', () => {
    const table: ExportTable = {
      id: 1, name: 'T', startDate: '2026-02-23', maxWeek: 18, nodesPerDay: 13,
      timeJson: '[{"node":1,"start":"08:00","end":"08:45"},{"node":2,"start":"08:50","end":"09:35"},{"node":3,"start":"10:00","end":"10:45"}]',
      color: '#FF6750A4',
    }
    const course: ExportCourse = {
      id: 0, groupId: '', tableId: 1, courseName: '高数', alias: '', teacher: '张三', room: 'A101',
      note: '', day: 2, startNode: 1, step: 2, startWeek: 1, endWeek: 16, type: 0, color: '#FF6750A4',
      ownTime: false, startTime: '', endTime: '',
    }
    const exported = exportIcs(table, [course])
    const r = ok(exported, 999)
    expect(r.courses).toHaveLength(1)
    const c = r.courses[0]
    expect(c.courseName).toBe('高数')
    expect(c.teacher).toBe('张三')
    expect(c.room).toBe('A101')
    expect(c.day).toBe(2)
    expect(c.startNode).toBe(1)
    expect(c.step).toBe(2)
    expect(c.startWeek).toBe(1)
    expect(c.endWeek).toBe(16)
    expect(c.type).toBe(0)
    expect(r.startDate).toBe('2026-02-23')
  })

  it('ICS 自带作息 → 收割 timeJson 块锚点', () => {
    const r = ok(wakeUpIcsFixture(), 999)
    expect(r.timeJson).not.toBe('')
    const byNode = new Map(parseNodesOf(r.timeJson).map((n) => [n.node, n]))
    // 事件: 1-2@08:20-10:00, 1-4@08:20-12:00, 5-6@13:20-15:00, 9-10@18:00-19:30
    // → 锚 1@08:20, 4@12:00, 5@13:20, 6@15:00, 9@18:00, 10@19:30
    expect(byNode.get(1)!.start).toBe('08:20')
    expect(byNode.get(4)!.end).toBe('12:00')
    expect(byNode.get(5)!.start).toBe('13:20')
    expect(byNode.get(6)!.end).toBe('15:00')
    expect(byNode.get(9)!.start).toBe('18:00')
    expect(byNode.get(10)!.end).toBe('19:30')
    expect(r.nodesPerDay).toBe(10)
  })

  it('裸 DTSTART 稀疏文件不收割不炸', () => {
    const sparse = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'SUMMARY:裸课',
      'DTSTART;TZID=Asia/Shanghai:20260831T082000',
      'RRULE:FREQ=WEEKLY;INTERVAL=1',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n')
    expect(ok(sparse, 999).timeJson).toBe('')
  })
})

// ============================================================
// NEU fixture 系 — issue #28 块模型(真实文件逐字节)
// ============================================================
const NEU_ICS = readFileSync(join(HERE, '__fixtures__', 'neu-schedule-2026-2027-1.ics'), 'utf8')

/** Kotlin NeuRoundTripIcsTest 的构造表 + 导出 + 再解析 */
function neuRoundTrip(): { first: ParseResult; second: ParseResult } {
  const first = ok(NEU_ICS, 999)
  const table: ExportTable = {
    id: 999,
    name: 'neu-round-trip',
    startDate: first.startDate,
    maxWeek: Math.max(...first.courses.map((c) => c.endWeek)),
    nodesPerDay: first.nodesPerDay,
    timeJson: first.timeJson,
    color: '#FF6750A4',
  }
  const exported = exportIcs(table, first.courses as unknown as ExportCourse[])
  const second = ok(exported, 999)
  return { first, second }
}

describe('Ics28NeuPeriodsTest: NEU 块模型', () => {
  it('七种时间形态映射不膨胀', () => {
    const pr = ok(NEU_ICS, 1)
    const expected = new Set([
      '1-2', // 08:00-09:40 上午一
      '1-4', // 08:00-11:40 上午连排
      '3-2', // 10:00-11:40 上午二
      '5-2', // 14:00-15:40 下午一
      '5-4', // 14:00-17:40 下午连排
      '7-2', // 16:00-17:40 下午二
      '9-4', // 18:30-22:00 晚间(9-12)
    ])
    expect(new Set(pr.courses.map((c) => `${c.startNode}-${c.step}`))).toEqual(expected)
  })

  it('作息表 1..12 完整单调且锚定教学块', () => {
    const pr = ok(NEU_ICS, 1)
    const rows = parseTimeSlotRows(pr.timeJson)
    expect(pr.nodesPerDay).toBe(12)
    expect(rows.map((r) => r.node)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1))

    // 严格递增(旧实现第4节 08:00 排第3节 10:00 之后)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].start < rows[i].start).toBe(true)
    }
    for (const row of rows) {
      expect(row.start < row.end).toBe(true)
    }

    const anchors: Array<[number, string]> = [
      [1, '08:00'], [2, '09:40'], [3, '10:00'], [4, '11:40'],
      [5, '14:00'], [6, '15:40'], [7, '16:00'], [8, '17:40'],
      [9, '18:30'], [12, '22:00'],
    ]
    for (const [node, time] of anchors) {
      const row = rows.find((r) => r.node === node)!
      const actual = [1, 3, 5, 7, 9].includes(node) ? row.start : row.end
      expect(actual).toBe(time)
    }
  })
})

describe('NeuRealFixtureImportTest: 真实 fixture 课程起点', () => {
  it('全部课程落在奇数块起点(1,3,5,7,9)', () => {
    const pr = ok(NEU_ICS, 999)
    expect(pr.courses.length).toBeGreaterThan(0)
    expect(new Set(pr.courses.map((c) => c.startNode))).toEqual(new Set([1, 3, 5, 7, 9]))
    expect(pr.nodesPerDay).toBe(12)
  })
})

describe('NeuRoundTripIcsTest: NEU 往返闭环(issue #28)', () => {
  it('课程数守恒 + day 1..7 + 节次窗不越界', () => {
    const { first, second } = neuRoundTrip()
    expect(second.courses).toHaveLength(first.courses.length)
    expect(second.courses.every((c) => c.day >= 1 && c.day <= 7)).toBe(true)
    expect(second.courses.every((c) => c.startNode >= 1 && c.startNode + c.step - 1 <= first.nodesPerDay)).toBe(true)
  })

  it('(day,startNode,step) 相同键的周次域往返相等', () => {
    const { first, second } = neuRoundTrip()
    const key = (c: ParsedCourse): string => `${c.day}|${c.startNode}|${c.step}`
    const bucket = (courses: ParsedCourse[]): Map<string, ParsedCourse[]> => {
      const m = new Map<string, ParsedCourse[]>()
      for (const c of courses) {
        const arr = m.get(key(c)) ?? []
        arr.push(c)
        m.set(key(c), arr)
      }
      return m
    }
    const firstByKey = bucket(first.courses)
    const secondByKey = bucket(second.courses)
    for (const [k, originals] of firstByKey) {
      const re = secondByKey.get(k)
      expect(re, `no re-imported match for ${k}`).toBeDefined()
      const minStart = Math.min(...originals.map((c) => c.startWeek))
      const maxEnd = Math.max(...originals.map((c) => c.endWeek))
      expect(Math.min(...re!.map((c) => c.startWeek))).toBe(minStart)
      expect(Math.max(...re!.map((c) => c.endWeek))).toBe(maxEnd)
    }
  })

  it('声明节次窗往返守恒 + 标准行存在', () => {
    const { first, second } = neuRoundTrip()
    expect(second.nodesPerDay).toBe(first.nodesPerDay)
    expect(parseTimeSlotRows(first.timeJson).some((r) => r.edgeClass === null)).toBe(true)
    expect(parseTimeSlotRows(second.timeJson).some((r) => r.edgeClass === null)).toBe(true)
  })
})
