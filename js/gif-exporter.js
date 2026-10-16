"use strict";

/* =======================================================================
   10. GIF 导出（离屏渲染，不影响页面当前状态）
   ======================================================================= */
function loadScriptOnce(url) {
  return new Promise(function (resolve, reject) {
    var s = document.createElement("script");
    s.src = url;
    s.onload = function () { resolve(); };
    s.onerror = function () { reject(new Error("脚本加载失败: " + url)); };
    document.head.appendChild(s);
  });
}

function fetchText(url) {
  return fetch(url).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.text();
  });
}

function withTimeout(promise, ms, msg) {
  return Promise.race([
    promise,
    new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error(msg)); }, ms);
    })
  ]);
}

var GifExporter = {
  _libPromise: null,

  /* 加载 gif.js；worker 脚本取回后转成同源 Blob URL，绕开跨域 Worker 限制 */
  ensureLib: function () {
    if (window.GIF && window.__gifWorkerUrl) return Promise.resolve();
    if (this._libPromise) return this._libPromise;

    var tasks = [];
    if (!window.GIF) tasks.push(loadScriptOnce(CONFIG.gif.jsUrl));
    if (!window.__gifWorkerUrl) {
      tasks.push(fetchText(CONFIG.gif.workerUrl).then(function (txt) {
        var blob = new Blob([txt], { type: "application/javascript" });
        window.__gifWorkerUrl = URL.createObjectURL(blob);
      }));
    }
    this._libPromise = Promise.all(tasks).then(function () {
      if (!window.GIF) throw new Error("GIF 库未就绪");
    });
    return this._libPromise;
  },

  /* opts: { algo, originalData, speed, vizEl, fileBase, button } */
  export: function (opts) {
    var self = this;
    var btn = opts.button;
    if (btn.disabled) return;
    btn.disabled = true;
    var oldText = btn.textContent;
    btn.textContent = "PREPARING...";

    withTimeout(this.ensureLib(), CONFIG.gif.loadTimeout,
      "GIF 依赖加载超时（" + (CONFIG.gif.loadTimeout / 1000) + "s）")
      .then(function () { return self.render(opts, btn); })
      .then(function () {
        btn.textContent = oldText;
        btn.disabled = false;
      })
      .catch(function (err) {
        console.error(err);
        btn.textContent = "FAILED (see console)";
        btn.disabled = false;
        setTimeout(function () { btn.textContent = oldText; }, 2200);
      });
  },

  render: function (opts, btn) {
    return new Promise(function (resolve, reject) {
      try {
        var colors = readThemeColors();
        var algo = opts.algo;
        var cnLabel = algo.cnLabel;
        var enLabel = algo.label;
        var G = CONFIG.gif;

        // 步骤序列：尺寸估算与后续模拟共用
        var simSteps = algo.run(opts.originalData.slice());

        // ---- 画布尺寸：同展示区，受上限与内存预算约束 ----
        var rect = opts.vizEl.getBoundingClientRect();
        var W = Math.max(240, Math.round(rect.width));
        var H = Math.max(180, Math.round(rect.height));
        if (W > G.maxWidth) { H = Math.round(H * G.maxWidth / W); W = G.maxWidth; }
        if (H > G.maxHeight) { W = Math.round(W * G.maxHeight / H); H = G.maxHeight; }

        // gif.js 用 copy:true 会缓存每帧位图，按 4B/像素 反推安全分辨率
        var estFrames = G.introFrames + G.outroFrames + 1 +
                        Math.min(G.maxSortFrames, simSteps.length);
        var maxPixels = G.budgetBytes / 4 / estFrames;
        if (W * H > maxPixels) {
          var k = Math.sqrt(maxPixels / (W * H));
          W = Math.max(320, Math.round(W * k));
          H = Math.max(240, Math.round(H * k));
        }
        W = W % 2 === 0 ? W : W + 1;
        H = H % 2 === 0 ? H : H + 1;

        var canvas = document.createElement("canvas");
        canvas.width = W;
        canvas.height = H;
        var ctx = canvas.getContext("2d");

        // ---- 布局：三层嵌套间距 ----
        var imgMargin = 12;               // 边框距画布边缘
        var barMargin = 10;               // 柱子距边框
        var frameRect = { x: imgMargin, y: 54, w: W - imgMargin * 2, h: H - 54 - imgMargin };
        var barArea = {
          x: frameRect.x + barMargin,
          y: frameRect.y + barMargin,
          w: frameRect.w - barMargin * 2,
          h: frameRect.h - barMargin * 2
        };

        // ---- 离屏模拟状态：与页面状态完全隔离 ----
        var simState = { data: opts.originalData.slice(), sortedSet: {}, highlight: {} };
        function simStep(step) { StepEngine.apply(simState, step); }

        function drawTitleStatic() {
          ctx.save();
          ctx.textAlign = "center";
          ctx.textBaseline = "alphabetic";
          ctx.fillStyle = colors.green;
          ctx.shadowColor = colors.green;
          ctx.shadowBlur = 8;
          ctx.font = "bold 16px 'Microsoft YaHei',Consolas,monospace";
          ctx.fillText(cnLabel, W / 2, 24);
          ctx.shadowBlur = 4;
          ctx.fillStyle = colors.amber;
          ctx.font = "11px Consolas,monospace";
          ctx.fillText(enLabel, W / 2, 42);
          ctx.restore();
        }

        function drawSortFrame() {
          ctx.fillStyle = colors.bg;
          ctx.fillRect(0, 0, W, H);
          drawBarsOnCanvas(ctx, simState.data, simState.sortedSet, simState.highlight, barArea, colors, 1);
          drawCornerFrame(ctx, frameRect, colors.green, 0.7);
          drawTitleStatic();
        }

        // ---------- 建立编码器 ----------
        if (typeof window.GIF !== "function") { reject(new Error("GIF 构造函数不可用")); return; }
        var gif = new window.GIF({
          workers: G.workers,
          quality: G.quality,
          width: W,
          height: H,
          workerScript: window.__gifWorkerUrl
        });

        /* ===== 段 1：开头特效 ===== */
        for (var i = 0; i < G.introFrames; i++) {
          var t = i < 20 ? 0 : easeInOutCubic((i - 20) / (G.introFrames - 21));
          ctx.fillStyle = colors.bg;
          ctx.fillRect(0, 0, W, H);

          if (t > 0) {
            // 场景（柱 + 边框）渐显
            drawBarsOnCanvas(ctx, simState.data, simState.sortedSet, simState.highlight, barArea, colors, t);
            drawCornerFrame(ctx, frameRect, colors.green, 0.7 * t);
          }
          // 黑色遮罩从完全不透明渐隐到透明
          if (t < 1) {
            ctx.save();
            ctx.globalAlpha = 1 - t;
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
          }
          // 标题：中央大字号 → 边框上方小字号
          var cnSize = lerp(36, 16, t);
          var enSize = lerp(18, 11, t);
          var cyC = lerp(H * 0.5, 24, t);
          var cyE = lerp(H * 0.5 + enSize + 10, 42, t);
          ctx.save();
          ctx.textAlign = "center";
          ctx.textBaseline = "alphabetic";
          ctx.shadowColor = colors.green;
          ctx.shadowBlur = 18 * (1 - 0.55 * t);
          ctx.fillStyle = colors.green;
          ctx.font = "bold " + cnSize.toFixed(1) + "px 'Microsoft YaHei',Consolas,monospace";
          ctx.fillText(cnLabel, W / 2, cyC);
          ctx.shadowBlur = 8 * (1 - 0.55 * t);
          ctx.fillStyle = colors.amber;
          ctx.font = enSize.toFixed(1) + "px Consolas,monospace";
          ctx.fillText(enLabel, W / 2, cyE);
          ctx.restore();

          gif.addFrame(canvas, { delay: G.frameDelay, copy: true });
        }

        /* ===== 段 2：排序帧 ===== */
        var baseDelay = Math.max(G.frameDelayMin, CONFIG.delayBase - opts.speed * CONFIG.delayFactor);
        var totalSteps = simSteps.length;
        var perFrame = Math.max(1, Math.ceil(totalSteps / G.maxSortFrames));
        var sortDelay = Math.min(G.maxSortDelay, baseDelay * perFrame);

        drawSortFrame();
        gif.addFrame(canvas, { delay: sortDelay, copy: true });

        var idx = 0;
        while (idx < totalSteps) {
          for (var k = 0; k < perFrame && idx < totalSteps; k++) {
            simStep(simSteps[idx]);
            idx++;
          }
          drawSortFrame();
          gif.addFrame(canvas, { delay: sortDelay, copy: true });
        }

        /* ===== 段 3：结尾特效 ===== */
        var fw = new Fireworks(W, H);
        fw.burst(W / 2, H * 0.42);
        var finalData = simState.data.slice();
        var finalSorted = {};
        for (var fi = 0; fi < finalData.length; fi++) finalSorted[fi] = true;

        var statsLines = [
          "compares: " + algo.compareCount,
          "swaps: " + algo.swapCount,
          "total: " + (algo.compareCount + algo.swapCount)
        ];
        var timeLine = "总耗时: " + (sortDelay * (totalSteps / perFrame) / 1000).toFixed(3) + " s";

        for (var f = 0; f < G.outroFrames; f++) {
          var ft = f / (G.outroFrames - 1);

          // 背景：最终排序状态 + 半透明黑色遮罩（模拟虚化）
          ctx.fillStyle = colors.bg;
          ctx.fillRect(0, 0, W, H);
          drawBarsOnCanvas(ctx, finalData, finalSorted, {}, barArea, colors, 1);
          drawCornerFrame(ctx, frameRect, colors.green, 0.7);
          drawTitleStatic();
          ctx.fillStyle = "rgba(0,0,0,0.55)";
          ctx.fillRect(0, 0, W, H);

          // 烟花
          fw.w = W;
          fw.h = H;
          fw.step(2);
          fw.draw(ctx, false);

          // 文字动画
          var titleP = Math.min(1, ft / 0.3);
          drawAnimatedText(ctx, "大吉大利，恭喜吃鸡！", W / 2, H * 0.42, 32, "#ffd700", titleP, true);

          var s0 = 0.35, s1 = 0.6;
          if (ft >= s0) {
            var sp = Math.min(1, (ft - s0) / (s1 - s0));
            for (var li = 0; li < statsLines.length; li++) {
              var lineStart = li / statsLines.length;
              var lineEnd = (li + 1) / statsLines.length;
              var lp = (sp - lineStart) / (lineEnd - lineStart);
              if (lp < 0) lp = 0;
              if (lp > 1) lp = 1;
              if (lp > 0) {
                drawAnimatedText(ctx, statsLines[li], W / 2, H * 0.57 + li * 22, 18, colors.green, lp, false);
              }
            }
          }
          var t0 = 0.65, t1 = 0.85;
          if (ft >= t0) {
            var tp = Math.min(1, (ft - t0) / (t1 - t0));
            drawAnimatedText(ctx, timeLine, W / 2, H * 0.79, 22, colors.green, tp, true);
          }

          gif.addFrame(canvas, { delay: G.frameDelay, copy: true });
        }

        // ---------- 编码 ----------
        gif.on("progress", function (p) {
          btn.textContent = "ENCODING " + Math.round(p * 100) + "%";
        });
        gif.on("finished", function (blob) {
          var url = URL.createObjectURL(blob);
          var a = document.createElement("a");
          var ts = new Date();
          function p2(n) { return n < 10 ? "0" + n : "" + n; }
          var stamp = ts.getFullYear() + p2(ts.getMonth() + 1) + p2(ts.getDate()) +
            "-" + p2(ts.getHours()) + p2(ts.getMinutes()) + p2(ts.getSeconds());
          a.href = url;
          a.download = opts.fileBase + "-" + stamp + ".gif";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
          resolve();
        });

        gif.render();

      } catch (e) {
        reject(e);
      }
    });
  }
};
