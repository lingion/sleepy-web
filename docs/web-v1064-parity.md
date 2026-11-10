# Android v1.0.64 与 Sleepy Web 最终功能对账

核对日期为2026年11月10日。Android事实源为 `/Users/lingion_k/sleepy-worktrees/android-v1064-reference`，提交 `77b878fd5c8903a3f201ea938b3b152de4c4fbc0`，对应发布tag `v1.0.64`。以下Android源码路径均相对于该检出的 `app/src/main/java/com/lingion/sleepy/`。不以开发分支、FLClash参考效果或源码中过时注释覆盖发布版实际调用行为。

Web工作区为 `/Users/lingion_k/sleepy-worktrees/web-embed-demo-20261110`，分支 `codex/web-v1064-alignment`。本次对账从主线 `1db6cb251e8b44fdee71660d0b8586accb85e550` 读取，并核对其后至 `f5d975c` 的收口提交；保存接口已包含 `7952411`、`0c707d2`、`8ad8925`、`b5bc948`，提醒模式备份映射已包含 `8ec9bb5`。本文提交仅改变本文，不冻结其他工作者的改动，也不代表已经发布或部署。

本文把三件事分别记录：代码已接通的用户操作、实际执行过的验证、浏览器无法提供或当前仍未实现的原生能力。完整移植以保留可移植功能和完整入口为目标；不能把CSS材质称为Android像素一致，也不能把画廊、偏好开关、文件下载或浏览器通知称为桌面小组件、系统日历写入或后台精确闹钟。

对账完成条件为：每个主要页面和功能有Android与Web落点；保存、撤回和陈旧审批有真实仓库证据；所有已知平台替代与剩余差距明示。旧交接文档保留其当时状态，本文更新其已完成的共享接入事项。

## 用户原话与交付行为

| 用户要求 | 当前实现与证据边界 |
| --- | --- |
| “所有UI/功能全对齐，不是演示阉割” | 标准Web应用保留课表、今日、管理、我的四个主入口，支持多课表、多作息表、编辑、导入导出、提醒设置和备份。七天均可配置，没有把完整今日或详情列表裁成固定课程数。教务登录与设备能力的例外逐项列在本文。 |
| “以安卓发布源码最终行为为准” | 入口顺序、组编辑、单次拆分、作息绑定、调休投影和设置分组均以固定发布源码核对。周摘要的前五门限制只作用于摘要，下面完整详情继续显示全部课程。 |
| “Classic/Liquid Glass独立外观” | `uiStyle: 'classic' \| 'liquid_glass'` 独立于主题和课程配色。Classic填色保留；Liquid Glass使用CSS光学层和二维弹簧。不是AGSL逐像素复现。 |
| “原位无写库无撤回” | UI原位拖回和取消已有隔离浏览器快照证据；仓库进一步验证域模块生成的原位替换没有课程写入，不改变偏好、undo或redo。 |
| “真实仓库保存/撤回/陈旧审批测试” | 新增四份测试共40项，直接调用实际repository、Dexie和偏好/备份模块，使用隔离的fake-indexeddb，不mock保存接口。覆盖完整草稿、组色、单次操作、隐藏时间、撤回重做和审批快照。 |
| “保持原版所有功能，不限制天数/隐藏管理” | 正常应用四入口和七天显示保留。公开只读课表构建另有明确只读模式，不能用它替代标准应用验收。Android启动器、系统服务等功能有浏览器边界，不宣称已具备。 |
| “主线独立复核发布” | 本文只汇总源码与已有证据。最终主线测试、真实浏览器复核、外部服务和部署验证由主线负责。本文不触发push、PR、merge或部署。 |

## 入口、位置与操作顺序不变量

```text
标准应用主导航
课表 → 今日 → 课表管理 → 我的

课表顶栏
[切表][撤回 取消撤回]   [上一周][完整第 N 周][下一周]   [加课][分享]
                                  整栏绝对中心
窄屏先缩外边距和间距，再缩侧控件，极端宽度才使用三段共用胶囊。

日程或管理的加课入口
从已有课表选择 → 教务直连 → 粘贴课表文本 → 手动添加课程 → 从文件导入
手动表单返回加课入口，入口返回原页。追加始终携带明确的目标课表。

单次操作
长按浮起 → 拖动或调整长度 → 预览 → 确认 → 调休归属审批 → 冲突审批 → 保存
周摘要长按先显示单次操作菜单；明确点击“调整本次”直接进入表单。
返回修改回到浮卡；完成退出浮卡；取消不写库。

课程时段卡标题行
[标题与摘要，占满剩余空间] [删除叉] [折叠箭头]
编辑默认折叠，仅命中来源主键的卡展开并滚动到可见位置。

我的
课表管理：全部课表、作息表、节假日
应用：提醒、外观、通用、桌面小组件
数据：备份
其他：关于
```

Android依据为 `ui/nav/SleepyNavHost.kt`、`ui/screen/imports/ImportSheet.kt`、`ui/screen/schedule/ScheduleScreen.kt`、`ui/screen/schedule/ScheduleToolbarLayout.kt`、`ui/screen/edit/AddCourseScreen.kt` 和 `ui/screen/mine/MineScreen.kt`。Web落点为 `src/App.tsx`、`src/state/backStack.ts`、`src/views/ScheduleView.tsx`、`src/views/ManageView.tsx`、`src/views/ImportView.tsx`、`src/views/AddCourseView.tsx` 和 `src/views/mine/MineHome.tsx`。

