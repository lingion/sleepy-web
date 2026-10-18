/**
 * AddCourseView 编辑跳转契约 (ref #144, 安卓 EditCourseJumpToClickedSlotTest 同构)。
 * 用户从周/网格视图点开某节课 → 编辑页必须把「点击时段所在卡」滚进视口。
 * jsdom 无真实滚动: mock scrollIntoView 记录被滚元素, 按卡标题 '时段 N' 断言落位 —
 * 锁的是「滚到哪一块」的顺序语义本身, 不是「存在滚动」(铁律③)。
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { db } from '../data/db'
import { AddCourseView } from './AddCourseView'
import { initI18n } from '../i18n'
import { useUndoStore } from '../data/undoStore'
import type { Course } from '../data/types'

beforeAll(() => {
  initI18n('zh-CN')
})

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  useUndoStore.setState({ slot: null, batchDepth: 0, batchCaptured: false, restoring: false })
  await db.delete()
  await db.open()
})

const TIME_JSON = JSON.stringify([
  { node: 1, start: '08:00', end: '08:45' },
  { node: 2, start: '08:55', end: '09:40' },
  { node: 3, start: '10:00', end: '10:45' },
])

function mk(partial: Partial<Course>): Course {
  return {
    id: 1, groupId: 'grp1', tableId: 1, courseName: '数学', teacher: '张三', room: 'A101',
    note: '', alias: '', day: 1, startNode: 1, step: 2, startWeek: 1, endWeek: 16, type: 0,
    color: '', colorMode: 1, ownTime: false, isIrregularNode: false, isIrregularTime: false,
    startTime: '', endTime: '', credit: 0, level: 0, ...partial,
  }
}

async function seed(courses: Course[]) {
  await db.timetables.add({
    id: 1, name: '课表A', isDefault: 1, periodTableId: null,
    timeJson: TIME_JSON, smartConfigJson: '', startDate: '2026-09-07',
    nodeCount: 12, maxWeek: 20, createdAt: 0,
  })
  await db.courses.bulkPut(courses)
}

/** mock scrollIntoView: 在元素上打 data-scrolled 标记 */
function captureScroll() {
  const spy = vi.fn(function (this: Element) {
    this.setAttribute('data-scrolled', '1')
  })
  Element.prototype.scrollIntoView = spy as unknown as typeof Element.prototype.scrollIntoView
  return spy
}

describe('AddCourseView 编辑跳转 (ref #144)', () => {
  it('点第二时段卡的课 → 滚动落在「时段 2」卡 (PK 命中 sourceIds)', async () => {
    const c1 = mk({ id: 1, day: 1, startNode: 1, step: 2 })
    const c2 = mk({ id: 2, day: 3, startNode: 3, step: 1 })
    await seed([c1, c2])
    const spy = captureScroll()

    render(<AddCourseView editingCourse={c2} onBack={vi.fn()} onSaved={vi.fn()} />)
    // 回填两条时段卡
    await waitFor(() => expect(screen.getByText('时段 2')).toBeTruthy())
    await waitFor(() => expect(spy).toHaveBeenCalled())

    const scrolled = Array.from(document.querySelectorAll('[data-scrolled="1"]'))
    expect(scrolled).toHaveLength(1)
    expect(scrolled[0].textContent).toContain('时段 2')
    expect(scrolled[0].textContent).not.toContain('时段 1')
  })

  it('点第一时段卡的课 → 滚动落在「时段 1」卡 (首卡也要滚, 安卓 v3 语义)', async () => {
    const c1 = mk({ id: 1, day: 1, startNode: 1, step: 2 })
    const c2 = mk({ id: 2, day: 3, startNode: 3, step: 1 })
    await seed([c1, c2])
    const spy = captureScroll()

    render(<AddCourseView editingCourse={c1} onBack={vi.fn()} onSaved={vi.fn()} />)
    await waitFor(() => expect(spy).toHaveBeenCalled())
    const scrolled = document.querySelectorAll('[data-scrolled="1"]')
    expect(scrolled).toHaveLength(1)
    expect(scrolled[0].textContent).toContain('时段 1')
  })

  it('空 groupId 存量课 → 自身初始卡照样落位 (组回填为空的例外路径)', async () => {
    const c = mk({ id: 5, groupId: '', day: 2, startNode: 1, step: 2 })
    await seed([c])
    const spy = captureScroll()

    render(<AddCourseView editingCourse={c} onBack={vi.fn()} onSaved={vi.fn()} />)
    await waitFor(() => expect(spy).toHaveBeenCalled())
    const scrolled = document.querySelectorAll('[data-scrolled="1"]')
    expect(scrolled).toHaveLength(1)
    expect(scrolled[0].textContent).toContain('时段 1')
  })

  it('新建模式 (无 editingCourse) → 不滚动', async () => {
    await seed([])
    const spy = captureScroll()
    render(<AddCourseView onBack={vi.fn()} onSaved={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('时段 1')).toBeTruthy())
    expect(spy).not.toHaveBeenCalled()
  })

  it('同课程同回填形态只滚一次 — 卡数变化不劫持视口', async () => {
    const c1 = mk({ id: 1, day: 1, startNode: 1, step: 2 })
    const c2 = mk({ id: 2, day: 3, startNode: 3, step: 1 })
    await seed([c1, c2])
    const spy = captureScroll()
    const { rerender } = render(<AddCourseView editingCourse={c2} onBack={vi.fn()} onSaved={vi.fn()} />)
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
    // 再渲染一轮 (props 引用不变, 但触发 effect deps 检查路径)
    rerender(<AddCourseView editingCourse={c2} onBack={vi.fn()} onSaved={vi.fn()} />)
    await new Promise((r) => setTimeout(r, 0))
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
