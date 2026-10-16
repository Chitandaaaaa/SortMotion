"use strict";

/* =======================================================================
   13. 竞技场视图
   只负责画：选择面板 / m×n 竞赛网格 / 结算三行冠亚季。
   状态与调度都在 Arena（js/arena.js）。
   ======================================================================= */
var MEDALS = ["冠军", "亚军", "季军"];   // 按名次取下标：rank-1，并列时两人同名次

function ArenaView(refs) {
  this.root = refs.root;
  this.statusEl = refs.status;
  this.toolsEl = refs.tools;
  this.bodyEl = refs.body;
  this.chips = {};        // name -> chip 元素，便于只改 class 不重建
}

/* ---------- 显示 / 隐藏 ---------- */

ArenaView.prototype.show = function () { this.root.style.display = "flex"; };
ArenaView.prototype.hide = function () { this.root.style.display = "none"; };

/* ---------- 顶栏 ---------- */

ArenaView.prototype.renderHead = function (arena) {
  var tools = this.toolsEl;
  tools.innerHTML = "";
  this.headStartBtn = null;
  function btn(label, tip, fn) {
    var b = document.createElement("button");
    b.className = "pbtn";
    b.textContent = label;
    if (tip) b.setAttribute("data-tip", tip);
    b.addEventListener("click", fn);
    tools.appendChild(b);
    return b;
  }
  if (arena.phase === "setup") {
    var s = btn("START", "进入起跑线界面", function () { arena.prepare(); });
    s.disabled = !arena.canStart();
    this.headStartBtn = s;
  } else if (arena.phase === "ready") {
    btn("START", "开始同屏开跑", function () { arena.start(); });
    btn("BACK", "回到选择界面", function () { arena.backToSetup(); });
  } else if (arena.phase === "racing") {
    btn(arena.paused ? "RESUME" : "PAUSE", "暂停 / 继续", function () { arena.togglePause(); });
    btn("BACK", "回到选择界面", function () { arena.backToSetup(); });
  } else {
    btn("RERUN", "回到起跑线，用同样的阵容与数据再来一局", function () { arena.prepare(); });
    btn("BACK", "回到选择界面", function () { arena.backToSetup(); });
  }
  btn("CLOSE", "关闭竞技场", function () { arena.exit(); });
  this.updateHead(arena);
};

ArenaView.prototype.updateHead = function (arena) {
  var s;
  if (arena.phase === "setup") {
    s = "已选 " + arena.picked.length + " 个 · n = " + arena.n;
  } else if (arena.phase === "ready") {
    s = "已就绪 · " + arena.racers.length + " 个算法入场 · n = " + arena.n + " · 点 START 开跑";
  } else if (arena.phase === "racing") {
    var done = 0;
    for (var i = 0; i < arena.racers.length; i++) if (arena.racers[i].done) done++;
    s = "已完赛 " + done + " / " + arena.racers.length + " · " + (arena.frame * FRAME_MS / 1000).toFixed(2) + "s" +
        (arena.paused ? " · 已暂停" : "");
  } else {
    s = "比赛结束 · 共 " + arena.racers.length + " 个算法";
  }
  this.statusEl.textContent = s;
};

/* 时长文案：超过 1 分钟显示成「x 分 y 秒」，比一堆秒数好读 */
ArenaView.prototype.formatRaceMs = function (ms) {
  var s = Math.round(ms / 1000);
  if (s < 60) return "≈ " + s + " 秒跑完全程";
  var m = Math.floor(s / 60), r = s % 60;
  return "≈ " + m + " 分" + (r ? " " + r + " 秒" : "") + "跑完全程";
};

/* ---------- ① 选择面板 ---------- */

