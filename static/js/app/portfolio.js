// BroadCycle Portfolio Builder (front-end skeleton)
//
// Local demo:
// - Saves portfolios into localStorage per user.
// Production:
// - Replace save/load with Worker endpoints + KV/D1.

(function () {
  const $ = (id) => document.getElementById(id);
  const ST_KEY = "bc_portfolios_v1";

  async function fetchJSON(path) {
    const r = await fetch(path, { cache: "no-store" });
    if (!r.ok) throw new Error(`Failed to fetch ${path}: ${r.status}`);
    return await r.json();
  }

  function readAll() {
    try { return JSON.parse(localStorage.getItem(ST_KEY) || "{}") || {}; } catch { return {}; }
  }
  function writeAll(obj) {
    localStorage.setItem(ST_KEY, JSON.stringify(obj));
  }

  function getUserKey() {
    const sess = window.BC_AUTH.readSession();
    return sess ? (sess.email || "") : "guest";
  }

  function normalizeWeights(rows) {
    const sum = rows.reduce((a, r) => a + (Number(r.weight) || 0), 0);
    if (sum <= 0) return rows;
    return rows.map((r) => ({ ...r, weight: (Number(r.weight) || 0) * 100 / sum }));
  }

  function tableRow(ticker, name, weight) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input class="input" data-k="ticker" value="${escapeHTML(ticker || "")}"/></td>
      <td><input class="input" data-k="name" value="${escapeHTML(name || "")}"/></td>
      <td><input class="input" data-k="weight" type="number" min="0" step="0.1" value="${Number(weight || 0).toFixed(2)}"/></td>
      <td><button class="btn ghost" data-act="del">Remove</button></td>
    `;
    return tr;
  }

  function escapeHTML(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  async function main() {
    window.BC_UI && window.BC_UI.bindMobileMenu && window.BC_UI.bindMobileMenu();
    window.BC_AUTH && window.BC_AUTH.renderUserArea && window.BC_AUTH.renderUserArea();

    const ent = await window.BC_AUTH.getEntitlements();
    const paywall = $("bcPaywall");
    if (!window.BC_AUTH.isPaidTier(ent.tier)) {
      if (paywall) {
        paywall.hidden = false;
        paywall.innerHTML = `<div class="tile-title">Paid feature</div><div class="tile-desc">Portfolio Builder is available for paid users. Please sign in and subscribe.</div>`;
      }
      return;
    }

    const funds = await fetchJSON("/static/data/funds.json");
    const fundList = (funds && funds.funds) ? funds.funds : [];

    const tbody = $("pfTable").querySelector("tbody");
    const st = $("pfStatus");
    const pfId = $("pfId");
    const cap = $("pfCapital");
    const start = $("pfStart");
    const fSearch = $("pfFundSearch");

    // Default start = today
    if (!start.value) {
      const d = new Date();
      start.value = d.toISOString().slice(0, 10);
    }

    function collectRows() {
      const rows = [];
      for (const tr of tbody.querySelectorAll("tr")) {
        const get = (k) => tr.querySelector(`[data-k="${k}"]`).value;
        rows.push({
          ticker: get("ticker").trim(),
          name: get("name").trim(),
          weight: Number(get("weight")) || 0,
        });
      }
      return rows.filter((r) => r.ticker);
    }

    function renderRows(rows) {
      tbody.innerHTML = "";
      for (const r of rows) tbody.appendChild(tableRow(r.ticker, r.name, r.weight));
    }

    function findTopFund(q) {
      const z = (q || "").toLowerCase().trim();
      if (!z) return null;
      return fundList.find((f) =>
        (f.ticker || "").toLowerCase().includes(z) || (f.name || "").toLowerCase().includes(z)
      );
    }

    // Table interactions
    tbody.addEventListener("click", (e) => {
      const t = e.target;
      if (!t || !t.dataset) return;
      if (t.dataset.act === "del") {
        const tr = t.closest("tr");
        if (tr) tr.remove();
      }
    });

    $("pfAddTop").addEventListener("click", () => {
      const f = findTopFund(fSearch.value);
      if (!f) {
        st.textContent = "No matching fund.";
        return;
      }
      st.textContent = "";
      tbody.appendChild(tableRow(f.ticker, f.name, 10));
    });

    $("pfSave").addEventListener("click", () => {
      const id = pfId.value.trim() || "PF-0001";
      const rows = normalizeWeights(collectRows());

      const payload = {
        id,
        initial_capital: Number(cap.value) || 0,
        start_date: start.value,
        holdings: rows,
        updated_at: new Date().toISOString(),
      };

      const all = readAll();
      const uk = getUserKey();
      all[uk] = all[uk] || {};
      all[uk][id] = payload;
      writeAll(all);
      renderRows(rows);
      st.textContent = `Saved ${id} (weights normalized).`;
    });

    $("pfLoad").addEventListener("click", () => {
      const id = pfId.value.trim() || "PF-0001";
      const all = readAll();
      const uk = getUserKey();
      const payload = all[uk] && all[uk][id] ? all[uk][id] : null;
      if (!payload) {
        st.textContent = `No saved portfolio: ${id}`;
        return;
      }
      cap.value = payload.initial_capital || 0;
      start.value = payload.start_date || start.value;
      renderRows(payload.holdings || []);
      st.textContent = `Loaded ${id}.`;
    });

    // Start with one row
    renderRows([{ ticker: "QQQ", name: "Invesco QQQ Trust", weight: 100 }]);
  }

  main().catch((err) => {
    const st = document.getElementById("pfStatus");
    if (st) st.textContent = err && err.message ? err.message : String(err);
  });
})();
