"use strict";

/* =======================================================================
   0. 配置常量
   所有可调参数集中在这里，不再散落到各处的魔法值。
   ======================================================================= */
var CONFIG = {
  data: { min: 10, max: 99 },          // 随机数据值域（闭区间）
  count: { def: 20, min: 5, max: 100 },
  speed: { def: 90, min: 1, max: 100 },

  delayBase: 810,                       // 单步延时(ms) = delayBase - speed * delayFactor
  delayFactor: 8,
  delayMin: 10,

  maxLogLines: 800,                     // 日志行数上限，防止长序列把内存撑爆
  tooltipDelay: 1000,
  uiTickMs: 100,                        // 运行中计时刷新间隔

  // 柱子间距：n 越大留白越少，否则空白比柱子还宽
  barGap: { dense: 1, mid: 2, wide: 3, denseAbove: 70, midAbove: 40 },

  fireworksColors: [
    "#ff4444", "#ffcc00", "#00ff41", "#00ccff",
    "#ff8c00", "#ff69b4", "#ffffff", "#b388ff", "#00ffd5"
  ],

  gif: {
    jsUrl: "https://cdn.bootcdn.net/ajax/libs/gif.js/0.2.0/gif.js",
    workerUrl: "https://cdn.bootcdn.net/ajax/libs/gif.js/0.2.0/gif.worker.js",
    loadTimeout: 60000,                 // 依赖加载超时(ms)
    budgetBytes: 300 * 1024 * 1024,     // 帧位图内存预算
    introFrames: 80,                    // 开头特效帧数
    outroFrames: 60,                    // 结尾特效帧数
    maxSortFrames: 300,                 // 排序段最多抽帧数
    frameDelay: 50,                     // 特效帧时长(ms)
    frameDelayMin: 20,                  // 排序帧时长下限(ms)
    maxSortDelay: 500,                  // 单排序帧时长上限(ms)
    maxWidth: 900,
    maxHeight: 600,
    workers: 2,
    quality: 10
  },

  /* 排序算法竞技场 */
  arena: {
    // 竞技场要同时预计算参赛算法的步骤序列（每步带一份数组快照）。
    // 实测全选 17 个算法时的堆增长：n=20 约 1.5MB、n=60 约 11.7MB、n=100 约 27.7MB，
    // 与主视图一致放到 100 是安全的。
    n: { def: 20, min: 10, max: 100 },
    targetMs: 15000,        // 比赛目标时长；步速 = 最慢算法总步数 / 目标帧数
    maxStepsPerFrame: 40,   // 单帧最多推进多少步，避免大 n 时跳帧太猛
    cellMinWidth: 230,      // 网格单元格下限，用来反推合适的列数
    cellMinHeight: 132,
    maxCols: 8,
    resultStepMs: 420       // 结算时前三名逐个亮相的间隔
  }
};

/* 需要显示「枢轴」图例的算法 */
var PIVOT_LEGEND_ALGOS = ["quick", "selection", "insertion", "binary-insertion", "pancake"];
