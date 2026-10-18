#!/usr/bin/env node
/* =======================================================================
   SortMotion 页面冒烟测试（需要 jsdom）

   以 http://localhost/ 为基地址、用请求拦截器把外链资源映射回本地文件，
   等价于「起一个静态服务器打开页面」：styles.css 与 js/*.js 会被真实读取执行。
   然后像用户一样点左侧算法、单步走到结束，验证：
     - 14 个脚本全部加载执行、没有资源 404
     - 17 个算法项都渲染出来且都有悬停说明
     - 每个算法都能从第一步走到 DONE，最终数据升序且元素不丢
     - PREV 回退后重放的结果与正向播放一致
     - 代码栏：渲染行数正确、随步骤高亮对应行、切换算法会刷新、多方法算法分两栏、折叠开关可用
     - RESET / RANDOM / 主题切换 / 计数滑块都不抛异常

   运行：npm i -D jsdom && node test/smoke-ui.js
   ======================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");

let JSDOM, VirtualConsole, requestInterceptor;
try {
  ({ JSDOM, VirtualConsole, requestInterceptor } = require("jsdom"));
} catch (e) {
  console.error("未找到 jsdom。请先安装：npm i -D jsdom");
  process.exit(2);
}

const ROOT = path.join(__dirname, "..");
const HTML = path.join(ROOT, "sort-visualizer.html");

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

  // 用 http://localhost/ 作为基地址（贴近线上，且能启用 localStorage），
  // 再用请求拦截器把 http://localhost/xxx 映射回本地文件 ——
  // 等价于「起一个静态服务器打开页面」，styles.css 与 js/*.js 会被真实读取执行。
  const dom = new JSDOM(fs.readFileSync(HTML, "utf8"), {
    url: "http://localhost/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: vc,
    resources: {
      interceptors: [
        requestInterceptor(async request => {
          const m = /^http:\/\/localhost\/(.*)$/.exec(request.url);
          if (!m) return undefined;                    // 其它请求（如 CDN）原样放行
          const file = path.join(ROOT, decodeURIComponent(m[1].split("?")[0]));
          if (!fs.existsSync(file)) throw new Error("404 Not Found: " + request.url);
          const type = file.endsWith(".css") ? "text/css" : "application/javascript";
          return new Response(fs.readFileSync(file, "utf8"), {
            headers: { "Content-Type": type + "; charset=utf-8" }
          });
        })
      ]
    }
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

  check("外链资源全部加载成功（styles.css + 14 个 js）", () => {
    assert(loadErrors.length === 0, loadErrors.slice(0, 3).join(" | "));
    const links = doc.querySelectorAll('link[rel="stylesheet"]');
    assert(links.length === 1, `样式表引用应为 1 个，实际 ${links.length}`);
    const scripts = doc.querySelectorAll("script[src]");
    assert(scripts.length === 16, `外链脚本应为 16 个，实际 ${scripts.length}`);
  });

  check("16 个脚本的全局导出都到位（说明按依赖顺序执行成功）", () => {
    const expected = [
      "CONFIG", "StepType", "StepEngine", "AlgorithmBase", "SORT_ALGORITHMS",
      "AlgorithmRegistry", "readThemeColors", "drawMiniBars", "Fireworks", "SoundEngine",
      "BarsView", "LogPanel", "StatsPanel", "CelebrationScreen",
      "GifExporter", "CodePanel", "Arena", "ArenaView", "racerMetrics",
      "Visualizer", "boot"
    ];
    const missing = expected.filter(n => win[n] === undefined);
    assert(missing.length === 0, "缺少全局导出: " + missing.join(", "));
  });

  const V = win.V;
  const CONFIG_MIN_N = win.CONFIG.arena.n.min;   // 竞技场规模下限，测试用最小规模跑得快
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

  check("代码栏渲染：行数与当前算法的展示代码一致，且带行号", () => {
    const algo = win.AlgorithmRegistry.get(V.selectedAlgo);
    const rows = doc.querySelectorAll("#codeBody .cln");
    assert(rows.length === algo.code.length,
      `代码栏 ${rows.length} 行，算法 code 有 ${algo.code.length} 行`);
    assert(rows.length >= 4, "代码栏行数过少");
    assert(rows[0].querySelector(".no").textContent === "1", "行号未从 1 开始");
    assert(rows[rows.length - 1].querySelector(".no").textContent === String(rows.length),
      "末行行号不正确");
  });

  check("代码栏折叠：收起 / 展开 + 状态持久化", () => {
    const panel = doc.getElementById("codePanel");
    const btn = doc.getElementById("btnCodeToggle");
    assert(!panel.classList.contains("collapsed"), "初始应是展开状态");
    btn.dispatchEvent(new win.Event("click", { bubbles: true }));
    assert(panel.classList.contains("collapsed"), "点击后未收起");
    assert(btn.textContent === "SHOW", "收起后按钮文案应为 SHOW");

    let ls = null;
    try { ls = win.localStorage; } catch (e) { ls = null; }
    if (ls) assert(ls.getItem("sortviz.code.collapsed") === "1", "折叠状态未写入 localStorage");
    else console.log("（jsdom 下 localStorage 不可用，跳过持久化断言 —— 页面已对其做容错）");

    btn.dispatchEvent(new win.Event("click", { bubbles: true }));
    assert(!panel.classList.contains("collapsed"), "再点未展开");
    assert(btn.textContent === "HIDE", "展开后按钮文案应为 HIDE");
  });

  check("分栏：多方法的算法渲染成左右两栏，行号跨栏连续", () => {
    const merge = win.AlgorithmRegistry.get("merge");
    assert(merge.codeColumns === 2, "merge 应声明 codeColumns = 2");
    assert(doc.querySelectorAll("#codeBody .ccol").length === 1, "默认算法应是单栏");

    V.selectAlgo("merge");
    const cols = doc.querySelectorAll("#codeBody .ccol");
    assert(cols.length === 2, `merge 应渲染 2 栏，实际 ${cols.length}`);

    const left = cols[0].querySelectorAll(".cln").length;
    const right = cols[1].querySelectorAll(".cln").length;
    assert(left === merge.codeSplit, `左栏应为 ${merge.codeSplit} 行，实际 ${left}`);
    assert(right === merge.code.length - merge.codeSplit,
      `右栏应为 ${merge.code.length - merge.codeSplit} 行，实际 ${right}`);

    // 行号必须跨栏连续（左栏 1..k，右栏 k+1..n），否则 codeMap 会指错行
    const nos = Array.prototype.slice.call(doc.querySelectorAll("#codeBody .cln .no"))
      .map(e => Number(e.textContent));
    assert(nos.length === merge.code.length, `总行数应为 ${merge.code.length}，实际 ${nos.length}`);
    nos.forEach((n, i) => assert(n === i + 1, `行号不连续：第 ${i + 1} 个是 ${n}`));

    // 单栏的算法不该被带成两栏
    V.selectAlgo("bubble");
    assert(doc.querySelectorAll("#codeBody .ccol").length === 1, "bubble 应只有 1 栏");
    assert(doc.querySelectorAll("#codeBody .cln").length ===
      win.AlgorithmRegistry.get("bubble").code.length, "bubble 行数不对");
  });

  const algoItems = Array.prototype.slice.call(doc.querySelectorAll(".algo-item"));
  algoItems.forEach(el => {
    const name = el.getAttribute("data-algo");
    check(`算法 ${name}：单步到 DONE，数据升序、元素不丢、回退重放一致`, () => {
      el.dispatchEvent(new win.Event("click", { bubbles: true }));
      assert(V.selectedAlgo === name, "未切换选中的算法");

      const codeLen = win.AlgorithmRegistry.get(name).code.length;
      assert(doc.querySelectorAll("#codeBody .cln").length === codeLen,
        `切换算法后代码栏未刷新（实际 ${doc.querySelectorAll("#codeBody .cln").length} 行，应为 ${codeLen} 行）`);
      assert(V.codePanel.cur === 0, "切换算法后应清除上一轮的高亮");

      const original = V.originalData.slice();
      let sawHighlight = false;
      let guard = 0;
      while (V.currentStep < V.steps.length && guard < 200000) {
        V.stepForward();
        if (V.codePanel.cur > 0) sawHighlight = true;
        assert(V.codePanel.cur === 0 || (V.codePanel.cur >= 1 && V.codePanel.cur <= codeLen),
          `代码栏高亮行号越界: ${V.codePanel.cur} / ${codeLen}`);
        guard++;
      }
      assert(guard < 200000, "步数异常，可能死循环");
      assert(sawHighlight, "整个过程中代码栏从未高亮任何行");
      assert(doc.querySelectorAll("#codeBody .cln.on").length <= 1, "同时高亮了多行");
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

  check("音效开关：无 Web Audio 时置灰降级，点击不抛异常", () => {
    const on = doc.getElementById("btnSndOn");
    const off = doc.getElementById("btnSndOff");
    assert(on && off, "缺少音效开关按钮");
    // jsdom 没有 Web Audio，点两下只验证不抛异常
    on.dispatchEvent(new win.Event("click", { bubbles: true }));
    off.dispatchEvent(new win.Event("click", { bubbles: true }));
    if (typeof win.AudioContext === "undefined" && typeof win.webkitAudioContext === "undefined") {
      assert(on.disabled && off.disabled, "无 Web Audio 时按钮应置灰而不是假装可用");
      assert(V.sound.enabled === false, "无 Web Audio 时音效应关闭");
    }
    // 无论支不支持，单步执行都不该因为音效抛错
    V.reset();
    V.stepForward();
    assert(V.currentStep === 1, "带音效的单步执行异常");
    // 竞技场必须共用同一个音效引擎（同一个 ON/OFF 开关）
    assert(V.arena && V.arena.sound === V.sound, "竞技场未接到音效引擎");
  });

  check("竞技场：打开 → 选择 → 同屏开跑 → 结算冠亚季", () => {
    const arena = V.arena;
    assert(arena, "V.arena 未创建");
    doc.getElementById("btnArena").dispatchEvent(new win.Event("click", { bubbles: true }));
    assert(doc.getElementById("arena").style.display === "flex", "竞技场弹层未展开");
    assert(arena.open && arena.phase === "setup", "未进入选择状态");

    // 默认阵容 = 全部 17 个
    assert(arena.picked.length === 17, `默认应选全部 17 个，实际 ${arena.picked.length}`);
    assert(doc.querySelectorAll("#arenaBody .achip").length === 17, "选择面板算法数不对");
    assert(doc.querySelectorAll("#arenaBody .achip.on").length === 17, "默认应全选");

    // 选择界面必须有开赛入口：顶栏一份 + 面板底部一份。
    // （这条断言是补的：之前只验状态和芯片数量，漏掉了「顶栏按钮压根没渲染」的 bug）
    const headLabels = Array.prototype.slice
      .call(doc.querySelectorAll("#arenaTools .pbtn")).map(b => b.textContent);
    assert(headLabels.indexOf("START") >= 0, "顶栏缺少 START 按钮，实际：" + headLabels.join("/"));
    assert(headLabels.indexOf("CLOSE") >= 0, "顶栏缺少 CLOSE 按钮");
    const panelStart = doc.querySelector("#arenaBody .pbtn.primary");
    assert(panelStart && panelStart.textContent === "START", "选择面板底部缺少 START 按钮");

    // 少于 2 个算法时两处 START 都应禁用
    arena.picked = ["bubble"];
    arena.view.refreshPicker(arena);
    assert(panelStart.disabled, "只选 1 个时面板 START 应禁用");
    assert(doc.querySelector("#arenaTools .pbtn").disabled, "只选 1 个时顶栏 START 应禁用");
    assert(/至少选 2 个/.test(doc.querySelector("#arenaBody .amin").textContent), "缺少最少算法数提示");

    // 换 4 个算法的阵容（含非比较类），并把规模压到最小：
    // 4 个正好覆盖「前三名放大 + 其余进小排行列表」两条渲染分支
    arena.applyPreset("contrast");
    assert(arena.picked.length === 4, "快捷阵容未生效");
    assert(doc.querySelectorAll("#arenaBody .achip.on").length === 4, "选择面板未刷新");
    assert(!panelStart.disabled, "4 个算法时 START 应可用");
    arena.setN(CONFIG_MIN_N);
    assert(arena.data.length === CONFIG_MIN_N, "数据规模未更新");
    assert(doc.querySelectorAll("#arenaBody .achip.on").length === 4, "改规模不应影响选择");

    // 点面板 START → 进入「已就绪」起跑线界面（所有算法初始化好、停在 0%）
    panelStart.dispatchEvent(new win.Event("click", { bubbles: true }));
    assert(arena.phase === "ready", "点击 START 后应进入起跑线界面，而不是直接开跑");
    assert(arena.racers.length === 4, "就绪后应已建好参赛者");
    assert(doc.querySelectorAll("#arenaBody .acell").length === 4, "就绪界面应显示全部格子");
    assert(arena.racers.every(r => r.cursor === 0 && !r.done), "就绪状态下不该有算法开跑");

    const readyBox = doc.querySelector("#arenaBody .aready");
    assert(readyBox, "起跑线界面缺少居中遮罩");
    const centerBtn = doc.getElementById("arenaStartBtn");
    assert(centerBtn && centerBtn.textContent === "START", "起跑线缺少中间的开始按钮");
    assert(doc.querySelectorAll("#arenaTools .pbtn")[0].textContent === "START", "就绪状态顶栏应也是 START");
    assert(!doc.querySelector("#arenaBody .aready-hint"), "起跑线不该再有提示文案");
    assert(!/同一条起跑线/.test(doc.body.textContent), "「同一条起跑线」文案应已删除");

    // 点遮罩空白处不应开跑（只有 START 才生效）
    readyBox.dispatchEvent(new win.Event("click", { bubbles: true }));
    assert(arena.phase === "ready", "点遮罩空白处不该开跑，只有 START 才生效");

    // 点中间的开始按钮，才真正开跑
    centerBtn.dispatchEvent(new win.Event("click", { bubbles: true }));
    assert(arena.phase === "racing", "点击中间 START 未开赛");
    assert(!doc.querySelector("#arenaBody .aready"), "开跑后起跑线遮罩应移除");
    assert(arena.racers.length === 4, "参赛者数量不对");
    assert(doc.querySelectorAll("#arenaBody .acell").length === 4,
      `网格单元格应为 4 个，实际 ${doc.querySelectorAll("#arenaBody .acell").length}`);
    assert(arena.racers.every(r => r.state.data.length === CONFIG_MIN_N), "泳道初始数据长度不对");
    // 全体必须共用同一份输入，否则比较没有意义
    arena.racers.forEach(r => assert(multisetEq(r.state.data, arena.data), "泳道输入与共享输入不一致"));

    // 手动推进，避免等 15 秒的真实动画
    arena.stopLoop();
    let guard = 0;
    while (arena.phase === "racing" && guard < 20000) { arena.tick(); guard++; }
    assert(guard < 20000, "帧数异常，可能死循环");
    assert(arena.phase === "result", "比赛未进入结算状态");

    arena.racers.forEach(rc => {
      assert(isSorted(rc.state.data), `${rc.name} 的最终结果未升序`);
      assert(multisetEq(rc.state.data, arena.data), `${rc.name} 的元素与共享输入不一致`);
      assert(rc.done && rc.rank >= 1, `${rc.name} 未标记完赛 / 名次`);
    });

    const ranks = arena.result.order.map(r => r.rank);
    for (let i = 1; i < ranks.length; i++) {
      assert(ranks[i] >= ranks[i - 1], "名次应单调不减（同帧完赛视为并列）");
    }
    assert(ranks[0] === 1, "第一名必须存在");

    // 结算：全屏排行榜，展示全部参赛者
    const wrap = doc.querySelector("#arenaBody .aresult");
    assert(wrap, "结算缺少 .aresult 容器");
    // 回归：结算层是半透明覆盖，底下必须还留着 m×n 网格，用户要能看见已完赛的柱状图。
    // （之前 showResult 里有一句 bodyEl.innerHTML = ""，把网格整个清掉了 —— 这条断言就是为它加的）
    const cellsUnderResult = doc.querySelectorAll("#arenaBody .acell");
    assert(cellsUnderResult.length === arena.racers.length,
      `结算时底下网格应保留 ${arena.racers.length} 格，实际 ${cellsUnderResult.length}（被清空了？）`);
    assert(doc.querySelectorAll("#arenaBody .acell canvas").length === arena.racers.length,
      "结算时每个格子应仍带 canvas");
    assert(win.getComputedStyle(wrap).position === "absolute", "结算层应绝对定位覆盖在网格之上（不占位、不挤掉网格）");
    assert(!doc.querySelector("#arenaBody .aresult-head"), "结算标题行应已删除");
    assert(!/按完赛用时排名/.test(doc.body.textContent), "「按完赛用时排名」文案应已删除");
    assert(doc.querySelector("#arenaBody .apodium"), "结算缺少前三名区域");
    assert(!doc.querySelector("#arenaBody .anote"), "结算说明文字应已删除");
    assert(!/所有算法的排序结果都相同/.test(doc.body.textContent), "结算说明文案应已删除");

    // 前三名：大号卡片，各带一个递进的 --d 延迟（逐个亮相）；用 CSS 动画延迟实现，
    // 所以 DOM 是一次建全的，测试不需要等定时器
    const podium = Array.prototype.slice.call(doc.querySelectorAll("#arenaBody .apodium-row"));
    assert(podium.length === 3, `前三名应有 3 行，实际 ${podium.length}`);
    assert(doc.querySelectorAll("#arenaBody .amedal").length === 3, "奖牌数量不对");
    assert(doc.querySelectorAll("#arenaBody .amedal.g1").length >= 1, "缺少冠军奖牌");
    const delays = podium.map(r => r.style.getPropertyValue("--d"));
    assert(new Set(delays).size === 3, `前三名的出现延迟应各不相同，实际 ${delays.join("/")}`);
    assert(delays[0] === "0ms", `第一名应立即出现，实际 ${delays[0]}`);
    podium.forEach((r, i) => {
      assert(r.querySelector(".anames b").textContent.length > 0, "前三名行缺少算法名");
      assert(r.querySelector(".astat").textContent.indexOf("s") > 0, "前三名行缺少用时");
      const title = r.querySelector(".atitle");
      assert(title, "前三名行缺少称号");
      assert(["冠军", "亚军", "季军"].indexOf(title.textContent) >= 0,
        "称号不对: " + title.textContent);
      // 称号必须与奖牌上的名次一致
      const medalNo = Number(r.querySelector(".amedal").textContent);
      assert(title.textContent === ["冠军", "亚军", "季军"][medalNo - 1],
        `称号与名次不一致：名次 ${medalNo} 却写了 ${title.textContent}`);
      void i;
    });

    // 其余名次：小号紧凑列表，整块一次出现
    const restRows = doc.querySelectorAll("#arenaBody .arest-row");
    assert(restRows.length === arena.racers.length - 3,
      `小排行列表应有 ${arena.racers.length - 3} 行，实际 ${restRows.length}`);
    const restBox = doc.querySelector("#arenaBody .arest");
    assert(restBox.style.getPropertyValue("--d") !== "", "小排行列表缺少出现延迟");
    // 名次从上到下递减增大
    const nums = Array.prototype.slice.call(doc.querySelectorAll("#arenaBody .arest-row .rk"))
      .map(e => Number(e.textContent));
    for (let i = 1; i < nums.length; i++) {
      assert(nums[i] >= nums[i - 1], "小排行列表的名次顺序不对");
    }

    // 全部参赛者都出现了
    assert(podium.length + restRows.length === arena.racers.length,
      "结算没有展示全部参赛算法");

    arena.exit();
    assert(!arena.open, "关闭后 open 仍为 true");
    assert(doc.getElementById("arena").style.display === "none", "竞技场弹层未隐藏");
  });

  check("网格单元格大小与参赛数量无关（2 个和 17 个一样大，且居中不铺满）", () => {
    const arena = V.arena;
    const total = win.AlgorithmRegistry.getAll().length;

    const m2 = arena.view.gridMetrics(2, total);
    const m17 = arena.view.gridMetrics(17, total);
    assert(m2.cw === m17.cw, `列宽应相同：2 个时 ${m2.cw} vs 17 个时 ${m17.cw}`);
    assert(m2.ch === m17.ch, `行高应相同：2 个时 ${m2.ch} vs 17 个时 ${m17.ch}`);
    assert(m2.gap === m17.gap, "间距应相同");
    // 选得少时不铺满：2 个算法就只占 2 列
    assert(m2.cols === 2, `2 个算法时应只占 2 列，实际 ${m2.cols}`);
    assert(m17.cols > m2.cols, "17 个算法时列数应更多");

    // 实际渲染也要用固定像素，不能用 1fr（否则又会拉伸铺满）
    arena.enter();
    arena.applyPreset("contrast");
    arena.prepare();
    const g = doc.querySelector("#arenaBody .agrid");
    assert(g.style.gridTemplateColumns.indexOf("px") > 0,
      `列应使用固定像素而非 1fr，实际 ${g.style.gridTemplateColumns}`);
    assert(g.style.gridAutoRows.indexOf("px") > 0, "行高应使用固定像素");
    assert(win.getComputedStyle(g).justifyContent === "center", "网格应水平居中");
    arena.exit();
  });

  check("结算时柱状图按 alpha 淡出（画布 alpha，而不是整屏黑纱）", () => {
    // jsdom 里 canvas 没有布局尺寸，drawCell 会提前返回。这里给尺寸 + 一个记录型 ctx，
    // 才能真的验证「结算阶段按 alpha 画」这件事。
    Object.defineProperty(win.HTMLCanvasElement.prototype, "clientWidth",
      { get: function () { return 200; }, configurable: true });
    Object.defineProperty(win.HTMLCanvasElement.prototype, "clientHeight",
      { get: function () { return 60; }, configurable: true });

    const st = {
      globalAlpha: 1,
      alphas: [],
      fillRect: function () { this.alphas.push(this.globalAlpha); }
    };
    const rec = new Proxy(st, {
      get: function (t, k) {
        if (k === "measureText") return function () { return { width: 0 }; };
        if (k in t) return t[k];
        return function () {};
      },
      set: function (t, k, v) { t[k] = v; return true; }
    });
    win.HTMLCanvasElement.prototype.getContext = function () { return rec; };

    const arena = V.arena;
    arena.enter();
    arena.applyPreset("contrast");
    arena.prepare();

    // 起跑线 / 比赛中：不应淡出
    st.alphas.length = 0;
    arena.view.drawLanes(arena);
    const racingAlpha = st.alphas[0];
    assert(racingAlpha === 1, "比赛阶段柱状图不该淡出，实际 alpha=" + racingAlpha);

    // 跑到结算
    arena.start();
    arena.stopLoop();
    let g = 0;
    while (arena.phase === "racing" && g < 20000) { arena.tick(); g++; }
    assert(arena.phase === "result", "未进入结算");

    st.alphas.length = 0;
    arena.view.drawLanes(arena);
    const resultAlpha = st.alphas[0];
    // 画布按 1 画，透明度/虚化统一交给 CSS（两处叠加会让深浅不可控）
    assert(resultAlpha === 1, "结算时画布应按 1 绘制，实际 alpha=" + resultAlpha);
    const bodyEl = doc.getElementById("arenaBody");
    assert(bodyEl.classList.contains("result"),
      "结算时 .arena-body 应加 result 类（CSS 据此虚化网格）");
    assert(bodyEl.querySelector(".agrid"), "结算时网格必须留着（作为虚化背景）");
    // 画完要把 globalAlpha 复原，否则会污染后续绘制
    assert(rec.globalAlpha === 1, "绘制结束后 globalAlpha 应复原为 1");
    arena.exit();
  });

  check("沉浸模式：进入/退出、ESC 与上下方向键", () => {
    const root = doc.documentElement;
    assert(!root.classList.contains("immersive"), "默认不该处于沉浸模式");

    V.enterImmersive();
    assert(V.immersive, "未进入沉浸模式");
    assert(root.classList.contains("immersive"), "html 上没有 immersive 类（CSS 靠它隐藏其它面板）");
    assert(doc.getElementById("zenHint"), "缺少沉浸模式的按键提示条");

    // ↑ / ↓ 也要能单步
    V.reset();
    assert(V.currentStep === 0, "重置后应回到第 0 步");
    doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    assert(V.currentStep === 1, "↓ 应是下一步");
    doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    assert(V.currentStep === 0, "↑ 应是上一步");

    // ESC 退出
    doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert(!V.immersive, "ESC 没有退出沉浸模式");
    assert(!root.classList.contains("immersive"), "退出后应移除 immersive 类");
  });

  check("竞技场速度：与主视图共用同一换算式（每步延时）", () => {
    const arena = V.arena;
    arena.enter();
    const spd = doc.getElementById("arenaSpeed");
    assert(spd, "设置界面缺少速度滑块");
    assert(Number(spd.min) === win.CONFIG.arena.speed.min &&
      Number(spd.max) === win.CONFIG.arena.speed.max, "速度滑块范围不对");

    // 默认值应与主视图一致 —— 开箱就是同一个节奏
    assert(arena.speed === V.speed,
      `竞技场默认速度应与主视图一致，实际 ${arena.speed} vs ${V.speed}`);

    // 同一个 speed，竞技场算出的单步延时必须等于主视图公式的结果
    arena.setSpeed(win.CONFIG.speed.max);
    assert(arena.stepDelay() === win.stepDelayMs(win.CONFIG.speed.max),
      "最快时每步延时与主视图不一致");
    assert(arena.stepDelay() === win.CONFIG.stepMs.min,
      `speed=100 时应等于 stepMs.min(${win.CONFIG.stepMs.min})`);
    arena.setSpeed(win.CONFIG.speed.min);
    assert(arena.stepDelay() === win.CONFIG.stepMs.max,
      `speed=1 时应等于 stepMs.max(${win.CONFIG.stepMs.max})`);
    // 满格 100 = 50 步/秒（20ms/步），50 就是 25 步/秒（40ms/步）
    arena.setSpeed(50);
    assert(arena.stepDelay() === 40, `speed=50 时每步应为 40ms，实际 ${arena.stepDelay()}`);

    // 全程预估 = 最慢算法步数 × 单步延时（先回到最快，再对比"越慢越长"）
    arena.setSpeed(win.CONFIG.speed.max);
    const fastMs = arena.raceEstimateMs();
    assert(fastMs === arena.estimateMaxSteps() * arena.stepDelay(),
      "全程预估的口径不对（应为 步数 × 单步延时）");
    arena.setSpeed(1);
    assert(arena.raceEstimateMs() > fastMs, "速度越慢，全程应越长");

    // 界面要显示「每步多少毫秒」，这样能和主视图直接对照
    const hint = doc.querySelector("#arenaBody .ahint").textContent;
    assert(/每步 \d+ms/.test(hint), "缺少每步延时提示，实际：" + hint);

    // 预估必须随数据规模变化（步数变多 → 全程变长）
    const nSlider = doc.getElementById("arenaN");
    const before = doc.querySelector("#arenaBody .ahint").textContent;
    nSlider.value = String(win.CONFIG.arena.n.max);
    nSlider.dispatchEvent(new win.Event("input", { bubbles: true }));
    const after = doc.querySelector("#arenaBody .ahint").textContent;
    assert(before !== after, `改数据规模后预估应更新，实际都是 ${before}`);
    nSlider.value = String(win.CONFIG.arena.n.def);
    nSlider.dispatchEvent(new win.Event("input", { bubbles: true }));

    arena.setSpeed(win.CONFIG.arena.speed.def);   // 还原，别拖慢后续用例
    arena.exit();
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
