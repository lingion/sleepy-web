/**
 * ExportView — Kotlin ExportScreen.kt 1:1 移植
 * 三格式导出: WakeUp 兼容 JSON / 分享文本 / ICS 日历 + Sleepy 原生 (.sleepy)
 * 分享文本: 复制到剪贴板 (web 无原生 chooser intent, 复制为最贴近 Android shareText 体验)
 * 文件下载: Blob + a.download (浏览器的 MediaStore.Downloads 等价物)
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { getCourses, getDefaultTable } from '../data/repository'
import { exportWakeUpJson, exportWakeUpShareText, exportIcs } from '../domain/import/scheduleExporter'
import { exportSleepyV1File } from '../domain/import/sleepyNativeExporter'
import type { Table } from '../data/types'
import type { ExportCourse } from '../domain/import/scheduleExporter'

export function ExportView({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const tables = useLiveQuery(() => db.timetables.orderBy('id').toArray(), []) ?? []
  const defaultTable = useLiveQuery(() => getDefaultTable(), [])

  // 导出目标课表 — 本地选择, 不污染主页 selectedTableId
  const [exportTableId, setExportTableId] = useState<number | null>(null)
  const effectiveId = exportTableId ?? defaultTable?.id ?? tables[0]?.id
  const table = tables.find((tb) => tb.id === effectiveId)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // 当前表的课程: useLiveQuery 反应式
  const courses = useLiveQuery(async () => {
    if (!effectiveId) return []
    return await getCourses(effectiveId)
  }, [effectiveId]) ?? []

  async function stamp(): Promise<string> {
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
  }

  function toExportCourses(cs: typeof courses): ExportCourse[] {
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

  async function handleJson() {
    if (!table) return
    const json = exportWakeUpJson(toExportTable(table), toExportCourses(courses))
    await downloadFile(`sleepy_${table.name}_${await stamp()}.json`, json, 'application/json')
    setNotice(t('export_copied_hint'))
  }

  async function handleShareText() {
    if (!table) return
    const text = exportWakeUpShareText(toExportTable(table), toExportCourses(courses))
    await copyText(text)
    setNotice(t('copied'))
  }

  async function handleIcs() {
    if (!table) return
    const ics = exportIcs(toExportTable(table), toExportCourses(courses))
    await downloadFile(`sleepy_${table.name}_${await stamp()}.ics`, ics, 'text/calendar')
    setNotice(t('export_copied_hint'))
  }

  async function handleNative() {
    if (!table) return
    const out = exportSleepyV1File(
      table.name,
      table.startDate,
      table.maxWeek,
      table.nodeCount,
      table.timeJson,
      toExportCourses(courses),
    )
    await downloadFile(`sleepy_${table.name}_${await stamp()}.sleepy`, out, 'text/plain')
    setNotice(t('export_copied_hint'))
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

      {/* 表选择卡 */}
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="m3-card"
        style={{
          background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)',
          padding: 20, textAlign: 'left', cursor: 'pointer', border: 'none',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div className="m3-title-medium" style={{ fontWeight: 700, flex: 1 }}>{table.name}</div>
          <span aria-hidden>⌄</span>
        </div>
        <div className="m3-body-medium">
          {t('export_course_count', { v1: courses.length })} · {t('export_start_date', { v1: table.startDate || '—' })}
        </div>
      </button>

      {/* 格式选项 */}
      <div className="m3-card" style={{ padding: 0, overflow: 'hidden' }}>
        <ExportItem
          icon="◇" title={t('export_json_title')} subtitle={t('export_json_subtitle')}
          onClick={() => { void handleJson() }}
        />
        <Hairline />
        <ExportItem
          icon="↗" title={t('export_share_title')} subtitle={t('export_share_subtitle')}
          onClick={() => { void handleShareText() }}
        />
        <Hairline />
        <ExportItem
          icon="◷" title={t('export_ics_title')} subtitle={t('export_ics_subtitle')}
          onClick={() => { void handleIcs() }}
        />
        <Hairline />
        <ExportItem
          icon="★" title={t('export_native_title')} subtitle={t('export_native_subtitle')}
          onClick={() => { void handleNative() }}
        />
      </div>

      {notice && (
        <div role="status" className="m3-card" style={{
          padding: 12, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
        }}>
          {notice}
        </div>
      )}

      {pickerOpen && (
        <Picker
          tables={tables}
          currentId={table.id}
          onPick={(id) => { setExportTableId(id); setPickerOpen(false) }}
          onDismiss={() => setPickerOpen(false)}
        />
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

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        onClick={onBack}
        aria-label="back"
        style={{
          padding: '8px 12px', borderRadius: 12, border: 'none', cursor: 'pointer',
          background: 'transparent', color: 'var(--md-on-surface)', fontSize: 18,
        }}
      >
        ‹
      </button>
      <h1 className="m3-headline-medium" style={{ margin: 0 }}>{title}</h1>
    </div>
  )
}

function ExportItem({ icon, title, subtitle, onClick }: { icon: string; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: 16, width: '100%', textAlign: 'left',
        background: 'transparent', border: 'none', cursor: 'pointer',
      }}
    >
      <div
        aria-hidden
        style={{
          width: 40, height: 40, borderRadius: 12,
          background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div className="m3-body-large" style={{ fontWeight: 600 }}>{title}</div>
        <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>{subtitle}</div>
      </div>
    </button>
  )
}

function Hairline() {
  return <div style={{ height: 1, background: 'color-mix(in srgb, var(--md-outline-variant) 60%, transparent)' }} />
}

function Picker({
  tables, currentId, onPick, onDismiss,
}: {
  tables: Table[]; currentId: number; onPick: (id: number) => void; onDismiss: () => void
}) {
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
        style={{ width: '100%', maxWidth: 480, borderRadius: '16px 16px 0 0', padding: 8 }}
      >
        {tables.map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => onPick(tb.id)}
            style={{
              display: 'flex', alignItems: 'center', width: '100%', padding: '14px 12px',
              background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
              color: 'var(--md-on-surface)',
            }}
          >
            <span style={{ flex: 1 }} className="m3-body-large">{tb.name}</span>
            {tb.id === currentId && <span style={{ color: 'var(--md-primary)' }}>✓</span>}
          </button>
        ))}
      </div>
    </div>
  )
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