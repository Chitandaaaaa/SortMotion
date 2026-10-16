"use strict";

/* =======================================================================
   2. 内置算法

   defineSort() 把三件事合成一行，消除重复样板与「漏改一处」的风险：
     1. 自动继承 AlgorithmBase（不再每个算法手写 2 行 prototype 样板）；
     2. 算法自带中文说明 desc（不再额外维护 algoTip 映射表）；
     3. 自动登记进 SORT_ALGORITHMS，注册表 init() 统一实例化（不再手写 new 列表）。
   ======================================================================= */
var SORT_ALGORITHMS = [];

function defineSort(name, label, cnLabel, desc) {
  function Algo() { AlgorithmBase.call(this, name, label, cnLabel, desc); }
  Algo.prototype = Object.create(AlgorithmBase.prototype);
  Algo.prototype.constructor = Algo;
  SORT_ALGORITHMS.push(Algo);
  return Algo;
}

/* --- 冒泡排序（含 early exit 优化） --- */
var BubbleSort = defineSort("bubble", "BubbleSort", "冒泡排序",
  "相邻两两比较，大的往后沉；加了一轮无交换就提前结束的优化");
BubbleSort.prototype.code = [
  "for i = 0 .. n-2:",
  "  swapped = false",
  "  for j = 0 .. n-2-i:",
  "    if a[j] > a[j+1]:",
  "      swap(a[j], a[j+1])",
  "      swapped = true",
  "  标记 a[n-1-i] 已就位；本轮无交换则提前结束"
];
BubbleSort.prototype.codeMap = { compare: 4, swap: 5, markSorted: 7, info: 7 };
BubbleSort.prototype.sort = function (arr) {
  var n = arr.length, i, j, k, swapped;
  for (i = 0; i < n - 1; i++) {
    swapped = false;
    for (j = 0; j < n - 1 - i; j++) {
      if (this.compare(arr, j, j + 1) > 0) {
        this.swap(arr, j, j + 1);
        swapped = true;
      }
    }
    this.markSorted(n - 1 - i);
    if (!swapped) {
      this.info("本轮无交换，序列已有序，提前结束");
      for (k = 0; k <= n - 2 - i; k++) this.markSorted(k);
      return;
    }
  }
  this.markSorted(0);
};

/* --- 选择排序 --- */
var SelectionSort = defineSort("selection", "SelectionSort", "选择排序",
  "每轮从未排序区选出最小值，放到已排序区末尾");
SelectionSort.prototype.code = [
  "for i = 0 .. n-2:",
  "  min = i                        // 先假定本轮最小",
  "  for j = i+1 .. n-1:",
  "    if a[j] < a[min]: min = j",
  "  if min != i: swap(a[i], a[min])",
  "  mark a[i] sorted"
];
SelectionSort.prototype.codeMap = { pivot: 2, compare: 4, swap: 5, markSorted: 6 };
SelectionSort.prototype.sort = function (arr) {
  var n = arr.length, i, j, min;
  for (i = 0; i < n - 1; i++) {
    this.markPivot(i);
    min = i;
    for (j = i + 1; j < n; j++) {
      if (this.compare(arr, j, min) < 0) min = j;
    }
    if (min !== i) this.swap(arr, i, min);
    this.markSorted(i);
  }
  this.markSorted(n - 1);
};

/* --- 插入排序 --- */
var InsertionSort = defineSort("insertion", "InsertionSort", "插入排序",
  "把每个元素向前插入到已排序序列中的正确位置");
InsertionSort.prototype.code = [
  "for i = 1 .. n-1:",
  "  j = i                          // 待插入的元素",
  "  while j > 0 and a[j-1] > a[j]:",
  "    swap(a[j-1], a[j]); j = j - 1",
  "  mark a[0..i] sorted"
];
InsertionSort.prototype.codeMap = { pivot: 2, compare: 3, swap: 4, markSorted: 5 };
InsertionSort.prototype.sort = function (arr) {
  var n = arr.length, i, j;
  if (n > 0) this.markSorted(0);
  for (i = 1; i < n; i++) {
    this.markPivot(i);
    j = i;
    while (j > 0 && this.compare(arr, j - 1, j) > 0) {
      this.swap(arr, j - 1, j);
      j--;
    }
    this.markSorted(i);
  }
};

