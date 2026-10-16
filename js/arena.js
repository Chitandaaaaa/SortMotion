"use strict";

/* =======================================================================
   12. 排序算法竞技场（控制器）
   三个状态：选择(setup) → 同屏开跑(racing) → 结算(result)。

   赛制：所有算法共用同一份输入，谁先跑完谁赢。
   计时不用 setTimeout 逐步，而是 rAF + 「每帧推进固定步数」的累积器：
       每帧步数 = 最慢算法的总步数 / 目标帧数
   好处是总时长恒定（≈ CONFIG.arena.targetMs），与选了几个算法无关；
   而且每条泳道每帧推进的步数完全相同，快慢差异真实体现。
   ======================================================================= */

/* 非比较类排序：它们不使用元素比较，compares 恒为 0。
   所以「按比较次数排名」对它们没有意义，需要单独标注。 */
var ARENA_NONCOMPARE = ["counting", "radix", "bucket"];

/* 快捷阵容（names 为 null 表示全部） */
var ARENA_PRESETS = [
  { key: "all", label: "全部 17 个", names: null },
  { key: "classic", label: "经典四强", names: ["quick", "merge", "heap", "shell"] },
  { key: "exchange", label: "交换类", names: ["bubble", "cocktail", "comb", "gnome", "oddeven"] },
  { key: "noncompare", label: "非比较类", names: ["counting", "radix", "bucket"] },
  { key: "contrast", label: "悬殊对比", names: ["counting", "radix", "bubble", "cycle"] }
];

var FRAME_MS = 1000 / 60;

function Arena(view, hooks) {
  this.view = view;
  this.hooks = hooks || {};      // { onEnter, onExit }
  this.phase = "setup";
  this.paused = false;
  this.open = false;             // 弹层是否展开（主视图用它来决定要不要屏蔽快捷键）

  this.picked = [];              // 参赛算法 name
  this.n = CONFIG.arena.n.def;
  this.data = [];

  this.racers = [];
  this.maxSteps = 0;
  this.stepsPerFrame = 0;        // 小数，用累积器凑整
  this.carry = 0;
  this.frame = 0;
  this.raf = null;
  this.result = null;

  this.applyPreset("all");
}

/* ---------- 状态流转 ---------- */

Arena.prototype.enter = function () {
  if (this.hooks.onEnter) this.hooks.onEnter();
  // Arena 是在 Visualizer 构造函数里建的，那时注册表还没 init()，
  // 所以构造函数里那次 applyPreset 可能取到空列表 —— 这里兜底补一次
  if (!this.picked.length) this.applyPreset(this.presetKey || "all");
  if (!this.data.length) this.newData();
  this.phase = "setup";
  this.open = true;
  this.view.show(this);
  this.view.showSetup(this);
};

Arena.prototype.exit = function () {
  this.stopLoop();
  this.phase = "setup";
  this.open = false;
  this.view.hide();
  if (this.hooks.onExit) this.hooks.onExit();
};

Arena.prototype.backToSetup = function () {
  this.stopLoop();
  this.paused = false;
  this.phase = "setup";
  this.racers = [];
  this.result = null;
  this.view.showSetup(this);
};

/* ---------- 选择阶段 ---------- */

Arena.prototype.allNames = function () {
  return AlgorithmRegistry.getAll().map(function (a) { return a.name; });
};

Arena.prototype.isPicked = function (name) {
  return this.picked.indexOf(name) >= 0;
};

Arena.prototype.togglePick = function (name) {
  var i = this.picked.indexOf(name);
  if (i >= 0) this.picked.splice(i, 1);
  else this.picked.push(name);
  this.view.refreshPicker(this);
};

Arena.prototype.applyPreset = function (key) {
  var preset = null;
  for (var i = 0; i < ARENA_PRESETS.length; i++) {
    if (ARENA_PRESETS[i].key === key) preset = ARENA_PRESETS[i];
  }
  if (!preset) return;
  this.picked = preset.names ? preset.names.slice() : this.allNames();
  this.presetKey = key;
  this.view.refreshPicker(this);
};

Arena.prototype.setN = function (n) {
  var r = CONFIG.arena.n;
  this.n = Math.max(r.min, Math.min(r.max, n | 0));
  this.newData();
  this.view.refreshSetup(this);
};

Arena.prototype.newData = function () {
  var g = CONFIG.data;
  var out = [];
  for (var i = 0; i < this.n; i++) {
    out.push(g.min + Math.floor(Math.random() * (g.max - g.min + 1)));
  }
  this.data = out;
};

Arena.prototype.canStart = function () {
  return this.picked.length >= 2;
};

/* ---------- 就位 → 起跑 ---------- */

/* 确认阵容后进入「已就绪」：把网格铺出来、所有算法停在起跑线
   （显示各自的初始数组、进度 0%），等用户点中间那个 START 再开跑。 */
