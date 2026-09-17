/**
 * 课表页会话状态 — MainActivity AppRoot 会话层 1:1 (基线 §1.4 视图模式会话契约)。
 *
 * Android 契约 (ScheduleViewModeSessionContractTest 四条锁):
 * - viewMode 是**会话级状态**, 由 AppRoot 持有 (scheduleViewMode), 不是 ScheduleScreen 局部态 —
 *   overlay(加课/编辑课程)、tab 切换整页移除后**回来视图模式保持**不重置。
 * - 启动初值读 startView 偏好(周视图|网格); **手动切换只写会话态, 不回写 prefs** —
 *   启动默认与会话内切换是两回事 ("周视图设为默认的话, 从其他页面返回就回到周视图;
 *   编辑课表按返回, 还是回到默认视图" — 用户口头基线 2026-09-10)。
 * - selectedWeek 同在 ViewModel 会话层: 首载落真实周, 之后编辑/删课/切 tab 保存回来
 *   仍停原周 (v7.10.16s); 切表 = 新学期语境才重置回真实周 (initialWeekSettled 复位)。
 *
 * Web 侧对应: zustand 模块级 store 进程生命周期同会话 — App.tsx(tab 壳)与
 * ScheduleView(tab 内容)谁卸载都不丢。
 */

import { create } from 'zustand'

export type ScheduleViewMode = 'full' | 'cards'

interface ScheduleSessionState {
  /** null = 未手动切换过, 显示层落到 startView 偏好 (Android remember { getStartView() } 同) */
  viewMode: ScheduleViewMode | null
  /** null = 跟随真实周 (Android selectedWeek 首载真实周同); 切表后由视图层复位 */
  week: number | null
  setViewMode: (v: ScheduleViewMode) => void
  setWeek: (w: number | null) => void
  /** 切表 = 新学期语境 — 周选择与手动视图都复位 (Android initialWeekSettled=false 同语义) */
  resetForTableSwitch: () => void
}

export const useScheduleSessionStore = create<ScheduleSessionState>((set) => ({
  viewMode: null,
  week: null,
  setViewMode: (v) => set({ viewMode: v }),
  setWeek: (w) => set({ week: w }),
  resetForTableSwitch: () => set({ viewMode: null, week: null }),
}))
