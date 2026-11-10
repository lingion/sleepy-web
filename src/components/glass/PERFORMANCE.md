# 当前阶段交付，2026年11月11日

本文件后续章节保留早期实验记录。当前可提交实现为玻璃图 v7，加上按真实帧间隔推进的解析弹簧。v8 的三个 identity feTile 未改善真实交互，已精确撤回该实验；实验补丁与测量保留在本机报告目录，不能作为生产优化宣称。

当前保留完整背景与文字两套透镜、RGB 色散、六路采样、二维拖动、果冻几何、抬升和回落的原始弹簧参数。Spring.tick 取消 50 毫秒截断，解决低帧时动画墙钟被拉长；这不等于解决滤镜的长帧。

后续 v6/v7 还将普通预乘加法改为 lighter，将互不重叠的颜色平面用 lighten/screen 合并，将遮光和边缘暗线改为保持透明度的 atop。只有可证明整个采样区域不透明时才使用 opaque 图；失败、裁切或透明时退回通用 alpha 图。负折射地图的中性校正保持静态，只改变实际 displacement scale。不同颜色、透明度、抬升量和边缘的数值等价由 opticalSvg.test.ts 验证。

同完整官网的真实测量仍存在不可接受的玻璃长帧。v7 的一次正式 1500 毫秒按压，最大帧间隔 835.3 毫秒，完整回落 7246.4 毫秒。v8 加真实时间弹簧与启动快照复用的候选为 12 帧、最大 550.4 毫秒、完整回落 3597.3 毫秒。后者含多个改动且仅一次，不能归因给 Tile，也不能转写为当前 v7 最终性能。用户要求的流畅度仍未完成。

完整阶段说明与启动边界见 docs/performance-progress-20261111.md。最终构建、局部复跑和 Node 契约结果已在该文档记录，完整结果以 PR 检查与归档日志核验。

---

# 早期玻璃运行时性能记录

固定基线为 `2e716653182995511ee16ecde40869d42a22bd21`，工作区为 `/Users/lingion_k/sleepy-worktrees/web-performance-20261110`。本任务仅修改 `src/components/glass/`，未修改玻璃 CSS、几何公式或弹簧参数；没有整仓构建、浏览器操作、提交、推送或启动其他 agent。

## 已确认的瓶颈

1. 原 `paint` 每帧读布局，再写继承 CSS 变量，两个 optics 随后重复测量。现在由轨道初始化和 ResizeObserver 提供尺寸，paint 差分写入，受控尺寸传给 optics。
2. 运动产生的地图超过原 32 项缓存，重复交互继续生成地图和 PNG。现在最多 128 项，同时保留原 16 MiB 原始地图容量上限；逐像素采样不再产生临时对象。
3. 经典模式仍安装 SVG optics，实际冷挂载测试产生了 PNG。现在仅在玻璃模式启用，主题往返切换和 enabled 切换均有运行时测试。
4. 主线程真实浏览器 profile 确认同步 canvas 路径是第一轮 JS 长任务来源：PNG 总计 2173.4ms、单次最大 1470.5ms；地图总计 38.5ms，材质读取仅 0.5ms。加入 `getContext('2d', {willReadFrequently: true})` 后，同类浏览器采样的 canvas 读回总计 13.3ms、单次最大 0.5ms，PNG 总计 19ms。两轮帧数不同，这些是观测总量，不是同样本的倍数结论。
5. JS 降低后，单页真实帧仍可达约 1283ms。主线程仅在诊断构建关闭背景 backdrop 后明显改善，定位到背景透镜滤镜渲染。产品保留背景透镜，按代数等价化简其 SVG 图。

## SVG 等价化简

动态图只保留该材质在所有 lift 下可能非零的分支。`lensContent` 保留 RGB 采样和 rim frost，省略恒零的 haze、整体 blur、rim、end shade 与 hairline。地图仅对实际使用的标量编码，所有 PNG 像素仍满足 R=G=B、A=255。

背景 `lens` 的 `rimAdded=0` 时，原高光公式为 `C*(1-s)+A*s`，其中 C 是预乘颜色、A 是该颜色的 alpha、s 是 shine。它等价于白色高光以 s 为 alpha 对 C 做 `atop`，避免高光链反复引用 RGB 子图。没有假定背景不透明。

背景的负 refraction 不触及正 refraction 的 halfMinor 截断，位移随 lift 线性缩放。将中性字节 128 的校正、lift 混合和 alpha 补偿并入 X/Y 矩阵，保留六张中性灰位移图和六次真实 RGB 采样。文字透镜继续采用原正 refraction 路径。

| 背景图版本 | SVG 图元 | 依赖递归展开引用数 |
| --- | ---: | ---: |
| 第一轮动态材质专门化 | 94 | 2501 |
| 再合并高光 atop | 87 | 522 |
| 再合并线性位移矩阵 | 77 | 302 |
| glass-graph-v4：灰度 lighten 最大 alpha，省略恒等颜色处理 | 72 | 251 |

递归引用数是结构指标，不代表浏览器必然重复执行，也不是 GPU 耗时或帧率。77 图元版本主线程同环境按压取得 13 帧，最大及 p95 帧约 583.9ms，JS 回调最大 22.3ms、总计 161.3ms。相对原 1132.9ms 仍略低于两倍且绝对帧耗时不可接受，尚未完成目标。72 图元 v4 的真实帧收益仍由主线程复测。