## 界面与课表交互逐项对账

| 项目 | Android发布源码 | Web当前落点与行为 | 已有验证及限制 |
| --- | --- | --- | --- |
| 四tab、导航图标、页面切换、返回 | `ui/nav/SleepyNavHost.kt`、`ui/component/PillNavigationBar.kt` | `src/App.tsx`、`src/state/backStack.ts`；贴底、悬浮和平板导航使用同一入口顺序，覆盖页和弹层按返回层级关闭。 | 返回栈与导航组件测试；不是Android系统预测返回手势。 |
| 平板布局 | `ui/nav/SleepyNavHost.kt` | `src/App.tsx`、`src/components/TabletNavRail.tsx`；平板横向双栏，全屏编辑覆盖时回到单栏，课表局部弹层不拆栏。 | 导航组件与布局测试；浏览器视口不等于Android设备dp。 |
| Classic与玻璃样式 | `ui/component/liquidglass/GlassButtons.kt`、`GlassSurface.kt`、`LiquidGlassStyle.kt` | `src/components/glass/GlassControls.tsx`、`src/theme/global.css`；材质独立切换，主色和危险色仍有语义，切回Classic清理玻璃状态。 | 控件测试与两种外观截图；材质为CSS近似。 |
| 任意方向跟手、弹簧、缓升缓降 | `ui/component/liquidglass/GlassPressMotion.kt`、`GlassControlMotion.kt`、`LiquidGlassPhysics.kt` | `src/components/glass/physics.ts`、`src/components/glass/useGlassLens.ts`；分别处理x、y、升起、释放和取消，短按也完成升落。 | 物理与hook测试，真实浏览器测量二维位移。未实测物理振动。 |
| tab、toggle、分段完整玻璃与彩虹边缘 | `ui/component/liquidglass/LiquidGlassNavigationBar.kt`、`GlassSwitch.kt`、`GlassSelectionControls.kt` | `src/components/glass/GlassNavigation.tsx`、`src/components/SegmentedSwitcher.tsx`、`src/views/mine/shared.tsx`；按住透镜高于轨道上下边，容器允许外溢。 | Chromium测量导航、switch和分段上下外溢及二维拖动；不能称真实场景像素折射。 |
| 按钮尺寸与点击槽 | `ui/component/liquidglass/GlassButtons.kt`、`ui/screen/schedule/ScheduleScreen.kt` | 常规48像素点击槽；Classic顶栏32像素填色圆盘，玻璃36像素光学圆盘；极窄顶栏统一缩放。 | 浏览器测量槽和圆盘分离，Classic填色仍存在。 |
| 顶栏居中与窄屏压缩 | `ui/screen/schedule/ScheduleToolbarLayout.kt` | `src/components/schedule/ScheduleToolbar.tsx`、`src/components/schedule/toolbarLayout.ts`；整栏绝对中心，完整周次和两侧箭头常驻，先压间距再压控件。 | 两种风格各测280、320、360、390、768像素，中心误差小于0.6像素，无静态重叠或横向溢出。 |
| 撤回胶囊与周跳转 | `ui/screen/schedule/ScheduleScreen.kt` | `src/views/ScheduleView.tsx`、`src/components/schedule/useWeekSwipe.ts`；undo/redo存在时显示，允许外溢，周切换、跳周与滑动保留。 | 顶栏及分页测试；浏览器实测撤回容器未裁切。 |
| 周视图、网格与七天 | `ui/component/CourseTableView.kt` | `src/components/schedule/FullWeekView.tsx`、`CardsGridView.tsx`；显示天数是用户偏好，允许七天，不强制工作日。 | 七天表头单行实测；摘要前五门遵循Android，完整详情没有同样上限。 |
| 冲突显示 | `ui/component/CourseTableView.kt`、`ui/screen/mine/ScheduleConflictBottomSheet.kt` | `src/components/schedule/GridClusterCard.tsx`、`src/domain/conflictLayout.ts`、`src/views/mine/ScheduleConflictSheet.tsx`；堆叠、折叠、侧轨、偏移配置、默认顶层和可滚动冲突详情。 | 几何、冲突布局与默认顶层测试；重叠课程不会因只展示一张卡而从数据中删除。 |
| 长按浮卡与空白快速加课 | `ui/component/FloatOccurrence.kt`、`QuickAddCourse.kt` | `src/components/schedule/ScheduleInteractionLayer.tsx`、`src/components/schedule/interaction.css`；长按课程浮起，空白生成可调整长度的加课胶囊。 | Chromium实际CDP触控拖动未触发pointercancel；取消快照一致。 |
| 跨周拖动、resize、二次确认 | `ui/screen/schedule/FloatOccurrenceHandler.kt` | 同一交互层配合 `src/components/schedule/useOccurrenceActions.tsx`；边缘停留翻周，释放停止，改结束节次后再确认。 | 浏览器验证1至2节改成1至3节、跨周释放不继续翻页；仓库另测跨周落库。 |
| 原位和取消 | 同上 | 位移未改变发生信息直接退出；审批取消回到编辑状态；仓库原位替换也有零变化保护。 | UI数据库/课表/undo/redo快照一致；新仓库测试另通过Dexie写钩子确认课程零写入。 |
| 今日完整课程与学期状态 | `ui/screen/today/TodayScreen.kt` | `src/views/TodayView.tsx`、`src/domain/courseOccurrence.ts`；按实际日期与有效作息显示，保留学期前后状态及日期课程。 | 今日测试覆盖学期外9门固定日期课、跨周调休和来源周，不限制前几门。 |
| 长课间与用餐标记 | `util/MealBreakDetector.kt`、`ui/component/CourseTableView.kt` | `src/components/schedule/mealBreak.css`、`src/components/schedule/gridGeometry.ts`；薄带、午晚餐文字与细线，卡片、拖放和resize使用同一加权几何。 | 几何测试与浅色、深色截图；不是增加空白课程行。 |

