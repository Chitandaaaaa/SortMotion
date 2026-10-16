#!/usr/bin/env node
/* =======================================================================
   SortMotion 核心逻辑回归测试（零依赖）

   做法：把「纯逻辑层」的脚本文件（不依赖 DOM 的那几个）在 Node 的 vm 里
   依次执行，然后逐个校验算法正确性与结构不变量。

   运行：node test/verify-algorithms.js
   ======================================================================= */
"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.join(__dirname, "..");

/* 纯逻辑层：按依赖顺序加载，与 sort-visualizer.html 里的顺序一致 */
const CORE_FILES = [
  "js/config.js",
  "js/step-engine.js",
  "js/algorithms.js",
  "js/utils.js",
  "js/fireworks.js"
];

/* ---------- 1. 加载纯逻辑层 ---------- */
function loadCore() {
  const parts = CORE_FILES.map(f => {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) throw new Error("缺少核心脚本: " + f);
    return fs.readFileSync(p, "utf8");
  });
  const code = parts.join("\n");
  const sandbox = { console, Math, Array, Object, JSON, Boolean, Number, String };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "core.js" });
  return { sandbox, coreChars: code.length };
}

/* ---------- 2. 断言工具 ---------- */
let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "断言失败");
}

function isSorted(a) {
  for (let i = 1; i < a.length; i++) if (a[i - 1] > a[i]) return false;
  return true;
}

function multisetEq(a, b) {
  if (a.length !== b.length) return false;
  const s = a.slice().sort((x, y) => x - y);
  const t = b.slice().sort((x, y) => x - y);
  for (let i = 0; i < s.length; i++) if (s[i] !== t[i]) return false;
  return true;
}

function rnd(n, lo, hi) {
  const a = [];
  for (let i = 0; i < n; i++) a.push(lo + Math.floor(Math.random() * (hi - lo + 1)));
  return a;
}

/* ---------- 3. 用例 ---------- */
function cases() {
  const list = [];
  for (const n of [0, 1, 2, 3, 4, 5, 8, 16, 33, 64, 100, 150]) {
    list.push([`随机 n=${n}`, rnd(n, 10, 99)]);
  }
  list.push(["全部相同 n=30", Array(30).fill(7)]);
  list.push(["仅两个取值 n=40", rnd(40, 0, 1).map(v => (v ? 3 : 9))]);
  list.push(["已升序 n=40", Array.from({ length: 40 }, (_, i) => i)]);
  list.push(["已降序 n=40", Array.from({ length: 40 }, (_, i) => 40 - i)]);
  list.push(["宽值域 n=50", rnd(50, 0, 999)]);
  list.push(["全零 n=25", Array(25).fill(0)]);
  list.push(["多重复值 n=12", [5, 5, 5, 1, 1, 9, 9, 9, 9, 2, 3, 3]]);
  return list;
}

/* ---------- 4. 跑 ---------- */
console.log("\n== SortMotion 核心逻辑测试 ==\n");

const { sandbox, coreChars } = loadCore();
const { AlgorithmRegistry, StepType, StepEngine, CONFIG } = sandbox;

const html = fs.readFileSync(path.join(ROOT, "sort-visualizer.html"), "utf8");

check("入口 HTML 引用了 styles.css", () => {
  assert(/<link[^>]+href="styles\.css"/.test(html), "未找到样式表引用");
});

check("入口 HTML 的脚本清单与纯逻辑层顺序一致", () => {
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  assert(srcs.length === 15, `脚本标签应为 15 个，实际 ${srcs.length}`);
  CORE_FILES.forEach((f, i) => {
    assert(srcs[i] === f, `第 ${i + 1} 个脚本应为 ${f}，实际 ${srcs[i]}`);
  });
  assert(srcs[srcs.length - 1] === "js/boot.js", "最后一个脚本应是 js/boot.js");
  assert(srcs.indexOf("js/visualizer.js") > srcs.indexOf("js/code-panel.js"),
    "code-panel.js 必须在 visualizer.js 之前加载");
  assert(srcs.indexOf("js/visualizer.js") > srcs.indexOf("js/arena.js"),
    "arena.js 必须在 visualizer.js 之前加载");
  assert(srcs.indexOf("js/arena-view.js") > srcs.indexOf("js/arena.js"),
    "arena-view.js 应在 arena.js 之后加载");
});

