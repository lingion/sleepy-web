/**
 * 返回栈 — MainActivity.kt AppRoot overlayStack (v7.10.8 返回键分层) Web 同构。
 * Android: overlayStack rememberSaveable + BackHandler(enabled = hasOverlay()) 每层只弹自己。
 * Web:     zustand 栈 + history.pushState 进栈 (每层带独立 hash 地址) + popstate 出栈 —
 *          浏览器返回 → 栈非空则出栈一层并广播 popped key, 活动视图同步自己的 page state;
 *          栈空且历史仍是 sleepyTab 占位 → tab 间逐层回退; 真实历史 → 放行浏览器默认。
 *
 * 每页 hash 地址 (用户需求「每一个页面搞成 #首页」): tab 层 pushTab 写 #/课表 等;
 * 二级页 push(key) 写 HASH_BY_KEY (缺省按 key 推导, 斜杠分层 #/我的/通用设置)。
 * 刷新/直达由 tabFromHash + 各视图 hash 恢复; hash 不经服务端, Pages/Worker 双部署均成立。
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
  // 预注册覆盖层 (路由已接, 触发入口待对应分区补齐): 自定义主题编辑器 / 教务导入
  | 'customTheme'
  | 'jwImport'
  // web 扩展: 课表页的临时弹层 (Android 是 Compose 局部 dialog/sheet state,
  // 不入 overlayStack;Web 需要「浏览器返回先关弹层」, 故入同一层栈但用独立 hash —
  // ✗ 复用 editTable, 否则点一门课地址栏会跳到 #/管理/编辑课表)。
  | 'courseDetail'
  | 'weekSwitcher'
  | 'weekJump'
  | 'shareSheet'

export type TabKey = 'schedule' | 'today' | 'manage' | 'mine'

/** 每层 hash 常量表 — push 缺省按 key 推导;斜杠分层 (#/我的/通用设置) */
export const HASH_BY_KEY: Record<BackKey, string> = {
  addCourse: '#/课表/添加课程',
  allTables: '#/管理/全部课表',
  editTable: '#/管理/编辑课表',
  appearance: '#/我的/外观',
  general: '#/我的/通用设置',
  holiday: '#/我的/通用设置/节假日',
  export: '#/管理/导出',
  reminder: '#/我的/提醒',
  about: '#/我的/关于',
  license: '#/我的/许可证',
  customTheme: '#/我的/外观/自定义主题',
  jwImport: '#/我的/教务导入',
  courseDetail: '#/课表/课程详情',
  weekSwitcher: '#/课表/切换课表',
  weekJump: '#/课表/周次跳转',
  shareSheet: '#/课表/分享',
}

export const HASH_BY_TAB: Record<TabKey, string> = {
  schedule: '#/课表',
  today: '#/今日',
  manage: '#/管理',
  mine: '#/我的',
}

/** URL hash → tab (启动恢复/浏览器返回) — 未匹配落 schedule */
export function tabFromHash(hash: string): TabKey {
  const normalized = decodeURIComponent(hash).toLowerCase()
  if (normalized === HASH_BY_TAB.today.toLowerCase()) return 'today'
  if (normalized === HASH_BY_TAB.manage.toLowerCase()) return 'manage'
  if (normalized === HASH_BY_TAB.mine.toLowerCase()) return 'mine'
  return 'schedule'
}

/** URL hash 解码 (浏览器对中文 hash 自动编码) */
export function pageHash(hash: string): string {
  try {
    return decodeURIComponent(hash)
  } catch {
    return hash
  }
}

interface BackStackState {
  stack: BackKey[]
  push: (key: BackKey, hash?: string) => void
  pushTab: (tab: TabKey) => void
  /** 规范化当前条目 hash 而不新增历史 (刷新/直达带 hash 进入时用) */
  replaceTab: (tab: TabKey) => void
  pop: () => void
  popToRoot: () => void
  peek: () => BackKey | undefined
  reset: () => void
}

