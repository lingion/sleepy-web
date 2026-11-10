# Android v1.0.64 网页界面验收

本目录记录网页源码提交 `077585a8c1928dbb6551b3dade3c4832f94f6823` 的实际运行结果。Android 对照源码是 `77b878fd5c8903a3f201ea938b3b152de4c4fbc0`。后续文档和证据提交不改变被测网页源码。

在项目根目录启动 Vite，然后运行已有本地 Chromium 和 playwright-core。此脚本不下载浏览器。

```sh
npm run dev -- --host 127.0.0.1 --port 5198 --strictPort
UI_EVIDENCE_DIR=docs/evidence/ui-v1064 node docs/evidence/ui-v1064/verify.mjs
```

可以用 `UI_ORIGIN` 和 `CHROMIUM_PATH` 指定 Vite 地址及 Chromium 可执行文件。脚本通过 Vite 的源码模块读取实际偏好、数据库和撤回单例，不能直接针对生产静态构建运行。

每次运行创建独立的临时 BrowserContext，关闭后销毁。课程、偏好和撤回记录只写入该上下文的 IndexedDB 与 localStorage，没有使用用户浏览器资料目录。脚本会覆盖输出目录中的本任务验收文件；复核时可把 `UI_EVIDENCE_DIR` 指向另一个新目录。

`verification.json` 保存浏览器版本、被测提交、运行起始时间、十组顶栏边界、玻璃二维位移和轨道外溢、触控结果、原位及取消后的数据与撤回快照比较。八张 PNG 来自同次运行，已经逐张目视检查。`unit-tests.txt` 与 `build.txt` 是同一网页源码提交下的完整命令输出。

浏览器验收覆盖交互、日期显示、窄屏和取消路径。本分支的共享仓库仍需接入主线新增的数据接口；本目录没有把模拟保存测试或取消路径写成真实共享接口保存验收。完整范围与接口要求见 `../../ui-v1064.md`。
