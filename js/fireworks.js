"use strict";

/* =======================================================================
   5. 烟花粒子引擎（庆祝弹窗 / GIF 结尾共用）
   ======================================================================= */
function Fireworks(w, h) {
  this.w = w;
  this.h = h;
  this.parts = [];
  this.acc = 0;
  this.next = 0;
  this.colors = CONFIG.fireworksColors;
}
Fireworks.prototype.burst = function (cx, cy) {
  var count = 32 + Math.floor(Math.random() * 16);
  var baseHue = this.colors[Math.floor(Math.random() * this.colors.length)];
  for (var i = 0; i < count; i++) {
    var ang = (Math.PI * 2 * i) / count + Math.random() * 0.16;
    var spd = 1.6 + Math.random() * 4.2;
    this.parts.push({
      x: cx,
      y: cy,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 1,
      color: Math.random() < 0.72 ? baseHue : this.colors[Math.floor(Math.random() * this.colors.length)],
      size: 1.4 + Math.random() * 1.8
    });
  }
};
Fireworks.prototype.spawn = function () {
  var cx = this.w * (0.22 + Math.random() * 0.56);
  var cy = this.h * (0.2 + Math.random() * 0.45);
  this.burst(cx, cy);
};
Fireworks.prototype.step = function (dt) {
  this.acc += dt;
  if (this.acc >= this.next) {
    this.acc = 0;
    this.next = 12 + Math.random() * 24;
    this.spawn();
  }
  var damp = Math.pow(0.985, dt);
  var i, p;
  for (i = 0; i < this.parts.length; i++) {
    p = this.parts[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 0.06 * dt;
    p.vx *= damp;
    p.vy *= damp;
    p.life -= 0.011 * dt;
  }
  var alive = [];
  for (i = 0; i < this.parts.length; i++) {
    if (this.parts[i].life > 0) alive.push(this.parts[i]);
  }
  this.parts = alive;
};
Fireworks.prototype.draw = function (ctx, withTrail) {
  if (withTrail) {
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();
  }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (var i = 0; i < this.parts.length; i++) {
    var p = this.parts[i];
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

/* ========== 以下进入视图层（依赖 DOM；此线以上为可独立测试的纯逻辑） ========== */
