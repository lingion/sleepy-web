/**
 * ReminderPage — 提醒 (ReminderScreen.kt 581 行 1:1)。
 * 分区顺序与 Android 完全一致:
 *   ① master 卡 (IconBox.Notifications) → 仅 master 开时展开
 *   ② 每日提醒卡 (AccessTime): 开关 → 时间选择行 → 每日示例预览
 *   ③ 每节课前提醒卡 (School): 开关 → 提前分钟输入 → 课前示例预览 → 横幅提醒 → 流体云/超级岛 → 胶囊主显示内容
 * 依赖链 (Android `if (masterEnabled)` 嵌套): master 关 → ②③ 整卡隐藏;
 *   daily 关 → 时间行/预览隐藏; beforeClass 关 → 分钟/预览/横幅/流体云隐藏; fluid 关 → 胶囊字段隐藏。
 * Web 差异 (仅两处, 其余逐行对齐):
 *   · Android POST_NOTIFICATIONS 权限 launcher → Notification.requestPermission(), 拒绝则开关回弹;
 *   · Material3 TimePicker 表盘弹窗 → <input type="time">, 仍保留 取消/确认 双按钮 (确认才落库)。
 */

import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { IconExpandMore, IconNotifications, IconSchedule, IconSchool } from '../../components/icons'
import { SettingsScaffold, Switch } from './shared'
import {
  FLUID_PRIMARY_OPTIONS,
  MINUTES_DEBOUNCE_MS,
  commitMinutesInput,
  filterMinutesInput,
  fluidPrimaryLabelKey,
  isHHmm,
  reminderVisibility,
  useReminderStore,
  type FluidPrimary,
} from '../../state/reminderStore'

type NotifyState = 'unsupported' | NotificationPermission