export const useBackStack = create<BackStackState>((set, get) => ({
  stack: [],

  push: (key, hash = HASH_BY_KEY[key]) => {
    set((s) => ({ stack: [...s.stack, key] }))
    // 进栈写本层 hash — 浏览器返回键 → popstate → popHandler 出栈一层 + 通知活动视图
    try {
      history.pushState({ sleepyBack: true, key }, '', hash)
    } catch {
      /* 非浏览器环境 (单测) */
    }
  },

  pushTab: (tab) => {
    // tab 层专用入口 — 切 tab 写 hash (不进返回栈, tab 间返回由 popstate 直接切)
    try {
      if (location.hash !== HASH_BY_TAB[tab]) history.pushState({ sleepyTab: true, tab }, '', HASH_BY_TAB[tab])
    } catch {
      /* 非浏览器环境 (单测) */
    }
  },

  replaceTab: (tab) => {
    // 只规范化地址, 不新增历史 — 避免刷新/直达时在历史里留一个无内容的占位条目,
    // 那会让"从课表页按返回"多按一次才离开 (Android 双击退出只需一次)。
    try {
      if (location.hash !== HASH_BY_TAB[tab]) history.replaceState({ sleepyTab: true, tab }, '', HASH_BY_TAB[tab])
    } catch {
      /* 非浏览器环境 (单测) */
    }
  },

  pop: () => {
    const { stack } = get()
    if (stack.length === 0) return
    // 乐观出栈 (UI 立即响应), 再让浏览器退掉这条历史;
    // selfBackPending 记账 — popstate 到达时不得再弹一次 (否则一次返回跨两级)。
    set((s) => ({ stack: s.stack.slice(0, -1) }))
    try {
      if ((history.state as { sleepyBack?: boolean } | null)?.sleepyBack) {
        selfBackPending = Math.min(selfBackPending + 1, 8)
        history.back()
      }
    } catch {
      /* 非浏览器环境 */
    }
  },

  popToRoot: () => {
    // 一次清整摞 — 历史残留由 popHandler 的"栈空但历史仍是 sleepyBack"兜底逐条退
    set({ stack: [] })
    try {
      if ((history.state as { sleepyBack?: boolean } | null)?.sleepyBack) {
        selfBackPending = Math.min(selfBackPending + 1, 8)
        history.back()
      }
    } catch {
      /* 非浏览器环境 */
    }
  },

  peek: () => get().stack[get().stack.length - 1],

  reset: () => {
    // 记账一并清零 — 否则一次没等到 popstate 的 pop 会永久吞掉后续一次真返回
    selfBackPending = 0
    set({ stack: [] })
  },
}))

/**
 * popstate 接线 — App 挂载时调一次 (带活动视图回退回调)。
 * 浏览器返回 → 栈非空: 出栈一层 + onPop(弹出的 key) 通知视图同步 page state;
 * 栈空但历史残留 sleepyBack/sleepyTab 态: 继续退直至真实历史。
 */
type PopListener = (popped: BackKey | undefined, hash: string) => void
const popListeners = new Set<PopListener>()
let popstateInstalled = false
// 自己调 history.back() 的次数 — pop() 已乐观出栈, history.back() 的 popstate 是
// 异步的, 到达时若再弹一次 = 一次返回跨两级 (v7.10.8「每层只弹自己」被破坏)。
let selfBackPending = 0

/**
 * 注册活动视图回退监听器。模块只装一个 popstate handler,避免 App/Mine 等多个
 * 订阅者各自弹一次栈;同一 popped key 广播给所有订阅者。
 */
export function installBackHandler(onPop?: PopListener): () => void {
  if (onPop) popListeners.add(onPop)
  if (!popstateInstalled) {
    window.addEventListener('popstate', onPopState)
    popstateInstalled = true
  }
  return () => {
    if (onPop) popListeners.delete(onPop)
    if (popListeners.size === 0) {
      window.removeEventListener('popstate', onPopState)
      popstateInstalled = false
    }
  }
}

function onPopState() {
  const hash = pageHash(location.hash)
  // 自己 pop() 触发的那次: 栈已同步, 只广播 hash, 不再弹一层
  if (selfBackPending > 0) {
    selfBackPending -= 1
    for (const listener of popListeners) listener(undefined, hash)
    return
  }
  const { stack } = useBackStack.getState()
  let popped: BackKey | undefined
  if (stack.length > 0) {
    popped = stack[stack.length - 1]
    useBackStack.setState({ stack: stack.slice(0, -1) })
  }
  for (const listener of popListeners) listener(popped, hash)
}
