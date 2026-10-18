"use strict";

/* =======================================================================
   14. Visualizer 主控制器
   只做三件事：绑定 DOM、持有运行状态、编排上面各模块。
   ======================================================================= */
function Visualizer() {
  // ---- 视图模块 ----
  this.barsView = new BarsView($("bars"));
  this.log = new LogPanel($("logBody"), $("btnCopy"));
  this.stats = new StatsPanel({
    compare: $("stCompare"),
    swap: $("stSwap"),
    step: $("stStep"),
    total: $("stTotal"),
    time: $("stTime")
  });
  this.celebration = new CelebrationScreen({
    root: $("celebrate"),
    canvas: $("fwCanvas"),
    title: $("celTitle"),
    stats: $("celStats"),
    time: $("celTime"),
    hint: $("celHint")
  });
  this.codePanel = new CodePanel($("codePanel"), $("codeBody"), $("btnCodeToggle"));

  // ---- 竞技场（独立全屏弹层，不占用主视图状态）----
  this.arena = new Arena(new ArenaView({
    root: $("arena"),
    status: $("arenaStatus"),
    tools: $("arenaTools"),
    body: $("arenaBody")
  }));
  // 钩子挂在构造之后：Arena 只在 enter/exit 时读 hooks，所以来得及
  var self0 = this;
  this.arena.hooks = {
    onEnter: function () { self0.pause(true); }   // 进竞技场先停掉主视图播放，免得两处同时动
  };

  // ---- 需要直接操作的 DOM ----
  this.vizEl = document.querySelector(".viz");
  this.tooltip = $("tooltip");
  this.badge = $("statusBadge");
  this.lgPivot = $("lgPivot");
  this.countSlider = $("countRange");
  this.speedSlider = $("speedRange");
  this.countVal = $("countVal");
  this.speedVal = $("speedVal");
  this.btnPlay = $("btnPlay");
  this.btnPause = $("btnPause");
  this.btnPrev = $("btnPrev");
  this.btnNext = $("btnNext");
  this.btnReset = $("btnReset");
  this.btnRandom = $("btnRandom");
  this.btnGif = $("btnGif");
  this.btnClear = $("btnClear");
  this.btnCodeToggle = $("btnCodeToggle");
  this.btnArena = $("btnArena");
  this.btnImmersive = $("btnImmersive");
  this.btnTurbo = $("btnTurbo");
  this.zenHint = $("zenHint");
  this.btnSndOn = $("btnSndOn");
  this.btnSndOff = $("btnSndOff");

  // ---- 声音（Web Audio 实时合成；不支持时自动降级为静音）----
  this.sound = new SoundEngine();
  // 音高映射区间：由初始数据极值决定，整轮复用（数值本身不变，只是换位置）
  this.dataMin = 0;
  this.dataMax = 100;

  // ---- 运行状态 ----
  this.data = [];
  this.originalData = [];
  this.steps = [];
  this.currentStep = 0;
  this.isPlaying = false;
  this.finished = false;
  this.timer = null;
  this.sortedSet = {};
  this.activeHL = {};
  this.startTime = null;
  this.elapsed = 0;
  this.selectedAlgo = "bubble";
  this.count = CONFIG.count.def;
  this.speed = CONFIG.speed.def;
  this.immersive = false;
  this.turbo = false;
  this.compares = 0;
  this.swaps = 0;
  this.stepCount = 0;
  this.total = 0;
}
var V;

/* ---------- 初始化 ---------- */
Visualizer.prototype.init = function () {
  AlgorithmRegistry.init();
  this.buildAlgoList();
  this.bindTooltip();
  this.bindControls();
  this.bindTheme();
  this.bindSound();
  // 竞技场复用同一个音效引擎：SOUND 开关、音量、节流参数对两个视图同时生效
  this.arena.sound = this.sound;
  this.arena.turbo = this.turbo;
  // 竞技场里的「极速」按钮也走同一个开关，两个视图不会出现状态不一致
  this.arena.onTurbo = function (on) { self.setTurbo(on); };
  this.bindKeyboard();

  this.generateData();
  this.codePanel.restore();     // 恢复上次的折叠状态，再渲染代码
  this.prepareSteps();
  this.updateLegend();
  this.updateBars();
  this.updateStats();
  this.setStatus("READY");

  var self = this;
  // 用户按 ESC 退出系统全屏时，同步收起沉浸布局
  document.addEventListener("fullscreenchange", function () {
    if (!document.fullscreenElement && self.immersive) self.exitImmersive(true);
  });
  document.addEventListener("webkitfullscreenchange", function () {
    if (!document.webkitFullscreenElement && self.immersive) self.exitImmersive(true);
  });

  // 运行中刷新计时
  setInterval(function () {
    if (self.startTime && !self.finished) self.updateStats();
  }, CONFIG.uiTickMs);

  // 兜底：元素数量与数据长度不同步时重建一次。
  // 几何尺寸由 CSS 决定，窗口缩放 / 页面缩放都不需要重算，所以不监听尺寸变化。
  this.syncBars();
  if (window.ResizeObserver) {
    this._ro = new ResizeObserver(function () { self.syncBars(); });
    this._ro.observe(this.barsView.el);
  } else {
    window.addEventListener("resize", function () { self.syncBars(); });
  }
};

