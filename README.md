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

## 测试规则

核心算法 (timeTable / conflictLayout / courseColor) 的测试直接以 Kotlin 源码行为为基准,
含用户报障回归锁 (2026-09-09 跨空隙假冲突 / 2026-09-10 时间域 liveKeys 等)。
