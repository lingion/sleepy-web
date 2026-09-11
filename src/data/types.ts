/**
 * 数据模型 — 与 Sleepy Android Room schema 1:1 对应
 * 来源: app/src/main/java/com/lingion/sleepy/data/entity/{CourseEntity,TimeTableEntity}.kt
 */

/** 周次类型: 0=每周, 1=单周, 2=双周, 3=按周次列指定 */
export const WEEK_TYPE = { EVERY: 0, ODD: 1, EVEN: 2, SPECIFIED: 3 } as const
export type WeekType = (typeof WEEK_TYPE)[keyof typeof WEEK_TYPE]

/** issue#22 颜色模式: 0=组色, 1=自动, 2=自定义 */
export const COLOR_MODE = { GROUP: 0, AUTO: 1, CUSTOM: 2 } as const
export type ColorMode = (typeof COLOR_MODE)[keyof typeof COLOR_MODE]

/** 冲突样式 */
export const CONFLICT_STYLE = { STACK: 'stack', FOLD: 'fold', RAIL: 'rail' } as const
export type ConflictStyle = (typeof CONFLICT_STYLE)[keyof typeof CONFLICT_STYLE]

/** 课程实体 — CourseEntity.kt 1:1 */
export interface Course {
  id: number
  /** 课程组 ID — 同一门课所有节次共享 */
  groupId: string
  /** 所属课表 ID (FK → Table.id) */
  tableId: number
  courseName: string
  teacher: string
  room: string
  note: string
  /** issue#26 别名 — 仅展示场景取用,身份场景一律原名 */
  alias: string
  /** 周几 1-7 (周一=1) */
  day: number
  /** 开始节次 1-based */
  startNode: number
  step: number
  startWeek: number
  endWeek: number
  type: WeekType
  /** ARGB hex, 语义随 colorMode: GROUP=组色 / AUTO=忽略 / CUSTOM=用户色 */
  color: string
  colorMode: ColorMode
  /** 自定义时间标志 — 与 isIrregularTime 永远同值 (§5 同步契约) */
  ownTime: boolean
  /** issue#23 边缘节次槽位卡标志 */
  isIrregularNode: boolean
  /** issue#23 非常规时间覆盖标志 */
  isIrregularTime: boolean
  /** HH:mm, 仅 ownTime/isIrregularTime=true */
  startTime: string
  endTime: string
  credit: number
  level: number
}

/** 时间节点 — timeJson 数组元素 */
export interface TimeNode {
  /** 节次编号 1-based; 边缘槽位可为 0/-1/N+1 (issue#23) */
  node: number
  /** HH:mm */
  startTime: string
  endTime: string
  name?: string
}

/** 智能配置 — smartConfigJson */
export interface SmartConfig {
  [key: string]: unknown
}

/** 课表实体 — TimeTableEntity.kt 1:1 */
export interface Table {
  id: number
  name: string
  /** JSON 字符串 — TimeNode[] 序列化, 与 Android 存储形态一致 */
  timeJson: string
  smartConfigJson: string
  /** 默认课表标志 (Room 存 int 0/1) */
  isDefault: 0 | 1
  /** 学期开始周一 (yyyy-MM-dd), 空串=未设置 */
  startDate: string
  /** 每周节点数 (默认 12) */
  nodeCount: number
  maxWeek: number
  createdAt: number
}

/** 假期设置实体 */
export interface Holiday {
  id: number
  name: string
  /** yyyy-MM-dd */
  startDate: string
  endDate: string
  tableId: number
}

/** App 偏好 — AppPrefs.kt 22 keys 1:1 */
export interface Prefs {
  dark: boolean
  themeMode: 'system' | 'light' | 'dark'
  theme: 'default' | 'spring' | 'ocean' | 'peach' | 'slate'
  lang: 'system' | 'en' | 'zh-CN' | 'zh-TW' | 'ja' | 'es' | 'en-GB'
  displayMode: 'full' | 'cards'
  gridSubInfo: 'teacher' | 'room' | 'both' | 'none'
  conflictStyle: ConflictStyle
  /** 4-20 dp */
  conflictStackInset: number
  conflictRailInset: number
  /** 8-28 dp */
  conflictFoldSize: number
  startView: 'full' | 'cards'
  showDate: boolean
  /** 可见天集合 (bitmask 或数组) */
  visibleDays: number[]
  /** 0.7-1.3 */
  gridScale: number
  weekScale: number
  /** 0-2 圆角比例 */
  gridCornerRatio: number
  weekTwoColumn: boolean
  /** issue#26 别名显示开关 */
  weekUseAlias: boolean
  gridUseAlias: boolean
  widgetUseAlias: boolean
  /** 冲突簇默认置顶图层 — JSON {"day:startNode:step": layerRepId} (AppPrefs KEY_CONFLICT_DEFAULT_TOP) */
  conflictDefaultTop: Record<string, number>
  navDock: boolean
  highRefresh: boolean
}

export const DEFAULT_PREFS: Prefs = {
  dark: false,
  themeMode: 'system',
  theme: 'default',
  lang: 'system',
  displayMode: 'full',
  gridSubInfo: 'teacher',
  conflictStyle: 'stack',
  conflictStackInset: 12,
  conflictRailInset: 6,
  conflictFoldSize: 16,
  startView: 'full',
  showDate: true,
  visibleDays: [1, 2, 3, 4, 5, 6, 7],
  gridScale: 1.0,
  weekScale: 1.0,
  gridCornerRatio: 1.0,
  weekTwoColumn: false,
  weekUseAlias: false,
  gridUseAlias: false,
  widgetUseAlias: false,
  conflictDefaultTop: {},
  navDock: true,
  highRefresh: true,
}

/** inWeek(week) — CourseEntity.kt L125-134 1:1 */
export function inWeek(c: Course, week: number): boolean {
  if (week < c.startWeek || week > c.endWeek) return false
  switch (c.type) {
    case 0: return true
    case 1: return week % 2 === 1
    case 2: return week % 2 === 0
    case 3: return true
    default: return true
  }
}

/**
 * normalizeNode — CourseEntity.kt L163-170 1:1
 * ownTime=true 的课按时间表反算等效 startNode/step;
 * issue#23 边缘槽位卡禁止重映射,槽位编号即网格位置。
 */
export function normalizeNode(c: Course, timeJson: string): Course {
  if (c.isIrregularNode) return c
  if (!c.ownTime || !c.startTime || !c.endTime) return c
  const mapped = timeToNode(c.startTime, c.endTime, timeJson)
  if (!mapped) return c
  return { ...c, startNode: mapped[0], step: mapped[1] }
}

/** timeToNode — TimeTableUtils.kt 反算逻辑 (导入循环依赖,运行时注入) */
import { timeToNode } from '../domain/timeTable'