/* --- 快速排序（Lomuto 分区，取末元素为枢轴） --- */
var QuickSort = defineSort("quick", "QuickSort", "快速排序",
  "Lomuto 分区，取末元素为枢轴，递归切分左右子区间");
QuickSort.prototype._partition = function (arr, lo, hi) {
  var i = lo - 1, j;
  for (j = lo; j < hi; j++) {
    if (this.compare(arr, j, hi) < 0) {
      i++;
      if (i !== j) this.swap(arr, i, j);
    }
  }
  if (i + 1 !== hi) this.swap(arr, i + 1, hi);
  return i + 1;
};
QuickSort.prototype._qs = function (arr, lo, hi) {
  if (lo > hi) return;
  if (lo === hi) { this.markSorted(lo); return; }
  this.markPivot(hi);
  var p = this._partition(arr, lo, hi);
  this.markSorted(p);
  this._qs(arr, lo, p - 1);
  this._qs(arr, p + 1, hi);
};
QuickSort.prototype.code = [
  "quick(lo, hi):",
  "  if lo >= hi: return            // 0/1 个元素天然有序",
  "  pivot = a[hi]                  // Lomuto：取末元素为枢轴",
  "  i = lo - 1",
  "  for j = lo .. hi-1:",
  "    if a[j] < pivot:",
  "      i = i + 1; swap(a[i], a[j])",
  "  swap(a[i+1], a[hi])            // 枢轴归位",
  "  quick(lo, i); quick(i+2, hi)   // 递归两侧"
];
QuickSort.prototype.codeMap = { compare: 6, swap: 7, pivot: 3, markSorted: 8 };
QuickSort.prototype.sort = function (arr) {
  this._qs(arr, 0, arr.length - 1);
  for (var i = 0; i < arr.length; i++) this.markSorted(i);
};

/* --- 堆排序 --- */
var HeapSort = defineSort("heap", "HeapSort", "堆排序",
  "先建大顶堆，再不断把堆顶换到末尾并重新下沉");
HeapSort.prototype._siftDown = function (arr, start, end) {
  var root = start, child;
  while (2 * root + 1 <= end) {
    child = 2 * root + 1;
    if (child + 1 <= end && this.compare(arr, child, child + 1) < 0) child++;
    if (this.compare(arr, root, child) < 0) {
      this.swap(arr, root, child);
      root = child;
    } else {
      break;
    }
  }
};
HeapSort.prototype.code = [
  "// 阶段一：自底向上构建大顶堆",
  "for i = n/2-1 .. 0: siftDown(i, n-1)",
  "// 阶段二：逐个把堆顶换到末尾",
  "for end = n-1 .. 1:",
  "  swap(a[0], a[end])             // 堆顶（最大值）换到末尾",
  "  mark a[end] sorted",
  "  siftDown(0, end-1)             // 重新下沉堆顶",
  "",
  "siftDown(root, last):",
  "  child = 较大的那个孩子",
  "  if a[root] < a[child]: swap 并继续下沉，否则停止"
];
HeapSort.prototype.codeMap = { info: 1, compare: 11, swap: 11, markSorted: 6 };
// 展示代码含主循环与 siftDown 两部分，分两栏显示，分界正好是中间那个空行
HeapSort.prototype.codeColumns = 2;
HeapSort.prototype.codeSplit = 8;
HeapSort.prototype.sort = function (arr) {
  var n = arr.length, i, end;
  this.info("阶段一：自底向上构建大顶堆");
  for (i = Math.floor(n / 2) - 1; i >= 0; i--) this._siftDown(arr, i, n - 1);
  this.info("阶段二：逐个把堆顶交换到末尾并重新下沉");
  for (end = n - 1; end > 0; end--) {
    this.swap(arr, 0, end);
    this.markSorted(end);
    this._siftDown(arr, 0, end - 1);
  }
  this.markSorted(0);
};

/* =======================================================================
   2.1 比较类进阶排序
   ======================================================================= */

/* --- 归并排序（自顶向下递归 + 写回） --- */
var MergeSort = defineSort("merge", "MergeSort", "归并排序",
  "自顶向下对半拆分，再自底向上两两归并；需要额外辅助空间，但稳定且最坏也是 O(n log n)");
