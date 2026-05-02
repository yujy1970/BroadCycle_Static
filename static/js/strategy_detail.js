// BroadCycle: Strategy detail page (Canvas)
// - draws Index vs Equity on same time axis (index is display-normalized to equity start when sharing Y axis)
// - draws indicator panel from MoneyGrow columns (RSI/Med/Deri/Accu/ST)
// - shows Backtest Results (Account_*.txt) in a closable modal
(function () {
  const cfg = window.BC_CFG || {};
  const $ = (id) => document.getElementById(id);

  const DPR_CAP = 2;
  const MAX_POINTS_DEFAULT = 800;
  const PLOT_LEFT = 54;
  const PLOT_TOP_MAIN = 18;
  const PLOT_TOP_IND = 16;
  const PLOT_RIGHT_PAD = 86;
  const PLOT_BOTTOM_MAIN = 26;
  const PLOT_BOTTOM_IND = 14;

  async function fetchText(path) {
    const r = await fetch(path, { cache: "no-store" });
    if (!r.ok) throw new Error(`Failed to fetch ${path}: ${r.status}`);
    return await r.text();
  }

  function extractLastPctOrNumber(s) {
    const txt = String(s || "");
    const pcts = [...txt.matchAll(/([+-]?\d+(?:\.\d+)?)\s*%/g)].map(x => Number(x[1]));
    if (pcts.length) return pcts[pcts.length - 1];
    const nums = [...txt.matchAll(/([+-]?\d+(?:\.\d+)?)/g)].map(x => Number(x[1]));
    return nums.length ? nums[nums.length - 1] : NaN;
  }
  function sanitizePeriodText(s) {
    const txt = String(s || "").trim();
    if (!txt) return "";
    const ds = [...txt.matchAll(/(\d{4}-\d{2}-\d{2})/g)].map(m => m[1]);
    if (ds.length >= 2) return `${ds[0]} → ${ds[1]}`;
    if (ds.length === 1) return ds[0];
    return txt;
  }

  function parseAccountMetrics(text) {
    const raw = String(text || "").replace(/\r/g, "");
    const out = {
      initialCapital: NaN,
      accountTotal: NaN,
      targetCagr: NaN,
      targetMaxDD: NaN,
      targetMaxDDPeriod: "",
      equityCagr: NaN,
      equityMaxDD: NaN,
      equityMaxDDPeriod: ""
    };
    const lines = raw.split(/\n+/).map(s => String(s||"").trim()).filter(Boolean);
    const lineMap = new Map();
    for (const ln of lines) {
      const m = ln.match(/^([^:]+):\s*(.*)$/);
      if (!m) continue;
      const key = String(m[1] || "").trim().toLowerCase().replace(/\s+/g, ' ');
      lineMap.set(key, String(m[2] || "").trim());
    }
    const get = (...labels) => {
      for (const lb of labels) {
        const k = String(lb || "").trim().toLowerCase().replace(/\s+/g, ' ');
        if (lineMap.has(k)) return lineMap.get(k);
      }
      return "";
    };
    const forceNeg = (v) => Number.isFinite(v) ? (v > 0 ? -Math.abs(v) : v) : NaN;
    const num = (s) => {
      const v = extractLastPctOrNumber(s);
      return Number.isFinite(v) ? v : NaN;
    };

    const ic = get('initial capital');
    if (ic) out.initialCapital = Number(String(ic).replace(/,/g, '').match(/[+-]?[\d.]+/)?.[0] || NaN);
    const at = get('account total');
    if (at) out.accountTotal = Number(String(at).replace(/,/g, '').match(/[+-]?[\d.]+/)?.[0] || NaN);

    const tc = get('target annualized return (cagr)', 'target cagr');
    if (tc) out.targetCagr = num(tc);
    const tm = get('target max drawdown', 'target maximum drawdown', 'target maxdd');
    if (tm) out.targetMaxDD = forceNeg(num(tm));
    const tmp = get('target max drawdown period', 'target maximum drawdown period', 'target maxdd period');
    if (tmp) out.targetMaxDDPeriod = sanitizePeriodText(tmp);

    const ec = get('annualized return', 'cagr');
    if (ec) out.equityCagr = num(ec);
    const em = get('max drawdown', 'maximum drawdown', 'maxdd');
    if (em) out.equityMaxDD = forceNeg(num(em));
    const emp = get('max drawdown period', 'maximum drawdown period', 'maxdd period');
    if (emp) out.equityMaxDDPeriod = sanitizePeriodText(emp);
    return out;
  }
  function parseRuntimeParams(tradeProcessText){
    const out = {};
    const text = String(tradeProcessText||"");
    const lines = text.split(/\r?\n/);
    let inRuntime = false;
    for(const ln0 of lines){
      const ln = ln0.trim();
      if(!ln) continue;
      if(ln.includes("=== Parameters") && ln.toLowerCase().includes("runtime")) { inRuntime = true; continue; }
      if(inRuntime && ln.startsWith("===")) break;
      if(!inRuntime) continue;
      // accept formats like "MedMax1=-99.0" or "MedMax1 : -99.0"
      const m = ln.match(/^(MedMax1|MedMax2|Accu1|Accu2|Deri1|Deri2|Trend1|Trend2)\s*[:=]\s*([\-0-9.]+)/i);
      if(m){
        out[m[1]] = Number(m[2]);
      }
    }
    return out;
  }

  function drawThreshold(ctx, x0, y0, w, h, yMin, yMax, lower, upper){
    // Draw red threshold lines and shade sell zones.
    ctx.save();
    if(!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMax === yMin){ ctx.restore(); return; }
    if(Number.isFinite(upper) && upper !== 99.0){
      const ty = y0 + h - ((upper - yMin) / (yMax - yMin)) * h;
      // shade above
      ctx.fillStyle = "rgba(255,0,0,0.10)";
      ctx.fillRect(x0, y0, w, Math.max(0, ty - y0));
      // line
      ctx.strokeStyle = "rgba(220,0,0,0.85)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, ty);
      ctx.lineTo(x0 + w, ty);
      ctx.stroke();
    }
    if(Number.isFinite(lower) && lower !== -99.0){
      const ty = y0 + h - ((lower - yMin) / (yMax - yMin)) * h;
      // shade below
      ctx.fillStyle = "rgba(255,0,0,0.10)";
      ctx.fillRect(x0, ty, w, Math.max(0, (y0 + h) - ty));
      ctx.strokeStyle = "rgba(220,0,0,0.85)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, ty);
      ctx.lineTo(x0 + w, ty);
      ctx.stroke();
    }
    ctx.restore();
  }



  function ensureCanvasSize(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    const rect = canvas.getBoundingClientRect();
    const cs = window.getComputedStyle(canvas);
    const cssW = parseFloat(cs.width) || 0;
    const cssH = parseFloat(cs.height) || 0;

    // Prefer actual rendered size, fallback to computed style, then parent, then defaults
    const cw = Math.max(
      10,
      rect.width || cssW || canvas.clientWidth || (canvas.parentElement ? canvas.parentElement.clientWidth : 0) || 900
    );
    const ch = Math.max(
      10,
      rect.height || cssH || canvas.clientHeight || (canvas.parentElement ? canvas.parentElement.clientHeight : 0) || 520
    );

    const targetW = Math.floor(cw * dpr);
    const targetH = Math.floor(ch * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: cw, h: ch };
  }

  function minmax(arr) {
    let mn = Infinity,
      mx = -Infinity;
    for (const v of arr) {
      if (v == null || !Number.isFinite(v)) continue;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    if (!Number.isFinite(mn) || !Number.isFinite(mx)) return [0, 1];
    if (mn === mx) return [mn - 1, mx + 1];
    return [mn, mx];
  }

  function formatNum(x) {
    if (x == null || !Number.isFinite(x)) return "N/A";
    if (Math.abs(x) >= 1000) return x.toFixed(0);
    if (Math.abs(x) >= 10) return x.toFixed(2);
    return x.toFixed(4);
  }

  function getPlotRect(kind, W, H) {
    const x0 = PLOT_LEFT;
    const y0 = kind === "indicator" ? PLOT_TOP_IND : PLOT_TOP_MAIN;
    const rightPad = PLOT_RIGHT_PAD;
    const bottomPad = kind === "indicator" ? PLOT_BOTTOM_IND : PLOT_BOTTOM_MAIN;
    const plotW = Math.max(100, W - x0 - rightPad);
    const plotH = Math.max(100, H - y0 - bottomPad);
    return { x0, y0, plotW, plotH, rightPad, bottomPad };
  }

  function splitRightLabel(text) {
    const raw = String(text || "").trim();
    if (!raw) return [""];
    if (/^Strategic\s+Equity$/i.test(raw)) return ["Strategic", "Equity"];
    return [raw];
  }

  function drawRightLabels(ctx, labels, x, y0, plotH) {
    const items = labels.map(l => {
      const lines = splitRightLabel(l.text);
      const lineHeight = 13;
      const blockHeight = lineHeight * lines.length;
      return { ...l, lines, lineHeight, blockHeight, y: l.y };
    }).sort((a,b)=>a.y-b.y);

    for (let i = 1; i < items.length; i++) {
      const minGap = 6 + (items[i-1].blockHeight + items[i].blockHeight) / 2;
      if (items[i].y - items[i-1].y < minGap) items[i].y = items[i-1].y + minGap;
    }
    const minY = y0 + 8;
    const maxY = y0 + plotH - 8;
    for (let i = items.length - 1; i >= 0; i--) {
      const half = items[i].blockHeight / 2;
      if (items[i].y + half > maxY) items[i].y = maxY - half;
      if (items[i].y - half < minY) items[i].y = minY + half;
      if (i < items.length - 1) {
        const next = items[i+1];
        const minGap = 6 + (items[i].blockHeight + next.blockHeight) / 2;
        if (next.y - items[i].y < minGap) items[i].y = next.y - minGap;
      }
    }

    ctx.font = "12px system-ui, -apple-system, Segoe UI, Arial";
    ctx.textBaseline = "middle";
    for (const lab of items) {
      const isEq = /^Strategic\s+Equity$/i.test(String(lab.text||"").trim());
      ctx.fillStyle = isEq ? "rgba(220,0,0,0.90)" : lab.color;
      const firstY = lab.y - ((lab.lines.length - 1) * lab.lineHeight) / 2;
      lab.lines.forEach((line, idx) => {
        ctx.fillText(line, x, firstY + idx * lab.lineHeight);
      });
    }
  }

  
  function yearBreakIndices(dates){
    const out=[];
    if(!Array.isArray(dates) || !dates.length) return out;
    let lastYear = null;
    for(let i=0;i<dates.length;i++){
      const d=String(dates[i]||"");
      const y = d.slice(0,4);
      if(y && y!==lastYear){
        out.push(i);
        lastYear = y;
      }
    }
    return out;
  }

  function drawYearGrid(ctx, dates, x0, y0, w, h){
    const breaks = yearBreakIndices(dates);
    if(breaks.length<=1) return;
    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.fillStyle = "rgba(0,0,0,0.60)";
    ctx.font = "11px system-ui, -apple-system, Segoe UI, Arial";
    const n = dates.length;
    function xAt(i){ return x0 + (n<=1 ? 0 : (i/(n-1))*w); }
    for(const i of breaks){
      const x = xAt(i);
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y0+h);
      ctx.stroke();
      const y = String(dates[i]||"").slice(0,4);
      const mobile = (window.innerWidth || 9999) <= 640;
      const label = (y && y.length===4) ? (mobile ? y.slice(2,4) : y) : String(dates[i]||"").slice(0, mobile ? 2 : 4);
      ctx.fillText(label, x+2, y0+h+14);
    }
    ctx.restore();
  }

function drawAxes(ctx, x0, y0, w, h, yMin, yMax) {
    // frame
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, y0, w, h);

    // y ticks
    const ticks = 5;
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Arial";
    for (let i = 0; i <= ticks; i++) {
      const t = i / ticks;
      const y = y0 + h - t * h;
      const v = yMin + t * (yMax - yMin);
      ctx.strokeStyle = "rgba(0,0,0,0.10)";
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + w, y);
      ctx.stroke();
      ctx.fillText(formatNum(v), x0 - 8 - ctx.measureText(formatNum(v)).width, y + 4);
    }
  }

  function drawSeries(ctx, x0, y0, w, h, ys, yMin, yMax, color, lineWidth) {
    ctx.beginPath();
    let started = false;
    const denom = Math.max(1, ys.length - 1);
    for (let i = 0; i < ys.length; i++) {
      const v = ys[i];
      if (v == null || !Number.isFinite(v)) continue;
      const x = x0 + (i / denom) * w;
      const y = y0 + h - ((v - yMin) / (yMax - yMin)) * h;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }


  function drawDot(ctx, x, y, color, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Detect arc-top (local maxima with prominence) and escape point (drop after top)
  function detectArcTopAndEscape(ys, yMin, yMax) {
    const n = Array.isArray(ys) ? ys.length : 0;
    if (n < 30) return [];
    const range = Math.max(1e-9, (yMax - yMin));
    const w = 10;                          // local window
    const prom = 0.06 * range;             // required prominence
    const dropAbs = 0.08 * range;          // escape drop absolute
    const dropRel = 0.06;                  // escape drop relative

    const peaks = [];
    for (let i = w; i < n - w; i++) {
      const v = ys[i];
      if (v == null || !Number.isFinite(v)) continue;
      let leftMin = Infinity, rightMin = Infinity, localMax = -Infinity;
      for (let j = i - w; j <= i + w; j++) {
        const u = ys[j];
        if (u == null || !Number.isFinite(u)) continue;
        if (u > localMax) localMax = u;
        if (j < i && u < leftMin) leftMin = u;
        if (j > i && u < rightMin) rightMin = u;
      }
      if (localMax !== v) continue; // must be max in window
      if (!Number.isFinite(leftMin) || !Number.isFinite(rightMin)) continue;
      if ((v - leftMin) < prom) continue;
      if ((v - rightMin) < prom) continue;
      // avoid clustering: keep only the highest within last 2w
      const last = peaks.length ? peaks[peaks.length - 1] : null;
      if (last && (i - last.i) < (2 * w)) {
        if (v > last.v) peaks[peaks.length - 1] = { i, v };
      } else {
        peaks.push({ i, v });
      }
    }

    const out = [];
    for (const p of peaks) {
      // escape: first point after peak where drop meets threshold
      let esc = null;
      const thrAbs = p.v - dropAbs;
      const thrRel = p.v * (1 - dropRel);
      const thr = Math.min(thrAbs, thrRel);
      for (let j = p.i + 1; j < n; j++) {
        const u = ys[j];
        if (u == null || !Number.isFinite(u)) continue;
        if (u <= thr) { esc = j; break; }
      }
      out.push({ top: p.i, escape: esc });
    }
    return out;
  }


  // ----- Worker pipeline -----
  async function buildDataSingle(indexCsvText, moneyGrowText) {
    const worker = new Worker("/static/js/strategy_worker.js");
    const maxPoints = cfg.maxPoints || MAX_POINTS_DEFAULT;
    return await new Promise((resolve, reject) => {
      worker.onmessage = (ev) => {
        const msg = ev.data;
        worker.terminate();
        if (msg && msg.ok) resolve(msg.data);
        else reject(new Error(msg && msg.err ? msg.err : "Worker failed"));
      };
      worker.onerror = (e) => {
        worker.terminate();
        reject(e);
      };
      worker.postMessage({ indexCsvText, moneyGrowText, maxPoints });
    });
  }

  async function buildDataCombined(indexCsvTexts, moneyGrowText) {
    const worker = new Worker("/static/js/strategy_worker.js");
    const maxPoints = cfg.maxPoints || MAX_POINTS_DEFAULT;
    return await new Promise((resolve, reject) => {
      worker.onmessage = (ev) => {
        const msg = ev.data;
        worker.terminate();
        if (msg && msg.ok) resolve(msg.data);
        else reject(new Error(msg && msg.err ? msg.err : "Worker failed"));
      };
      worker.onerror = (e) => {
        worker.terminate();
        reject(e);
      };
      worker.postMessage({ indexCsvTexts, moneyGrowText, maxPoints });
    });
  }

  function setStatus(text) {
    const el = $("bcStatus");
    if (el) el.textContent = text;
  }
  function setCursorInfo(text) {
    const el = $("bcCursorInfo");
    if (el) el.textContent = text;
  }

  // global cursor state
  let cursorActive = false;
  let cursorIdx = -1;

  function renderMain(data) {
    const canvas = $("mainCanvas");
    const { ctx, w: W, h: H } = ensureCanvasSize(canvas);

    // background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    const { x0, y0, plotW, plotH } = getPlotRect("main", W, H);

    const combined = (cfg.mode === "combined" || cfg._comboCombined) && Array.isArray(data.idxs);

    const series = [];
    const showIndex = $("chkIndex") ? $("chkIndex").checked : true;
    const showEq = $("chkEquity") ? $("chkEquity").checked : true;
    const showCmp = $("chkCmpIndex") ? $("chkCmpIndex").checked : true;

    // Equity is always raw
    if (showEq && Array.isArray(data.eq)) {
      series.push({ name: cfg.equityLabel || "Equity", ys: data.eq, color: "rgba(220,0,0,0.90)", width: 2, rightLabel: cfg.rightLabelEquity || (cfg.equityLabel || "Equity") });
    }

    // Index / indices: for display, normalize to equity start if equity shown (keeps both on same axis without flattening one)
    const eq0 = Array.isArray(data.eq) && data.eq.length ? data.eq.find((v) => Number.isFinite(v)) : NaN;

    function normalizeIndex(idxArr) {
      if (!Array.isArray(idxArr) || !idxArr.length) return idxArr;
      const firstIdx = idxArr.find((v) => Number.isFinite(v));
      if (!Number.isFinite(firstIdx) || !Number.isFinite(eq0)) return idxArr;
      const k = eq0 / firstIdx;
      return idxArr.map((v) => (Number.isFinite(v) ? v * k : v));
    }

    if (combined) {
      const colors = [
        "rgba(0,90,255,0.85)",
        "rgba(0,150,0,0.85)",
        "rgba(160,0,160,0.85)",
        "rgba(255,140,0,0.88)",
        "rgba(0,0,0,0.80)",
      ];

      const defs = Array.isArray(cfg.indices) ? cfg.indices : [];
      const labelAt = (i) => {
        const it = defs[i];
        if (typeof it === "string") return it;
        if (it && typeof it === "object") return it.label || it.key || it.name || `Index${i + 1}`;
        return `Index${i + 1}`;
      };

      // ETF compare mode: idxs[0]=Index, idxs[1]=ETF (allow toggling separately)
      if (cfg.compareMode === "etf" && Array.isArray(data.idxs) && data.idxs.length >= 2) {
        if (showCmp) {
          series.push({ name: cfg.cmpIndexLabel || labelAt(0) || "Index", ys: normalizeIndex(data.idxs[0]), color: colors[0], width: 1.6, rightLabel: cfg.rightLabelIndex || (cfg.cmpIndexLabel || 'Index') });
        }
        if (showIndex) {
          series.push({ name: cfg.primaryIndexLabel || labelAt(1) || "ETF", ys: normalizeIndex(data.idxs[1]), color: colors[1], width: 1.8, rightLabel: cfg.rightLabelEtf || (cfg.primaryIndexLabel || 'ETF') });
        }
      } else if (showIndex) {
        for (let i = 0; i < data.idxs.length; i++) {
          const ys = normalizeIndex(data.idxs[i]);
          series.push({ name: labelAt(i), ys, color: colors[i % colors.length], width: 1.6, rightLabel: labelAt(i) });
        }
      }
    } else if (showIndex && Array.isArray(data.idx)) {
      // single index or synthetic portfolio
      const name = (cfg.mode === "combo_example") ? (cfg._comboLabel || "Portfolio") : (cfg.singleIndexLabel || "Index");
      series.push({ name, ys: normalizeIndex(data.idx), color: "rgba(0,90,255,0.85)", width: 1.9, rightLabel: cfg.rightLabelIndex || name });

        // combo_example: overlay component indices (normalized) with individual toggles
        if (cfg.mode === "combo_example" && Array.isArray(data.comboComponents)) {
          const compColors = [
            "rgba(0,150,0,0.85)",
            "rgba(160,0,160,0.85)",
            "rgba(255,140,0,0.88)",
            "rgba(0,0,0,0.80)"
          ];
          const want = [
            { id: "chkNasdaq", key: "NASDAQ100" },
            { id: "chkChina",  key: "CSI300" },
            { id: "chkGold",   key: "GOLD" }
          ];
          for (let i = 0; i < want.length; i++) {
            const w = want[i];
            const el = $(w.id);
            const on = el ? el.checked : true;
            if (!on) continue;
            const comp = data.comboComponents.find(c => String(c.key).toUpperCase() === String(w.key).toUpperCase())
              || data.comboComponents[i];
            if (!comp || !Array.isArray(comp.ys)) continue;
            series.push({ name: comp.label || comp.key || w.key, ys: normalizeIndex(comp.ys), color: compColors[i % compColors.length], width: 1.6 });
          }
        }
      }

    // y range from selected display series
    const all = series.flatMap((s) => s.ys).filter((v) => v != null && Number.isFinite(v));
    const [mn, mx] = minmax(all);
    drawAxes(ctx, x0, y0, plotW, plotH, mn, mx);
    drawYearGrid(ctx, data.dates, x0, y0, plotW, plotH);
    for (const s of series) drawSeries(ctx, x0, y0, plotW, plotH, s.ys, mn, mx, s.color, s.width);

    // right-side curve labels
    const endLabels = [];
    for (const s of series) {
      let idx = -1;
      for (let i = (s.ys||[]).length - 1; i >= 0; i--) { if (Number.isFinite(s.ys[i])) { idx = i; break; } }
      if (idx < 0) continue;
      const v = s.ys[idx];
      const y = y0 + plotH - ((v - mn) / (mx - mn)) * plotH;
      endLabels.push({ y, text: s.rightLabel || s.name, color: s.color });
    }
    drawRightLabels(ctx, endLabels, x0 + plotW + 8, y0, plotH);

    // title centered
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.font = "13px system-ui, -apple-system, Segoe UI, Arial";
    const title = `${cfg.singleIndexLabel || cfg.cmpIndexLabel || "Target"} vs ${cfg.equityLabel || "Equity"}`;
    const tw = ctx.measureText(title).width;
    ctx.fillText(title, x0 + (plotW - tw) / 2, 14);

    // cursor
    if (cursorActive && cursorIdx >= 0 && cursorIdx < (data.dates ? data.dates.length : 0)) {
      const denom = Math.max(1, (data.dates.length || 1) - 1);
      const cx = x0 + (cursorIdx / denom) * plotW;
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, y0);
      ctx.lineTo(cx, y0 + plotH);
      ctx.stroke();
    }
  }

  function renderIndicator(data) {
    const canvas = $("indicatorCanvas");
    const { ctx, w: W, h: H } = ensureCanvasSize(canvas);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    const { x0, y0, plotW, plotH } = getPlotRect("indicator", W, H);

    const series = [];
    if ($("chkRSI") && $("chkRSI").checked) series.push({ name: "RSI", ys: data.rsi, color: "rgba(0,120,0,0.85)" });
    if ($("chkMed") && $("chkMed").checked)
      series.push({ name: "Med_Max_Ratio", ys: data.med, color: "rgba(120,0,120,0.85)" });
    if ($("chkDeri") && $("chkDeri").checked)
      series.push({ name: "Deri_MMRatio", ys: data.deri, color: "rgba(255,140,0,0.90)" });
    if ($("chkAccu") && $("chkAccu").checked)
      series.push({ name: "Accu_MMRatio", ys: data.accu, color: "rgba(0,140,200,0.90)" });
    if ($("chkST") && $("chkST").checked) series.push({ name: "Short_Trend", ys: data.st, color: "rgba(0,0,0,0.80)" });

    const all = series.flatMap((s) => s.ys || []).filter((v) => v != null && Number.isFinite(v));
    const [mn, mx] = minmax(all);

    drawAxes(ctx, x0, y0, plotW, plotH, mn, mx);
    drawYearGrid(ctx, data.dates, x0, y0, plotW, plotH);

    // Sell-zone thresholds (from Trade_Process runtime values)
    // For the selected indicator, draw red threshold lines and shade sell zones (above upper / below lower).
    const rt = data.runtime || {};
    if (mx !== mn) {
      for (const s of series) {
        let lower = NaN, upper = NaN;
        if (s.name === "Med_Max_Ratio") { lower = rt.MedMax1; upper = rt.MedMax2; }
        else if (s.name === "Accu_MMRatio") { lower = rt.Accu1; upper = rt.Accu2; }
        else if (s.name === "Deri_MMRatio") { lower = rt.Deri1; upper = rt.Deri2; }
        else if (s.name === "Short_Trend") { lower = rt.Trend1; upper = rt.Trend2; }
        else continue;
        if (Number.isFinite(lower) && lower !== -99.0) drawThreshold(ctx, x0, y0, plotW, plotH, mn, mx, lower, NaN);
        if (Number.isFinite(upper) && upper !== 99.0) drawThreshold(ctx, x0, y0, plotW, plotH, mn, mx, NaN, upper);
      }
    }

    for (const s of series) {
      if (!Array.isArray(s.ys)) continue;
      drawSeries(ctx, x0, y0, plotW, plotH, s.ys, mn, mx, s.color, 1.4);
    }
    // Arc-top (green) & escape point (red) for Accu_MMRatio
    // These flags come directly from MoneyGrow_{code}.txt columns:
    //   just_pass_big_arc (red) at parts[10]
    //   big_arc_top (green) at parts[11]
    if (($("chkAccu") && $("chkAccu").checked) && Array.isArray(data.accu)) {
      const denom = Math.max(1, data.accu.length - 1);
      for (let i = 0; i < data.accu.length; i++) {
        const v = data.accu[i];
        if (!Number.isFinite(v)) continue;
        const x = x0 + (i / denom) * plotW;
        const y = y0 + plotH - ((v - mn) / (mx - mn)) * plotH;
        if (Array.isArray(data.arcTop) && data.arcTop[i]) {
          drawDot(ctx, x, y, "rgba(0,150,0,0.95)", 3.6);
        }
        if (Array.isArray(data.passArc) && data.passArc[i]) {
          drawDot(ctx, x, y, "rgba(220,0,0,0.95)", 3.6);
        }
      }
    }


    
    // cursor (linked with main chart)
    if (cursorActive && cursorIdx >= 0 && cursorIdx < (data.dates ? data.dates.length : 0)) {
      const denom = Math.max(1, (data.dates.length || 1) - 1);
      const cx = x0 + (cursorIdx / denom) * plotW;
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, y0);
      ctx.lineTo(cx, y0 + plotH);
      ctx.stroke();
    }

// small title (left), keep away from main title
    ctx.fillStyle = "rgba(0,0,0,0.70)";
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Arial";
    ctx.fillText("Indicator Panel", x0, 12);
  }

  function wireModal() {
    const modal = $("tradeModal");
    const btnAccount = $("btnAccount");
    const btnTrading = $("btnTrading");
    const btnRealTime = $("btnRealTime");
    const close = $("btnClose");
    const overlay = modal ? modal.querySelector(".modal-overlay") : null;

    function open() {
      if (!modal) return;
      modal.classList.add("open");
      modal.setAttribute("aria-hidden", "false");
    }
    function hide() {
      if (!modal) return;
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
    }

    async function showTxt(path) {
      try {
        $("tradeText").textContent = "Loading…";
        open();
        let txt = "";
        try {
          txt = await fetchText(path);
        } catch (e) {
          const m = String(path || "").match(/\/static\/.+/);
          if (m) {
            const alt = m[0];
            txt = await fetchText(alt);
            path = alt;
          } else throw e;
        }
        $("tradeText").textContent = txt;
      } catch (e) {
        $("tradeText").textContent = String(e && e.message ? e.message : e);
      }
    }

    btnAccount &&
      btnAccount.addEventListener("click", async () => {
        const p = cfg.accountTxt || "";
        if (!p) return;
        await showTxt(p);
      });

    btnTrading &&
      btnTrading.addEventListener("click", async () => {
        const p = cfg.tradeProcessTxt || "";
        if (!p) return;
        await showTxt(p);
      });

    btnRealTime &&
      btnRealTime.addEventListener("click", () => {
        const u = cfg.realTimeLink || "";
        if (!u) return;
        try { window.open(u, "_blank", "noopener"); } catch (e) { location.href = u; }
      });

    close && close.addEventListener("click", hide);
    overlay && overlay.addEventListener("click", hide);

    // click outside dialog closes
    modal &&
      modal.addEventListener("click", (e) => {
        if (e.target === modal) hide();
      });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hide();
    });
  }

  function bindCursor(canvas, data, rerender) {
    function insidePlot(evt) {
      const rect = canvas.getBoundingClientRect();
      const x = (evt.touches ? evt.touches[0].clientX : evt.clientX) - rect.left;
      return { x, w: rect.width };
    }
    const x0 = PLOT_LEFT;

    const move = (evt) => {
      const { x, w } = insidePlot(evt);
      const plotW = Math.max(1, w - x0 - PLOT_RIGHT_PAD);
      const xInPlot = x - x0;
      cursorActive = xInPlot >= 0 && xInPlot <= plotW;

      if (!cursorActive) {
        cursorIdx = -1;
        setCursorInfo("Move pointer over chart to inspect values.");
        rerender();
        return;
      }
      const n = (data.dates || []).length;
      if (n < 2) return;
      const t = Math.min(1, Math.max(0, xInPlot / plotW));
      cursorIdx = Math.round(t * (n - 1));

      const date = data.dates[cursorIdx];
      const idxRaw = Array.isArray(data.idxRaw) ? data.idxRaw[cursorIdx] : (Array.isArray(data.idx) ? data.idx[cursorIdx] : NaN);
      const eq = Array.isArray(data.eq) ? data.eq[cursorIdx] : NaN;
      const parts = [`Date: ${date}`];
      if (cfg.compareMode === "etf" && Array.isArray(data.idxsRaw)) {
        const idx0 = data.idxsRaw[0] ? data.idxsRaw[0][cursorIdx] : NaN;
        const idx1 = data.idxsRaw[1] ? data.idxsRaw[1][cursorIdx] : NaN;
        if ($("chkCmpIndex") && $("chkCmpIndex").checked) parts.push(`${cfg.cmpIndexLabel || "Index"}: ${formatNum(idx0)}`);
        if ($("chkIndex") && $("chkIndex").checked) parts.push(`${cfg.primaryIndexLabel || "ETF"}: ${formatNum(idx1)}`);
      } else {
        if ($("chkIndex") && $("chkIndex").checked) parts.push(`${cfg.singleIndexLabel || "Target"}: ${formatNum(idxRaw)}`);
      }
      if ($("chkEquity") && $("chkEquity").checked) parts.push(`${cfg.equityLabel || "Equity"}: ${formatNum(eq)}`);
      if ($("chkRSI") && $("chkRSI").checked) parts.push(`RSI: ${formatNum(data.rsi[cursorIdx])}`);
      if ($("chkMed") && $("chkMed").checked) parts.push(`Med: ${formatNum(data.med[cursorIdx])}`);
      if ($("chkDeri") && $("chkDeri").checked) parts.push(`Deri: ${formatNum(data.deri[cursorIdx])}`);
      if ($("chkAccu") && $("chkAccu").checked) parts.push(`Accu: ${formatNum(data.accu[cursorIdx])}`);
      if ($("chkST") && $("chkST").checked) parts.push(`ST: ${formatNum(data.st[cursorIdx])}`);

      setCursorInfo(parts.join("  |  "));
      rerender();
    };

    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseleave", () => {
      cursorActive = false;
      cursorIdx = -1;
      setCursorInfo("Move pointer over chart to inspect values.");
      rerender();
    });
    canvas.addEventListener("touchmove", move, { passive: true });
  }

  
  // ===== Portfolio Builder (Combination Strategy Example) =====
  function normalizeSector(rawSector, rawContinent, key, idx){
    const s0 = String(rawSector||"").trim();
    const k = String(key||"").toUpperCase();
    const sym = String((idx&&idx.symbol)||"").toUpperCase();
    const name = String((idx&&idx.name)||"");
    const market = String((idx&&idx.market)||"").toUpperCase();

    if(s0){
      const up = s0.toUpperCase().replace(/\s+/g,"_");
      const map = {
        "PREFERRED_STOCK":"Preferred Stock",
        "PREFERRED_ETF":"Preferred ETF",
        "MULTI_ASSET":"Multi Asset",
        "NORTH_AMERICA":"North America",
        "SOUTH_AMERICA":"South America",
        "ASIA":"Asia",
        "OCEANIA":"Oceania",
        "AFRICA":"Africa",
        "EUROPE":"Europe",
        "AMERICAS":"North America"
      };
      return map[up] || s0;
    }

    const PREFERRED_STOCK_KEYS = new Set(["US_AAPL","US_MSFT","US_AMZN","US_NVDA","US_META","US_GOOG","US_GOOGL","US_TSLA"]);
    if(PREFERRED_STOCK_KEYS.has(k) || PREFERRED_STOCK_KEYS.has(sym) || PREFERRED_STOCK_KEYS.has(("US_"+sym)) || market === "STOCK"){
      return "Preferred Stock";
    }
    if(/(ETF|TRUST|FUND)/i.test(name) && market !== "STOCK"){
      return "Preferred ETF";
    }
    const c = String(rawContinent||"OTHER").toUpperCase().replace(/\s+/g,"_");
    if (c === "SOUTH_AMERICA") return "South America";
    if (c === "NORTH_AMERICA") return "North America";
    if (c === "AMERICAS") return "North America";
    if (c === "ASIA") return "Asia";
    if (c === "OCEANIA") return "Oceania";
    if (c === "AFRICA") return "Africa";
    if (c === "EUROPE") return "Europe";
    return "Multi Asset";
  }

  function el(tag, cls, text){
    const e=document.createElement(tag);
    if(cls) e.className=cls;
    if(text!=null) e.textContent=text;
    return e;
  }



  function parseAccountStatus(text){
    const s=String(text||'');
    const lower=s.toLowerCase();
    const hasBuy = /tomorrow.*buy|buy.*tomorrow|next open.*buy|open.*buy/.test(lower);
    const hasSell = /tomorrow.*sell|sell.*tomorrow|next open.*sell|open.*sell/.test(lower);
    if(hasBuy) return {mode:'buy'};
    if(hasSell) return {mode:'sell'};
    if(/currently no holdings|current position\s*:\s*none/.test(lower)) return {mode:'none'};
    if(/current position\s*:/.test(lower) || /holding quantity\s*:/.test(lower) || /position quantity\s*:/.test(lower)) return {mode:'hold'};
    return {mode:'none'};
  }

  function drawStripeRect(ctx,x,y,w,h,c1,c2){
    ctx.save();
    ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip();
    ctx.fillStyle=c1; ctx.fillRect(x,y,w,h);
    ctx.strokeStyle=c2; ctx.lineWidth=4;
    for(let i=-h;i<w+h;i+=8){
      ctx.beginPath(); ctx.moveTo(x+i,y+h); ctx.lineTo(x+i+h,y); ctx.stroke();
    }
    ctx.restore();
  }

  function drawPie(series, statusByName){
    const pie = $('pieCanvas');
    if(!pie) return;
    const {ctx,w:W,h:H}=ensureCanvasSize(pie);
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
    const assets=(series||[]).filter(s=>s && s.name && s.name!=='All');
    if(!assets.length){
      ctx.fillStyle='rgba(0,0,0,0.45)';
      ctx.font='13px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.fillText('No selected assets', 18, 24);
      return;
    }
    const cx=W/2, cy=H/2;
    const r=Math.max(40, Math.min(W,H)*0.38);
    const n=assets.length;
    const per=(Math.PI*2)/n;
    for(let i=0;i<n;i++){
      const a=assets[i];
      const st=(statusByName && statusByName[a.name]) || {mode:'none'};
      const start=-Math.PI/2 + i*per;
      const end=start+per;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx,cy);
      ctx.arc(cx,cy,r,start,end,false);
      ctx.closePath();
      ctx.clip();
      if(st.mode==='hold'){
        ctx.fillStyle='rgba(46,160,67,0.85)'; ctx.fillRect(cx-r-2,cy-r-2,r*2+4,r*2+4);
      }else if(st.mode==='none'){
        ctx.fillStyle='rgba(220,38,38,0.80)'; ctx.fillRect(cx-r-2,cy-r-2,r*2+4,r*2+4);
      }else if(st.mode==='buy'){
        drawStripeRect(ctx,cx-r-2,cy-r-2,r*2+4,r*2+4,'rgba(255,255,255,0.95)','rgba(46,160,67,0.95)');
      }else if(st.mode==='sell'){
        drawStripeRect(ctx,cx-r-2,cy-r-2,r*2+4,r*2+4,'rgba(255,255,255,0.95)','rgba(220,38,38,0.95)');
      }else{
        ctx.fillStyle='rgba(160,160,160,0.5)'; ctx.fillRect(cx-r-2,cy-r-2,r*2+4,r*2+4);
      }
      ctx.restore();
      ctx.strokeStyle='rgba(255,255,255,0.95)';
      ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,start,end,false); ctx.closePath(); ctx.stroke();
      const mid=(start+end)/2;
      const tx=cx + Math.cos(mid)*r*0.58;
      const ty=cy + Math.sin(mid)*r*0.58;
      const name=a.name;
      ctx.save();
      ctx.translate(tx,ty);
      let ang=mid;
      if(ang>Math.PI/2 && ang<3*Math.PI/2) ang += Math.PI;
      ctx.rotate(ang);
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      ctx.font='12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.fillStyle='rgba(20,20,20,0.95)';
      const maxChars=Math.max(4, Math.floor(r*0.12));
      const label=name.length>maxChars ? name.slice(0,maxChars-1)+'…' : name;
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
    ctx.strokeStyle='rgba(0,0,0,0.08)';
    ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
  }


  function drawSecureRisk(){
    const c = $('srCanvas');
    if(!c) return;
    const {ctx,w:W,h:H}=ensureCanvasSize(c);
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,W,H);

    // Two 120-degree sectors sharing one center point, top green and bottom red.
    const cx = W * 0.50;
    const cy = H * 0.54;
    const r = Math.min(W * 0.34, H * 0.34);
    const a120 = Math.PI * 2 / 3;

    function sector(start, end, color){
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end, false);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }

    // Top sector centered on upward direction (270°), 120° wide
    sector(-Math.PI/2 - a120/2, -Math.PI/2 + a120/2, 'rgba(46,160,67,0.92)');
    // Bottom sector centered on downward direction (90°), 120° wide
    sector(Math.PI/2 - a120/2, Math.PI/2 + a120/2, 'rgba(220,38,38,0.88)');

    ctx.strokeStyle = 'rgba(255,255,255,0.98)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, -Math.PI/2 - a120/2, -Math.PI/2 + a120/2, false);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, Math.PI/2 - a120/2, Math.PI/2 + a120/2, false);
    ctx.closePath();
    ctx.stroke();

    ctx.textAlign='center';
    ctx.font='700 12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.fillStyle='rgba(22,101,52,0.98)';
    ctx.textBaseline='bottom';
    ctx.fillText('Secure', cx, cy - r - 8);
    ctx.fillStyle='rgba(153,27,27,0.98)';
    ctx.textBaseline='top';
    ctx.fillText('Risk', cx, cy + r + 8);
  }


  function formatPct(v){
    return Number.isFinite(v) ? ((v*100).toFixed(2) + '%') : '--';
  }

  function computeCurveStats(commonDates, normVals){
    const srcVals = Array.isArray(normVals) ? normVals : [];
    const srcDates = Array.isArray(commonDates) ? commonDates : [];
    const pairs = [];
    for(let i=0;i<Math.min(srcVals.length, srcDates.length || srcVals.length);i++){
      const v = srcVals[i];
      const d = srcDates[i] || null;
      if(Number.isFinite(v) && v > 0) pairs.push({d, v});
    }
    if(!pairs.length) return {maxDD: NaN, cagr: NaN, maxDDStart: '', maxDDEnd: '', maxDDPeriod: ''};
    let peak = pairs[0].v;
    let peakDate = pairs[0].d;
    let maxDD = 0;
    let maxDDStart = peakDate;
    let maxDDEnd = peakDate;
    for(const p of pairs){
      if(p.v > peak){ peak = p.v; peakDate = p.d; }
      const dd = (p.v / peak) - 1;
      if(dd < maxDD){
        maxDD = dd;
        maxDDStart = peakDate;
        maxDDEnd = p.d;
      }
    }
    let years = NaN;
    if(pairs.length >= 2 && pairs[0].d && pairs[pairs.length-1].d){
      const t0 = new Date(pairs[0].d + 'T00:00:00Z');
      const t1 = new Date(pairs[pairs.length-1].d + 'T00:00:00Z');
      const days = (t1 - t0) / 86400000;
      if(Number.isFinite(days) && days > 0) years = days / 365.25;
    }
    let cagr = NaN;
    const first = pairs[0].v, last = pairs[pairs.length-1].v;
    if(Number.isFinite(years) && years > 0 && Number.isFinite(first) && first > 0 && Number.isFinite(last) && last > 0){
      cagr = Math.pow(last / first, 1 / years) - 1;
    }
    const maxDDPeriod = (maxDDStart && maxDDEnd) ? `${maxDDStart} ~ ${maxDDEnd}` : '';
    return {maxDD, cagr, maxDDStart, maxDDEnd, maxDDPeriod};
  }
  function parseMoneyTotals(text){
    const lines=(text||"").trim().split(/\r?\n/);
    const m=new Map();
    for(const line of lines){
      const s=(line||"").trim();
      if(!s || s.startsWith("#")) continue;
      const parts=s.split("|");
      if(parts.length<2) continue;
      const ds=parts[0].trim();
      const date = ds.length===8 ? `${ds.slice(0,4)}-${ds.slice(4,6)}-${ds.slice(6,8)}` : ds.slice(0,10);
      const total=Number(parts[1]);
      if(date && Number.isFinite(total)) m.set(date,total);
    }
    return m;
  }

  function parseIndexClose(text){
    const lines=(text||"").trim().split(/\r?\n/);
    if(lines.length<2) return new Map();
    const header=lines[0].split(",").map(s=>s.trim().toLowerCase());
    const di=header.indexOf("date")>=0?header.indexOf("date"):header.indexOf("trade_date");
    const ci=header.indexOf("close")>=0?header.indexOf("close"):header.indexOf("c");
    const m=new Map();
    for(let i=1;i<lines.length;i++){
      const parts=lines[i].split(",");
      if(parts.length<2) continue;
      const d=(parts[di>=0?di:0]||"").trim().slice(0,10);
      const c=Number((parts[ci>=0?ci:parts.length-1]||"").trim());
      if(d && Number.isFinite(c)) m.set(d,c);
    }
    return m;
  }

  function intersectDates(maps){
    if(!maps.length) return [];
    // start with smallest map for efficiency
    const sorted=[...maps].sort((a,b)=>a.size-b.size);
    const base=[...sorted[0].keys()];
    const out=[];
    for(const d of base){
      let ok=true;
      for(let i=1;i<sorted.length;i++){
        if(!sorted[i].has(d)){ ok=false; break; }
      }
      if(ok) out.push(d);
    }
    out.sort(); // YYYY-MM-DD sortable
    return out;
  }

  function buildPortfolioMoneyGrow(dates, perKeyTotalsMaps, keys){
    const n=keys.length;
    const weight=1/n;
    // Pre-extract totals arrays aligned
    const totalsByKey = keys.map((k,i)=> dates.map(d => perKeyTotalsMaps[i].get(d)));
    // Identify year start indices in the common date list
    const yearStartIdx = new Set();
    let lastYear=null;
    for(let i=0;i<dates.length;i++){
      const y=dates[i].slice(0,4);
      if(y!==lastYear){
        if(i!==0) yearStartIdx.add(i);
        lastYear=y;
      }
    }
    let portfolioPrev=1.0;
    // base totals at last rebalance reference day (use prev date at year boundary)
    let baseTotals = totalsByKey.map(arr => arr[0]);
    let alloc = Array(n).fill(portfolioPrev*weight);

    const outTotals=[];
    outTotals.push(1.0); // first day normalized
    for(let i=1;i<dates.length;i++){
      if(yearStartIdx.has(i)){
        // rebalance before trading first day of the year: use previous day's portfolio value
        portfolioPrev = outTotals[i-1];
        alloc = Array(n).fill(portfolioPrev*weight);
        baseTotals = totalsByKey.map(arr => arr[i-1]); // previous day as base
      }
      let sum=0;
      for(let j=0;j<n;j++){
        const bt=baseTotals[j];
        const t=totalsByKey[j][i];
        const ratio = (Number.isFinite(bt) && bt!==0) ? (t/bt) : 1.0;
        sum += alloc[j]*ratio;
      }
      outTotals.push(sum);
    }
    // emit as minimal moneygrow text
    return dates.map((d,i)=>`${d}|${outTotals[i].toFixed(6)}`).join("\n");
  }

  function buildPortfolioIndexCsv(dates, perKeyCloseMaps, keys){
    const n=keys.length;
    const weight=1/n;
    const closesByKey = keys.map((k,i)=>dates.map(d=>perKeyCloseMaps[i].get(d)));
    // normalize to first common day and build synthetic close starting at 100
    const base = closesByKey.map(arr=>arr[0]);
    const syn=[];
    for(let i=0;i<dates.length;i++){
      let v=0;
      for(let j=0;j<n;j++){
        const b=base[j];
        const c=closesByKey[j][i];
        const r = (Number.isFinite(b) && b!==0) ? (c/b) : 1.0;
        v += weight*r;
      }
      syn.push(100*v);
    }
    let csv="Date,Close\n";
    for(let i=0;i<dates.length;i++){
      csv += `${dates[i]},${syn[i].toFixed(6)}\n`;
    }
    return csv;
  }

  async function mainPortfolioBuilder(){

    // prevent duplicate init (some navigations can execute script twice)
    if (window.__BC_PORTFOLIO_BUILDER_INIT) return;
    window.__BC_PORTFOLIO_BUILDER_INIT = true;

    try{
      setStatus("Loading asset_db…");
      const dbCandidates = [cfg.assetDbPath, "/static/data/asset_db.txt", "/static/data/asset_db_new.txt", "/static/data/asset_db_old.txt"].filter(Boolean);
      let db = null, lastDbErr = null;
      for (const dbPath of dbCandidates){
        try { db = JSON.parse(await fetchText(dbPath)); break; } catch(err){ lastDbErr = err; }
      }
      if(!db) throw lastDbErr || new Error("asset_db load failed");

      const bcRows = $("bcSectorRows");
      const bcTabs = $("bcChartTabs");
      const canvas = $("mainCanvas");
      if(!bcRows || !bcTabs || !canvas) throw new Error("Missing combo DOM");

      bcRows.innerHTML = "";
      bcTabs.innerHTML = "";

      // Build list of {key, continent, name, symbol, etfs}
      const items=[];
      for(const [key,val] of Object.entries(db||{})){
        const idx = (val&&val.index)||{};
        const sym = (idx.symbols && (idx.symbols.yahoo||idx.symbols.stooq)) || "";
        const etfs = (val && val.etfs) ? val.etfs : ((val && val.index && val.index.etfs) ? val.index.etfs : []);
        items.push({
          key,
          continent: idx.continent || "",
          sector: idx.sector || "",
          market: idx.market || "",
          name: idx.name || key,
          symbol: sym,
          rank_id: Number(idx.rank_id),
          etfs: etfs
        });
      }

      function findPrimaryEtfKey(bundle, displayKey){
        const rawEtfs = (bundle||{}).etfs;
        // asset_db has two shapes:
        // 1) array of ETF objects with alias="PRIMARY"
        // 2) object like { Primary: null, "Secondary 1": null, ... }
        // For the combination page, if a PRIMARY ETF exists we use MoneyGrow_<KEY>_PRIMARY.txt.
        if(Array.isArray(rawEtfs)){
          for(const e of rawEtfs){
            if(String(e && e.alias || "").toUpperCase()==="PRIMARY"){
              const k = String((e && (e.key || e.code)) || "").trim();
              return k || `${displayKey}_PRIMARY`;
            }
          }
          return null;
        }
        if(rawEtfs && typeof rawEtfs === 'object'){
          const primaryVal = rawEtfs.Primary ?? rawEtfs.PRIMARY ?? rawEtfs.primary ?? null;
          if(primaryVal){
            if(typeof primaryVal === 'string') return primaryVal.trim() || `${displayKey}_PRIMARY`;
            const k = String((primaryVal.key || primaryVal.code || '')).trim();
            return k || `${displayKey}_PRIMARY`;
          }
          return null;
        }
        return null;
      }

      // Group by derived sector (same normalization rule as explorer)
      const groups = new Map();
      const dedupeMaps = {"Preferred Stock": new Map(), "Preferred ETF": new Map()};
      function dedupeKeyFor(it, sector){
        let k = String(it.key||'').toUpperCase();
        if (sector === 'Preferred Stock') {
          k = k.replace(/^US_/, '');
          if (k === 'GOOGL' || k === 'GOOG') return 'GOOGLE';
        }
        if (sector === 'Preferred ETF') {
          k = k.replace(/_PRIMARY$/,'');
        }
        return k;
      }
      function preferredScore(it){
        const k = String(it.key||'').toUpperCase();
        let score = 0;
        if (k.startsWith('US_')) score += 10;
        if (/_PRIMARY$/.test(k)) score -= 1;
        return score;
      }
      const itemKeys = new Set(items.map(x => String(x.key||'').toUpperCase()));
      for(const it of items){
        const sector = normalizeSector(it.sector, it.continent, it.key, {symbol: it.symbol || it.key, name: it.name, market: it.market});
        const upKey = String(it.key||'').toUpperCase();
        if (sector === 'Preferred Stock' && !upKey.startsWith('US_') && itemKeys.has('US_' + upKey)) {
          continue;
        }
        let keep = it;
        if (sector === 'Preferred Stock' || sector === 'Preferred ETF') {
          const dk = dedupeKeyFor(it, sector);
          const mp = dedupeMaps[sector];
          const prev = mp.get(dk);
          if (!prev || preferredScore(it) > preferredScore(prev)) mp.set(dk, it);
          continue;
        }
        if(!groups.has(sector)) groups.set(sector, []);
        groups.get(sector).push(keep);
      }
      for (const [sector, mp] of Object.entries(dedupeMaps)) {
        if(!groups.has(sector)) groups.set(sector, []);
        groups.set(sector, groups.get(sector).concat([...mp.values()]));
      }

      // Merge Oceania + Africa
      if (groups.has("Oceania") || groups.has("Africa")) {
        const merged = [];
        if (groups.has("Oceania")) merged.push(...groups.get("Oceania"));
        if (groups.has("Africa")) merged.push(...groups.get("Africa"));
        groups.delete("Oceania"); groups.delete("Africa");
        groups.set("Oceania / Africa", merged);
      }

      // Merge North America + South America (NA left, SA right)
      if (groups.has("North America") || groups.has("South America")) {
        const na = groups.get("North America") || [];
        const sa = groups.get("South America") || [];
        groups.delete("North America"); groups.delete("South America");
        groups.set("Americas", { na, sa });
      }

      const sectorOrder = ["Americas","Preferred ETF","Preferred Stock","Multi Asset","Asia","Oceania / Africa","Europe"];
      const orderedSectors = [...groups.keys()].sort((a,b)=>{
        const ia=sectorOrder.indexOf(a), ib=sectorOrder.indexOf(b);
        if(ia===-1 && ib===-1) return a.localeCompare(b);
        if(ia===-1) return 1;
        if(ib===-1) return -1;
        return ia-ib;
      });

      // UI: each sector one line (no wrap); keys scroll horizontally if long.
      for(const sec of orderedSectors){
        const row = el("div","sector-row");
        const lab = el("div","sector-name", sec==="Americas" ? "North America / South America" : sec);
        row.appendChild(lab);

        const keysWrap = el("div","sector-keys");
        row.appendChild(keysWrap);

        function addKeyCheckbox(m){
          const id = "cb_"+m.key;
          const wrap = el("label","chk");
          const input=document.createElement("input");
          input.type="checkbox";
          input.id=id;
          input.dataset.key=m.key;

          const up=m.key.toUpperCase();
          input.checked = (up==="NASDAQ100" || up==="BRENT" || up==="GOLD");

          const span = el("span","", m.key);
          wrap.appendChild(input);
          wrap.appendChild(document.createTextNode(" "));
          wrap.appendChild(span);
          keysWrap.appendChild(wrap);
        }

        if(sec==="Americas"){
          const _ord = (a,b)=>((Number.isFinite(a.rank_id)?a.rank_id:1e9) - (Number.isFinite(b.rank_id)?b.rank_id:1e9)) || a.key.localeCompare(b.key);
          const na = (groups.get("Americas").na||[]).slice().sort(_ord);
          const sa = (groups.get("Americas").sa||[]).slice().sort(_ord);
          na.forEach(addKeyCheckbox);
          // visual separator
          const sep = el("span","americas-sep"," | ");
          keysWrap.appendChild(sep);
          sa.forEach(addKeyCheckbox);
        }else{
          const members = (groups.get(sec)||[]).slice().sort((a,b)=>(((Number.isFinite(a.rank_id)?a.rank_id:1e9) - (Number.isFinite(b.rank_id)?b.rank_id:1e9)) || a.key.localeCompare(b.key)));
          members.forEach(addKeyCheckbox);
        }
        bcRows.appendChild(row);
      }

      function selectedKeys(){
        const cbs = bcRows.querySelectorAll('input[type="checkbox"][data-key]');
        const out=[];
        cbs.forEach(cb=>{ if(cb.checked) out.push(cb.dataset.key); });
        return out;
      }

      async function fetchCandidates(paths){
        const errs=[];
        for(const p of paths){
          if(!p) continue;
          try{ return await fetchText(p); }
          catch(e){ errs.push(`Failed to fetch ${p}: ${e && e.message ? e.message : e}`); }
        }
        throw new Error("All candidates failed: " + errs.join(" ; "));
      }

      async function loadMoneyGrowForKey(displayKey){
        // decide whether to use PRIMARY ETF equity curve
        const bundle = db[displayKey];
        const primaryKey = findPrimaryEtfKey(bundle, displayKey);
        const curveKey = primaryKey ? primaryKey : displayKey;

        const kLower = String(curveKey||"").toLowerCase();
        const recordDir = cfg.recordDir || "/static/record";
        const recordPubDir = String(recordDir).replace(/\/static\/record$/, '/static/record_pub');
        const mgCandidates = [
          `${recordDir}/MoneyGrow_${curveKey}.txt`,
          `${recordDir}/MoneyGrow_${kLower}.txt`,
          `${recordDir}/moneygrow_${kLower}.txt`,
          `${recordDir}/MoneyGrow_${displayKey}.txt`,
          `${recordDir}/MoneyGrow_${String(displayKey||"").toLowerCase()}.txt`,
          `${recordPubDir}/MoneyGrow_${curveKey}.txt`,
          `${recordPubDir}/MoneyGrow_${kLower}.txt`,
          `${recordPubDir}/moneygrow_${kLower}.txt`,
          `${recordPubDir}/MoneyGrow_${displayKey}.txt`,
          `${recordPubDir}/MoneyGrow_${String(displayKey||"").toLowerCase()}.txt`,
        ];
        const moneyGrowText = await fetchCandidates(mgCandidates);
        return { displayKey, curveKey, moneyGrowText };
      }

      // Build "Show curves" toggles (assets + All)
      function rebuildCurveToggles(keys){
        bcTabs.innerHTML="";
        const box = el("div","curve-toggles");
        box.appendChild(el("span","curve-toggles-label","Show: "));
        const make=(name, checked=true)=>{
          const w=el("label","chk");
          const i=document.createElement("input");
          i.type="checkbox";
          i.dataset.show=name;
          i.checked=checked;
          w.appendChild(i);
          w.appendChild(document.createTextNode(" "));
          w.appendChild(el("span","", name));
          box.appendChild(w);
          return i;
        };
        // Portfolio curve
        make("All", true);
        keys.forEach(k=> make(k, true));
        bcTabs.appendChild(box);
      }

      function getShown(){
        const cbs = bcTabs.querySelectorAll('input[type="checkbox"][data-show]');
        const set=new Set();
        cbs.forEach(cb=>{ if(cb.checked) set.add(cb.dataset.show); });
        return set;
      }

      function drawEquityOnly(commonDates, series){
        const {ctx,w:W,h:H} = ensureCanvasSize(canvas);
        ctx.fillStyle="#fff"; ctx.fillRect(0,0,W,H);

        const padL=58, padR=120, padT=18, padB=34;
        const x0=padL, y0=padT, w=W-padL-padR, h=H-padT-padB;

        let all=[];
        for(const s of series) all = all.concat(s.valuesNorm);
        const [yMin0,yMax0]=minmax(all);
        const yMin = yMin0*0.98, yMax = yMax0*1.02;

        ctx.strokeStyle="rgba(0,0,0,0.12)";
        ctx.lineWidth=1;
        ctx.strokeRect(x0,y0,w,h);

        ctx.fillStyle="rgba(0,0,0,0.7)";
        ctx.font="12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
        const ticks=5;
        for(let i=0;i<=ticks;i++){
          const t=i/ticks;
          const y=y0+h-(t*h);
          const v=yMin+(yMax-yMin)*t;
          ctx.strokeStyle="rgba(0,0,0,0.08)";
          ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x0+w,y); ctx.stroke();
          ctx.fillText(v.toFixed(3), 8, y+4);
        }

        const years = [];
        let lastYear=null;
        for(let i=0;i<commonDates.length;i++){
          const d=commonDates[i];
          const y=d.slice(0,4);
          if(y!==lastYear){ years.push({i, y}); lastYear=y; }
        }
        ctx.fillStyle="rgba(0,0,0,0.6)";
        years.forEach(({i,y})=>{
          const x=x0+(i/(commonDates.length-1))*w;
          ctx.strokeStyle="rgba(0,0,0,0.10)";
          ctx.beginPath(); ctx.moveTo(x,y0); ctx.lineTo(x,y0+h); ctx.stroke();
          ctx.fillText(y, x-10, y0+h+18);
        });

        const colors = [
          "rgba(0,90,255,0.88)",
          "rgba(34,139,34,0.88)",
          "rgba(255,140,0,0.88)",
          "rgba(128,0,128,0.88)",
          "rgba(30,30,30,0.82)",
          "rgba(0,170,180,0.88)",
        ];
        let ci=0;
        const labelPts=[];
        for(const s of series){
          const col = (s.name==="All") ? "rgba(220,20,60,0.95)" : colors[ci % colors.length];
          ci++;
          ctx.strokeStyle=col;
          ctx.lineWidth = (s.name==="All") ? 2.8 : 1.7;
          ctx.beginPath();
          let lastPt=null;
          for(let i=0;i<s.valuesNorm.length;i++){
            const v=s.valuesNorm[i];
            const x=x0+(i/(s.valuesNorm.length-1))*w;
            const y=y0+h-((v-yMin)/(yMax-yMin))*h;
            if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
            if(Number.isFinite(y)) lastPt={x,y};
          }
          ctx.stroke();
          if(lastPt) labelPts.push({name:s.name, color:col, x:lastPt.x, y:lastPt.y});
        }

        labelPts.sort((a,b)=>a.y-b.y);
        for(let i=1;i<labelPts.length;i++){
          if(labelPts[i].y - labelPts[i-1].y < 14) labelPts[i].y = labelPts[i-1].y + 14;
        }
        const maxY = y0+h-4;
        for(let i=labelPts.length-2;i>=0;i--){
          if(labelPts[i+1].y > maxY) labelPts[i+1].y = maxY;
          if(labelPts[i+1].y - labelPts[i].y < 14) labelPts[i].y = labelPts[i+1].y - 14;
        }
        ctx.font="12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
        labelPts.forEach(p=>{
          const tx = Math.min(W-8-ctx.measureText(p.name).width, x0+w+10);
          ctx.fillStyle='rgba(255,255,255,0.92)';
          const tw=ctx.measureText(p.name).width;
          ctx.fillRect(tx-3, p.y-11, tw+6, 14);
          ctx.fillStyle=p.color;
          ctx.fillText(p.name, tx, p.y);
        });

        let lx=x0+8, ly=y0+14;
        ctx.font="12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
        ci=0;
        for(const s of series){
          const col = (s.name==="All") ? "rgba(220,20,60,0.95)" : colors[ci % colors.length];
          ci++;
          ctx.fillStyle=col;
          ctx.fillRect(lx, ly-10, 12, 3);
          ctx.fillStyle="rgba(0,0,0,0.8)";
          ctx.fillText(s.name, lx+16, ly-6);
          lx += 88;
          if(lx > x0+w-100){ lx=x0+8; ly+=16; }
        }
      }

      // Create MoneyGrow_All as a downloadable file content (client-side)
      function setAllDownload(text){
        const a = $("bcDownloadAll");
        if(!a) return;
        const blob = new Blob([text], {type:"text/plain"});
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = "MoneyGrow_All.txt";
        a.style.display = "inline-flex";
      }

      async function render(keys){
        const tradingStartEl = $("bcTradingStartLine");
        const initialCapitalEl = $("bcInitialCapitalLine");
        const accountTotalEl = $("bcAccountTotalLine");
        const cagrEl = $("bcCAGRLine");
        const maxddEl = $("bcMaxDDLine");
        const maxddPeriodEl = $("bcMaxDDPeriodLine");
        if(!keys.length){
          setStatus("Select at least 1 key.");
          if(tradingStartEl) tradingStartEl.textContent = "Trading Start: --";
          if(tradingStartEl) tradingStartEl.textContent = "Trading Start: --";
          if(initialCapitalEl) initialCapitalEl.textContent = "Initial Capital: --";
          if(accountTotalEl) accountTotalEl.textContent = "Account Total: --";
          if(cagrEl) cagrEl.textContent = "CAGR: --";
          if(maxddEl) maxddEl.textContent = "MaxDD: --";
          if(maxddPeriodEl) maxddPeriodEl.textContent = "MaxDD Period: --";
          drawEquityOnly(["2000-01-01"], []);
          drawPie([], {});
          return;
        }
        setStatus("Loading curves…");
        try{
          const loaded = await Promise.all(keys.map(loadMoneyGrowForKey));
          const mgMaps = loaded.map(x=>parseMoneyTotals(x.moneyGrowText));
          const commonDates = intersectDates(mgMaps);
          if(commonDates.length < 30) throw new Error("Common date range too short (check MoneyGrow alignment).");

          const simLabels = loaded.map(x=>x.curveKey);
          const mgAllText = buildPortfolioMoneyGrow(commonDates, mgMaps, simLabels);
          setAllDownload(mgAllText);

          const shown = getShown();
          const series=[];
          const allMap = parseMoneyTotals(mgAllText);
          const baseAll = allMap.get(commonDates[0]) || 1;
          const allNorm = commonDates.map(d=> (allMap.get(d) || baseAll) / baseAll);
          if(shown.has("All")) series.push({name:"All", valuesNorm:allNorm});

          loaded.forEach((ld, idx)=>{
            if(!shown.has(ld.displayKey)) return;
            const m = mgMaps[idx];
            const base = m.get(commonDates[0]);
            if(!isFinite(base) || base===0) return;
            const norm = commonDates.map(d=> (m.get(d) || base) / base);
            series.push({name: ld.displayKey, valuesNorm:norm});
          });

          const stats = computeCurveStats(commonDates, allNorm);
          const tradingStart = commonDates[0];
          const initialCapital = allMap.get(commonDates[0]);
          const finalAccountTotal = allMap.get(commonDates[commonDates.length - 1]);
          if(tradingStartEl) tradingStartEl.textContent = `Trading Start: ${tradingStart || "--"}`;
          if(initialCapitalEl) initialCapitalEl.textContent = `Initial Capital: ${Number.isFinite(initialCapital) ? initialCapital.toFixed(2) + " Million" : "--"}`;
          if(accountTotalEl) accountTotalEl.textContent = `Account Total: ${Number.isFinite(finalAccountTotal) ? finalAccountTotal.toFixed(2) + " Million" : "--"}`;
          if(cagrEl) cagrEl.textContent = `CAGR: ${formatPct(stats && stats.cagr)}`;
          if(maxddEl) maxddEl.textContent = `MaxDD: ${formatPct(stats && stats.maxDD)}`;
          if(maxddPeriodEl) maxddPeriodEl.textContent = `MaxDD Period: ${(stats && stats.maxDDPeriod) ? sanitizePeriodText(stats.maxDDPeriod) : '--'}`;

          const accountResults = await Promise.all(loaded.map(async (ld)=>{
            const recordDir = cfg.recordDir || "/static/record";
            const recordPubDir = String(recordDir).replace(/\/static\/record$/, '/static/record_pub');
            const accountCandidates = [
              `${recordDir}/Account_${ld.curveKey}.txt`,
              `${recordDir}/Account_${String(ld.curveKey||"").toLowerCase()}.txt`,
              `${recordDir}/account_${String(ld.curveKey||"").toLowerCase()}.txt`,
              `${recordDir}/Account_${ld.displayKey}.txt`,
              `${recordPubDir}/Account_${ld.curveKey}.txt`,
              `${recordPubDir}/Account_${String(ld.curveKey||"").toLowerCase()}.txt`,
              `${recordPubDir}/account_${String(ld.curveKey||"").toLowerCase()}.txt`,
              `${recordPubDir}/Account_${ld.displayKey}.txt`,
            ];
            try{
              const txt = await fetchCandidates(accountCandidates);
              return [ld.displayKey, parseAccountStatus(txt)];
            }catch(_e){
              return [ld.displayKey, {mode:'none'}];
            }
          }));
          const statusByName = Object.fromEntries(accountResults);

          drawEquityOnly(commonDates, series);
          drawPie(series, statusByName);
      drawSecureRisk();
          setStatus("");
        }catch(e){
          const accountTotalEl = $("bcAccountTotalLine");
          const maxddEl = $("bcMaxDDLine");
          const cagrEl = $("bcCAGRLine");
          if(tradingStartEl) tradingStartEl.textContent = "Trading Start: --";
          if(initialCapitalEl) initialCapitalEl.textContent = "Initial Capital: --";
          if(accountTotalEl) accountTotalEl.textContent = "Account Total: --";
          if(cagrEl) cagrEl.textContent = "CAGR: --";
          if(maxddEl) maxddEl.textContent = "MaxDD: --";
          if(maxddPeriodEl) maxddPeriodEl.textContent = "MaxDD Period: --";
          setStatus("Failed to load data. Check paths and console.");
          const elc=$("bcCursorInfo"); if(elc) elc.textContent=String(e);
          console.error(e);
        }
      }

      function onChange(){
        const keys=selectedKeys();
        rebuildCurveToggles(keys);

        // Hook curve toggles change
        bcTabs.onchange = ()=> render(keys);

        render(keys);
      }

      bcRows.addEventListener("change", onChange);

      // Initial render
      const initKeys = selectedKeys();
      rebuildCurveToggles(initKeys);
      bcTabs.onchange = ()=> render(initKeys);
      await render(initKeys);

    }catch(e){
      setStatus("Failed to load data. Check paths and console.");
      const elc=$("bcCursorInfo"); if(elc) elc.textContent=String(e);
      console.error(e);
    }
  }


