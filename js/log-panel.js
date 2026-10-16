"use strict";

/* =======================================================================
   7. 日志面板
   ======================================================================= */
function LogPanel(bodyEl, copyBtn) {
  this.body = bodyEl;
  this.copyBtn = copyBtn;
}

LogPanel.prototype.clear = function () {
  this.body.innerHTML = "";
};

/* stepNo 为 0 表示这不是某一步的日志（例如运行头部信息） */
LogPanel.prototype.append = function (type, msg, stepNo) {
  var line = document.createElement("div");
  line.className = "ln " + type;
  line.textContent = "[" + stepNo + "] " + msg;
  this.body.appendChild(line);
  this.body.scrollTop = this.body.scrollHeight;
  // 控制行数，避免长序列把内存撑爆
  while (this.body.childNodes.length > CONFIG.maxLogLines) {
    this.body.removeChild(this.body.firstChild);
  }
};

LogPanel.prototype.copy = function () {
  var self = this;
  var text = this.body.innerText || this.body.textContent || "";
  function done() {
    var old = self.copyBtn.textContent;
    self.copyBtn.textContent = "COPIED!";
    setTimeout(function () { self.copyBtn.textContent = old; }, 1200);
  }
  function fallback() {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
    done();
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, fallback);
  } else {
    fallback();
  }
};
