/**
 * GeneralSettingsPage — 通用设置 (GeneralSettingsScreen.kt 1:1)。从 MineView.tsx 拆出。
 * 通用设置保留语言、性能和编辑；完整备份使用独立页面。语言浮层退出后才切换语言。
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePrefsStore } from '../../state/prefsStore'
import { IconChevronRight } from '../../components/icons'
import { AlertDialog, TextButton } from '../../components/AlertDialog'
import { LanguageMenu } from './LanguageMenu'
import { exportBackup, importBackup, backupFileName, EXPORTABLE_MODULES } from '../../domain/migration/backupExecutor'
import {
  SettingsScaffold, SectionHeader, FlatCard, HDiv, Switch,
} from './shared'

const TOAST_SHORT_MS = 2000
const TOAST_LONG_MS = 3500

/**
 * 实验室: 多步撤回深度输入 (ref sleepy#240, GeneralSettingsScreen 同款) —
 * 过滤 `^-?\d{0,6}$`; 空/半截负号忽略; 解析失败(溢出)不落库; 落库即 applyMaxDepth (prefsStore 副作用)。
 */
function UndoDepthRow() {
  const { t } = useTranslation()
  const undoDepth = usePrefsStore((s) => s.prefs.undoDepth)
  const update = usePrefsStore((s) => s.update)
  const [draft, setDraft] = useState(String(undoDepth))
  useEffect(() => setDraft(String(undoDepth)), [undoDepth])
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
      <span className="m3-body-large" style={{ flex: 1, color: 'var(--md-on-surface)' }}>{t('settings_undo_depth')}</span>
      <input
        aria-label={t('settings_undo_depth')}
        inputMode="numeric"
        value={draft}
        onChange={(e) => {
          const raw = e.target.value
          if (!/^\d{0,6}$/.test(raw)) return
          setDraft(raw)
          const v = raw === '' ? null : Number.parseInt(raw, 10)
          if (v !== null && v > 0 && Number.isSafeInteger(v)) void update({ undoDepth: v })
        }}
        style={{
          width: 90, flexShrink: 0, boxSizing: 'border-box', height: 40, padding: '0 12px',
          borderRadius: 8, border: '1px solid var(--md-outline-variant)', background: 'var(--md-surface-container-low)',
          color: 'var(--md-on-surface)', font: 'inherit', textAlign: 'center',
        }}
      />
    </div>
  )
}

