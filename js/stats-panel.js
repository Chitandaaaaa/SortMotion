"use strict";

/* =======================================================================
   8. 统计面板
   ======================================================================= */
function StatsPanel(refs) {
  this.compare = refs.compare;
  this.swap = refs.swap;
  this.step = refs.step;
  this.total = refs.total;
  this.time = refs.time;
}

StatsPanel.prototype.render = function (v) {
  this.compare.textContent = v.compares;
  this.swap.textContent = v.swaps;
  this.step.textContent = v.stepCount;
  this.total.textContent = v.total;
  this.time.textContent = v.timeSec.toFixed(3);
};