check("纯逻辑层可被抽取执行（约 " + Math.round(coreChars / 1024) + "KB）", () => {
  assert(typeof AlgorithmRegistry === "object", "AlgorithmRegistry 未导出");
  assert(typeof StepType === "object", "StepType 未导出");
});

check("CONFIG 集中定义了数据范围与延时参数", () => {
  assert(CONFIG && typeof CONFIG === "object", "CONFIG 缺失");
  assert(CONFIG.data && CONFIG.data.min === 10 && CONFIG.data.max === 99,
    "数据范围应为 10~99，实际 " + JSON.stringify(CONFIG.data));
  assert(typeof CONFIG.delayBase === "number", "delayBase 缺失");
  assert(CONFIG.barGap && typeof CONFIG.barGap.denseAbove === "number", "barGap 缺失");
});

AlgorithmRegistry.init();
const algos = AlgorithmRegistry.getAll();

check("注册了全部 17 个算法", () => {
  assert(algos.length === 17, `实际注册 ${algos.length} 个`);
});

check("算法 name 唯一", () => {
  const seen = new Set();
  for (const a of algos) {
    assert(!seen.has(a.name), `重复的 name: ${a.name}`);
    seen.add(a.name);
  }
});

check("每个算法都自带非空的中文说明（desc）", () => {
  for (const a of algos) {
    assert(a.desc && a.desc.length >= 8, `${a.name} 缺少 desc`);
    assert(a.cnLabel && a.label, `${a.name} 缺少 label/cnLabel`);
  }
});

check("AlgorithmRegistry.create 返回独立实例（竞技场用）", () => {
  assert(typeof AlgorithmRegistry.create === "function", "缺少 create 工厂");
  const a = AlgorithmRegistry.create("quick");
  const b = AlgorithmRegistry.create("quick");
  assert(a && b, "create 返回空");
  assert(a.name === "quick" && b.name === "quick", "create 返回的算法不对");
  assert(a !== b, "create 应每次返回新实例");
  assert(a !== AlgorithmRegistry.get("quick"), "create 不应复用注册表里的实例");
  // 计数互不影响，是竞技场名次可信的前提
  a.run([5, 3, 1, 4, 2]);
  const aCmp = a.compareCount;
  assert(AlgorithmRegistry.get("quick").compareCount === 0, "不应污染注册表实例的计数");
  b.run([5, 3, 1, 4, 2]);
  assert(b.compareCount === aCmp, "两个独立实例跑同样输入应得到相同计数");
  assert(AlgorithmRegistry.create("不存在的算法") === null, "未知名字应返回 null");
});

check("CONFIG.arena 定义了竞技场参数（规模上限与主视图一致）", () => {
  assert(CONFIG.arena && typeof CONFIG.arena === "object", "缺少 CONFIG.arena");
  const a = CONFIG.arena.n;
  assert(a && a.min >= 2 && a.max > a.min, "arena.n 区间不合法");
  // 与主视图一致放到 100：实测全选 17 个算法 n=100 时堆增长约 27.7MB，可接受
  assert(a.max === CONFIG.count.max,
    `竞技场与主视图的规模上限应一致，实际 ${a.max} vs ${CONFIG.count.max}`);
  assert(a.max === 100, "数据规模上限应为 100");
  assert(CONFIG.arena.targetMs > 0, "缺少比赛目标时长");
  assert(CONFIG.arena.cellMinWidth > 0 && CONFIG.arena.cellMinHeight > 0, "缺少单元格下限");
});