v4 将 RGB 三路 alpha 映射到不透明灰度，再用 `lighten` 取最大值并还原为 alpha，避免 source-over alpha 规则造成错误。不需要不透明背景假设，任意透明采样仍保留。恒等 saturation、brightness 和透明 tint 在材质所有 lift 下均为恒等才省略。配置改变这些前提时重编译私有图，其他消费者不受影响。构建输入摘要另存 `/tmp/sleepy-web-perf-20261110/glass-graph-v4-source.json`。

## 采样、裁切与量化

固定基线已采用 cached base maps 加动态 amount，本次没有引入该策略，也没有更改原两 dp 尺寸缓存桶、地图分辨率或最大像素数。

以下核验使用四种精确形状（37×24、80×40、103×51、150×65）、七种 lift、pixelSize=0.5，并把缓存桶近似与采样公式分开。默认 padding 下，每类透镜检查 730422 个可见像素位移分量，无裁切、无数值越界；before/after 地图字节差为零。

| 默认 padding | 背景 lens | 文字 lensContent |
| --- | ---: | ---: |
| 动态解析公式最大误差 | 8.89e-16 dp | 2.67e-15 dp |
| 解码值相对 scaled 解析公式最大量化误差 | 0.029720 dp | 0.062174 dp |
| 相对每帧重新量化 scaled maps 的最大差值 | 4.45e-16 dp | 0.087993 dp |

不能称其与“每帧重新量化地图”逐字节完全相同。显式指定 padding=0 时，背景地图先裁切再缩放与缩放后裁切还可相差 0.267520dp；这是基线已有行为，默认 padding 不触发。文字 refraction 的 halfMinor 截断由原 shiftAmount 公式保留。

复现：

```sh
node src/components/glass/sampling-equivalence.bench.mjs
```

脚本从固定 Git 基线提取采样模块，在 `/tmp` 单独打包并输出断言和 JSON；不构建应用。

## Node CPU 基准及其适用范围

`performance.results.json` 保存五样本中位数、原始样本和当时的源码 SHA-256。该快照在 canvas 提示及最新 SVG 化简之前完成，不能视为当前浏览器帧结果。

| 场景 | before ms | after ms | 倍率 |
| --- | ---: | ---: | ---: |
| 24 组冷地图 | 540.092 | 140.515 | 3.84 |
| 首次双透镜 120 步交互 | 3000.333 | 1535.965 | 1.95 |
| 重复双透镜 120 步交互 | 2251.900 | 136.687 | 16.47 |
| 经典模式冷挂载 8 组 | 427.532 | 30.125 | 14.19 |

首次冷交互在该 Node 快照仍略低于两倍。真实 integration1 同场景 1500ms 按压仍只有 8 帧，frame p95=1317.2ms、callback p95=1189.1ms，说明不能用 Node 缓存收益宣称浏览器已达标。

复现最新源码的 CPU 基准：

```sh
GLASS_BENCH_SAMPLES=5 node src/components/glass/performance.bench.mjs
```

该脚本只在 `/tmp` 单独打包 glass 模块，使用 jsdom 和真实 PNG 编码，交替测量 before/after。它验证 120 步几何、clipPath、有效地图及未改动 uniforms，SVG 化简的颜色和采样等价另外由像素求值测试验证。结果不包含浏览器布局、raster、GPU 或合成。

## 真实验证

2026 年 11 月 10 日，本任务实际执行：

```sh
npx --no-install vitest run src/components/glass --maxWorkers=1 --minWorkers=1
npx --no-install tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --jsx react-jsx --strict --skipLibCheck --resolveJsonModule --esModuleInterop --allowImportingTsExtensions src/components/glass/*.ts src/components/glass/*.tsx
git diff --check -- src/components/glass src/theme/glass.css
```

77 图元版本的 10 个测试文件、127 项测试全部通过，scoped 类型检查和 diff 检查通过。72 图元 v4 修改后重新执行两个光学文件的 75 项测试、scoped 类型和 diff 检查，均通过。新增高光测试以各 RGB 采样路不同颜色、不同透明度输入，与通用图独立求值对照；位移矩阵对照精度为小数点后 12 位。另有 28 组固定基线地图 SHA-256、逐像素标量参照、RGB 中性灰、主题往返、StrictMode、卸载、禁用态和几何测试。

| 用户原话 | 当前实现与证据 |
| --- | --- |
| 经典不安装，切玻璃正确安装和卸载 | 经典零 PNG、零 filter；模式往返及 enabled 往返运行时测试通过 |
| 保留真实背景和文字透镜、RGB 边缘色散 | 双独立滤镜仍在；六路背景 RGB 采样保留；像素求值和透明度测试通过 |
| 不改几何、弹簧、二维跟手和缓升回落 | physics 未修改；120 步几何与 clipPath 对照；原运动测试通过 |
| disabled 和 aria-disabled 不遗漏 | 签名和监听补齐；选中 tint 与普通禁用 tint 的运行时测试通过 |
| 至少两倍真实收益 | CPU 热交互已达；浏览器仍须验证 v4，未宣称完成 |

可复用结论：先把 JS 回调耗时和浏览器帧耗时分开。Node 能验证公式、分配和缓存，不能证明 canvas 读回、SVG backdrop 或 GPU 合成成本。真实 profile 的 PNG 长任务先用 CPU canvas 提示验证；同步 JS 消除后仍应继续检查滤镜图的多路依赖和渲染成本。
