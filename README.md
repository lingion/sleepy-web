<p align="center">
  <img src="public/assets/sleepy-logo.png" width="120" alt="Sleepy logo">
</p>

<h1 align="center">Sleepy Web · 轻课表</h1>

<p align="center">
  Sleepy Android 课程表的浏览器版本。<br>
  Material 3 · 多视图 · 多格式导入 · 本地存储 · 可自部署家庭只读课表
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Web-4285F4?style=flat-square&logo=googlechrome&logoColor=white" alt="Web">
  <img src="https://img.shields.io/badge/framework-React%2018-61DAFB?style=flat-square&logo=react&logoColor=20232A" alt="React 18">
  <img src="https://img.shields.io/badge/build-Vite-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/language-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/storage-IndexedDB-6B7280?style=flat-square" alt="IndexedDB">
  <img src="https://img.shields.io/badge/license-GPL--3.0-blue?style=flat-square" alt="License">
</p>

<p align="center">
  <a href="https://sleepy.qdp.qzz.io">在线体验</a> ·
  <a href="https://github.com/lingion/sleepy">Android 主项目</a> ·
  <a href="https://github.com/lingion/sleepy-web/issues">问题反馈</a> ·
  <a href="LICENSE">GPL-3.0</a>
</p>

---

> **定位说明：** Sleepy Web 与 Android 主项目共享课表格式、核心算法和视觉语义，但浏览器不能替代 Android 的小组件、AlarmManager、前台服务、系统日历 Provider 或 Android 16 实时更新能力。本文档只把已经在 Web 中实现并验证的能力列为支持项。

## 项目定位

<p align="center">
  <img src="public/assets/sleepy-logo.png" width="96" alt="Sleepy Web">
</p>

Sleepy Web 适合以下场景：

- 在电脑、平板或手机浏览器查看课程表
- 从 Android Sleepy 导出的 `.sleepy` 文件恢复课程表
- 将课表以只读站点部署到自己的域名，分享给家人
- 在不上传账号、Cookie 或教务密码的前提下运行自己的实例
- 作为 Sleepy Android 的 Web 端配套或轻量公开展示页

## 功能总览

### 三种主要视图

| 视图 | 能力 |
|---|---|
| **网格视图** | 按星期 × 节次显示课程卡，支持冲突课程叠层、周次切换、节次表头样式和自适应行高 |
| **周视图** | 七日摘要 + 课程详情，支持双列布局、按课程数平衡分栏、隐藏无课日 |
| **今日视图** | 根据学期开始日期和当前周过滤今日课程，可选“最近有课日”回退 |

网格实验室功能包括：晚间无课自动收起、自适应行高、触摸双指缩放、`Ctrl/⌘ + 滚轮`缩放和行高持久化。

### 课程与课表管理

- 多张独立课表
- 课表开始日期、最大周数和节次表
- 手动添加/编辑课程
- 起止周、单双周、节次、教师、教室、备注、别名和课程颜色
- 冲突课程布局：stack / fold / rail
- 当前日期、节假日和补班语义
- 深色模式、主题预设、自定义主题和多语言

### 导入格式

所有导入流程都先解析和预览，确认后才写入 IndexedDB，不静默覆盖现有课表。

| 格式 | 说明 |
|---|---|
| **sleepy-v1** | Sleepy 原生 `.sleepy` 格式，支持课程和作息表区块 |
| **WakeUp 分享文本** | 兼容 Sleepy/WakeUp 分享文本 |
| **WakeUp JSON** | 兼容常见 WakeUp 课表 JSON |
| **ICS** | 标准 iCalendar 课表 |
| **CSV** | 带表头的逗号分隔课表 |
| **HTML** | HTML 表格课表 |
| **纯文本** | 逐行课程文本 |

### 教务解析

Web 当前包含 Android 主项目中已经移植到浏览器的协议族和单校解析器。完整注册表以 [`src/domain/jw/parserRegistry.ts`](src/domain/jw/parserRegistry.ts) 为准；协议适配持续以 Android 主项目为事实来源。

浏览器直接抓取教务系统会受到 CORS、登录流程、验证码和 WebView 能力限制。需要跨域抓取时，项目提供独立的 `worker/` CORS 中转 Worker，但它不是公开课表部署的必需组件，也不应存放用户账号或密码。

## 从 Android 导出并查看

1. 在 Sleepy Android 中导出课程表，选择 `.sleepy` 原生格式。
2. 打开 Web 端的导入页面，选择导出的文件；或者把文件放入自部署项目的 `public/schedule.sleepy`。
3. 普通 Web 模式会把数据存入当前浏览器的 IndexedDB。
4. 自部署公开模式会清空该部署域名的访客 IndexedDB，再写入构建时提供的只读课表。

浏览器数据按域名隔离：不同域名、不同浏览器和隐私窗口不会共享课表。

## 自部署家庭课表

