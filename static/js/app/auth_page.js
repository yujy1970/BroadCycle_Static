/* Auth page controller */

function qs(id){ return document.getElementById(id); }

async function main(){
  const msg = qs("msg");
  const btnLogin = qs("btnLogin");
  const btnLogout = qs("btnLogout");
  const email = qs("email");
  const password = qs("password");

  function show(t){ if(msg) msg.textContent = t; }

  const s = Auth.getSession();
  if(s){ show(`Signed in as ${s.email} (${s.tier})`); }
  else{ show("Not signed in."); }

  btnLogin.addEventListener("click", async () => {
    try{
      const ss = await Auth.login(email.value, password.value);
      show(`Signed in as ${ss.email} (${ss.tier}). You can go back to Explorer.`);
    }catch(e){ show(e.message || String(e)); }
  });

  btnLogout.addEventListener("click", async () => {
    await Auth.logout();
    show("Signed out.");
  });
}

main().catch(console.error);
