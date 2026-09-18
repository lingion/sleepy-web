import { describe, it, expect } from 'vitest'
import { previewPeriodTableChange } from './periodTablePreview'
import type { Course } from '../data/types'

function mkCourse(p: Partial<Course>): Course {
  return {
    id: 1, groupId: 'g', tableId: 1, courseName: '课', teacher: '', room: '', note: '', alias: '',
    day: 1, startNode: 1, step: 2, startWeek: 1, endWeek: 16, type: 0, color: '', colorMode: 0,
    ownTime: false, isIrregularNode: false, isIrregularTime: false, startTime: '', endTime: '',
    credit: 0, level: 0, ...partial(p),
  }
}
function partial(p: Partial<Course>): Partial<Course> { return p }

const OLD = JSON.stringify([
  { node: 1, start: '08:00', end: '08:45' },
  { node: 2, start: '08:55', end: '09:40' },
])
const NEW = JSON.stringify([
  { node: 1, start: '08:30', end: '09:15' },
  { node: 2, start: '09:25', end: '10:10' },
])

describe('previewPeriodTableChange (TimeTableUtils 1:1, issue#40 §5.2)', () => {
  it('时间变化课列出 旧时间→新时间 + 变化节次', () => {
    const pv = previewPeriodTableChange(OLD, NEW, [mkCourse({ id: 7, courseName: '高数', startNode: 1, step: 2 })])
    expect(pv.changed.length).toBe(1)
    const ch = pv.changed[0]
    expect(ch.courseId).toBe(7)
    expect(ch.courseName).toBe('高数')
    expect(ch.oldTime).toBe('08:00-09:40')
    expect(ch.newTime).toBe('08:30-10:10')
    expect(ch.changedNodes).toEqual([1, 2])
    expect(pv.unchangedCount).toBe(0)
  })

  it('未变化课计入 unchangedCount', () => {
    const pv = previewPeriodTableChange(OLD, OLD, [mkCourse({ id: 1 }), mkCourse({ id: 2, startNode: 2, step: 1 })])
    expect(pv.changed).toEqual([])
    expect(pv.unchangedCount).toBe(2)
  })

  it('ownTime / isIrregularTime 课不参与解释 (用户 2026-09-16 自定义时间课不动)', () => {
    const pv = previewPeriodTableChange(OLD, NEW, [
      mkCourse({ ownTime: true, startTime: '10:00', endTime: '12:00' }),
      mkCourse({ isIrregularTime: true }),
    ])
    expect(pv.changed).toEqual([])
    expect(pv.unchangedCount).toBe(0) // 不计入 unchanged — Android continue 语义
  })

  it('部分节次变化只列变化节', () => {
    const pv = previewPeriodTableChange(OLD, NEW, [mkCourse({ startNode: 2, step: 1 })])
    expect(pv.changed[0].changedNodes).toEqual([2])
  })

  it('新表缺失该节 → newTime null (节点被删)', () => {
    const short = JSON.stringify([{ node: 1, start: '08:30', end: '09:15' }])
    const pv = previewPeriodTableChange(OLD, short, [mkCourse({ startNode: 2, step: 1 })])
    expect(pv.changed[0].newTime).toBeNull()
  })
})
