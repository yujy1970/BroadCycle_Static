/* asset_db.js — robust loader for asset_db variants (fix22b) */
(function (global) {
  const CANDIDATES = [
    "/static/data/asset_db.txt",
    "/static/data/asset_db_new.txt",
    "/static/data/asset_db.json",
    "/static/data/asset_db_old.txt"
  ];
  async function fetchJSON(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
    let text = (await res.text()).replace(/^﻿/, "").trim();
    if (text.startsWith("<!doctype") || text.startsWith("<html")) throw new Error(`${url} returned HTML`);
    return JSON.parse(text);
  }
  global.BC_ASSET_DB_PROMISE = (async () => {
    let lastErr = null;
    for (const u of CANDIDATES) {
      try { return { db: await fetchJSON(u), url: u }; } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("asset_db load failed");
  })();
})(window);
