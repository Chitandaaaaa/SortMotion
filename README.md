# SortMotion

终端 CLI 风格的排序算法可视化器，**零依赖、零构建、纯静态文件** —— 双击 `sort-visualizer.html` 就能跑，也可以直接扔到 GitHub Pages。

> **在线试玩**：https://chitandaaaaa.github.io/SortMotion/sort-visualizer.html

黑底荧光绿 + CRT 扫描线 + macOS 窗口标题栏，把 17 种排序算法的每一步（比较 / 交换 / 写入 / 枢轴 / 就位）逐帧可视化，支持单步回退、执行日志、GIF 导出和完赛烟花。

## 特性

- **17 种排序算法**
  - 比较类基础：冒泡（含提前退出优化）、选择、插入、快速（Lomuto 分区）、堆排序
  - 比较类进阶：归并、希尔、鸡尾酒（双向冒泡）、梳、地精、二分插入、奇偶、循环、煎饼排序
  - 非比较类：计数、基数（LSD）、桶排序
- **逐帧可控**：播放 / 暂停 / 上一步 / 下一步，回退时会精确定态重放，不会丢状态
- **实时统计**：比较次数、交换次数、当前步 / 总步数、耗时（秒，3 位小数）
- **执行日志**：每一步都有中文说明，按类型着色，可一键复制
- **代码栏**：底部右侧显示该算法的展示版代码（短行伪代码），每走一步高亮对应那一行并自动滚动跟随；可折叠
- **双主题**：`TERMINAL`（黑底荧光绿）/ `GRAY`（灰阶降彩，适合投屏录屏）
- **GIF 导出**：离屏渲染，带开头标题特效、柱状动画、结尾烟花与统计字幕，导出过程不影响页面当前状态
- **完赛庆祝**：逐字动画 + Canvas 烟花粒子
- **几何全 CSS 驱动**：缩放页面、拖拽窗口、调整面板都不会让布局错位

## 快速开始

```bash
git clone https://github.com/Chitandaaaaa/SortMotion.git
cd SortMotion
```

直接双击 `sort-visualizer.html` 即可（用的是经典 `<script src>`，`file://` 下能正常加载，**不需要起服务器**）。若想用本地服务打开：

```bash
python -m http.server 8000
# 然后访问 http://localhost:8000/sort-visualizer.html
```

> 为什么不用 ES Module？`<script type="module">` 在 `file://` 下会被 CORS 拦死，双击打开就白屏。经典脚本没有这个限制，代价是各文件共享全局命名空间 —— 对这个规模的项目是划算的取舍。

## 操作

| 控件 | 说明 |
|---|---|
| `Count` | 数据量，5–100，默认 20。调到最大会铺满整个展示区 |
| `Speed` | 动画速度，1–100，默认 90 |
| `TERMINAL` / `GRAY` | 切换配色主题 |
| `PLAY` / `PAUSE` | 播放 / 暂停（保留当前进度） |
| `PREV` / `NEXT` | 单步回退 / 前进 |
| `RESET` | 恢复初始数据，清空进度（数据本身不变） |
| `RANDOM` | 重新生成一组随机数据并重置 |
| `EXPORT GIF` | 导出展示区动画为 GIF |
| `COPY` / `CLEAR` | 复制全部日志 / 清空日志 |
| `HIDE` / `SHOW` | 收起 / 展开右下角代码栏（状态记在 localStorage，下次打开保持不变） |

### 快捷键

| 按键 | 功能 |
|---|---|
| `Space` | 播放 / 暂停 |
| `N` 或 `→` | 下一步 |
| `B` 或 `←` | 上一步 |
| `R` | 重置 |

## 扩展新算法

在 `js/algorithms.js` 里用 `defineSort()` 声明即可 —— 它会自动继承 `AlgorithmBase`、登记进注册表，左侧列表 / 播放 / 统计 / 代码栏 / GIF 导出会自动适配，**不需要改 HTML、也不需要改其它任何文件**：