/* 柱状图：三个语义化入口，内部交给 BarsView */
Visualizer.prototype.syncBars = function () {
  this.barsView.sync(this.data, this.activeHL, this.sortedSet);
};
Visualizer.prototype.initBars = function () {
  this.barsView.build(this.data.length);
};
Visualizer.prototype.updateBars = function () {
  this.barsView.update(this.data, this.activeHL, this.sortedSet);
};

/* ---------- 左侧算法列表 ---------- */
Visualizer.prototype.buildAlgoList = function () {
  var list = $("algoList");
  var self = this;
  list.innerHTML = "";
  AlgorithmRegistry.getAll().forEach(function (a) {
    var el = document.createElement("div");
    el.className = "algo-item" + (a.name === self.selectedAlgo ? " sel" : "");
    el.setAttribute("data-algo", a.name);
    // 说明直接取算法自带的 desc，新增算法无需再改这里
    el.setAttribute("data-tip", a.cnLabel + "（" + a.label + "）：" + a.desc);
    var mark = document.createElement("span");
    mark.className = "mark";
    mark.textContent = ">";
    var name = document.createElement("span");
    name.textContent = a.label;
    el.appendChild(mark);
    el.appendChild(name);
    el.addEventListener("click", function () { self.selectAlgo(a.name); });
    list.appendChild(el);
  });
};

Visualizer.prototype.selectAlgo = function (name) {
  this.selectedAlgo = name;
  var items = document.querySelectorAll(".algo-item");
  for (var i = 0; i < items.length; i++) {
    items[i].classList.toggle("sel", items[i].getAttribute("data-algo") === name);
  }
  this.updateLegend();
  this.reset();
};

Visualizer.prototype.updateLegend = function () {
  var show = PIVOT_LEGEND_ALGOS.indexOf(this.selectedAlgo) >= 0;
  this.lgPivot.classList.toggle("hide", !show);
};

/* ---------- Tooltip ---------- */
Visualizer.prototype.bindTooltip = function () {
  var self = this;
  var tipEl = null;
  var timer = null;
  var visible = false;
  var mx = 0, my = 0;

  function place() {
    var pad = 14;
    var w = self.tooltip.offsetWidth;
    var h = self.tooltip.offsetHeight;
    var x = mx + pad;
    var y = my + pad;
    if (x + w > window.innerWidth - 6) x = mx - w - pad;
    if (y + h > window.innerHeight - 6) y = my - h - pad;
    self.tooltip.style.left = Math.max(4, x) + "px";
    self.tooltip.style.top = Math.max(4, y) + "px";
  }
  function hide() {
    if (timer) { clearTimeout(timer); timer = null; }
    visible = false;
    self.tooltip.style.display = "none";
  }

  document.addEventListener("mousemove", function (e) {
    mx = e.clientX; my = e.clientY;
    if (visible) place();
  });
  document.addEventListener("mouseover", function (e) {
    var el = e.target.closest ? e.target.closest("[data-tip]") : null;
    if (el === tipEl) return;
    tipEl = el;
    hide();
    if (el) {
      var txt = el.getAttribute("data-tip");
      if (!txt) return;
      timer = setTimeout(function () {
        self.tooltip.textContent = txt;
        self.tooltip.style.display = "block";
        visible = true;
        place();
      }, CONFIG.tooltipDelay);
    }
  });
  document.addEventListener("mouseout", function (e) {
    if (!tipEl) return;
    if (e.relatedTarget && tipEl.contains(e.relatedTarget)) return;
    tipEl = null;
    hide();
  });
};

