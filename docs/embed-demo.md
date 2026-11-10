# 内嵌课表示例

官网 iframe 使用 `/preview/?demo=1&embed=1`，独立打开使用 `/preview/?demo=1`。路径前缀由现有反代负责。参数在应用模块加载时读取，修改参数需要重新载入页面。

| 参数 | 行为 |
| --- | --- |
| `demo=1` | 使用独立示例数据，跳过公共访问口令和公共课表导入。 |
| `embed=1` | 使用内存返回栈，弹层不向浏览器写入历史，不改变宿主页地址。 |
| `theme=light` 或 `theme=dark` | 指定示例主题。省略时使用浅色。只在演示模式应用。 |

主题同步可更新 iframe 的 `src`，例如 `/preview/?demo=1&embed=1&theme=dark`。此入口没有 postMessage 接口。

## 布局和交互不变量

演示保留现有课表组件。初始显示周一到周五的网格，默认第 2 周，支持前后切周、周次跳转、网格与周视图切换及课程详情。桌面和窄屏均不显示管理、登录、导入、分享和编辑入口，也不进入平板双栏。

示例使用三行节次表头，并按 iframe 的实际内容宽度计算网格列宽，避免内边距叠加原有 320 像素下限后裁掉周五课程。

```text
┌───────────────────────────────────┐
│          上一周  第2周  下一周     │
│             周视图／网格          │
│              示例提示            │
├──────┬─────┬─────┬─────┬─────┬─────┤
│ 节次 │ 周一│ 周二│ 周三│ 周四│ 周五│
│      │     可点击的真实课程卡     │
│      │      内容在 iframe 内滚动   │
└──────┴────────────────────────────┘
```

工具栏、视图切换、示例提示、课表的顺序固定。课程详情在 iframe 内打开底部弹层，点击遮罩关闭。宿主页提供独立打开链接，演示自身不导航到顶层。

## 数据隔离

IndexedDB 使用 `sleepy-demo-v1`，普通模式继续使用 `sleepy`。所有应用本地偏好和会话偏好经过存储门面，演示键统一加 `sleepy-demo-v1:` 前缀，读取、写入、枚举和清理均受命名空间约束。课表页临时周次和视图状态由当前文档的 Zustand store 持有。

演示复用 `sampleTable.ts` 的 9 门课程，不调用会清库的 `loadPublicSchedule`。每次进入在独立事务中写入示例并将开始日期定位到上周一，使第 2 周始终非空。刷新同时恢复示例主题和布局。演示种子检查模式和数据库名称，拒绝向普通数据库写入。

演示不启动提醒引擎，不注册 Service Worker。已有的普通应用 Service Worker 不会被卸载。iframe 需要允许脚本和同源存储；可以继续禁止顶层导航。

## 验证与发布同步

单测覆盖真实数据哨兵、偏好命名空间、重复启动、旧学期恢复、公共口令与课表绕过以及 iframe 内存返回栈。`src/e2e/demo.e2e.test.ts` 在宽 320 像素的 sandbox iframe 中验证切周、详情、主题、无横向溢出，以及宿主页历史、地址和真实数据保持不变；同时验证桌面独立打开入口。

普通构建继续使用 `npm run build`。可通过 `BASE_PATH=/preview/ npm run build` 验证直接子路径部署；现有根路径 Worker 上游仍使用 `BASE_PATH=/`，由官网反代转发 `/preview/`。

发布必须同步 sleepy-web 的实际 Worker 上游。GitHub Pages 和 Cloudflare Worker 是两条独立工作流，不能只核对 Pages。合并后应确认 `Deploy to Cloudflare Worker` 在最终提交上成功，再从 `sleepy.qdp.qzz.io/?demo=1&embed=1` 和官网 `/preview/?demo=1&embed=1` 核对实际交互。

2026年11月10日通过 Cloudflare 只读 API 核对，`sleepy.qdp.qzz.io` 的生产服务为 `sleepy-web-site`，当前版本为 `7077e4a6-223d-4cdf-9024-a7953c4b2f7d`。该版本与 GitHub Actions Worker 运行 `41648213921` 的日志一致，来自 `514b2374ffb53e680b94133d8a151e09fcf756bb`，部署时间为2026年11月3日13:52 UTC。GitHub Pages 配置的 CNAME 为空，入口为 `lingion.github.io/sleepy-web/`。

## 文件清单

模式与存储隔离涉及以下文件。

- `src/runtimeMode.ts`
- `src/storage.ts`
- `src/storage.test.ts`
- `src/data/db.ts`
- `src/data/customThemeStore.ts`
- `src/domain/migration/prefsCodec.ts`
- `src/domain/reminders/fireOnce.ts`
- `src/state/holidayStore.ts`
- `src/state/reminderStore.ts`
- `src/views/mine/GeneralSettingsPage.tsx`

演示启动、界面与返回栈涉及以下文件。

- `src/main.tsx`
- `src/App.tsx`
- `src/publicAccess.ts`
- `src/publicSchedule.ts`
- `src/data/sampleTable.ts`
- `src/data/sampleTable.test.ts`
- `src/demoMode.test.ts`
- `src/state/backStack.ts`
- `src/views/ScheduleView.tsx`
- `src/components/schedule/CardsGridView.tsx`
- `src/theme/global.css`
- `src/e2e/demo.e2e.test.ts`

文档为 `README.md` 和本文。

## 用户要求与实现核验

| 用户原话 | 实现行为与验证 |
| --- | --- |
| 演示启动即有真实非空周课表 | 复用9门课程，进入时重新定位上周一，重复启动与旧学期恢复由单测验证。 |
| 切周、点课程可操作 | 保留真实分页和课程详情组件，浏览器测试执行切周、打开和关闭详情。 |
| demo必须使用独立命名空间 | 独立 IndexedDB、本地偏好和会话偏好，真实库和偏好哨兵保持不变。 |
| 不要求登录、公共访问口令 | demo优先于公开模式，口令和不存在的私有课表构建下仍能启动。 |
| iframe窄屏、不跳转顶层、不劫持宿主页 | 320像素 sandbox测试锁定右列可见、布局顺序、宿主页历史和地址不变。 |
| 可独立打开 | 桌面浏览器测试验证 `?demo=1`，关闭平板双栏和管理入口。 |
| 支持官网主题同步 | 支持 `theme=light` 和 `theme=dark`，浏览器测试核对两种实际背景不同。 |
| 不改sleepy-site，不push、PR、merge | 仅在独立sleepy-web worktree提交，发布由主代理协调。 |