## 课程编辑、日期投影和真实保存

| 项目 | Android发布源码 | Web当前实现与行为 |
| --- | --- | --- |
| 完整课程草稿 | `ui/screen/edit/AddCourseScreen.kt` | `src/views/AddCourseView.tsx`、`src/domain/courseDraft.ts`；名称、别名、多时段、七天、周次、单双周、教师、地点、多行备注、节次、独立时钟及颜色模式保留。快速表单进入更多设置携带原草稿。 |
| 卡片折叠与命中滚动 | 同上 | 编辑默认折叠，命中来源主键的时段卡展开；删除叉在右侧箭头紧左；新增卡立即展开。渲染和滚动测试锁定顺序。 |
| 双端范围与幽灵基线 | `ui/component/IntRangeSlider.kt`、`ui/component/liquidglass/GlassSliderThumb.kt` | `src/components/IntRangeSlider.tsx`；周次和节次起止互相约束，保留打开时基线幽灵；连续标准域之外使用非标准节次输入。 |
| 校验 | `util/TimeTableUtils.kt`、`ui/screen/edit/AddCourseScreen.kt` | 名称、周次顺序、至少一天、起始节次、跨度、非标准节次、时钟格式与先后、时段重叠均有验证。校验不靠截断用户课程数实现。 |
| 连续取色与组色 | `ui/component/ColorPickerDialog.kt`、`util/CourseColorUtil.kt` | `src/components/ColorPickerDialog.tsx`、`src/domain/courseColor.ts`；HSV连续拖动、色相幽灵及组色影响确认；GROUP、AUTO、CUSTOM保留独立语义。`f5d975c` 已将GROUP/CUSTOM的Android ARGB透明度保留为CSS rgba，RGB对比和色相计算继续使用RGB。 |
| 单次日期身份 | `util/CourseOccurrence.kt` | `src/domain/courseOccurrence.ts` 导出 `CourseOccurrence { course, sourceDate, displayDate }`。源日标识存储中的那次课，显示日标识调休后位置；不能用投影星期覆盖存储身份。 |
| 单次拆分与合并 | 同上 | `withoutOccurrence` 只删一个实际教学周，保留单双周和其他字段；`mergeMatchingRows` 仅在精确教学周集合可由一行表示时合并，固定日期和空组不被自动合并。 |
| 日期投影 | `util/HolidayRange.kt`、`util/CourseOccurrence.kt` | `coursesForDate` 统一供今日、周课表、提醒及ICS使用；调休读取来源周，源日抑制，目标原课让位，固定日期留在自然日期。 |
| 单次地点、节次、日期或时钟调整 | `ui/screen/edit/OccurrenceEditor.kt`、`ui/screen/schedule/FloatOccurrenceHandler.kt` | `src/components/schedule/useOccurrenceActions.tsx`、`useOccurrenceDialogs.tsx`；日期归属与冲突审批后保存；删除仅删本次，其他周不受影响。 |
| 全草稿原子保存 | `data/repository/ScheduleRepository.kt`、`data/diff/RowKeyDiffer.kt` | `src/data/repository.ts` 的 `saveCourseDraft` 在事务中比较当前课程、有效绑定作息和调休快照，拒绝陈旧审批。课程和新增边缘时段共用一次撤回。 |
| 精确行编辑 | 同上 | 元数据修改保留主键；身份改变插入，遗漏行删除；只合并编辑组。空groupId旧课通过 `replacingCourseId` 精确替换，不能把全部空组当一个组。新建同名课程继承全库规范化名称最早组。 |
| 单次原子保存 | `data/repository/ScheduleRepository.kt` 的 `saveOccurrence` | Web同名接口事务内比较课程、课表、有效作息、调休和发生原行。只合并当前非空组，保留其他组的分段与主键；统一空fixedDate后识别原位，不消费undo/redo。 |
| 组色立即保存 | 同文件的组色写入路径 | `setGroupSourceColor(tableId, groupId, hex)` 只更新该表该组的GROUP行；AUTO、CUSTOM、其他组、其他表及持久色相保留。真正变化才形成一次撤回；空组、缺组、同色不动历史。 |
| 共享边缘时段回收 | `data/repository/ScheduleRepository.kt` | 回收前扫描所有绑定同一作息的课表引用，同时考虑节次和独立时钟映射；写实际periodTable来源，不只改当前课表兼容列。 |
| 撤回与重做 | Android撤回管理及上述仓库写入路径 | `src/data/undoStore.ts`；课程、课表、作息表快照，支持关闭、有限及无限深度，复合动作锚定动作前。当前历史在内存，不承诺刷新后保留。 |

