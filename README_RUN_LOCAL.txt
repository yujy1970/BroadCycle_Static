BroadCycle (Full Package based on Patch fix13)

How to run locally (Windows PowerShell):
1) cd to this folder (the one containing Home/ and static/)
2) python -m http.server 8000

Open:
- http://localhost:8000/Home/Explorer/

Notes:
- Strategy detail pages read:
  - Daily price CSV: /static/index/*.csv
  - Backtest outputs: /static/record/Account_*.txt, MoneyGrow_*.txt, Trade_Process_*.txt

If you see old UI (cache):
- Chrome: DevTools -> Network -> check 'Disable cache' -> refresh
- Or open with a random query string: /Home/Explorer/?r=1
