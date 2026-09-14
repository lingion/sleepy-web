/**
 * CustomThemeEditorView — CustomThemeEditorScreen.kt 1:1。
 *
 * 三动作区: 随机生成 / 选主色生成整套 / 逐角色手选(展开四角色行)。
 * 草稿语义: 全部改动只改内存 draft, 底部「保存」才落 customThemeStore。
 * 主色生成整套邻近色: secondary = 色相 +40°、tertiary = 色相 −40°(M3 邻近色),
 * 表面用该色相 chroma=8。删除区 errorContainer 整宽色块 → 确认对话框。
 * 取色器: web 用原生 <input type="color">(Android ColorPickerDialog 等价交互)。
 */

import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsScaffold } from './shared'
import { usePrefsStore } from '../../state/prefsStore'
import {
  CUSTOM_KEY_PREFIX,
  getAllThemes,
  getThemeById,
  newId,
  saveTheme,
  deleteTheme,
  type CustomTheme,
} from '../../data/customThemeStore'
import {
  deriveCustomScheme,
  hexAtHue,
  normalizeHue,
  parseHex,
  rgbToHsv,
  surfacePreviewHex,
} from '../../theme/customSchemeDeriver'

const ROLE_SEED_PRIMARY = 'seed_primary'
type Role = typeof ROLE_SEED_PRIMARY | 'primary' | 'secondary' | 'tertiary' | 'surface'

