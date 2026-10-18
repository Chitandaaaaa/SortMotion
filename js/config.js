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

  /* 声音特效（Web Audio 实时合成，不加载音频文件） */
  sound: {
    volume: 0.5,          // 主音量（0~1），各音色在此基础上再乘自己的增益
    minGapMs: 22,         // 两次发声的最小间隔，超出直接丢音（约 45 音/秒）
    maxVoices: 14,        // 同时发声的振荡器上限，防止高密度时堆成噪音墙
    freqBase: 220,        // 音高基准 A3
    levels: 10,           // 五声音阶音级数：0..10 → 正好 2 个八度（220~880Hz）
    storageKey: "sortviz.sound"
  },

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
    // 速度与主视图【同一套语义】：同一个值 = 同样的每步延时（见 utils.js 的 stepDelayMs）。
    // 默认值与主视图保持一致，这样两边开箱就是同一个节奏。
    // 代价是全程时长不再固定：总时长 = 最慢算法的步数 × 单步延时。
    speed: { def: 90, min: 1, max: 100 },
    // 单帧推进步数上限：只用来兜住卡顿 / 切后台回来的追赶，
    // 正常速度下每帧只推进 0~2 步，根本碰不到这个数。
    maxStepsPerFrame: 40,
    // 网格单元格用【固定像素尺寸】，且与参赛数量无关 ——
    // 2 个算法和 17 个算法要一样大，所以尺寸按「全部算法」的排布算一次，
    // 实际参赛的格子再填进去、整体居中，不铺满界面。
    cellWidth: 250,         // 单元格宽度（固定）
    cellHeight: 150,        // 单元格首选高度
    cellMinHeight: 70,      // 高度下限（窗口很矮时不再继续压）
    gridGap: 8,
    maxCols: 8,
    resultStepMs: 420,      // 结算时前三名逐个亮相的间隔
    // 赛场环境音的最小间隔(ms)。17 条泳道同屏、每帧还能推进几十步，
    // 一步一音是不可能的（会变成噪音墙），所以这里做「稀疏采样」：
    // 每 90ms 最多抽一条还在跑的泳道发一个极轻的音。
    soundGapMs: 90,
    // 结算时底下柱状图的淡出程度：画布直接按这个 alpha 画，而不是叠一层黑纱压暗 ——
    // 这样格子底色不会跟着变灰，只有柱子本身变淡。想更淡/更浓改这一个数即可。
    resultGhostAlpha: 0.8
  }
};

/* 需要显示「枢轴」图例的算法 */
var PIVOT_LEGEND_ALGOS = ["quick", "selection", "insertion", "binary-insertion", "pancake"];