/* ---------- 主题 ---------- */
Visualizer.prototype.bindTheme = function () {
  var self = this;
  var btns = document.querySelectorAll("[data-theme-btn]");
  for (var i = 0; i < btns.length; i++) {
    (function (b) {
      b.addEventListener("click", function () {
        var t = b.getAttribute("data-theme-btn");
        if (t === "gray") document.documentElement.setAttribute("data-theme", "gray");
        else document.documentElement.removeAttribute("data-theme");
        for (var k = 0; k < btns.length; k++) {
          btns[k].classList.toggle("on", btns[k] === b);
        }
        // 柱子颜色由 CSS 变量接管，这里只需重绘一次
        self.updateBars();
      });
    })(btns[i]);
  }
};

/* ---------- 音效开关 ---------- */
Visualizer.prototype.bindSound = function () {
  var self = this;

  // 浏览器不支持 Web Audio（老版本 / 被策略禁用）时按钮置灰，而不是假装能用
  if (!this.sound.supported()) {
    this.btnSndOn.disabled = true;
    this.btnSndOff.disabled = true;
    this.btnSndOn.setAttribute("data-tip", "当前浏览器不支持 Web Audio，音效不可用");
    this.btnSndOff.setAttribute("data-tip", "当前浏览器不支持 Web Audio，音效不可用");
    this.sound.setEnabled(false);
    this.syncSoundUI();
    return;
  }

  this.btnSndOn.addEventListener("click", function () { self.setSound(true); });
  this.btnSndOff.addEventListener("click", function () { self.setSound(false); });
  this.syncSoundUI();
};

Visualizer.prototype.syncSoundUI = function () {
  var on = this.sound.enabled;
  this.btnSndOn.classList.toggle("on", on);
  this.btnSndOff.classList.toggle("on", !on);
};

Visualizer.prototype.setSound = function (on) {
  if (on && !this.sound.supported()) return;
  this.sound.setEnabled(on);
  this.syncSoundUI();
  // 开启时给一声确认音。这次点击同时是 AudioContext 的「解锁手势」，
  // 之后由定时器触发的音才不会被浏览器的自动播放策略拦掉。
  if (on && this.sound.unlock()) this.sound.playToggle();
};

/* ---------- 按钮 & 滑块 ---------- */
Visualizer.prototype.bindControls = function () {
  var self = this;

  this.btnPlay.addEventListener("click", function () { self.play(); });
  this.btnPause.addEventListener("click", function () { self.pause(); });
  this.btnPrev.addEventListener("click", function () { self.stepBackward(); });
  this.btnNext.addEventListener("click", function () { self.stepForward(); });
  this.btnReset.addEventListener("click", function () { self.reset(); });
  this.btnRandom.addEventListener("click", function () { self.randomize(); });
  this.btnGif.addEventListener("click", function () { self.exportGIF(); });

  this.btnClear.addEventListener("click", function () { self.log.clear(); });
  this.btnCodeToggle.addEventListener("click", function () { self.codePanel.toggle(); });
  this.btnArena.addEventListener("click", function () { self.arena.enter(); });
  this.btnImmersive.addEventListener("click", function () { self.toggleImmersive(); });
  this.btnTurbo.addEventListener("click", function () { self.setTurbo(!self.turbo); });

  this.countSlider.addEventListener("input", function () {
    self.count = parseInt(self.countSlider.value, 10);
    self.countVal.textContent = self.count;
    self.generateData();
    self.initBars();
    self.reset();
  });

  this.speedSlider.addEventListener("input", function () {
    self.speed = parseInt(self.speedSlider.value, 10);
    self.speedVal.textContent = self.speed;
  });

  this.celebration.root.addEventListener("click", function () { self.celebration.hide(); });
};

Visualizer.prototype.bindKeyboard = function () {
  var self = this;
  document.addEventListener("keydown", function (e) {
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;

    // 竞技场开着时接管键盘：Esc 关闭，其余主视图快捷键一律屏蔽
    if (self.arena.open) {
      if (e.key === "Escape") { e.preventDefault(); self.arena.exit(); }
      return;
    }

    var k = e.key;
    if (k === " " || k === "Spacebar") {
      e.preventDefault();
      if (self.isPlaying) self.pause(); else self.play();
      return;
    }
    if (k === "Escape" && self.immersive) { e.preventDefault(); self.exitImmersive(); return; }
    if (k === "f" || k === "F") { e.preventDefault(); self.toggleImmersive(); return; }
    if (k === "t" || k === "T") { e.preventDefault(); self.setTurbo(!self.turbo); return; }
    if (k === "n" || k === "N" || k === "ArrowRight" || k === "ArrowDown") {
      e.preventDefault(); self.stepForward(); return;
    }
    if (k === "b" || k === "B" || k === "ArrowLeft" || k === "ArrowUp") {
      e.preventDefault(); self.stepBackward(); return;
    }
    if (k === "r" || k === "R") { e.preventDefault(); self.reset(); return; }
    if (k === "m" || k === "M") { e.preventDefault(); self.setSound(!self.sound.enabled); return; }
  });
};

