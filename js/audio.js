"use strict";

/* =======================================================================
   16. 声音特效（Web Audio 实时合成，不加载任何音频文件）

   设计原则：
   - 音高由「被操作的数值」决定，并量化到五声音阶 —— 排序过程听起来像一段旋律，
     而且随着数据逐步就位，音高分布会收敛（数据声音化 / sonification）。
   - 声音是装饰，不是事实：高密度时宁可丢音，也不能让音频线程拖慢排序，
     所以有「最小间隔节流」+「并发声部上限」两道闸。
   - GIF 导出走 simStep、PREV 回退走 applyStep(..., silent)，都不经过 playStep，
     所以这两条路径天然静音。
   ======================================================================= */
var PENTA = [0, 2, 4, 7, 9];   // 大调五声音阶（半音偏移），相邻音级不会刺耳

/* localStorage 在 file:// 与隐私模式下可能直接抛异常，这里静默降级 */
function soundStorage(key, value) {
  var win = (typeof window !== "undefined") ? window : null;
  if (!win || !win.localStorage) return null;
  try {
    if (value === undefined) return win.localStorage.getItem(key);
    win.localStorage.setItem(key, value);
  } catch (e) { /* 记不住就算了，不影响播放 */ }
  return null;
}

function SoundEngine() {
  this.ctx = null;
  this.master = null;
  this.enabled = true;
  this.voices = 0;        // 正在发声的振荡器数量
  this.lastAt = 0;        // 上次发声时间戳（performance.now）

  var cfg = CONFIG.sound;
  this.volume = cfg.volume;
  this.minGap = cfg.minGapMs;
  this.maxVoices = cfg.maxVoices;

  if (soundStorage(cfg.storageKey) === "off") this.enabled = false;
}

SoundEngine.prototype.supported = function () {
  var win = (typeof window !== "undefined") ? window : null;
  return !!(win && (win.AudioContext || win.webkitAudioContext));
};

/* 必须在「用户手势」的调用栈里执行一次，否则浏览器的自动播放策略
   会把 AudioContext 一直按在 suspended 状态，之后定时器触发的音全都静默。 */
SoundEngine.prototype.unlock = function () {
  var ctx = this.ensure();
  if (ctx && ctx.state === "suspended") ctx.resume();
  return !!ctx;
};

SoundEngine.prototype.ensure = function () {
  if (!this.enabled || !this.supported()) return null;
  if (!this.ctx) {
    var win = window;
    var AC = win.AudioContext || win.webkitAudioContext;
    try {
      this.ctx = new AC();
    } catch (e) {
      return null;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    // 一道轻低通：削掉方波的高频毛刺，连听几分钟也不刺耳
    var lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 6000;
    this.master.connect(lp);
    lp.connect(this.ctx.destination);
  }
  if (this.ctx.state === "suspended") this.ctx.resume();
  return this.ctx;
};

SoundEngine.prototype.setEnabled = function (on) {
  this.enabled = !!on;
  soundStorage(CONFIG.sound.storageKey, this.enabled ? "on" : "off");
  if (!this.ctx || !this.master) return;
  // 关掉时立刻掐掉余音，免得还有半秒残响；重新打开再把主音量拉回来
  try {
    var now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0.0001, now, 0.01);
  } catch (e) { /* 个别浏览器的 schedule 参数限制，忽略即可 */ }
};

/* 数值 → 频率：五声音阶，2 个八度（A3 220Hz ~ A5 880Hz）。
   跨度再大就会刺耳，所以上限卡在 880。 */
SoundEngine.prototype.freqOf = function (v, min, max) {
  var t = (max > min) ? (v - min) / (max - min) : 0.5;
  if (!(t >= 0)) t = 0;
  if (t > 1) t = 1;
  var idx = Math.round(t * CONFIG.sound.levels);   // 0..10 → 11 个音级
  var semi = PENTA[idx % 5] + Math.floor(idx / 5) * 12;
  return CONFIG.sound.freqBase * Math.pow(2, semi / 12);
};

