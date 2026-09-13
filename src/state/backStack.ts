/**
 * 返回栈 — MainActivity.kt AppRoot overlayStack (v7.10.8 返回键分层) Web 同构。
 * Android: overlayStack rememberSaveable + BackHandler(enabled = hasOverlay()) 每层只弹自己。
 * Web:     zustand 栈 + history.pushState 进栈 + popstate 监听出栈 —
 *          浏览器返回 → 栈非空则 popstate 拦截出栈回退 Web 页面; 栈空放行浏览器默认。
 *
 * 二级页 push 时调 push(key) (写 history); 用户点返回按钮调 pop()。
 * pop() 同步: 栈出 + history.back() 触发 popstate → 监听器发现栈已出, 不再重复 pop。
 * 栈空时 popstate (浏览器返回) → 放行浏览器默认行为 (离开页面)。
 *
 * key 语义 = OverlayScreen 枚举 AddCourse/AllTables/EditTable/Theme/General/Holiday/
 * Export/Reminder/About/License + web 扩展 (Web 独立页不硬仿 Android 的部分)。
 */

import { create } from 'zustand'

export type BackKey =
  | 'addCourse'
  | 'allTables'
  | 'editTable'
  | 'appearance'
  | 'general'
  | 'holiday'
  | 'export'
  | 'reminder'
  | 'about'
  | 'license'

interface BackStackState {
  stack: BackKey[]
  push: (key: BackKey) => void
  pop: () => void
  popToRoot: () => void
  peek: () => BackKey | undefined
  reset: () => void
}

export const useBackStack = create<BackStackState>((set, get) => ({
  stack: [],

  push: (key) => {
    set((s) => ({ stack: [...s.stack, key] }))
    // 浏览器历史进一条空态 — 浏览器返回键 → popstate → popHandler 出栈一层
    try {
      history.pushState({ sleepyBack: true }, '')
    } catch {
      /* 非浏览器环境 (单测) */
    }
  },

  pop: () => {
    const { stack } = get()
    if (stack.length === 0) return
    // 先出栈再 history.back() — popstate 到达时栈已出, popHandler 见长度一致不重复弹
    set((s) => ({ stack: s.stack.slice(0, -1) }))
    try {
      if ((history.state as { sleepyBack?: boolean } | null)?.sleepyBack) history.back()
    } catch {
      /* 非浏览器环境 */
    }
  },

  popToRoot: () => {
    // 一次清整摞 — 历史残留由 popHandler 的"栈空但历史仍是 sleepyBack"兜底逐条退
    set({ stack: [] })
    try {
      if ((history.state as { sleepyBack?: boolean } | null)?.sleepyBack) history.back()
    } catch {
      /* 非浏览器环境 */
    }
  },

  peek: () => get().stack[get().stack.length - 1],

  reset: () => set({ stack: [] }),
}))

/**
 * popstate 接线 — App 挂载时调一次。
 * 浏览器返回 → popstate → 栈非空: 出栈一层 (拦下, 不离开页面);
 * 栈空但历史残留 sleepyBack 态 (popToRoot 只退了一条): 继续退直至真实历史。
 */
export function installBackHandler(): () => void {
  const onPop = () => {
    const { stack } = useBackStack.getState()
    if (stack.length > 0) {
      useBackStack.setState({ stack: stack.slice(0, -1) })
      return
    }
    // 栈空: 若当前历史条目仍是 pushState 的占位态, 继续退 (popToRoot 残留兜底)
    try {
      if ((history.state as { sleepyBack?: boolean } | null)?.sleepyBack) history.back()
    } catch {
      /* 非浏览器环境 */
    }
  }
  window.addEventListener('popstate', onPop)
  return () => window.removeEventListener('popstate', onPop)
}