/* ---------- 极速模式 ----------
   固定 20ms/步（50 步/秒），忽略 Speed 滑块；主视图与竞技场同时生效。
   关掉后恢复滑块的取值，滑块在开启期间禁用（避免"拖了没反应"的困惑）。 */
Visualizer.prototype.setTurbo = function (on) {
  this.turbo = !!on;
  this.btnTurbo.classList.toggle("on", this.turbo);
  this.btnTurbo.textContent = this.turbo ? "已开启 · 20ms/步" : "20ms/步";
  this.btnTurbo.setAttribute("data-tip", this.turbo
    ? "极速模式已开启：固定 20ms/步（50 步/秒）。再点一次或按 T 关闭"
    : "极速模式：固定 20ms/步（50 步/秒），忽略 Speed 滑块；主视图与竞技场同时生效（快捷键：T）");
  this.speedSlider.disabled = this.turbo;
  this.nextAt = 0;                    // 节奏变了，重新起算
  if (this.arena) {
    this.arena.turbo = this.turbo;
    if (this.arena.open && this.arena.phase === "setup") this.arena.view.refreshSetup(this.arena);
  }
};

/* ---------- 沉浸模式 ----------
   把动画区铺满整个视口，只留柱状图与图例：
   左右栏 / 底部日志代码栏 / 标题栏全部隐藏（CSS 的 html.immersive）。
   同时尝试真全屏（浏览器 chrome 也消失）；拿不到权限（非手势、iframe 限制）时
   仅靠 CSS 铺满窗口，功能不受影响。 */
Visualizer.prototype.toggleImmersive = function () {
  if (this.immersive) this.exitImmersive();
  else this.enterImmersive();
};

Visualizer.prototype.enterImmersive = function () {
  if (this.immersive) return;
  this.immersive = true;
  document.documentElement.classList.add("immersive");
  this.btnImmersive.textContent = "EXIT ZEN";
  this.btnImmersive.setAttribute("data-tip", "退出沉浸模式（ESC）");
  this.syncBars();                 // 版面变化后立刻按新容器宽度重算

  var el = document.documentElement;
  var fn = el.requestFullscreen || el.webkitRequestFullscreen;
  if (fn) {
    try {
      var p = fn.call(el);
      if (p && p.catch) p.catch(function () { /* 没拿到全屏权限：CSS 已经铺满，忽略 */ });
    } catch (e) { /* 同上 */ }
  }
};

Visualizer.prototype.exitImmersive = function (skipApi) {
  if (!this.immersive) return;
  this.immersive = false;
  document.documentElement.classList.remove("immersive");
  this.btnImmersive.textContent = "IMMERSIVE";
  this.btnImmersive.setAttribute("data-tip",
    "沉浸模式：动画区铺满整个屏幕，只留柱状图。空格播放/暂停，↑← 上一步，↓→ 下一步，ESC 退出（快捷键：F）");
  this.syncBars();

  if (skipApi) return;             // 由 fullscreenchange 回调进来的，别再去退出全屏
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    var fn = document.exitFullscreen || document.webkitExitFullscreen;
    if (fn) {
      try {
        var p = fn.call(document);
        if (p && p.catch) p.catch(function () {});
      } catch (e) {}
    }
  }
};

/* ---------- 数据 ---------- */
Visualizer.prototype.generateData = function () {
  var n = this.count;
  var g = CONFIG.data;
  this.data = [];
  for (var i = 0; i < n; i++) {
    this.data.push(g.min + Math.floor(Math.random() * (g.max - g.min + 1)));
  }
  this.originalData = this.data.slice();
};

/* ---------- 状态切换 & 清理 ---------- */
Visualizer.prototype.setStatus = function (s) {
  this.badge.textContent = s;
  this.badge.className = "badge" + (s === "READY" ? "" : " " + s.toLowerCase());
};

