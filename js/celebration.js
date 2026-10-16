"use strict";

/* =======================================================================
   9. 庆祝弹窗（逐字动画 + Canvas 烟花）
   ======================================================================= */
function CelebrationScreen(refs) {
  this.root = refs.root;
  this.canvas = refs.canvas;
  this.title = refs.title;
  this.stats = refs.stats;
  this.time = refs.time;
  this.hint = refs.hint;

  this.fw = null;
  this.raf = null;
  this.timers = [];
  this.closeTimer = null;
}

/* 把一段文字拆成逐字动画用的 span，返回 span 列表 */
function typewriter(container, text) {
  container.innerHTML = Array.from(text).map(function (c) {
    return "<span>" + (c === " " ? "&nbsp;" : c) + "</span>";
  }).join("");
  return Array.prototype.slice.call(container.children);
}

CelebrationScreen.prototype.show = function (result) {
  var self = this;
  this.hide();
  this.root.style.display = "flex";
  this.resizeCanvas();

  // 标题逐字
  var title = "大吉大利，恭喜吃鸡！";
  var tSpans = typewriter(this.title, title);
  requestAnimationFrame(function () {
    tSpans.forEach(function (s, i) {
      self.timers.push(setTimeout(function () { s.classList.add("in"); }, i * 180));
    });
  });

  // 统计行
  var statsData = [
    "compares: " + result.compares,
    "swaps: " + result.swaps,
    "total: " + result.total
  ];
  this.stats.innerHTML = "";
  var lines = statsData.map(function (t) {
    var d = document.createElement("div");
    d.className = "cel-line";
    typewriter(d, t);
    self.stats.appendChild(d);
    return d;
  });

  var cursor = title.length * 180 + 500;
  lines.forEach(function (line) {
    var spans = Array.prototype.slice.call(line.children);
    spans.forEach(function (s, i) {
      self.timers.push(setTimeout(function () { s.classList.add("in"); }, cursor + i * 50));
    });
    cursor += spans.length * 50 + 320;
  });

  // 耗时行
  var ttSpans = typewriter(this.time, "总耗时: " + result.elapsed.toFixed(3) + " s");
  ttSpans.forEach(function (s, i) {
    self.timers.push(setTimeout(function () { s.classList.add("in"); }, cursor + i * 90));
  });
  cursor += ttSpans.length * 90 + 350;

  // 关闭提示 & 自动关闭
  this.timers.push(setTimeout(function () { self.hint.classList.add("in"); }, cursor));
  this.closeTimer = setTimeout(function () { self.hide(); }, 12000);

  this.startFireworks();
};

CelebrationScreen.prototype.resizeCanvas = function () {
  var dpr = window.devicePixelRatio || 1;
  this.canvas.width = Math.floor(window.innerWidth * dpr);
  this.canvas.height = Math.floor(window.innerHeight * dpr);
  var ctx = this.canvas.getContext("2d");
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
};

CelebrationScreen.prototype.startFireworks = function () {
  var self = this;
  var ctx = this.canvas.getContext("2d");
  if (!ctx) return;                       // 无 Canvas 环境（如测试）时静默跳过
  var w = window.innerWidth, h = window.innerHeight;
  this.fw = new Fireworks(w, h);
  this.fw.burst(w / 2, h * 0.42);
  var last = performance.now();

  function loop(ts) {
    var dt = Math.min(3, (ts - last) / 16.667);
    last = ts;
    self.fw.w = w;
    self.fw.h = h;
    self.fw.step(dt);
    self.fw.draw(ctx, true);              // 带拖尾
    self.raf = requestAnimationFrame(loop);
  }
  this.raf = requestAnimationFrame(loop);
};

CelebrationScreen.prototype.hide = function () {
  this.root.style.display = "none";
  if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
  this.fw = null;
  if (this.closeTimer) { clearTimeout(this.closeTimer); this.closeTimer = null; }
  this.timers.forEach(function (t) { clearTimeout(t); });
  this.timers = [];
  var ctx = this.canvas.getContext("2d");
  if (ctx) ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  this.title.innerHTML = "";
  this.stats.innerHTML = "";
  this.time.innerHTML = "";
  this.hint.classList.remove("in");
};
