// BroadCycle Global Explorer
// Data sources:
// - /static/data/markets.json (continents/markets + links)
// - /static/data/entitlements.json + user_tiers.json (access control)
//
// The strategy machine should generate/update these JSON files daily.

(function () {
  const $ = (id) => document.getElementById(id);

  async function fetchJSON(path) {
    const r = await fetch(path, { cache: "no-store" });
    if (!r.ok) throw new Error(`Failed to fetch ${path}: ${r.status}`);
    return await r.json();
  }

  function escapeHTML(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function uniq(arr) {
    const out = [];
    const seen = new Set();
    for (const x of arr || []) {
      if (seen.has(x)) continue;
      seen.add(x);
      out.push(x);
    }
    return out;
  }

  function makePill(label, key, active) {
    const b = document.createElement("button");
    b.className = "pill" + (active ? " active" : "");
    b.textContent = label;
    b.dataset.key = key;
    return b;
  }

  function normalize(s) {
    return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function computeLocks(markets, ent) {
    // Rule summary:
    // - Paid: everything unlocked.
    // - Guest/Free: only preview_percent of markets are visible per continent,
    //   plus markets in allow_free_markets are always visible.
    // - Visible but locked markets show a paywall overlay.
    const paid = window.BC_AUTH.isPaidTier(ent.tier);
    const allow = new Set(ent.allow_free_markets || []);
    const p = Math.max(0.0, Math.min(1.0, ent.preview_percent ?? 0.8));

    const unlocked = new Set();
    const locked = new Set();
    for (const m of markets || []) {
      if (paid) {
        unlocked.add(m.id);
        continue;
      }
      if (allow.has(m.id)) {
        unlocked.add(m.id);
      } else {
        locked.add(m.id);
      }
    }

    // Apply preview slicing per continent for guest/free
    if (!paid) {
      const byC = {};
      for (const m of markets || []) {
        const c = m.continent || "Other";
        if (!byC[c]) byC[c] = [];
        byC[c].push(m);
      }
      for (const c of Object.keys(byC)) {
        const arr = byC[c];
        const n = Math.max(0, Math.floor(arr.length * p));
        // Sort stable by priority/name
        arr.sort((a, b) => (b.priority || 0) - (a.priority || 0) || String(a.name).localeCompare(String(b.name)));
        const previewIds = new Set(arr.slice(0, n).map((x) => x.id));
        for (const m of arr) {
          if (unlocked.has(m.id)) continue;
          if (previewIds.has(m.id)) unlocked.add(m.id);
          else locked.add(m.id);
        }
      }
    }

    return { unlocked, locked, paid };
  }

  function renderAccessBanner(ent, paid) {
    const box = $("bcAccessBanner");
    if (!box) return;
    box.hidden = false;
    const tier = ent.tier || "guest";
    const msg = paid
      ? `You are on <b>${escapeHTML(tier)}</b> tier — full access.`
      : `You are on <b>${escapeHTML(tier)}</b> tier — preview mode (${Math.round((ent.preview_percent || 0.8) * 100)}% visible).`;
    box.innerHTML = `<div class="tile-desc">${msg} <a href="/Home/Auth/">Sign in</a> to upgrade your access.</div>`;
  }

  function marketCard(m, isUnlocked, ent) {
    const funds = Array.isArray(m.funds) ? m.funds : [];
    const fundCount = funds.length;
    const previewLabel = isUnlocked ? "Unlocked" : "Locked";

    const idxLink = m.index_page || (m.index_code ? `/Home/StrategyDetail/?type=index&code=${encodeURIComponent(m.index_code)}` : "#");
    const fundsLink = m.funds_page || (m.id ? `/Home/StrategyDetail/?type=funds&market=${encodeURIComponent(m.id)}` : "#");

    const div = document.createElement("div");
    div.className = "market-card";
    div.innerHTML = `
      <div class="market-head">
        <div>
          <div class="market-title">${escapeHTML(m.name)}</div>
          <div class="market-meta">${escapeHTML(m.region || m.continent || "")}${m.index_code ? ` · Index: <b>${escapeHTML(m.index_code)}</b>` : ""}</div>
        </div>
        <span class="badge ${isUnlocked ? "" : "lock"}">${previewLabel}</span>
      </div>

      <div class="market-actions">
        <a class="btn" href="${idxLink}">Index backtest</a>
        <a class="btn ghost" href="${fundsLink}">Funds (${fundCount})</a>
      </div>
    `;

    if (!isUnlocked) {
      const ov = document.createElement("div");
      ov.className = "overlay-lock";
      ov.innerHTML = `
        <div class="hint">
          This market is available for paid users.
          <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap">
            <a class="btn" href="/Home/Auth/">Sign in</a>
            <a class="btn ghost" href="/Home/Contacts/">Contact for subscription</a>
          </div>
        </div>
      `;
      div.appendChild(ov);
    }
    return div;
  }

  async function main() {
    window.BC_UI && window.BC_UI.bindMobileMenu && window.BC_UI.bindMobileMenu();
    window.BC_AUTH && window.BC_AUTH.renderUserArea && window.BC_AUTH.renderUserArea();

    const [db, ent] = await Promise.all([
      fetchJSON("/static/data/markets.json"),
      window.BC_AUTH.getEntitlements(),
    ]);

    const markets = (db && db.markets) ? db.markets : [];
    const continents = uniq(markets.map((m) => m.continent || "Other"));

    // Build continent bar
    const bar = $("bcContinentBar");
    const grid = $("bcMarketGrid");
    const search = $("bcSearch");
    if (!bar || !grid || !search) return;

    const params = new URLSearchParams(location.search);
    let active = params.get("c") || (db && db.default_continent) || continents[0] || "All";

    const pills = [];
    pills.push(makePill("All", "All", active === "All"));
    for (const c of continents) pills.push(makePill(c, c, active === c));
    bar.replaceChildren(...pills);

    const locks = computeLocks(markets, ent);
    renderAccessBanner(ent, locks.paid);

    function apply() {
      const q = normalize(search.value);
      const list = markets
        .filter((m) => active === "All" || (m.continent || "Other") === active)
        .filter((m) => {
          if (!q) return true;
          const hay = normalize([m.name, m.id, m.index_code, m.region, ...(m.funds || [])].join(" "));
          return hay.includes(q);
        })
        .sort((a, b) => (b.priority || 0) - (a.priority || 0) || String(a.name).localeCompare(String(b.name)));

      grid.innerHTML = "";
      for (const m of list) {
        const isUnlocked = locks.unlocked.has(m.id);
        grid.appendChild(marketCard(m, isUnlocked, ent));
      }

      if (list.length === 0) {
        const empty = document.createElement("div");
        empty.className = "card";
        empty.innerHTML = `<div class="tile-title">No matches</div><div class="tile-desc">Try a different continent or search keyword.</div>`;
        grid.appendChild(empty);
      }
    }

    bar.addEventListener("click", (e) => {
      const t = e.target;
      if (!t || !t.dataset || !t.dataset.key) return;
      active = t.dataset.key;
      for (const b of bar.querySelectorAll(".pill")) b.classList.toggle("active", b.dataset.key === active);
      const u = new URL(location.href);
      if (active === "All") u.searchParams.delete("c");
      else u.searchParams.set("c", active);
      history.replaceState({}, "", u.toString());
      apply();
    });
    search.addEventListener("input", apply);
    apply();
  }

  main().catch((err) => {
    const grid = document.getElementById("bcMarketGrid");
    if (grid) {
      const d = document.createElement("div");
      d.className = "card";
      d.innerHTML = `<div class="tile-title">Failed to load</div><div class="tile-desc">${escapeHTML(err.message || String(err))}</div>`;
      grid.replaceChildren(d);
    }
  });
})();
