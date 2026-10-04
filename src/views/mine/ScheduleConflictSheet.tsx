/**
 * ScheduleConflictSheet — 甲案 (设计文档 §4.1/§4.2) 三选项底部弹层 + 待执行 Banner。
 * Android: ScheduleConflictBottomSheet.kt + PendingPolicyBanner.kt 1:1。
 *
 * 不变量:
 *  - 三个选项始终显示 (影响数量仅提示, 不改变可选项)
 *  - 点选仅记录待执行策略, 不写库; 下次保存才执行
 *  - 弹窗外点按 / 「取消」= 仅撤销本次作息改动, 其他字段草稿保留
 */

import { useTranslation } from 'react-i18next'
import { IconInfo } from '../../components/icons'
import { SchedulePolicy } from '../../domain/schedulePolicy'

export function ScheduleConflictBottomSheet({
  periodTableName,
  boundTableCount,
  onSelect,
  onCancel,
}: {
  periodTableName: string
  /** 绑定到该作息表的全部课表数(含当前表本身)。<2 = 仅有当前表。 */
  boundTableCount: number
  onSelect: (policy: SchedulePolicy) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()

  const otherCount = Math.max(0, boundTableCount - 1)
  const summaryTail = otherCount === 0
    ? t('schedule_conflict_dialog_summary_only_this')
    : t('schedule_conflict_dialog_summary_other_count', { v1: otherCount })
  const syncSub = otherCount === 0
    ? t('schedule_conflict_option_sync_sub_only')
    : t('schedule_conflict_option_sync_sub_other', { v1: otherCount })

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520, background: 'var(--md-surface-container-low)',
          borderRadius: '28px 28px 0 0', padding: '20px 20px calc(32px + env(safe-area-inset-bottom))',
        }}
      >
        <div className="m3-title-medium" style={{ fontWeight: 600, color: 'var(--md-on-surface)' }}>
          {t('schedule_conflict_dialog_title')}
        </div>
        <div style={{ height: 8 }} />
        <div className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
          {t('schedule_conflict_dialog_summary', { v1: periodTableName, v2: summaryTail })}
        </div>
        <div style={{ height: 20 }} />

        <ConflictOption
          title={t('schedule_conflict_option_detach_title')}
          subtitle={t('schedule_conflict_option_detach_sub')}
          onClick={() => onSelect(SchedulePolicy.DETACH_COPY)}
        />
        <div style={{ height: 8 }} />
        <ConflictOption
          title={t('schedule_conflict_option_create_title')}
          subtitle={t('schedule_conflict_option_create_sub')}
          onClick={() => onSelect(SchedulePolicy.CREATE_NEW)}
        />
        <div style={{ height: 8 }} />
        <ConflictOption
          title={t('schedule_conflict_option_sync_title', { v1: periodTableName })}
          subtitle={syncSub}
          onClick={() => onSelect(SchedulePolicy.SYNC)}
        />
        <div style={{ height: 20 }} />

        {/* 「取消」= 撤销本次作息改动, 其他字段草稿保留 */}
        <button
          type="button"
          onClick={onCancel}
          className="m3-label-large"
          style={{
            width: '100%', padding: '14px 0', borderRadius: 16, border: 'none', cursor: 'pointer',
            background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
            fontWeight: 500,
          }}
        >
          {t('cancel')}
        </button>
      </div>
    </div>
  )
}

function ConflictOption({ title, subtitle, onClick }: { title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
        background: 'var(--md-surface-container)', border: 'none',
        borderRadius: 16, padding: '14px 16px', color: 'var(--md-on-surface)',
      }}
    >
      <div className="m3-body-large" style={{ color: 'var(--md-on-surface)' }}>{title}</div>
      <div style={{ height: 2 }} />
      <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>{subtitle}</div>
    </button>
  )
}

/** §4.2 待执行提醒 Banner — 登记策略后编辑页常驻; 「修改」重弹三选项(草稿不丢)。 */
export function PendingPolicyBanner({
  policy,
  onModify,
}: {
  policy: SchedulePolicy
  onModify: () => void
}) {
  const { t } = useTranslation()
  if (policy === SchedulePolicy.NONE) return null

  const policyText =
    policy === SchedulePolicy.DETACH_COPY ? t('schedule_conflict_option_detach_title')
    : policy === SchedulePolicy.CREATE_NEW ? t('schedule_conflict_option_create_title')
    : t('schedule_conflict_option_sync_sub_only')

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
        borderRadius: 16, padding: '12px 16px',
      }}
    >
      <IconInfo size={18} color="var(--md-on-secondary-container)" />
      <div className="m3-body-medium" style={{ flex: 1, color: 'var(--md-on-secondary-container)' }}>
        {t('schedule_conflict_banner_format', { v1: policyText })}
      </div>
      <button
        type="button"
        onClick={onModify}
        className="m3-label-large"
        style={{
          border: 'none', cursor: 'pointer', background: 'transparent',
          color: 'var(--md-primary)', fontWeight: 600, padding: '4px 8px', borderRadius: 12,
        }}
      >
        {t('schedule_conflict_banner_modify')}
      </button>
    </div>
  )
}
