/**
 * 示例课表 — 首次打开 (空库) 自动 seed 一张示例
 * 用户指令 2026-09-12: "默认应该给出一个示例课表"。
 * Android 对应行为是"没有课表就老实空着" (ScheduleViewModel.kt:72), 此为 web 特有。
 * 防重标记 = prefs 表独立行 key='sampleTableSeeded' (不进 Prefs 类型 — 展示性标记非用户偏好)。
 * 仅在 timetables 空时 seed; 用户删除示例表后标记仍在, 不复活。
 * seed 不走 undo capture — 动作发生在用户任何操作之前, 无"动作前状态"可回。
 */

import { db, nextTableId, loadPrefs } from './db'
import { DEFAULT_TIME_JSON } from '../domain/timeTable'
import i18next from 'i18next'
import type { Course, Table } from './types'

/** 示例课程行 — [课名, 教师, 教室, 周几, 起节, 连节数, 起周, 止周, 单双周] */type SampleRow = [string, string, string, number, number, number, number, number, Course['type']]

// 一周典型大学课表 — 覆盖连堂/单周/双周/多天同课 (组色共享) 四种形态
const SAMPLE_ROWS: SampleRow[] = [
  ['高等数学', '王教授', '教学楼A-101', 1, 1, 2, 1, 16, 0],
  ['大学英语', '李老师', '外语楼B-203', 1, 3, 2, 1, 16, 0],
  ['数据结构', '张教授', '计算机楼C-301', 2, 1, 2, 1, 16, 0],
  ['大学物理', '赵老师', '物理楼D-105', 2, 6, 2, 3, 16, 1], // 单周
  ['体育', '刘教练', '体育馆', 3, 8, 2, 1, 16, 0],
  ['线性代数', '陈教授', '教学楼A-204', 4, 1, 2, 1, 16, 0],
  ['数据结构', '张教授', '机房E-201', 4, 3, 2, 1, 16, 0], // 与周二同课 → 同组色
  ['马克思主义基本原理', '孙老师', '文科楼F-102', 5, 3, 2, 1, 16, 0],
  ['大学物理', '赵老师', '物理楼D-105', 5, 6, 2, 3, 16, 2], // 双周
]

/** 空库时 seed 示例课表 — Bootstrap 挂载前 await 一次 */
export async function seedSampleTable(): Promise<void> {
  const flag = await db.prefs.get('sampleTableSeeded')
  if (flag) return
  await db.prefs.put({ key: 'sampleTableSeeded', value: '1' })
  // 用户已有表 (老版本升级) — 只打标记不塞数据
  if ((await db.timetables.count()) > 0) return

  const tableId = await nextTableId()
  const table: Table = {
    id: tableId,
    // i18next 未初始化 (单测) 时 t() 返回 key/undefined — 兜底中文真值
    name: i18next.t('sample_table_name') || '示例课表',
    startDate: lastMondayIso(),
    timeJson: DEFAULT_TIME_JSON,
    isDefault: 1,
    maxWeek: 20,
    createdAt: Date.now(),
    smartConfigJson: '',
    nodeCount: 12,
  }
  let cidBase = 1
  const existingCourses = await db.courses.count()
  if (existingCourses > 0) {
    cidBase = (await db.courses.orderBy('id').last())!.id + 1
  }
  await db.transaction('rw', db.timetables, db.courses, db.prefs, async () => {
    await db.timetables.put(table)
    let cid = cidBase
    for (const r of SAMPLE_ROWS) {
      const course = courseOf(r, cid++, tableId)
      await db.courses.put(course)
    }
    // 记下示例表 id — ScheduleView 据此显示"这是示例"提示条
    await db.prefs.put({ key: 'sampleTableId', value: String(tableId) })
  })
}

function courseOf(r: SampleRow, id: number, tableId: number): Course {
  const [courseName, teacher, room, day, startNode, step, startWeek, endWeek, type] = r
  return {
    id,
    tableId,
    // 同名课共享 groupId → 组色共享 (周二/周四数据结构同色)
    groupId: `sample_${courseName}`,
    courseName,
    teacher,
    room,
    note: '',
    alias: '',
    day,
    startNode,
    step,
    startWeek,
    endWeek,
    type,
    color: '',
    colorMode: 0,
    ownTime: false,
    isIrregularNode: false,
    isIrregularTime: false,
    startTime: '',
    endTime: '',
    credit: 0,
    level: 0,
  }
}

/** 上周一 ISO 日期 — 示例课表"已开学一周": 起算=上周一, 当前周=第2周 (用户指令 2026-09-15) */
function lastMondayIso(): string {
  const d = new Date()
  const dow = d.getDay() === 0 ? 7 : d.getDay()
  d.setDate(d.getDate() - (dow - 1) - 7)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// loadPrefs 引用保留 — 防止未来 seed 判定改走 Prefs 契约时遗漏导入
void loadPrefs
