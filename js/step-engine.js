"use strict";

/* =======================================================================
   1. 步骤类型 & 算法基类
   ======================================================================= */
var StepType = {
  COMPARE: "COMPARE",
  SWAP: "SWAP",
  SET: "SET",
  MARK_SORTED: "MARK_SORTED",
  PIVOT: "PIVOT",
  INFO: "INFO",
  DONE: "DONE"
};

/* ---------- 步骤引擎 ----------
   把一个「步骤」应用到一份「状态」上。状态形状：
       { data: [...], sortedSet: {}, highlight: {} }
   向前播放、PREV 回退重放、GIF 离屏模拟、total 统计口径 —— 全部复用这里，
   所以新增步骤类型时只需要改这一个函数，不会再出现三处各写一遍的同步问题。 */
var StepEngine = {
  /* 是否计入统计（比较 / 交换 / 写入）。INFO、MARK_SORTED 等不计入。 */
  isCounted: function (type) {
    return type === StepType.COMPARE || type === StepType.SWAP || type === StepType.SET;
  },

  /* 应用一步；返回该步对应的日志类型，不需要记录的返回 null */
  apply: function (state, step) {
    var i;
    state.highlight = {};
    switch (step.type) {
      case StepType.COMPARE:
        for (i = 0; i < step.indices.length; i++) state.highlight[step.indices[i]] = "compare";
        return "compare";

      case StepType.SWAP:
      case StepType.SET:
        if (step.data) state.data = step.data.slice();
        for (i = 0; i < step.indices.length; i++) state.highlight[step.indices[i]] = "swap";
        return "swap";

      case StepType.MARK_SORTED:
        for (i = 0; i < step.indices.length; i++) state.sortedSet[step.indices[i]] = true;
        return "sorted";

      case StepType.PIVOT:
        for (i = 0; i < step.indices.length; i++) state.highlight[step.indices[i]] = "pivot";
        return "pivot";

      case StepType.DONE:
        if (step.data) state.data = step.data.slice();
        for (i = 0; i < state.data.length; i++) state.sortedSet[i] = true;
        state.highlight = {};
        return "done";

      case StepType.INFO:
        return "info";
    }
    return null;
  }
};

function AlgorithmBase(name, label, cnLabel, desc) {
  this.name = name;
  this.label = label;
  this.cnLabel = cnLabel;
  this.desc = desc || "";
  this.steps = [];
  this.compareCount = 0;
  this.swapCount = 0;
  this.arr = null;
}

AlgorithmBase.prototype.record = function (type, data, message, indices) {
  this.steps.push({
    type: type,
    data: data ? data.slice() : null,
    message: message,
    indices: indices || [],
    compareCount: this.compareCount,
    swapCount: this.swapCount
  });
};

AlgorithmBase.prototype.compare = function (arr, i, j) {
  this.compareCount++;
  this.record(StepType.COMPARE, null, "比较 arr[" + i + "]=" + arr[i] + " 与 arr[" + j + "]=" + arr[j], [i, j]);
  return arr[i] - arr[j];
};

AlgorithmBase.prototype.swap = function (arr, i, j) {
  var vi = arr[i], vj = arr[j];
  // 先执行真实交换，再记录快照 —— 保证高亮时柱子宽度已经是交换后的值
  arr[i] = vj;
  arr[j] = vi;
  this.swapCount++;
  this.record(StepType.SWAP, arr, "交换 arr[" + i + "]=" + vi + " ↔ arr[" + j + "]=" + vj, [i, j]);
};

AlgorithmBase.prototype.markSorted = function (i) {
  var v = this.arr ? this.arr[i] : "";
  this.record(StepType.MARK_SORTED, null, "arr[" + i + "]=" + v + " 已就位", [i]);
};

AlgorithmBase.prototype.markPivot = function (i) {
  var v = this.arr ? this.arr[i] : "";
  this.record(StepType.PIVOT, null, "标记枢轴 arr[" + i + "]=" + v, [i]);
};

/* 直接把某个位置覆写成新值（归并 / 计数 / 基数 / 桶排序等「搬移」型算法用）。
   计入 swapCount，把一次写操作也统计进去，避免这类算法 swaps 恒为 0。 */
AlgorithmBase.prototype.set = function (arr, i, val) {
  var old = arr[i];
  arr[i] = val;
  this.swapCount++;
  this.record(StepType.SET, arr, "写入 arr[" + i + "] <- " + val + "（原 " + old + "）", [i]);
};

/* 与「已暂存到局部变量、暂时离开数组」的元素比较（循环排序等用）。 */
AlgorithmBase.prototype.compareVal = function (arr, i, value) {
  this.compareCount++;
  this.record(StepType.COMPARE, null,
    "比较 arr[" + i + "]=" + arr[i] + " 与暂存值 " + value, [i]);
  return arr[i] - value;
};

AlgorithmBase.prototype.info = function (msg) {
  this.record(StepType.INFO, null, msg, []);
};

AlgorithmBase.prototype.done = function (arr) {
  this.record(StepType.DONE, arr,
    "排序完成：共 " + this.compareCount + " 次比较、" + this.swapCount + " 次交换",
    []);
};

AlgorithmBase.prototype.sort = function (arr) { /* 子类实现 */ };

AlgorithmBase.prototype.run = function (input) {
  this.steps = [];
  this.compareCount = 0;
  this.swapCount = 0;
  var work = input.slice();
  this.arr = work;
  this.sort(work);
  this.done(work);
  return this.steps;
};
