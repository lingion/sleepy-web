import {
  escape, crc32Utf8, colorToToken, weekSpecToToken, matchesNdPreset,
} from './sleepyNativeFormat'
import { parseNodes } from '../timeTable'

/**
 * sleepy-v1 导出器 — Kotlin SleepyNativeExporter.kt 1:1 移植 (规范 §4/§5/§8.1)
 * 写规范形(导出永不出现裸危险字符; 字段编码紧凑, 调色板走索引, Nd 折叠);
 * 承担同名异组强制 token(契约二)。散周 partition v1 简化为三元组直通(与 Kotlin 一致)。
 */

/** 课程最小输入形状 — Course 的结构子集 (避免循环依赖 data/types) */
export interface ExportCourse {
  groupId: string
  courseName: string
  alias: string
  teacher: string
  room: string
  note: string
  day: number
  startNode: number
  step: number
  startWeek: number
  endWeek: number
  type: number
  color: string
  ownTime: boolean
  startTime: string
  endTime: string
}

/** 文件形态: 末尾追加 z|chk=crc32:xxxxxxxx (文件导出默认写) */
export function exportSleepyV1File(
  tableName: string,
  startDate: string,
  maxWeek: number,
  nodesPerDay: number,
  timeJson: string,
  courses: ExportCourse[],
): string {
  const body = buildBody(tableName, startDate, maxWeek, nodesPerDay, timeJson, courses)
  return `${body}\nz|chk=crc32:${crc32Utf8(body)}`
}

/** 分享文本形态: 【来自Sleepy】+ 包裹 marker + 无 chk (规范 §1.1) */
export function exportSleepyV1ShareText(
  tableName: string,
  startDate: string,
  maxWeek: number,
  nodesPerDay: number,
  timeJson: string,
  courses: ExportCourse[],
): string {
  const body = buildBody(tableName, startDate, maxWeek, nodesPerDay, timeJson, courses)
  return `【来自Sleepy】\n课程分享：\n\n<<<SLEEPY-BEGIN>>>\n${body}\n<<<SLEEPY-END>>>`
}

function buildBody(
  tableName: string,
  startDate: string,
  maxWeek: number,
  nodesPerDay: number,
  timeJson: string,
  courses: ExportCourse[],
): string {
  const sb: string[] = []
  sb.push('#sleepy-v1')

  // ---- T 行(§3.5) ----
  // n= 计数(§8.3): 散周 partition v1 简化 = 课程数; partition 实现完备后此处同步改
  sb.push(`T${escape(tableName === '' ? '导入的课表' : tableName)}|${startDate}|${maxWeek}|${nodesPerDay}|n=${courses.length}`)

  // ---- 作息 (Nd 或逐节 N 行) (§5) ----
  if (matchesNdPreset(timeJson)) {
    sb.push('Nd')
  } else if (timeJson.trim() !== '') {
    for (const n of parseNodes(timeJson)) {
      sb.push(`N${n.node}|${n.start}|${n.end}`)
    }
  }

  // ---- 课程行 ----
  const hasSameNameMultiGroup = hasSameNameMultipleGroups(courses)
  for (const line of exportCourses(courses, hasSameNameMultiGroup)) {
    sb.push(line)
  }

  // 去尾换行 — file 形 chk 前, share 形 marker 内
  return sb.join('\n')
}

function exportCourses(courses: ExportCourse[], forceToken: boolean): string[] {
  // 按 groupId, courseName 排序输出(§8.1)
  const sorted = [...courses].sort((a, b) => {
    if (a.groupId !== b.groupId) return a.groupId < b.groupId ? -1 : 1
    if (a.courseName !== b.courseName) return a.courseName < b.courseName ? -1 : 1
    return 0
  })
  const tokenMap = new Map<string, string>()
  const out: string[] = []
  for (const c of sorted) {
    let token = ''
    if (c.groupId !== '') {
      if (forceToken) {
        token = tokenMap.get(c.groupId) ?? String(tokenMap.size + 1)
        tokenMap.set(c.groupId, token)
      } else {
        // §3.4 契约二: 同名 >1 才写 token (Kotlin: sameGroupCount>0 恒真, 实际条件=sameNameCount>1)
        const sameNameCount = sorted.filter((x) => x.courseName.trim() === c.courseName.trim()).length
        if (sameNameCount > 1) {
          token = tokenMap.get(c.groupId) ?? String(tokenMap.size + 1)
          tokenMap.set(c.groupId, token)
        }
      }
    }
    out.push(buildCourseLine(c, token))
  }
  return out
}

function buildCourseLine(c: ExportCourse, token: string): string {
  const parts: string[] = []
  parts.push(`C${escape(c.courseName)}`)
  parts.push(String(c.day))
  parts.push(`${c.startNode}-${c.startNode + c.step - 1}`)
  parts.push(weekSpecToToken(c.startWeek, c.endWeek, c.type))
  parts.push(escape(c.teacher))
  parts.push(escape(c.room))
  parts.push(colorToToken(c.color))
  parts.push(escape(c.note))
  if (c.ownTime && c.startTime !== '' && c.endTime !== '') {
    parts.push(`${c.startTime}-${c.endTime}`)
  } else {
    parts.push('')
  }
  parts.push(token)
  let line = parts.join('|')
  // issue#26: 可选第 11 列 = 课程别名(escape 后写入); 空别名不写列(文件形状与既有 v1 完全一致)
  if (c.alias.trim() !== '') {
    line += `|${escape(c.alias.trim())}`
  }
  return line
}

function hasSameNameMultipleGroups(courses: ExportCourse[]): boolean {
  const byName = new Map<string, Set<string>>()
  for (const c of courses) {
    const name = c.courseName.trim()
    if (!byName.has(name)) byName.set(name, new Set())
    byName.get(name)!.add(c.groupId)
  }
  for (const gids of byName.values()) {
    if (gids.size > 1) return true
  }
  return false
}