check("每个算法都自带展示代码（code）与行号映射（codeMap）", () => {
  for (const a of algos) {
    assert(Array.isArray(a.code) && a.code.length >= 4,
      `${a.name} 的 code 缺失或过短（${a.code ? a.code.length : "无"}）`);
    a.code.forEach((line, i) => {
      assert(typeof line === "string", `${a.name} 的 code 第 ${i + 1} 行不是字符串`);
      assert(line.length <= 64, `${a.name} 的 code 第 ${i + 1} 行过长（${line.length} 字符），代码栏放不下`);
    });
    const keys = Object.keys(a.codeMap || {});
    assert(keys.length >= 2, `${a.name} 的 codeMap 至少应映射两类操作`);
    keys.forEach(k => {
      const n = a.codeMap[k];
      assert(Number.isInteger(n) && n >= 1 && n <= a.code.length,
        `${a.name} 的 codeMap.${k} = ${n} 超出 1..${a.code.length}`);
    });
    // 分栏声明要合法：左栏不能为空，也不能把整段都吃掉
    if (a.codeColumns !== undefined) {
      assert(a.codeColumns === 1 || a.codeColumns === 2,
        `${a.name} 的 codeColumns 只能是 1 或 2，实际 ${a.codeColumns}`);
      if (a.codeColumns === 2) {
        assert(Number.isInteger(a.codeSplit) && a.codeSplit >= 1 && a.codeSplit < a.code.length,
          `${a.name} 声明了分栏但 codeSplit=${a.codeSplit} 不合法（应在 1..${a.code.length - 1}）`);
      }
    }
  }
});

check("分两栏的算法左右两栏都有内容", () => {
  const twoCol = algos.filter(a => a.codeColumns === 2);
  for (const a of twoCol) {
    assert(a.codeSplit >= 1, `${a.name} 左栏为空`);
    assert(a.code.length - a.codeSplit >= 1, `${a.name} 右栏为空`);
  }
  console.log(twoCol.length
    ? `分两栏的算法（${twoCol.length} 个）: ` +
      twoCol.map(a => `${a.label} ${a.codeSplit}+${a.code.length - a.codeSplit}`).join(", ")
    : "没有算法声明分栏");
});

// 逐个算法 × 全部用例
for (const algo of algos) {
  check(`${algo.label}（${algo.cnLabel}）正确性`, () => {
    for (const [name, input] of cases()) {
      let steps;
      try {
        steps = algo.run(input.slice());
      } catch (e) {
        throw new Error(`${name}: 抛异常 ${e.message}`);
      }

      // 用 StepEngine 回放，验证「视图层看到的状态」也是对的
      const state = { data: input.slice(), sortedSet: {}, highlight: {} };
      const n = input.length;
      let highlighted = 0;
      let counted = 0;
      for (const st of steps) {
        StepEngine.apply(state, st);
        if (state.data.length !== n) throw new Error(`${name}: 快照长度发生变化`);
        if (n > 0) {
          for (const idx of st.indices || []) {
            if (idx < 0 || idx >= n) throw new Error(`${name}: 越界下标 ${idx}`);
          }
        }
        // 代码栏高亮用的行号必须合法
        if (st.line !== 0 && !(st.line >= 1 && st.line <= algo.code.length)) {
          throw new Error(`${name}: 步骤行号 ${st.line} 超出 1..${algo.code.length}`);
        }
        if (st.line) highlighted++;
        if (StepEngine.isCounted(st.type)) counted++;
      }
      // 不变量：只要产生了实际操作（比较/交换/写入），就一定有可高亮的代码行。
      // 反过来说 n<2、或基数排序遇到全零数据这类「无需排序」的情况不算违规。
      if (counted > 0 && highlighted === 0) {
        throw new Error(`${name}: 有 ${counted} 步实际操作却没有任何代码行号，代码栏不会高亮`);
      }

      if (!isSorted(state.data)) throw new Error(`${name}: 回放结果未升序`);
      if (!multisetEq(state.data, input)) throw new Error(`${name}: 元素多重集不一致`);
      if (n > 0 && (!state.sortedSet || Object.keys(state.sortedSet).length === 0)) {
        throw new Error(`${name}: 没有被标记为已排序的元素`);
      }

      const last = steps[steps.length - 1];
      if (!last || last.type !== StepType.DONE) throw new Error(`${name}: 末步不是 DONE`);
      if (!isSorted(last.data)) throw new Error(`${name}: DONE 快照未升序`);
    }
  });
}

