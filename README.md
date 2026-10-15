# SortMotion

终端 CLI 风格的排序算法可视化器，**单文件 HTML**，零依赖、零构建 —— 直接用浏览器打开 `sort-visualizer.html` 就能跑。

> **在线试玩**：https://chitandaaaaa.github.io/SortMotion/sort-visualizer.html

黑底荧光绿 + CRT 扫描线 + macOS 窗口标题栏，把冒泡、选择、插入、快速、堆排序的每一步（比较 / 交换 / 枢轴 / 就位）逐帧可视化，支持单步回退、执行日志、GIF 导出和完赛烟花。

## 特性

- **5 种排序算法**：冒泡（含提前退出优化）、选择、插入、快速（Lomuto 分区）、堆排序
- **逐帧可控**：播放 / 暂停 / 上一步 / 下一步，回退时会精确定态重放，不会丢状态
- **实时统计**：比较次数、交换次数、当前步 / 总步数、耗时（秒，3 位小数）
- **执行日志**：每一步都有中文说明，按类型着色，可一键复制
- **双主题**：`TERMINAL`（黑底荧光绿）/ `GRAY`（灰阶降彩，适合投屏录屏）
- **GIF 导出**：离屏渲染，带开头标题特效、柱状动画、结尾烟花与统计字幕，导出过程不影响页面当前状态
- **完赛庆祝**：逐字动画 + Canvas 烟花粒子
- **几何全 CSS 驱动**：缩放页面、拖拽窗口、调整面板都不会让布局错位

## 快速开始

```bash
git clone https://github.com/Chitandaaaaa/SortMotion.git
cd SortMotion
```

直接双击 `sort-visualizer.html` 即可。若想用本地服务打开（GIF 导出在 `file://` 下也已实测可用）：

```bash
python -m http.server 8000
# 然后访问 http://localhost:8000/sort-visualizer.html
```

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

### 快捷键

| 按键 | 功能 |
|---|---|
| `Space` | 播放 / 暂停 |
| `N` 或 `→` | 下一步 |
| `B` 或 `←` | 上一步 |
| `R` | 重置 |

## 扩展新算法

继承 `AlgorithmBase`，实现 `sort(arr)`，然后在 `AlgorithmRegistry.init()` 里注册即可 —— 左侧列表、播放、统计、GIF 导出会自动适配。

```js
function ShellSort() {
  AlgorithmBase.call(this, "shell", "ShellSort", "希尔排序");
}
ShellSort.prototype = Object.create(AlgorithmBase.prototype);
ShellSort.prototype.constructor = ShellSort;
ShellSort.prototype.sort = function (arr) {
  // 用 this.compare(arr, i, j) / this.swap(arr, i, j)
  //    / this.markSorted(i) / this.markPivot(i) / this.info(msg)
  // 记录每一步，剩下的交给框架
};

// 然后在 AlgorithmRegistry.init() 中：
AlgorithmRegistry.register(new ShellSort());
```

两个必须遵守的约定：

1. **`swap()` 必须先交换数组、再记录快照**（基类已经这么做），保证高亮渲染时柱子宽度已经是交换后的值。
2. **回退（`replayTo`）与 GIF 模拟（`simStep`）共用同一套步骤语义**。新增步骤类型时，两处都要同步处理。

## 实现要点

- **单文件**：所有 CSS 在 `<style>`，所有 JS 在 `<script>`，不用 ES Module，无 React/Vue/jQuery。
- **主题用 CSS 变量驱动**，Canvas 绘制时通过 `getComputedStyle` 读取，保证主题和导出结果一致。
- **柱子几何不存像素快照**：柱高由 flex 撑满（上限 24px），柱宽写成百分比，因此缩放/改窗口后不需要任何重算，也就不存在"尺寸过期"导致的错位。
- **GIF 导出有内存预算**：`gif.js` 用 `copy:true` 时会缓存每帧位图，因此按「总帧数 × 4B/像素」反推安全分辨率并等比降采样，避免长序列导出把内存打爆。
- **GIF 的 worker 脚本**通过 fetch 下载后转成同源 Blob URL 传入，绕开跨域 Worker 限制（`file://` 下实测可用）。

## 文件结构

```
SortMotion/
├── sort-visualizer.html   # 全部内容：样式、算法、可视化器、GIF 导出
├── README.md
└── LICENSE
```

## 已知取舍

- GIF 结尾字幕里的「总耗时」是按时长折算的近似值，不是真实渲染耗时（离屏渲染是瞬时完成的）。
- 视口高度低于 833px 时，底部日志面板会从 150px 起自动收缩，把高度让给展示区。
- 1440p 及以上分辨率、且数据量为默认 20 时，受 24px 柱高上限影响，柱块只占约一半高度（上下对称留白）。需要更饱满的话可以调大或取消 `sort-visualizer.html` 中 `.vbar` 的 `max-height`。

## 许可证

[MIT](LICENSE)
