import 'fake-indexeddb/auto'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { db } from '../../data/db'
import { i18next, initI18n, resources, SUPPORTED_LANGS } from '../index'
import { portableImportExtra } from './portableImport'
import { ImportView } from '../../views/ImportView'

afterEach(async () => { cleanup(); await db.delete(); await db.open() })

it.each(SUPPORTED_LANGS)('%s registers every portable import key with matching interpolation arguments', lang => {
  const english = portableImportExtra.en
  const localized = portableImportExtra[lang]
  expect(Object.keys(localized).sort()).toEqual(Object.keys(english).sort())
  for (const key of Object.keys(english) as (keyof typeof english)[]) {
    expect(localized[key].trim()).not.toBe('')
    expect(resources[lang].translation[key]).toBe(localized[key])
    const placeholders = (value:string) => [...value.matchAll(/{{(\w+)}}/g)].map(match => match[1]).sort()
    expect(placeholders(localized[key]),key).toEqual(placeholders(english[key]))
    expect(localized[key]).not.toMatch(/%\d+\$[sdf]/)
    if (lang === 'en' || lang === 'en-GB' || lang === 'es') expect(localized[key],key).not.toMatch(/[\u4e00-\u9fff]/)
  }
})

it.each(SUPPORTED_LANGS)('%s renders selection, conflict preview and append options without fallback text', async lang => {
  initI18n(lang)
  const t = i18next.getFixedT(lang)
  const times = '[{"node":1,"start":"08:00","end":"08:45"}]'
  await db.timetables.put({id:1,name:'Target',startDate:'2026-09-07',maxWeek:20,nodeCount:1,timeJson:times,smartConfigJson:'',isDefault:1,createdAt:0})
  const done = vi.fn()
  render(<ImportView onDone={done} onManualAdd={vi.fn()} addingCourses targetTableId={1}/>)
  const paste = await screen.findByRole('button',{name:t('import_paste')})
  await waitFor(() => expect((paste as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(paste)
  fireEvent.change(screen.getByLabelText(t('import_paste')),{target:{value:JSON.stringify({name:'Source',startDate:'2026-09-07',courses:[{name:'Algebra',day:1,startNode:1,step:1,startWeek:1,endWeek:20,type:0,fixedDate:'2026-11-15'}]})}})
  fireEvent.click(screen.getByRole('button',{name:t('import_preview')}))
  await screen.findByRole('heading',{name:t('import_select_courses')})
  fireEvent.click(screen.getByRole('button',{name:t('deselect_all')}))
  expect(screen.getByRole('alert').textContent).toBe(t('import_selection_empty'))
  expect((screen.getByRole('button',{name:t('confirm')}) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button',{name:t('select_all')}))
  fireEvent.click(screen.getByRole('button',{name:t('confirm')}))
  const dialog = await screen.findByRole('dialog')
  await within(dialog).findByRole('heading',{name:t('import_preview_title')})
  expect((within(dialog).getByLabelText(t('import_backup_original')) as HTMLInputElement).checked).toBe(true)
  expect((within(dialog).getByLabelText(t('import_append_conflicts_option')) as HTMLInputElement).checked).toBe(false)
  expect(dialog.textContent).not.toMatch(/import_[a-z_]+|{{|%\d+\$/)
  expect(done).not.toHaveBeenCalled()
  expect(await db.courses.count()).toBe(0)
})
