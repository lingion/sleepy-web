import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import variants from '../../data/widgetVariants.json'
import { SettingsScaffold } from './shared'
import { AlertDialog } from '../../components/AlertDialog'
import { DialogActionButtons } from '../../components/DialogActionButtons'
export function WidgetManagementPage({ onBack, onOpenGallery }: { onBack: () => void; onOpenGallery: () => void }) {
  const { t } = useTranslation()
  return <SettingsScaffold title={t('widget_manage_title')} onBack={onBack} actions={<button className="m3-icon-button" aria-label={t('widget_gallery_title')} onClick={onOpenGallery}>＋</button>}>
    <p>{t('web_widget_native_hint')}</p>
    <button className="m3-button-tonal" onClick={onOpenGallery}>{t('widget_gallery_title')}</button>
  </SettingsScaffold>
}
/** Metadata and preview images are copied from the exact v1.0.64 registry. */
export function WidgetGalleryPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const groups = [...new Set(variants.map(variant => variant.family))].map(key => ({ key, variants: variants.filter(variant => variant.family === key).sort((a, b) => b.width * b.height - a.width * a.height) }))
  return <SettingsScaffold title={t('widget_gallery_title')} onBack={onBack}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
      {groups.map(group => <section key={group.key} style={{ minWidth: 0, gridColumn: expanded === group.key ? '1 / -1' : undefined, padding: 12, borderRadius: 16, background: 'var(--md-surface-container)' }}>
        <button onClick={() => setExpanded(expanded === group.key ? null : group.key)} aria-expanded={expanded === group.key} style={{ display: 'block', width: '100%', padding: 0, color: 'inherit', border: 0, background: 'transparent', cursor: 'pointer' }}>
          <img src={`${import.meta.env.BASE_URL}widget-previews/${group.variants[0].image}`} alt="" style={{ width: '100%', aspectRatio: '300 / 250', objectFit: 'contain' }} />
          <span className="m3-title-small">{t(group.variants[0].label).split(' · ')[0]}{group.variants.length > 1 && ` (${t('web_widget_multiple_sizes')})`}</span>
        </button>
        {expanded === group.key && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12, marginTop: 12 }}>
          {group.variants.map(variant => <button key={variant.id} data-widget-variant={variant.id} onClick={() => setSelected(variant.label)} style={{ minWidth: 0, color: 'inherit', background: 'var(--md-surface-container-low)', border: '1px solid var(--md-outline-variant)', borderRadius: 12, padding: 8, cursor: 'pointer' }}>
            <img src={`${import.meta.env.BASE_URL}widget-previews/${variant.image}`} alt="" style={{ width: '100%', aspectRatio: '300 / 250', objectFit: 'contain' }} />
            <span>{t(variant.label)}</span><br /><small>{variant.width} × {variant.height}</small>
          </button>)}
        </div>}
      </section>)}
    </div>
    {selected && <AlertDialog title={t(selected)} onDismiss={() => setSelected(null)} actions={<DialogActionButtons onCancel={() => setSelected(null)} cancelLabel={t('close')} />}><p>{t('web_widget_native_hint')}</p></AlertDialog>}
  </SettingsScaffold>
}
