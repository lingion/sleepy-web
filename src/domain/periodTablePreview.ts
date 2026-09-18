/**
 * 作息表保存前预览 — TimeTableUtils.previewPeriodTableChange 1:1 (issue#40 §5.2)。
 * 对比新旧 timeJson 下全部绑定课表课程的时间变化; ownTime/isIrregularTime 课不参与解释
 * (起止照旧)。逐课产出 旧时间→新时间 + 变化节次列表, 供确认弹窗列出 (用户 2026-09-16:
 * 改早八必须列出所有第一节课的课程名+几点到几点)。
 */

import { parseNodes, courseTimeParts } from './timeTable'
import type { Course } from '../data/types'

export interface CourseTimeChange {
  courseId: number
  courseName: string
  startNode: number
  step: number
  oldTime: string | null
  newTime: string | null
  changedNodes: number[]
}

export interface PeriodTablePreview {
  changed: CourseTimeChange[]
  unchangedCount: number
}

export function previewPeriodTableChange(
  oldTimeJson: string,
  newTimeJson: string,
  courses: Course[],
): PeriodTablePreview {
  const changed: CourseTimeChange[] = []
  let unchangedCount = 0
  const oldNodes = parseNodes(oldTimeJson)
  const newNodes = parseNodes(newTimeJson)
  const nodeTime = (nodes: typeof oldNodes, n: number): [string, string] | null => {
    const hit = nodes.find((x) => x.node === n)
    return hit ? [hit.start, hit.end] : null
  }
  for (const c of courses) {
    if (c.ownTime || c.isIrregularTime) continue // 自定义时间: 起止照旧, 不参与解释
    const endNode = c.startNode + c.step - 1
    const changedNodes: number[] = []
    for (let n = c.startNode; n <= endNode; n++) {
      const o = nodeTime(oldNodes, n)
      const w = nodeTime(newNodes, n)
      if (o?.[0] !== w?.[0] || o?.[1] !== w?.[1]) changedNodes.push(n)
    }
    const oldParts = courseTimeParts(c.startNode, c.step, oldTimeJson)
    const newParts = courseTimeParts(c.startNode, c.step, newTimeJson)
    if (changedNodes.length === 0) {
      unchangedCount++
    } else {
      changed.push({
        courseId: c.id,
        courseName: c.courseName,
        startNode: c.startNode,
        step: c.step,
        oldTime: oldParts ? `${oldParts[0]}-${oldParts[1]}` : null,
        newTime: newParts ? `${newParts[0]}-${newParts[1]}` : null,
        changedNodes,
      })
    }
  }
  return { changed, unchangedCount }
}
