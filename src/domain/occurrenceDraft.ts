import { normalizeNode, type Course } from '../data/types'
import { parseHM, parseTimeSlotRows } from './timeTable'

/** OccurrenceEditor.kt validates configured rows, not the rendered placeholder rows. */
export function validateOccurrenceNodes(timeJson: string, startNode: number, step: number, floating = false) {
  const rows = parseTimeSlotRows(timeJson)
  if (!Number.isSafeInteger(startNode) || !Number.isSafeInteger(step) || step < 1 || step > rows.length ||
    (floating && startNode < 1) || !Number.isSafeInteger(startNode + step) ||
    Array.from({ length: step }, (_, i) => startNode + i).some((node) => !rows.some((row) => row.node === node))) {
    throw new Error('请选择有效的连续节次')
  }
  return rows
}

export function prepareOccurrenceDraft(original: Course, draft: Course, timeJson: string): Course {
  const rows = validateOccurrenceNodes(timeJson, draft.startNode, draft.step)
  const custom = draft.ownTime || draft.isIrregularTime
  const startTime = draft.startTime.trim(), endTime = draft.endTime.trim()
  if (custom && (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime) ||
    !Number.isFinite(parseHM(startTime)) || !Number.isFinite(parseHM(endTime)) || parseHM(endTime) <= parseHM(startTime))) {
    throw new Error('结束时间需要晚于开始时间')
  }
  return normalizeNode({ ...draft, room: draft.room === original.room ? original.room : draft.room.trim(),
    ownTime: custom, isIrregularTime: custom, isIrregularNode: rows.some((row) => row.node === draft.startNode && row.edgeClass !== null),
    startTime: custom ? startTime : '', endTime: custom ? endTime : '' }, timeJson)
}