export function CustomThemeEditorView({
  onBack,
  editingId = null,
}: {
  onBack: () => void
  editingId?: string | null
}) {
  const { t } = useTranslation()
  const update = usePrefsStore((s) => s.update)
  const editing = editingId ? getThemeById(editingId) ?? null : null
  const isDark = typeof document !== 'undefined' && document.documentElement.dataset.mode === 'dark'

  // ── 草稿: 所有改动只动这里, 保存才落盘 ──
  const [draft, setDraft] = useState<CustomTheme>(
    () =>
      editing ?? {
        id: '',
        name: t('theme_custom_default_name', { v1: getAllThemes().length + 1 }),
        primary: '#7C4DFF',
        secondary: '#546E7A',
        tertiary: '#EF6C00',
        surfaceHue: 265,
        surfaceChroma: 8,
        createdAt: Math.floor(Date.now() / 1000),
      },
  )
  const [manualExpanded, setManualExpanded] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const colorInputRef = useRef<HTMLInputElement>(null)
  const pickingRole = useRef<Role | null>(null)

  const scheme = useMemo(() => deriveCustomScheme(draft, isDark), [draft, isDark])

  const openPicker = (role: Role) => {
    pickingRole.current = role
    const el = colorInputRef.current
    if (!el) return
    const initial =
      role === 'secondary' ? draft.secondary
      : role === 'tertiary' ? draft.tertiary
      : role === 'surface' ? surfacePreviewHex(draft.surfaceHue, draft.surfaceChroma)
      : draft.primary
    el.value = initial
    el.click()
  }

  const onPicked = (hex: string) => {
    const role = pickingRole.current
    pickingRole.current = null
    if (!role) return
    const rgb = parseHex(hex)
    const seedHue = rgb ? normalizeHue(rgbToHsv(...rgb)[0]) : 0
    if (role === 'primary') setDraft((d) => ({ ...d, primary: hex }))
    else if (role === 'secondary') setDraft((d) => ({ ...d, secondary: hex }))
    else if (role === 'tertiary') setDraft((d) => ({ ...d, tertiary: hex }))
    else if (role === 'surface') {
      // 表面中性色: 只取色相, chroma 钳回低饱和推荐区间(4-12)
      setDraft((d) => ({ ...d, surfaceHue: seedHue, surfaceChroma: Math.min(12, Math.max(4, d.surfaceChroma)) }))
    } else if (role === ROLE_SEED_PRIMARY) {
      // 选主色生成整套: secondary 色相 +40°、tertiary −40°(M3 邻近色)
      setDraft((d) => ({
        ...d,
        primary: hex,
        secondary: hexAtHue(seedHue + 40, 0.45, 0.45),
        tertiary: hexAtHue(seedHue - 40, 0.55, 0.5),
        surfaceHue: seedHue,
        surfaceChroma: 8,
      }))
    }
  }

  const randomDraft = () => {
    const r = () => Math.random() * 360
    setDraft((d) => ({
      ...d,
      primary: hexAtHue(r(), 0.7, 0.55),
      secondary: hexAtHue(r(), 0.4, 0.5),
      tertiary: hexAtHue(r(), 0.5, 0.55),
      surfaceHue: r(),
      surfaceChroma: 4 + Math.random() * 8, // 4-12 低饱和推荐区间
    }))
  }

  const onSave = () => {
    saveTheme({ ...draft, id: draft.id || newId() })
    onBack()
  }

  const onDelete = () => {
    if (!editing) return
    deleteTheme(editing.id)
    // 正在使用该主题 → 回落默认淡紫 (Android 删除后 themeKey 回落同构)
    const prefs = usePrefsStore.getState().prefs
    if (prefs.theme === CUSTOM_KEY_PREFIX + editing.id) void update({ theme: 'default' })
    onBack()
  }

  return (
    <SettingsScaffold title={editing ? t('theme_custom_edit') : t('theme_new')} onBack={onBack}>
      {/* 隐藏取色器 — 原生 color input 承接四角色 + 主色生成整套 */}
      <input
        ref={colorInputRef}
        type="color"
        onChange={(e) => onPicked(e.target.value.toUpperCase())}
        style={{ position: 'absolute', visibility: 'hidden', width: 0, height: 0 }}
        aria-hidden
      />

      {/* ── 命名 ── */}
      <input
        value={draft.name}
        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        placeholder={t('theme_custom_name_label')}
        aria-label={t('theme_custom_name_label')}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '14px 16px', borderRadius: 12,
          border: 'none', background: 'var(--md-surface-container)', color: 'var(--md-on-surface)',
          font: 'inherit', outline: 'none',
        }}
      />

      {/* ── 实时预览: 迷你课表样例(顶栏条 + 胶囊 + 卡片), 用草稿派生 scheme 渲染 ── */}
      <div className="m3-title-small" style={{ fontWeight: 600, color: 'var(--md-on-surface)' }}>{t('theme_editor_preview')}</div>
      <DraftPreview scheme={scheme} />

      {/* ── 三动作区 ── */}
      <ActionEntry icon="✦" title={t('theme_editor_random')} desc={t('theme_editor_random_desc')} onClick={randomDraft} />
      <ActionEntry icon="◐" title={t('theme_editor_from_seed')} desc={t('theme_editor_from_seed_desc')} onClick={() => openPicker(ROLE_SEED_PRIMARY)} />
      <ActionEntry icon="⚙" title={t('theme_editor_manual')} desc={t('theme_editor_manual_desc')} onClick={() => setManualExpanded((v) => !v)} />

      {/* ── 逐角色手选(展开后四个角色行) ── */}
      {manualExpanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <RoleRow title={t('theme_role_primary')} desc={t('theme_role_primary_desc')} swatch={draft.primary} onClick={() => openPicker('primary')} />
          <RoleRow title={t('theme_role_secondary')} desc={t('theme_role_secondary_desc')} swatch={draft.secondary} onClick={() => openPicker('secondary')} />
          <RoleRow title={t('theme_role_tertiary')} desc={t('theme_role_tertiary_desc')} swatch={draft.tertiary} onClick={() => openPicker('tertiary')} />
          <RoleRow title={t('theme_role_surface')} desc={t('theme_role_surface_desc')} swatch={surfacePreviewHex(draft.surfaceHue, draft.surfaceChroma)} onClick={() => openPicker('surface')} />
        </div>
      )}

      {/* ── 保存 ── */}
      <button
        onClick={onSave}
        style={{
          width: '100%', padding: '16px 0', borderRadius: 24, border: 'none', cursor: 'pointer',
          background: 'var(--md-primary)', color: 'var(--md-on-primary)', font: 'inherit', fontWeight: 600, fontSize: 16,
        }}
      >
        {t('save')}
      </button>

      {/* ── 删除区(仅微调既有主题; errorContainer 整宽色块, 禁描边) ── */}
      {editing && (
        <button
          onClick={() => setShowDeleteConfirm(true)}
          style={{
            width: '100%', padding: '12px 0', borderRadius: 20, border: 'none', cursor: 'pointer',
            background: 'var(--md-error-container)', color: 'var(--md-on-error-container)', font: 'inherit', fontWeight: 600,
          }}
        >
          🗑 {t('delete')}
        </button>
      )}

      {/* ── 删除确认 ── */}
      {showDeleteConfirm && (
        <div
          onClick={() => setShowDeleteConfirm(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--md-surface-container-high)', borderRadius: 24, padding: 24,
              maxWidth: 320, width: '100%',
            }}
          >
            <div className="m3-title-medium" style={{ color: 'var(--md-on-surface)' }}>{t('theme_editor_delete_confirm')}</div>
            <div className="m3-body-medium" style={{ marginTop: 8, color: 'var(--md-on-surface-variant)' }}>{t('theme_editor_delete_confirm_body')}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
              <button onClick={() => setShowDeleteConfirm(false)} style={dialogBtn('var(--md-primary)')}>{t('cancel')}</button>
              <button onClick={onDelete} style={dialogBtn('var(--md-error)')}>{t('delete')}</button>
            </div>
          </div>
        </div>
      )}
    </SettingsScaffold>
  )
}