async function main() {
    try {
      setStatus("Loading…");

      // Combination Strategy Example: portfolio builder mode
      if (cfg && cfg.mode === "portfolio_builder") {
        await mainPortfolioBuilder();
        return;
      }

      // Controls: show compare-index toggle for ETF view
      (function(){
        const cmp = $("lblCmpIndex");
        const prim = $("lblPrimaryIndex");
        function setLabel(labelEl, text){
          if(!labelEl) return;
          // keep the checkbox input, replace trailing text node
          const inp = labelEl.querySelector("input");
          labelEl.textContent = "";
          if(inp) labelEl.appendChild(inp);
          labelEl.appendChild(document.createTextNode(" " + text));
        }
        const eqLbl = $("chkEquity") ? $("chkEquity").parentElement : null;
        if(cfg.compareMode === "etf" || cfg.isETFPage){
          if(cmp) cmp.style.display = "flex";
          setLabel(cmp, "Index");
          setLabel(prim, "ETF");
          setLabel(eqLbl, "Strategic Equity");
        } else {
          if(cmp) cmp.style.display = "none";
          setLabel(prim, "Target");
          setLabel(eqLbl, "Strategic Equity");
        }
      })();
      if ($("btnRealTime")) { $("btnRealTime").textContent = `Real Time->${cfg.realTimeCode || cfg.pageKey || ""}`; }
      if ($("bcChartTitle")) {
        const qpType = new URLSearchParams(location.search).get("type") || "";
        const isEtfView = ((cfg.compareMode || "").toLowerCase() === "etf") || !!cfg.isETFPage || /^etf$/i.test(qpType);
        $("bcChartTitle").textContent = isEtfView ? "ETF vs Strategic Equity" : "Target vs Strategic Equity";
      }

      
      // Load data sources.
      // - default: single asset (cfg.indexCsv + cfg.moneyGrowTxt)
      // - cfg.mode === "combined": multiple index csvs aligned against a single moneygrow (MoneyGrow_All style)
      // - cfg.mode === "combo_example": build a synthetic portfolio from multiple components (each has its own index+moneygrow)
      async function fetchFirstOk(paths){
        const errs=[];
        for(const p of (paths||[])){
          if(!p) continue;
          try { return await fetchText(p); } catch(e){ errs.push(String(e&&e.message?e.message:e)); }
        }
        throw new Error("All candidates failed: " + errs.join(" ; "));
      }

      let mg = "";
      let idxCsvText = "";
      let idxCsvTexts = null;

      if (cfg.mode === "combo_example" && Array.isArray(cfg.components) && cfg.components.length) {
        // Build combined MoneyGrow (allocate fixed weights to each component strategy equity curve)
        const comps = cfg.components.map(c => ({
          key: c.key,
          label: c.label || c.key,
          w: Number(c.weight || 0),
          csvCandidates: (c.indexCsvCandidates || (c.indexCsv ? [c.indexCsv] : [])),
          mgCandidates: (c.moneyGrowCandidates || (c.moneyGrowTxt ? [c.moneyGrowTxt] : []))
        }));
        const wsum = comps.reduce((a,c)=>a+(isFinite(c.w)?c.w:0),0) || 1;
        for(const c of comps) c.w = (isFinite(c.w)?c.w:0) / wsum;

        // Fetch index csv + moneygrow for each component (with fallbacks).
        const idxTexts = [];
        const mgTexts = [];
        for(const c of comps){
          idxTexts.push(await fetchFirstOk(c.csvCandidates));
          mgTexts.push(await fetchFirstOk(c.mgCandidates));
        }

        // Parse CSV (expects header with date + OHLC columns; tolerant to 'Date'/'date').
        function parseCsvOHLC(text){
          const lines = (text||"").trim().split(/\r?\n/);
          if(lines.length < 2) return [];
          const header = lines[0].split(",").map(s=>s.trim().toLowerCase());
          const di = header.indexOf("date");
          const oi = header.indexOf("open");
          const hi = header.indexOf("high");
          const li = header.indexOf("low");
          const ci = header.indexOf("close");
          const out=[];
          for(let i=1;i<lines.length;i++){
            const parts = lines[i].split(",");
            if(parts.length < 2) continue;
            const d = (parts[di>=0?di:0]||"").trim().slice(0,10);
            const o = Number(parts[oi>=0?oi:1]);
            const h = Number(parts[hi>=0?hi:2]);
            const l = Number(parts[li>=0?li:3]);
            const c = Number(parts[ci>=0?ci:4]);
            if(!d || !isFinite(c)) continue;
            out.push({d, o:isFinite(o)?o:c, h:isFinite(h)?h:c, l:isFinite(l)?l:c, c});
          }
          return out;
        }

        // Parse MoneyGrow total column (date|total|...)
        function parseMGTotal(text){
          const lines = (text||"").trim().split(/\r?\n/);
          const out=[];
          for(const line of lines){
            const s=(line||"").trim();
            if(!s || s.startsWith("#")) continue;
            const parts=s.split("|");
            if(parts.length < 2) continue;
            const ds=parts[0].trim();
            const d = ds.length===8 ? `${ds.slice(0,4)}-${ds.slice(4,6)}-${ds.slice(6,8)}` : ds.slice(0,10);
            const total = Number(parts[1]);
            if(!d || !isFinite(total)) continue;
            out.push({d, total});
          }
          return out;
        }

        // Align by common dates (intersection), preserving order.
        const idxSeries = idxTexts.map(parseCsvOHLC);
        const mgSeries  = mgTexts.map(parseMGTotal);

        const dateSets = idxSeries.map(s=>new Set(s.map(r=>r.d)));
        const mgDateSets = mgSeries.map(s=>new Set(s.map(r=>r.d)));
        // common dates across all index + mg series
        let common = null;
        for(const st of [...dateSets, ...mgDateSets]){
          if(common===null) common = new Set(st);
          else common = new Set([...common].filter(x=>st.has(x)));
        }
        const commonArr = (common ? Array.from(common) : []).sort();

        // Fast maps
        const idxMaps = idxSeries.map(s=>new Map(s.map(r=>[r.d,r])));
        const mgMaps  = mgSeries.map(s=>new Map(s.map(r=>[r.d,r.total])));

        // Normalize each index series to start close = 1 before combining
        const norm0 = idxSeries.map((s, i)=>{
          const firstD = commonArr.find(d=>idxMaps[i].has(d));
          const c0 = firstD ? (idxMaps[i].get(firstD).c) : 1;
          return (isFinite(c0) && c0!==0) ? c0 : 1;
        });

        // Build synthetic combined OHLC
        const outRows = [];
        for(const d of commonArr){
          let o=0,h=0,l=0,c=0;
          for(let i=0;i<comps.length;i++){
            const r = idxMaps[i].get(d);
            if(!r) continue;
            const w = comps[i].w;
            const k = norm0[i];
            o += w * (r.o / k);
            h += w * (r.h / k);
            l += w * (r.l / k);
            c += w * (r.c / k);
          }
          outRows.push({d,o,h,l,c});
        }
        idxCsvText = ["date,open,high,low,close"].concat(outRows.map(r=>`${r.d},${r.o},${r.h},${r.l},${r.c}`)).join("\n");

        // Build synthetic combined MoneyGrow: weighted sum of each strategy's total, normalized to start=1
        const firstTotals = comps.map((c,i)=>{
          const firstD = commonArr.find(d=>mgMaps[i].has(d));
          const t0 = firstD ? mgMaps[i].get(firstD) : 1;
          return (isFinite(t0) && t0!==0) ? t0 : 1;
        });
        const mgLines=[];
        for(const d of commonArr){
          let tot=0;
          for(let i=0;i<comps.length;i++){
            const t = mgMaps[i].get(d);
            if(!isFinite(t)) continue;
            tot += comps[i].w * (t / firstTotals[i]);
          }
          mgLines.push(`${d}|${tot}`);
        }
        mg = mgLines.join("\n");

        // Also keep normalized component index closes for overlay (aligned to common dates)
        const compCloses = comps.map((c,i)=> commonArr.map(d=>{
          const r = idxMaps[i].get(d);
          return r ? (r.c / norm0[i]) : NaN;
        }));
        cfg._comboComponents = comps.map((c,i)=>({ key:c.key, label:c.label||c.key, ys: compCloses[i] }));

        // Keep a label for UI
        cfg._comboLabel = cfg.comboLabel || "Portfolio (equal weights)";
      } else {
        mg = await fetchText(cfg.moneyGrowTxt);
      }

      // Trade_Process (runtime thresholds) is optional
      let tpText = "";
      try { if (cfg.tradeProcessTxt) tpText = await fetchText(cfg.tradeProcessTxt); } catch(e) { tpText = ""; }

let data;
      if (cfg.mode === "combo_example" && idxCsvText) {
        // synthetic portfolio built above
        data = await buildDataSingle(idxCsvText, mg);
      } else if (cfg.mode === "combined" && Array.isArray(cfg.indices)) {
        // combined: multiple index csv
        // cfg.indices can be either:
        //  - ["path1.csv", "path2.csv", ...]
        //  - [{key,label,csv:"path.csv"}, ...]
        const csvs = [];
        for (const item of cfg.indices) {
          const path = (typeof item === "string") ? item : (item && item.csv);
          if (!path) throw new Error("Invalid cfg.indices item (missing csv path)");
          csvs.push(await fetchText(path));
        }
        data = await buildDataCombined(csvs, mg);
      } else {
        const idxCsv = await fetchText(cfg.indexCsv);
        data = await buildDataSingle(idxCsv, mg);
      }

      // parse runtime sell thresholds from Trade_Process
      data.runtime = parseRuntimeParams(tpText);
      if (cfg.mode === "combo_example" && Array.isArray(cfg._comboComponents)) {
        data.comboComponents = cfg._comboComponents;
      }


      // curve stats chips
      (async function(){
        const host = $("bcCurveStats");
        if(!host) return;
        function pctLine(v){ return Number.isFinite(v) ? (v.toFixed(2) + "%") : "N/A"; }
        function addChip(title, cagrPct, maxDDPct, period){
          const d = document.createElement("div");
          d.className = "curve-stat";
          if(/Strategic Equity/i.test(String(title||""))) d.classList.add("eq-good");
          d.innerHTML = `<div class="t">${title}</div><div class="v">CAGR: ${pctLine(cagrPct)}<br/>MaxDD: ${pctLine(maxDDPct)}<br/>MaxDD Period: ${sanitizePeriodText(period) || "N/A"}</div>`;
          host.appendChild(d);
        }
        async function fetchMetrics(cands){
          try {
            if(!Array.isArray(cands) || !cands.length) return null;
            const txt = await fetchFirstOk(cands);
            return parseAccountMetrics(txt);
          } catch(_e){
            return null;
          }
        }
        host.innerHTML = "";
        const qpType = new URLSearchParams(location.search).get("type") || "";
        const isEtfView = ((cfg.compareMode || "").toLowerCase() === "etf") || !!cfg.isETFPage || /^etf$/i.test(qpType);
        const cands = (cfg._candidates || {});
        if(isEtfView){
          const baseMetrics = await fetchMetrics(cands.baseAccCandidates || []);
          const primaryMetrics = await fetchMetrics(cands.primaryAccCandidates || cands.accCandidates || []);
          addChip(`Index${cfg.rightLabelIndex ? ` (${cfg.rightLabelIndex})` : ""}`,
            Number.isFinite(baseMetrics && baseMetrics.targetCagr) ? baseMetrics.targetCagr : NaN,
            Number.isFinite(baseMetrics && baseMetrics.targetMaxDD) ? baseMetrics.targetMaxDD : NaN,
            (baseMetrics && baseMetrics.targetMaxDDPeriod) || "");
          addChip(`ETF${cfg.rightLabelEtf ? ` (${cfg.rightLabelEtf})` : ""}`,
            Number.isFinite(primaryMetrics && primaryMetrics.targetCagr) ? primaryMetrics.targetCagr : NaN,
            Number.isFinite(primaryMetrics && primaryMetrics.targetMaxDD) ? primaryMetrics.targetMaxDD : NaN,
            (primaryMetrics && primaryMetrics.targetMaxDDPeriod) || "");
          addChip("Strategic Equity",
            Number.isFinite(primaryMetrics && primaryMetrics.equityCagr) ? primaryMetrics.equityCagr : NaN,
            Number.isFinite(primaryMetrics && primaryMetrics.equityMaxDD) ? primaryMetrics.equityMaxDD : NaN,
            (primaryMetrics && primaryMetrics.equityMaxDDPeriod) || "");
        } else {
          const metrics = await fetchMetrics(cands.baseAccCandidates || cands.accCandidates || []);
          addChip(`Target${cfg.rightLabelIndex ? ` (${cfg.rightLabelIndex})` : ""}`,
            Number.isFinite(metrics && metrics.targetCagr) ? metrics.targetCagr : NaN,
            Number.isFinite(metrics && metrics.targetMaxDD) ? metrics.targetMaxDD : NaN,
            (metrics && metrics.targetMaxDDPeriod) || "");
          addChip("Strategic Equity",
            Number.isFinite(metrics && metrics.equityCagr) ? metrics.equityCagr : NaN,
            Number.isFinite(metrics && metrics.equityMaxDD) ? metrics.equityMaxDD : NaN,
            (metrics && metrics.equityMaxDDPeriod) || "");
        }
      })();

      // initial render
      const rerender = () => {
        renderMain(data);
        if (!cfg.noIndicators) renderIndicator(data);
      };

      // ensure first draw happens after layout settles (fixes DAX indicator initial wrong sizing)
      rerender();
      requestAnimationFrame(() => requestAnimationFrame(rerender));

      // wire controls
const baseIds = ["chkCmpIndex", "chkIndex", "chkNasdaq", "chkChina", "chkGold", "chkEquity"];
const indicatorIds = ["chkRSI", "chkMed", "chkDeri", "chkAccu", "chkST"];
const ids = cfg.noIndicators ? baseIds : baseIds.concat(indicatorIds);

function enforceIndicatorExclusive(changedId){
  if(cfg.noIndicators) return;
  const changed = $(changedId);
  if(!changed || !changed.checked) return;
  if(!indicatorIds.includes(changedId)) return;
  for(const otherId of indicatorIds){
    if(otherId === changedId) continue;
    const other = $(otherId);
    if(other) other.checked = false;
  }
}

for (const id of ids) {
  const el = $(id);
  if (!el) continue;
  el.addEventListener("change", () => {
    enforceIndicatorExclusive(id);
    rerender();
  });
}


      bindCursor($("mainCanvas"), data, rerender);
      if (!cfg.noIndicators) bindCursor($("indicatorCanvas"), data, rerender);
      wireModal();

      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus("Failed to load data. Check paths and console.");
      const el = $("bcCursorInfo");
      if (el) el.textContent = String(e);
    }
  }

  main();
})();
