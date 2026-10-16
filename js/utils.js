"use strict";

/* =======================================================================
   4. 通用工具
   ======================================================================= */
function $(id) { return document.getElementById(id); }

function lerp(a, b, t) { return a + (b - a) * t; }

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function readThemeColors() {
  var cs = getComputedStyle(document.body);
  function g(n) { return cs.getPropertyValue(n).trim(); }
  return {
    bg: g("--bg"),
    panel: g("--panel"),
    panel2: g("--panel2"),
    border: g("--border2"),
    green: g("--green"),
    amber: g("--amber"),
    red: g("--red"),
    cyan: g("--cyan"),
    dim: g("--dim"),
    idle: g("--c-idle"),
    cmp: g("--c-cmp"),
    swap: g("--c-swap"),
    pivot: g("--c-pivot"),
    sorted: g("--c-sorted")
  };
}

/* 终端角标边框（四角 L 形括号） */
function drawCornerFrame(ctx, rect, color, alpha) {
  var L = 14, lw = 1.5;
  var x = rect.x, y = rect.y, w = rect.w, h = rect.h;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "square";
  ctx.beginPath(); ctx.moveTo(x, y + L); ctx.lineTo(x, y); ctx.lineTo(x + L, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + w - L, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + L); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + w, y + h - L); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - L, y + h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + L, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - L); ctx.stroke();
  ctx.restore();
}

/* 绘制柱状图（Canvas 版：索引 0 在底部，与页面一致） */
function drawBarsOnCanvas(ctx, data, sortedSet, hl, area, colors, alpha) {
  var n = data.length;
  if (!n) return;
  var max = 1, i;
  for (i = 0; i < n; i++) if (data[i] > max) max = data[i];
  var gap = n > 30 ? 1 : 2;
  var bh = Math.floor((area.h - (n - 1) * gap) / n);
  if (bh < 1) { bh = 1; gap = 0; }
  ctx.save();
  ctx.globalAlpha = (alpha === undefined ? 1 : alpha);
  for (i = 0; i < n; i++) {
    var y = area.y + (n - 1 - i) * (bh + gap);
    var w = (data[i] / max) * area.w;
    if (w < 2) w = 2;
    var c = colors.idle;
    var h = hl[i];
    if (h === "compare") c = colors.cmp;
    else if (h === "swap") c = colors.swap;
    else if (h === "pivot") c = colors.pivot;
    else if (sortedSet[i]) c = colors.sorted;
    ctx.fillStyle = c;
    ctx.fillRect(area.x, y, w, bh);
  }
  ctx.restore();
}

/* 竖向迷你柱状图（竞技场网格单元格专用）。
   单元格又宽又矮，横向柱状图的「行高 + 行间 gap」启发式在这里会把柱高压到 1px，
   所以竞技场改用竖柱：柱宽由单元格宽度除以元素数得到，高度按值取。 */
function drawMiniBars(ctx, data, sortedSet, hl, area, colors) {
  var n = data.length;
  if (!n) return;
  var max = 1, i;
  for (i = 0; i < n; i++) if (data[i] > max) max = data[i];
  var gap = n > 40 ? 1 : 2;
  var bw = Math.floor((area.w - (n - 1) * gap) / n);
  if (bw < 1) { bw = 1; gap = 0; }
  ctx.save();
  for (i = 0; i < n; i++) {
    var h = Math.max(1, Math.round((data[i] / max) * area.h));
    var c = colors.idle;
    var tag = hl[i];
    if (tag === "compare") c = colors.cmp;
    else if (tag === "swap") c = colors.swap;
    else if (tag === "pivot") c = colors.pivot;
    else if (sortedSet[i]) c = colors.sorted;
    ctx.fillStyle = c;
    ctx.fillRect(area.x + i * (bw + gap), area.y + area.h - h, bw, h);
  }
  ctx.restore();
}

/* 画布上的逐字动画文字 */
function drawAnimatedText(ctx, text, cx, cy, size, color, progress, glow) {
  var chars = Array.from(text);
  var n = chars.length;
  if (!n) return;
  ctx.save();
  ctx.font = "bold " + size + "px 'Microsoft YaHei',Consolas,'Courier New',monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  var widths = chars.map(function (c) { return ctx.measureText(c).width; });
  var total = widths.reduce(function (a, b) { return a + b; }, 0);
  var x = cx - total / 2;
  for (var i = 0; i < n; i++) {
    var start = i / (n * 1.5);
    var p = (progress - start) / 0.35;
    if (p > 1) p = 1;
    if (p > 0) {
      ctx.save();
      ctx.globalAlpha = p;
      if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 12; }
      ctx.fillStyle = color;
      ctx.fillText(chars[i], x + (1 - p) * -8, cy + (1 - p) * 6);
      ctx.restore();
    }
    x += widths[i];
  }
  ctx.restore();
}