实际接口如下，UI已经接入这些函数，不再停留在缺失接口的类型扩展或mock层：

```ts
saveCourseDraft(
  drafts: Course[], replacingGroupId: string | null, expectedCourses: Course[],
  expectedTable: Table, draftTimeJson: string, expectedTransfers: HolidayTransferEntry[],
  replacingCourseId?: number,
): Promise<boolean>

saveOccurrence(
  occurrence: CourseOccurrence, replacement: Course | null, expectedCourses: Course[],
  expectedTable: Table, expectedTransfers: HolidayTransferEntry[],
): Promise<boolean>

setGroupSourceColor(tableId: number, groupId: string, hex: string): Promise<void>
```

两个保存接口的 `false` 表示审批快照过期或目标已不可用，调用方保留错误和重试入口。原位成功返回 `true`，不把无变化当新动作。事务测试证明的是这些实际仓库路径；它们不等于所有浏览器已完成真实手动保存认证，也不额外保证事务异常发生时内存历史的所有回滚情况。

## 课表、作息和设置

| 项目 | Android发布源码 | Web当前落点与核对结果 |
| --- | --- | --- |
| 全部课表与课程列表 | `ui/screen/mine/AllTablesScreen.kt`、`CourseListScreen.kt` | `src/views/mine/AllTablesPage.tsx`、`CourseListPage.tsx`；新建、默认、复制、编辑和课程聚合入口保留，复制支持指定名称。课程按名称和教师聚合，再按地点展开安排。 |
| 课表元数据与作息绑定 | `ui/screen/mine/EditTableScreen.kt` | `src/views/EditTableView.tsx`、`src/data/types.ts`；名称、学期日期、最大周数与绑定来源；首次绑定保存原快照，换绑不覆盖快照，解绑恢复，等来源加载完成后初始化草稿。 |
| 作息表管理 | `ui/screen/mine/PeriodTablesScreen.kt`、`PeriodTableEditScreen.kt` | `src/views/mine/PeriodTablesPage.tsx`、`PeriodTableEditView.tsx`；新建、复制、编辑、导入导出及删除。主动删除共享作息前说明绑定数量，删除时把有效时钟冻结到各绑定表；未保存新表仅在未绑定时允许清理。 |
| 手动和自动时段 | `ui/component/TimeSlotEditor.kt`、`util/TimeTableUtils.kt` | `src/views/mine/TimeSlotSection.tsx`、`src/domain/periodEditor.ts`；时钟居中，移除拖拽排序；手动转自动按现有时钟推断，rows与智能配置一同换绑，自动替换标准行并保留边缘行。 |
| 时段改动审批 | `ui/screen/mine/PeriodTableEditScreen.kt` | 保存前展示受影响课程，保留相应策略选择和取消；不是直接覆盖共享作息。相关纯域、编辑草稿和仓库测试分层验证。 |
| 节次表头 | `ui/screen/mine/PeriodHeaderSettingsScreen.kt`、`util/AppPrefs.kt` | `src/views/mine/PeriodHeaderSettingsPage.tsx`、`src/components/schedule/periodHeader.ts`；旧式与三行、数字样式、悬挂量、完整第X节、时间对齐及隐藏时间。隐藏只作用于legacy，切三行不清偏好。 |
| 隐藏时间持久化 | `util/AppPrefs.kt` 的 `period_header_hide_time` | `periodHeaderHideTime` 默认false，读取与更新仅布尔true启用；Android BOOL键导入导出及真实备份ZIP往返通过。它存于偏好JSON，不需要增加数据库schema版本。 |
| 我的分组 | `ui/screen/mine/MineScreen.kt` | `src/views/mine/MineHome.tsx`、`src/views/MineView.tsx`；课表/作息/假期、提醒/外观/通用/小组件、备份、关于分组保留；统计可进入对应列表。 |
| 外观主题 | `ui/screen/mine/AppearanceScreen.kt`、`CustomThemeEditorScreen.kt`、`ui/theme/ThemePresets.kt` | `src/views/mine/AppearancePage.tsx`、`CustomThemeEditorView.tsx`、`src/theme/themes.ts`；浅深与跟随系统、预设、自定义、主题编辑与备份。系统主题使用默认色板，不能读取Android壁纸动态色。 |
| 课程配色 | `util/CourseColorUtil.kt`、`CourseColorWriteGlue.kt` | 外观页统一底色、经典、跟随主题、自定色相与重新编排；`src/data/courseHueStore.ts` 持久化组色相并响应数据变化。组/自定/自动颜色与整体材质分别控制。 |
| 课表显示设置 | `ui/screen/mine/ScheduleDisplayScreen.kt` | `src/views/mine/ScheduleDisplayPage.tsx`、`DisplayOptions.tsx`；默认视图、切换器、七天、日期、节次/时钟、最近有课日、双栏、隐藏空日、别名、副信息、缩放、圆角、自适应行高、捏放、自动收晚间、分隔线、课间与冲突样式均有设置和消费路径。 |
| 通用 | `ui/screen/mine/GeneralSettingsScreen.kt` | `src/views/mine/GeneralSettingsPage.tsx`；语言、高刷新率偏好、撤回模式与深度。高刷开关保留偏好并说明平台限制，不能强制屏幕刷新率。 |
| 假期与调休 | `ui/screen/mine/HolidaySettingsScreen.kt`、`util/HolidayRange.kt`、`HolidayManager.kt` | `src/views/mine/HolidayPage.tsx`、`src/state/holidayStore.ts`；年份、刷新失败重试、范围增改删恢复、灰显/划线、补班优先、失效映射清理、按课表配置调休。卡内选表不修改默认表。 |
| 六语 | Android六套资源 | `src/i18n/index.ts` 及JSON/extra注册英语、简中、繁中、日语、西语、英式英语。导入接续34键有六语和插值验证；部分学校状态、明确安卓专属提示及底层诊断仍为中文，不能称每个提示均已六语核验。 |