ArenaView.prototype.showSetup = function (arena) {
  var self = this;
  this.bodyEl.innerHTML = "";
  this.chips = {};

  var wrap = document.createElement("div");
  wrap.className = "asetup";

  // 快捷阵容
  var rowPre = document.createElement("div");
  rowPre.className = "arow";
  rowPre.appendChild(this.label("快捷阵容"));
  ARENA_PRESETS.forEach(function (p) {
    var b = document.createElement("button");
    b.className = "pbtn" + (arena.presetKey === p.key ? " on" : "");
    b.textContent = p.label;
    b.addEventListener("click", function () { arena.applyPreset(p.key); });
    rowPre.appendChild(b);
  });
  wrap.appendChild(rowPre);

  // 算法复选（按类别分两组）
  var groups = [
    { title: "比较类", match: function (a) { return ARENA_NONCOMPARE.indexOf(a.name) < 0; } },
    { title: "非比较类", match: function (a) { return ARENA_NONCOMPARE.indexOf(a.name) >= 0; } }
  ];
  var all = AlgorithmRegistry.getAll();
  groups.forEach(function (g) {
    var row = document.createElement("div");
    row.className = "arow";
    row.appendChild(self.label(g.title));
    var box = document.createElement("span");
    box.className = "apicks";
    all.filter(g.match).forEach(function (a) {
      var chip = document.createElement("span");
      chip.className = "achip" + (arena.isPicked(a.name) ? " on" : "");
      chip.textContent = a.cnLabel;
      chip.setAttribute("data-algo", a.name);
      chip.addEventListener("click", function () { arena.togglePick(a.name); });
      box.appendChild(chip);
      self.chips[a.name] = chip;
    });
    row.appendChild(box);
    wrap.appendChild(row);
  });

  // 数据规模
  var rowN = document.createElement("div");
  rowN.className = "arow";
  rowN.appendChild(this.label("数据规模"));
  var rng = document.createElement("input");
  rng.type = "range";
  rng.id = "arenaN";
  rng.min = String(CONFIG.arena.n.min);
  rng.max = String(CONFIG.arena.n.max);
  rng.value = String(arena.n);
  var val = document.createElement("span");
  val.className = "aval";
  val.textContent = String(arena.n);
  rng.addEventListener("input", function () {
    val.textContent = rng.value;
    arena.setN(parseInt(rng.value, 10));
  });
  rowN.appendChild(rng);
  rowN.appendChild(val);

  var again = document.createElement("button");
  again.className = "pbtn";
  again.textContent = "换一组数据";
  again.addEventListener("click", function () { arena.newData(); self.refreshSetup(arena); });
  rowN.appendChild(again);
  wrap.appendChild(rowN);
  this.rngEl = rng;
  this.valEl = val;

  // 速度：与主视图一致（1 最慢、100 最快），并直接显示换算出的比赛时长，
  // 免得用户只看到个数字不知道到底多快
  var rowS = document.createElement("div");
  rowS.className = "arow";
  rowS.appendChild(this.label("速度"));
  var spd = document.createElement("input");
  spd.type = "range";
  spd.id = "arenaSpeed";
  spd.min = String(CONFIG.arena.speed.min);
  spd.max = String(CONFIG.arena.speed.max);
  spd.value = String(arena.speed);
  var sval = document.createElement("span");
  sval.className = "aval";
  sval.textContent = String(arena.speed);
  var sms = document.createElement("span");
  sms.className = "ahint";
  spd.addEventListener("input", function () {
    sval.textContent = spd.value;
    arena.setSpeed(parseInt(spd.value, 10));
  });
  rowS.appendChild(spd);
  rowS.appendChild(sval);
  rowS.appendChild(sms);
  wrap.appendChild(rowS);
  this.spdEl = spd;
  this.spdValEl = sval;
  this.spdMsEl = sms;

  // 共用输入预览
  var rowD = document.createElement("div");
  rowD.className = "arow";
  rowD.appendChild(this.label("共用输入"));
  var data = document.createElement("span");
  data.className = "adata";
  rowD.appendChild(data);
  wrap.appendChild(rowD);
  this.dataEl = data;

  // 底部：说明 + 醒目的 START（只放顶栏太容易找不到）
  var rowF = document.createElement("div");
  rowF.className = "arow astartrow";
  var hint = document.createElement("span");
  hint.className = "ahint amin";   // amin：便于测试单独定位，不靠 DOM 顺序
  rowF.appendChild(hint);

  var start = document.createElement("button");
  start.className = "pbtn primary";
  start.textContent = "START";
  start.setAttribute("data-tip", "确认阵容，进入起跑线界面");
  start.addEventListener("click", function () { arena.prepare(); });
  rowF.appendChild(start);

  wrap.appendChild(rowF);
  this.hintEl = hint;
  this.panelStartBtn = start;

  this.bodyEl.appendChild(wrap);
  this.renderHead(arena);       // 顶栏按钮也要建出来（之前漏了这步，导致选择界面没有任何开赛入口）
  this.refreshSetup(arena);
};

