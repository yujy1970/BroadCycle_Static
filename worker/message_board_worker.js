export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/messages")) {
      return new Response("Not found", { status: 404 });
    }

    const KV = env.BC_MSG_KV;
    if (!KV) return json({ error: "KV binding BC_MSG_KV missing" }, 500);

    const key = "messages:v1";
    const method = request.method.toUpperCase();

    if (method === "GET") {
      const raw = await KV.get(key);
      const items = raw ? JSON.parse(raw) : [];
      return json({ items }, 200);
    }

    if (method === "POST") {
      const body = await request.json().catch(() => ({}));
      const name = (body.name || "").toString().slice(0, 40);
      const text = (body.text || "").toString().slice(0, 600);
      if (!text.trim()) return json({ error: "Empty message" }, 400);

      const raw = await KV.get(key);
      const items = raw ? JSON.parse(raw) : [];
      const id = crypto.randomUUID();
      items.push({ id, name: name || "Anonymous", text: text.trim(), ts: Date.now() });
      // cap size
      while (items.length > 20) items.shift();
      await KV.put(key, JSON.stringify(items));
      return json({ ok: true }, 200);
    }

    if (method === "DELETE") {
      const pw = url.searchParams.get("pw") || "";
      if (pw !== "yjyyjy1970") return json({ error: "Bad password" }, 403);
      const id = url.searchParams.get("id") || "";
      if (!id) return json({ error: "Missing id" }, 400);

      const raw = await KV.get(key);
      const items = raw ? JSON.parse(raw) : [];
      const next = items.filter(x => x.id !== id);
      await KV.put(key, JSON.stringify(next));
      return json({ ok: true }, 200);
    }

    return json({ error: "Method not allowed" }, 405);
  }
};

function json(obj, status=200){
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    }
  });
}