## 导入、追加、分享和日历

Android依据包括 `ui/screen/imports/ImportSheet.kt`、`ui/nav/SleepyNavHost.kt`、`data/repository/NewTableImport.kt`、`data/parser/ScheduleExporter.kt`、`SleepyNativeExporter.kt`、`data/calendar/SystemCalendarManager.kt` 及发布资产中的WakeUP脚本。完整协议和交接记录见 [导入对账](import-v1064.md)。

| 项目 | Web实现 | 结果与验证边界 |
| --- | --- | --- |
| 新表导入 | `src/views/ImportView.tsx`、`src/domain/import/importApplication.ts` | 预览、名称、开学日期、周数、手动/自动时钟及作息绑定确认后原子新建；保留现有默认表，仅首表自动设默认。 |
| 追加到明确课表 | `src/views/ScheduleView.tsx`、`ManageView.tsx`、`AddCourseView.tsx`、`ImportView.tsx` | 日程工具栏、空态和管理进入同一目标追加入口；手动表单单独入栈；目标不存在报错，不悄悄新建另一表。 |
| 从已有课表选择 | `src/domain/import/courseImportPolicy.ts` | 按组选择后再预览，空选择不能继续，冲突课程默认不追加，导入前备份默认开启，确认阶段禁重复应用。 |
| 追加冲突与绑定 | 同上及 `importApplication.ts` | 按实际周次和时钟判断，缺目标节次先拒绝；不改目标共享作息。备份冻结有效时钟并解绑，关闭提醒；空导入不制造备份。 |
| 文本与文件格式 | `src/domain/import/scheduleParser.ts` 及各解析器 | 保留JSON、原生sleepy、分享文本、CSV、HTML、普通文本与ICS输入，纯作息单独命名保存，不制造课表。不能由测试覆盖推断所有第三方文件变体兼容。 |
| 固定日期与来源原文 | `sleepyNativeParser.ts`、`sleepyNativeExporter.ts` 及导入事务 | fixedDate和importSourceJson贯通，保留来源空格、全角、null与未知字段；原生CRC先校验原文字节，再做归一化；课程显式高节次不被30节截断。 |
| WakeUP口令 | `src/domain/import/wakeupShare.ts` 及加密实现 | 两步官方协议、私有DES、RC4、取消和超时实现；发布金标与加密模拟服务端测试通过。尚不能声称真实有效口令线上导入成功。 |
| 受限中转 | `worker/sleepy-jw-proxy.ts`、`src/domain/import/wakeupRelay.test.ts` | 源码只允许两个官方POST端点，拒绝教务URL、其他域名、凭据、重定向，限制正文大小。此前导入记录只验证旧服务预检；最终受限版本是否已上线必须由主线部署后核验。 |
| 学校目录 | `src/views/jw/SchoolSelectPage.tsx`、`schools.ts`、`schoolLocation.tsx` | 完整目录、状态、搜索、字母导航、同城推荐和用户授权定位保留；压缩及HTTP已解压边界资产均可读取。定位只用于推荐。 |
| 教务登录明确例外 | `src/domain/jw/webPolicy.ts`、`src/views/jw/JwImportView.tsx`、`JwCapturePage.tsx`、`proxyClient.ts` | 选择任意学校、状态、自定义URL及旧深链均提示“网页暂不支持教务导入，请使用安卓版导入”。没有可达的登录、捕获、草稿恢复或教务代理请求；这是明确例外，不是已移植成功的网络功能。 |
| 导出与顶栏分享 | `src/views/ExportView.tsx` | JSON、分享文本、ICS、原生sleepy及纯作息导出保留；先水合实际绑定作息；复制拒绝有失败反馈。文件交给浏览器下载，不能保证Android的下载目录或系统分享面板。 |
| 循环ICS与逐日ICS | `src/domain/import/scheduleExporter.ts`、`icsRangeExporter.ts`、`icsProjection.ts` | 无调休可用RRULE，有调休按共享日期投影展开，含跨周、来源奇偶、学期外目标及固定日期；Sleepy扩展字段支持再导入。 |
| 添加到系统日历 | Android `SystemCalendarManager.kt` 对位 | Web入口下载按未来一周、一个月或学期范围的逐日ICS，保留提前提醒设置；首日首课闹钟仅为描述标记。没有直接写系统日历、查询系统导入记录、撤销系统日历事件或原生独立闹钟能力。 |

## 提醒、每日课程汇总与小组件

