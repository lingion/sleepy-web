/**
 * Web 通知发送门面 — CourseNotificationScheduler notify(...) 的 web 等价物。
 * Android NotificationManagerCompat.notify(id, notif) → new Notification(title, {body, tag})。
 * tag 用 fired-once 键: 浏览器按 tag 去重/替换, 同一天同提醒只显示一条, 天然对齐 Android
 * 固定 NOTIFY_* id 的替换语义。点击通知聚焦本站窗口 (Notification.click + clients.matchAll)。
 */

export interface NotifySpec {
  /** Notification.tag — 同 tag 覆盖旧通知 (Android notify(id) 同语义) */
  tag: string
  title: string
  body: string
}

export function notifySupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notifyGranted(): boolean {
  return notifySupported() && Notification.permission === 'granted'
}

/** 发送系统通知; 未授权/不支持静默失败 (调用方已先行 gate granted)。 */
export function postNotify(spec: NotifySpec): void {
  if (!notifyGranted()) return
  try {
    const n = new Notification(spec.title, { body: spec.body, tag: spec.tag })
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch {
    /* 部分移动端浏览器构造函数抛错 — 静默 */
  }
}
