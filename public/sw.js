/* eslint-env serviceworker */
/**
 * Sleepy Web service worker — P4 通知事件 + P5 离线缓存。
 * 缓存策略 (无构建注入 → 纯运行时):
 *  - 导航请求: network-first, 断网回落上次 index (离线可开, 数据本就在 IndexedDB);
 *  - 同域 hashed 静态资源 (/assets/): cache-first, 不可变内容永久命中;
 *  - 其他同域请求: network-only 不缓存 (避免脏 API/动态响应)。
 * 版本换代在 activate 清旧桶。
 */

const VERSION = 'sleepy-v1'
const CACHE_INDEX = `${VERSION}-index`
const CACHE_ASSETS = `${VERSION}-assets`

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (!key.startsWith(VERSION)) await caches.delete(key)
    }
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE_INDEX).then((c) => c.put(req, copy))
          return res
        })
        .catch(async () => (await caches.match(req)) ?? (await caches.match('./')))
    )
    return
  }

  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE_ASSETS).then((c) => c.put(req, copy))
            }
            return res
          })
      )
    )
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus()
      }
      return self.clients.openWindow('./')
    })
  )
})

self.addEventListener('notificationclose', () => {
  /* 无状态可清 — 提醒去重台账 (sleepy_reminder_fired) 在页内维护 */
})