export function GeneralSettingsPage({ onBack, backupOnly = false }: { onBack: () => void; onOpenHoliday?: () => void; backupOnly?: boolean }) {
  const { t } = useTranslation()
  const prefs = usePrefsStore((s) => s.prefs)
  const update = usePrefsStore((s) => s.update)

  const [toast, setToast] = useState('')
  const toastTimer = useRef<number | undefined>(undefined)
  function showToast(msg: string, ms: number) {
    window.clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = window.setTimeout(() => setToast(''), ms)
  }
  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  // 分组⑥ 数据迁移 (GeneralSettingsScreen.kt:155-246 1:1): 导出 = 组包直接下载,
  // 导入 = 文件 → 校验 → 覆盖/合并三键 AlertDialog。
  const importInputRef = useRef<HTMLInputElement>(null)
  const [pendingImport, setPendingImport] = useState<Uint8Array | null>(null)
  const [busy, setBusy] = useState(false)

  async function onMigrationExport() {
    if (busy) return
    setBusy(true)
    try {
      const { bytes } = await exportBackup(EXPORTABLE_MODULES)
      const fileName = backupFileName()
      const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/zip' }))
      try {
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        a.remove()
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      showToast(t('settings_migration_export_ok'), TOAST_SHORT_MS)
    } catch {
      showToast(t('settings_migration_export_fail'), TOAST_LONG_MS)
    } finally {
      setBusy(false)
    }
  }

  function onMigrationFile(file: File) {
    file.arrayBuffer()
      // 先完整校验 (assemblePackage 在 importBackup 内), 坏包不落数据 → 弹三键确认
      .then((buf) => setPendingImport(new Uint8Array(buf)))
      .catch(() => showToast(t('settings_migration_import_fail'), TOAST_LONG_MS))
  }

  async function runMigrationImport(mode: 'OVERWRITE' | 'MERGE') {
    const bytes = pendingImport
    setPendingImport(null)
    if (!bytes) return
    setBusy(true)
    try {
      const report = await importBackup(bytes, mode)
      showToast(t('settings_migration_import_done', { v1: report.counts.timeTables, v2: report.counts.courses }), TOAST_LONG_MS)
    } catch {
      showToast(t('settings_migration_import_fail'), TOAST_LONG_MS)
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsScaffold title={backupOnly ? t('settings_backup', '备份') : t('mine_general')} onBack={onBack}>
      {backupOnly ? <>
      {/* ── 分组⑥ 数据迁移 ── */}
      <SectionHeader title={t('settings_migration')} />
      <div className="m3-label-small" style={{ paddingBottom: 8, color: 'var(--md-on-surface-variant)' }}>
        {t('settings_migration_sub')}
      </div>
      <div style={{ borderRadius: 16, overflow: 'hidden', background: 'var(--md-surface-container)' }}>
        <MigrationRow
          title={t('settings_migration_export')}
          subtitle={t('settings_migration_export_sub')}
          busy={busy}
          onClick={() => { void onMigrationExport() }}
        />
        <HDiv />
        <MigrationRow
          title={t('settings_migration_import')}
          subtitle={t('settings_migration_import_sub')}
          busy={busy}
          onClick={() => { if (!busy) importInputRef.current?.click() }}
        />
      </div>
      <input
        ref={importInputRef}
        type="file"
        accept=".sleepybackup,application/zip,application/octet-stream"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onMigrationFile(f)
          e.target.value = ''
        }}
      />

      </> : <>
      <SectionHeader title={t('settings_language')} />
      <LanguageMenu lang={prefs.lang} onChange={(code) => void update({ lang: code })} />
      <SectionHeader title={t('settings_performance', '性能')} />
      <SingleToggleCard title={t('settings_high_refresh')} subtitle={t('web_high_refresh_unavailable')} checked={prefs.highRefresh} onChange={(v) => void update({ highRefresh: v })} />
      <SectionHeader title={t('settings_editing', '编辑')} />
      <div style={{ padding: 16, borderRadius: 16, background: 'var(--md-surface-container)' }}>
        <FlatCard title={t('settings_undo_mode', '撤回模式')} options={[t('settings_undo_off', '关闭'), t('settings_undo_limited', '有限'), t('settings_undo_unlimited', '无限')]} selectedKey={prefs.undoDepth === 0 ? 0 : prefs.undoDepth < 0 ? 2 : 1} onSelect={(i) => void update({ undoDepth: i === 0 ? 0 : i === 2 ? -1 : 5 })} />
        {prefs.undoDepth > 0 && <UndoDepthRow />}
      </div>
      </>}
      {pendingImport && (
        <AlertDialog
          title={t('settings_migration_import_dialog_title')}
          onDismiss={() => setPendingImport(null)}
          buttons={
            <>
              <TextButton label={t('cancel')} onClick={() => setPendingImport(null)} />
              <span style={{ display: 'flex' }}>
                <TextButton label={t('settings_migration_import_overwrite')} onClick={() => { void runMigrationImport('OVERWRITE') }} />
                <TextButton label={t('settings_migration_import_merge')} onClick={() => { void runMigrationImport('MERGE') }} />
              </span>
            </>
          }
        >
          {t('settings_migration_import_dialog_text')}
        </AlertDialog>
      )}

      {toast !== '' && (
        <div
          role="status"
          className="m3-body-medium"
          style={{
            position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
            zIndex: 1100, maxWidth: 'calc(100vw - 32px)', padding: '10px 16px', borderRadius: 8,
            background: 'var(--md-inverse-surface, var(--md-surface-container-highest))',
            color: 'var(--md-inverse-on-surface, var(--md-on-surface))',
          }}
        >
          {toast}
        </div>
      )}
    </SettingsScaffold>
  )
}

/** 单行开关卡 — Switch heightIn(max=32) 锁回本体高, 与折叠卡收起态等高 */
export function SingleToggleCard({ title, subtitle, checked, onChange }: { title: string; subtitle?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 16, background: 'var(--md-surface-container)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="m3-title-small" style={{ fontWeight: 600, color: 'var(--md-on-surface)' }}>{title}</div>
        {subtitle && <div className="m3-body-small" style={{ marginTop: 2, color: 'var(--md-on-surface-variant)' }}>{subtitle}</div>}
      </div>
      <Switch checked={checked} onChange={onChange} compact />
    </div>
  )
}

/** 二级页入口行 — 仅标题 titleSmall + ChevronRight 20 */
export function EntryRow({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      style={{
        display: 'flex', alignItems: 'center', padding: '14px 16px', borderRadius: 16, cursor: 'pointer',
        background: 'var(--md-surface-container)', color: 'var(--md-on-surface)',
      }}
    >
      <span className="m3-title-small" style={{ flex: 1, minWidth: 0 }}>{title}</span>
      <span style={{ display: 'inline-flex', color: 'var(--md-on-surface-variant)' }}>
        <IconChevronRight size={20} />
      </span>
    </div>
  )
}

function MigrationRow({ title, subtitle, busy, onClick }: { title: string; subtitle: string; busy: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', padding: 16, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="m3-title-medium" style={{ fontWeight: 600, color: 'var(--md-on-surface)' }}>{title}</div>
        <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>{subtitle}</div>
      </div>
      <span style={{ display: 'inline-flex', color: 'var(--md-on-surface-variant)' }}>
        <IconChevronRight size={24} />
      </span>
    </div>
  )
}
