import { afterEach, expect, it, vi } from 'vitest'
import { computeCurrentWeek as managementWeek } from './ManageView'
import { computeCurrentWeek as scheduleWeek } from './ScheduleView'

afterEach(() => vi.useRealTimers())

it('preserves the schedule summary week calculation without importing its view', () => {
  vi.useFakeTimers()
  for (const today of ['2026-01-01T12:00:00', '2026-03-09T12:00:00', '2026-11-10T12:00:00']) {
    vi.setSystemTime(new Date(today))
    for (const start of ['', 'invalid', '2026-01-01', '2026-03-08', '2026-09-09', '2026-12-15', '2026-99-99']) {
      for (const max of [0, 1, 20, -1]) expect(managementWeek(start, max)).toBe(scheduleWeek(start, max))
    }
  }
})