| 项目 | Android发布源码 | Web当前实现与边界 |
| --- | --- | --- |
| 提醒设置完整结构 | `ui/screen/mine/ReminderScreen.kt`、`TableReminderScreen.kt` | `src/views/mine/ReminderPage.tsx`、`TableReminderPage.tsx`、`src/state/reminderStore.ts`；总开关、每表范围、课前提前量、横幅/流体模式、字段与测试入口、今日/明日时间、日期规则和可靠性说明。 |
| 每表范围自动转自定义 | `data/repository/ReminderTableScope.kt` | `src/domain/reminders/tableScope.ts`、`setTableReminderEnabled`；未手选跟随默认范围，首次手动选择冻结各表开关，旧数据迁移保留行为，修改可撤回。 |
| 多表每日汇总 | `widget/notification/DailyAgenda.kt`、`DailyAgendaLoader.kt` | `src/domain/reminders/agenda.ts`、`scheduler.ts`；按时间排序，只有跨表且名称、地点、教师及完整时钟一致的发生才合并，保留来源表；缺字段或同表重复不误合并。 |
| 通知与汇总详情 | `ui/screen/today/DailyAgendaRoute.kt`、`DailyAgendaActivity.kt` | `src/views/DailyAgendaPage.tsx`、`src/App.tsx`；`#/今日/课程汇总/:date`，通知点击聚焦页面并打开对应日期；详情实时查库，有加载、失败重试及空态。通知仅摘要前六项，详情显示全部。 |
| 课前与日期规则 | `widget/notification/CourseNotificationScheduler.kt`、`util/HolidayReminderPolicy.kt` | `src/domain/reminders/scheduler.ts`、`holidayPolicy.ts`；按开启表扫描、固定日期和调休投影、当天触发去重；公休、调休源日、补班、普通周末独立选择，数据失败时放行。当前实现遍历所有命中项，不能沿用旧注释“只取一节”的描述。 |
| 通知交付 | `widget/notification/CourseNotificationScheduler.kt`、`FluidCloudService.kt` | `src/domain/reminders/notify.ts` 使用授权后的浏览器Notification和页面定时器。流体模式可保存、预览与测试，并以普通通知承接提醒；没有厂商流体云、持续进度、前台服务或锁屏系统容器。 |
| 可靠性 | Android通知、精确闹钟及电池权限路径 | 网页只申请浏览器通知权限。系统精确闹钟、忽略电池优化、启动器绑定、厂商增强和promoted能力显示不适用。页面关闭、被冻结或后台节流后不能保证准时唤醒；目前没有后台Push服务作为等价实现。 |
| 小组件画廊 | `widget/WidgetGalleryData.kt`、`WidgetVariant.kt`、`ui/screen/widget/WidgetGalleryScreen.kt` | `src/data/widgetVariants.json`、`src/views/mine/WidgetGalleryPage.tsx`；五类十四变体、尺寸元数据、原版预览图和手风琴展开，选择后明确提示使用安卓版添加桌面。`src/appAssetUrl.ts` 保留应用挂载前缀，使 `/preview/` 与bare `/preview` 的图片和service worker地址正确；主线报告浏览器五张预览真实加载。 |
| 实时小组件预览与共用外观 | `ui/screen/mine/WidgetSettingsScreen.kt` | `src/views/mine/WidgetSettingsPage.tsx`；读取有效作息与真实课程，今日、周列表、网格及前后周预览，共用无色、分隔、显示设置和实验性标点偏好可保存。 |
| 小组件管理与设备配置 | `ui/screen/widget/WidgetManagementScreen.kt`、`WidgetEditScreen.kt` 及 `widget/` | Web管理入口提供原生能力说明和画廊；没有真实appWidgetId、固定到桌面、拖动尺寸、按实例绑定课表、实例别名/滚动窗口编辑或原生刷新任务。画廊及预览不是这些原生能力的完成证据。 |

## 数据、备份、关于与Web附加模式

| 项目 | Android依据 | Web实现与边界 |
| --- | --- | --- |
| 持久化模型 | `data/entity/`、`data/repository/ScheduleRepository.kt` | `src/data/types.ts`、`src/data/db.ts`；IndexedDB schema5补fixedDate、importSourceJson、reminderOverride及courseColors。原有行保留，缺字段有迁移默认。不是Room文件级互换。 |
| 原生备份容器 | `data/migration/MigrationBackup.kt`、`MigrationPrefsCodec.kt` | `src/domain/migration/backupExecutor.ts`、`dbCodec.ts`、`prefsCodec.ts`、`zipCodec.ts`；sleepybackup容器、manifest、模块与内容校验，database/preferences导出和覆盖/合并导入，数据库合并重映射引用。 |
| 备份覆盖范围 | 同上 | database含作息表、课表、课程和导入草稿；preferences含已映射偏好、提醒、假期、调休与自定义主题。原生widgets、persisted_state、credentials没有Web目标，不可称全部Android模块恢复。数据库和偏好分别应用，不宣称跨两类存储的整包事务。 |
| 隐藏时间与提醒mode往返 | `util/AppPrefs.kt` | period_header_hide_time以BOOL映射，before_class_mode以STRING映射；后者主线 `8ec9bb5` 已补。不能把这两项测试外推为所有偏好均已逐键往返。 |
| 关于、反馈和更新 | `ui/screen/mine/AboutScreen.kt`、`util/FeedbackComposer.kt`、`QqJoin.kt`、`UpdateNotifier.kt` | `src/views/mine/AboutPage.tsx`、`src/domain/feedback.ts`、`src/domain/update/`；版本、更新说明、忽略版本、自动检查、作者、源码、隐私、反馈、QQ及声明入口保留。反馈诊断改用Web平台与UA；更新打开发布页，不能自装APK，QQ使用网页回退。 |
| 开源声明 | `ui/screen/mine/LicenseScreen.kt` | `src/views/mine/LicensePage.tsx`、`src/data/androidLicense.json`；保留许可信息和来源。主线报告官网已rebase最新main并纳入license页面，新构建13页成功；构建结果不能代替部署验证。 |
| 官网演示和公开课表 | Android无完全相同模式 | `src/publicSchedule.ts`、`src/App.tsx`；公开文件构建是明确只读用途。官网嵌入和演示隔离策略由主线验证，不以只读界面代替普通应用的管理与保存验收。 |

