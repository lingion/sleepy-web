/**
 * 甲案 (设计文档 §2.1-§2.2) — 编辑课表绑定共享作息表时改作息的处理策略。
 *
 * Android: ScheduleEditPolicyState.kt (纯 JVM 状态机, 不依赖 Repository)。
 * Web: 纯 TS 状态机 + 最小订阅器 (StateFlow 对位), 供 EditTableView 驱动
 *      三选项 BottomSheet + 待执行 Banner + 保存流。
 *
 * 不变量 (§2.2):
 *   1. 未改作息 → hasScheduleChanged=false, 普通保存不弹窗
 *   3. selectPolicy 只登记, 不动 draft
 *   5. updateDraft 后 draft≠original → 旧策略失效(NONE)
 *   6. cancelPolicy → draft 恢复 original, 策略清零
 *   7. 三个选项始终显示 (影响数量仅提示文案)
 */

import type { PeriodTable } from '../data/types'

export enum SchedulePolicy {
  NONE = 'NONE',
  DETACH_COPY = 'DETACH_COPY',
  CREATE_NEW = 'CREATE_NEW',
  SYNC = 'SYNC',
}

/** data class equals 对位 — Android 用 PeriodTableEntity.equals 判草稿变化。 */
export function periodTableEquals(a: PeriodTable | null, b: PeriodTable | null): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.nodesPerDay === b.nodesPerDay &&
    a.timeJson === b.timeJson &&
    a.smartConfigJson === b.smartConfigJson
  )
}

/** 一张课表编辑会话的作息冲突状态 (ScheduleEditPolicyState 1:1)。 */
export class EditPolicyState {
  readonly tableId: number
  /** 进入编辑页时刻的实际生效作息快照 (绑定 → 水合源; 未绑定 → null) */
  readonly originalEffectiveSchedule: PeriodTable | null

  private _draft: PeriodTable | null
  private _policy = SchedulePolicy.NONE
  private _listeners = new Set<() => void>()

  constructor(tableId: number, originalEffectiveSchedule: PeriodTable | null) {
    this.tableId = tableId
    this.originalEffectiveSchedule = originalEffectiveSchedule
    this._draft = originalEffectiveSchedule
  }

  get draftEffectiveSchedule(): PeriodTable | null {
    return this._draft
  }

  get pendingSchedulePolicy(): SchedulePolicy {
    return this._policy
  }

  /** StateFlow 订阅对位 — 策略变化时通知 UI 重组。返回取消订阅函数。 */
  subscribe(fn: () => void): () => void {
    this._listeners.add(fn)
    return () => this._listeners.delete(fn)
  }

  private notifyPolicyChanged() {
    for (const fn of this._listeners) fn()
  }

  /** 不变量 1 — data class equals: 任一字段 (timeJson/nodesPerDay/smartConfigJson/name…) 变化都触发。 */
  hasScheduleChanged(): boolean {
    return !periodTableEquals(this._draft, this.originalEffectiveSchedule)
  }

  /** UI 节次编辑区提交草稿。不变量 5: 改了就让旧策略失效, 下一次保存重新弹三选项。 */
  updateDraft(draft: PeriodTable | null) {
    this._draft = draft
    if (!periodTableEquals(draft, this.originalEffectiveSchedule) && this._policy !== SchedulePolicy.NONE) {
      this._policy = SchedulePolicy.NONE
      this.notifyPolicyChanged()
    }
  }

  /** 不变量 3 — 只登记, 不动草稿; 真正的写入仍要等再次保存。 */
  selectPolicy(policy: SchedulePolicy) {
    if (this._policy === policy) return
    this._policy = policy
    this.notifyPolicyChanged()
  }

  /**
   * 不变量 6 — 弹窗取消: 草稿恢复 original + 策略清零。
   * 取消仅影响作息相关改动, 不影响其他字段 (课程行/名称/日期等) — 那些由 UI 自留草稿。
   */
  cancelPolicy() {
    this._draft = this.originalEffectiveSchedule
    if (this._policy !== SchedulePolicy.NONE) {
      this._policy = SchedulePolicy.NONE
      this.notifyPolicyChanged()
    }
  }
}
