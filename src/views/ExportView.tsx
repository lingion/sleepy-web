/**
 * ExportView — Kotlin ExportScreen.kt 1:1 移植
 * 三格式导出: WakeUp 兼容 JSON / 分享文本 / ICS 日历 + Sleepy 原生 (.sleepy)
 * 分享文本: 复制到剪贴板 (web 无原生 chooser intent, 复制为最贴近 Android shareText 体验)
 * 文件下载: Blob + a.download (浏览器的 MediaStore.Downloads 等价物)
 *
 * ShareScheduleSheetView — Kotlin ShareScheduleSheet.kt (顶栏分享底部弹窗) 的 web 等价物。
 * 挂载点在 ScheduleView 顶栏 (跨分区, 由编排方接线): 视图切换左侧加分享按钮
 * (IconIosShare size 20, title=t('share_sheet_title')), 弹层传当前表 + 课程。
 *
 * 对齐注记:
 * - 选表弹窗: Android 为居中 AlertDialog (ExportScreen.kt:271), web 保留底部弹层形态
 *   (平台差异), 行内容/徽标/勾选 1:1。
 * - snackbar: themes.ts 未导出 inverse 系 token, 以 on-surface/surface 近似 (审计#4 允许并注明)。
 * - 下拉箭头: icons.tsx 暂无 IconExpandMore, 以 IconChevronLeft rotate(-90deg) 等价指向下;
 *   icons.tsx 补图标后替换 (跨分区待办)。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconStar, IconCode, IconShare, IconCalendarMonth, IconArrowBack,
  IconCheck, IconChevronLeft,
} from '../components/icons'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { getCourses, getDefaultTable } from '../data/repository'
import { exportWakeUpJson, exportWakeUpShareText, exportIcs } from '../domain/import/scheduleExporter'
import { exportSleepyV1File, exportSleepyV1ShareText } from '../domain/import/sleepyNativeExporter'
import type { Table, Course } from '../data/types'
import type { ExportCourse } from '../domain/import/scheduleExporter'

export function ExportView({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const tables = useLiveQuery(() => db.timetables.orderBy('id').toArray(), []) ?? []
  const defaultTable = useLiveQuery(() => getDefaultTable(), [])
  const { notice, show } = useAutoNotice()

  // 导出目标课表 — 本地选择, 不污染主页 selectedTableId
  const [exportTableId, setExportTableId] = useState<number | null>(null)
  const effectiveId = exportTableId ?? defaultTable?.id ?? tables[0]?.id
  const table = tables.find((tb) => tb.id === effectiveId)
  const [pickerOpen, setPickerOpen] = useState(false)
  // Android state.selectedTableId (主页当前表) 的 web 对应 = 默认课表
  const homeTableId = defaultTable?.id ?? tables[0]?.id

  // 当前表的课程: useLiveQuery 反应式
  const courses = useLiveQuery(async () => {
    if (!effectiveId) return []
    return await getCourses(effectiveId)
  }, [effectiveId]) ?? []

  async function handleJson() {
    if (!table) return
    const fileName = `sleepy_${table.name}_${await stamp()}.json`
    const json = exportWakeUpJson(toExportTable(table), toExportCourses(courses))
    try {
      await downloadFile(fileName, json, 'application/json')
      show(t('export_saved_to', { v1: fileName, defaultValue: `已保存到 Download/Sleepy/${fileName}` }))
    } catch {
      show(t('export_failed', '导出失败，请重试'))
    }
  }

  async function handleShareText() {
    if (!table) return
    const text = exportWakeUpShareText(toExportTable(table), toExportCourses(courses))
    try {
      await copyText(text)
      show(t('export_copied_hint', '已调起分享面板'))
    } catch {
      show(t('export_failed', '导出失败，请重试'))
    }
  }

  async function handleIcs() {
    if (!table) return
    const fileName = `sleepy_${table.name}_${await stamp()}.ics`
    const ics = exportIcs(toExportTable(table), toExportCourses(courses))
    try {
      await downloadFile(fileName, ics, 'text/calendar')
      show(t('export_saved_to', { v1: fileName, defaultValue: `已保存到 Download/Sleepy/${fileName}` }))
    } catch {
      show(t('export_failed', '导出失败，请重试'))
    }
  }

  async function handleNative() {
    if (!table) return
    const fileName = `sleepy_${table.name}_${await stamp()}.sleepy`
    const out = exportSleepyV1File(
      table.name,
      table.startDate,
      table.maxWeek,
      table.nodeCount,
      table.timeJson,
      toExportCourses(courses),
    )
    try {
      await downloadFile(fileName, out, 'text/plain')
      show(t('export_saved_to', { v1: fileName, defaultValue: `已保存到 Download/Sleepy/${fileName}` }))
    } catch {
      show(t('export_failed', '导出失败，请重试'))
    }
  }

  if (tables.length === 0 || !table) {
    return (
      <div style={{ padding: 16 }}>
        <Header onBack={onBack} title={t('export_title')} />
        <p className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)', textAlign: 'center', marginTop: 32 }}>
          {t('export_no_table')}
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Header onBack={onBack} title={t('export_title')} />

      {/* 表选择卡 — Android clip(shapes.large=16dp) primaryContainer (ExportScreen.kt:153-158) */}
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="m3-card"
        style={{
          background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)',
          borderRadius: 16,
          padding: 20, textAlign: 'left', cursor: 'pointer', border: 'none',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div className="m3-title-medium" style={{ fontWeight: 700, flex: 1 }}>{table.name}</div>
          {/* Icons.Outlined.ExpandMore 的 web 等价 — icons.tsx 暂无该图标, 用 chevron 旋转 (见文件头注记) */}
          <IconChevronLeft size={24} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }} />
        </div>
        <div className="m3-body-medium">
          {/* startDate '—' 兜底为 web 添加 (Android 直传原文, 空串直接空) */}
          {t('export_course_count', { v1: courses.length })} · {t('export_start_date', { v1: table.startDate || '—' })}
        </div>
      </button>

      {/* 格式选项 — Android clip(shapes.large=16dp) surfaceContainer (ExportScreen.kt:185-189) */}
      <div
        className="m3-card"
        style={{ padding: 0, overflow: 'hidden', borderRadius: 16, background: 'var(--md-surface-container)' }}
      >
        <ExportItem
          icon={<IconCode size={24} />} title={t('export_json_title')} subtitle={t('export_json_subtitle')}
          onClick={() => { void handleJson() }}
        />
        <Hairline />
        <ExportItem
          icon={<IconShare size={24} />} title={t('export_share_title')} subtitle={t('export_share_subtitle')}
          onClick={() => { void handleShareText() }}
        />
        <Hairline />
        <ExportItem
          icon={<IconCalendarMonth size={24} />} title={t('export_ics_title')} subtitle={t('export_ics_subtitle')}
          onClick={() => { void handleIcs() }}
        />
        <Hairline />
        <ExportItem
          icon={<IconStar size={24} />} title={t('export_native_title')} subtitle={t('export_native_subtitle')}
          onClick={() => { void handleNative() }}
        />
      </div>

      {/* M3 snackbar 等价 — inverse token 未导出, on-surface/surface 近似, 4s 自动消失 */}
      {notice && (
        <div
          role="status"
          style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            zIndex: 1100, maxWidth: 'calc(100vw - 32px)',
            background: 'var(--md-on-surface)', color: 'var(--md-surface)',
            borderRadius: 4, padding: '10px 16px',
            fontSize: 14, lineHeight: '20px',
          }}
        >
          {notice}
        </div>
      )}

      {pickerOpen && (
        <Picker
          tables={tables}
          selectedId={table.id}
          homeTableId={homeTableId}
          onPick={(id) => { setExportTableId(id); setPickerOpen(false) }}
          onDismiss={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

/**
 * 顶栏分享底部弹窗 — ShareScheduleSheet.kt:44-151 1:1。
 * Android: ModalBottomSheet(containerColor=surface, skipPartiallyExpanded);
 * web 等价 = fixed 底部弹层。选中即执行且弹层保持展开 (点遮罩关闭)。
 * 第 4 条原生走 exportSleepyV1ShareText (marker 包裹 + 无 chk 的 IM 粘贴形态,
 * ShareScheduleSheet.kt:137-146), 复制到剪贴板, 不用 exportSleepyV1File。
 * 下载条目静默 (浏览器自带下载反馈 ≈ Android 系统分享面板); 剪贴板条目无可见副作用,
 * 补 export_copied_hint 提示 (web 添加)。
 */
export function ShareScheduleSheetView({
  table, courses, onDismiss,
}: {
  table: Table
  courses: Course[]
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  const { notice, show } = useAutoNotice()

  async function handleJson() {
    const fileName = `sleepy_${table.name}_${await stamp()}.json`
    await downloadFile(fileName, exportWakeUpJson(toExportTable(table), toExportCourses(courses)), 'application/json')
  }
  async function handleShareText() {
    await copyText(exportWakeUpShareText(toExportTable(table), toExportCourses(courses)))
    show(t('export_copied_hint', '已调起分享面板'))
  }
  async function handleIcs() {
    const fileName = `sleepy_${table.name}_${await stamp()}.ics`
    await downloadFile(fileName, exportIcs(toExportTable(table), toExportCourses(courses)), 'text/calendar')
  }
  async function handleNativeShare() {
    // 分享形态: marker 包裹 + 无 chk (IM 场景最小体积), 接收方粘贴导入
    await copyText(exportSleepyV1ShareText(
      table.name, table.startDate, table.maxWeek, table.nodeCount,
      table.timeJson, toExportCourses(courses),
    ))
    show(t('export_copied_hint', '已调起分享面板'))
  }
  function guard(fn: () => Promise<void>) {
    return () => { void fn().catch(() => show(t('export_failed', '导出失败，请重试'))) }
  }

  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, borderRadius: '16px 16px 0 0',
          background: 'var(--md-surface)', color: 'var(--md-on-surface)', paddingBottom: 24,
        }}
      >
        <div
          className="m3-title-medium"
          style={{ fontWeight: 600, color: 'var(--md-on-surface)', padding: '12px 16px' }}
        >
          {t('share_sheet_title', '分享课表')}
        </div>
        <ExportItem
          icon={<IconCode size={24} />} title={t('export_json_title')} subtitle={t('export_json_subtitle')}
          onClick={guard(handleJson)}
        />
        <Hairline />
        <ExportItem
          icon={<IconShare size={24} />} title={t('export_share_title')} subtitle={t('export_share_subtitle')}
          onClick={guard(handleShareText)}
        />
        <Hairline />
        <ExportItem
          icon={<IconCalendarMonth size={24} />} title={t('export_ics_title')} subtitle={t('export_ics_subtitle')}
          onClick={guard(handleIcs)}
        />
        <Hairline />
        <ExportItem
          icon={<IconStar size={24} />} title={t('export_native_title')} subtitle={t('export_native_subtitle')}
          onClick={guard(handleNativeShare)}
        />
      </div>
      {notice && (
        <div
          role="status"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            zIndex: 1100, maxWidth: 'calc(100vw - 32px)',
            background: 'var(--md-on-surface)', color: 'var(--md-surface)',
            borderRadius: 4, padding: '10px 16px',
            fontSize: 14, lineHeight: '20px',
          }}
        >
          {notice}
        </div>
      )}
    </div>
  )
}

