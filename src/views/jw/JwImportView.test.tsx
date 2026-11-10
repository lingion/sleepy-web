import 'fake-indexeddb/auto'
import { beforeAll, afterEach, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { JwImportView } from './JwImportView'
import { initI18n } from '../../i18n'
import { SCHOOLS } from './schools'
import { JW_WEB_UNSUPPORTED } from '../../domain/jw/webPolicy'
import { db } from '../../data/db'
import { fetchViaProxy } from './proxyClient'
beforeAll(()=>initI18n('zh-CN'))
afterEach(()=>{cleanup();vi.restoreAllMocks()})
it.each(['supported','pending','unverified','grad_pending','grad_unverified'])('学校状态 %s 一律提示且零网络零落库',async status=>{
  const fetcher=vi.fn(), network=vi.spyOn(globalThis,'fetch'), before=await db.courses.count()
  const school=SCHOOLS.find(s=>s.status===status)!
  expect(school).toBeTruthy()
  render(<JwImportView onBack={()=>{}} fetcher={fetcher}/> )
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:school.name}})
  fireEvent.click(screen.getAllByRole('option',{name:school.name})[0])
  expect(screen.getByRole('alertdialog').textContent).toContain(JW_WEB_UNSUPPORTED)
  expect(fetcher).not.toHaveBeenCalled();expect(network).not.toHaveBeenCalled();expect(await db.courses.count()).toBe(before)
})
it('直接 URL 与旧客户端无法绕过',async()=>{
  const network=vi.fn()
  render(<JwImportView onBack={()=>{}}/> )
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'https://jw.example.edu.cn/login'}})
  fireEvent.click(screen.getByRole('option',{name:'直接用此 URL 登录'}))
  expect(screen.getByText(JW_WEB_UNSUPPORTED)).toBeTruthy()
  const result=await fetchViaProxy('https://jw.example.edu.cn',{},network)
  expect(result.ok).toBe(false);expect(network).not.toHaveBeenCalled()
})