MergeSort.prototype._merge = function (arr, lo, mid, hi) {
  var i = lo, j = mid + 1, k, tmp = [];
  this.info("归并 [" + lo + ".." + mid + "] 与 [" + (mid + 1) + ".." + hi + "]");
  while (i <= mid && j <= hi) {
    if (this.compare(arr, i, j) <= 0) tmp.push(arr[i++]);
    else tmp.push(arr[j++]);
  }
  while (i <= mid) tmp.push(arr[i++]);
  while (j <= hi) tmp.push(arr[j++]);
  for (k = 0; k < tmp.length; k++) this.set(arr, lo + k, tmp[k]);
};
MergeSort.prototype._ms = function (arr, lo, hi) {
  if (lo >= hi) return;
  var mid = (lo + hi) >> 1;
  this._ms(arr, lo, mid);
  this._ms(arr, mid + 1, hi);
  this._merge(arr, lo, mid, hi);
};
MergeSort.prototype.code = [
  "mergeSort(lo, hi):",
  "  if lo >= hi: return",
  "  mid = (lo + hi) / 2",
  "  mergeSort(lo, mid)             // 先排左半",
  "  mergeSort(mid+1, hi)           // 再排右半",
  "  merge(lo, mid, hi)             // 归并两段有序区间",
  "",
  "merge(lo, mid, hi):",
  "  i = lo; j = mid+1; tmp = []",
  "  while i <= mid and j <= hi:",
  "    tmp.push(a[i] <= a[j] ? a[i++] : a[j++])",
  "  剩余元素补进 tmp，再整体写回 a[lo..hi]"
];
MergeSort.prototype.codeMap = { info: 8, compare: 11, set: 12, swap: 12 };
// 展示代码含两个方法（mergeSort / merge），分两栏显示，分界正好是中间那个空行
MergeSort.prototype.codeColumns = 2;
MergeSort.prototype.codeSplit = 7;
MergeSort.prototype.sort = function (arr) {
  this.info("自顶向下对半拆分成单元素，再自底向上两两归并成有序段");
  this._ms(arr, 0, arr.length - 1);
  for (var i = 0; i < arr.length; i++) this.markSorted(i);
};

/* --- 希尔排序（增量递减的插入排序） --- */
var ShellSort = defineSort("shell", "ShellSort", "希尔排序",
  "插入排序的改良：按递增的 gap 做「远距离」插入排序，逐步缩小 gap 到 1");
ShellSort.prototype.code = [
  "gap = n / 2                      // 初始大增量",
  "while gap > 0:",
  "  for i = gap .. n-1:            // 对每个增量子序列插入排序",
  "    j = i",
  "    while j >= gap and a[j-gap] > a[j]:",
  "      swap(a[j-gap], a[j]); j = j - gap",
  "  gap = gap / 2",
  "// 增量收敛到 1 后，最后一遍就是普通插入排序"
];
ShellSort.prototype.codeMap = { info: 1, pivot: 4, compare: 5, swap: 6 };
ShellSort.prototype.sort = function (arr) {
  var n = arr.length, gap, i, j;
  this.info("按增量把序列分成若干子序列分别做插入排序，增量逐步减半");
  for (gap = n >> 1; gap > 0; gap >>= 1) {
    this.info("当前增量 gap = " + gap);
    for (i = gap; i < n; i++) {
      j = i;
      while (j >= gap && this.compare(arr, j - gap, j) > 0) {
        this.swap(arr, j - gap, j);
        j -= gap;
      }
    }
  }
  for (i = 0; i < n; i++) this.markSorted(i);
};

/* --- 鸡尾酒排序（双向冒泡） --- */
var CocktailSort = defineSort("cocktail", "CocktailSort", "鸡尾酒排序",
  "双向冒泡：一趟从左到右、一趟从右到左，两端同时收窄，缓解「乌龟」问题");