Arena.prototype.prepare = function () {
  if (!this.canStart()) return;
  if (!this.data.length || this.data.length !== this.n) this.newData();

  var self = this;
  // 每个算法都用独立实例：注册表里那份是主视图在用的，共用会让两边计数互相污染
  this.racers = this.picked.map(function (name, idx) {
    var algo = AlgorithmRegistry.create(name);
    var steps = algo.run(self.data.slice());       // ← 全体同一份输入
    return {
      index: idx,
      name: name,
      label: algo.label,
      cnLabel: algo.cnLabel,
      algo: algo,
      steps: steps,
      cursor: 0,
      state: { data: self.data.slice(), sortedSet: {}, highlight: {} },
      done: false,
      finishFrame: 0,
      finishMs: 0,
      rank: 0
    };
  });

  this.maxSteps = 0;
  for (var i = 0; i < this.racers.length; i++) {
    if (this.racers[i].steps.length > this.maxSteps) this.maxSteps = this.racers[i].steps.length;
  }
  var targetFrames = Math.max(1, CONFIG.arena.targetMs / FRAME_MS);
  this.stepsPerFrame = this.maxSteps / targetFrames;
  this.carry = 0;
  this.frame = 0;
  this.paused = false;
  this.result = null;
  this.phase = "ready";

  this.view.showRace(this);     // 内部会按 phase 追加居中的 START
};

/* 起跑（点中间的 START 或顶栏的 START） */
Arena.prototype.start = function () {
  if (this.phase !== "ready") return;
  this.phase = "racing";
  this.frame = 0;
  this.carry = 0;
  this.paused = false;
  this.view.removeReady();
  this.view.renderHead(this);
  this.view.drawLanes(this);
  this.loop();
};

Arena.prototype.stopLoop = function () {
  if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
};

Arena.prototype.loop = function () {
  var self = this;
  this.stopLoop();
  this.raf = requestAnimationFrame(function () { self.tick(); });
};

Arena.prototype.togglePause = function () {
  if (this.phase !== "racing") return;
  this.paused = !this.paused;
  if (this.paused) this.stopLoop();
  else this.loop();
  this.view.renderHead(this);
};

Arena.prototype.tick = function () {
  if (this.phase !== "racing" || this.paused) return;

  // 累积器：把「每帧不到一步」也平滑地摊开，总时长才恒定
  this.carry += this.stepsPerFrame;
  var budget = Math.floor(this.carry);
  this.carry -= budget;
  if (budget > CONFIG.arena.maxStepsPerFrame) budget = CONFIG.arena.maxStepsPerFrame;
  this.frame++;

  var alive = 0;
  for (var r = 0; r < this.racers.length; r++) {
    var rc = this.racers[r];
    if (rc.done) continue;

    for (var k = 0; k < budget && rc.cursor < rc.steps.length; k++) {
      StepEngine.apply(rc.state, rc.steps[rc.cursor]);
      rc.cursor++;
    }

    if (rc.cursor >= rc.steps.length) {
      rc.done = true;
      rc.finishFrame = this.frame;
      rc.finishMs = this.frame * FRAME_MS;        // 比赛时钟：同帧完赛的算法必然同时刻
    } else {
      alive++;
    }
  }

  this.view.drawLanes(this);
  this.view.updateHead(this);

  if (alive === 0) { this.finish(); return; }
  this.loop();
};

Arena.prototype.finish = function () {
  this.stopLoop();
  this.phase = "result";
  this.racers.forEach(function (rc) { if (!rc.done) rc.done = true; });
  this.assignRanks();
  this.view.drawLanes(this);
  this.view.showResult(this);
};

/* 名次 = 完赛帧；同一帧完赛视为并列（竞速排名：1,1,3）。
   并列时的展示顺序再按操作数、最后按声明顺序，保证稳定。 */
Arena.prototype.assignRanks = function () {
  var list = this.racers.slice();
  list.sort(function (a, b) {
    if (a.finishFrame !== b.finishFrame) return a.finishFrame - b.finishFrame;
    var oa = a.algo.compareCount + a.algo.swapCount;
    var ob = b.algo.compareCount + b.algo.swapCount;
    if (oa !== ob) return oa - ob;
    return a.index - b.index;
  });
  var rank = 0, prevFrame = -1;
  for (var i = 0; i < list.length; i++) {
    if (list[i].finishFrame !== prevFrame) {
      rank = i + 1;
      prevFrame = list[i].finishFrame;
    }
    list[i].rank = rank;
  }

  var fastest = list.length ? list[0].algo.compareCount + list[0].algo.swapCount : 0;
  this.result = {
    order: list,
    top: list.slice(0, 3),
    fastestOps: fastest
  };
};

/* 某个参赛者的第几项指标（供视图展示） */
function racerMetrics(rc) {
  var cmp = rc.algo.compareCount;
  var wr = rc.algo.swapCount;
  return {
    compares: cmp,
    writes: wr,
    ops: cmp + wr,
    steps: rc.steps.length,
    nonCompare: ARENA_NONCOMPARE.indexOf(rc.name) >= 0
  };
}
