import 'fake-indexeddb/auto'
import { beforeEach, afterEach, expect, it } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { db } from '../data/db'
import { insertTable, insertCourse } from '../data/repository'
import { DEFAULT_TIME_JSON } from '../domain/timeTable'
import { initI18n } from '../i18n'
import { DailyAgendaPage } from './DailyAgendaPage'
import { useReminderStore } from '../state/reminderStore'
beforeEach(async () => { await db.delete(); await db.open(); initI18n('zh-CN'); useReminderStore.getState().reset() })
afterEach(cleanup)
it('loads the requested calendar day and reacts to repository changes', async () => {
  const tableId = await insertTable({ name: '提醒课表', isDefault: 1, startDate: '2026-11-09', maxWeek: 20, nodeCount: 12, timeJson: DEFAULT_TIME_JSON, smartConfigJson: '', createdAt: 1 })
  render(<DailyAgendaPage date="2026-11-10" onBack={() => {}} />)
  await waitFor(() => expect(screen.getByText('当天没有需要提醒的课程')).toBeTruthy())
  await insertCourse({ tableId, groupId: 'agenda-test', courseName: '测试课程', room: '教室一', teacher: '', note: '', alias: '', day: 2, startNode: 1, step: 1, startWeek: 1, endWeek: 20, type: 0, color: '#FF6750A4', colorMode: 0, ownTime: false, isIrregularNode: false, isIrregularTime: false, startTime: '', endTime: '', credit: 0, level: 0, fixedDate: '2026-11-10' })
  await waitFor(() => expect(screen.getByText('测试课程')).toBeTruthy())
  expect(screen.getByText('提醒课表')).toBeTruthy()
})
