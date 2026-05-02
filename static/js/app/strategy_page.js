// strategy_page.js (fix14)
// Sets a synchronous base BC_CFG first so strategy_detail.js can start immediately,
// then enriches labels / realtime info / subtitles from asset_db_new.txt.
(function () {
  const qs = new URLSearchParams(location.search);
  const type = (qs.get("type") || "index").toLowerCase();
  const code = (qs.get("code") || "").trim();
  const key = (qs.get("key") || code.replace(/_PRIMARY$/i, "")).trim();
  const rt = (qs.get("rt") || "").trim();

  const $ = (id) => document.getElementById(id);

  async function fetchJSON(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
    return JSON.parse((await res.text()).replace(/^\uFEFF/, "").trim());
  }
  async function loadAssetDB() {
    const cands = ["/static/data/asset_db_new.txt", "/static/data/asset_db.txt", "/static/data/asset_db.json"];
    let lastErr = null;
    for (const u of cands) {
      try { return await fetchJSON(u); } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("asset_db load failed");
  }
  function findPrimaryETF(entry) {
    const etfs = entry && entry.etfs;
    if (Array.isArray(etfs)) {
      for (const e of etfs) if (String((e && e.alias) || "").toUpperCase() === "PRIMARY") return e || null;
      return null;
    }
    if (etfs && typeof etfs === "object") return etfs.Primary || etfs.PRIMARY || null;
    return null;
  }
  function getStooq(obj) { return (obj && obj.symbols && (obj.symbols.stooq || obj.symbols.yahoo)) || ""; }
  function getName(obj, fallback = "") { return (obj && obj.name) || fallback; }
  function getRealTime(obj, fallback = "") { return (obj && obj.real_time_link) || fallback; }

  if (!code) {
    const msg = "Missing code. Use ?type=index&code=INDIA";
    console.error(msg);
    const st = $("bcStatus") || $("status");
    if (st) st.textContent = msg;
    window.BC_CFG = { realTimeLink: rt, moneyGrowTxt: "/__missing__", indexCsv: "/__missing__", accountTxt: "/__missing__" };
    return;
  }

  const idxDirs = ["/static/index"];
  const recPrimary = "/static/record";
  const recFallback = "/static/record_pub";
  const isETF = (type === "etf" || type === "fund");

  const title = isETF ? `ETF Backtest · ${code}` : `Backtest · ${code}`;
  if ($("bcTitle")) $("bcTitle").textContent = title;
  if ($("bcSubtitle")) $("bcSubtitle").textContent = isETF ? "ETF strategy backtest" : "Target strategy backtest";

  const indexCsvCandidates = [];
  for (const d of idxDirs) {
    indexCsvCandidates.push(`${d}/${code}.csv`);
    if (code.startsWith("^")) indexCsvCandidates.push(`${d}/${code.slice(1)}.csv`);
    if (code.endsWith("_PRIMARY")) indexCsvCandidates.push(`${d}/${code.replace("_PRIMARY", "")}_PRIMARY.csv`);
  }
  const mgCandidates = [
    `${recPrimary}/MoneyGrow_${code}.txt`,
    ...(code.endsWith("_PRIMARY") ? [`${recPrimary}/MoneyGrow_FUND_${code}.txt`] : []),
    `${recFallback}/MoneyGrow_${code}.txt`,
    ...(code.endsWith("_PRIMARY") ? [`${recFallback}/MoneyGrow_FUND_${code}.txt`] : []),
  ];
  const accCandidates = [
    `${recPrimary}/Account_${code}.txt`,
    ...(code.endsWith("_PRIMARY") ? [`${recPrimary}/Account_${code.replace("_PRIMARY", "")}.txt`] : []),
    `${recFallback}/Account_${code}.txt`,
    ...(code.endsWith("_PRIMARY") ? [`${recFallback}/Account_${code.replace("_PRIMARY", "")}.txt`] : []),
  ];
  const tpCandidates = [
    `${recPrimary}/Trade_Process_${code}.txt`,
    `${recPrimary}/Trade_Process_${code.toUpperCase()}.txt`,
    ...(code.endsWith("_PRIMARY") ? [`${recPrimary}/Trade_Process_${code.replace("_PRIMARY", "")}_PRIMARY.txt`] : []),
    `${recFallback}/Trade_Process_${code}.txt`,
    `${recFallback}/Trade_Process_${code.toUpperCase()}.txt`,
    ...(code.endsWith("_PRIMARY") ? [`${recFallback}/Trade_Process_${code.replace("_PRIMARY", "")}_PRIMARY.txt`] : []),
  ];

  if (isETF) {
    const base = code.replace(/_PRIMARY$/i, "");
    const baseCsvCandidates = [];
    for (const d of idxDirs) {
      baseCsvCandidates.push(`${d}/${base}.csv`);
      if (base.startsWith("^")) baseCsvCandidates.push(`${d}/${base.slice(1)}.csv`);
    }
    window.BC_CFG = {
      realTimeLink: rt,
      realTimeCode: code,
      mode: "combined",
      compareMode: "etf",
      isETFPage: true,
      pageKey: key,
      indices: [
        { label: "Index", csv: baseCsvCandidates[0] },
        { label: "ETF", csv: indexCsvCandidates[0] },
      ],
      moneyGrowTxt: mgCandidates[0],
      accountTxt: accCandidates[0],
      tradeProcessTxt: tpCandidates[0],
      equityLabel: "Strategic Equity",
      singleIndexLabel: "Index",
      cmpIndexLabel: "Index",
      primaryIndexLabel: "ETF",
      rightLabelIndex: key,
      rightLabelEtf: code,
      rightLabelEquity: "Strategic Equity",
      _candidates: {
        indexCsvCandidates,
        baseCsvCandidates,
        mgCandidates,
        accCandidates,
        baseAccCandidates: [
          `${recPrimary}/Account_${base}.txt`,
          `${recFallback}/Account_${base}.txt`
        ],
        primaryAccCandidates: accCandidates,
        tpCandidates
      }
    };
  } else {
    window.BC_CFG = {
      realTimeLink: rt,
      realTimeCode: code,
      mode: "single",
      isETFPage: false,
      pageKey: key,
      indexCsv: indexCsvCandidates[0],
      moneyGrowTxt: mgCandidates[0],
      accountTxt: accCandidates[0],
      tradeProcessTxt: tpCandidates[0],
      equityLabel: "Strategic Equity",
      singleIndexLabel: "Target",
      primaryIndexLabel: "Target",
      rightLabelIndex: key,
      rightLabelEquity: "Strategic Equity",
      _candidates: { indexCsvCandidates, mgCandidates, accCandidates, baseAccCandidates: accCandidates, tpCandidates }
    };
  }

  const st = $("bcStatus") || $("status");
  if (st) st.textContent = `Loading ${code}…`;

  // Enrich config asynchronously with asset_db metadata.
  (async () => {
    try {
      const db = await loadAssetDB();
      const entry = (db && (db[key] || db[code.replace(/_PRIMARY$/i, "")])) || null;
      const primary = findPrimaryETF(entry);
      const subtitle = String(isETF ? getName(primary, getName(entry && entry.index, "ETF strategy backtest")) : getName(entry && entry.index, "Target strategy backtest") || "").trim();
      if ($("bcSubtitle")) $("bcSubtitle").textContent = subtitle;
      Object.assign(window.BC_CFG || {}, {
        realTimeLink: isETF ? getRealTime(primary, rt || getRealTime(entry && entry.index, "")) : getRealTime(entry && entry.index, rt || ""),
        realTimeCode: isETF ? (getStooq(primary) || code) : (getStooq(entry && entry.index) || key),
        rightLabelIndex: getStooq(entry && entry.index) || key,
        rightLabelEtf: getStooq(primary) || code,
        rightLabelEquity: "Strategic Equity",
        pageKey: key
      });
      if ($("btnRealTime")) $("btnRealTime").textContent = `Real Time->${window.BC_CFG.realTimeCode || code}`;
    } catch (e) {
      console.warn("asset_db metadata load failed", e);
    }
  })();
})();