```js
var TimSort = defineSort("tim", "TimSort", "蒂姆排序",
  "归并 + 插入的混合：先找出天然有序的小段，再按规则归并");   // 悬停提示直接用这段说明

// 展示版代码：代码栏显示的就是它，短行、贴近伪代码，不读真实源码
TimSort.prototype.code = [
  "找出天然有序的小段（run）",
  "for each run: 用插入排序补齐成最小长度",
  "while runs > 1:",
  "  合并相邻的两个 run        // 比较并写回",
  "最终整体有序"
];
// 操作类型 → 上面代码的行号（1 起）。代码栏每走一步就高亮对应行。
TimSort.prototype.codeMap = { info: 1, compare: 4, set: 4, swap: 4 };

// 可选：代码较长（含多个方法）时可以固定分成左右两栏，不声明就是单栏。
// 分栏是固定声明，不随窗口宽度变化 —— 避免拖窗口时布局跳变。
TimSort.prototype.codeColumns = 2;
TimSort.prototype.codeSplit = 3;   // 左栏包含到第 3 行，其余进右栏

TimSort.prototype.sort = function (arr) {
  // 用 this.compare(arr, i, j)     比较两个下标
  //    / this.compareVal(arr, i, v) 与暂存在局部变量里的值比较
  //    / this.swap(arr, i, j)        交换两个下标
  //    / this.set(arr, i, val)       把下标 i 覆写为 val（归并/计数/基数类用）
  //    / this.markSorted(i) / this.markPivot(i) / this.info(msg)
};
```

声明顺序即左侧列表顺序。加完跑一次 `npm run test:core` 即可确认没写错（它会校验 code 非空且每行 ≤64 字符、codeMap 行号合法、分栏声明合法，并确认每个算法都有步骤能高亮到行）。

四条必须遵守的约定：

1. **`swap()` / `set()` 必须先改动数组、再记录快照**（基类已经这么做），保证高亮渲染时柱子宽度已经是改动后的值。
2. **步骤语义只有一处实现：`StepEngine.apply()`**。向前播放、PREV 回退重放、GIF 离屏模拟、`total` 统计口径全都复用它 —— 所以新增步骤类型时只需要改这一个函数，不会出现多处漏改。
3. **算法的中文说明写在 `defineSort` 的 `desc` 参数里**，不要再另外维护提示文案映射表。
4. **代码栏的代码与行号映射写在 `prototype.code` / `prototype.codeMap` 上**，不要写进构造函数 —— 在构造函数里写 `this.code = []` 会遮蔽原型上的值，高亮就永远失效。

## 代码结构

按职责分成三层，`sort-visualizer.html` 只作为入口声明加载顺序：

```
入口
  sort-visualizer.html        仅结构 + 资源引用（约 110 行）
  styles.css                  全部样式（两套主题靠 CSS 变量）
纯逻辑层（不依赖 DOM，单测直接加载这一层）
  js/config.js                所有可调参数
  js/step-engine.js           StepType / StepEngine（唯一步骤语义）/ AlgorithmBase
  js/algorithms.js            17 个算法 + defineSort + AlgorithmRegistry
  js/utils.js                 $ / lerp / 缓动 / 主题取色 / Canvas 绘制原语
  js/fireworks.js             烟花粒子引擎
视图层
  js/bars-view.js             柱状图视图
  js/log-panel.js             日志面板
  js/stats-panel.js           统计面板
  js/celebration.js           庆祝弹窗
  js/gif-exporter.js          GIF 导出
  js/code-panel.js            代码栏（渲染展示代码 + 高亮当前行 + 折叠）
  js/visualizer.js            主控制器（只做 DOM 绑定、状态持有、模块编排）
  js/boot.js                  启动
```

设计意图：**核心逻辑（算法 + 步骤引擎）与 DOM 完全解耦**，视图按职责拆成独立模块，`Visualizer` 退化成编排者。`test/verify-algorithms.js` 直接加载「纯逻辑层」那 5 个文件跑单测，不需要任何 DOM 环境。

> 各文件共享全局命名空间（经典脚本的代价）。当前全局导出很有限：`CONFIG`、`StepType`、`StepEngine`、`AlgorithmBase`、`SORT_ALGORITHMS`、`AlgorithmRegistry`、几个绘制函数、`Fireworks` 以及 5 个视图构造函数 + `Visualizer` + `boot`。再加模块时留意不要重名。

## 测试

产物零依赖、零构建，测试也不参与构建：

```bash
npm i -D jsdom      # 只有页面冒烟测试需要
npm test            # 跑全部
npm run test:core   # 只跑核心逻辑（无需任何依赖）
npm run test:ui     # 只跑页面冒烟测试（需要 jsdom）
```

- `test/verify-algorithms.js` —— 按依赖顺序加载「纯逻辑层」的 5 个文件，校验入口 HTML 的脚本清单顺序、17 个算法 × 12 类输入（含 n=0/1、全等、已排序、宽值域、多重复值等）的升序 / 元素多重集 / 快照长度 / `DONE` 终态，并用 `StepEngine` 回放验证视图层看到的状态。**零依赖**。
- `test/smoke-ui.js` —— 用 jsdom 以 **`file://` 方式真实加载页面**（`styles.css` 与 12 个 `js/*.js` 都会被实际读取执行，等价于本地双击打开），断言没有资源 404、12 个全局导出到位；再点选每个算法单步走到 `DONE`，验证结果、`PREV` 回退重放一致性、`RESET`/`RANDOM`/主题切换/计数滑块，并断言全程无未捕获异常。