ArenaView.prototype.label = function (text) {
  var el = document.createElement("span");
  el.className = "albl";
  el.textContent = text;
  return el;
};

/* 只改 class / 文案，不重建 DOM */
ArenaView.prototype.refreshSetup = function (arena) {
  var self = this;
  if (this.rngEl) this.rngEl.value = String(arena.n);
  if (this.valEl) this.valEl.textContent = String(arena.n);
  if (this.spdEl) this.spdEl.value = String(arena.speed);
  if (this.spdValEl) this.spdValEl.textContent = String(arena.speed);
  if (this.spdMsEl) this.spdMsEl.textContent = this.formatRaceMs(arena.raceTargetMs());
  if (this.dataEl) this.dataEl.textContent = "[" + arena.data.join(", ") + "]";

  var canStart = arena.canStart();
  // 只在算法不足时给一句提示 —— 否则 START 被禁用会没有解释
  if (this.hintEl) this.hintEl.textContent = canStart ? "" : "至少选 2 个算法才能开赛";
  // 面板底部与顶栏各有一个 START，两处都要跟选中数量联动
  if (this.panelStartBtn) this.panelStartBtn.disabled = !canStart;
  if (this.headStartBtn) this.headStartBtn.disabled = !canStart;

  this.updateHead(arena);
  void self;
};

ArenaView.prototype.refreshPicker = function (arena) {
  var self = this;
  Object.keys(this.chips).forEach(function (name) {
    self.chips[name].classList.toggle("on", arena.isPicked(name));
  });
  this.refreshSetup(arena);
};

/* ---------- ② 竞赛网格 ---------- */

/* 网格尺寸。关键约束：单元格大小【与参赛数量无关】——
   2 个算法和 17 个算法必须一样大，不能因为选得少就把格子拉满屏。
   做法：尺寸按「全部算法」(total) 的排布算一次，实际只填 count 个格子，
   整体居中、不铺满。17 是质数排不成整网格，会有若干空位，属正常。 */
ArenaView.prototype.gridMetrics = function (count, total) {
  var A = CONFIG.arena;
  var gap = A.gridGap;
  var w = this.bodyEl.clientWidth || 1000;
  var h = this.bodyEl.clientHeight || 600;
  var all = Math.max(total || count, 1);

  // 宽度：固定值，只有窗口特别窄时才收一点（与数量无关）
  var cw = Math.min(A.cellWidth, Math.max(140, w));
  var colsForAll = Math.max(1, Math.min(Math.floor((w + gap) / (cw + gap)), all, A.maxCols));
  var rowsForAll = Math.ceil(all / colsForAll);
  // 高度：按「全部算法」需要的行数反推 → 任何数量下高度都一样
  var ch = Math.floor((h - (rowsForAll - 1) * gap) / rowsForAll);
  ch = Math.max(A.cellMinHeight, Math.min(A.cellHeight, ch));

  var cols = Math.max(1, Math.min(Math.floor((w + gap) / (cw + gap)), count, A.maxCols));
  return { cols: cols, cw: cw, ch: ch, gap: gap };
};

ArenaView.prototype.showRace = function (arena) {
  this.bodyEl.innerHTML = "";
  var m = this.gridMetrics(arena.racers.length, AlgorithmRegistry.getAll().length);

  var grid = document.createElement("div");
  grid.className = "agrid";
  // 用固定像素而不是 1fr：1fr 会把格子拉伸铺满，选 2 个算法时就会变成两个巨无霸
  grid.style.gridTemplateColumns = "repeat(" + m.cols + ", " + m.cw + "px)";
  grid.style.gridAutoRows = m.ch + "px";
  grid.style.gap = m.gap + "px";

  arena.racers.forEach(function (rc) {
    var cell = document.createElement("div");
    cell.className = "acell";

    var hd = document.createElement("div");
    hd.className = "acell-hd";
    var rk = document.createElement("span");
    rk.className = "ark";
    rk.textContent = "·";
    var nm = document.createElement("span");
    nm.className = "anm";
    nm.textContent = rc.cnLabel;
    var pg = document.createElement("span");
    pg.className = "apg";
    pg.textContent = "0%";
    hd.appendChild(rk);
    hd.appendChild(nm);
    hd.appendChild(pg);

    var cv = document.createElement("canvas");
    cv.className = "acv";

    var ft = document.createElement("div");
    ft.className = "acell-ft";
    ft.textContent = "比较 0 · 写入 0";

    cell.appendChild(hd);
    cell.appendChild(cv);
    cell.appendChild(ft);
    grid.appendChild(cell);

    rc.cell = cell;
    rc.rankEl = rk;
    rc.progEl = pg;
    rc.canvas = cv;
    rc.footEl = ft;
    rc.ctx = null;
    rc.cvW = 0;
    rc.cvH = 0;
    rc.cvDpr = 0;
  });

  this.bodyEl.appendChild(grid);
  this.drawLanes(arena);            // 先把起跑线状态画出来（初始数组、进度 0%）
  if (arena.phase === "ready") this.showReady(arena);
  this.renderHead(arena);
};

