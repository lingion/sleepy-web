# Web 界面纠正验收，2026年11月10日

本记录纠正此前“功能已接入即完成界面对齐”的结论。事实源固定为 Android v1.0.64 的 `77b878fd5c8903a3f201ea938b3b152de4c4fbc0`，本轮最终功能源码为 `b73201074369927ac31e8b9743e7ba7840d3b12c`。未重新设计官网手机框，完整应用仍通过 `/preview/` 内嵌。

## 用户原话与实现行为

| 用户报告 | 实现及验收 |
| --- | --- |
| 教务导入页面和安卓不一样 | 搜索与计数在外层固定，推荐、自定义链接与学校分组共用滚动区，字母索引独立。保留4140所学校；185项协议显示名来自固定Android源码。实际用hrbeu查到目标，点选显示安卓版提示。详细尺寸见 [页面对账](android-screen-parity.md)。 |
| 我的页面整体布局不一样 | 恢复三个标题、四张设置卡、图标及缩进分隔线，统计和设置行保持原布局层级。已对照固定源码与设备应用设置段截图。 |
| 液态玻璃没有做出来 | 新镜头以真实背景位移、RGB分离形成折射，保留彩虹边缘和弹簧缓升缓落。修复StrictMode取消帧句柄残留。轨道42px时，按住镜头实测约56.34px，顶部52.83小于轨道60、底部109.17大于轨道102。 |
| 设置里面是裸按钮 | 补齐此前缺失的Material填色、tonal、描边、文字与图标按钮规则；经典模式实际截图中的重新配色按钮具有完整底色和48px高度。 |
| 脱壳交互不对 | 浮卡直接复用课程卡。静止显示原卡与两项操作；超过16px死区开始拖动并去掉模糊。实际拖动显示原周二1至2节到周三3至4节的确认，选择返回修改并Escape取消，原课未修改。 |
| 点周次后Dock消失 | 局部周次、切表、详情和分享弹层保留底栏；完整子页面仍按原导航合同隐藏。真实跳周截图可见Dock。 |
| 左侧节次占很大宽度挤压七天 | 时间栏最多与一个课程列等宽，文字优先收缩，受限时采用开始、节次、结束三行；不更改保存的显示偏好。真实四档测量见 [responsive.json](evidence/ui-correction-20261110/responsive.json)，详细来源与有意Web适配见 [列宽对账](grid-width-parity.md)。 |
| 周次必须严格居中，不换行 | 320、360、402、600视口的周次组中心分别为160、180、201、300，均与页面中心完全相同；完整“第2周”保留，七列表头顺序一致，无横向溢出。 |

## 布局不变量

```text
课表顶栏：侧控件       [左] [第 2 周] [右]       侧控件
                               居中于整个页面
课表网格：节次栏 | 周一 | 周二 | 周三 | 周四 | 周五 | 周六 | 周日
          左栏最多一列；每天标题与课程使用同一几何
我的页面：统计卡、课表管理卡、应用设置卡、数据卡、关于卡
选校页面：固定搜索和计数；推荐、链接、学校同区滚动；右侧字母索引
```

## 真实截图

![四屏概览](evidence/ui-correction-20261110/visual-overview.jpg)

完整截图：

- [我的页](evidence/ui-correction-20261110/web-mine.png)
- [选校页](evidence/ui-correction-20261110/web-schools.png)
- [经典Material设置动作](evidence/ui-correction-20261110/web-material-settings.png)
- [课程长按](evidence/ui-correction-20261110/web-course-float.png)
- [跳周与Dock](evidence/ui-correction-20261110/web-week-dock.png)
- [按住玻璃](evidence/ui-correction-20261110/web-glass-held.png)
- [按住有色滑杆](evidence/ui-correction-20261110/web-slider-held.png)

截图使用最终功能源码的本地真实浏览器与已有示例数据，没有清空数据库或修改Android设备数据。设备同版本包曾被另一任务覆盖，因此源码事实源始终固定77b878fd；既有h15tvglc图片实际是所有课表页，没有当作选校页对照。

## 最终本地检查

`BASE_PATH=/ npm run build` 包含TypeScript检查，退出码0；既有混合动态导入与包体积警告保留。随后 `npm test -- --maxWorkers=2 --minWorkers=1`：148文件、1486项通过，零失败。日志保存于本机 `/tmp/sleepy-ui-build-final.log` 与 `/tmp/sleepy-ui-tests-final.log`。新增页面顺序、列宽及局部弹层回归实际经过红绿；视觉证据不以jsdom断言替代。

本轮使用Web光学实现，未宣称与Android AGSL逐像素一致。浏览器振动调用保留，当前电脑不能验证手机物理触觉。未创建Android Release或重复QQ群公告。
