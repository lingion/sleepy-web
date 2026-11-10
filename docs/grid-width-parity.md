# Sleepy Web 课表列宽修正

本次直接修改共享工作树，未提交。Android 事实源为 `/Users/lingion_k/sleepy-worktrees/android-v1064-reference`，已实读 HEAD 为 `77b878fd5c8903a3f201ea938b3b152de4c4fbc0`，即 v1.0.64。本文记录日期为 2026 年 11 月 10 日。

## Android 源码依据

路径均相对于上述不可变 Android 检出。

| 源码位置 | 实际行为 |
| --- | --- |
| `app/src/main/java/com/lingion/sleepy/ui/component/CourseTableView.kt:301`、`:315`、`:600` | `gridScale` 联动尺寸。先按文字测量时间栏，再用 `(maxWidth - timeW - gapW * (dayCount + 1)) / dayCount` 均分课程列；`gapW` 为 `5 * scale`。时间栏在调用侧至少为 `46 * scale`。Android 本身没有“时间栏不得宽于课程列”的上限。 |
| `app/src/main/java/com/lingion/sleepy/ui/component/PeriodHeaderCellContent.kt:31`、`:60` | 旧式节次、时间基准字号分别为 `12 * scale`、`11 * scale`，基准行高为 14、13；单层卡片内边距为 `3 * scale`。 |
| `app/src/main/java/com/lingion/sleepy/ui/component/PeriodHeaderCellContent.kt:68`、`:113`、`:143` | 三行式使用开始时间、节次、结束时间的联合包络；旧式使用节次和完整时间范围的连字符共轴包络。隐藏时间只影响旧式，隐藏后仅计算标签宽度。 |
| `app/src/main/java/com/lingion/sleepy/ui/component/CourseTableView.kt:487`、`:575` | 整列共享字号和卡宽，字体约束使用非占位行的最矮真实内容高度，排布按整列共同锚点定位。 |
| `app/src/main/java/com/lingion/sleepy/ui/component/PeriodHeaderCellContent.kt:279`、`:293`、`:330` | 三行字号按可用内容区适配，必要时等比收缩，三行行盒严格分隔，联合文字矩形整体居中；单个时间 `softWrap = false`。 |
| `app/src/main/java/com/lingion/sleepy/ui/component/PeriodHeaderLayoutModel.kt:354` | 旧式整体垂直解先消耗行间距，再缩字，原有最小缩放参数为 0.6。 |
| `app/src/main/java/com/lingion/sleepy/ui/screen/mine/PeriodHeaderSettingsScreen.kt:128`、`:143`、`:176` | 显示设置有旧式、三行式、节次样式、显示“第几节”、隐藏旧式时间、三行悬挂以及旧式时间对齐；这些设置并不授权网页无限扩大左栏。 |
| `app/src/main/java/com/lingion/sleepy/util/AppPrefs.kt:729`、`:825` | 网格缩放范围为 0.7 到 1.3；节次布局默认为旧式。 |

## 根因

原网页把最长完整时间范围及三行悬挂的自然文字包络直接当作左栏宽度，没有给课程列留出宽度下限。七天课程只能均分余量，时间字串因此可能占用数倍于单个课程列的空间。

三行渲染另用 `Math.max(width, placement.contentWidth + padding)` 再次撑大左栏卡片，字号、定位投影和卡高约束也不是同一套最终像素。旧式隐藏时间分支依赖内容盒宽度及内边距，存在额外占宽。日期表头用 flex 剩余空间均分，而课程坐标还扣除了末尾间距，导致表头与课程列逐列偏移。上层固定扣除内边距也不能覆盖网格缩放后的实际内容宽度。

## 布局不变量与修正

```text
固定顺序：节次栏 | 周一 | 周二 | 周三 | 周四 | 周五 | 周六 | 周日
                   每天表头与其下课程共享同一宽度和横向坐标

左栏旧式宽度足够：       左栏受限或选择三行：
      节次                    08:00
  08:00-08:45                 节次
                              08:45
```

网页先沿用 Android 的自然文字宽度，再加入用户明确要求的课程列宽优先约束。扣除间距后，左栏最多占一份，课程列各占至少同样大的一份：

```text
laneBudget = (contentWidth - gapW * (dayCount + 1)) / (dayCount + 1)
timeW = min(Android 自然文字宽度, laneBudget)
colW = (contentWidth - timeW - gapW * (dayCount + 1)) / dayCount
```

这项网页上限允许左栏小于 Android 调用侧的 46；它来自本次用户的列宽优先要求，不能宣称 Android 原实现已有该约束。

节次栏始终按 `timeW` 绘制，不再被文字反向撑开。所有文字位置、字号、字距和行高用同一列模型计算，最终值直接以 CSS 像素消费，缩放只计算一次。整列按最矮非占位行拟合。旧式完整时间串若必须缩到基准的 0.6 以下才装得下，则复用 Android 已有的开始时间、节次、结束时间排布，并保持原设置值；此响应阈值是网页适配，Android 本身没有自动切换旧式排布的逻辑。隐藏时间始终只显示标签，三行式不受隐藏时间设置影响。

七天表头直接使用 `geo.colW`，日期与星期文字随列宽适配。网格通过自身 `ResizeObserver` 读取扣除缩放内边距后的实际内容区，resize 后重算同一几何。

以下是默认作息、缩放为 1、确定性文字估算下的几何结果。宽度指网格内容区，并非包含页面边距的设备视口。

