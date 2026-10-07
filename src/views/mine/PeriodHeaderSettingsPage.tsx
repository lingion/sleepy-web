/**
 * PeriodHeaderSettingsPage — PeriodHeaderSettingsScreen.kt 1:1。
 * 预览卡即样式选择器 (点选, selected=primaryContainer) → 布局分段 (labelMedium 小标题)
 * → 显示"第 X 节"开关行, 悬挂滑杆仅 three_line 布局时显示且挂在开关行下方。
 */

import { useLayoutEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePrefsStore } from '../../state/prefsStore'
import { periodHeaderLines, type PeriodHeaderStyle } from '../../components/schedule/periodHeader'
import { SegmentedSwitcher } from '../../components/SegmentedSwitcher'
import { SettingsScaffold, ToggleRow, SliderRow, onActivateKey } from './shared'

const STYLES: Array<[PeriodHeaderStyle, string]> = [
  ['arabic', '1  2  3'],
  ['chinese', '一  二  三'],
  ['financial', '壹  贰  叁'],
  ['circled', '①  ②  ③'],
  ['roman', 'Ⅰ  Ⅱ  Ⅲ'],
]

const PREVIEW_SLOT = {
  label: '12',
  displayStart: '08:00',
  displayEnd: '08:45',
  nodeStart: 12,
  nodeEnd: 12,
}
const PREVIEW_HEIGHT = 52
const PREVIEW_PAD = 3
const LABEL_SIZE = 12
const TIME_SIZE = 11
const PREVIEW_FONT = {
  label: Math.min(16, (PREVIEW_HEIGHT + 2.5) / 3.75),
  time: Math.min(16, (PREVIEW_HEIGHT + 2.5) / 3.75) - 1,
}

function measureTextWidth(text: string, size: number, weight = 400): number {
  try {
    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) throw new Error('Canvas measurement unavailable in jsdom')
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (context) {
      const fontFamily = getComputedStyle(document.body).fontFamily || 'sans-serif'
      context.font = `${weight} ${size}px ${fontFamily}`
      return context.measureText(text).width
    }
  } catch {
    // jsdom and restricted canvas implementations use the conservative fallback below.
  }
  let width = 0
  for (const char of text) width += /[0-9:]/.test(char) ? size * 0.58 : char === '-' ? size * 0.4 : size
  return width
}

function previewContentWidth(layout: 'legacy' | 'three_line', style: PeriodHeaderStyle, hanging: number, showX: boolean): number {
  const lines = periodHeaderLines(PREVIEW_SLOT, layout, style, showX)
  const label = lines[layout === 'three_line' ? 1 : 0]
  const labelWidth = measureTextWidth(label, LABEL_SIZE, 600)
  const startWidth = measureTextWidth(PREVIEW_SLOT.displayStart, TIME_SIZE)
  const endWidth = measureTextWidth(PREVIEW_SLOT.displayEnd, TIME_SIZE)

  if (layout === 'three_line') {
    const font = PREVIEW_FONT
    const projectedTimeWidth = Math.max(startWidth * (font.time / TIME_SIZE), endWidth * (font.time / TIME_SIZE))
    const projectedLabelWidth = labelWidth * (font.label / LABEL_SIZE)
    const timeWidth = Math.max(projectedTimeWidth, projectedLabelWidth)
    const labelLeft = -projectedLabelWidth + ((hanging + 1) / 2) * (timeWidth + projectedLabelWidth)
    const inkWidth = Math.max(timeWidth, labelLeft + projectedLabelWidth) - Math.min(0, labelLeft)
    return Math.max(46, inkWidth + PREVIEW_PAD * 2)
  }

  const dashWidth = measureTextWidth('-', TIME_SIZE)
  const leftExtent = Math.max(labelWidth / 2, startWidth + dashWidth / 2)
  const rightExtent = Math.max(labelWidth / 2, dashWidth / 2 + endWidth)
    return Math.max(46, leftExtent + rightExtent + PREVIEW_PAD * 2)
}

