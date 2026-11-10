import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { Prefs } from '../../data/types'
import { IconCheck, IconExpandMore } from '../../components/icons'
import './LanguageMenu.css'

const LANGUAGES: Array<[Prefs['lang'], string]> = [
  ['zh-CN', '简体中文'], ['zh-TW', '繁體中文'], ['en', 'English'], ['ja', '日本語'], ['es', 'Español'],
]

/** The current value anchors a separate window; opening never changes the page height. */
export function LanguageMenu({ lang, onChange }: { lang: Prefs['lang']; onChange: (code: Prefs['lang']) => void }) {
  const { t } = useTranslation()
  const anchor = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>()
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 16, width: 280, height: 320 })
  const current = LANGUAGES.find(([code]) => code === lang)?.[1] ?? lang
  function close(code?: Prefs['lang']) {
    if (closing) return
    setClosing(true)
    closeTimer.current = setTimeout(() => {
      setOpen(false)
      setClosing(false)
      anchor.current?.focus()
      if (code && code !== lang) onChange(code)
    }, 200)
  }
  useEffect(() => () => clearTimeout(closeTimer.current), [])
  useEffect(() => {
    if (!open) return
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(280, window.innerWidth - 32)
      const height = Math.min(320, window.innerHeight - 32)
      setPosition({ left: Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16)), top: Math.max(16, Math.min(rect.bottom + 4, window.innerHeight - height - 16)), width, height })
    }
    place()
    menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open])
  return <>
    <button data-glass-plain ref={anchor} type="button" className="language-menu-anchor" aria-haspopup="menu" aria-expanded={open} onClick={() => { if (!closing) setOpen(true) }}>
      <span className="m3-title-small">{t('settings_language')}</span>
      <span className="language-menu-value m3-body-large">{current}<IconExpandMore size={20} /></span>
    </button>
    {open && createPortal(<div className="language-menu-layer" onPointerDown={event => { if (event.target === event.currentTarget) close() }}>
      <div data-glass-role="menu" data-glass-motion="static" ref={menu} className={`language-menu-popup${closing ? ' language-menu-closing' : ''}`} role="menu" aria-label={t('settings_language')} style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.height }} onKeyDown={event => {
        const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])
        if (event.key === 'Escape') { event.preventDefault(); close() }
        else if (['ArrowUp', 'ArrowDown', 'Home', 'End', 'Tab'].includes(event.key)) {
          event.preventDefault()
          const index = items.indexOf(document.activeElement as HTMLButtonElement)
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' || event.shiftKey ? -1 : 1) + items.length) % items.length
          items[next]?.focus()
        }
      }}>
        {LANGUAGES.map(([code, label]) => <button data-glass-plain type="button" role="menuitemradio" aria-checked={lang === code} key={code} disabled={closing} onClick={() => close(code)}>
          <span>{label}</span>{lang === code && <IconCheck size={20} />}
        </button>)}
      </div>
    </div>, document.body)}
  </>
}