CocktailSort.prototype.code = [
  "lo = 0; hi = n - 1",
  "while lo < hi:",
  "  for i = lo .. hi-1:            // 正向扫描：大值右移",
  "    if a[i] > a[i+1]: swap(a[i], a[i+1])",
  "  mark a[hi] sorted; hi = hi - 1",
  "  for i = hi .. lo+1:            // 反向扫描：小值左移",
  "    if a[i-1] > a[i]: swap(a[i-1], a[i])",
  "  mark a[lo] sorted; lo = lo + 1"
];
CocktailSort.prototype.codeMap = { compare: 4, swap: 4, markSorted: 5 };
CocktailSort.prototype.sort = function (arr) {
  var lo = 0, hi = arr.length - 1, i, swapped = true;
  this.info("从左到右把最大值冒到右端，再从右到左把最小值冒到左端，往复收窄");
  while (swapped && lo < hi) {
    swapped = false;
    for (i = lo; i < hi; i++) {
      if (this.compare(arr, i, i + 1) > 0) { this.swap(arr, i, i + 1); swapped = true; }
    }
    this.markSorted(hi);
    hi--;
    swapped = false;
    for (i = hi; i > lo; i--) {
      if (this.compare(arr, i - 1, i) > 0) { this.swap(arr, i - 1, i); swapped = true; }
    }
    this.markSorted(lo);
    lo++;
  }
  for (i = 0; i < arr.length; i++) this.markSorted(i);
};

/* --- 梳排序（按 1.3 收缩因子跳跃比较） --- */
var CombSort = defineSort("comb", "CombSort", "梳排序",
  "冒泡的改良：以 1.3 的收缩因子跳跃式比较，先干掉拖在尾部的小值");
CombSort.prototype.code = [
  "gap = n                          // 初始间隔 = 数组长度",
  "while gap > 1 or swapped:",
  "  gap = max(1, gap / 1.3)        // 按 1.3 收缩",
  "  swapped = false",
  "  for i = 0 .. n-1-gap:",
  "    if a[i] > a[i+gap]: swap(a[i], a[i+gap]); swapped = true"
];
CombSort.prototype.codeMap = { info: 2, compare: 6, swap: 6 };
CombSort.prototype.sort = function (arr) {
  var n = arr.length, gap = n, i, swapped = true;
  this.info("以 1.3 的收缩因子逐渐缩小比较间隔，先消除尾部小值（冒泡的改良）");
  while (gap > 1 || swapped) {
    gap = Math.floor(gap / 1.3);
    if (gap < 1) gap = 1;
    swapped = false;
    for (i = 0; i + gap < n; i++) {
      if (this.compare(arr, i, i + gap) > 0) { this.swap(arr, i, i + gap); swapped = true; }
    }
  }
  for (i = 0; i < n; i++) this.markSorted(i);
};

/* --- 地精排序（发现逆序就后退） --- */
var GnomeSort = defineSort("gnome", "GnomeSort", "地精排序",
  "遇到逆序就交换并后退一格，否则前进；实现最简单，平均 O(n²)");
GnomeSort.prototype.code = [
  "i = 0",
  "while i < n:",
  "  if i == 0 or a[i-1] <= a[i]:",
  "    i = i + 1                    // 顺序正确，前进",
  "  else:",
  "    swap(a[i-1], a[i])           // 逆序，交换并后退",
  "    i = i - 1"
];
GnomeSort.prototype.codeMap = { compare: 3, swap: 6 };
GnomeSort.prototype.sort = function (arr) {
  var n = arr.length, i = 0;
  this.info("遇到逆序对就交换并后退一格，否则前进一格（像地精整理花盆）");
  while (i < n) {
    if (i === 0 || this.compare(arr, i - 1, i) <= 0) i++;
    else { this.swap(arr, i - 1, i); i--; }
  }
  for (i = 0; i < n; i++) this.markSorted(i);
};

/* --- 二分插入排序（用二分查找定位插入点） --- */
var BinaryInsertionSort = defineSort("binary-insertion", "BinaryInsSort", "二分插入排序",
  "插入排序 + 二分查找定位插入点，比较次数降到 O(n log n)，但移动仍是 O(n²)");