## 已知剩余差距与浏览器平台边界

下列差异必须保留在最终评审中。前三类是设备或平台替代，后面另列当前实现差距和尚未取得的证据，不能全部归因为浏览器限制。

| 类别 | 实际边界 | 不能据此声称 |
| --- | --- | --- |
| 光学和排版 | CSS模糊、渐变和弹簧近似Compose/AGSL；字体、抗锯齿、原生输入、日期/时间选择器随浏览器与系统变化。 | Android像素一致、相同渲染管线或相同原生弹窗。 |
| 触觉与高刷新率 | 仅在可用时调用navigator.vibrate；高刷偏好不控制显示设备。 | 物理振动已实测或已强制高刷新率。 |
| 壁纸动态色 | “跟随系统”处理深浅，系统主题回退默认色板，不能读Android壁纸取色。 | Material You设备动态色完整移植。 |
| 后台及厂商提醒 | 页面定时器、浏览器授权、普通通知；缺AlarmManager、前台服务、厂商流体云和后台唤醒保证。 | 关闭浏览器后仍精准到点、原生流体云或锁屏持续进度可用。 |
| 启动器小组件 | 十四变体画廊和真实课程预览存在，安装、实例管理、绑定与刷新服务不存在。 | 桌面小组件已完整运行或已在启动器固定成功。 |
| 日历 | ICS下载由用户交给日历应用，提醒是否采用由目标客户端决定；没有CalendarProvider写入和删除。 | 已写系统日历、已排首课原生闹钟或可撤销系统日历事件。 |
| 登录与网络 | 教务目录可浏览，登录与捕获按明确例外关闭；WakeUP是独立在线协议。 | 支持网页教务账号直连，或目录可选等于学校导入可用。 |
| 文件与权限 | IndexedDB、localStorage、Blob下载、剪贴板及定位由站点权限和浏览器控制；不等价于Android文件目录、设备存储和系统分享。 | 文件必在某个Android路径、已具备跨设备同步或永久存储保证。 |
| 备份偏好缺项 | 本次静态对账发现 `Prefs` 的 `periodHeaderTimeAlignment`、`undoDepth` 尚未出现在prefsCodec的PrefsFieldMap。它们本机偏好可保存，但不能声称通过sleepybackup原样迁移。 | 所有设置已逐键无损往返。此项是实现缺项，不是浏览器限制。 |
| 备份额外状态 | courseColors不在database快照的四类记录中；未知偏好键不会自动成为Web可恢复字段；当前覆盖导入对Dexie偏好按已有字段合并。 | 色相缓存、未知键和缺省键重置均与Android全量物理状态相同。 |
| 本地化 | 六语框架和新增导入键有验证；学校状态、安卓专属原句和部分诊断仍中文。 | 全部流程每条提示均有六语人工验收。 |
| 外部服务与部署 | WakeUP离线金标和模拟加密服务端已验；有效线上口令成功、受限中转线上版本、部署地址和官网上线状态由主线收口。 | 测试响应等于真实口令成功，或本地worker源码等于线上限制已生效。 |
| 运行平台覆盖 | 历史交互证据来自本机Chromium155和特定视口，未建立本轮Safari、Firefox、真机触觉和Android/Web同屏截图矩阵。 | 所有浏览器、所有设备、所有外部文件已认证等价。 |

本文只按授权记录差距，没有借文档任务修改实现或MEMORY。后续若主线补齐上述缺项，应以实际提交和验证更新对应行，不能删除限制后仅保留“全部移植”的笼统结论。

## 已执行验证及证据归属

### 主线最终结果

主线在本次交接中报告最终候选全量1429项测试通过。本文档代理没有重复运行该全量，也没有执行本次发布或线上验证；1429是主线报告的最终数字，不与各阶段测试数相加。主线仍独立负责候选构建、最终浏览器验收和部署结果。

### 真实仓库接入验证

这些测试直接执行真实保存、数据库比较、撤回和重做逻辑，存储为隔离的fake-indexeddb；不会读写用户数据库。界面层部分测试仍使用mock，不能用它们替代下表。

