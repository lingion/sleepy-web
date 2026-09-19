import { describe, expect, it } from 'vitest'
import { dateOfWeek, isDateToday } from './CardsGridView'

const today = new Date(2026, 8, 19) // 星期六

describe('周视图当天高亮', () => {
  it('只高亮包含今天的那一周的星期六', () => {
    const currentSaturday = dateOfWeek('2026-09-14', 1, 6)
    const nextSaturday = dateOfWeek('2026-09-14', 2, 6)

    expect(currentSaturday && isDateToday(currentSaturday, today)).toBe(true)
    expect(nextSaturday && isDateToday(nextSaturday, today)).toBe(false)
  })

  it('不同星期的日期即使在同一周也不高亮', () => {
    const friday = dateOfWeek('2026-09-14', 1, 5)

    expect(friday && isDateToday(friday, today)).toBe(false)
  })
})
