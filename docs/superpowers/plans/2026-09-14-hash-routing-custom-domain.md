# Sleepy Web — 每页 hash 地址 + Cloudflare 自定义域名 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 部署 SPA 到 `sleepy.qdp.qzz.io`(已完成) + 底部 4 tab 与全部二级页各自独立 hash 地址,浏览器返回键逐页回退、刷新停在当前页。

**Architecture:** `backStack.ts` 升级为「栈条目带 hash」模型 — 每层 push 同时 `history.pushState` 写入 hash;`popstate` 到达时出栈并发布「当前层」供视图订阅。App.tsx 的 tab 与 MineView/ScheduleView/ManageView 的二级页 page state 改由「栈顶层」驱动,消除「popstate 清栈但视图不动」的现有断链。

**Tech Stack:** React 19 + TypeScript + Zustand;无新依赖。

## Global Constraints

- hash 用中文界面词:`#课表/#今日/#管理/#我的` + 二级页 `#/我的/通用设置` 形态(斜杠分层)。
- commit 作者 `lingion <lingion@hrbeu.edu.cn>`;禁 `Co-Authored-By: Claude`;禁 `Fixes:/Closes:/Resolves: #N`。
- push 前扫 `git log origin/main..main -i --grep="Fixes|Closes|Resolves"`。
- 禁 emoji;✓✗⚠ 符号可用。
- Worker 已部署 (`sleepy-web-site`, Version 73a67d38),重部署命令在 `site/wrangler.toml` 注释。

---

### Task 1: backStack.ts hash 化 — 栈条目带 hash + popstate 发布当前层

**Files:**
- Modify: `src/state/backStack.ts`
- Test: `src/state/backStack.test.ts`

**Interfaces:**
- Produces:
  - `type BackKey = TabKey | OverlayKey`(不变,仍是 10 个字面量)
  - `push(key: BackKey, hash?: string): void` — hash 缺省时按 `HASH_BY_KEY[key]` 推导
  - `pop(): void`、`popToRoot(): void`、`peek(): BackKey | undefined`、`reset(): void` 不变
  - `HASH_BY_KEY: Record<BackKey, string>` — 每层 hash 常量表
  - `installBackHandler(onPop?: (key: BackKey) => void): () => void` — 可选回调(视图用它同步 page state)
  - `pushTab(tab: TabKey)` / `restoreFromHash(): void` — tab 层专用入口 + 启动恢复

- [ ] **Step 1: 写失败测试** — 锁三件事:①push('general') 后 `location.hash === '#/我的/通用设置'` ②popstate 回调收到 'general' ③restoreFromHash() 从 URL 恢复栈
- [ ] **Step 2: 跑测试确认失败** — `npx vitest run src/state/backStack.test.ts`
- [ ] **Step 3: 实现** — push 写 `history.pushState({sleepyBack:true},'', hash)`;installBackHandler 出栈后调 onPop(栈顶 key)
- [ ] **Step 4: 跑测试确认通过** — 全量 `npx vitest run`
- [ ] **Step 5: Commit** — `git commit -m "feat(web): hash-address every back-stack layer"`

### Task 2: App.tsx tab 层接 hash — setTab 写地址 + popstate 切 tab

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `pushTab/restoreFromHash` (Task 1)
- Produces: tab 变化 ↔ URL hash 双向同步;浏览器返回在 tab 间逐层退

- [ ] **Step 1: 实现** — 挂载 `restoreFromHash()` 恢复初始 tab;`setTab` 调 `pushTab(key)`;浏览器返回跨 tab 回退
- [ ] **Step 2: 跑全量测试 + build** — `npx vitest run && npx tsc -b && npx vite build`
- [ ] **Step 3: Commit** — `git commit -m "feat(web): bottom tabs get their own hash addresses"`

### Task 3: 三个视图二级页接 hash — popstate 同步 page state

**Files:**
- Modify: `src/views/MineView.tsx`、`src/views/ScheduleView.tsx`、`src/views/ManageView.tsx`

**Interfaces:**
- Consumes: `installBackHandler(onPop)` (Task 1)
- Produces: 二级页 ↔ hash 双向同步;刷新/直达恢复到该页

- [ ] **Step 1: 实现** — 各视图挂载时 `installBackHandler` 传入本视图回退回调(把 page state 退一层);go() 的 push 带 hash
- [ ] **Step 2: 跑全量测试 + build**
- [ ] **Step 3: Commit** — `git commit -m "feat(web): secondary pages get hash addresses with browser-back sync"`

### Task 4: 部署 + 线上验证

**Files:**
- Modify: `site/wrangler.toml`(仅注释版本号)

- [ ] **Step 1: 部署** — `cd site && CLOUDFLARE_API_TOKEN=$(cat ~/.cloudflare-token) npx --prefix ~/proxy wrangler deploy`
- [ ] **Step 2: 线上验证** — curl 首页 + `/#我的/通用设置` SPA 回退 200 + bundle sha256 对本地
- [ ] **Step 3: Commit** — `git commit -m "chore(web): redeploy site worker with hash routing"`

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| 中文 hash 需 URL 编码 | 浏览器自动编码,`location.hash` 读回 decodeURIComponent | restoreFromHash 统一 decode |
| 弹窗(课程详情/切表/分享)无 hash | 与约定一致,维持返回栈 | 不改 |
| GitHub Pages 与 Worker 双部署 | hash 在两者下都成立(hash 不经服务端) | 无需分流 |

## Open Questions

- 无(域名大小写:DNS 不敏感,`Sleepy.qdp.qzz.io` 同样解析)。