export function ReminderPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const prefs = useReminderStore((s) => s.prefs)
  const update = useReminderStore((s) => s.update)
  const vis = reminderVisibility(prefs)

  // DailyReminderTimeTarget.{Today,Tomorrow} 1:1 — null = 弹窗关闭
  const [showTimePicker, setShowTimePicker] = useState<'today' | 'tomorrow' | null>(null)
  const [minutesInput, setMinutesInput] = useState(() => String(prefs.beforeClassMinutes))
  const [fieldsMenuExpanded, setFieldsMenuExpanded] = useState(false)
  const [notifyState, setNotifyState] = useState<NotifyState>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported',
  )

  // debounce: 分钟输入停止 500ms 后才持久化 (Android LaunchedEffect(minutesInput){delay(500)} 同构)
  useEffect(() => {
    const v = commitMinutesInput(minutesInput)
    if (v === null) return
    const id = setTimeout(() => {
      const cur = useReminderStore.getState().prefs.beforeClassMinutes
      if (cur !== v) useReminderStore.getState().update({ beforeClassMinutes: v })
    }, MINUTES_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [minutesInput])

  /** master 开关 — 开: 先要权限, 被拒则回弹 off; 关: 只改 master, 子开关配置保留 (Android 同注释) */
  async function onMasterToggle(on: boolean) {
    if (!on) {
      update({ masterEnabled: false })
      return
    }
    if (notifyState === 'unsupported' || typeof Notification.requestPermission !== 'function') {
      update({ masterEnabled: true })
      return
    }
    if (Notification.permission === 'granted') {
      update({ masterEnabled: true })
      return
    }
    const result = await Notification.requestPermission()
    setNotifyState(result)
    update({ masterEnabled: result === 'granted' })
  }

  return (
    <SettingsScaffold title={t('reminder_title')} onBack={onBack}>
      {/* Master toggle card */}
      <ReminderCard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 4 }}>
          <IconTitleSub
            icon={<IconNotifications size={20} />}
            title={t('reminder_master_title')}
            sub={t('reminder_master_sub')}
          />
          <Switch checked={prefs.masterEnabled} onChange={(v) => void onMasterToggle(v)} />
        </div>
        {notifyState === 'unsupported' && (
          <p className="m3-body-small" style={{ margin: '8px 4px 0', color: 'var(--md-on-surface-variant)' }}>
            {t('reminder_web_notify_unsupported')}
          </p>
        )}
        {notifyState === 'denied' && (
          <p className="m3-body-small" style={{ margin: '8px 4px 0', color: 'var(--md-error)' }}>
            {t('reminder_web_notify_denied')}
          </p>
        )}
      </ReminderCard>

      {/* Sub-settings — only visible when master is on.
          v1.0.57 PR48: 每日提醒卡改单卡母子结构 — 卡头总开关 + 今日摘要子项(开关+时间+预览)
          + 明日预告子项(开关+时间+预览), 全在 if (dailyEnabled) 内。 */}
      {vis.dailyCard && (
        <ReminderCard>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 4 }}>
            <IconTitleSub
              icon={<IconSchedule size={20} />}
              title={t('reminder_daily_title')}
              sub={t('reminder_daily_sub')}
            />
            <Switch checked={prefs.dailyEnabled} onChange={(v) => update({ dailyEnabled: v })} />
          </div>

          {vis.dailyTimeRow && (
            <>
              <SubDivider />
              <ReminderToggleRow
                title={t('reminder_daily_today_toggle_title')}
                subtitle={t('reminder_daily_today_toggle_sub')}
                checked={prefs.todayEnabled}
                onChange={(v) => update({ todayEnabled: v })}
              />
              {/* 今日摘要时间行 */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setShowTimePicker('today')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setShowTimePicker('today')
                }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 4px', cursor: 'pointer' }}
              >
                <span className="m3-body-medium" style={{ color: 'var(--md-on-surface)' }}>{t('reminder_daily_time_label')}</span>
                <span className="m3-body-large" style={{ fontWeight: 500, color: 'var(--md-primary)' }}>{prefs.dailyTime}</span>
              </div>
              <p className="m3-body-small" style={{ margin: '8px 4px 8px 4px', color: 'var(--md-on-surface-variant)' }}>
                {t('reminder_daily_preview')}
              </p>
              <SubDivider />
              <ReminderToggleRow
                title={t('reminder_tomorrow_toggle_title')}
                subtitle={t('reminder_tomorrow_toggle_sub')}
                checked={prefs.tomorrowEnabled}
                onChange={(v) => update({ tomorrowEnabled: v })}
              />
              {/* 明日预告时间行 */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setShowTimePicker('tomorrow')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setShowTimePicker('tomorrow')
                }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 4px', cursor: 'pointer' }}
              >
                <span className="m3-body-medium" style={{ color: 'var(--md-on-surface)' }}>{t('reminder_tomorrow_time_label')}</span>
                <span className="m3-body-large" style={{ fontWeight: 500, color: 'var(--md-primary)' }}>{prefs.tomorrowTime}</span>
              </div>
              <p className="m3-body-small" style={{ margin: '8px 4px 8px 4px', color: 'var(--md-on-surface-variant)' }}>
                {t('reminder_tomorrow_preview')}
              </p>
            </>
          )}
        </ReminderCard>
      )}

      {vis.beforeClassCard && (
        <ReminderCard>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 4 }}>
            <IconTitleSub
              icon={<IconSchool size={20} />}
              title={t('reminder_before_class_title')}
              sub={t('reminder_before_class_sub')}
            />
            <Switch checked={prefs.beforeClassEnabled} onChange={(v) => update({ beforeClassEnabled: v })} />
          </div>

          {vis.beforeClassMinutes && (
            <>
              <SubDivider />
              {/* Free-input minutes field */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px' }}>
                <span className="m3-body-medium" style={{ color: 'var(--md-on-surface)', flex: 1 }}>{t('reminder_before_minutes_label')}</span>
                <label style={{ ...fieldStyle, width: 120, display: 'flex', alignItems: 'center', padding: '10px 12px' }}>
                  <input
                    aria-label={t('reminder_before_minutes_label')}
                    value={minutesInput}
                    onChange={(e) => setMinutesInput(filterMinutesInput(minutesInput, e.target.value))}
                    inputMode="numeric"
                    style={{ width: '100%', minWidth: 0, border: 'none', outline: 'none', background: 'transparent', font: 'inherit', fontSize: 16, color: 'var(--md-on-surface)' }}
                  />
                  <span className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)', whiteSpace: 'nowrap', marginLeft: 4 }}>
                    {t('reminder_before_minutes_unit')}
                  </span>
                </label>
              </div>
              <SubDivider />
              <p className="m3-body-small" style={{ margin: '8px 4px 8px 52px', color: 'var(--md-on-surface-variant)' }}>
                {t('reminder_before_class_preview')}
              </p>
              <SubDivider />
              <ReminderToggleRow
                title={t('reminder_banner_title')}
                subtitle={t('reminder_banner_sub')}
                checked={prefs.bannerEnabled}
                onChange={(v) => update({ bannerEnabled: v })}
              />
              <SubDivider />
              <ReminderToggleRow
                title={t('reminder_fluid_title')}
                subtitle={t('reminder_fluid_sub')}
                checked={prefs.fluidEnabled}
                onChange={(v) => update({ fluidEnabled: v })}
              />
              {vis.fluidFields && (
                <>
                  <SubDivider />
                  <div style={{ padding: '8px 4px' }}>
                    <div className="m3-body-medium" style={{ color: 'var(--md-on-surface)' }}>{t('reminder_fluid_fields')}</div>
                    <div style={{ height: 6 }} />
                    <div style={{ position: 'relative' }}>
                      <button
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={fieldsMenuExpanded}
                        onClick={() => setFieldsMenuExpanded((v) => !v)}
                        style={{ ...fieldStyle, width: '100%', textAlign: 'left', cursor: 'pointer', display: 'block' }}
                      >
                        <span className="m3-label-small" style={{ display: 'block', color: 'var(--md-on-surface-variant)' }}>
                          {t('reminder_fluid_fields_hint')}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                          <span className="m3-body-large" style={{ flex: 1, color: 'var(--md-on-surface)' }}>
                            {t(fluidPrimaryLabelKey(prefs.fluidPrimary))}
                          </span>
                          <span style={{ color: 'var(--md-on-surface-variant)', display: 'inline-flex' }}>
                            <IconExpandMore size={20} />
                          </span>
                        </span>
                      </button>
                      {fieldsMenuExpanded && (
                        <>
                          {/* DropdownMenu 遮罩 — onDismissRequest */}
                          <div onClick={() => setFieldsMenuExpanded(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                          <div
                            role="menu"
                            style={{
                              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 4,
                              // 菜单浮在 surfaceContainer 卡片上, 用 Highest 拉开对比 (Android 同注释)
                              background: 'var(--md-surface-container-highest)', borderRadius: 16, padding: '8px 0',
                              boxShadow: '0 4px 18px color-mix(in srgb, var(--md-scrim) 25%, transparent)',
                            }}
                          >
                            {FLUID_PRIMARY_OPTIONS.map((key) => (
                              <FluidFieldItem
                                key={key}
                                option={key}
                                label={t(fluidPrimaryLabelKey(key))}
                                selected={key === prefs.fluidPrimary}
                                onSelect={() => {
                                  update({ fluidPrimary: key })
                                  setFieldsMenuExpanded(false)
                                }}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                    <p className="m3-body-small" style={{ margin: '6px 0 0', color: 'var(--md-on-surface-variant)' }}>
                      {t('reminder_fluid_note')}
                    </p>
                  </div>
                </>
              )}
            </>
          )}
        </ReminderCard>
      )}

      {/* Time picker dialog — DailyReminderTimeTarget.Today/Tomorrow 分流落库 */}
      {showTimePicker !== null && (
        <TimePickerDialog
          initial={showTimePicker === 'today' ? prefs.dailyTime : prefs.tomorrowTime}
          onConfirm={(time) => {
            if (showTimePicker === 'today') update({ dailyTime: time })
            else update({ tomorrowTime: time })
            setShowTimePicker(null)
          }}
          onDismiss={() => setShowTimePicker(null)}
        />
      )}
    </SettingsScaffold>
  )
}

/** ReminderCard — shapes.large(16dp) + surfaceContainer + 16dp padding */
function ReminderCard({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', width: '100%', boxSizing: 'border-box',
        background: 'var(--md-surface-container)', borderRadius: 16, padding: 16,
      }}
    >
      {children}
    </div>
  )
}

/** IconBox + 标题/副标题 — 36dp primaryContainer 方块内 20dp onPrimaryContainer 图标 */
function IconTitleSub({ icon, title, sub }: { icon: ReactNode; title: string; sub: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
      <div
        style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
          background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="m3-body-large" style={{ fontWeight: 600, color: 'var(--md-on-surface)' }}>{title}</div>
        <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>{sub}</div>
      </div>
    </div>
  )
}

/** ReminderToggleRow — bodyMedium SemiBold 标题 + bodySmall 副标题 + 主题色 Switch */
function ReminderToggleRow({
  title, subtitle, checked, onChange,
}: {
  title: string
  subtitle: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 4px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="m3-body-medium" style={{ fontWeight: 600, color: 'var(--md-on-surface)' }}>{title}</div>
        <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>{subtitle}</div>
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  )
}

/** SubDivider — HorizontalDivider(padding start 52dp, outline @ hairline) */
function SubDivider() {
  return (
    <div
      style={{
        height: 1, marginLeft: 52,
        background: 'color-mix(in srgb, var(--md-outline) 30%, transparent)',
      }}
    />
  )
}

/** 填充式输入框外观 — SleepyTheme.fieldColors (surfaceContainerHighest / 无指示线) + fieldShape(12dp) */
const fieldStyle: CSSProperties = {
  boxSizing: 'border-box',
  background: 'var(--md-surface-container-highest)',
  border: 'none',
  borderRadius: 12,
  color: 'var(--md-on-surface)',
}

/** DropdownMenuItem + leadingIcon RadioButton */
function FluidFieldItem({
  option, label, selected, onSelect,
}: {
  option: FluidPrimary
  label: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 16px',
        border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left',
        color: 'var(--md-on-surface)', font: 'inherit', boxSizing: 'border-box',
      }}
    >
      <input
        type="radio"
        name="reminder-fluid-primary"
        checked={selected}
        readOnly
        tabIndex={-1}
        aria-hidden
        data-option={option}
        // M3 RadioButton: selected=primary / unselected=onSurfaceVariant
        style={{ accentColor: 'var(--md-primary)', width: 20, height: 20, pointerEvents: 'none', flexShrink: 0 }}
      />
      <span className="m3-body-large">{label}</span>
    </button>
  )
}