BinaryInsertionSort.prototype.code = [
  "for i = 1 .. n-1:",
  "  cur = a[i]                     // 暂存待插入元素",
  "  lo = 0; hi = i",
  "  while lo < hi:                 // 二分查找插入点",
  "    mid = (lo + hi) / 2",
  "    if a[mid] <= cur: lo = mid+1 else hi = mid",
  "  if lo < i:",
  "    把 a[lo..i-1] 整体后移，再把 cur 放到 a[lo]",
  "  mark a[0..i] sorted"
];
BinaryInsertionSort.prototype.codeMap = { info: 1, compare: 6, set: 8, markSorted: 9 };
BinaryInsertionSort.prototype.sort = function (arr) {
  var n = arr.length, i, j, lo, hi, mid, cur;
  this.info("在已排序区用二分查找定位插入点，比较次数更少，但整体后移搬元素不变");
  if (n > 0) this.markSorted(0);
  for (i = 1; i < n; i++) {
    cur = arr[i];
    lo = 0; hi = i;
    while (lo < hi) {
      mid = (lo + hi) >> 1;
      if (this.compare(arr, mid, i) <= 0) lo = mid + 1;
      else hi = mid;
    }
    if (lo < i) {
      for (j = i; j > lo; j--) this.set(arr, j, arr[j - 1]);
      this.set(arr, lo, cur);
    }
    this.markSorted(i);
  }
};

/* --- 奇偶排序（相邻下标交替比较） --- */
var OddEvenSort = defineSort("oddeven", "OddEvenSort", "奇偶排序",
  "交替比较「奇-偶」与「偶-奇」相邻对，天然适合并行（GPU 排序网络常用）");
OddEvenSort.prototype.code = [
  "sorted = false",
  "while not sorted:                // 直到一整轮都没有交换",
  "  sorted = true",
  "  for i = 1, 3, 5 ...:           // 奇下标对 (i, i+1)",
  "    if a[i] > a[i+1]: swap(a[i], a[i+1]); sorted = false",
  "  for i = 0, 2, 4 ...:           // 偶下标对 (i, i+1)",
  "    if a[i] > a[i+1]: swap(a[i], a[i+1]); sorted = false"
];
OddEvenSort.prototype.codeMap = { info: 2, compare: 5, swap: 5 };
OddEvenSort.prototype.sort = function (arr) {
  var n = arr.length, i, sorted = false;
  this.info("交替扫描「奇下标的相邻对」与「偶下标的相邻对」，直到一整轮没有交换");
  while (!sorted) {
    sorted = true;
    for (i = 1; i + 1 < n; i += 2) {
      if (this.compare(arr, i, i + 1) > 0) { this.swap(arr, i, i + 1); sorted = false; }
    }
    for (i = 0; i + 1 < n; i += 2) {
      if (this.compare(arr, i, i + 1) > 0) { this.swap(arr, i, i + 1); sorted = false; }
    }
  }
  for (i = 0; i < n; i++) this.markSorted(i);
};

/* --- 循环排序（沿循环链一次性归位，写入次数最少） --- */
var CycleSort = defineSort("cycle", "CycleSort", "循环排序",
  "数出每个元素的最终位置，沿环一次性归位，是写入次数最少的原地排序");
CycleSort.prototype.code = [
  "for start = 0 .. n-2:",
  "  item = a[start]                // 取出要归位的元素",
  "  pos = start",
  "  for i = start+1 .. n-1:",
  "    if a[i] < item: pos = pos + 1  // 数出比它小的个数",
  "  跳过与 item 相等的重复值：pos = pos + 1",
  "  把 item 放进 a[pos]，取出原来的值继续沿环走",
  "  while pos != start: 以新 item 重新计算 pos 并放置"
];
CycleSort.prototype.codeMap = { compare: 5, set: 7 };
CycleSort.prototype.sort = function (arr) {
  var n = arr.length, start, i, pos, item, tmp;
  this.info("数出每个元素前面有多少个比它小的，得到最终位置，沿循环链把元素一次送回家");
  for (start = 0; start < n - 1; start++) {
    item = arr[start];
    pos = start;
    for (i = start + 1; i < n; i++) {
      if (this.compareVal(arr, i, item) < 0) pos++;
    }
    if (pos === start) continue;
    while (arr[pos] === item) pos++;
    tmp = arr[pos];
    this.set(arr, pos, item);
    item = tmp;
    while (pos !== start) {
      pos = start;
      for (i = start + 1; i < n; i++) {
        if (this.compareVal(arr, i, item) < 0) pos++;
      }
      while (arr[pos] === item) pos++;
      tmp = arr[pos];
      this.set(arr, pos, item);
      item = tmp;
    }
  }
  for (i = 0; i < n; i++) this.markSorted(i);
};

