/**
 * TodayView — 今日 tab (TodayScreen.kt 1:1)
 * TodayHeader (日期+周次/学期状态 chip) + EmptyToday 三分支 + 冲突分栏课程卡。
 * 学期外感知: BEFORE_START/AFTER_END 时今日课不按周过滤展示。
 * 课程卡点击 → CourseDetailSheet (与课表页同一组件同一交互, TodayScreen.kt:162-173)。
 */

import { useEffect,useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconSchedule } from '../components/icons'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { usePrefsStore, resolveIsDark } from '../state/prefsStore'
import { courseNeutralTokens } from '../theme/themes'
import { weekLaneRows } from '../domain/conflictLayout'
import { courseTimeString } from '../domain/timeTable'
import { pickCourseColorWithGroupRows, textColorOn, parseHex } from '../domain/courseColor'
import { normalizeNode, hydratedWith } from '../data/types'
import type { Course } from '../data/types'
import { localizedDay } from '../components/schedule/CardsGridView'
import { getHolidayTransfers, useHolidayStore } from '../state/holidayStore'
import { coursesForDate,courseDateForDate,weekOfDate } from '../domain/courseOccurrence'
import { CourseDetailSheet } from '../components/CourseDetailSheet'
import { AddCourseView } from './AddCourseView'
import {validateTimeJson,periodValidationMessage} from '../domain/periodValidation'
import {useOccurrenceActions} from '../components/schedule/useOccurrenceActions'
import {installBackHandler,useBackStack} from '../state/backStack'

// 学期三态/周次纯函数提取至 domain/semester (提醒引擎共用单一实现); re-export 保持
// 既有消费方 (semesterStatus.test.ts 等) 的 import 路径不变。
import { semesterStatus, currentWeek, type SemesterStatus } from '../domain/semester'

export { semesterStatus }

/** zh-TW 繁体星期名 (values-zh-rTW/strings.xml day_names) — localizedDay 共享函数 zh 一律简体, 此处细分 */
const DAY_NAMES_ZH_TW = ['週一', '週二', '週三', '週四', '週五', '週六', '週日']

function dayName(day: number, lang: string): string {
  if (lang === 'zh-TW') return DAY_NAMES_ZH_TW[day - 1]
  return localizedDay(day, lang)
}