/* 「已就绪」：网格之上盖一层居中的开始按钮，点了才开跑 */
ArenaView.prototype.showReady = function (arena) {
  var self = this;
  this.removeReady();

  var box = document.createElement("div");
  box.className = "aready";

  var inner = document.createElement("div");
  inner.className = "aready-inner";

  var title = document.createElement("div");
  title.className = "aready-title";
  title.textContent = "已就绪 · " + arena.racers.length + " 个算法 · n = " + arena.n;

  var start = document.createElement("button");
  start.className = "pbtn primary aready-start";
  start.id = "arenaStartBtn";
  start.setAttribute("data-tip", "开始同屏开跑");
  start.textContent = "START";
  start.addEventListener("click", function () { arena.start(); });

  inner.appendChild(title);
  inner.appendChild(start);
  box.appendChild(inner);

  // 只有点 START 才开跑；点其他位置不生效
  this.bodyEl.appendChild(box);
  void self;
};

ArenaView.prototype.removeReady = function () {
  var el = this.bodyEl.querySelector(".aready");
  if (el && el.parentNode) el.parentNode.removeChild(el);
};

ArenaView.prototype.removeResult = function () {
  var el = this.bodyEl.querySelector(".aresult");
  if (el && el.parentNode) el.parentNode.removeChild(el);
};

ArenaView.prototype.drawLanes = function (arena) {
  if (!arena.racers.length || !arena.racers[0].canvas) return;
  var colors = readThemeColors();
  // 结算阶段把柱子画淡：直接改画布 alpha，而不是在整屏上叠黑纱
  var ghost = arena.phase === "result" ? CONFIG.arena.resultGhostAlpha : 1;

  for (var i = 0; i < arena.racers.length; i++) {
    var rc = arena.racers[i];
    this.drawCell(rc, colors, ghost);

    rc.cell.classList.toggle("done", !!rc.done);
    rc.rankEl.textContent = rc.done ? String(rc.rank) : "·";
    rc.rankEl.className = "ark" + (rc.done && rc.rank <= 3 ? " m" + rc.rank : "");

    var total = rc.steps.length || 1;
    rc.progEl.textContent = rc.done
      ? (rc.finishMs / 1000).toFixed(2) + "s"
      : Math.round(rc.cursor / total * 100) + "%";

    // 计数取当前步上记录的值 —— 预计算出的最终值从第 0 帧就是终值，不能直接用
    var st = rc.steps[rc.cursor > 0 ? rc.cursor - 1 : 0];
    var cmp = st ? st.compareCount : 0;
    var wr = st ? st.swapCount : 0;
    rc.footEl.textContent = "比较 " + cmp + " · 写入 " + wr;
  }
};

ArenaView.prototype.drawCell = function (rc, colors, alpha) {
  var cv = rc.canvas;
  var w = cv.clientWidth;
  var h = cv.clientHeight;
  if (!w || !h) return;

  var dpr = window.devicePixelRatio || 1;
  if (rc.cvW !== w || rc.cvH !== h || rc.cvDpr !== dpr) {
    cv.width = Math.max(1, Math.round(w * dpr));
    cv.height = Math.max(1, Math.round(h * dpr));
    rc.ctx = cv.getContext("2d");
    if (rc.ctx) rc.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rc.cvW = w;
    rc.cvH = h;
    rc.cvDpr = dpr;
  }
  if (!rc.ctx) return;

  rc.ctx.clearRect(0, 0, w, h);
  rc.ctx.globalAlpha = (alpha === undefined ? 1 : alpha);
  drawMiniBars(rc.ctx, rc.state.data, rc.state.sortedSet, rc.state.highlight,
    { x: 0, y: 0, w: w, h: h }, colors);
  rc.ctx.globalAlpha = 1;
};