自部署模式的目标是：**复制项目 → 放入自己的课表 → 绑定自己的域名 → 部署。**

它不需要 Sleepy 官方账号、后端数据库或教务登录代理。每个家庭实例都拥有独立的静态课表文件和独立域名。

### 目录约定

```text
public/
├── schedule.sleepy.example   # 可提交的空白示例
└── schedule.sleepy            # 你的私人课表，不提交 Git

.env.public.example            # 公开构建配置模板
site/wrangler.toml.example     # Cloudflare Workers 配置模板
vercel.json                    # Vercel SPA 回退
```

### 准备课表

```bash
cp .env.public.example .env.public.local
# 将 Android 导出的文件复制为：
cp /path/to/your-course-table.sleepy public/schedule.sleepy
```

`public/schedule.sleepy`、`.env.public.local` 和 `.env.production.local` 已加入 `.gitignore`。提交前仍应自行检查 Git 状态，确保没有私人课表或真实密钥。

### 访问密钥闸门

可以为家庭站点设置访问密钥：

```bash
npm run public:key-hash -- "你的家庭访问密钥"
```

将输出的 SHA-256 哈希填入 `.env.public.local`：

```dotenv
VITE_PUBLIC_SCHEDULE_PATH=/schedule.sleepy
VITE_PUBLIC_ACCESS_KEY_HASH=这里填上面输出的哈希
BASE_PATH=/
```

然后构建：

```bash
npm run build:public
```

访问者必须先输入密钥，应用才会初始化本地数据库并读取课表。密钥只保存在当前浏览器会话中，关闭会话后需要重新输入。

> **安全边界：** 这是前端访问闸门，不是服务器级机密存储。因为 `.sleepy` 属于静态构建资产，熟悉浏览器开发者工具的人仍可能直接请求 `/schedule.sleepy`。如果课表内容必须防止下载，请使用私有 R2/Blob 加 Edge/Worker 鉴权，不要把私人课表放在 `public/`。

### Vercel 部署

#### 控制台部署

1. Fork 或复制本仓库到自己的 GitHub 仓库。
2. 在 Vercel 选择 **Add New Project**，导入自己的仓库。
3. Framework 选择 `Vite`。
4. 设置：
   - **Build Command:** `npm run build:public`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
5. 添加环境变量：
   - `VITE_PUBLIC_SCHEDULE_PATH=/schedule.sleepy`
   - `VITE_PUBLIC_ACCESS_KEY_HASH=可选的哈希`
   - `BASE_PATH=/`
6. 部署后，在 Vercel 的 Domains 中绑定自己的域名。

仓库中的 `vercel.json` 已提供 SPA 回退，刷新任意前端路由不会返回 404。

#### CLI 部署

```bash
npm install
npm run build:public
npx vercel --prod
```

如果课表更新，只需替换 `public/schedule.sleepy` 并重新部署。不要把私人课表提交到公开仓库；建议通过私有仓库或 CI Secret 注入。

### Cloudflare Workers 部署

#### 首次配置

```bash
npm install
npx wrangler login
cp site/wrangler.toml.example site/wrangler.toml
```

编辑 `site/wrangler.toml`，至少修改：

```toml
name = "your-sleepy-schedule"
```

不要直接复制官方部署配置中的生产域名、账号或 token。自己的 Worker 应绑定自己的 Cloudflare 账户和域名。

#### 构建与部署

```bash
npm run build:public
npx wrangler deploy --config site/wrangler.toml
```

模板会把根目录 `dist/` 作为静态资产，并把未知路径回退到 `index.html`。部署完成后，在 Cloudflare 控制台为 Worker 绑定自己的域名。

#### CI 自动部署

仓库自带 `.github/workflows/deploy-worker.yml`，push 到 `main` 自动构建部署。**上游仓库没有私人课表文件时会显示 notice 并干净跳过**，只有你自己的仓库才会真正部署。

Secrets 配置：

- `CLOUDFLARE_API_TOKEN`：只放在仓库 Secret，不写入 `wrangler.toml`
- `VITE_PUBLIC_ACCESS_KEY_HASH`：可选，访问密钥的 SHA-256（`npm run public:key-hash -- <密钥>`）
- `PUBLIC_SCHEDULE_B64`：可选，私人课表文件的 base64，免提交私有文件：

  ```bash
  base64 -i your-schedule.sleepy | gh secret set PUBLIC_SCHEDULE_B64
  ```

课表也可以直接复制到 `public/schedule.sleepy`（已在 `.gitignore`，私有仓库适用）。两条路径二选一，构建时会优先使用仓库里的文件。

### 真正保护课表资源

如果“没有密钥就不能下载课表”是硬要求，推荐架构如下：

```text
访问者
  │ Cookie / Authorization
  ▼
Cloudflare Worker 或 Vercel Edge Middleware
  │ 校验密钥
  ▼
私有 R2 / Vercel Blob / 其他私有对象存储
  │ 通过后才返回 .sleepy
  ▼
浏览器端只读渲染
```

