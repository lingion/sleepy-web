# Web portable import parity with Android v1.0.64

Reference: immutable Android checkout `android-v1064-reference`, commit `77b878fd5c8903a3f201ea938b3b152de4c4fbc0`. This work changes the Web import and export paths. Main owns the shared model, database migration, settings, backups, and deployment.

## WakeUP share codes

The online path uses the Android v6.1.70 protocol: antispam POST, private DES signB decoding, signed share POST, RC4 payload decoding, and five-part shareData conversion. Bare codes and labelled 分享口令 text enter it. JSON, native text, CSV, HTML, and ICS remain local. Cancellation stops the request chain; each POST has a 15 second deadline. Codes and signatures are not logged.

The crypto module is adapted from the MIT licensed Android bundled `third_party/shiguang/js/GLOBAL_TOOLS/wake_up.js`. Its reference SHA-256 is `63b97fb525f604dfd7b227f4a68c8290390d2224543ce5cba83d1ccb2bf998b8`. The exact Android golden vectors in `app/src/test/resources/jw/wakeup/vectors.json` have SHA-256 `812e11dd84a97d91a2e86c75ad695fd49fc9b3764c216940e122d11efa9749ed`. Attribution and license are retained beside the Web crypto module. The private DES and native hex functions must not be replaced with standard library DES.

The worker relays only POSTs to the two exact official paths on `https://api.wakeup.fun`. It rejects academic URLs, other hosts, credentials, queries, fragments, methods, and redirects. It does not forward cookies or authorization. Request bodies are bounded at 64 KiB and responses at 8 MiB while streaming. `VITE_WAKEUP_PROXY_BASE` can select a deployed instance of this worker; the default is the existing Sleepy relay.

Verification on November 10, 2026: `npm test -- src/domain/import/wakeupShare.test.ts src/domain/import/wakeupRelay.test.ts` passed 9 tests, including the complete encrypted request chain against an in-process server mock, exact Android vectors, date conversion, cancellation and relay restrictions. This proves offline protocol equivalence, not a successful import of a live valid share code.

The existing deployed relay returned HTTP 204 for a real browser-style CORS preflight on November 10, 2026. Its advertised methods are still GET, POST, HEAD, OPTIONS. Main must deploy the restricted worker before claiming that its academic URL guard is active on the server. No worker was deployed by this task.

## Export fields and ICS dates

Both the export screen and top-bar share sheet serialize fixedDate and raw importSourceJson. Share text uses the sleepy-v1 marker format, preserving aliases, groups, notes, own times and the bound period-table block. The bound period table supplies the effective timing before JSON, native text or ICS serialization. Clipboard rejection produces a failure message.

Recurring ICS retains compact RRULEs when no transfers apply. When transfers apply, it projects concrete events through `src/domain/courseOccurrence.ts` coursesForDate. Dated ICS uses the same projector. Cross-week transfers read the source week's parity and range, suppress the source date, and include exceptional destinations outside the ordinary semester boundary. Fixed-date courses remain on their own dates. Sleepy extension fields preserve fixed dates, own times, semester start and maximum week on ICS reimport; external ICS retains its existing grouping behavior. The parser does not mistake braces inside calendar text for a JSON wrapper.

The date projection depends on main's domain commit `b6c4902` (equivalent local cherry-pick `5059b1d`). Main already has it and should skip the duplicate dependency.

## Import policy and persistence

New-table imports and explicit-target appends are separate actions. New imports create an independent period table from the confirmed rows, including old files with no P block, or bind the explicitly selected existing period table. They preserve the current default; only the first timetable becomes default. The confirmed date, original source JSON, maximum week and fixed dates are persisted atomically with courses and period binding, with one undo snapshot. A write failure rolls back both database changes and undo history.

Append compares actual overlapping weeks and clock times. It leaves a bound shared period table unchanged and rejects missing occupied nodes before writing. Pre-import backups freeze the effective schedule, detach the period binding, clear its old binding snapshot, and disable reminders. Incoming groups receive fresh IDs while their internal partitions remain distinct. Empty accepted imports do not create a backup. The main task still owns general backup settings and repository behavior outside this importer.

Native CRC verification checks original body bytes before full-width normalization. Source JSON retains its original spacing, full-width text, null fields, and unknown fields. Explicit course periods above 30 remain intact; the native header's declared daily count keeps the Android validation rule while actual course reach extends the imported count.

## Import navigation and order invariants

The management import card always opens new-table import. The add-course page has an import action with the current timetable passed explicitly as the append target. This wiring lives in ManageView; shared AddCourseView and global styles are not edited.

