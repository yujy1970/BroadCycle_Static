# BroadCycle (Static Final)

This is the final integrated static build:
- Pure static site (no Flask required)
- Canvas charts (no external chart CDN)
- Anti-freeze (no resize repaint loop, capped point count)
- Trade Process modal fixed (no invisible overlay blocking clicks)
- Chart background set to pure white

## Local run
From the folder containing `index.html`, `Home/`, `static/`:

```powershell
python -m http.server 8000
```

Open:
- http://127.0.0.1:8000/

## Cloudflare Pages
Push the contents of this folder to a GitHub repo.
In Cloudflare Pages:
- Framework preset: None
- Build command: (empty)
- Output directory: / (repo root)