/* --- 煎饼排序（前缀翻转） --- */
var PancakeSort = defineSort("pancake", "PancakeSort", "煎饼排序",
  "只用「翻转前缀」这一种操作：每轮找最大值，两次翻转把它翻到末尾");
PancakeSort.prototype._flip = function (arr, k) {
  var i = 0, j = k;
  this.info("翻转前缀 [0.." + k + "]（把上面一叠煎饼整个翻面）");
  while (i < j) { this.swap(arr, i, j); i++; j--; }
};
PancakeSort.prototype.code = [
  "for cur = n-1 .. 1:",
  "  maxIdx = 未排序段最大值的下标",
  "  mark maxIdx                    // 标记本轮最大值",
  "  if maxIdx != cur:",
  "    翻转前缀 [0..maxIdx]          // 最大值翻到最前",
  "    翻转前缀 [0..cur]             // 再翻到末尾",
  "  每次翻转 = 首尾向中间成对 swap",
  "  mark a[cur] sorted"
];
PancakeSort.prototype.codeMap = { compare: 2, pivot: 3, swap: 7, markSorted: 8 };
PancakeSort.prototype.sort = function (arr) {
  var n = arr.length, cur, maxIdx, i;
  this.info("每轮找出未排序段的最大值，用两次前缀翻转把它翻到末尾");
  for (cur = n - 1; cur > 0; cur--) {
    maxIdx = 0;
    for (i = 1; i <= cur; i++) {
      if (this.compare(arr, i, maxIdx) > 0) maxIdx = i;
    }
    this.markPivot(maxIdx);
    if (maxIdx !== cur) {
      if (maxIdx !== 0) this._flip(arr, maxIdx);
      this._flip(arr, cur);
    }
    this.markSorted(cur);
  }
  if (n > 0) this.markSorted(0);
};

/* =======================================================================
   2.2 非比较类排序（依赖值域 / 分桶）
   ======================================================================= */

/* --- 计数排序 --- */
var CountingSort = defineSort("counting", "CountingSort", "计数排序",
  "非比较：统计每个值出现次数再做前缀和写回，时间复杂度 O(n + k)，k 为值域");
CountingSort.prototype.code = [
  "取 min、max，开计数数组 count[0..max-min]",
  "for v in a: count[v-min] += 1    // 统计每个值出现次数",
  "for i = 1 .. range-1: count[i] += count[i-1]  // 前缀和",
  "for i = n-1 .. 0:                // 从后向前保证稳定",
  "  count[a[i]-min] -= 1",
  "  out[count[a[i]-min]] = a[i]    // 写入输出数组",
  "把 out 整体拷回 a"
];
CountingSort.prototype.codeMap = { info: 1, set: 7 };
CountingSort.prototype.sort = function (arr) {
  var n = arr.length, i, min, max, range, count, out;
  if (n === 0) return;
  min = max = arr[0];
  for (i = 1; i < n; i++) {
    if (arr[i] < min) min = arr[i];
    if (arr[i] > max) max = arr[i];
  }
  range = max - min + 1;
  count = new Array(range);
  out = new Array(n);
  for (i = 0; i < range; i++) count[i] = 0;
  this.info("值域 " + min + " ~ " + max + "（共 " + range + " 个值），先统计每个值出现的次数");
  for (i = 0; i < n; i++) count[arr[i] - min]++;
  this.info("对计数数组做前缀和，得到每个值对应的输出区间");
  for (i = 1; i < range; i++) count[i] += count[i - 1];
  this.info("从后向前扫描原数组并按计数写回（保证相同值的相对次序不变）");
  for (i = n - 1; i >= 0; i--) {
    count[arr[i] - min]--;
    out[count[arr[i] - min]] = arr[i];
  }
  for (i = 0; i < n; i++) this.set(arr, i, out[i]);
  for (i = 0; i < n; i++) this.markSorted(i);
};

/* --- 基数排序（LSD，十进制） --- */
var RadixSort = defineSort("radix", "RadixSort", "基数排序",
  "非比较：按个位→十位→百位依次稳定分桶收集，O(d·(n + 10))，d 为最大位数");
