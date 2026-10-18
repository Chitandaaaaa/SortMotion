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

/* 单帧计入的最大时间增量(ms)。切到后台时 rAF 会停，回来那一帧的 dt 可能是几分钟：
   既不该一次性补几百步，也不该把这段挂起时间算进比赛用时。 */
var ARENA_MAX_DT = 100;

/* 快捷阵容（names 为 null 表示全部） */
var ARENA_PRESETS = [
  { key: "all", label: "全部 17 个", names: null },
  { key: "classic", label: "经典四强", names: ["quick", "merge", "heap", "shell"] },
  { key: "exchange", label: "交换类", names: ["bubble", "cocktail", "comb", "gnome", "oddeven"] },
  { key: "noncompare", label: "非比较类", names: ["counting", "radix", "bucket"] },
  { key: "contrast", label: "悬殊对比", names: ["counting", "radix", "bubble", "cycle"] }
];


function Arena(view, hooks) {
  this.view = view;
  this.hooks = hooks || {};      // { onEnter, onExit }
  this.phase = "setup";
  this.paused = false;
  this.open = false;             // 弹层是否展开（主视图用它来决定要不要屏蔽快捷键）

  this.picked = [];              // 参赛算法 name
  this.n = CONFIG.arena.n.def;
  this.speed = CONFIG.arena.speed.def;
  this.data = [];

  this.racers = [];
  this.maxSteps = 0;
  this.elapsed = 0;              // 比赛时钟(ms)：只在跑动时累加，暂停不长
  this.stepAcc = 0;              // 时间累积器：攒够一个「单步延时」就推进 1 步
  this.lastTs = 0;
  this.raf = null;
  this.result = null;
  this._est = null;              // 全程时长预估缓存 { key, maxSteps }

  // ---- 音效：由 Visualizer 在 init() 里注入同一个 SoundEngine（共用 ON/OFF 开关）----
  this.sound = null;
  this.dataMin = 0;
  this.dataMax = 100;
  this.turbo = false;        // 极速模式（由 Visualizer.setTurbo 同步）
  this.onTurbo = null;       // 打开/关闭极速时的回调，由 Visualizer 注入
  this.soundAt = 0;          // 上次发环境音的时间戳，用于按 soundGapMs 节流
  this.soundCursor = 0;      // 轮询游标：轮流从还在跑的泳道里取样，避免总是同一条发声
  this.finishedCount = 0;    // 已冲线数量，用来给冲线音排序

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

/* 极速模式：交给 Visualizer 统一开关（主视图与竞技场共用同一个状态），
   没有挂钩子时（比如单测里）至少保证本场生效。 */
Arena.prototype.setTurbo = function (on) {
  if (this.onTurbo) this.onTurbo(!!on);
  else this.turbo = !!on;
  if (this.view && this.phase === "setup") this.view.refreshSetup(this);
};

Arena.prototype.setSpeed = function (v) {
  var s = CONFIG.arena.speed;
  this.speed = Math.max(s.min, Math.min(s.max, v | 0));
  this.view.refreshSetup(this);
};

/* ---------- 速度与时长 ----------
   速度沿用主视图的同一个公式（utils.js 的 stepDelayMs）：
   同一个 speed 值，两边每一步的节奏完全相同，主视图调到多慢，竞技场就有多慢。

   代价是「全程时长不再固定」——它等于「最慢算法的步数 × 单步延时」。
   这是真实结果，不是估算误差：算法多、规模大、速度慢，本来就该跑得久。
   界面上的预估值也按这个算，所以开跑前就知道要等多久。 */
Arena.prototype.stepDelay = function () {
  return stepDelayMs(this.speed, this.turbo);
};

/* 预估最慢算法的步数。要真跑一遍各个算法才知道步数，
   所以按「规模 + 阵容 + 数据」缓存：拖动速度滑块时不会反复重算。 */
Arena.prototype.estimateMaxSteps = function () {
  var key = this.n + "|" + this.picked.slice().sort().join(",") + "|" + this.data.join(",");
  if (this._est && this._est.key === key) return this._est.maxSteps;

  var max = 0;
  for (var i = 0; i < this.picked.length; i++) {
    var algo = AlgorithmRegistry.create(this.picked[i]);
    var steps = algo.run(this.data.slice());
    if (steps.length > max) max = steps.length;
  }
  this._est = { key: key, maxSteps: max };
  return max;
};

/* 预估全程时长(ms) = 最慢算法步数 × 单步延时 */
Arena.prototype.raceEstimateMs = function () {
  return this.estimateMaxSteps() * this.stepDelay();
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
      finishMs: 0,
      rank: 0
    };
  });

  this.maxSteps = 0;
  for (var i = 0; i < this.racers.length; i++) {
    if (this.racers[i].steps.length > this.maxSteps) this.maxSteps = this.racers[i].steps.length;
  }
  this.elapsed = 0;
  this.stepAcc = 0;
  this.lastTs = 0;
  this.paused = false;
  this.result = null;
  this.phase = "ready";

  // 音高映射区间：全体共用同一份输入，所以取一次即可
  var mn = Infinity, mx = -Infinity;
  for (var k = 0; k < this.data.length; k++) {
    if (this.data[k] < mn) mn = this.data[k];
    if (this.data[k] > mx) mx = this.data[k];
  }
  this.dataMin = isFinite(mn) ? mn : 0;
  this.dataMax = isFinite(mx) ? mx : 100;

  this.view.showRace(this);     // 内部会按 phase 追加居中的 START
};