check("StepEngine.isCounted 口径与统计一致（比较/交换/写入计入 total）", () => {
  assert(StepEngine.isCounted(StepType.COMPARE), "COMPARE 应计入");
  assert(StepEngine.isCounted(StepType.SWAP), "SWAP 应计入");
  assert(StepEngine.isCounted(StepType.SET), "SET 应计入");
  assert(!StepEngine.isCounted(StepType.INFO), "INFO 不应计入");
  assert(!StepEngine.isCounted(StepType.MARK_SORTED), "MARK_SORTED 不应计入");
});

check("竞技场网格：列等宽 + 行等高，保证每个格子一样大", () => {
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const grid = css.match(/\.agrid\{[\s\S]*?\n\}/);
  const cell = css.match(/\n\.acell\{[\s\S]*?\n\}/);
  assert(grid, "找不到 .agrid 规则");
  assert(cell, "找不到 .acell 规则");

  // 列宽由 JS 写 repeat(cols, minmax(0,1fr)) 保证等宽；行高必须在 CSS 里等分，
  // 否则隐式行高是 auto，不同行的格子会高矮不一 —— 这是「格子必须一样大」的关键。
  // 必须是 minmax(0,1fr) 而非 1fr：1fr 的下限是内容最小高度，内容多了照样撑开。
  assert(/grid-auto-rows\s*:\s*minmax\(0,\s*1fr\)/.test(grid[0]),
    ".agrid 必须声明 grid-auto-rows:minmax(0,1fr)，否则各行高矮不一");
  assert(/align-content\s*:\s*stretch/.test(grid[0]),
    ".agrid 需要 align-content:stretch，让各行铺满容器高度");
  assert(/overflow\s*:\s*hidden/.test(cell[0]),
    ".acell 需要 overflow:hidden，避免内容把格子撑高");
  // 柱状图用 flex:1 + min-height:0，既不撑高也不塌陷
  assert(/\.acv\{[^}]*flex\s*:\s*1/.test(css) && /\.acv\{[^}]*min-height\s*:\s*0/.test(css),
    ".acv 需要 flex:1 与 min-height:0");
});