| 内容区宽度 | 修复前左栏 | 修复前课程列 | 修复后左栏 | 修复后课程列 |
| --- | --- | --- | --- | --- |
| 320 | 74.20 | 29.40 | 35.00 | 35.00 |
| 360 | 74.20 | 35.11 | 40.00 | 40.00 |
| 402 | 74.20 | 41.11 | 45.25 | 45.25 |
| 600 | 74.20 | 69.40 | 70.00 | 70.00 |

## 文件范围

仅本任务编辑以下源码、测试和本文；共享树其他文件的差异来自其他线程。

- `src/components/schedule/CardsGridView.tsx`：测量实际内容区，统一节次绘制，日期表头使用课程列几何及文字适配。
- `src/components/schedule/gridGeometry.ts`：课程列宽优先预算。
- `src/components/schedule/periodHeader.ts`：统一文字包络、行盒、字距、悬挂及缩放计算。
- `src/components/schedule/gridGeometry.test.ts`：四种宽度的比例、七列顺序、间距和末列边界回归。
- `src/components/schedule/periodHeader.test.ts`：五种样式、长标签、非补零时间、悬挂端点及矮行的联合边界与显示语义。
- `src/components/schedule/CardsGridView.width.test.tsx`：jsdom 渲染矩阵及 resize 验证。
- `docs/grid-width-parity.md`：本记录。

`CourseOverlayCard` 函数连同导出与原源码逐字一致；主线程可继续复用。未启动子代理，未提交。

## 验证

修复前，新增几何回归在 320、360、402、600 四种宽度均失败。修复后，四个直接相关测试文件共 64 项通过。jsdom 渲染覆盖四种宽度乘以 13 组设置，包含 0.7、1、1.3 缩放、三行悬挂两端及中点、大写及罗马节次、隐藏时间、缩短行高；另验证实际内容区 resize。纯几何边界覆盖五种节次样式、30、36、46、70 像素栏宽、26 像素矮卡及不同字号缩放。断言包括七天顺序、各列等宽、课程坐标、文字不越界、行盒不交叠及 `white-space: nowrap`。

保留的测试全部是纯函数或 jsdom，不启动浏览器、HTTP 服务或真实 IndexedDB。早期临时 Playwright 测试使用随机端口和独立临时上下文，未访问主线程 `127.0.0.1:8797`；用户明确浏览器仅由主线程 CUA 验收后，已停止并移除该测试。早期浏览器运行不能替代主线程对最终共享源码的 CUA 验收。

最终真实字体、系统字体放大及宿主内嵌后的像素渲染由主线程 CUA 验收。jsdom 不具备真实字体排版能力，本记录不把样式与几何断言称作真实浏览器渲染证明。

实际执行结果如下。共享树的其他线程仍在修改，不能把此时的全局失败归因于网格，也不能据此宣称全项目已通过。

| 命令 | 结果 |
| --- | --- |
| `npm test -- src/components/schedule/gridGeometry.test.ts src/components/schedule/periodHeader.test.ts src/components/schedule/CardsGridView.legacy.test.tsx src/components/schedule/CardsGridView.width.test.tsx` | 四个文件共 64 项通过。 |
| `npm test -- --maxWorkers=2 --minWorkers=1` | 147 个文件，1477 项通过，7 项失败。学校目录新测试失败四项，玻璃镜头新测试失败一项；另两项 SEO 测试依赖尚不存在的 `dist/index.html`。网格、浮卡目录相关测试在此轮全部通过。 |
| `./node_modules/.bin/tsc --noEmit --incremental false` | 最后一次检查未报网格源码或网格测试错误；仍报 `SchoolSelectPage.parity.test.tsx` 的第 32、43、52 行和 `MineHome.parity.test.tsx` 第 50 行四处 `getByRole` 的 `exact` 参数类型错误。未改这些其他线程文件。 |
| `git diff --check`，限定本文列出的网格已跟踪文件 | 通过。 |

主线程指出的 `TS2783` 重复 `width` 属性所在临时浏览器测试已移除。替代 jsdom 测试的设置矩阵显式使用 `Partial<Prefs>`，修复 `periodHeaderLayout` 被推宽为普通字符串的问题；上述最后一次 TypeScript 结果已确认这两项不再出现。

## 用户原话与实现行为

| 用户要求 | 对应行为 |
| --- | --- |
| “周一到周日被挤压，左节次/时间栏太宽” | 左栏不得宽于单个课程列，七天均分其余空间。 |
| “先比对 Android 实际节次宽度分配、时间缩放和显示设置” | 上述不可变源码逐项核对，保留已有显示设置和文字排布。 |
| “节次可收缩且时间不会挤占数倍宽度” | 左栏预算固定上限，字号与字距一起拟合，不由内容撑大列宽。 |
| “无重叠无换行，单个时间可按 Android 上下排列” | 行盒顺序由同一模型生成；受限旧式复用三行，单个时间保持一行。 |
| “不要写 App/global/shared/glass/Mine/jw” | 本任务未编辑这些文件，未修改课程卡内容。 |
| “不 commit” | 保留未提交改动。 |

后续可复用的执行依据是：自然文字宽度只能作为期望值，不能替代课程内容优先的约束；几何、文字测量、缩放和实际绘制必须共享同一最终坐标系。共享树的最终渲染验收必须由拥有该浏览器的主线程完成。