```text
Management import
  school directory / paste text / choose file
  preview
  name + semester date + period binding + manual or automatic timing
  confirm and save new timetable

Add course > import courses (explicit target)
  existing timetable / school directory / paste text / choose file
  select course groups
  preview + backup enabled + conflicting courses disabled
  confirm and append

Period-only input
  name period table
  confirm and save period table
```

Selection precedes append preview. An empty selection cannot advance. Back from confirmation returns to preview. Persistence errors stay inside the active dialog and can be retried. Applying disables the primary action and uses a synchronous lock against double clicks. Period-only input writes no timetable and completes its undo batch before leaving the page.

## Academic import exception

The complete school directory, status badges, search, alphabet navigation, city recommendations and explicit geolocation remain available. Choosing any school, any status, a recommended school or a custom URL opens exactly: “网页暂不支持教务导入，请使用安卓版导入”. No academic login, capture, draft restoration or proxy request is reachable. The old capture component also renders only the notice if mounted directly. The legacy proxy client returns unsupported without calling fetch. Server restrictions require main's worker deployment as recorded above.

## 2026年11月10日收口验证

最终代码以 `2270cc1` 为验证基点，随后只增加浏览器测试和本文档。工作目录为 `/Users/lingion_k/sleepy-worktrees/web-import-v1064-20261110`，分支为 `codex/web-import-v1064`。既有改动和已整合提交均予以保留，没有修改共享模型、迁移、全局样式或全局语言资源。

| 实际命令 | 结果与边界 |
| --- | --- |
| `npm test -- --maxWorkers=2 --minWorkers=1` | 110 个文件，1298 项通过；这是当前检出树默认单测发现范围，排除 `src/e2e`。 |
| `npm run build` | TypeScript 和 Vite 生产构建通过。保留既有 repository 同时静态与动态导入、主包大于 500 KiB 两类警告。 |
| `./node_modules/.bin/vitest run --config vitest.e2e.config.ts src/e2e/import-v1064.e2e.test.ts --maxWorkers=1 --minWorkers=1` | 系统 Chromium、390×844 视口，五项通过；只运行本次新增的浏览器套件。每项使用独立浏览器上下文，结束后关闭浏览器和预览服务器。 |
| `git diff --check` | 本批代码提交前均通过。 |

浏览器测试使用真实页面、文件选择、原生下载、协议解密、解析器和 IndexedDB。五项分别验证新表导入及原生文件往返、WakeUP 加密两段协议、定位和搜索选校、管理页分组选课追加及冲突过滤、新旧教务深链。WakeUP 服务端响应被拦截为加密测试数据；这不代表真实有效口令已经通过线上服务。

浏览器核验发现并修复了一个单位测试没有覆盖的部署问题：预览服务器为 `.gz` 资产返回 gzip 内容编码，浏览器取得的正文已是 SCB1，旧代码再次解压会报 `invalid gzip data`。现在按魔数识别原始压缩正文或已解码正文。相同北京定位用例修复前失败，修复后通过，原始压缩、已解码及损坏数据的单位测试也通过。

日程页的空态调用方没有传 `onJwImport`。`ImportView` 现在提供内部学校目录作为缺省行为；点击教务入口仍能搜索和选择学校，并只显示安卓专属提示。管理页传入的导航回调保持生效。该缺省调用路径有先失败再通过的组件测试。

## 用户原话与实现行为核对

| 用户要求 | 当前行为与证据 |
| --- | --- |
| “DO NOT replace its uncommitted changes: inspect and finish them.” | 接续原工作区逐批提交；没有重置原改动，也没有把 `node_modules` 链接纳入提交。 |
| “ImportView/Manage更新追加冲突预览” | 管理导入创建新课表；管理页手动加课可进入显式目标追加。先选择课程组，再预览。备份默认开启，追加冲突默认关闭，预览和事务使用同一冲突判定。组件测试和浏览器追加测试通过。 |
| “保持fixedDate/importSourceJson不丢失” | JSON、原生文件、原生分享文本保留固定日期和来源原文；ICS 通过扩展字段保留固定日期。新表保存、已有表课程复制、追加、导入前备份保留课程字段；追加不改目标课表来源。原生 CRC 在全角归一化前按原文字节校验。浏览器下载再解析验证了固定日期和包含全角、空格、null 的来源原文。 |
| “ICS date projection must use ... coursesForDate” | 已整合的 `3d9a5fd` 在两条 ICS 导出路径使用共享日期投影，覆盖跨周调休、来源周奇偶、源日抑制及固定日期。没有复制旧的周次与星期筛选。 |
| “Build real protocol for WakeUp with CORS path” | 已整合的 `1ff998d` 实现真实两步加密协议和仅限两个官方端点的中转。金标、取消、正文大小限制和中转限制通过离线测试，浏览器能够解密并进入确认页。线上真实有效口令仍未实测。 |
| “selecting ANY school shows Android-only dialog” | 所有状态学校、同城推荐和自定义 URL 均进入相同提示；旧捕获组件、当前及旧版深链均无登录或捕获入口。浏览器检查教务路径零外部网络、课表和课程数据未改写。 |
| “Commit locally, no push” | 下表均为本地提交；没有推送、合并或部署。 |

