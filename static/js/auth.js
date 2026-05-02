// BroadCycle Auth + Access Control (static-site friendly)
//
// Goals:
// - Local demo: reads /static/data/users.json + entitlements.json
// - Production: replace login()/logout()/getSession() with Worker endpoints.
//
// Security note: static JSON login is NOT secure; it is only for local testing.

(function () {
  const KEY = "bc_session_v1";
  const $ = (id) => document.getElementById(id);

function initMobileNav(){
  const sidebar = document.querySelector(".sidebar");
  if(!sidebar) return;
  const nav = sidebar.querySelector(".nav");
  if(!nav) return;

  // Build select only once
  if(sidebar.querySelector(".mobile-nav")) return;

  const links = Array.from(nav.querySelectorAll("a.nav-item"))
    .filter(a => a.getAttribute("href"));

  if(links.length === 0) return;

  const wrap = document.createElement("div");
  wrap.className = "mobile-nav";

  const sel = document.createElement("select");
  for(const a of links){
    const opt = document.createElement("option");
    opt.value = a.getAttribute("href");
    opt.textContent = a.textContent.trim();
    if(a.classList.contains("active")) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", ()=>{ location.href = sel.value; });
  wrap.appendChild(sel);

  // Insert after brand block
  const brand = sidebar.querySelector(".brand");
  if(brand && brand.parentNode){
    brand.insertAdjacentElement("afterend", wrap);
  }else{
    sidebar.insertBefore(wrap, sidebar.firstChild);
  }
}

  async function fetchJSON(path) {
    const r = await fetch(path, { cache: "no-store" });
    if (!r.ok) throw new Error(`Failed to fetch ${path}: ${r.status}`);
    return await r.json();
  }

  function readSession() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.email) return null;
      return obj;
    } catch {
      return null;
    }
  }

  function writeSession(sess) {
    localStorage.setItem(KEY, JSON.stringify(sess));
  }

  function clearSession() {
    localStorage.removeItem(KEY);
  }

  // --------- UI helpers ---------
  function bindMobileMenu() {
    const btn = $("bcMenuBtn");
    const sb = $("bcSidebar");
    if (!btn || !sb) return;
    btn.addEventListener("click", () => sb.classList.toggle("open"));

    // Tap outside closes
    document.addEventListener("click", (e) => {
      if (window.matchMedia("(max-width: 860px)").matches) {
        if (!sb.classList.contains("open")) return;
        const t = e.target;
        if (t === sb || sb.contains(t) || t === btn || btn.contains(t)) return;
        sb.classList.remove("open");
      }
    });
  }

  async function getEntitlements() {
    // entitlements.json defines the rule knobs (preview %, allowlists)
    // user_tiers.json defines paid/free users, portfolio permissions etc.
    const [ent, tiers] = await Promise.all([
      fetchJSON("/static/data/entitlements.json"),
      fetchJSON("/static/data/user_tiers.json"),
    ]);

    const sess = readSession();
    const email = sess ? sess.email : null;
    const tier = email && tiers && tiers[email] ? tiers[email] : "guest";

    return {
      preview_percent: ent.preview_percent ?? 0.8,
      allow_free_markets: ent.allow_free_markets ?? [],
      allow_free_funds: ent.allow_free_funds ?? [],
      tier,
    };
  }

  function isPaidTier(tier) {
    return tier === "paid" || tier === "pro" || tier === "vip";
  }

  async function login(email, password) {
    const users = await fetchJSON("/static/data/users.json");
    const u = (users || []).find((x) => (x.email || "").toLowerCase() === (email || "").toLowerCase());
    if (!u) throw new Error("Unknown account");
    if ((u.password || "") !== password) throw new Error("Wrong password");

    // In production, replace this with a signed token from Worker
    writeSession({ email: u.email, name: u.name || u.email, ts: Date.now() });
    return readSession();
  }

  function logout() {
    clearSession();
  }

  function renderUserArea() {
    const el = $("bcUserArea");
    if (!el) return;
    const sess = readSession();
    if (!sess) {
      el.innerHTML = `
        <a class="btn ghost" href="/Home/Auth/">Sign in</a>
      `;
      return;
    }

    el.innerHTML = `
      <span class="badge">${escapeHTML(sess.name || sess.email)}</span>
      <a class="btn ghost" href="/Home/Portfolio/">Portfolio</a>
      <button class="btn ghost" id="bcLogoutBtn">Logout</button>
    `;
    const b = $("bcLogoutBtn");
    if (b) b.addEventListener("click", () => { logout(); location.href = "/Home/Explorer/"; });
  }

  function escapeHTML(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  window.BC_UI = { bindMobileMenu };
  window.BC_AUTH = {
    readSession,
    getEntitlements,
    isPaidTier,
    login,
    logout,
    renderUserArea,
  };
})();