function toExportTable(tb: Table): import('../domain/import/scheduleExporter').ExportTable {
  // scheduleExporter 的 ExportTable 用 nodesPerDay; web 端 Table 是 nodeCount
  return {
    id: tb.id,
    name: tb.name,
    startDate: tb.startDate,
    maxWeek: tb.maxWeek,
    nodesPerDay: tb.nodeCount,
    timeJson: tb.timeJson,
    color: '#FF6750A4', // Table (web schema) 未建 color 列, 用 Kotlin TimeTableEntity 默认主色
  }
}

function toExportCourses(cs: Course[]): ExportCourse[] {
  return cs.map((c) => ({
    id: c.id,
    groupId: c.groupId,
    tableId: c.tableId,
    courseName: c.courseName,
    alias: c.alias,
    teacher: c.teacher,
    room: c.room,
    note: c.note,
    day: c.day,
    startNode: c.startNode,
    step: c.step,
    startWeek: c.startWeek,
    endWeek: c.endWeek,
    type: c.type,
    color: c.color,
    ownTime: c.ownTime,
    startTime: c.startTime,
    endTime: c.endTime,
  }))
}

// Android SimpleDateFormat('yyyyMMdd_HHmmss', Locale.US) (ExportScreen.kt:380-381) — 含秒
async function stamp(): Promise<string> {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** 顶栏 (ExportScreen.kt:119-136 titleLarge SemiBold) + 返回键 (contentDescription=back) */
function Header({ title, onBack }: { title: string; onBack: () => void }) {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        onClick={onBack}
        aria-label={t('back', '返回')}
        style={{
          padding: '8px 12px', borderRadius: 12, border: 'none', cursor: 'pointer',
          background: 'transparent', color: 'var(--md-on-surface)',
        }}
      >
        <IconArrowBack size={20} />
      </button>
      <h1 className="m3-title-large" style={{ margin: 0, fontWeight: 600 }}>{title}</h1>
    </div>
  )
}

