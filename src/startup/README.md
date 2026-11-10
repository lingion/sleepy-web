# 启动依赖检查

默认简体中文课表的启动依赖包含课表视图、当前语言和示例数据。编辑器、导入导出页面、学校目录以及解析器在用户打开相关入口时加载。其他五种语言在切换语言时加载。每种语言必须覆盖英语的所有键，现有六种语言与同步资源 API 保持完整。

在仓库根目录执行生产构建，然后运行预算检查。以下命令与本次共享工作树使用同一产物目录：

```sh
BASE_PATH=/ npm run build -- --outDir /tmp/sleepy-web-perf-20261110/startup-dist
node src/startup/checkBundleBudget.mjs /tmp/sleepy-web-perf-20261110/startup-dist
node --test src/startup/checkBundleBudget.test.mjs
```

预算上限为 300,000 字节，按每个文件独立 gzip 后相加，包含 HTML 实际引用的首屏 JavaScript 和 CSS。检查从当前 index.html 遍历真实静态依赖，因此不会把输出目录中的旧哈希文件重复计入。默认课表、简体中文或示例数据如果需要在入口执行后再请求，检查会失败。

检查同时遍历源代码的静态依赖，阻止编辑、导入、导出和教务页面以及 domain/import 解析链进入默认首屏。这样即使解析器被内联或 chunk 被改名，也不会只靠文件名检查漏过。公开课表构建需要实际解析公开文件，不能把它的总加载成本套用到默认示例课表预算。

可用第二个目录参数与既有构建比较：

```sh
node src/startup/checkBundleBudget.mjs /tmp/sleepy-web-perf-20261110/startup-dist /tmp/sleepy-web-perf-20261110/baseline-dist
```

此检查证明依赖与传输体积，不能证明浏览器就绪时间。实际验收还需从宿主页导航开始测量，确认应用就绪至少快一半，并且不晚于宿主页真实 load。不能人为阻塞宿主页的 load，也不能用遮罩代替可交互页面。


测量启动数据和首个真实课程时，需要分别记录以下边界。这里只规定测量方法，不添加运行时埋点，也不改变加载顺序。

1. 在入口开始执行、Bootstrap effect 开始和 `prepareStartup` 完成时分别记录时间。StrictMode 的两个 effect 必须关联到同一个准备任务，不能将重复挂载算成两次真实启动。
2. 在 `main.tsx` 的准备阶段分开记录首次 `loadPrefs`、`prepareI18n`、`seedSampleTable` 或 `loadPublicSchedule`，以及 `usePrefsStore.load`。其中 store 的 `loaded` 提前置为 true，函数仍会等待主题同步和课程色相准备；只有整个 Promise 完成才是这一步完成。
3. 记录 App 首次提交，以及 ScheduleContent 默认课表、绑定作息表和该 tableId 的课程查询分别完成的时刻。课表视图在 Bootstrap 之后重新执行这些 live query，因此准备任务完成不能代替真实课程就绪。初始空数组也不能冒充对目标 tableId 的课程查询已完成。
4. 记录本周课程计算完成、包含真实课程的 React 提交和紧随其后的绘制机会。网格可使用当前周的 `data-grid-week` 与 `data-course-id` 核对课程，避免把相邻周预渲染或只有空骨架的页面记为 ready。正常空课表需要按目标 tableId 查询已完成另行判断，不能要求永远出现课程节点。

宿主页和 iframe 的 `performance.now()` 起点不同。统一以 `iframe.timeOrigin - host.timeOrigin + iframeMark` 换算为宿主页导航起点，再与宿主页真实 load 比较。长任务、资源下载结束、DOM 出现和实际绘制是不同证据。单凭长任务开始时刻不能断定任务属于 IndexedDB、React 或玻璃计算。浏览器冷测期间不要并发构建或测试；设备、后台页面、缓存、数据库与语言条件应保持可比。