/* 起跑（点中间的 START 或顶栏的 START） */
Arena.prototype.start = function () {
  if (this.phase !== "ready") return;
  this.phase = "racing";
  this.elapsed = 0;
  this.stepAcc = 0;
  this.lastTs = 0;
  this.paused = false;
  this.finishedCount = 0;
  this.soundCursor = 0;
  this.soundAt = 0;
  this.view.removeReady();
  this.view.renderHead(this);
  this.view.drawLanes(this);
  // 这次点击同时是音频解锁手势，起跑信号也在这里发
  if (this.sound && this.sound.enabled) {
    this.sound.unlock();
    this.sound.playArenaStart();
  }
  this.loop();
};

Arena.prototype.stopLoop = function () {
  if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
};

Arena.prototype.loop = function () {
  var self = this;
  this.stopLoop();
  this.raf = requestAnimationFrame(function (ts) { self.tick(ts); });
};

Arena.prototype.togglePause = function () {
  if (this.phase !== "racing") return;
  this.paused = !this.paused;
  if (this.paused) this.stopLoop();
  else { this.lastTs = 0; this.loop(); }
  this.view.renderHead(this);
};

Arena.prototype.tick = function (ts) {
  if (this.phase !== "racing" || this.paused) return;

  var now = (typeof ts === "number") ? ts
    : ((window.performance && performance.now) ? performance.now() : Date.now());
  if (!this.lastTs) this.lastTs = now;
  var dt = now - this.lastTs;
  this.lastTs = now;
  if (!(dt > 0)) dt = 0;
  if (dt > ARENA_MAX_DT) dt = ARENA_MAX_DT;
  this.elapsed += dt;

  // 时间累积器：攒够一个「单步延时」才推进 1 步。
  // 这就是「与主视图同一节奏」的落点 —— 主视图 90ms 一步，这里也是 90ms 一步。
  var delay = this.stepDelay();
  this.stepAcc += dt;
  var budget = Math.floor(this.stepAcc / delay);
  this.stepAcc -= budget * delay;
  if (budget > CONFIG.arena.maxStepsPerFrame) {
    budget = CONFIG.arena.maxStepsPerFrame;
    this.stepAcc = 0;          // 卡顿 / 切后台回来：丢弃欠账，不追帧
  }

  var alive = 0;
  var finishedNow = [];
  for (var r = 0; r < this.racers.length; r++) {
    var rc = this.racers[r];
    if (rc.done) continue;

    for (var k = 0; k < budget && rc.cursor < rc.steps.length; k++) {
      StepEngine.apply(rc.state, rc.steps[rc.cursor]);
      rc.cursor++;
    }

    if (rc.cursor >= rc.steps.length) {
      rc.done = true;
      rc.finishMs = this.elapsed;     // 比赛时钟：同一次 tick 完赛的算法必然同时刻
      finishedNow.push(rc);
    } else {
      alive++;
    }
  }

  this.view.drawLanes(this);
  this.view.updateHead(this);
  if (finishedNow.length) this.soundLaneFinished(finishedNow);
  this.soundTick();

  if (alive === 0) { this.finish(); return; }
  this.loop();
};

/* 冲线音：同一帧里可能有多条同时到线，用递增的 when 错开，避免糊成一坨 */
Arena.prototype.soundLaneFinished = function (list) {
  if (!this.sound || !this.sound.enabled) return;
  for (var i = 0; i < list.length; i++) {
    this.finishedCount++;
    this.sound.playArenaFinishLane(this.finishedCount, this.racers.length, i * 0.05);
  }
  // 刚发过冲线音，这一帧的环境音就跳过
  this.soundAt = (window.performance && performance.now) ? performance.now() : Date.now();
};

/* 赛场环境音采样：轮询还在跑的泳道，取它刚执行的那一步发声。
   有 CONFIG.arena.soundGapMs 兜底，无论选几个算法、速度多快，
   发声频率都稳定在 ~11 音/秒以内。 */
Arena.prototype.soundTick = function () {
  var snd = this.sound;
  if (!snd || !snd.enabled) return;

  var now = (window.performance && performance.now) ? performance.now() : Date.now();
  if (now - this.soundAt < CONFIG.arena.soundGapMs) return;

  var live = [];
  for (var i = 0; i < this.racers.length; i++) {
    if (!this.racers[i].done) live.push(this.racers[i]);
  }
  if (!live.length) return;

  var rc = live[this.soundCursor % live.length];
  this.soundCursor++;
  var step = rc.steps[rc.cursor - 1];
  if (!step) return;

  this.soundAt = now;
  snd.playArenaTick(step, rc.state.data, this.dataMin, this.dataMax);
};

Arena.prototype.finish = function () {
  this.stopLoop();
  this.phase = "result";
  this.racers.forEach(function (rc) { if (!rc.done) rc.done = true; });
  this.assignRanks();
  this.view.drawLanes(this);
  this.view.showResult(this);
  if (this.sound && this.sound.enabled) this.sound.playArenaChampion();
};

/* 名次 = 完赛时刻；同一次 tick 完赛视为并列（竞速排名：1,1,3）。
   并列时的展示顺序再按操作数、最后按声明顺序，保证稳定。 */
Arena.prototype.assignRanks = function () {
  var list = this.racers.slice();
  list.sort(function (a, b) {
    if (a.finishMs !== b.finishMs) return a.finishMs - b.finishMs;
    var oa = a.algo.compareCount + a.algo.swapCount;
    var ob = b.algo.compareCount + b.algo.swapCount;
    if (oa !== ob) return oa - ob;
    return a.index - b.index;
  });
  var rank = 0, prevMs = -1;
  for (var i = 0; i < list.length; i++) {
    if (list[i].finishMs !== prevMs) {
      rank = i + 1;
      prevMs = list[i].finishMs;
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