/** 条目 — ExportScreen.kt:331-369 ExportItem (44dp 图标容器 primaryContainer + titleSmall/Medium + bodySmall) */
function ExportItem({ icon, title, subtitle, onClick }: { icon: React.ReactNode; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: 16, width: '100%', textAlign: 'left',
        background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit',
      }}
    >
      <div
        aria-hidden
        style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div className="m3-title-small" style={{ color: 'var(--md-on-surface)', marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 12, lineHeight: '16px', color: 'var(--md-on-surface-variant)' }}>{subtitle}</div>
      </div>
    </button>
  )
}

/** HorizontalDivider 0.5dp inset 16 outlineVariant.copy(alpha=0.3) (ExportScreen.kt:371-378) */
function Hairline() {
  return <div style={{ height: 1, margin: '0 16px', background: 'color-mix(in srgb, var(--md-outline-variant) 30%, transparent)' }} />
}

/**
 * 选表弹窗 — ExportScreen.kt:270-327 AlertDialog (行样式对齐 TableSwitcherDialog 用户定版)。
 * web 保留底部弹层形态 (平台差异, 见文件头注记), 内容 1:1:
 * 标题 / maxHeight 360 滚动 / gap 4 / 行 8dp 圆角 primaryContainer:surfaceContainer
 * / bodyMedium+Medium 名 2 行截断 / 当前表徽标 labelSmall / 选中行尾 Check 18dp primary。
 */