/* ---------- ③ 结算：全屏排行榜（背景虚化）----------
   前三名大号卡片逐个亮相，其余名次小号紧凑列表整块出现。
   逐个亮相用 CSS animation-delay（--d）实现：DOM 一次建全，延迟只是视觉效果，
   所以测试不需要等定时器，也不会因为中途关闭而留下待执行的 timer。 */

ArenaView.prototype.showResult = function (arena) {
  var self = this;
  var order = arena.result.order;
  var step = CONFIG.arena.resultStepMs;
  // 关键：这里【不能】清空 bodyEl —— 底下的 m×n 网格必须留着。
  // 结算层是半透明覆盖，用户要能同时看到排行榜和已完赛的柱状图。
  this.removeResult();

  var wrap = document.createElement("div");
  wrap.className = "aresult";

  // 前三名：大号卡片，按 --d 从上到下逐个出现
  var podium = document.createElement("div");
  podium.className = "apodium";
  order.slice(0, 3).forEach(function (rc, i) {
    podium.appendChild(self.podiumRow(rc, i * step));
  });
  wrap.appendChild(podium);

  // 其余名次：小号紧凑列表，在前三名亮完之后整块出现
  var rest = order.slice(3);
  if (rest.length) {
    var box = document.createElement("div");
    box.className = "arest";
    box.style.setProperty("--d", (Math.min(3, order.length) * step) + "ms");
    rest.forEach(function (rc) { box.appendChild(self.restRow(rc)); });
    wrap.appendChild(box);
  }

  this.bodyEl.appendChild(wrap);
  this.renderHead(arena);   // 顶部按钮在虚化层之外，保持清晰可点
};

/* 前三名的一行：奖牌 + 算法名 + 指标 */
ArenaView.prototype.podiumRow = function (rc, delayMs) {
  var m = racerMetrics(rc);
  var row = document.createElement("div");
  row.className = "apodium-row" + (rc.rank <= 3 ? " rk" + rc.rank : "");
  row.style.setProperty("--d", delayMs + "ms");

  var medal = document.createElement("span");
  medal.className = "amedal g" + rc.rank;
  medal.textContent = String(rc.rank);

  var names = document.createElement("span");
  names.className = "anames";
  var cn = document.createElement("b");
  cn.textContent = rc.cnLabel;
  var en = document.createElement("i");
  en.textContent = rc.label + (m.nonCompare ? " · 非比较类" : "");
  names.appendChild(cn);
  names.appendChild(en);

  var title = document.createElement("span");
  title.className = "atitle";
  title.textContent = MEDALS[rc.rank - 1] || "";

  var stat = document.createElement("span");
  stat.className = "astat";
  stat.textContent = (rc.finishMs / 1000).toFixed(2) + "s · 比较 " + m.compares +
    " · 写入 " + m.writes + " · 合计 " + m.ops;

  row.appendChild(medal);
  row.appendChild(names);
  row.appendChild(title);
  row.appendChild(stat);
  return row;
};

/* 第 4 名往后的一行：小号紧凑样式 */
ArenaView.prototype.restRow = function (rc) {
  var m = racerMetrics(rc);
  var row = document.createElement("div");
  row.className = "arest-row";

  var rk = document.createElement("span");
  rk.className = "rk";
  rk.textContent = String(rc.rank);

  var nm = document.createElement("span");
  nm.className = "nm";
  nm.textContent = rc.cnLabel + "  " + rc.label;

  var no = document.createElement("span");
  no.className = "no";
  no.textContent = (rc.finishMs / 1000).toFixed(2) + "s";

  var st = document.createElement("span");
  st.className = "st";
  st.textContent = "比较 " + m.compares + " · 写入 " + m.writes + " · 合计 " + m.ops +
    (m.nonCompare ? " · 非比较类" : "");

  row.appendChild(rk);
  row.appendChild(nm);
  row.appendChild(no);
  row.appendChild(st);
  return row;
};