## 本次交接的提交与文件

主线已整合 `7159116`、`9e12c72`、`1ff998d`、`3d9a5fd`，并已拥有共享日期域。不要重复整合本地依赖 `5059b1d`。以下新提交按顺序应用：

| 提交 | 内容 |
| --- | --- |
| `ce187a8` | 导入事务、撤回、独立作息绑定和追加策略。 |
| `7d0f2b1` | 原始字节 CRC、高节次和固定日期回归。 |
| `d4854ba` | ImportView 与 ManageView 新建、选课、追加、冲突预览和确认流程。 |
| `e0703b0` | 旧捕获组件封口与统一安卓专属提示。 |
| `4438fd5` | 格式详情复制失败反馈和在线口令说明。 |
| `6f546b1` | 压缩或已解码城市边界正文兼容。 |
| `2270cc1` | 无外部回调时的缺省学校目录。 |
| `ce6ec3b` | 五项真实浏览器导入、追加和教务入口验证。 |

相对已整合的 `3d9a5fd`，变更文件如下：

- 入口和导入组件：`src/views/ImportView.tsx`、`src/views/ManageView.tsx`、`src/components/FormatDetailDialog.tsx`。
- 导入域：`src/domain/import/courseImportPolicy.ts`、`src/domain/import/importApplication.ts`、`src/domain/import/sleepyNativeParser.ts`。
- 教务例外：`src/domain/jw/webPolicy.ts`、`src/views/jw/JwCapturePage.tsx`、`src/views/jw/schoolLocation.tsx`。
- 单位和组件测试：`src/components/FormatDetailDialog.test.tsx`、`src/domain/import/courseImportPolicy.test.ts`、`src/domain/import/importApplication.test.ts`、`src/domain/import/portableParity.test.ts`、`src/views/ImportView.mixedImport.test.tsx`、`src/views/ImportView.portable.test.tsx`、`src/views/jw/JwImportView.test.tsx`、`src/views/jw/schoolLocation.test.ts`。
- 浏览器测试与文档：`src/e2e/import-v1064.e2e.test.ts`、`docs/import-v1064.md`。

## 剩余差距与共享协调

不需要新增共享模型字段。主线已有 `Course.fixedDate`、`Table.importSourceJson`、`reminderOverride` 和对应备份编解码支持；本批继续使用这些字段，没有更改模型或迁移。

受限 worker 尚未部署，正式部署和真实有效 WakeUP 口令验证由主线收口。本批加密金标与浏览器模拟只能证明本地协议链可执行，不能替代线上有效口令导入。浏览器只覆盖本机 Chromium，未验证 Safari 或 Firefox。

管理页手动加课的追加入口已接通。`ScheduleView` 自己打开的 `AddCourseView` 仍没有该入口，属于 UI worker 的文件范围；主线需要在该加课路径接入 `ImportView`，传入 `addingCourses` 和明确的 `targetTableId`。日程空态导入的教务目录已由本批组件缺省行为补齐，无需修改该调用方。

全局语言资源由主线管理。当前调用点下列键在本地语言注册中缺失，组件暂用明确的中文缺省文案：`add_course_from_existing`、`add_course_no_source`、`import_backup_original`、`import_append_conflicts_option`、`import_new_period_table`、`import_select_courses`、`deselect_all`、`select_all`、`import_selection_empty`、`confirm`、`import_add_courses`、`manage_export_sub`、`copy_failed`、`format_wakeup_online_hint`、`copy_done`。学校目录定位状态和安卓专属提示也沿用中文。本批没有直接编辑全局 i18n。

HTML、CSV、普通文本、JSON 和原生格式继续使用现有解析器，全部默认单测均已运行。学校真实账号导入按用户例外明确关闭，不作为待接入功能。当前验证不能宣称所有浏览器、所有外部文件变体或完整 Android 运行时均已认证等价。