function previewFontSize(width: number) {
  // PeriodHeaderAdaptiveFont.forPreview (Android): (height + 2.5) / 3.75, then time = label - 1.
  const label = Math.min(16, (PREVIEW_HEIGHT + 2.5) / 3.75)
  return { label, time: label - 1, width }
}

export function PeriodHeaderSettingsPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const prefs = usePrefsStore((s) => s.prefs)
  const update = usePrefsStore((s) => s.update)
  const [hangingDraft, setHangingDraft] = useState(prefs.periodHeaderHanging)
  useLayoutEffect(() => setHangingDraft(prefs.periodHeaderHanging), [prefs.periodHeaderHanging])

  const widths = STYLES.map(([style]) => previewContentWidth(
    prefs.periodHeaderLayout, style, hangingDraft, prefs.periodHeaderShowX,
  ))
  const sharedFont = previewFontSize(Math.max(...widths))
  return <SettingsScaffold title={t('appearance_period_header')} onBack={onBack} gap={12}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="m3-title-small" style={{ color: 'var(--md-on-surface)' }}>{t('appearance_header_preview', '预览')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {STYLES.map(([style, label], index) => {
          const selected = prefs.periodHeaderStyle === style
          const contentWidth = widths[index]
          const cardWidth = Math.max(76, contentWidth + 12, measureTextWidth(label, 11, 500) + 12)
          const headerLines = periodHeaderLines(PREVIEW_SLOT, prefs.periodHeaderLayout, style, prefs.periodHeaderShowX)
          const measuredHeaderLabel = headerLines[prefs.periodHeaderLayout === 'three_line' ? 1 : 0]
          const labelWidth = measureTextWidth(measuredHeaderLabel, LABEL_SIZE, 600)
          const startWidth = measureTextWidth(PREVIEW_SLOT.displayStart, TIME_SIZE)
          const endWidth = measureTextWidth(PREVIEW_SLOT.displayEnd, TIME_SIZE)
          const timeWidth = Math.max(startWidth * (PREVIEW_FONT.time / TIME_SIZE), endWidth * (PREVIEW_FONT.time / TIME_SIZE), labelWidth * (PREVIEW_FONT.label / LABEL_SIZE))
          const previewLabelWidth = labelWidth * (PREVIEW_FONT.label / LABEL_SIZE)
          const hangingLabelLeft = -previewLabelWidth + ((hangingDraft + 1) / 2) * (timeWidth + previewLabelWidth)
          const inkLeft = Math.min(0, hangingLabelLeft)
          const legacyDashWidth = measureTextWidth('-', TIME_SIZE)
          const legacyAxis = Math.max(labelWidth / 2, measureTextWidth(PREVIEW_SLOT.displayStart, TIME_SIZE) + legacyDashWidth / 2)
          return (
            <div
              key={style}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              onClick={() => void update({ periodHeaderStyle: style })}
              onKeyDown={(event) => onActivateKey(event, () => void update({ periodHeaderStyle: style }))}
              style={{
                boxSizing: 'border-box', width: cardWidth, minWidth: 76, flex: '0 0 auto',
                borderRadius: 12, padding: 6, cursor: 'pointer',
                background: selected ? 'var(--md-primary-container)' : 'var(--md-surface-container)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
              }}
            >
              <div style={{
                position: 'relative', boxSizing: 'border-box', width: contentWidth, height: PREVIEW_HEIGHT,
                borderRadius: 8, padding: PREVIEW_PAD, overflow: 'hidden', background: 'var(--md-surface-container-low)',
              }}>
                {prefs.periodHeaderLayout === 'three_line' ? (
                  <div style={{ position: 'absolute', inset: PREVIEW_PAD }}>
                    <div className="m3-label-small" style={{
                      position: 'absolute', top: 0, left: -inkLeft, fontSize: PREVIEW_FONT.time,
                      lineHeight: `${PREVIEW_FONT.time * 1.25}px`, whiteSpace: 'nowrap', color: 'var(--md-on-surface-variant)',
                    }}>{PREVIEW_SLOT.displayStart}</div>
                    <div className="m3-label-small" style={{
                      position: 'absolute', top: '50%', left: hangingLabelLeft - inkLeft, transform: 'translateY(-50%)',
                      fontSize: sharedFont.label, fontWeight: 600, lineHeight: `${sharedFont.label * 1.25}px`,
                      whiteSpace: 'nowrap', color: 'var(--md-on-surface)',
                    }}>{measuredHeaderLabel}</div>
                    <div className="m3-label-small" style={{
                      position: 'absolute', bottom: 0, left: -inkLeft, fontSize: sharedFont.time,
                      lineHeight: `${PREVIEW_FONT.time * 1.25}px`, whiteSpace: 'nowrap', color: 'var(--md-on-surface-variant)',
                    }}>{PREVIEW_SLOT.displayEnd}</div>
                  </div>
                ) : (
                  <div style={{ position: 'absolute', inset: PREVIEW_PAD }}>
                    <div className="m3-label-small" style={{
                      position: 'absolute', top: 4, left: legacyAxis - labelWidth / 2, fontSize: 12,
                      fontWeight: 600, lineHeight: '15px', whiteSpace: 'nowrap', color: 'var(--md-on-surface)',
                    }}>{measuredHeaderLabel}</div>
                    <div className="m3-label-small" style={{
                      position: 'absolute', top: 23, left: legacyAxis - measureTextWidth(PREVIEW_SLOT.displayStart, 11) - legacyDashWidth / 2,
                      fontSize: 11, lineHeight: '14px', whiteSpace: 'nowrap', color: 'var(--md-on-surface-variant)',
                    }}>{`${PREVIEW_SLOT.displayStart}-${PREVIEW_SLOT.displayEnd}`}</div>
                  </div>
                )}
              </div>
              <span
                className="m3-label-small"
                style={{ color: selected ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)' }}
              >
                {label}
              </span>
            </div>
          )
        })}
      </div>
    </div>

    {/* 布局: labelMedium 小标题 + SegmentedSwitcher 高40 surfaceContainerHighest */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="m3-label-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
        {t('appearance_header_layout', '布局')}
      </span>
      <SegmentedSwitcher
        options={[t('appearance_layout_legacy', '旧式'), t('appearance_layout_three_line', '三行')]}
        selected={prefs.periodHeaderLayout === 'three_line' ? 1 : 0}
        onSelect={(i) => void update({ periodHeaderLayout: i === 1 ? 'three_line' : 'legacy' })}
        height={40}
        containerColor="var(--md-surface-container-highest)"
      />
    </div>

    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <ToggleRow label={t('appearance_header_show_x', '显示“第 X 节”')} checked={prefs.periodHeaderShowX} onChange={(v) => void update({ periodHeaderShowX: v })} />
      {prefs.periodHeaderLayout === 'three_line' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 4px' }}>
          <div className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
            {t('appearance_header_hanging', { v1: `${hangingDraft >= 0 ? '+' : ''}${hangingDraft.toFixed(1)}` })}
          </div>
          <SliderRow
            label=""
            value={hangingDraft}
            min={-1}
            max={1}
            step={0.1}
            formatLabel={(v) => t('appearance_header_hanging', { v1: `${v >= 0 ? '+' : ''}${v.toFixed(1)}` })}
            showValue={false}
            onChange={setHangingDraft}
            onCommit={(v) => void update({ periodHeaderHanging: v })}
            ariaLabel={t('appearance_header_hanging', { v1: `${hangingDraft >= 0 ? '+' : ''}${hangingDraft.toFixed(1)}` })}
          />
        </div>
      )}
    </div>
  </SettingsScaffold>
}