改算法后请先跑 `npm run test:core`；动视图层或增删脚本文件请再跑 `npm run test:ui`（它会抓出路径写错、加载顺序错、全局缺失）。

## 实现要点

- **经典脚本，不用 ES Module**：见上文「快速开始」的说明，为了保住 `file://` 双击打开。
- **主题用 CSS 变量驱动**，Canvas 绘制时通过 `getComputedStyle` 读取，保证主题和导出结果一致。
- **柱子几何不存像素快照**：柱高由 flex 撑满（上限 24px），柱宽写成百分比，因此缩放/改窗口后不需要任何重算，也就不存在"尺寸过期"导致的错位。
- **GIF 导出有内存预算**：`gif.js` 用 `copy:true` 时会缓存每帧位图，因此按「总帧数 × 4B/像素」反推安全分辨率并等比降采样，避免长序列导出把内存打爆。
- **GIF 的 worker 脚本**通过 fetch 下载后转成同源 Blob URL 传入，绕开跨域 Worker 限制（`file://` 下实测可用）。
- **文件名全小写**：GitHub Pages 跑在 Linux 上大小写敏感，`Styles.css` / `styles.css` 在 macOS 本地看不出问题、线上会 404。

## 文件结构

```
SortMotion/
├── sort-visualizer.html   # 入口：只放结构与资源引用（保持这个文件名和位置，在线地址就不会变）
├── styles.css             # 全部样式
├── js/                    # 按依赖顺序加载（顺序见 sort-visualizer.html 里的 script 清单）
│   ├── config.js          #   纯逻辑层
│   ├── step-engine.js
│   ├── algorithms.js
│   ├── utils.js
│   ├── fireworks.js
│   ├── bars-view.js       #   视图层
│   ├── log-panel.js
│   ├── stats-panel.js
│   ├── celebration.js
│   ├── gif-exporter.js
│   ├── code-panel.js
│   ├── visualizer.js
│   └── boot.js
├── test/                  # 开发用测试，不参与运行
│   ├── verify-algorithms.js
│   └── smoke-ui.js
├── package.json           # 只有测试脚本与 jsdom 开发依赖
├── README.md
└── LICENSE
```

## 已知取舍

- **不再是「一个文件就能分享」**：换来的是可维护的多文件结构。如果之后又需要单文件版本（比如发给别人离线看），可以加一个小的拼接脚本生成 `dist/sortmotion-standalone.html`，两条路不冲突。
- 各文件通过全局命名空间通信（经典脚本的代价）。若以后要严格隔离，可以在每个文件外面套一层 IIFE 挂到单一命名空间，或改用 ES Module —— 但后者会牺牲 `file://` 双击打开。
- **代码栏显示的是「展示版」代码，不是真实实现**：为的是行短可读，且不必 `fetch` 源码（`file://` 下 fetch 会被 CORS 挡）。代价是两份文本可能漂移，靠约定 + 测试兜底。
- **代码栏高亮按「操作类型 → 行号」映射**：同一类操作在展示代码里出现在多处时（例如双向冒泡的正反两趟、堆排序里 `siftDown` 的交换），只会高亮其中主要那一处。要做逐行精确跟随，可以在此基础上给 `AlgorithmBase` 加一个「下一条步骤指定行号」的钩子，算法按需标注。
- **长代码分栏是固定声明的，不是自适应的**：目前 `MergeSort`（7+5）与 `HeapSort`（8+3）声明了 `codeColumns = 2`，其余 15 个都是单栏。好处是拖窗口不会导致布局跳变；代价是**窗口很窄时这两栏会出现整块横向滚动**（`.codebody` 统一一条滚动条，不会出现两栏文字互相压住）。
- 底部区高度 `clamp(120px, 26vh, 260px)`，log 与 code 共用：1080p 下代码栏可显示约 13 行，单栏就能装下全部算法；视口越矮收缩越明显，柱子展示区相应变高。
- GIF 导出目前只画柱状动画，**不含代码栏**。
- GIF 结尾字幕里的「总耗时」是按时长折算的近似值，不是真实渲染耗时（离屏渲染是瞬时完成的）。
- 1440p 及以上分辨率、且数据量为默认 20 时，受 24px 柱高上限影响，柱块只占约一半高度（上下对称留白）。需要更饱满的话可以调大或取消 `styles.css` 中 `.vbar` 的 `max-height`。
- GitHub Pages 是从仓库根目录发布的，所以 `test/` 与 `package.json` 也会被发布成可访问的静态文件（无害）。

## 许可证

[MIT](LICENSE)
