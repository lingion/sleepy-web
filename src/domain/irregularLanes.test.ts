/**
 * 非常规时间课并排分栏 (Android 012fbb69 IrregularLaneLayoutTest 1:1 移植, ref #142)。
 *
 * 用户报障 2026-10-08: ownTime 课与常规课真实时间重叠时层叠覆盖, 看起来像
 * 「多出来的课程覆盖在课表之上」。含 ownTime 成员的簇 → 按小数行几何贪心
 * 分栏, 全部同时可见; 纯节点冲突簇不受影响, 保持 stack/fold/rail 层叠。
 */

import { describe, it, expect } from 'vitest'
import { assignLanes, clusterLanePlan, findClusters } from './conflictLayout'
import { DEFAULT_TIME_JSON } from './timeTable'
import type { Course } from '../data/types'
import type { ClusterRowGeom, LaidOutCourse } from './conflictLayout'

function mkCourse(partial: Partial<Course>): Course {
  return {
    id: 1, groupId: 'g1', tableId: 1, courseName: '课', teacher: 'T', room: 'R',
    note: '', alias: '', day: 1, startNode: 1, step: 2, startWeek: 1, endWeek: 16,
    type: 0, color: '', colorMode: 0, ownTime: false, isIrregularNode: false,
    isIrregularTime: false, startTime: '', endTime: '', credit: 0, level: 0,
    ...partial,
  }
}

describe('assignLanes — 贪心栏位分配 (ConflictLayoutEngine.assignLanes 同构)', () => {
  it('重叠的非常规课与常规课分到不同车道 (安卓数值 6.0/2.0 vs 6.44/1.11)', () => {
    const lanes = assignLanes([
      { id: 1, startFrac: 6.0, spanFrac: 2.0 },
      { id: 2, startFrac: 6.44, spanFrac: 1.11 },
    ])
    expect(lanes.size).toBe(2)
    expect(lanes.get(1)).toBe(0)
    expect(lanes.get(2)).toBe(1)
  })

  it('时间不重叠的课程共用同一车道', () => {
    const lanes = assignLanes([
      { id: 1, startFrac: 0, spanFrac: 1 },
      { id: 2, startFrac: 1, spanFrac: 1 },
    ])
    expect(lanes.get(1)).toBe(0)
    expect(lanes.get(2)).toBe(0)
  })

  it('三课重叠时第三个可回收已释放车道', () => {
    // A: [0,2) B: [1,3) C: [2.5,4) — C 与 B 重叠但与 A 不重叠 → 车道 0
    const lanes = assignLanes([
      { id: 1, startFrac: 0, spanFrac: 2 },
      { id: 2, startFrac: 1, spanFrac: 2 },
      { id: 3, startFrac: 2.5, spanFrac: 1.5 },
    ])
    expect(lanes.get(1)).toBe(0)
    expect(lanes.get(2)).toBe(1)
    expect(lanes.get(3)).toBe(0)
  })
})

describe('clusterLanePlan — laneMode 触发闸 (Android drawList.any{frac})', () => {
  const g = (startFrac: number, spanFrac: number): ClusterRowGeom => ({ startFrac, spanFrac })
  const laid = (id: number): LaidOutCourse => ({
    course: mkCourse({ id }), zRank: 0, hidden: false, variant: 'NONE', chainFront: false,
  })

  it('纯节点簇 (无 frac 成员) → null, 保持层叠', () => {
    const plan = clusterLanePlan([laid(1), laid(2)], new Map([[1, g(0, 2)], [2, g(1, 3)]]), new Set())
    expect(plan).toBeNull()
  })

  it('含 ownTime 小数行成员 → 栏数与栏位分配', () => {
    const plan = clusterLanePlan(
      [laid(1), laid(2)],
      new Map([[1, g(6.0, 2.0)], [2, g(6.44, 1.11)]]),
      new Set([2]),
    )
    expect(plan).not.toBeNull()
    expect(plan!.laneCount).toBe(2)
    expect(plan!.laneOf.get(1)).toBe(0)
    expect(plan!.laneOf.get(2)).toBe(1)
  })
})

describe('findClusters — 用户场景 (安卓测试 4)', () => {
  it('常规 7-8 节 + ownTime 16:00-16:50 聚为一簇', () => {
    const regular = mkCourse({ id: 1, day: 5, startNode: 7, step: 2 })
    const irregular = mkCourse({
      id: 2, day: 5, startNode: 7, step: 2,
      ownTime: true, isIrregularTime: true, startTime: '16:00', endTime: '16:50',
    })
    const clusters = findClusters([regular, irregular], DEFAULT_TIME_JSON)
    expect(clusters).toHaveLength(1)
    expect(new Set(clusters[0].courses.map((c) => c.id))).toEqual(new Set([1, 2]))
  })
})
