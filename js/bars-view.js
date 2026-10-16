"use strict";

/* =======================================================================
   6. 柱状图视图
   只做一件事：把「数据 + 高亮 + 已排序集合」映射成 DOM 柱子的宽度与配色。
   几何尺寸全由 CSS 决定（flex 撑高 + 百分比宽度），这里不存任何像素值，
   所以缩放窗口 / 页面缩放都不需要重算，也就不会留下过期尺寸。
   ======================================================================= */
function BarsView(el) {
  this.el = el;
  this.bars = [];
}

/* 元素数量与数据长度不一致时重建 DOM，否则只更新样式 */
BarsView.prototype.sync = function (data, highlight, sortedSet) {
  if (this.bars.length !== data.length) this.build(data.length);
  this.update(data, highlight, sortedSet);
};

BarsView.prototype.build = function (n) {
  this.el.innerHTML = "";
  this.bars = [];
  if (!n) return;
  var g = CONFIG.barGap;
  this.el.style.setProperty("--bar-gap",
    (n > g.denseAbove ? g.dense : n > g.midAbove ? g.mid : g.wide) + "px");
  var frag = document.createDocumentFragment();
  for (var i = 0; i < n; i++) {
    var b = document.createElement("div");
    b.className = "vbar";
    frag.appendChild(b);
    this.bars.push(b);
  }
  this.el.appendChild(frag);
};

BarsView.prototype.update = function (data, highlight, sortedSet) {
  var n = data.length;
  if (!n) return;
  if (this.bars.length !== n) this.build(n);
  var max = 1, i;
  for (i = 0; i < n; i++) if (data[i] > max) max = data[i];
  for (i = 0; i < n; i++) {
    var b = this.bars[i];
    if (!b) continue;
    b.style.width = ((data[i] / max) * 100).toFixed(3) + "%";
    var hl = highlight[i];
    b.className = "vbar" + (hl ? " " + hl : (sortedSet[i] ? " sorted" : ""));
  }
};