function Picker({
  tables, selectedId, homeTableId, onPick, onDismiss,
}: {
  tables: Table[]; selectedId: number; homeTableId: number | undefined
  onPick: (id: number) => void; onDismiss: () => void
}) {
  const { t } = useTranslation()
  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="m3-card"
        style={{ width: '100%', maxWidth: 480, borderRadius: '16px 16px 0 0', padding: 16 }}
      >
        <div style={{ fontSize: 16, lineHeight: '24px', fontWeight: 500, color: 'var(--md-on-surface)', marginBottom: 12 }}>
          {t('export_pick_table', '选择要导出的课表')}
        </div>
        <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {tables.map((tb) => {
            const isSelected = tb.id === selectedId
            const isHome = tb.id === homeTableId
            return (
              <button
                key={tb.id}
                type="button"
                onClick={() => onPick(tb.id)}
                style={{
                  display: 'flex', alignItems: 'center', width: '100%',
                  borderRadius: 8, padding: '10px 8px', border: 'none', cursor: 'pointer', textAlign: 'left',
                  background: isSelected ? 'var(--md-primary-container)' : 'var(--md-surface-container)',
                  color: isSelected ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14, lineHeight: '20px', fontWeight: 500,
                      display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden',
                    }}
                  >
                    {tb.name}
                  </div>
                  {isHome && (
                    <div
                      className="m3-label-small"
                      style={{ color: isSelected ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)' }}
                    >
                      {t('export_current_table_badge', '当前课表')}
                    </div>
                  )}
                </div>
                {isSelected && <IconCheck size={18} color="var(--md-primary)" style={{ flexShrink: 0 }} />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** 提示条状态 — 4s 自动清除, 新提示重置计时, 卸载清理 */
function useAutoNotice(durationMs = 4000) {
  const [notice, setNotice] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((msg: string) => {
    setNotice(msg)
    if (timer.current !== undefined) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setNotice(null), durationMs)
  }, [durationMs])
  useEffect(() => () => {
    if (timer.current !== undefined) window.clearTimeout(timer.current)
  }, [])
  return { notice, show }
}

// ── 浏览器 API 适配 ──────────────────────────────────────────────────────

async function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime + ';charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

async function copyText(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  // 老浏览器 fallback: 临时 textarea + execCommand
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  try {
    document.execCommand('copy')
  } finally {
    ta.remove()
  }
}
