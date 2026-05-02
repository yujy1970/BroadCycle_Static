/* explorer_assetdb.js (fix11)
Adds Target Max Drawdown to the subline under market name:
  "<YYYY-MM-DD HH:MM> | Close <Target Latest Close> | CAGR <Target Annualized Return (CAGR)>  MDD <Target Max Drawdown>"
Reads from Account_{CODE}.txt line like:
  Target Max Drawdown: -25.12%   (or similar)
Keeps prior behavior from fix10.
*/
(function () {
  const bar = document.getElementById("bcContinentBar");
  const grid = document.getElementById("bcMarketGrid");
  if (!bar || !grid) return;

  const TAB_ORDER = ["North America","Preferred ETF","Preferred Stock","Multi Asset","Asia","Oceania","Africa","Europe","South America"];

  function titleCase(s){
    const raw = String(s||"").trim();
    if (raw.toLowerCase() === "preferred etf") return "Preferred ETF";
    s = raw.toLowerCase();
    return s.split(/\s+/).map(w => w ? (w[0].toUpperCase()+w.slice(1)) : w).join(" ");
  }
  
  function normalizeSector(rawSector, rawContinent, key, idx){
    const s0 = String(rawSector||"").trim();
    const k = String(key||"").toUpperCase();
    const name = String((idx && idx.name) || "");
    const market = String((idx && idx.market) || "").toUpperCase();
    if (s0) {
      const up = s0.toUpperCase().replace(/\s+/g, "_");
      const map = {
        "PREFERRED_STOCK": "Preferred Stock",
        "PREFERRED_ETF": "Preferred ETF",
        "MULTI_ASSET": "Multi Asset",
        "NORTH_AMERICA": "North America",
        "SOUTH_AMERICA": "South America",
        "ASIA": "Asia",
        "OCEANIA": "Oceania",
        "AFRICA": "Africa",
        "EUROPE": "Europe",
        "AMERICAS": "North America"
      };
      return map[up] || s0;
    }
    const PREFERRED_STOCK_KEYS = new Set(["US_AAPL","US_MSFT","US_AMZN","US_NVDA","US_META","US_GOOG","US_GOOGL","US_TSLA"]);
    if (PREFERRED_STOCK_KEYS.has(k) || market === "STOCK") return "Preferred Stock";
    if (/(ETF|TRUST|FUND)/i.test(name) && market !== "STOCK") return "Preferred ETF";

    const c = String(rawContinent||"OTHER").trim().toUpperCase().replace(/\s+/g, "_");
    const cmap = {
      "NORTH_AMERICA": "North America",
      "SOUTH_AMERICA": "South America",
      "ASIA": "Asia",
      "OCEANIA": "Oceania",
      "AFRICA": "Africa",
      "EUROPE": "Europe",
      "AMERICAS": "North America"
    };
    return cmap[c] || "Multi Asset";
  }


  
  function formatPctSmart(val){
    if(val==null || val==="") return null;
    const n = Number(val);
    if(!Number.isFinite(n)) return null;
    let x = n;
    if (Math.abs(x) <= 1.5) x = x * 100.0;
    if (Math.abs(x) > 200 && Math.abs(x) <= 20000) x = x / 100.0;
    return x;
  }
function safeNum(x, fb=999999999){ const n=Number(x); return Number.isFinite(n)?n:fb; }

  function ensureCSS(){
    if (document.getElementById("bcTileCSS_fix11")) return;
    const style = document.createElement("style");
    style.id = "bcTileCSS_fix11";
    style.textContent = `
      @keyframes bcBlinkRed {
        0%,100%{background:#ffe1e1;border-color:#ff4d4d;}
        50%{background:#ffbdbd;border-color:#ff1f1f;}
      }
      @keyframes bcBlinkGreen {
        0%,100%{background:#dcffe8;border-color:#34c26b;}
        50%{background:#bfffd6;border-color:#00b85a;}
      }
      .bc-blink-red{ animation: bcBlinkRed 1.0s infinite; }
      .bc-blink-green{ animation: bcBlinkGreen 1.0s infinite; }

      .bc-tile-head{ display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
      .bc-titlewrap{ min-width:0; }
      .bc-title{ font-weight:800; font-size:14px; line-height:1.2; color:#111; }
      .bc-subline{ margin-top:4px; font-size:12px; color:#111; opacity:0.95; white-space:nowrap; overflow-x:auto; overflow-y:hidden; scrollbar-width:none; -ms-overflow-style:none; }
      .bc-subline::-webkit-scrollbar{ display:none; }
      .bc-righttop{ display:flex; flex-direction:column; align-items:flex-end; justify-content:flex-start; gap:3px; min-width:170px; font-size:12px; color: var(--muted); white-space:nowrap; flex-shrink:0; text-align:right; }
      .bc-righttop strong{ color:#111; }
      .bc-clock{ font-variant-numeric: tabular-nums; color: var(--muted); }
      .bc-key{ font-size:11px; color:var(--muted); line-height:1.1; }

      .bc-box{ border:1px solid var(--line); border-radius:12px; padding:10px; display:flex; align-items:center; justify-content:space-between; gap:10px; background:#fff; }
      .bc-box + .bc-box{ margin-top:10px; }

      .bc-btn{
        display:inline-block;
        padding:8px 12px;
        border-radius:10px;
        border:1px solid rgba(0,0,0,0.18);
        background: linear-gradient(#ffffff, #f2f2f2);
        box-shadow: 0 2px 0 rgba(0,0,0,0.12), 0 6px 14px rgba(0,0,0,0.08);
        text-decoration:none;
        color: #111;
        font-weight:700;
        font-size:12px;
        white-space:nowrap;
        user-select:none;
      }
      .bc-btn:active{
        transform: translateY(1px);
        box-shadow: 0 1px 0 rgba(0,0,0,0.12), 0 4px 10px rgba(0,0,0,0.08);
      }

      .bc-metrics{ display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end; }
      .bc-metric{
        border:1px solid var(--line);
        border-radius:10px;
        padding:6px 8px;
        font-size:12px;
        background:#fff;
        min-width:88px;
        text-align:center;
        color:#111;
      }
      .bc-metric .k{ display:block; font-size:11px; color: var(--muted); }
      .bc-metric .v{ display:block; font-weight:800; color:#111; }

      .bc-safe{ background:#dcffe8 !important; border-color:#34c26b !important; }
      .bc-risk{ background:#ffe1e1 !important; border-color:#ff6b6b !important; }
      .bc-lastday{ background:#ffecec !important; border-color:#ff9a9a !important; }

      @media (max-width: 640px){
        .bc-tile-head{ display:flex; gap:5px; align-items:flex-start; }
        .bc-titlewrap{ min-width:0; flex:1 1 auto; overflow:visible; }
        .bc-title{ font-size:12px; }
        .bc-righttop{ min-width:18px; gap:0px; font-size:5.6px; flex:0 0 auto; align-items:flex-end; }
        .bc-clock{ font-size:5.2px; white-space:nowrap; letter-spacing:-0.50px; }
        .bc-key{ font-size:5.2px; white-space:nowrap; }
        .bc-box{ padding:8px; gap:8px; }
        .bc-btn{ padding:7px 9px; font-size:11px; }
        .bc-metrics{ gap:6px; }
        .bc-metric{ min-width:54px; padding:4px 5px; font-size:9px; }
        .bc-metric .k{ font-size:8px; }
        .bc-subline{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:1px;
          width:100%;
          max-width:none;
          min-width:0;
          font-size:6.2px;
          white-space:nowrap;
          overflow:visible;
          letter-spacing:-0.10px;
        }
        .bc-subline .bc-part{
          display:inline-flex;
          align-items:center;
          white-space:nowrap;
          min-width:0;
          flex:0 0 auto;
        }
        .bc-subline .bc-date{flex:0 1 auto;}
        .bc-subline .bc-cagr{flex:0 0 auto;}
        .bc-subline .bc-mdd{flex:0 0 auto;}
        .bc-subline .bc-targetcagr,
        .bc-subline .bc-targetmaxdd{ font-weight:700; }
      }
    `;
    document.head.appendChild(style);
  }

  async function fetchText(url){
    const r = await fetch(url, { cache:"no-store" });
    if (!r.ok) throw new Error(`${url} ${r.status}`);
    return await r.text();
  }

  function parseMarketCloseTime(marketClose){
    const s = String(marketClose||"").trim();
    const m = s.match(/(\d{1,2}:\d{2})/);
    return m ? m[1] : "";
  }
  function extractDateOnly(val){
    const s = String(val||"").trim();
    const m = s.match(/(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : s;
  }
  function toMMDD(val){
    const s = String(val||"").trim();
    const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[2]}-${m[3]}`;
    const m2 = s.match(/(\d{2})-(\d{2})/);
    return m2 ? `${m2[1]}-${m2[2]}` : s;
  }
  function toDesktopOrMobileDate(val){
    const s = String(val||"").trim();
    const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return s;
    const isMobile = (window.innerWidth || 9999) <= 640;
    return isMobile ? `${m[2]}-${m[3]}` : `${m[1]}-${m[2]}-${m[3]}`;
  }

  function sanitizePeriodText(s){
    const txt = String(s || "").trim();
    if (!txt) return "";
    const ds = [...txt.matchAll(/(\d{4}-\d{2}-\d{2})/g)].map(m => m[1]);
    if (ds.length >= 2) return `${ds[0]} → ${ds[1]}`;
    if (ds.length === 1) return ds[0];
    return txt;
  }

  function extractLastPctOrNumber(s){
    const txt = String(s || "");
    const pcts = [...txt.matchAll(/([+-]?\d+(?:\.\d+)?)\s*%/g)].map(x => x[1]);
    if (pcts.length) return pcts[pcts.length - 1].trim();
    const nums = [...txt.matchAll(/([+-]?\d+(?:\.\d+)?)/g)].map(x => x[1]);
    return nums.length ? nums[nums.length - 1].trim() : null;
  }

  function parseAccountText(text){
    const full = String(text || "").replace(/\r/g, "");
    const out = {
      current_date_raw: null,
      current_date: null,
      annualized_return: null,
      max_dd: null,
      max_dd_period: null,
      today_last_day: null,
      current_position: null,
      exit_today: null,
      hold_today: null,
      target_latest_close: null,
      target_cagr: null,
      target_max_dd: null,
      target_max_dd_period: null
    };
    const forceNeg = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? (n > 0 ? -Math.abs(n) : n) : null;
    };
    const lines = full.split(/\n+/).map(s => String(s||"").trim()).filter(Boolean);
    const lineMap = new Map();
    for (const ln of lines){
      const m = ln.match(/^([^:]+):\s*(.*)$/);
      if(!m) continue;
      const key = String(m[1]||"").trim().toLowerCase().replace(/\s+/g, ' ');
      lineMap.set(key, String(m[2]||"").trim());
    }
    const get = (...labels) => {
      for (const lb of labels){
        const k = String(lb||"").trim().toLowerCase().replace(/\s+/g, ' ');
        if (lineMap.has(k)) return lineMap.get(k);
      }
      return null;
    };

    out.current_date_raw = get('current date');
    out.current_date = extractDateOnly(out.current_date_raw || "");
    out.target_latest_close = get('target latest close', 'target latestclose', 'target close', 'current price', 'close');

    const tc = get('target annualized return (cagr)', 'target cagr');
    if (tc != null) out.target_cagr = String(extractLastPctOrNumber(tc));

    const tm = get('target max drawdown', 'target maximum drawdown', 'target maxdd');
    if (tm != null) {
      const n = forceNeg(extractLastPctOrNumber(tm));
      out.target_max_dd = n != null ? String(n) : null;
    }
    const tmp = get('target max drawdown period', 'target maximum drawdown period', 'target maxdd period');
    if (tmp != null) out.target_max_dd_period = sanitizePeriodText(tmp);

    const ec = get('annualized return', 'cagr');
    if (ec != null) out.annualized_return = String(extractLastPctOrNumber(ec));
    const em = get('max drawdown', 'maximum drawdown', 'maxdd');
    if (em != null) {
      const n = forceNeg(extractLastPctOrNumber(em));
      out.max_dd = n != null ? String(n) : null;
    }
    const emp = get('max drawdown period', 'maximum drawdown period', 'maxdd period');
    if (emp != null) out.max_dd_period = sanitizePeriodText(emp);

    const todayLast = get('today the last day');
    if (todayLast) out.today_last_day = todayLast;
    const pos = get('current position');
    if (pos) out.current_position = pos;
    const exit = get('exit signal trigger today?');
    if (exit) out.exit_today = exit;
    const hold = get('hold signal trigger today?');
    if (hold) out.hold_today = hold;
    return out;
  }
  async function fetchFirstText(candidates){
    for (const u of candidates){
      try { return await fetchText(u); } catch(e){}
    }
    return null;
  }

  function setBaseClass(card, acc){
    card.classList.remove("bc-safe","bc-risk","bc-lastday");
    const pos = (acc.current_position||"").trim();
    const last = (acc.today_last_day||"").toLowerCase().trim();

    if (!pos || pos.toLowerCase()==="none"){
      card.classList.add("bc-risk");
      return;
    }
    if (last==="yes"){
      card.classList.add("bc-lastday");
      return;
    }
    card.classList.add("bc-safe");
  }

  function applyBlink(card, acc){
    const exit = String(acc.exit_today||"").toLowerCase().trim();
    const hold = String(acc.hold_today||"").toLowerCase().trim();
    card.classList.remove("bc-blink-red","bc-blink-green");
    if (exit === "yes") { card.classList.add("bc-blink-red"); return; }
    if (hold === "yes") { card.classList.add("bc-blink-green"); return; }
  }

  function mkMetric(k, v){
    const d=document.createElement("div");
    d.className="bc-metric";
    const kk=document.createElement("span"); kk.className="k"; kk.textContent=k;
    const vv=document.createElement("span"); vv.className="v"; vv.textContent=v;
    d.appendChild(kk); d.appendChild(vv);
    return d;
  }

  function mkBox(btnText, href){
    const box=document.createElement("div");
    box.className="bc-box";

    const left=document.createElement("div");
    const btn=document.createElement("a");
    btn.className="bc-btn";
    btn.textContent=btnText;
    btn.href=href;
    left.appendChild(btn);

    const right=document.createElement("div");
    right.className="bc-metrics";
    right.appendChild(mkMetric("CAGR","…"));
    right.appendChild(mkMetric("MaxDD","…"));

    box.appendChild(left);
    box.appendChild(right);
    return box;
  }

  function mkCard(it){
    const el=document.createElement("div");
    el.className="market-tile";
    el.dataset.code = it.code;
    el.dataset.closeTime = it.closeTime || "";
    el.dataset.hasETF = it.hasPrimaryETF ? "1":"0";
    el.dataset.tzName = it.tzName || "";
    el.dataset.tzOffset = it.tzOffset || "";
    el.style.border="1px solid var(--line)";
    el.style.borderRadius="14px";
    el.style.padding="12px";
    el.style.color="#111";

    const head=document.createElement("div");
    head.className="bc-tile-head";

    const titleWrap=document.createElement("div");
    titleWrap.className="bc-titlewrap";

    const title=document.createElement("div");
    title.className="bc-title";
    title.textContent = it.name;

    const sub=document.createElement("div");
    sub.className="bc-subline";
    const isMobile = window.innerWidth <= 640;
    sub.innerHTML = isMobile
      ? `<span class="bc-part bc-date"><span class="bc-close">…</span></span><span class="bc-part bc-cagr">CAGR<span class="bc-targetcagr">…</span></span><span class="bc-part bc-mdd">MaxDD<span class="bc-targetmaxdd">…</span></span>`
      : `<span class="bc-close">…</span>&nbsp;|&nbsp; CAGR <span class="bc-targetcagr">…</span>&nbsp;|&nbsp; MaxDD <span class="bc-targetmaxdd">…</span>`;

    titleWrap.appendChild(title);
    titleWrap.appendChild(sub);

    const rt=document.createElement("div");
    rt.className="bc-righttop";
    rt.innerHTML = `<span class="bc-clock" data-role="clock">…</span><span class="bc-key"><strong>${it.code}</strong></span>`;

    head.appendChild(titleWrap);
    head.appendChild(rt);

    const idxBox = mkBox(
      "Backtest",
      `/Home/StrategyDetail/?type=index&code=${encodeURIComponent(it.code)}&key=${encodeURIComponent(it.key)}&rt=${encodeURIComponent(it.realTimeLink||"")}`
    );
    idxBox.dataset.boxType="index";

    el.appendChild(head);
    el.appendChild(idxBox);

    if (it.hasPrimaryETF){
      const etfBox = mkBox(
        "ETF Backtest",
        `/Home/StrategyDetail/?type=etf&code=${encodeURIComponent(it.code + "_PRIMARY")}&key=${encodeURIComponent(it.key)}&fund=PRIMARY&rt=${encodeURIComponent(it.realTimeLink||"")}`
      );
      etfBox.dataset.boxType="etf";
      el.appendChild(etfBox);
    }
    return el;
  }

  async function fillTile(card, code){
    const closeTime = card.dataset.closeTime || "";
    const hasETF = card.dataset.hasETF === "1";

    const accCandidates = [
      `/static/record/Account_${code}.txt`,
      `/static/record/Account_${code.toUpperCase()}.txt`,
      `/static/record_pub/Account_${code}.txt`,
      `/static/record_pub/Account_${code.toUpperCase()}.txt`,
    ];
    const accText = await fetchFirstText(accCandidates);

    if (accText) {
      const acc = parseAccountText(accText);
      setBaseClass(card, acc);
      applyBlink(card, acc);

      const dateOnly = toDesktopOrMobileDate(acc.current_date || "");
      const combinedClose = (dateOnly && closeTime) ? `${dateOnly} ${closeTime}` : (dateOnly || "N/A");

      const closeEl = card.querySelector(".bc-close");
      if (closeEl) closeEl.textContent = combinedClose;

      const latestEl = card.querySelector(".bc-latest");
      if (latestEl) latestEl.textContent = acc.target_latest_close ? acc.target_latest_close : "N/A";

      const tcagrEl = card.querySelector(".bc-targetcagr");
      if (tcagrEl) { const v = formatPctSmart(acc.target_cagr); tcagrEl.textContent = (v!=null) ? (v.toFixed(2).replace(/\.00$/,"") + "%") : "N/A"; }

      const tmaxEl = card.querySelector(".bc-targetmaxdd");
      if (tmaxEl) { let v = formatPctSmart(acc.target_max_dd); if (v!=null && v>0) v = -Math.abs(v); tmaxEl.textContent = (v!=null) ? (v.toFixed(2).replace(/\.00$/,"") + "%") : "N/A"; }

      const idxBox = card.querySelector('[data-box-type="index"]');
      if (idxBox){
        const metrics = idxBox.querySelectorAll(".bc-metric .v");
        if (metrics && metrics.length >= 2){
          const cagrV = formatPctSmart(acc.annualized_return);
          metrics[0].textContent = (cagrV!=null) ? (cagrV.toFixed(2).replace(/\.00$/,"") + "%") : "N/A";
          let v = formatPctSmart(acc.max_dd);
          if (v!=null && v>0) v = -Math.abs(v);
          metrics[1].textContent = (v!=null) ? (v.toFixed(2).replace(/\.00$/,"") + "%") : "N/A";
        }
      }
    } else {
      for (const cls of [".bc-close",".bc-latest",".bc-targetcagr",".bc-targetmaxdd"]){
        const el = card.querySelector(cls);
        if (el) el.textContent = "N/A";
      }
      const idxBox = card.querySelector('[data-box-type="index"]');
      if (idxBox){
        const metrics = idxBox.querySelectorAll(".bc-metric .v");
        if (metrics && metrics.length >= 2){
          metrics[0].textContent = "N/A";
          metrics[1].textContent = "N/A";
        }
      }
    }

    if (!hasETF) return;

    const etfCode = `${code}_PRIMARY`;
    const etfCandidates = [
      `/static/record/Account_${etfCode}.txt`,
      `/static/record/Account_${etfCode.toUpperCase()}.txt`,
      `/static/record_pub/Account_${etfCode}.txt`,
      `/static/record_pub/Account_${etfCode.toUpperCase()}.txt`,
    ];
    const etfText = await fetchFirstText(etfCandidates);
    const etfAcc = etfText ? parseAccountText(etfText) : null;

    const etfBox = card.querySelector('[data-box-type="etf"]');
    if (etfBox){
      const metrics = etfBox.querySelectorAll(".bc-metric .v");
      if (metrics && metrics.length >= 2){
        { const v = etfAcc ? formatPctSmart(etfAcc.annualized_return) : null; metrics[0].textContent = (v!=null) ? (v.toFixed(2).replace(/\.00$/,"") + "%") : "N/A"; }
        { let v = etfAcc ? formatPctSmart(etfAcc.max_dd) : null; if (v!=null && v>0) v = -Math.abs(v); metrics[1].textContent = (v!=null) ? (v.toFixed(2).replace(/\.00$/,"") + "%") : "N/A"; }
      }
    }
  }



  function pad2(n){ return String(n).padStart(2,'0'); }

  function formatNowForZone(tzName, tzOffset){
    // Desktop: YYYY-MM-DD HH:MM ; Mobile: MM-DD HH:MM
    const short = (window.innerWidth || 9999) <= 640;
    const pack = (year, month, day, hour, minute) => ({
      date: short ? `${month}-${day}` : `${year}-${month}-${day}`,
      time: `${hour}:${minute}`
    });
    try {
      if (tzName) {
        const fmt = new Intl.DateTimeFormat('en-CA', {
          timeZone: tzName,
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false
        });
        const parts = fmt.formatToParts(new Date());
        const get = (t) => { const p = parts.find(x => x.type === t); return p ? p.value : ''; };
        return pack(get('year'), get('month'), get('day'), get('hour'), get('minute'));
      }
    } catch (_) {}

    const s = String(tzOffset || '').trim();
    let m = s.match(/UTC\s*([+-])\s*(\d{2}):(\d{2})/i);
    if (!m) m = s.match(/([+-])(\d{2}):(\d{2})/);
    if (m) {
      const sign = (m[1] === '-') ? -1 : 1;
      const hh = parseInt(m[2], 10) || 0;
      const mm = parseInt(m[3], 10) || 0;
      const offsetMin = sign * (hh * 60 + mm);
      const now = new Date();
      const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
      const t = new Date(utcMs + offsetMin * 60000);
      return pack(String(t.getUTCFullYear()), pad2(t.getUTCMonth()+1), pad2(t.getUTCDate()), pad2(t.getUTCHours()), pad2(t.getUTCMinutes()));
    }

    const d = new Date();
    return pack(String(d.getFullYear()), pad2(d.getMonth()+1), pad2(d.getDate()), pad2(d.getHours()), pad2(d.getMinutes()));
  }

  function updateVisibleMarketClocks(){
    const cards = Array.from(document.querySelectorAll('.market-tile'));
    for (const card of cards){
      const el = card.querySelector('[data-role="clock"]');
      if(!el) continue;
      const tzName = card.dataset.tzName || '';
      const tzOffset = card.dataset.tzOffset || '';
      const t = formatNowForZone(tzName, tzOffset);
      el.textContent = `${t.date} ${t.time}`;
    }
  }

  async function mapLimit(items, limit, fn){
    let i=0;
    const workers = Array.from({length: Math.min(limit, items.length)}, async ()=>{
      while (i < items.length){
        const idx=i++;
        await fn(items[idx], idx);
      }
    });
    await Promise.all(workers);
  }

  window.addEventListener("load", async () => {
    ensureCSS();
    const { db } = await window.BC_ASSET_DB_PROMISE;

    const buckets = new Map();
    for (const t of TAB_ORDER) buckets.set(t, []);

    // De-dup helper: some asset_db versions contain both "US_AAPL" and "AAPL" style keys.
    // For Preferred Stock/ETF tabs we keep the higher-priority entry per symbol to avoid double tiles.
    const _seenByTabSymbol = {
      "Preferred Stock": new Map(),
      "Preferred ETF": new Map()
    };
    function _normSymForDedup(it){
      const raw = String((it && (it.symbol || it.key || it.code)) || "").toUpperCase().trim();
      // strip common prefixes/suffixes
      let sym = raw.replace(/^US_/, "").replace(/_PRIMARY$/, "").replace(/\s+/g,"");
      // Treat Alphabet share classes as one "GOOGLE" tile in Preferred Stock tab
      if (sym === "GOOG" || sym === "GOOGL") sym = "GOOGLE";
      return sym;
    }
    function _priorityForDedup(it){
      const k = String((it && it.key) || "").toUpperCase();
      const t = String((it && it.marketType) || "").toUpperCase();
      let p = 0;
      if (k.startsWith("US_")) p += 20;
      if (t === "US" || t === "USA") p += 10;
      if (k.includes("_PRIMARY")) p -= 5;
      return p;
    }


    for (const [key, v] of Object.entries(db||{})){
      const idx = v && v.index ? v.index : null;
      if (!idx) continue;

      const marketType = String(idx.market||"").toUpperCase();
      const sector = normalizeSector(idx.sector, idx.continent, key, idx);
      const code = key;
      const name = idx.name || key;
      const rank = safeNum(idx.rank_id);
      const closeTime = parseMarketCloseTime(idx.market_close);

      const tzNameMatch = String(idx.market_close||'').match(/([A-Za-z_]+\/[A-Za-z_]+)/);
      const tzName = tzNameMatch ? tzNameMatch[1] : '';
      const tzOffset = String(idx.trading_timezone||'').trim();

      let hasPrimaryETF = false;
      if (marketType !== "STOCK") {
        const rawEtfs = v && v.etfs ? v.etfs : null;
      const etfs = Array.isArray(rawEtfs) ? rawEtfs : [];
      if (Array.isArray(rawEtfs)) {
        hasPrimaryETF = etfs.some(e => String(e && e.alias || "").toUpperCase() === "PRIMARY");
      } else if (rawEtfs && typeof rawEtfs === 'object') {
        hasPrimaryETF = !!(rawEtfs.Primary || rawEtfs.PRIMARY);
      }
      }

      const item = { key, code, name, marketType, sector, rank_id: rank, hasPrimaryETF, closeTime, tzName, tzOffset, realTimeLink: idx.real_time_link || "" };
      // Bucket by sector (preferred), fallback handled in normalizeSector().
      if (!buckets.has(sector)) buckets.set(sector, []);

      // De-dup for Preferred Stock/ETF (avoid showing the same symbol twice when db has both prefixed and non-prefixed keys)
      if (sector === "Preferred Stock" || sector === "Preferred ETF") {
        const sym = _normSymForDedup(item);
        const seen = _seenByTabSymbol[sector];
        const pri = _priorityForDedup(item);
        const prev = seen.get(sym);
        if (prev) {
          const prevPri = prev._pri || 0;
          if (prevPri >= pri) {
            continue;
          } else {
            const arr = buckets.get(sector) || [];
            const j = arr.findIndex(x => x && x.key === prev.key);
            if (j >= 0) arr.splice(j, 1);
          }
        }
        item._pri = pri;
        seen.set(sym, item);
      }

      buckets.get(sector).push(item);
    }

    for (const [k, arr] of buckets) arr.sort((a,b)=>a.rank_id-b.rank_id);

    bar.innerHTML="";
    let active = TAB_ORDER.find(t => (buckets.get(t)||[]).length>0) || (Array.from(buckets.keys())[0] || "Multi Asset");
    for (const t of TAB_ORDER){ if ((buckets.get(t)||[]).length){ active=t; break; } }

    const availableTabs = TAB_ORDER.filter(t => (buckets.get(t)||[]).length);
    function tabFromUrl(){
      const params = new URLSearchParams(location.search);
      const q = params.get("tab");
      if (q){
        const hit = availableTabs.find(t => t.toLowerCase() === String(q).toLowerCase());
        if (hit) return hit;
      }
      const h = decodeURIComponent((location.hash || "").replace(/^#/, ""));
      if (h){
        const hit = availableTabs.find(t => t.toLowerCase().replace(/\s+/g,"-") === h.toLowerCase() || t.toLowerCase() === h.toLowerCase());
        if (hit) return hit;
      }
      const saved = sessionStorage.getItem("bcExplorerActiveTab");
      if (saved && availableTabs.includes(saved)) return saved;
      return active;
    }

    function writeTabToUrl(tab, replaceOnly){
      sessionStorage.setItem("bcExplorerActiveTab", tab);
      const params = new URLSearchParams(location.search);
      params.set("tab", tab);
      const next = location.pathname + "?" + params.toString();
      if (replaceOnly) history.replaceState({bcTab:tab}, "", next);
      else history.pushState({bcTab:tab}, "", next);
    }

    function renderTab(tab, opts){
      opts = opts || {};
      if (!availableTabs.includes(tab)) tab = active;
      active = tab;
      grid.innerHTML="";
      const items = buckets.get(tab)||[];
      for (const it of items) grid.appendChild(mkCard(it));

      const cards = Array.from(grid.querySelectorAll(".market-tile"));
      mapLimit(cards, 10, async (card)=>{ try { await fillTile(card, card.dataset.code); } catch(e){ console.error("fillTile failed", card.dataset.code, e); } });
      // Update market clock display (top-right)
      updateVisibleMarketClocks();

      Array.from(bar.querySelectorAll("button")).forEach(x => x.style.borderColor = (x.dataset.tab===tab ? "#222" : "var(--line)"));
      if (opts.updateUrl) writeTabToUrl(tab, !!opts.replaceUrl);
    }

    for (const t of TAB_ORDER){
      const btn=document.createElement("button");
      btn.dataset.tab=t;
      btn.textContent=titleCase(t);
      btn.style.border="1px solid var(--line)";
      btn.style.background="#fff";
      btn.style.borderRadius="999px";
      btn.style.padding="8px 10px";
      btn.style.fontSize="13px";
      btn.style.cursor="pointer";
      btn.style.borderColor = (t===active ? "#222" : "var(--line)");
      btn.addEventListener("click", ()=>renderTab(t, {updateUrl:true}));
      bar.appendChild(btn);
    }

    active = tabFromUrl();
    renderTab(active, {updateUrl:true, replaceUrl:true});
    window.addEventListener("popstate", () => {
      const t = tabFromUrl();
      renderTab(t, {updateUrl:false});
    });

    // refresh clocks every minute (and once right away)
    updateVisibleMarketClocks();
    const tick = () => { updateVisibleMarketClocks(); };
    const msToNextMin = 60000 - (Date.now() % 60000);
    setTimeout(() => { tick(); setInterval(tick, 60000); }, msToNextMin);

  });
})();