"use strict";

/* =======================================================================
   15. 启动
   ======================================================================= */
function boot() {
  V = new Visualizer();
  V.init();
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