RadixSort.prototype.code = [
  "求出最大值，确定最大位数 d",
  "for exp = 1, 10, 100 ...:        // 个位 → 十位 → 百位",
  "  按 (a[i] / exp) % 10 统计各桶大小",
  "  count[0..9] 做前缀和",
  "  for i = n-1 .. 0:              // 从后向前保证稳定",
  "    d = (a[i] / exp) % 10",
  "    --count[d]; tmp[count[d]] = a[i]",
  "  把 tmp 整体写回 a"
];
RadixSort.prototype.codeMap = { info: 2, set: 8 };
RadixSort.prototype.sort = function (arr) {
  var n = arr.length, i, max, exp, d, count, tmp;
  if (n === 0) return;
  max = arr[0];
  for (i = 1; i < n; i++) if (arr[i] > max) max = arr[i];
  tmp = new Array(n);
  for (exp = 1; Math.floor(max / exp) > 0; exp *= 10) {
    this.info("按 " + exp + " 位（" + (exp === 1 ? "个位" : exp === 10 ? "十位" : exp === 100 ? "百位" : exp + " 位") + "）稳定分桶");
    count = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (i = 0; i < n; i++) count[Math.floor(arr[i] / exp) % 10]++;
    for (i = 1; i < 10; i++) count[i] += count[i - 1];
    for (i = n - 1; i >= 0; i--) {
      d = Math.floor(arr[i] / exp) % 10;
      count[d]--;
      tmp[count[d]] = arr[i];
    }
    for (i = 0; i < n; i++) this.set(arr, i, tmp[i]);
  }
  for (i = 0; i < n; i++) this.markSorted(i);
};

/* --- 桶排序 --- */
var BucketSort = defineSort("bucket", "BucketSort", "桶排序",
  "非比较：按值域分到若干个桶，桶内各自排序再拼接，适合数据均匀分布");
BucketSort.prototype.code = [
  "bucketCount = max(2, 开根号(n))",
  "按值域把每个 a[i] 分到对应桶",
  "for each bucket:                 // 桶内元素少，用插入排序",
  "  桶内做一遍插入排序",
  "按桶的顺序把所有元素依次写回 a"
];
BucketSort.prototype.codeMap = { info: 2, set: 5 };
BucketSort.prototype.sort = function (arr) {
  var n = arr.length, i, j, b, k, min, max, span, bucketCount, buckets, bk, cur;
  if (n === 0) return;
  min = max = arr[0];
  for (i = 1; i < n; i++) {
    if (arr[i] < min) min = arr[i];
    if (arr[i] > max) max = arr[i];
  }
  bucketCount = Math.max(2, Math.floor(Math.sqrt(n)));
  span = (max - min + 1) / bucketCount;
  buckets = [];
  for (i = 0; i < bucketCount; i++) buckets.push([]);
  this.info("把 " + n + " 个元素按值域均匀分到 " + bucketCount + " 个桶里");
  for (i = 0; i < n; i++) {
    b = Math.min(bucketCount - 1, Math.floor((arr[i] - min) / span));
    buckets[b].push(arr[i]);
  }
  this.info("对每个桶内部各自做插入排序（桶内元素少，开销小）");
  for (b = 0; b < bucketCount; b++) {
    bk = buckets[b];
    for (i = 1; i < bk.length; i++) {
      cur = bk[i];
      j = i - 1;
      while (j >= 0 && bk[j] > cur) { bk[j + 1] = bk[j]; j--; }
      bk[j + 1] = cur;
    }
  }
  this.info("按桶的顺序把元素依次写回原数组，整体即有序");
  k = 0;
  for (b = 0; b < bucketCount; b++) {
    for (i = 0; i < buckets[b].length; i++) {
      this.set(arr, k, buckets[b][i]);
      k++;
    }
  }
  for (i = 0; i < n; i++) this.markSorted(i);
};

/* =======================================================================
   3. 算法注册表
   ======================================================================= */
var AlgorithmRegistry = {
  _map: {},
  _order: [],
  register: function (algo) {
    if (!this._map[algo.name]) this._order.push(algo.name);
    this._map[algo.name] = algo;
  },
  get: function (name) { return this._map[name]; },
  getAll: function () {
    var self = this;
    return this._order.map(function (n) { return self._map[n]; });
  },
  /* 实例化顺序 = defineSort 的声明顺序（左侧列表顺序即由此决定） */
  init: function () {
    var self = this;
    SORT_ALGORITHMS.forEach(function (Algo) { self.register(new Algo()); });
  }
};