| 提交与测试文件 | 新增测试及实际验证 | 实际通过记录 |
| --- | --- | --- |
| `7952411`；`src/data/courseDraftSave.test.ts` | 14项：完整字段与边缘时钟、撤回重做、主键和行增删、空组单行、全库同名组、精确周合并、fixedDate、原位保留redo、共享时段引用/回收、课程/课表/有效作息/调休四类陈旧审批、并发只首个成功。 | 相关5文件63项通过；接口实现前已有12项因缺函数失败，补齐后通过。 |
| `0c707d2`；`src/data/groupSourceColor.test.ts` | 5项：指定表与组的GROUP行、其他颜色模式与courseColors保留、一次undo/redo、空白/缺组/同色无历史变化。 | 相关4文件24项通过；接口实现前5项缺函数失败，接入后通过。 |
| `8ad8925`；`src/data/periodHeaderPrefs.test.ts` | 9项：旧库默认false、畸形值不启用、开关持久化与重载、三行布局保留、Android BOOL键和真实备份ZIP往返。 | 相关4文件71项通过；接入前9项中8项失败，接入后通过。 |
| `b5bc948`；`src/data/occurrenceTransactions.test.ts` | 12项：无关组主键保留、域生成原位零课程写入和完整快照不变、跨周改节次、奇数周删除、调休来源、固定日期、四类陈旧审批、发生对象陈旧与并发保存。含撤回重做。 | 相关8文件81项通过；修复前复现无关组合并与原位3次写入两个失败，修复后通过。 |

新测试合计40项。相关套件数字有交叉，不能相加当作独立新增数量。上述最后一批实际命令为：

```sh
npm test -- --maxWorkers=2 --minWorkers=1 src/data/occurrenceTransactions.test.ts src/data/occurrenceSave.test.ts src/data/courseDraftSave.test.ts src/data/repository.test.ts src/data/undoStore.test.ts src/domain/courseOccurrence.test.ts src/components/schedule/useOccurrenceActions.test.tsx src/components/schedule/OccurrenceEditor.test.tsx
```

隐藏时间批实际命令为：

```sh
npm test -- --maxWorkers=2 --minWorkers=1 src/data/periodHeaderPrefs.test.ts src/state/prefsStore.test.ts src/domain/migration/backupExecutor.test.ts src/components/schedule/periodHeader.test.ts
```

### UI、导入与主线其他证据

| 证据 | 确实验证的内容 | 不能外推的结论 |
| --- | --- | --- |
| [UI记录](ui-v1064.md)、[浏览器机器结果](evidence/ui-v1064/verification.json)、[可重跑脚本](evidence/ui-v1064/verify.mjs) | 界面源码 `077585a` 阶段119文件1321项、生产构建，以及隔离Chromium155的十组顶栏、七天、二维玻璃、上下外溢、CDP触控、浮卡、resize、跨周停止、取消和原位快照、快速表单、取色、深色表头与八张截图。机器结果passed=true、页面异常为空。 | 这是当时UI阶段的证据；不是最终主线全量数，不证明真实硬件折射、振动、所有浏览器或后来接口的完整浏览器保存。 |
| [导入记录](import-v1064.md)、`src/e2e/import-v1064.e2e.test.ts` | 导入阶段110文件1298项与构建，五项隔离Chromium测试覆盖新表/原生往返、加密WakeUP测试响应、目录定位搜索、追加冲突过滤和深链封口。 | 旧服务预检和模拟协议不能代替受限中转部署及真实有效口令成功。 |
| 导入接续 `6a8965e`、`eb284bd`、`1db6cb2` | 明确目标加课入口、返回层级、来源复制、六语键与插值；接续相关7文件40项、另2文件36项及TypeScript通过，更新了浏览器入口定位。 | 接续阶段未重跑更新后的浏览器套件，最终由主线复核。 |
| 提醒 `60b88b9` | 主线提交记录为课程汇总、通知点击、调度、返回栈和偏好48项定向通过；存在真实库变化触发详情更新测试。 | 不证明后台系统唤醒或厂商服务运行。 |
| 画廊 `b73e311` 与 `src/views/mine/WidgetGalleryPage.test.tsx` | 十四变体、五类手风琴、选择后的原生安装说明；实时预览代码读取当前课表。 | 不证明安装或配置任何Android桌面实例。 |
| 挂载路径 `2f622e2`、`src/appAssetUrl.test.ts` | 源码和用例覆盖根路径、子目录、bare路径及index.html，图片与service worker共用挂载路径解析；主线报告浏览器五张预览真实加载。 | 文档代理未重跑这次浏览器核验；不证明Android启动器安装或离线缓存已在所有浏览器完成认证。 |
| ARGB透明度 `f5d975c` | 主线报告相关58项通过；源码已核对GROUP/CUSTOM输出CSS rgba保留alpha，RGB对比和hue计算保持原语义。 | 不证明Android/Web同屏逐像素一致，或所有浏览器的混色与抗锯齿一致。 |
| 官网许可页面与构建 | 主线报告网站已rebase最新main的license页面，新构建13页成功。 | 文档代理未重跑该网站构建；不等于新官网已部署并完成线上验证。 |

UI和导入历史生产构建均记录repository混合静态/动态导入和包体积提示，不能写成零警告。本次仅文档提交执行路径引用检查、内容核对与 `git diff --check`，不冒充重新运行实现测试。发布结论须结合主线最终候选的实际日志、浏览器和部署证据。
