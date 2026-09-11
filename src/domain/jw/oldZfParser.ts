/**
 * JwOldZfParser — Kotlin data/jw/JwOldZfParser.kt 1:1 移植 (正方老版 zf / zf_1)
 *
 * 上游: dIT8Zv/WakeupSchedule_BUPT (Apache-2.0) ZhengFangParser.kt。
 * type=0 标准变体: <a>课程名<br>周次<br>[老师<br>]教室, 多门课 <br><br> 分隔
 * type=1 (zf_1): 单元格无 <a>, 空格分隔, 周次带花括号
 *
 * T1 修复全部保留 (G1-G8/G12): 节次写回/47属性词/hasTypeFlag复位/末token守卫/
 * 表格兜底blacktab/合并行头首段/周天别名/中午表头/result[1]=step。
 */

import {
  parseHtmlDoc, getElementsByTag, getElementById, selectFirst, text, innerHtml,
  toIntOrNull, type JwCourse, type JwParser,
} from './jwCourse'

interface ImportBean {
  name: string
  timeInfo: string
  teacher: string
  room: string
  startNode: number
  cDay: number
}

// 正则与上游 Common.kt 逐字符一致, 勿改
const NODE_PATTERN = /\(\d{1,2}[-]*\d*节/
const WEEK_PATTERN = /\{第\d{1,2}[-]*\d*周/
const HEADER_NODE_PATTERN = /^第.*节$/

/** 表头词 (上游 otherHeader + T1 G8 "中午") */
const OTHER_HEADER = new Set([
  '时间', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日',
  '早晨', '上午', '下午', '晚上', '中午',
])

/** 课程属性词 (上游 Common.courseProperty 47 项全量, T1 G2) */
const COURSE_PROPERTY = new Set([
  '任选', '限选', '实践选修', '必修课', '选修课', '必修', '选修', '专基', '专选',
  '公必', '公选', '义修', '选', '必', '主干', '专限', '公基', '值班', '通选',
  '思政必', '思政选', '自基必', '自基选', '语技必',
  '语技选', '体育必', '体育选', '专业基础课', '双创必', '双创选',
  '新生必', '新生选', '学科必修', '学科选修',
  '通识必修', '通识选修', '公共基础', '第二课堂',
  '学科实践', '专业实践', '专业必修', '辅修', '专业选修',
  '外语', '方向', '专业必修课', '全选',
])

/** 上游 chineseWeekList 8 元素; "周天" 走 WEEK_ALIAS (T1 G7) */
const CHINESE_WEEK_LIST = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']
const WEEK_ALIAS: Record<string, number> = { 周天: 7 }

function getWeekFromChinese(chineseWeek: string): number {
  const idx = CHINESE_WEEK_LIST.indexOf(chineseWeek)
  if (idx > 0) return idx
  return WEEK_ALIAS[chineseWeek] ?? 0
}

const CN_NUM: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7,
  七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12,
  十三: 13, 十四: 14, 十五: 15, 十六: 16, 十七: 17,
  十八: 18, 十九: 19, 二十: 20,
}

/** "第N节" 行头 → N; 非行头 -1 (T1 G6: 区间/逗号行头按首段) */
function parseHeaderNodeString(str: string): number {
  if (!HEADER_NODE_PATTERN.test(str)) return -1
  const raw = str.substring(1, str.length - 1)
  const firstSeg = raw.split(/[-—~,]/)[0]?.trim().replace(/^第/, '').replace(/节$/, '') ?? ''
  if (firstSeg === '') return -1
  const v = toIntOrNull(firstSeg)
  if (v !== null) return v
  return CN_NUM[firstSeg] ?? -1
}

function getNodeStr(node: number): string {
  const map: Record<number, string> = {
    1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '七',
    8: '八', 9: '九', 10: '十', 11: '十一', 12: '十二', 13: '十三',
    14: '十四', 15: '十五', 16: '十六',
  }
  return map[node] ?? ''
}

/** 计数子串出现次数 (countStr; 末位命中也计) */
function countStr(str1: string, str2: string): number {
  let times = 0
  let startIndex = 0
  let findIndex = str1.indexOf(str2, startIndex)
  while (findIndex !== -1 && findIndex !== str1.length - 1) {
    times += 1
    startIndex = findIndex + 1
    findIndex = str1.indexOf(str2, startIndex)
  }
  if (findIndex === str1.length - 1) times += 1
  return times
}

/** 剥残留 <a> / <a href=...> 前缀 */
function stripAnchorTag(s: string): string {
  let t = s
  if (t.startsWith('<a')) {
    const gt = t.indexOf('>')
    t = gt >= 0 ? t.substring(gt + 1) : t.substring(2)
  }
  return t
}

export class JwOldZfParser implements JwParser {
  readonly source: string
  readonly zfType: number

  constructor(source: string, type: number = 0) {
    this.source = source
    this.zfType = type
  }

  generateCourseList(): JwCourse[] {
    const doc = parseHtmlDoc(this.source)
    // T1 G5: #Table1 → table.blacktab → 文本含"星期一"的第一个 table
    const table1 =
      getElementById(doc, 'Table1') ??
      selectFirst(doc, 'table.blacktab') ??
      pickTableByMonday(doc)
    if (!table1) return []
    const trs = getElementsByTag(table1, 'tr')
    const importBeanList: ImportBean[] = []
    let node = -1
    for (const tr of trs) {
      const tds = getElementsByTag(tr, 'td')
      let countFlag = false
      let countDay = 0
      for (const td of tds) {
        const courseSource = text(td)
        if (courseSource.length <= 1) {
          if (countFlag) countDay++
          continue
        }
        if (OTHER_HEADER.has(courseSource)) continue
        const headerNode = parseHeaderNodeString(courseSource)
        if (headerNode !== -1) {
          // T1 G6: 合并行头按首段, 不落入 countDay++
          node = headerNode
          countFlag = true
          continue
        }
        countDay++
        if (this.zfType === 0) {
          importBeanList.push(...this.parseImportBean(countDay, innerHtml(td), node))
        } else {
          importBeanList.push(...this.parseImportBean1(countDay, courseSource, node))
        }
      }
    }
    return importList2CourseList(importBeanList, this.source)
  }

  /** type=0: 标准老正方单元格 (未改动, 上游语义) */
  private parseImportBean(cDay: number, html: string, node: number): ImportBean[] {
    const courses: ImportBean[] = []
    let isAbnormal = false
    const inner = html.replace(/<\/td>$/, '') // Kotlin substringBeforeLast("</td>")
    const courseSplits = inner.includes('<br><br><br>')
      ? (isAbnormal = true, inner.split('<br><br><br>'))
      : inner.split('<br><br>')
    for (const courseStr of courseSplits) {
      const afterQuote = courseStr.includes('">') ? courseStr.substring(courseStr.indexOf('">') + 2) : courseStr
      const anchorStripped = afterQuote.replace(/<\/a>$/i, '')
      const split = anchorStripped.split('<br>').map((x) => stripAnchorTag(x.trim()))
      if (split.length < 3) continue
      let temp: ImportBean
      if (COURSE_PROPERTY.has(split[1])) {
        if (split.length === 4) {
          temp = { startNode: node, name: split[0], timeInfo: split[2], room: split[3], teacher: '', cDay }
        } else {
          temp = { startNode: node, name: split[0], timeInfo: split[2], room: split[4] ?? '', teacher: split[3] ?? '', cDay }
        }
      } else if (split.length === 3) {
        if (!isAbnormal) {
          temp = { startNode: node, name: split[0], timeInfo: split[1], room: split[2], teacher: '', cDay }
        } else {
          temp = { startNode: node, name: split[0], timeInfo: split[1], room: '', teacher: split[2], cDay }
        }
      } else {
        temp = { startNode: node, name: split[0], timeInfo: split[1], room: split[3] ?? '', teacher: split[2] ?? '', cDay }
      }
      courses.push(temp)
    }
    return courses
  }

  /** type=1 (zf_1): 无 <a>, 空格分隔, 周次花括号 (T1 G3/G4/DEF-1) */
  private parseImportBean1(cDay: number, source: string, node: number): ImportBean[] {
    const courses: ImportBean[] = []
    const split = source.split(/ +/).filter((s) => s !== '')
    let preIndex = -1
    let hasTypeFlag = false
    for (let i = 0; i < split.length; i++) {
      if (split[i].includes('{') && split[i].includes('}')) {
        if (preIndex !== -1) {
          if (preIndex < 1) {
            // DEF-1: brace token 在 split[0], 无课程名
            preIndex = i
            continue
          }
          if (COURSE_PROPERTY.has(split[preIndex - 1])) hasTypeFlag = true
          const temp: ImportBean = {
            startNode: node,
            name: hasTypeFlag && preIndex >= 2 ? split[preIndex - 2] : split[preIndex - 1],
            timeInfo: split[preIndex],
            room: '',
            teacher: '',
            cDay,
          }
          // T1 G4: 时间 token 后无足够 token 时 teacher/room 留空
          if (i - preIndex - 2 === 1) {
            if (preIndex + 1 < split.length) temp.teacher = split[preIndex + 1]
          } else {
            if (preIndex + 1 < split.length) temp.teacher = split[preIndex + 1]
            if (preIndex + 2 < split.length) temp.room = split[preIndex + 2]
          }
          courses.push(temp)
          // T1 G3: 每门课后复位
          hasTypeFlag = false
          preIndex = i
        } else {
          preIndex = i
        }
      }
      if (i === split.length - 1) {
        if (preIndex < 1) continue
        if (COURSE_PROPERTY.has(split[preIndex - 1])) hasTypeFlag = true
        const temp: ImportBean = {
          startNode: node,
          name: hasTypeFlag && preIndex >= 2 ? split[preIndex - 2] : split[preIndex - 1],
          timeInfo: split[preIndex],
          room: '',
          teacher: '',
          cDay,
        }
        // T1 G4: 末尾分支同款守卫
        if (i - preIndex === 1) {
          if (preIndex + 1 < split.length) temp.teacher = split[preIndex + 1]
        } else {
          if (preIndex + 1 < split.length) temp.teacher = split[preIndex + 1]
          if (preIndex + 2 < split.length) temp.room = split[preIndex + 2]
        }
        courses.push(temp)
        hasTypeFlag = false
      }
    }
    return courses
  }

  /** T8: #Table1 + 花括号周次 = 100; blacktab = 90; 仅 Table1 = 70 */
  confidence(): number {
    try {
      const doc = parseHtmlDoc(this.source)
      const t1 = getElementById(doc, 'Table1')
      const blacktab = selectFirst(doc, 'table.blacktab')
      const hasWeek = WEEK_PATTERN.test(this.source)
      if ((t1 || blacktab) && hasWeek) return 100
      if (blacktab) return 90
      if (t1) return 70
      return 0
    } catch {
      return 0
    }
  }

  matchedFeatures(): string[] {
    try {
      const doc = parseHtmlDoc(this.source)
      const features: string[] = []
      if (getElementById(doc, 'Table1')) features.push('id=Table1')
      if (selectFirst(doc, 'table.blacktab')) features.push('class=blacktab')
      if (this.source.includes('<a')) features.push('<a>课程链接')
      if (WEEK_PATTERN.test(this.source)) features.push('{第N-M周}')
      return features
    } catch {
      return []
    }
  }
}

/** T1 G5 兜底: 文本含"星期一"的第一个 table */
function pickTableByMonday(doc: Document): Element | null {
  for (const table of Array.from(doc.querySelectorAll('table'))) {
    if ((table.textContent ?? '').includes('星期一')) return table
  }
  return null
}

/** importList2CourseList + parseTime — 返回 [day, step, startWeek, endWeek, type] */
function parseTime(bean: ImportBean, time: string, source: string): number[] {
  const result = [0, 0, 0, 0, 0]
  // day: 周次串以"周X"开头时从串里取 (G7: 周天→7)
  if (time.startsWith('周')) {
    const idx = getWeekFromChinese(time.substring(0, 2))
    if (idx > 0) result[0] = idx
  }
  if (result[0] === 0) {
    // 数源码中课程名前行标记 "Center" 出现次数
    let startIndex = source.indexOf(`>第${bean.startNode}节</td>`)
    if (startIndex === -1) {
      startIndex = source.indexOf(`>第${getNodeStr(bean.startNode)}节</td>`)
    }
    let endIndex = 0
    if (startIndex !== -1) endIndex = source.indexOf(bean.name, startIndex)
    if (startIndex !== -1 && endIndex !== -1) {
      result[0] = countStr(source.substring(startIndex, endIndex), 'Center')
    }
  }

  // step (连上节数)
  let step = 0
  if (time.includes('节/')) {
    const numLocate = time.indexOf('节/')
    step = toIntOrNull(time.substring(numLocate - 1, numLocate)) ?? 0
  } else if (time.includes(',')) {
    let locate = 0
    step = 1
    while (time.indexOf(',', locate) !== -1 && locate < time.length) {
      step += 1
      locate = time.indexOf(',', locate) + 1
    }
  } else if (time.includes(`第${bean.startNode}节`)) {
    step = 1
  }
  if (step === 0) {
    const m = NODE_PATTERN.exec(time)
    if (m) {
      const nodeInfo = m[0]
      const nodes = nodeInfo.substring(1, nodeInfo.length - 1).split('-').filter((s) => s !== '')
      if (nodes.length > 0) {
        // T1 G1: 真正写回 bean.startNode
        const v = toIntOrNull(nodes[0])
        if (v !== null) bean.startNode = v
      }
      if (nodes.length > 1) {
        const s = toIntOrNull(nodes[0]) ?? bean.startNode
        const e = toIntOrNull(nodes[1]) ?? s
        step = e - s + 1
      }
    }
  }
  if (step === 0) step = 1
  // T1 G12: result[1] = step
  result[1] = step

  // 周数 {第N-M周
  let startWeek = 1
  let endWeek = 20
  const weekM = WEEK_PATTERN.exec(time)
  if (weekM) {
    const weekInfo = weekM[0]
    const weeks = weekInfo.substring(2, weekInfo.length - 1).split('-').filter((s) => s !== '')
    if (weeks.length > 0) {
      const v = toIntOrNull(weeks[0])
      if (v !== null) {
        startWeek = v
        result[2] = v
      }
    }
    if (weeks.length > 1) {
      const v = toIntOrNull(weeks[1])
      if (v !== null) {
        endWeek = v
        result[3] = v
      }
    }
  } else {
    result[2] = startWeek
    result[3] = endWeek
  }

  // 单双周
  if (time.includes('单周')) result[4] = 1
  else if (time.includes('双周')) result[4] = 2

  return result
}

function importList2CourseList(importList: ImportBean[], source: string): JwCourse[] {
  const result: JwCourse[] = []
  for (const i of importList) {
    const time = parseTime(i, i.timeInfo, source)
    // 周次串带"周X"时以串为准, 否则用网格列号
    const day =
      i.timeInfo.length >= 2 && getWeekFromChinese(i.timeInfo.substring(0, 2)) > 0
        ? time[0]
        : i.cDay
    result.push({
      name: i.name,
      day,
      room: i.room,
      teacher: i.teacher,
      startNode: i.startNode,
      endNode: i.startNode + time[1] - 1,
      type: time[4],
      startWeek: time[2],
      endWeek: time[3],
    })
  }
  return result
}
