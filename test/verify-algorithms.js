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
  assert(srcs.length === 12, `脚本标签应为 12 个，实际 ${srcs.length}`);
  CORE_FILES.forEach((f, i) => {
    assert(srcs[i] === f, `第 ${i + 1} 个脚本应为 ${f}，实际 ${srcs[i]}`);
  });
  assert(srcs[srcs.length - 1] === "js/boot.js", "最后一个脚本应是 js/boot.js");
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
      for (const st of steps) {
        StepEngine.apply(state, st);
        if (state.data.length !== n) throw new Error(`${name}: 快照长度发生变化`);
        if (n > 0) {
          for (const idx of st.indices || []) {
            if (idx < 0 || idx >= n) throw new Error(`${name}: 越界下标 ${idx}`);
          }
        }
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

/* ---------- 5. 汇总 ---------- */
console.log(`\n算法数: ${algos.length}`);
console.log(`通过: ${passed}  失败: ${failures.length}`);
if (failures.length) {
  console.log("\n失败详情:");
  failures.forEach(f => console.log("  x " + f));
  process.exit(1);
}
console.log("\n全部通过\n");