check("竞技场结算：背景虚化 + 前三名逐个亮相 + 其余整块出现", () => {
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const res = css.match(/\n\.aresult\{[\s\S]*?\n\}/);
  const pod = css.match(/\n\.apodium-row\{[\s\S]*?\n\}/);
  const rest = css.match(/\n\.arest\{[\s\S]*?\n\}/);
  assert(res, "找不到 .aresult 规则");
  assert(pod, "找不到 .apodium-row 规则");
  assert(rest, "找不到 .arest 规则");

  // 覆盖在网格之上并做背景虚化
  assert(/position\s*:\s*absolute/.test(res[0]), ".aresult 应绝对定位覆盖在网格之上");
  assert(/backdrop-filter\s*:\s*blur/.test(res[0]), ".aresult 需要 backdrop-filter 实现背景虚化");
  // 前三名与其余名次都靠 --d 控制出现时机（DOM 一次建全，延迟只是视觉效果）
  assert(/animation-delay\s*:\s*var\(--d/.test(pod[0]), ".apodium-row 需用 --d 逐个亮相");
  assert(/animation-delay\s*:\s*var\(--d/.test(rest[0]), ".arest 需用 --d 控制整块出现的时机");
  // 背景 50% 透明
  assert(/background\s*:\s*rgba\(0,\s*0,\s*0,\s*\.5\)/.test(res[0]),
    ".aresult 背景应为 rgba(0,0,0,.5)（50% 透明）");
  // 一屏放完：容器不滚动 + 其余名次行等分剩余高度
  assert(/overflow\s*:\s*hidden/.test(res[0]), ".aresult 需要 overflow:hidden，保证一屏放完不出现下拉");
  assert(/flex\s*:\s*1/.test(rest[0]), ".arest 需要 flex:1 吃掉剩余高度");
  const row = css.match(/\n\.arest-row\{[\s\S]*?\n\}/);
  assert(row, "找不到 .arest-row 规则");
  assert(/flex\s*:\s*1\s+1\s+0/.test(row[0]), ".arest-row 需要 flex:1 1 0 等分剩余高度");
  // 前三名不用方框：只允许有底部分隔线，不允许整圈边框/底色块
  assert(!/border\s*:\s*1px/.test(pod[0]), ".apodium-row 不该有整圈边框（用户要求不要方框）");
  assert(!/background\s*:\s*var\(--panel\)/.test(pod[0]), ".apodium-row 不该有整块底色（用户要求不要方框）");
  assert(/border-bottom/.test(pod[0]), ".apodium-row 用细分隔线代替方框");
  // 称号
  assert(/\.atitle\{/.test(css), "缺少前三名的称号样式 .atitle");
  // 右半边文字右对齐（以容器横线的右端为准）
  const astat = css.match(/\n\.astat\{[^}]*\}/);
  assert(astat && /text-align\s*:\s*right/.test(astat[0]), ".astat 应右对齐");
  const rst = css.match(/\.arest-row \.st\{[^}]*\}/);
  assert(rst && /text-align\s*:\s*right/.test(rst[0]), ".arest-row .st 应右对齐");
  // 背景 50% 透明 + 轻虚化，要能隐约看见底下的网格
  const blur = res[0].match(/backdrop-filter\s*:\s*blur\((\d+)px\)/);
  assert(blur, ".aresult 缺少 backdrop-filter");
  assert(Number(blur[1]) <= 4, `虚化过强（${blur[1]}px），会看不清底下的网格`);

  // 配置面板：水平居中，但靠上（不垂直居中）
  const setup = css.match(/\n\.asetup\{[\s\S]*?\n\}/);
  assert(setup, "找不到 .asetup 规则");
  assert(/margin\s*:\s*0\s+auto/.test(setup[0]), ".asetup 需要水平居中");
  assert(!/justify-content\s*:\s*center/.test(setup[0]), ".asetup 不该垂直居中（要求靠上）");
  // 开赛按钮左右居中
  const srow = css.match(/\n\.astartrow\{[^}]*\}/);
  assert(srow && /justify-content\s*:\s*center/.test(srow[0]), ".astartrow 需要 justify-content:center");

  // 动画被禁用时不能把内容留在 opacity:0
  assert(/prefers-reduced-motion/.test(css), "需要 prefers-reduced-motion 兜底，避免动画禁用后内容不可见");
});

check("drawMiniBars 画竖柱：底部对齐、高度按值、颜色跟随状态（竞技场网格用）", () => {
  const { drawMiniBars } = sandbox;
  assert(typeof drawMiniBars === "function", "drawMiniBars 未导出");

  const rects = [];
  const ctx = {
    fillStyle: "",
    save: function () {},
    restore: function () {},
    fillRect: function (x, y, w, h) {
      rects.push({ x: x, y: y, w: w, h: h, fill: ctx.fillStyle });
    }
  };
  const colors = { idle: "C0", cmp: "C1", swap: "C2", pivot: "C3", sorted: "C4" };
  const area = { x: 0, y: 0, w: 100, h: 50 };

  drawMiniBars(ctx, [10, 20, 30, 40], { 2: true }, { 1: "compare", 3: "swap" }, area, colors);

  assert(rects.length === 4, `应画 4 根柱子，实际 ${rects.length}`);
  assert(rects[3].h === 50, "最大值应占满高度");
  for (let i = 1; i < 4; i++) {
    assert(rects[i].h >= rects[i - 1].h, "柱高应随值单调不减");
    assert(rects[i].y + rects[i].h === 50, "柱子应底部对齐");
  }
  assert(rects[0].fill === "C0", "空闲柱应用 idle 色");
  assert(rects[1].fill === "C1", "比较中的柱应用比较色");
  assert(rects[2].fill === "C4", "已排序的柱应用已排序色");
  assert(rects[3].fill === "C2", "交换中的柱应用交换色");

  // 空数组不应抛异常
  drawMiniBars(ctx, [], {}, {}, area, colors);
});

/* ---------- 5. 汇总 ---------- */
console.log(`\n算法数: ${algos.length}`);
console.log(`通过: ${passed}  失败: ${failures.length}`);
if (failures.length) {
  console.log("\n失败详情:");
  failures.forEach(f => console.log("  x " + f));
  process.exit(1);
}
console.log("\n全部通过\n");
