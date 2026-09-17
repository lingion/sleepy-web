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

/** 課表实体 — TimeTableEntity.kt 1:1 */
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
  /**
   * issue#40 绑定的独立时间节次表 (period_tables.id)。null/undefined = 未绑定(用旧 timeJson 兼容列)。
   * 课程表 → 时间节次表的单向引用; 一张时间节次表可被多张课程表引用。
   */
  periodTableId?: number | null
}

/**
 * 独立时间节次表 (issue#40) — "第 N 节是几点到几点"的真源, 与课程表平行的层级。
 * PeriodTableEntity.kt 1:1。一张可被零或多张课程表引用 (Table.periodTableId 单向指向);
 * 修改本表 = 所有引用它的课程表立即按新作息解释节次; 课程行按 startNode/step 绑定不重算。
 */
export interface PeriodTable {
  id: number
  /** 用户可见名称, 如"春季作息" */
  name: string
  /** 一天的节次数 */
  nodesPerDay: number
  /** TimeNode[] 序列化, 沿用 TimeTableUtils 单一解析来源 */
  timeJson: string
  /** 智慧节次配置 JSON。空串表示手动模式 */
  smartConfigJson: string
  createdAt: number
  updatedAt: number
}

/**
 * 有效时间表水合 (issue#40 设计 §5.1) — TimeTableEntity.hydratedWith 1:1:
 * 绑定存在 → 节次时间/智慧节次/节次数全部以所绑 periodTable 覆盖 (兼容列保留仅作回退);
 * 未绑定或传入 null → 原样返回 (读旧兼容列, 行为与升级前一致)。
 */
export function hydratedWith(table: Table, periodTable: PeriodTable | null | undefined): Table {
  if (!periodTable) return table
  return {
    ...table,
    nodeCount: periodTable.nodesPerDay,
    timeJson: periodTable.timeJson,
    smartConfigJson: periodTable.smartConfigJson,
  }
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

/**
 * App 偏好 — AppPrefs.kt 1:1
 * 默认值全部以 AppPrefs.kt getter 兜底值为准 (2026-09-12 逐项核对):
 * displayMode=node, gridSubInfo=room, conflictStyle=rail, conflictStackInset/RailInset=7,
 * showDate=false, navDock=false, lang=zh-CN, widgetSeparator=true。
 */
export interface Prefs {
  themeMode: 'system' | 'light' | 'dark'
  /** 预设 key(default/spring/ocean/peach/slate) | 'system' | 'custom:<uuid>' (AppPrefs themeKey 同构) */
  theme: string
  lang: 'system' | 'en' | 'zh-CN' | 'zh-TW' | 'ja' | 'es' | 'en-GB'
  /** 课程时间显示: node=第N节 / time=HH:mm-HH:mm (非视图切换!) */
  displayMode: 'node' | 'time'
  gridSubInfo: 'teacher' | 'room' | 'none'
  conflictStyle: ConflictStyle
  /** CONFLICT_TOP_INSET_RANGE 4-20 dp, 默认 7 */
  conflictStackInset: number
  conflictRailInset: number
  /** CONFLICT_FOLD_SIZE_RANGE 8-28 dp, 默认 16 */
  conflictFoldSize: number
  startView: 'full' | 'cards'
  showDate: boolean
  /** 可见天集合 1-7 */
  visibleDays: number[]
  /** 0.7-1.3, 默认 1.0 */
  gridScale: number
  weekScale: number
  /** 0-2 圆角比例, 默认 1.0 */
  gridCornerRatio: number
  weekTwoColumn: boolean
  /** 周视图两栏分栏标准: days=按天对半分 / balance=按课程数平衡 */
  weekTwoColumnMode: 'days' | 'balance'
  /** 周视图隐藏无课日 (仅两栏下生效) */
  weekHideEmptyDays: boolean
  /** issue#26 别名显示开关 */
  weekUseAlias: boolean
  gridUseAlias: boolean
  widgetUseAlias: boolean
  /** 冲突簇默认置顶图层 — JSON {"day:startNode:step": layerRepId} (AppPrefs KEY_CONFLICT_DEFAULT_TOP) */
  conflictDefaultTop: Record<string, number>
  navDock: boolean
  highRefresh: boolean
  /** 小组件竖排标点优化, 默认 false */
  vertPunct: boolean
  /** 小组件无色模式, 默认 false */
  widgetColorless: boolean
  /** App 课程胶囊无色模式, 默认 false */
  courseColorless: boolean
  /** WeekView 小组件课程间分隔线, 默认 true */
  widgetSeparator: boolean
  /** 法定节假日灰显开关 — 默认 true (AppPrefs KEY_HOLIDAY_GREY_HOLIDAY) */
  holidayGreyHoliday: boolean
  /** 周末灰显开关 — 默认 true (AppPrefs KEY_HOLIDAY_GREY_WEEKEND) */
  holidayGreyWeekend: boolean
  /** 灰显样式: grey=半透明 / strikethrough=删除线 (AppPrefs KEY_HOLIDAY_STYLE, 默认 grey) */
  holidayStyle: 'grey' | 'strikethrough'
  /** 补班日忽略 — 默认 true (AppPrefs KEY_HOLIDAY_IGNORE_WORKDAY) */
  holidayIgnoreWorkday: boolean
}

export const DEFAULT_PREFS: Prefs = {
  themeMode: 'system',
  theme: 'default',
  lang: 'zh-CN',
  displayMode: 'time', // 安卓 2026-09-14 出厂改 "time" (默认显示时间段)
  gridSubInfo: 'room',
  conflictStyle: 'rail',
  conflictStackInset: 7,
  conflictRailInset: 7,
  conflictFoldSize: 16,
  startView: 'cards', // 安卓出厂默认 cards (AppPrefs.kt:388)
  showDate: true, // 安卓出厂默认 true (AppPrefs.kt:399)
  visibleDays: [1, 2, 3, 4, 5, 6, 7],
  gridScale: 1.0,
  weekScale: 1.0,
  gridCornerRatio: 1.0,
  weekTwoColumn: false,
  weekTwoColumnMode: 'days',
  weekHideEmptyDays: false,
  weekUseAlias: false,
  gridUseAlias: false,
  widgetUseAlias: false,
  conflictDefaultTop: {},
  navDock: false,
  highRefresh: true,
  vertPunct: false,
  widgetColorless: false,
  courseColorless: false,
  widgetSeparator: true,
  holidayGreyHoliday: true,
  holidayGreyWeekend: true,
  holidayStyle: 'grey',
  holidayIgnoreWorkday: true,
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
