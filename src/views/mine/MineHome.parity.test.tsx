import 'fake-indexeddb/auto'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { initI18n } from '../../i18n'
import { MineHome } from './MineHome'

vi.mock('../../domain/update/updateChecker', () => ({
  maybeCheckOnStart: vi.fn().mockResolvedValue(null),
  getCachedUpdate: () => null,
}))

beforeAll(() => initI18n('zh-CN'))
afterEach(cleanup)

function callbacks() {
  return {
    onOpenGeneral: vi.fn(), onOpenHoliday: vi.fn(), onOpenBackup: vi.fn(), onOpenWidgets: vi.fn(),
    onOpenAppearance: vi.fn(), onOpenExport: vi.fn(), onOpenAllTables: vi.fn(),
    onOpenPeriodTables: vi.fn(), onOpenAbout: vi.fn(), onOpenReminder: vi.fn(), onOpenCourseList: vi.fn(),
  }
}

it('按 Android 顺序显示三个分组标题、四张独立设置卡和九个入口', () => {
  render(<MineHome {...callbacks()} />)
  expect(screen.getAllByRole('heading').map(el => el.textContent)).toEqual(['我的', '课表管理', '应用设置', '数据'])
  const groups = screen.getAllByRole('group')
  expect(groups.map(group => within(group).getAllByRole('button').map(el => el.textContent))).toEqual([
    ['所有课表', '作息表', '节假日与调休'],
    ['提醒', '外观与主题', '通用', '小组件'],
    ['备份与恢复'],
    ['关于'],
  ])
  const nodes = [screen.getByRole('heading', { name: '课表管理' }), groups[0],
    screen.getByRole('heading', { name: '应用设置' }), groups[1],
    screen.getByRole('heading', { name: '数据' }), groups[2], groups[3]]
  for (let i = 1; i < nodes.length; i++) {
    expect(nodes[i - 1].compareDocumentPosition(nodes[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  }
  for (const button of screen.getAllByRole('button')) expect(button.hasAttribute('data-glass-plain')).toBe(true)
  expect(screen.getByRole('button', { name: '节假日与调休' }).querySelector('[data-icon="DateRange"]')).toBeTruthy()
  expect(screen.getByRole('button', { name: '小组件' }).querySelector('[data-icon="Widgets"]')).toBeTruthy()
  expect(screen.getByRole('button', { name: '备份与恢复' }).querySelector('[data-icon="SaveAlt"]')).toBeTruthy()
})

it('九个设置入口和三个统计格各自保留原导航', () => {
  const props = callbacks()
  render(<MineHome {...props} />)
  for (const [label, callback] of [
    ['所有课表', props.onOpenAllTables], ['作息表', props.onOpenPeriodTables],
    ['节假日与调休', props.onOpenHoliday], ['提醒', props.onOpenReminder],
    ['外观与主题', props.onOpenAppearance], ['通用', props.onOpenGeneral],
    ['小组件', props.onOpenWidgets], ['备份与恢复', props.onOpenBackup], ['关于', props.onOpenAbout],
  ] as const) {
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(callback).toHaveBeenCalledTimes(1)
  }
  const stats = screen.getByRole('region', { name: '管理你的课表与设置' })
  within(stats).getAllByRole('button').forEach(button => fireEvent.click(button))
  expect(props.onOpenAllTables).toHaveBeenCalledTimes(2)
  expect(props.onOpenCourseList).toHaveBeenCalledTimes(1)
  expect(props.onOpenPeriodTables).toHaveBeenCalledTimes(2)
})