当前仓库默认的静态部署模式不包含 R2、Blob、账号系统或服务端会话，因此不会把它描述成机密文档系统。

## 开发环境

### 前置要求

- Node.js 20 或更高版本
- npm
- 支持 IndexedDB 的现代浏览器

### 安装与运行

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
npm run preview
```

公开课表构建：

```bash
npm run build:public
```

检查公开课表文件：

```bash
npm run check:public
```

生成访问密钥哈希：

```bash
npm run public:key-hash -- "your-access-key"
```

## 测试与验证

```bash
npm test
npm run test:e2e
npm run build
```

当前核心回归覆盖：

- 课表和作息表导入/导出
- Android `sleepy-v1` 格式
- 课程时间和周次过滤
- 冲突课程布局
- 课程颜色和无色模式
- 节次表头格式、样式和悬挂布局
- 网格几何、自适应行高、晚间收起和行高缩放
- 教务协议解析器
- 公开只读应用壳与路由

## 技术架构

| Android 主项目 | Web 实现 |
|---|---|
| Room | Dexie 4 / IndexedDB |
| `ScheduleRepository` | `src/data/repository.ts` |
| `TimeTableUtils` | `src/domain/timeTable.ts` |
| `ConflictLayoutEngine` | `src/domain/conflictLayout.ts` |
| `CourseColorUtil` | `src/domain/courseColor.ts` |
| `AppPrefs` | `src/data/types.ts` + `src/state/prefsStore.ts` |
| Jetpack Compose UI | React 18 + Material 3 CSS tokens |
| Android 导入导出 | `src/domain/import/` |
| Android JW 注册表 | `src/domain/jw/parserRegistry.ts` |

### 项目结构

```text
sleepy-web/
├── public/                     # favicon、logo、公开构建课表入口
├── src/
│   ├── components/             # 课程卡、网格、冲突卡、图标
│   ├── data/                   # Dexie 数据库、实体和默认偏好
│   ├── domain/                 # 时间、冲突、颜色、导入、教务解析
│   ├── state/                  # Zustand 状态和浏览器返回栈
│   ├── theme/                  # Material 3 token、主题预设
│   ├── views/                  # 课表、今日、管理、我的页面
│   ├── publicAccess.ts         # 自部署访问闸门
│   └── publicSchedule.ts       # 构建期课表加载
├── site/                       # Cloudflare Workers 静态资产配置
├── worker/                     # 教务跨域中转 Worker
├── vercel.json                 # Vercel SPA 回退
├── .env.public.example         # 自部署环境变量模板
└── package.json
```

## Android/Web 对齐边界

### 已对齐的共享能力

- Sleepy 原生课表格式和导入导出语义
- 课程周次、单双周和节次时间处理
- 网格/周视图/今日视图的核心展示
- 冲突课程布局和课程颜色计算
- 主题、课程无色模式、节次表头样式
- 网格晚间收起、自适应行高和行高缩放
- 多课表、作息表和相关编辑流程
- 已移植的教务解析器

### 明确不做一比一移植的 Android 专属能力

- 主屏幕 Widget / RemoteViews
- AlarmManager 精确提醒、BootReceiver、前台服务
- Android 16 promoted ongoing / Live Update
- OEM 厂商授权和 OPPO 流体云
- Android 系统日历 Provider
- WebView 专属的教务登录拦截和 Cookie 生命周期

这些能力在 Web 上应使用浏览器通知、ICS 导出、PWA 或 Edge 服务等平台适配方案，而不是伪造 Android 行为。

## 隐私

普通 Web 模式的课程数据保存在当前浏览器的 IndexedDB 中，不默认上传到 Sleepy 服务。教务直连是否请求第三方站点取决于用户主动使用的导入功能。

自部署模式的静态课表会随部署产物发布到用户自己的托管平台。部署者应自行负责：

- 课表内容是否适合公开
- 域名和 HTTPS 配置
- 访问密钥的分发
- 私人课表和构建日志的保护
- 第三方托管平台的隐私政策

不要在 Issue、日志、仓库或构建产物中提交教务账号、密码、验证码、Cookie 或真实访问 token。

## 贡献

欢迎提交 Bug 修复、Android/Web 对齐改动、导入格式适配和文档改进。

提交代码前建议运行：

```bash
npm test
npm run build
```

如果是教务适配，请提供：

- 学校和教务系统类型
- 脱敏后的页面结构或格式样本
- 期望结果和实际结果
- 可复现步骤

不要提交任何账号、密码、验证码、Cookie 或包含个人课表的原始文件。

## License

[GPL-3.0](LICENSE)

Sleepy Web 使用 GPL-3.0 发布。Android 主项目、协议适配和课表格式相关的参考范围以主项目的开源声明为准。

---

<p align="center">
  <sub>构建无壳，自由自在。</sub>
</p>