Visualizer.prototype.clearTimer = function () {
  if (this.timer) { clearTimeout(this.timer); this.timer = null; }
};

/* 清空进度、回到初始数据。reset 与 randomize 共用这套「复位到 READY」的逻辑 */
Visualizer.prototype.reset = function () {
  this.pause(true);
  this.data = this.originalData.slice();
  this.steps = [];
  this.currentStep = 0;
  this.sortedSet = {};
  this.activeHL = {};
  this.startTime = null;
  this.elapsed = 0;
  this.finished = false;
  this.compares = 0;
  this.swaps = 0;
  this.stepCount = 0;
  this.log.clear();
  this.codePanel.clear();
  this.celebration.hide();
  this.prepareSteps();        // 算出 total，但不启动计时
  this.updateBars();
  this.updateStats();
  this.setStatus("READY");
};

Visualizer.prototype.randomize = function () {
  this.generateData();
  this.initBars();
  this.reset();
};

Visualizer.prototype.prepareSteps = function () {
  var algo = AlgorithmRegistry.get(this.selectedAlgo);
  this.codePanel.render(algo);      // 换算法时刷新代码栏（同算法不重建 DOM）
  this.steps = algo.run(this.data.slice());
  this.currentStep = 0;
  this.sortedSet = {};
  this.activeHL = {};
  this.finished = false;
  this.total = 0;
  for (var i = 0; i < this.steps.length; i++) {
    if (StepEngine.isCounted(this.steps[i].type)) this.total++;
  }
  // 音高映射区间：取初始数据极值，整轮排序复用
  var mn = Infinity, mx = -Infinity;
  for (var k = 0; k < this.originalData.length; k++) {
    if (this.originalData[k] < mn) mn = this.originalData[k];
    if (this.originalData[k] > mx) mx = this.originalData[k];
  }
  this.dataMin = isFinite(mn) ? mn : 0;
  this.dataMax = isFinite(mx) ? mx : 100;
  this.addLogRunHeader();
};

/* 日志头部（算法名 / 初始数组 / 步骤总数）。
   prepareSteps 与 replayTo 都要打，否则 PREV 回退后日志会丢掉头部只剩步骤行。 */
Visualizer.prototype.addLogRunHeader = function () {
  var algo = AlgorithmRegistry.get(this.selectedAlgo);
  this.addLog("info", "加载算法 " + algo.label + " / " + algo.cnLabel + "，n = " + this.originalData.length);
  this.addLog("info", "初始数组 [" + this.originalData.join(", ") + "]");
  this.addLog("info", "步骤序列已生成，共 " + this.steps.length +
    " 步（其中比较/交换/写入 " + this.total + " 次）");
};

/* ---------- 播放控制 ---------- */
Visualizer.prototype.play = function () {
  if (this.isPlaying) return;
  this.sound.unlock();       // 借这次点击/按键的手势栈解锁音频
  if (this.steps.length === 0) this.prepareSteps();
  if (this.currentStep >= this.steps.length) {
    this.reset();                       // 已完成 → 从头再来
  }
  this.nextAt = 0;
  if (!this.startTime) this.startTime = Date.now();
  this.finished = false;
  this.isPlaying = true;
  this.setStatus("RUNNING");
  this.tick();
};

Visualizer.prototype.pause = function (silent) {
  this.isPlaying = false;
  this.nextAt = 0;          // 下次播放重新起算，别把暂停时长算进节奏
  this.clearTimer();
  if (!silent) {
    if (!this.finished && this.currentStep > 0) this.setStatus("PAUSED");
    this.updateStats();
  }
};

Visualizer.prototype.tick = function () {
  var self = this;
  if (!this.isPlaying) return;
  if (this.currentStep >= this.steps.length) { this.finish(); return; }

  var t0 = Date.now();
  this.executeStep();
  this.currentStep++;
  this.updateBars();
  this.updateStats();
  if (this.currentStep >= this.steps.length) { this.finish(); return; }

  // 与竞技场共用同一个速度换算（见 utils.js 的 stepDelayMs）。
  // setTimeout 的实际周期 = 延时 + 单步渲染耗时 + 定时器开销，不补偿的话快速档位会偏低。
  // 这里维护一条「计划时刻表」：每步把 nextAt 前移一个延时，实际等待 = nextAt - now，
  // 于是上一步超出的时间会在下一步被自动扣掉，平均节奏回到标称值。
  var delay = stepDelayMs(this.speed, this.turbo);
  var now = Date.now();
  if (!this.nextAt) this.nextAt = now + delay;
  this.nextAt += delay;
  var wait = this.nextAt - now;
  if (wait < 1) { wait = 1; this.nextAt = now + 1; }   // 落后太多就重置，不做无限追赶
  this.timer = setTimeout(function () { self.tick(); }, wait);
};

