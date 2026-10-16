"use strict";

/* =======================================================================
   11. 代码栏
   把算法自带的「展示版代码」渲染成带行号的列表，并高亮当前执行到的那一行。

   代码来源是算法自己声明的短行伪代码（algorithms.js 里的 prototype.code），
   不读真实源码文件 —— 这样 file:// 下不需要 fetch（不会被 CORS 挡），
   行也足够短，不需要横向滚动。
   ======================================================================= */
var CODE_COLLAPSE_KEY = "sortviz.code.collapsed";

function CodePanel(rootEl, bodyEl, toggleBtn) {
  this.root = rootEl;
  this.body = bodyEl;
  this.toggleBtn = toggleBtn;
  this.lines = [];        // 每行对应的 DOM
  this.cur = 0;           // 当前高亮的行号（1 起，0 表示没有）
  this.algoName = null;   // 已渲染的算法，避免每步重建 DOM
  this.collapsed = false;
}

/* 渲染某个算法的展示代码；算法没变就直接返回，不重建 DOM。
   代码长（包含多个方法）的算法可以自己声明分两栏：
     Algo.prototype.codeColumns = 2;
     Algo.prototype.codeSplit = 7;    // 左栏包含到第 7 行
   分栏是固定声明，不随窗口宽度变化 —— 避免拖窗口时布局跳来跳去。 */
CodePanel.prototype.render = function (algo) {
  if (!algo) { this.clear(); return; }
  if (this.algoName === algo.name) return;

  this.algoName = algo.name;
  this.cur = 0;
  this.lines = [];
  this.body.innerHTML = "";

  var code = algo.code || [];
  if (!code.length) {
    var empty = document.createElement("div");
    empty.className = "cempty";
    empty.textContent = "该算法还没有提供展示代码";
    this.body.appendChild(empty);
    return;
  }

  var split = this.columnSplit(algo);        // 0 表示单栏
  var wrap = document.createElement("div");
  wrap.className = "codecols";

  var colCount = split ? 2 : 1;
  for (var c = 0; c < colCount; c++) {
    var col = document.createElement("div");
    col.className = "ccol";
    var from = c === 0 ? 0 : split;
    var to = c === 0 ? (split || code.length) : code.length;
    for (var i = from; i < to; i++) {
      col.appendChild(this.buildLine(code[i], i + 1));
    }
    wrap.appendChild(col);
  }
  this.body.appendChild(wrap);
};

/* 左栏包含到第几行（1 起）。返回 0 表示不分栏。
   声明了 codeColumns = 2 才分；codeSplit 没写或不合法时按中间拆。 */
CodePanel.prototype.columnSplit = function (algo) {
  if (algo.codeColumns !== 2) return 0;
  var n = (algo.code || []).length;
  var s = algo.codeSplit;
  if (!(s >= 1 && s < n)) s = Math.ceil(n / 2);
  return s;
};

/* 构造一行（行号 + 代码），登记到 this.lines —— 下标与行号对齐（lines[0] 是第 1 行） */
CodePanel.prototype.buildLine = function (text, lineNo) {
  var row = document.createElement("div");
  // 以 // 开头的行当作结构注释，压暗显示
  row.className = "cln" + (/^\s*\/\//.test(text) ? " cm" : "");

  var no = document.createElement("span");
  no.className = "no";
  no.textContent = lineNo;

  var tx = document.createElement("span");
  tx.className = "tx";
  tx.textContent = text || " ";

  row.appendChild(no);
  row.appendChild(tx);
  this.lines[lineNo - 1] = row;
  return row;
};

/* 高亮第 line 行（1 起）。传 0 表示「这一步没有对应行」，保持原样不清屏 ——
   否则遇到 INFO 这类没有映射的步骤会疯狂闪烁。需要清屏请用 clear()。 */
CodePanel.prototype.highlight = function (line) {
  if (!line) return;
  if (!(line >= 1 && line <= this.lines.length)) return;
  if (line === this.cur) return;

  if (this.cur) this.lines[this.cur - 1].classList.remove("on");
  this.cur = line;
  var el = this.lines[line - 1];
  el.classList.add("on");
  this.keepVisible(el);
};

CodePanel.prototype.clear = function () {
  if (this.cur && this.lines[this.cur - 1]) this.lines[this.cur - 1].classList.remove("on");
  this.cur = 0;
};

/* 让高亮行留在可视区内。手算而不用 scrollIntoView ——
   后者可能连带滚动整个页面。 */
CodePanel.prototype.keepVisible = function (el) {
  var body = this.body;
  var top = el.offsetTop;
  var bottom = top + el.offsetHeight;
  if (top < body.scrollTop) {
    body.scrollTop = Math.max(0, top - el.offsetHeight);
  } else if (bottom > body.scrollTop + body.clientHeight) {
    body.scrollTop = bottom - body.clientHeight + el.offsetHeight;
  }
};

/* 折叠：只收起内容区，标题栏留着（折叠按钮就在标题栏里，仍然点得到） */
CodePanel.prototype.setCollapsed = function (collapsed) {
  this.collapsed = !!collapsed;
  this.root.classList.toggle("collapsed", this.collapsed);
  this.toggleBtn.textContent = this.collapsed ? "SHOW" : "HIDE";
};

CodePanel.prototype.toggle = function () {
  this.setCollapsed(!this.collapsed);
  try {
    if (window.localStorage) {
      window.localStorage.setItem(CODE_COLLAPSE_KEY, this.collapsed ? "1" : "0");
    }
  } catch (e) { /* 隐私模式等场景下 localStorage 不可用，忽略即可 */ }
};

/* 恢复上次的折叠状态 */
CodePanel.prototype.restore = function () {
  var saved = null;
  try {
    saved = window.localStorage ? window.localStorage.getItem(CODE_COLLAPSE_KEY) : null;
  } catch (e) { /* 同上 */ }
  this.setCollapsed(saved === "1");
};
