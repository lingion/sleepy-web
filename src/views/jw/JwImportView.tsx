/**
 * JwImportView — 教务导入 (#/管理/教务导入), 入口在管理页导入方式表。
 * ui/screen/imports/JwImportActivity.kt 状态机的 web 移植。
 *
 *   selectSchool ──选学校/直接输 URL──▶ capture ──拿到 HTML 解析>0 课──▶ configureConfirm
 *        ▲                                ▲                                    │
 *        └──────────── 返回 ──────────────┴──────────── 返回 ───────────────────┘
 *
 * 与 Android 一致的关键行为:
 *  · 换 stage 必清 errorMsg (错误浮层不跨阶段残留)
 *  · 解析 0 门 → 先 statusMsg=解析中, 再弹诊断浮层 (DiagMapper)
 *  · 解析抛异常 → jw_parse_failed + jw_parse_failed_hint
 *  · 落库成功 → jw_import_success 反馈页
 * 纯逻辑 (裁决/校验/文案映射/落库映射) 全在 importFlow.ts, 本文件只做编排。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { JwCourse } from '../../domain/jw/jwCourse'
import { DEFAULT_TIME_JSON } from '../../domain/timeTable'
import { normalizeStartDateToMonday } from '../importExportUtils'
import { useUndoStore } from '../../data/undoStore'
import {
  getDefaultTable,
  getTable,
  insertCourses,
  insertTable,
  observeAllTables,
  setDefault,
  updateTable,
} from '../../data/repository'
import type { Table } from '../../data/types'
import { IconCheckCircle, IconInfo } from '../../components/icons'
import { SettingsScaffold } from '../mine/shared'
import {
  buildDiagMessage,
  buildParseFailedMessage,
  captureFailureMessage,
  maxNodeOf,
  maxWeekOf,
  resolveCapture,
  rowsFromMaxNode,
  toCourseEntities,
  type JwStage,
} from './importFlow'
import { defaultProxyFetcher, type FetchOutcome, type ProxyFetcher } from './proxyClient'
import { isSelectable, type SchoolInfo } from './schools'
import { SchoolSelectPage, urlPickToSchool } from './SchoolSelectPage'
import { JwCapturePage } from './JwCapturePage'
import { JwCourseConfirmPage, type ConfirmResult } from './JwCourseConfirmPage'

export function JwImportView({
  onBack,
  fetcher = defaultProxyFetcher,
}: {
  onBack: () => void
  /** 抓取实现注入点;测试里传 mock, 绝不真连教务站 */
  fetcher?: ProxyFetcher
}) {
  const { t } = useTranslation()

  const [stage, setStage] = useState<JwStage>('selectSchool')
  const [school, setSchool] = useState<SchoolInfo | null>(null)
  const [courses, setCourses] = useState<JwCourse[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [savedCount, setSavedCount] = useState<number | null>(null)
  const [tables, setTables] = useState<Table[]>([])
  const [defaultStartDate, setDefaultStartDate] = useState(() =>
    normalizeStartDateToMonday(new Date().toISOString().slice(0, 10))
  )

  // 换阶段必清错误 (Android: LaunchedEffect(stage) { errorMsg = null })
  useEffect(() => {
    setErrorMsg(null)
  }, [stage])

  // snackbar 自动消失
  useEffect(() => {
    if (!statusMsg) return
    const timer = setTimeout(() => setStatusMsg(null), 3000)
    return () => clearTimeout(timer)
  }, [statusMsg])

  // 进确认页要用的课表列表 / 默认起始日 (现有课表的开学日优先, 更贴近用户习惯)
  useEffect(() => {
    let alive = true
    void (async () => {
      const all = await observeAllTables()
      if (!alive) return
      setTables(all)
      const def = all.find((x) => x.isDefault === 1) ?? (await getDefaultTable())
      if (alive && def?.startDate) setDefaultStartDate(normalizeStartDateToMonday(def.startDate))
    })()
    return () => {
      alive = false
    }
  }, [])

  const title = useMemo(() => {
    if (stage === 'selectSchool') return t('select_school')
    if (stage === 'capture') return t('jw_import_title', { v1: school?.name ?? '' })
    return t('jw_config_title')
  }, [stage, school, t])

  /** 选学校 — 没配 URL 的学校不给进抓取页 (Android: jw_no_url) */
  const pickSchool = useCallback(
    (s: SchoolInfo) => {
      if (s.url.trim() === '' || !isSelectable(s)) {
        setErrorMsg(t('jw_no_url'))
        return
      }
      setSchool(s)
      setStage('capture')
    },
    [t]
  )

  const pickUrl = useCallback((url: Parameters<typeof urlPickToSchool>[0]) => {
    setSchool(urlPickToSchool(url))
    setStage('capture')
  }, [])

  /** 一段 HTML → 课程 / 诊断 / 异常 (Android onParseHtml 分支) */
  const handleHtml = useCallback(
    (html: string) => {
      setStatusMsg(t('import_parsing'))
      const outcome = resolveCapture(html, school)
      if (outcome.kind === 'failed') {
        setErrorMsg(buildParseFailedMessage(outcome.message, t))
        return
      }
      if (outcome.kind === 'empty') {
        setErrorMsg(buildDiagMessage(outcome.diag, school, t))
        return
      }
      setCourses(outcome.courses)
      setStage('configureConfirm')
    },
    [school, t]
  )

  const handleFetchError = useCallback(
    (outcome: Extract<FetchOutcome, { ok: false }>) => {
      setErrorMsg(captureFailureMessage(outcome, t))
    },
    [t]
  )

  /** 唯一写库点 (Android importAsNewTable + 现有课表追加分支), 复合动作批边界包裹 */
  async function handleConfirm(result: ConfirmResult) {
    const undo = useUndoStore.getState()
    setStatusMsg(t('import_parsing'))
    undo.beginBatch()
    try {
      const startDate = normalizeStartDateToMonday(result.startDate)
      const timeJson = result.timeJson || DEFAULT_TIME_JSON
      const nodeCount = Math.max(1, maxNodeOf(result.courses))
      const maxWeek = Math.max(1, maxWeekOf(result.courses))
      let targetId = result.tableId

      if (targetId === null) {
        targetId = await insertTable({
          name: result.tableName || t('jw_imported_table_default'),
          timeJson,
          smartConfigJson: '',
          isDefault: 1,
          startDate,
          nodeCount,
          maxWeek,
          createdAt: Date.now(),
        })
        await insertCourses(toCourseEntities(result.courses, targetId))
        await setDefault(targetId)
      } else {
        const existing = await getTable(targetId)
        if (existing) {
          await updateTable({
            ...existing,
            timeJson,
            nodeCount: Math.max(existing.nodeCount, nodeCount),
            maxWeek: Math.max(existing.maxWeek, maxWeek),
          })
        }
        await insertCourses(toCourseEntities(result.courses, targetId))
      }
      setSavedCount(result.courses.length)
      setStatusMsg(t('jw_import_success', { v1: result.courses.length }))
    } catch (e) {
      setErrorMsg(t('import_failed', { v1: e instanceof Error ? e.message : String(e) }))
      setStage('configureConfirm')
    } finally {
      undo.endBatch()
    }
  }

  /** 逐级返回 (Android onBackPressed) */
  function handleBack() {
    if (stage === 'configureConfirm') {
      setCourses([])
      setStage('capture')
      return
    }
    if (stage === 'capture') {
      setSchool(null)
      setStage('selectSchool')
      return
    }
    onBack()
  }

  function dismissError() {
    setErrorMsg(null)
    if (stage === 'configureConfirm' && courses.length === 0) setStage('capture')
  }

  return (
    <SettingsScaffold title={title} onBack={handleBack}>
      {savedCount !== null ? (
        <SuccessPanel count={savedCount} onDone={onBack} />
      ) : stage === 'selectSchool' ? (
        <SchoolSelectPage onPickSchool={pickSchool} onPickUrl={pickUrl} />
      ) : stage === 'capture' ? (
        school && (
          <JwCapturePage
            school={school}
            fetcher={fetcher}
            onHtml={handleHtml}
            onFetchError={handleFetchError}
          />
        )
      ) : (
        <JwCourseConfirmPage
          courses={courses}
          schoolName={school?.name ?? ''}
          tables={tables}
          defaultStartDate={defaultStartDate}
          defaultRows={rowsFromMaxNode(maxNodeOf(courses))}
          onConfirm={(r) => void handleConfirm(r)}
          onBack={handleBack}
        />
      )}

      {errorMsg !== null && <ErrorOverlay message={errorMsg} onDismiss={dismissError} />}
      {statusMsg !== null && <Snackbar message={statusMsg} />}
    </SettingsScaffold>
  )
}

// ── 错误浮层 (Android ErrorOverlay: errorContainer 卡 + 知道了) ──────────

function ErrorOverlay({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const { t } = useTranslation()
  return (
    <div
      className="m3-scrim-overlay"
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'color-mix(in srgb, var(--md-scrim) 45%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
      onClick={onDismiss}
    >
      <div
        role="alertdialog"
        aria-label={t('jw_err_dismiss')}
        className="m3-card"
        style={{
          maxWidth: 420, width: '100%', padding: 16,
          background: 'var(--md-error-container)', color: 'var(--md-on-error-container)',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', gap: 10 }}>
          <IconInfo size={20} />
          <div className="m3-body-medium" style={{ whiteSpace: 'pre-wrap', flex: 1 }}>{message}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="m3-btn-regular"
            onClick={onDismiss}
            style={{ border: 'none', background: 'transparent', color: 'var(--md-primary)', cursor: 'pointer', font: 'inherit' }}
          >
            {t('jw_err_dismiss')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** 底部 snackbar (Android statusMsg → SnackbarHost) */
function Snackbar({ message }: { message: string }) {
  return (
    <div
      role="status"
      style={{
        position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 70,
        maxWidth: '86vw', padding: '10px 16px', borderRadius: 8,
        background: 'var(--md-inverse-surface)', color: 'var(--md-inverse-on-surface)',
      }}
      className="m3-body-medium"
    >
      {message}
    </div>
  )
}

/** 落库成功反馈页 (Android: snackbar + finish(), web 需留在页内给明确回执) */
function SuccessPanel({ count, onDone }: { count: number; onDone: () => void }) {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', padding: '32px 0' }}>
      <div
        style={{
          width: 64, height: 64, borderRadius: 32,
          background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <IconCheckCircle size={32} />
      </div>
      <div className="m3-title-medium" style={{ color: 'var(--md-on-surface)' }}>
        {t('jw_import_success', { v1: count })}
      </div>
      <button type="button" className="m3-btn-cta" onClick={onDone}>
        {t('ok')}
      </button>
    </div>
  )
}
