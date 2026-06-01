# Production Audit — DCF Herramientas Web

Runs a full production-readiness audit of the dcf-herramientas-web app.
Run this before every deploy to main.

## What to check

### 1. Security
- `render.yaml`: verify `DEV_BYPASS_AUTH` is still `true` (warn if it's `true` → remind to flip before go-live)
- `main.py`: check CORS `allow_origins` regex — should pin to exact domain, not wildcard
- `routers/`: verify every endpoint has `require_auth(dcf_session)` (especially `/api/cache-info`)
- `whitelist.py`: check that auth fails closed (deny) if Google Sheet credentials fail, not open
- Check for any hardcoded secrets or tokens in Python/JS files

### 2. Data filtering
- `services/fci.py`: confirm both `None` AND `0.0` values are excluded from fund data
- `services/ons.py`: confirm `NO_FUTURE_CASHFLOWS` / `NO_PRICE` rows are excluded from table output
- Any service returning lists: verify empty/discontinued instruments don't leak through

### 3. External API resilience
- `services/`: for each external API call (CAFCI, data912, IOL, dolarapi, Yahoo), confirm there is a fallback path when the API fails or returns 0 results
- `build_cafci_sources.py`: confirm `sys.exit(1)` is in place if API returns 0 results (don't overwrite good data)
- Identify any API calls that would fail silently with bad data instead of raising

### 4. Known bugs (from prior audit)
- `services/bonds.py:477`: check if `_fetch_prices` is defined — if not, flag for fix
- `services/yahoo.py:169`: check `isinstance(results, Exception)` vs `isinstance(r, Exception)` — flag if wrong variable used

### 5. Frontend / UI
- Check CSS: no `background: white` or missing `background: transparent` on chart containers
- Verify calculator formulas in JS: division-based (`net = gross / (1 + costRate)`) not multiplication
- Check ECharts `nameLocation: 'end'` on Y-axes to avoid label clipping

## Output format

Report findings as a numbered list grouped by category, with severity:
- 🔴 CRITICAL — blocks go-live
- 🟡 WARNING — should fix before go-live
- 🟢 OK — no issues found

End with a summary line: "X critical, Y warnings, Z OK".
