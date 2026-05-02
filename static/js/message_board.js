(function(){
  const $ = (id)=>document.getElementById(id);
  const LIST = $("mbList");
  const FORM = $("mbForm");
  const NAME = $("mbName");
  const MSG  = $("mbMsg") || $("mbText");
  const SEND = $("mbSend");
  const STATUS = $("mbStatus");

  const LOCAL_KEY = "BC_MESSAGE_BOARD_LOCAL_V1";
  const API_BASE = "/api/messages";
  let selectedId = null;

  function esc(s){
    return (s||"").replace(/[&<>"]/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c]));
  }

  function loadLocal(){
    try{
      const raw = localStorage.getItem(LOCAL_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    }catch(_){
      return [];
    }
  }

  function saveLocal(arr){
    try{ localStorage.setItem(LOCAL_KEY, JSON.stringify(arr)); }catch(_){}
  }

  function render(items){
    LIST.innerHTML = "";
    if(!items || items.length===0){
      LIST.innerHTML = '<div class="msg empty">No messages yet.</div>';
      return;
    }
    for(const it of items){
      const row = document.createElement("div");
      row.className = "msg";
      const who = esc(it.name||"Anonymous");
      const when = esc(it.ts||"");
      const text = esc(it.text||"");
      row.innerHTML = `
        <div class="msg-head">
          <div class="msg-who"><b>${who}</b> <span class="msg-time">${when}</span></div>
          <button class="msg-del" title="Delete">🗑</button>
        </div>
        <div class="msg-body">${text.replace(/\n/g,"<br>")}</div>
      `;
      row.dataset.id = it.id || '';
      row.tabIndex = 0;
      row.addEventListener('click', ()=>{
        selectedId = it.id;
        [...LIST.querySelectorAll('.msg')].forEach(n=>n.classList.remove('active'));
        row.classList.add('active');
      });
      row.querySelector(".msg-del").addEventListener("click", async ()=>{
        const pw = prompt("Admin password:");
        if(pw===null) return;
        await deleteOne(it.id, pw);
      });
      LIST.appendChild(row);
    }
    // scroll to bottom
    LIST.scrollTop = LIST.scrollHeight;
  }

  async function apiFetch(path, opt){
    const r = await fetch(path, opt);
    return r;
  }

  async function loadAll(){
    STATUS.textContent = "Loading…";
    // Try API first
    try{
      const r = await apiFetch(API_BASE, {method:"GET", cache:"no-store"});
      if(r.ok){
        const data = await r.json();
        const items = Array.isArray(data) ? data : (data.items || []);
        render(items.slice(-20));
        STATUS.textContent = "";
        return;
      }
      // If API exists but errors, show message
      throw new Error(`GET failed (${r.status})`);
    }catch(e){
      // Fallback to local storage (useful for local http.server)
      const local = loadLocal();
      render(local.slice(-20));
      STATUS.textContent = "Local mode (messages stored in this browser).";
    }
  }

  function nowStamp(){
    const d = new Date();
    const pad = (n)=>String(n).padStart(2,"0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function postOne(name, text){
    const payload = { name, text };
    try{
      const r = await apiFetch(API_BASE, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(payload)
      });
      if(r.ok){
        await loadAll();
        return;
      }
      // common local dev: python http.server returns 501 for POST
      throw new Error(`POST failed (${r.status})`);
    }catch(e){
      // local fallback
      const arr = loadLocal();
      const id = String(Date.now()) + "_" + Math.random().toString(16).slice(2);
      arr.push({ id, name, text, ts: nowStamp() });
      while(arr.length > 20) arr.shift();
      saveLocal(arr);
      render(arr);
      STATUS.textContent = "Saved locally (this browser).";
    }
  }

  async function deleteOne(id, pw){
    // Try API delete
    try{
      const r = await apiFetch(`${API_BASE}?id=${encodeURIComponent(id)}&pw=${encodeURIComponent(pw)}`, { method:"DELETE" });
      if(r.ok){
        await loadAll();
        return;
      }
      throw new Error(`DELETE failed (${r.status})`);
    }catch(e){
      // local delete (requires correct pw)
      if(pw !== "yjyyjy1970"){
        alert("Not authorized.");
        return;
      }
      const arr = loadLocal().filter(x => x.id !== id);
      saveLocal(arr);
      render(arr);
      STATUS.textContent = "Local mode (deleted).";
    }
  }

  
async function handleSubmit(ev){
  if(ev) ev.preventDefault();
  const name = (NAME && NAME.value ? NAME.value : "").trim() || "Anonymous";
  const text = (MSG && MSG.value ? MSG.value : "").trim();
  if(!text){
    STATUS.textContent = "Please enter a message.";
    return;
  }
  STATUS.textContent = "Posting…";
  await postOne(name, text);
  if(MSG) MSG.value = "";
  STATUS.textContent = "";
}

if(FORM){
  FORM.addEventListener("submit", handleSubmit);
}
if(MSG){
  MSG.addEventListener("keydown", (e)=>{
    if(e.key === "Enter" && !e.shiftKey){
      e.preventDefault();
      handleSubmit(e);
    }
  });
}
document.addEventListener("keydown", async (e)=>{
  if(e.key !== "Delete" || !selectedId) return;
  const pw = prompt("Admin password:");
  if(pw===null) return;
  await deleteOne(selectedId, pw);
  selectedId = null;
});
if(SEND){
  SEND.addEventListener("click", handleSubmit);
}

loadAll();

})();