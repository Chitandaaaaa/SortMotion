#!/usr/bin/env node
/* =======================================================================
   SortMotion 页面冒烟测试（需要 jsdom）

   以 file:// 方式真实加载 sort-visualizer.html：外链的 styles.css 与 js/*.js
   都会被实际读取并执行，等价于「本地双击打开」的场景。然后像用户一样
   点左侧算法、单步走到结束，验证：
     - 12 个脚本全部加载执行、没有资源 404
     - 17 个算法项都渲染出来且都有悬停说明
     - 每个算法都能从第一步走到 DONE，最终数据升序且元素不丢
     - PREV 回退后重放的结果与正向播放一致
     - RESET / RANDOM / 主题切换 / 计数滑块都不抛异常

   运行：npm i -D jsdom && node test/smoke-ui.js
   ======================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");

let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = require("jsdom"));
} catch (e) {
  console.error("未找到 jsdom。请先安装：npm i -D jsdom");
  process.exit(2);
}

const HTML = path.join(__dirname, "..", "sort-visualizer.html");

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; }
  catch (e) { failures.push(name + ": " + e.message); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "断言失败"); }
function isSorted(a) {
  for (let i = 1; i < a.length; i++) if (a[i - 1] > a[i]) return false;
  return true;
}
function multisetEq(a, b) {
  if (a.length !== b.length) return false;
  const s = a.slice().sort((x, y) => x - y), t = b.slice().sort((x, y) => x - y);
  for (let i = 0; i < s.length; i++) if (s[i] !== t[i]) return false;
  return true;
}

(async function main() {
  console.log("\n== SortMotion 页面冒烟测试 ==\n");

  // jsdom 无法加载 canvas 后端时会抛错，也会对部分新 CSS 语法报「解析失败」，
  // 这两类不算评测标准；只把「资源加载失败」当成错误。
  const loadErrors = [];
  const ignored = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => {
    const msg = (e && e.message ? e.message : String(e)) + (e && e.detail ? " :: " + e.detail : "");
    if (/Could not load|Failed to load|Cannot find|ENOENT|404/i.test(msg)) loadErrors.push(msg);
    else ignored.push(msg);
  });

  // fromFile 会给出 file:// 基地址，相对路径的 styles.css / js/*.js 才能解析
  const dom = await JSDOM.fromFile(HTML, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const win = dom.window;
  const doc = win.document;

  const pageErrors = [];
  win.addEventListener("error", e => pageErrors.push("window.error: " + (e.message || e)));
  win.console.error = function () {
    pageErrors.push("console.error: " + Array.prototype.join.call(arguments, " "));
  };
  // jsdom 无 Canvas：返回 null。页面里对 ctx 做了空值保护，烟花会安全跳过。
  win.HTMLCanvasElement.prototype.getContext = function () { return null; };

  // 等全部外链脚本加载并执行完（boot() 在 DOMContentLoaded 时执行）
  await new Promise(resolve => {
    if (doc.readyState === "complete") return resolve();
    win.addEventListener("load", resolve);
    win.addEventListener("DOMContentLoaded", resolve);
  });
  // 再让出一轮宏任务，确保 load 之后排队的脚本也执行完
  await new Promise(resolve => setTimeout(resolve, 0));

  check("外链资源全部加载成功（styles.css + 12 个 js）", () => {
    assert(loadErrors.length === 0, loadErrors.slice(0, 3).join(" | "));
    const links = doc.querySelectorAll('link[rel="stylesheet"]');
    assert(links.length === 1, `样式表引用应为 1 个，实际 ${links.length}`);
    const scripts = doc.querySelectorAll("script[src]");
    assert(scripts.length === 12, `外链脚本应为 12 个，实际 ${scripts.length}`);
  });

  check("12 个脚本的全局导出都到位（说明按依赖顺序执行成功）", () => {
    const expected = [
      "CONFIG", "StepType", "StepEngine", "AlgorithmBase", "SORT_ALGORITHMS",
      "AlgorithmRegistry", "readThemeColors", "Fireworks",
      "BarsView", "LogPanel", "StatsPanel", "CelebrationScreen",
      "GifExporter", "Visualizer", "boot"
    ];
    const missing = expected.filter(n => win[n] === undefined);
    assert(missing.length === 0, "缺少全局导出: " + missing.join(", "));
  });

  const V = win.V;
  check("脚本执行后全局 V（Visualizer 实例）已创建", () => {
    assert(V, "window.V 未定义（脚本可能抛异常了）");
    assert(typeof V.init === "function", "V.init 不是函数");
  });
  if (!V) {
    console.log("致命：页面未初始化，后续断言跳过");
    console.log(failures.join("\n"));
    win.close(); process.exit(1);
  }

  check("左侧渲染出全部 17 个算法项", () => {
    const items = doc.querySelectorAll(".algo-item");
    assert(items.length === 17, `实际 ${items.length} 项`);
  });

  check("每个算法项都有非空悬停说明（来自算法自带 desc）", () => {
    doc.querySelectorAll(".algo-item").forEach(el => {
      const tip = el.getAttribute("data-tip");
      assert(tip && tip.length > 12, `说明缺失/过短: ${el.getAttribute("data-algo")} -> ${tip}`);
    });
  });

  check("视图模块已挂载（BarsView / LogPanel / StatsPanel / CelebrationScreen）", () => {
    assert(V.barsView && typeof V.barsView.update === "function", "barsView 未挂载");
    assert(V.log && typeof V.log.append === "function", "log 未挂载");
    assert(V.stats && typeof V.stats.render === "function", "stats 未挂载");
    assert(V.celebration && typeof V.celebration.hide === "function", "celebration 未挂载");
  });

  check("初始状态：柱子数量与数据长度一致，统计与日志都有内容", () => {
    assert(V.barsView.bars.length === V.data.length, "柱子数量与数据长度不一致");
    assert(doc.getElementById("stTotal").textContent !== "", "total 统计为空");
    assert(doc.getElementById("logBody").childNodes.length > 0, "日志为空");
  });

  check("计数滑块改数据量（12）后重建柱子", () => {
    const slider = doc.getElementById("countRange");
    slider.value = "12";
    slider.dispatchEvent(new win.Event("input", { bubbles: true }));
    assert(V.count === 12, "count 未更新为 12");
    assert(V.data.length === 12, `数据长度应为 12，实际 ${V.data.length}`);
    assert(V.barsView.bars.length === 12, "柱子未按新长度重建");
  });

  const algoItems = Array.prototype.slice.call(doc.querySelectorAll(".algo-item"));
  algoItems.forEach(el => {
    const name = el.getAttribute("data-algo");
    check(`算法 ${name}：单步到 DONE，数据升序、元素不丢、回退重放一致`, () => {
      el.dispatchEvent(new win.Event("click", { bubbles: true }));
      assert(V.selectedAlgo === name, "未切换选中的算法");

      const original = V.originalData.slice();
      let guard = 0;
      while (V.currentStep < V.steps.length && guard < 200000) { V.stepForward(); guard++; }
      assert(guard < 200000, "步数异常，可能死循环");
      assert(V.finished, "走完所有步骤后 finished 仍为 false");
      assert(isSorted(V.data), "最终数据未升序");
      assert(multisetEq(V.data, original), "最终数据元素与初始不一致");
      assert(doc.getElementById("statusBadge").textContent === "DONE", "状态徽标不是 DONE");

      // 回退几步再重放一遍，验证 replay 重建的状态与正向一致
      const firstResult = V.data.slice();
      for (let i = 0; i < 3 && V.currentStep > 0; i++) V.stepBackward();
      assert(V.currentStep < V.steps.length, "回退后步数未减少");

      V.reset();
      let g2 = 0;
      while (V.currentStep < V.steps.length && g2 < 200000) { V.stepForward(); g2++; }
      assert(isSorted(V.data), "重放后数据未升序");
      assert(multisetEq(V.data, firstResult), "重放结果与首轮不一致");
    });
  });

  check("RESET 回到初始数据并清空进度", () => {
    V.reset();
    assert(V.currentStep === 0, "currentStep 未归零");
    assert(multisetEq(V.data, V.originalData), "RESET 后数据不等于初始数据");
    assert(doc.getElementById("statusBadge").textContent === "READY", "状态不是 READY");
  });

  check("RANDOM 生成新数据且不抛异常", () => {
    doc.getElementById("btnRandom").dispatchEvent(new win.Event("click", { bubbles: true }));
    assert(V.data.length === 12, "RANDOM 后数据长度异常");
    assert(V.originalData.length === 12, "RANDOM 后初始数据长度异常");
  });

  check("主题切换不抛异常", () => {
    const btns = doc.querySelectorAll("[data-theme-btn]");
    btns.forEach(b => b.dispatchEvent(new win.Event("click", { bubbles: true })));
    assert(doc.documentElement.getAttribute("data-theme") === "gray", "未切到 gray 主题");
    btns[0].dispatchEvent(new win.Event("click", { bubbles: true }));
    assert(!doc.documentElement.getAttribute("data-theme"), "未切回 terminal 主题");
  });

  check("全程没有未捕获异常 / console.error", () => {
    assert(pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    assert(loadErrors.length === 0, loadErrors.slice(0, 3).join(" | "));
  });

  console.log(`通过: ${passed}  失败: ${failures.length}`);
  if (ignored.length) console.log(`（忽略 ${ignored.length} 条 jsdom 环境噪声，如 Canvas / CSS 解析）`);
  if (failures.length) {
    console.log("\n失败详情:");
    failures.forEach(f => console.log("  x " + f));
    win.close();
    process.exit(1);
  }
  console.log("\n全部通过\n");
  win.close();
  process.exit(0);
})().catch(err => {
  console.error("冒烟测试自身出错：", err);
  process.exit(3);
});