/**
 * TimePicker 弹窗 — AlertDialog(reminder_pick_time) + 取消/确认。
 * 表盘 TimePicker 在 web 由原生 <input type="time"> 承担; 确认才写 prefs (Android confirmButton 同)。
 */
function TimePickerDialog({
  initial, onConfirm, onDismiss,
}: {
  initial: string
  onConfirm: (time: string) => void
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(initial)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  const valid = isHHmm(draft)
  return (
    <div
      className="m3-scrim-overlay"
      onClick={onDismiss}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('reminder_pick_time')}
        className="m3-card-shape-large"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 320, width: '100%', display: 'flex', flexDirection: 'column', gap: 16, padding: 24,
          background: 'var(--md-surface-container-high)', color: 'var(--md-on-surface)',
        }}
      >
        <div className="m3-title-large">{t('reminder_pick_time')}</div>
        <input
          type="time"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={t('reminder_daily_time_label')}
          autoFocus
          style={{
            ...fieldStyle,
            width: '100%',
            padding: '12px 14px',
            font: 'inherit',
            fontSize: 20,
            fontVariantNumeric: 'tabular-nums',
            accentColor: 'var(--md-primary)',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <TextBtn onClick={onDismiss}>{t('action_cancel')}</TextBtn>
          <TextBtn disabled={!valid} onClick={() => valid && onConfirm(draft)}>
            {t('action_confirm')}
          </TextBtn>
        </div>
      </div>
    </div>
  )
}

/** TextButton — AlertDialog confirm/dismiss 位 (primary 文字, 禁用 38%) */
function TextBtn({ disabled, onClick, children }: { disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        border: 'none', cursor: disabled ? 'default' : 'pointer', background: 'transparent',
        color: 'var(--md-primary)', opacity: disabled ? 0.38 : 1,
        fontSize: 14, fontWeight: 600, padding: '10px 16px', borderRadius: 12,
      }}
    >
      {children}
    </button>
  )
}
