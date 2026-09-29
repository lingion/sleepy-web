# Sleepy Web

Sleepy 课程表 Android 应用 (~/sleepy) 的 Web 端 1:1 复刻。部署目标: `https://lingion.github.io/sleepy-web/`

## 命令

```bash
npm install        # 安装依赖 (npmmirror)
npm test           # vitest 单测 (494 用例, 24 文件)
npm run build      # tsc + vite 生产构建 → dist/
npm run dev        # 本地开发 (注意: 用户偏好静态验证, 跑 dev server 前先问)
```

## 架构 (与 Android 1:1 镜像)

| Android | Web |
|---|---|
| Room v6 (CourseEntity/TimeTableEntity) | Dexie 4 (`src/data/db.ts`) |
| ScheduleRepository 14 写方法 + captureForUndo | `src/data/repository.ts` + `undoStore.ts` |
| TimeTableUtils.kt (621 行) | `src/domain/timeTable.ts` |
| ConflictLayoutEngine.kt (699 行) | `src/domain/conflictLayout.ts` |
| CourseColorUtil.kt (320 行) | `src/domain/courseColor.ts` |
| ThemePresets 5 套 × light/dark | `src/theme/themes.ts` |
| res/values-* 6 语言 | `src/i18n/*.json` (619 keys 基准) |
| MainActivity 4 Tab | `src/App.tsx` |

## 教务解析 (30 协议族)

粘贴教务 HTML/JSON → 30 协议族解析器 (正方双代 / 强智家族 / 强智App / 超星 / 金智 / EAMS5 等)， 对齐 Android 主仓 `JwParserRegistry`。协议族以 `src/domain/jw/parserRegistry.ts` FACTORIES 为准；单校特有协议 (如 yethan/xju_post) 以 Android 端先行，Web 端按移植计划跟进。
CORS 中转 Worker: `worker/` → https://sleepy-jw-proxy.lingion04.workers.dev (浏览器跨校抓取用)。

## 自部署家庭课表（Vercel / Cloudflare Workers）

这是“复制项目 → 放入自己的课表 → 一键部署”的只读模式。课表不进入官方服务、不需要 Sleepy 账号，也不需要数据库。

### 1. 准备自己的课表

1. 在 Android Sleepy 导出 `.sleepy` 文件。
2. 复制为 `public/schedule.sleepy`。该文件已被 `.gitignore` 忽略，私人课表不会被误提交。
3. 复制 `.env.public.example` 为 `.env.public.local`，保持 `BASE_PATH=/`。

### 2. 可选：设置访问密钥

```bash
npm run public:key-hash -- "家庭访问密钥"
```

把输出的 SHA-256 填入 `.env.public.local` 的 `VITE_PUBLIC_ACCESS_KEY_HASH`。然后构建：

```bash
npm install
npm run build:public
```

访问者必须输入密钥才能进入页面；密钥只保存在浏览器会话中。**注意：这是前端访问闸门，不是服务器级保密。静态站点的 `.sleepy` 资源理论上仍可被熟悉浏览器工具的人下载。需要防止资源下载时，请使用下方的 Edge 鉴权代理，不要只依赖此开关。**

### 3. Vercel 一键部署

1. 将本项目复制到自己的 GitHub 仓库（或使用 Deploy from Git）。
2. Vercel 导入该仓库，Framework 选 `Vite`。
3. Build Command：`npm run build:public`；Output Directory：`dist`。
4. 在 Vercel Project Settings → Environment Variables 添加：
   - `VITE_PUBLIC_SCHEDULE_PATH=/schedule.sleepy`
   - `VITE_PUBLIC_ACCESS_KEY_HASH=上一步生成的哈希`（可选）
   - `BASE_PATH=/`
5. 部署后绑定自己的域名。之后只需替换 `public/schedule.sleepy` 并重新部署。

仓库中的 `vercel.json` 已配置 SPA 回退。也可使用 Vercel CLI：

```bash
npx vercel --prod
```

### 4. Cloudflare Workers 一键部署

1. 在自己的 Cloudflare 账号创建 API Token，权限至少包含 Workers Scripts/Edit 和 Account Settings/Read。
2. 在项目根目录登录：`npx wrangler login`。
3. 将 `site/wrangler.toml.example` 复制为 `site/wrangler.toml`，把 `name` 改成自己的 Worker 名称；不要直接使用官方仓库现有的生产域名配置。
4. 构建并部署：

```bash
npm run build:public
npx wrangler deploy --config site/wrangler.toml
```

`site/wrangler.toml` 会把根目录 `dist/` 作为静态资产，并自动把未知路径回退到 `index.html`。在 Cloudflare 控制台给 Worker 绑定自己的域名即可。

### 5. 真正隐藏课表资源（可选）

前端密钥不能阻止直接请求 `/schedule.sleepy`。如果课表包含不希望公开下载的信息，应在 Vercel 使用 Edge Middleware，或在 Cloudflare Worker 中先校验 Cookie/Authorization，再转发静态资源；此模式需要把 `schedule.sleepy` 放到受保护的 R2/私有存储，而不是 `public/`。本仓库的默认模式只承诺“家庭分享的只读访问”，不承诺机密存储。

每个自部署实例都是独立站点、独立域名、独立课表；不会写入官方 Sleepy 数据，也不会把家人的访问绑定到原作者账号。

## 测试规则

核心算法 (timeTable / conflictLayout / courseColor) 的测试直接以 Kotlin 源码行为为基准,
含用户报障回归锁 (2026-09-09 跨空隙假冲突 / 2026-09-10 时间域 liveKeys 等)。