/* 发声基元。opt: { freq, to, dur, type, gain, when, force } */
SoundEngine.prototype.tone = function (opt) {
  var ctx = this.ctx;
  if (!ctx || !this.enabled) return;

  var now = (window.performance && performance.now) ? performance.now() : Date.now();
  if (!opt.force) {
    if (now - this.lastAt < this.minGap) return;   // 节流：丢音保流畅
    this.lastAt = now;
  }
  if (this.voices >= this.maxVoices) return;

  var t0 = ctx.currentTime + (opt.when || 0);
  var dur = opt.dur || 0.06;
  var osc = ctx.createOscillator();
  var g = ctx.createGain();
  osc.type = opt.type || "sine";
  osc.frequency.setValueAtTime(opt.freq, t0);
  if (opt.to) osc.frequency.exponentialRampToValueAtTime(opt.to, t0 + dur);

  // 指数包络（不能到 0，用 0.0001 做底）：起音快、收尾自然
  var peak = opt.gain || 0.06;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.008, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(g);
  g.connect(this.master);

  var self = this;
  this.voices++;
  osc.onended = function () { self.voices--; };
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
};

/* ---- 各类步骤的音色 ---- */
SoundEngine.prototype.playCompare = function (f) {
  // 短促三角波「嗒」：只做提示，不抢戏
  this.tone({ freq: f, dur: 0.05, type: "triangle", gain: 0.05 });
};

SoundEngine.prototype.playSwap = function (f) {
  // 方波下滑 + 低八度：一次「落下」的实感
  this.tone({ freq: f * 0.5, to: f * 0.32, dur: 0.09, type: "square", gain: 0.045 });
};

SoundEngine.prototype.playPivot = function (f) {
  // 铃音：基频 + 五度泛音，衰减长一些，辨识度最高
  this.tone({ freq: f * 2, dur: 0.2, type: "sine", gain: 0.055 });
  this.tone({ freq: f * 3, dur: 0.13, type: "sine", gain: 0.02, force: true });
};

SoundEngine.prototype.playSorted = function (f) {
  // 就位「叮」：比比较音高一个五度，听感上像「确认」
  this.tone({ freq: f * 1.5, dur: 0.11, type: "sine", gain: 0.04 });
};

SoundEngine.prototype.playToggle = function () {
  this.tone({ freq: 660, dur: 0.07, type: "triangle", gain: 0.05, force: true });
  this.tone({ freq: 990, dur: 0.1, type: "triangle", gain: 0.05, when: 0.06, force: true });
};

SoundEngine.prototype.playFinish = function () {
  // 大调琶音（C5 起），与庆祝弹窗的金色标题同时出现
  var base = 523.25;
  var seq = [0, 4, 7, 12, 16];
  for (var i = 0; i < seq.length; i++) {
    this.tone({
      freq: base * Math.pow(2, seq[i] / 12),
      dur: 0.3,
      type: "triangle",
      gain: 0.06,
      when: i * 0.085,
      force: true
    });
  }
};

/* 一步一音：把「正在发生的操作」翻译成声音。
   arr 传当前数组（COMPARE 的 step.data 为 null，需要用实时数据取音高）。
   silent 供 PREV 回退重放用 —— 否则按一次 PREV 会连着响几十个音。 */
SoundEngine.prototype.playStep = function (step, arr, min, max, silent) {
  if (silent || !this.enabled) return;

  var t = step.type;
  if (t === StepType.INFO) return;
  if (t === StepType.DONE) { this.playFinish(); return; }

  var idx = (step.indices && step.indices.length) ? step.indices[0] : 0;
  var src = (step.data && step.data.length) ? step.data : arr;
  var v = src[idx];
  if (typeof v !== "number" || !isFinite(v)) v = max;

  var f = this.freqOf(v, min, max);
  if (t === StepType.COMPARE) this.playCompare(f);
  else if (t === StepType.SWAP || t === StepType.SET) this.playSwap(f);
  else if (t === StepType.PIVOT) this.playPivot(f);
  else if (t === StepType.MARK_SORTED) this.playSorted(f);
};
