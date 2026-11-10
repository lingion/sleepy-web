import type { ReminderPrefs } from '../../state/reminderStore'
import { useHolidayStore, holidaySetsForYear, getHolidayTransfers } from '../../state/holidayStore'

export async function reminderAllowedOn(date: string, tableId: number, prefs: ReminderPrefs): Promise<boolean> {
  if (!prefs.dateRulesEnabled) return true
  const year = Number(date.slice(0, 4))
  await useHolidayStore.getState().load(year)
  const state = useHolidayStore.getState()
  if (state.status[year] !== 'loaded') return true
  const { holidays, workdays } = holidaySetsForYear(state.entries[year] ?? [], state.overrides)
  if (workdays.has(date)) return prefs.makeupWorkdayReminder
  if (holidays.has(date)) return getHolidayTransfers(tableId).some(transfer => transfer.sourceDate === date) ? prefs.transferHolidayReminder : prefs.publicHolidayReminder
  const day = new Date(date + 'T12:00:00').getDay()
  return day === 0 || day === 6 ? prefs.ordinaryWeekendReminder : true
}