Visualizer.prototype.stepForward = function () {
  if (this.isPlaying) this.pause();
  this.sound.unlock();
  if (this.steps.length === 0) this.prepareSteps();
  if (this.currentStep >= this.steps.length) return;
  if (!this.startTime) this.startTime = Date.now();
  this.finished = false;
  this.executeStep();
  this.currentStep++;
  this.updateBars();
  this.updateStats();
  if (this.currentStep >= this.steps.length) {
    this.finish();
  } else {
    this.setStatus("PAUSED");
  }
};

Visualizer.prototype.stepBackward = function () {
  if (this.isPlaying) this.pause();
  if (this.steps.length === 0) return;
  if (this.currentStep <= 0) return;
  this.finished = false;
  this.replayTo(this.currentStep - 1);
  this.setStatus(this.currentStep === 0 ? "READY" : "PAUSED");
};

/* 从原始数据重放 0..target-1 步，重建全部状态 */
Visualizer.prototype.replayTo = function (target) {
  this.clearTimer();
  this.data = this.originalData.slice();
  this.sortedSet = {};
  this.activeHL = {};
  this.currentStep = 0;
  this.compares = 0;
  this.swaps = 0;
  this.stepCount = 0;
  this.log.clear();
  this.codePanel.clear();
  this.addLogRunHeader();

  for (var i = 0; i < target; i++) {
    this.applyStep(this.steps[i], true);   // 静默重放，不发声
    this.currentStep = i + 1;
  }
  this.updateBars();
  this.updateStats();
};

/* 单步应用：把状态交给 StepEngine 处理，回填后记录日志与计数 */
Visualizer.prototype.executeStep = function () {
  if (this.currentStep >= this.steps.length) return;
  this.applyStep(this.steps[this.currentStep]);
};

Visualizer.prototype.applyStep = function (step, silent) {
  var state = { data: this.data, sortedSet: this.sortedSet, highlight: this.activeHL };
  var logType = StepEngine.apply(state, step);
  this.data = state.data;
  this.activeHL = state.highlight;
  if (logType) this.addLog(logType, step.message, step);
  // 高亮这一步对应的展示代码行（0 表示该步没有映射，保持原样不清屏）
  this.codePanel.highlight(step.line);
  this.compares = step.compareCount;
  this.swaps = step.swapCount;
  this.stepCount = step.compareCount + step.swapCount;
  // 声音放在状态更新之后：SWAP/SET 的 step.data 已是交换后的快照
  this.sound.playStep(step, this.data, this.dataMin, this.dataMax, silent);
};

Visualizer.prototype.finish = function () {
  this.isPlaying = false;
  this.finished = true;
  this.clearTimer();
  if (this.startTime) this.elapsed = (Date.now() - this.startTime) / 1000;
  this.updateBars();
  this.updateStats();
  this.setStatus("DONE");
  this.addLog("done", "全部完成，总耗时 " + this.elapsed.toFixed(3) + " s / 比较 " +
    this.compares + " 次 / 交换 " + this.swaps + " 次");
  this.celebration.show({
    compares: this.compares,
    swaps: this.swaps,
    total: this.total,
    elapsed: this.elapsed
  });
};

/* ---------- 日志 / 统计：转发给对应面板 ---------- */
Visualizer.prototype.addLog = function (type, msg, step) {
  this.log.append(type, msg, step ? this.currentStep + 1 : 0);
};

Visualizer.prototype.updateStats = function () {
  var t;
  if (this.finished) t = this.elapsed;
  else if (this.startTime) t = (Date.now() - this.startTime) / 1000;
  else t = 0;
  this.stats.render({
    compares: this.compares,
    swaps: this.swaps,
    stepCount: this.stepCount,
    total: this.total,
    timeSec: t
  });
};

/* ---------- GIF 导出：转发给 GifExporter ---------- */
Visualizer.prototype.exportGIF = function () {
  GifExporter.export({
    algo: AlgorithmRegistry.get(this.selectedAlgo),
    originalData: this.originalData,
    speed: this.speed,
    vizEl: this.vizEl,
    fileBase: "sort-" + this.selectedAlgo + "-n" + this.count,
    button: this.btnGif
  });
};
