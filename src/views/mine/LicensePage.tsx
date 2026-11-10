/**
 * LicensePage — 开源许可与致谢 (LicenseScreen.kt 1:1)。
 * GPL 卡 → 贡献者 → 可折叠致谢导语 (about_license_body 全文) → 跨校普适项目 → 按学校致谢 (可展开)。
 * 项目名/作者/license 名是通用标识不翻译; 条目数据由 LicenseScreen.kt 逐条生成。
 */

import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { IconExpandLess, IconExpandMore } from '../../components/icons'
import { SettingsScaffold } from './shared'
import androidLicense from '../../data/androidLicense.json'
const { contributors: CONTRIBUTOR_ENTRIES, attributions: ATTRIBUTION_ENTRIES, schools: PER_SCHOOL_ENTRIES } = androidLicense

export function LicensePage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const toggle = (id: string) => setExpanded((m) => ({ ...m, [id]: !m[id] }))
  const bodyExpanded = expanded['__body__'] === true

  return (
    <SettingsScaffold title={t('license_page_title')} onBack={onBack}>
      {/* LazyColumn contentPadding 16 + spacedBy 12 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: -16 }}>
        <LicenseCard>
          <div className="m3-body-large" style={{ fontWeight: 600, color: 'var(--md-on-surface)' }}>{t('license_gpl_section')}</div>
          <div style={{ height: 8 }} />
          <div className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>{t('license_gpl_body')}</div>
        </LicenseCard>

        <SectionHeader text={t('license_contributor_section')} />
        {CONTRIBUTOR_ENTRIES.map((e) => (
          <AttributionCard key={e.id} title={e.title} subtitle={e.meta} description={e.usage} />
        ))}

        <SectionHeader text={t('license_recent_section')} />
        <LicenseCard>
          <p className="m3-body-medium" style={{ margin: 0 }}>{t('license_recent_source_notice')}</p>
          <p className="m3-body-small">{t('license_recent_intro')}</p>
        </LicenseCard>
        {['sources', 'libraries', 'data', 'design', 'glass_research', 'vendor', 'background', 'protocol_research'].map(group => <AttributionCard key={group} title={t(`license_recent_${group}_title`)} expandable={{ expanded: expanded[group] === true, onToggle: () => toggle(group), lines: t(`license_recent_${group}_body`).split('\n') }} />)}

        <LicenseCard>
          <div onClick={() => toggle('__body__')} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="m3-body-large" style={{ fontWeight: 600, color: 'var(--md-on-surface)' }}>{t('license_attribution_section')}</div>
              <div style={{ height: 8 }} />
              <div className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>{t('license_attribution_note')}</div>
            </div>
            <ExpandButton expanded={bodyExpanded} onToggle={() => toggle('__body__')} />
          </div>
          {bodyExpanded && (
            <div className="m3-body-small" style={{ paddingTop: 8, color: 'var(--md-on-surface-variant)' }}>{t('about_license_body')}</div>
          )}
        </LicenseCard>

        <SectionHeader text={t('license_foundational_section')} />
        {ATTRIBUTION_ENTRIES.map((e) => (
          <AttributionCard key={e.id} title={e.title} subtitle={e.meta} description={e.usage} />
        ))}

        <SectionHeader text={t('license_perschool_section')} />
        {PER_SCHOOL_ENTRIES.map((e) => (
          <AttributionCard
            key={e.id}
            title={e.title}
            expandable={{ expanded: expanded[e.id] === true, onToggle: () => toggle(e.id), lines: e.usage.split('\n') }}
          />
        ))}
      </div>
    </SettingsScaffold>
  )
}

/** M3 IconButton: 48dp 触控区 + 24dp ExpandLess/ExpandMore (onSurfaceVariant) */
function ExpandButton({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const Icon = expanded ? IconExpandLess : IconExpandMore
  return (
    <button
      type="button"
      aria-label={expanded ? 'collapse' : 'expand'}
      aria-expanded={expanded}
      onClick={(ev) => {
        ev.stopPropagation()
        onToggle()
      }}
      style={{
        width: 48, height: 48, flexShrink: 0, borderRadius: 24, border: 'none', padding: 0, cursor: 'pointer',
        background: 'transparent', color: 'var(--md-on-surface-variant)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Icon size={24} />
    </button>
  )
}

/** 一条顶层致谢卡: 跨校项目/贡献者=不可展开 (标题+副标题+说明), 单校=可展开 (仅标题, 展开逐行列仓库)。 */
function AttributionCard({
  title, subtitle, description, expandable,
}: {
  title: string
  subtitle?: string
  description?: string
  expandable?: { expanded: boolean; onToggle: () => void; lines: string[] }
}) {
  const expanded = expandable?.expanded === true
  return (
    <LicenseCard>
      <div
        onClick={expandable?.onToggle}
        style={{ display: 'flex', alignItems: 'center', cursor: expandable ? 'pointer' : undefined }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="m3-title-small" style={{ fontWeight: 600, color: 'var(--md-on-surface)' }}>{title}</div>
          {subtitle !== undefined && subtitle.trim() !== '' && (
            <div className="m3-body-small" style={{ marginTop: 2, color: 'var(--md-primary)' }}>{subtitle}</div>
          )}
        </div>
        {expandable && <ExpandButton expanded={expanded} onToggle={expandable.onToggle} />}
      </div>
      {!expanded && description !== undefined && description.trim() !== '' && (
        <div className="m3-body-medium" style={{ marginTop: 6, color: 'var(--md-on-surface-variant)' }}>{description}</div>
      )}
      {/* Android 的 Spacer(6dp) 在 AnimatedVisibility 内与内容同点叠放 (Box 式布局), 实际不产生间距 */}
      {expanded && expandable && (
        <div>
          {expandable.lines.map((line, i) => (
            <div key={i} className="m3-body-small" style={{ padding: '2px 0', color: 'var(--md-on-surface-variant)' }}>{line}</div>
          ))}
        </div>
      )}
    </LicenseCard>
  )
}

function SectionHeader({ text }: { text: string }) {
  return (
    <div className="m3-title-small" style={{ fontWeight: 600, color: 'var(--md-primary)', padding: '8px 0 4px 4px' }}>
      {text}
    </div>
  )
}

function LicenseCard({ children }: { children: ReactNode }) {
  return (
    <div style={{ borderRadius: 20, background: 'var(--md-surface-container)', color: 'var(--md-on-surface)', padding: 16 }}>
      {children}
    </div>
  )
}