export function TodayView({ navExtraBottom = 0 }: { navExtraBottom?: number }) {
  const { t, i18n } = useTranslation()
  const prefs = usePrefsStore((s) => s.prefs)
  const [detailCourse, setDetailCourse] = useState<Course | null>(null)
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)

  const defaultTable = useLiveQuery(async () => { const table = await db.timetables.where('isDefault').equals(1).first(); return table ? hydratedWith(table, table.periodTableId ? await db.periodTables.get(table.periodTableId) : null) : undefined })
  const transferRevision = useHolidayStore((s) => s.transferRevision)
  const defaultTableId = defaultTable?.id ?? null
  // transferRevision 仅作重读信号: 调休页写 localStorage 后递增
  const holidayTransfers = useMemo(() => getHolidayTransfers(defaultTableId), [defaultTableId, transferRevision])
  const [today,setToday]=useState(()=>new Date())
  useEffect(()=>{const id=setInterval(()=>setToday(new Date()),60000);return ()=>clearInterval(id)},[])
  const todayIso=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
  const sourceDate=courseDateForDate(todayIso,holidayTransfers) ?? todayIso
  const sourceDay=useMemo(()=>new Date(`${sourceDate}T12:00:00`),[sourceDate])
  const occurrenceActions=useOccurrenceActions(defaultTable)
  const push=useBackStack((state)=>state.push),back=useBackStack((state)=>state.pop)
  useEffect(()=>installBackHandler((key)=>{if(key==='courseDetail')setDetailCourse(null);else if(key==='addCourse')setEditingCourse(null)}),[])
  const showDetail=(course:Course)=>{push('courseDetail','#/今日/课程详情');setDetailCourse(course)}
  const allCourses = useLiveQuery(
    async () =>
      defaultTable ? await db.courses.where('tableId').equals(defaultTable.id).toArray() : ([] as Course[]),
    [defaultTable?.id]
  )

  const status = useMemo(
    () => semesterStatus(defaultTable?.startDate ?? '', defaultTable?.maxWeek ?? 20, sourceDay),
    [defaultTable?.startDate, defaultTable?.maxWeek, sourceDay]
  )
  const actualWeek = useMemo(
    () => (defaultTable?.startDate ? currentWeek(defaultTable.startDate, sourceDay) : 1),
    [defaultTable?.startDate, sourceDay]
  )

  const todayCourses=useMemo(()=>{
    const list=coursesForDate(todayIso,defaultTable?.startDate ?? '',defaultTable?.maxWeek ?? 20,allCourses ?? [],holidayTransfers)
    return list.map(course=>defaultTable?.timeJson ? normalizeNode(course,defaultTable.timeJson) : course).sort((a,b)=>a.startNode-b.startNode)
  },[allCourses,defaultTable,holidayTransfers,todayIso])
  const periodValidation=defaultTable ? validateTimeJson(defaultTable.timeJson) : null

  const laneRows = useMemo(
    () => weekLaneRows(todayCourses, defaultTable?.timeJson ?? null),
    [todayCourses, defaultTable?.timeJson]
  )

  // 悬浮胶囊形态 (web navDock=true = App.tsx 悬浮胶囊 overlay) 尾部留 Dock 总高,
  // 最后一张卡能滚出胶囊条 (TodayScreen.kt:91-99 bottom = 16dp + NavDockSpec 总高)。
  // App 测的实测 dockExtra + 12px 安全间隙 传入 (MainActivity dockOverlayPx 同构);
  // 贴底形态栏已在 App 层占空间, 此处无需加底距。
  const paddingBottom = prefs.navDock ? 16 + navExtraBottom : 16

  // 编辑课程全屏页 (Android onEditCourse → AddCourseScreen)
  if (editingCourse) {
    return (
      <AddCourseView
        editingCourse={editingCourse}
        onBack={() => {back();setEditingCourse(null)}}
        onSaved={() => {back();setEditingCourse(null)}}
      />
    )
  }

  return (
    <div style={{ padding: 16, paddingBottom, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <TodayHeader
        date={today}
        week={actualWeek}
        count={todayCourses.length}
        semesterStatus={status}
        lang={i18n.language}
      />
      {periodValidation && periodValidation.kind!=='valid' && <div role="alert" style={{padding:14,borderRadius:16,background:'var(--md-error-container)',color:'var(--md-on-error-container)',display:'flex',gap:10,alignItems:'center'}}><IconSchedule size={20}/><span className="m3-body-small">{t('period_conflict_detected_banner',{v1:periodValidationMessage(periodValidation,(key,options)=>t(key,options)),defaultValue:`节次时间存在冲突：${periodValidationMessage(periodValidation,(key,options)=>t(key,options))}`})}</span></div>}
      {todayCourses.length === 0 ? (
        <EmptyToday semesterStatus={status} />
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="m3-title-medium" style={{ fontSize: 15, lineHeight: '22px', fontWeight: 500 }}>
              {t('widget_today_label')}
            </span>
            <span
              className="m3-label-medium"
              style={{ fontSize: 10, lineHeight: '14px', fontWeight: 500, color: 'var(--md-primary)' }}
            >
              {t('n_periods', { v1: todayCourses.length })}
            </span>
          </div>
          {laneRows.map((row, ri) => {
            if (row.laneCount === 1) {
              const c = row.courses[0]
              return (
                <TodayCourseCard
                  key={`r-${ri}`}
                  course={c}
                  timeJson={defaultTable?.timeJson}
                  groupRows={todayCourses.filter((x) => x.groupId === c.groupId)}
                  onClick={() => showDetail(c)}
                />
              )
            }
            return (
              <div key={`rc-${ri}`} style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                {Array.from({ length: row.laneCount }, (_, li) => (
                  <div key={li} style={{ display: 'flex', flex: 1, gap: 6 }}>
                    {li > 0 && (
                      <div
                        style={{
                          width: 0.5,
                          background: 'color-mix(in srgb, var(--md-on-surface) 30%, transparent)',
                          alignSelf: 'stretch',
                        }}
                      />
                    )}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {row.courses
                        .filter((c) => row.laneOf.get(c.id) === li)
                        .map((c) => (
                          <TodayCourseCard
                            key={c.id}
                            course={c}
                            timeJson={defaultTable?.timeJson}
                            groupRows={todayCourses.filter((x) => x.groupId === c.groupId)}
                            onClick={() => showDetail(c)}
                          />
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </>
      )}

      {occurrenceActions.overlays}

      {/* 课程详情弹层 — 与课表页同一组件同一交互 (TodayScreen.kt:162-173) */}
      {detailCourse && defaultTable && (
        <CourseDetailSheet
          course={detailCourse}
          timeString={
            detailCourse.ownTime && detailCourse.startTime && detailCourse.endTime
              ? `${detailCourse.startTime}-${detailCourse.endTime}`
              : t('course_node_format', {
                  v1: `${detailCourse.startNode}-${detailCourse.startNode + detailCourse.step - 1}`,
                })
          }
          allCourses={todayCourses}
          timeJson={defaultTable.timeJson}
          onDismiss={() => {back();setDetailCourse(null)}}
          onAdjustOccurrence={(course)=>{setDetailCourse(null);void occurrenceActions.openEdit({...course,day:today.getDay()||7},weekOfDate(defaultTable.startDate,todayIso),true)}}
          onDeleteOccurrence={(course)=>{void occurrenceActions.remove({...course,day:today.getDay()||7},weekOfDate(defaultTable.startDate,todayIso)).then((saved)=>{if(saved){back();setDetailCourse(null)}})}}
          onEdit={(c) => {
            useBackStack.getState().replace('addCourse','#/今日/编辑课程')
            setDetailCourse(null)
            setEditingCourse(c)
          }}
        />
      )}
    </div>
  )
}

function TodayHeader({
  date,
  week,
  count,
  semesterStatus,
  lang,
}: {
  date: Date
  week: number
  count: number
  semesterStatus: SemesterStatus
  lang: string
}) {
  const { t } = useTranslation()
  return (
    <div
      style={{
        borderRadius: 16,
        background: 'var(--md-surface-container)',
        padding: 16,
      }}
    >
      <span className="m3-label-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
        {t('today_today')}
      </span>
      <div style={{ height: 6 }} />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        {/* 日期字号 — TodayScreen.kt:200 headlineMedium (Material 基准 28/36, global.css token 同值) */}
        <span className="m3-headline-medium" style={{ fontWeight: 400 }}>
          {t('date_long_format', { v1: date.getMonth() + 1, v2: date.getDate() })}
        </span>
        <span
          className="m3-title-medium"
          style={{ color: 'var(--md-on-surface-variant)', paddingBottom: 4 }}
        >
          {dayName(date.getDay() === 0 ? 7 : date.getDay(), lang)}
        </span>
      </div>
      <div style={{ height: 8 }} />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {semesterStatus === 'BEFORE_START' ? (
          <Stat label={t('semester_not_started')} bg="var(--md-secondary-container)" fg="var(--md-on-secondary-container)" />
        ) : semesterStatus === 'AFTER_END' ? (
          <Stat label={t('semester_ended')} bg="var(--md-secondary-container)" fg="var(--md-on-secondary-container)" />
        ) : (
          <Stat label={t('schedule_current_week', { v1: week })} bg="var(--md-primary-container)" fg="var(--md-on-primary-container)" />
        )}
        <Stat
          label={count === 0 ? t('no_course') : t('n_course_periods', { v1: count })}
          bg="var(--md-tertiary-container)"
          fg="var(--md-on-tertiary-container)"
        />
      </div>
    </div>
  )
}

function Stat({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <span
      className="m3-label-medium"
      style={{
        fontWeight: 500,
        color: fg,
        background: bg,
        borderRadius: 12,
        padding: '6px 12px',
      }}
    >
      {label}
    </span>
  )
}

function EmptyToday({ semesterStatus }: { semesterStatus: SemesterStatus }) {
  const { t } = useTranslation()
  return (
    <div
      style={{
        borderRadius: 16,
        background: 'var(--md-surface-container)',
        padding: 32,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        textAlign: 'center',
      }}
    >
      <span style={{ lineHeight: 0 }}>
        <IconSchedule size={48} color="var(--md-on-surface-variant)" />
      </span>
      {semesterStatus === 'BEFORE_START' ? (
        <>
          <span className="m3-title-medium">{t('semester_not_started')}</span>
          <span className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
            {t('today_semester_out_hint')}
          </span>
        </>
      ) : semesterStatus === 'AFTER_END' ? (
        <>
          <span className="m3-title-medium">{t('semester_ended')}</span>
          <span className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
            {t('today_semester_out_hint')}
          </span>
        </>
      ) : (
        <>
          <span className="m3-title-medium">{t('schedule_no_course_today')}</span>
          <span className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
            {t('today_no_course')}
          </span>
        </>
      )}
    </div>
  )
}

export function TodayCourseCard({
  course,
  timeJson,
  groupRows,
  onClick,
}: {
  course: Course
  timeJson?: string
  groupRows: Course[]
  onClick?: () => void
}) {
  const { t } = useTranslation()
  const prefs = usePrefsStore((s) => s.prefs)
  // themeMode='system' 分支 (TodayScreen.kt:315 isPaletteDark 随当前生效主题)
  const isDark = resolveIsDark(prefs)
  // neutral/onSurface 取当前生效主题 token — Android 权威源 = secondaryContainer/onSurface
  // (TodayScreen.kt:424 colors.secondaryContainer); 单一事实来源 courseNeutralTokens, 勿再内联
  const tokens = useMemo(() => courseNeutralTokens(isDark), [isDark, prefs.theme])
  const bg = pickCourseColorWithGroupRows(course, groupRows, isDark, tokens.neutral, prefs.courseColorless)
  const fgRgb = textColorOn(parseHex(bg) ?? [0, 0, 0], isDark, parseHex(tokens.onSurface) ?? [0, 0, 0])
  const fg = '#' + fgRgb.map((v) => v.toString(16).padStart(2, '0')).join('')
  const time =
    course.ownTime && course.startTime && course.endTime
      ? `${course.startTime}-${course.endTime}`
      : timeJson
        ? courseTimeString(course.startNode, course.step, timeJson)
        : null
  const nodeLabel =
    course.ownTime && course.startTime && course.endTime
      ? `${course.startTime}-${course.endTime}`
      : t('course_period_range', { v1: course.startNode, v2: course.startNode + course.step - 1 })

  const meta = [course.teacher, course.room].filter(Boolean).join(' · ')

  return (
    <div
      onClick={onClick}
      style={{
        borderRadius: 16,
        background: bg,
        padding: 12,
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        cursor: onClick ? 'pointer' : undefined,
      }}
    >
      {/* 时间槽 — 固定 76dp 避免截断 */}
      <div style={{ width: 76, flexShrink: 0 }}>
        <div className="m3-title-medium" style={{ fontWeight: 700, color: fg }}>
          {nodeLabel}
        </div>
        {time && (
          <div className="m3-label-small" style={{ color: fg, opacity: 0.8, whiteSpace: 'nowrap' }}>
            {time}
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="m3-title-medium"
          style={{
            fontWeight: 600,
            color: fg,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {course.courseName}
        </div>
        {meta && (
          <>
            <div style={{ height: 4 }} />
            <div className="m3-body-medium" style={{ color: fg, opacity: 0.8, fontSize: 12, lineHeight: '16px' }}>
              {meta}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