function dialogBtn(color: string): React.CSSProperties {
  return { background: 'none', border: 'none', color, font: 'inherit', fontWeight: 600, fontSize: 15, padding: '8px 12px', cursor: 'pointer' }
}

/** 动作入口卡 — 图标 + 标题 + 说明, 整卡可点 (ActionEntry 同构) */
function ActionEntry({ icon, title, desc, onClick }: { icon: string; title: string; desc: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="m3-card"
      style={{
        borderRadius: 16, background: 'var(--md-surface-container)',
        display: 'flex', alignItems: 'center', gap: 12, padding: 16, cursor: 'pointer',
      }}
    >
      <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: 'var(--md-primary)', flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div className="m3-title-small" style={{ color: 'var(--md-on-surface)' }}>{title}</div>
        <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>{desc}</div>
      </div>
    </div>
  )
}

/** 角色行 — 角色名 + 说明 + 当前色块, 点击弹取色器 (RoleRow 同构) */
function RoleRow({ title, desc, swatch, onClick }: { title: string; desc: string; swatch: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
        borderRadius: 12, background: 'var(--md-surface-container)', cursor: 'pointer',
      }}
    >
      <div style={{ flex: 1 }}>
        <div className="m3-title-small" style={{ color: 'var(--md-on-surface)' }}>{title}</div>
        <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>{desc}</div>
      </div>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: swatch, flexShrink: 0 }} />
    </div>
  )
}

/** 迷你实时预览 — 顶栏条 + 当前周胶囊 + 课程卡样例, 草稿派生 scheme 渲染 (DraftPreview 同构) */
function DraftPreview({ scheme }: { scheme: ReturnType<typeof deriveCustomScheme> }) {
  const { t } = useTranslation()
  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', background: scheme.surface }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: scheme.surfaceContainer, padding: '8px 12px' }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: scheme.primary }} />
        <span className="m3-label-large" style={{ color: scheme.onSurface }}>{t('theme_editor_preview')}</span>
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ alignSelf: 'flex-start', borderRadius: 999, background: scheme.primary, padding: '4px 12px' }}>
          <span className="m3-label-medium" style={{ color: scheme.onPrimary }}>{t('schedule_week_prefix', { v1: 8, defaultValue: '' })}</span>
        </div>
        <div style={{ borderRadius: 12, background: scheme.secondaryContainer, padding: 10 }}>
          <div className="m3-title-small" style={{ color: scheme.onSecondaryContainer }}>{t('theme_editor_preview_card_title')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span style={{ borderRadius: 999, background: scheme.tertiary, color: scheme.onTertiary, padding: '1px 8px', fontSize: 11 }}>1-2</span>
            <span className="m3-body-small" style={{ color: scheme.onSecondaryContainer }}>{t('theme_editor_preview_card_room')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
