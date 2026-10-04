/**
 * 甲案 作息冲突三选项 — 编辑会话状态模型契约 (移植 ScheduleEditPolicyStateTest 1:1):
 * 锁不变量 1/3/4/5/6 + null 自洽。纯内存, 不触 DB。
 */

import { describe, it, expect } from 'vitest'
import { EditPolicyState, SchedulePolicy } from './schedulePolicy'
import type { PeriodTable } from '../data/types'

function pt(over: Partial<PeriodTable> = {}): PeriodTable {
  return {
    id: 7,
    name: '2024 秋季作息',
    nodesPerDay: 12,
    timeJson: '[{"node":1,"start":"08:00","end":"08:45"}]',
    smartConfigJson: '',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

describe('EditPolicyState (ScheduleEditPolicyState 1:1)', () => {
  it('invariant1: 初始无策略且视为未改', () => {
    const s = new EditPolicyState(1, pt())
    expect(s.pendingSchedulePolicy).toBe(SchedulePolicy.NONE)
    expect(s.hasScheduleChanged()).toBe(false)
    expect(s.draftEffectiveSchedule).toEqual(pt())
  })

  it('invariant1: 值相等判改动 (非引用)', () => {
    const original = pt()
    const s = new EditPolicyState(1, original)
    s.updateDraft(pt({ timeJson: '[{"node":1,"start":"08:30","end":"09:15"}]' }))
    expect(s.hasScheduleChanged()).toBe(true)
  })

  it('invariant1: 改了又改回原样 = 未改', () => {
    const original = pt()
    const s = new EditPolicyState(1, original)
    s.updateDraft(pt({ name: '临时名' }))
    s.updateDraft(pt())
    expect(s.hasScheduleChanged()).toBe(false)
  })

  it('invariant3: selectPolicy 只登记不动草稿', () => {
    const original = pt()
    const s = new EditPolicyState(1, original)
    s.updateDraft(pt({ timeJson: 'edited-json' }))
    s.selectPolicy(SchedulePolicy.DETACH_COPY)
    expect(s.pendingSchedulePolicy).toBe(SchedulePolicy.DETACH_COPY)
    expect(s.draftEffectiveSchedule!.timeJson).toBe('edited-json')
  })

  it('invariant4/7: 三选项全部可选', () => {
    for (const p of [SchedulePolicy.DETACH_COPY, SchedulePolicy.CREATE_NEW, SchedulePolicy.SYNC]) {
      const s = new EditPolicyState(3, pt())
      s.updateDraft(pt({ timeJson: 'x' }))
      s.selectPolicy(p)
      expect(s.pendingSchedulePolicy).toBe(p)
    }
  })

  it('invariant5: 选择后再改作息 → 旧策略失效', () => {
    const original = pt()
    const s = new EditPolicyState(1, original)
    s.updateDraft(pt({ timeJson: 'a' }))
    s.selectPolicy(SchedulePolicy.CREATE_NEW)
    expect(s.pendingSchedulePolicy).toBe(SchedulePolicy.CREATE_NEW)
    s.updateDraft(pt({ timeJson: 'b' }))
    expect(s.pendingSchedulePolicy).toBe(SchedulePolicy.NONE)
    expect(s.hasScheduleChanged()).toBe(true)
  })

  it('invariant5 事件: 策略失效要通知订阅者 (Banner 消失依赖)', () => {
    const s = new EditPolicyState(1, pt())
    s.updateDraft(pt({ timeJson: 'a' }))
    s.selectPolicy(SchedulePolicy.SYNC)
    let notified = 0
    const unsub = s.subscribe(() => notified++)
    s.updateDraft(pt({ timeJson: 'b' }))
    expect(notified).toBe(1)
    unsub()
  })

  it('invariant6: 取消恢复 original 草稿 + 清策略', () => {
    const original = pt()
    const s = new EditPolicyState(1, original)
    s.updateDraft(pt({ name: '别的作息', nodesPerDay: 14 }))
    s.selectPolicy(SchedulePolicy.SYNC)
    s.cancelPolicy()
    expect(s.draftEffectiveSchedule).toEqual(original)
    expect(s.pendingSchedulePolicy).toBe(SchedulePolicy.NONE)
    expect(s.hasScheduleChanged()).toBe(false)
  })

  it('未绑定课表: null 快照自洽', () => {
    const s = new EditPolicyState(2, null)
    expect(s.hasScheduleChanged()).toBe(false)
    s.updateDraft(pt())
    expect(s.hasScheduleChanged()).toBe(true)
    s.cancelPolicy()
    expect(s.draftEffectiveSchedule).toBeNull()
    expect(s.pendingSchedulePolicy).toBe(SchedulePolicy.NONE)
  })
})
