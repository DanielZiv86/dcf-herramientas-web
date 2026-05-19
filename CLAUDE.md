# DCF Inversiones — Web HTML (dcf-herramientas-web)

## Descripción del proyecto

Nueva versión HTML/FastAPI de la herramienta de análisis de mercado financiero argentino de DCF Inversiones.
Reemplazará progresivamente la app Streamlit. Ambas conviven en paralelo hasta que la HTML esté completa.

## URLs live

- **Frontend (GitHub Pages):** https://danielziv86.github.io/dcf-herramientas-web/
- **Backend API (Render):** https://dcf-herramientas-web.onrender.com
- **Repo GitHub:** https://github.com/DanielZiv86/dcf-herramientas-web

## Stack

FastAPI (backend async) + Vanilla JS + ECharts 5 + JetBrains Mono font

## Estructura

```
dcf-herramientas-web/
├── backend/
│   ├── main.py, auth.py, config.py, cache.py, whitelist.py
│   ├── data/          ← Excels de cashflows y datos estáticos
│   ├── routers/       ← dashboard, bonos, letras, cer, ons, fci, fundamental
│   └── services/      ← data912, bonds, letras, cer, ons, fci, fundamental, yahoo, bandas_cambiarias
├── frontend/
│   ├── index.html
│   ├── css/           ← design-system.css, components.css, pages.css (clases bt2-*, bcc-*, ltr-*, cer-*)
│   └── js/
│       ├── api.js, app.js, charts.js, components.js
│       └── pages/     ← dashboard.js, bonos.js, letras.js, cer.js, ons.js, fci.js, fundamental.js
├── CLAUDE.md          ← este archivo
├── requirements.txt
├── render.yaml
└── run.py
```

## Deploy

- **Backend (Render):** build = `pip install -r requirements.txt` · start = `python -m uvicorn main:app --host 0.0.0.0 --port $PORT --app-dir backend`
- **Frontend (GitHub Pages):** push a `main` → deploy automático
- **Env vars Render:** DEV_BYPASS_AUTH=true, FINNHUB_TOKEN=..., ALLOWED_ORIGINS=https://danielziv86.github.io,...
- Render redeploya automáticamente en cada push a `main` (~2 min)

## Estado de módulos

| Módulo | Estado | Notas |
|---|---|---|
| Dashboard | ✅ Completo | MEP/CCL, treemaps, ticker band |
| Bonos Soberanos | ✅ Completo | Snapshot, curva, heatmap, sensibilidad, calculadora |
| Letras y Boncaps | ✅ Completo | Tabla + chart + calculadora con precio al vencimiento |
| Bonos CER | 🔧 En corrección | Duplicados y TIR Real pendientes (ver debug en memory) |
| ONs | ⏳ Pendiente | |
| FCI | ⏳ Pendiente | |
| Análisis Fundamental | ⏳ Pendiente | |

## Decisiones de diseño clave

- **Diseño BondTerminal v2:** clases CSS `bt2-*` en pages.css; emerald para CER (#34d399), naranja para letras/accent (#f97316), azul para NY Law (#4DA3FF), verde para Arg Law (#00D084)
- **Calculadora bonos:** comisión 0,50% + impuestos 0,01% por default, editables. Fórmula: `net = gross / (1 + costRate)`
- **Calculadora letras:** precio en base 100 VN. `VN = (net / price) × 100`
- **Selector de mercado global en Bonos:** `_currentMercado` / `_allBondsData` / `_setMercado(lbl)` controla todo
- **Trends:** cuadrática para soberanos NY/AR, lineal para BOPREAL, logarítmica para letras
- **Ejes charts:** `nameLocation: 'end'` para Y-axis (evita clipping lateral)

## Datos / Excels en backend/data/

| Archivo | Módulo | Actualización |
|---|---|---|
| BD BONOS HD.xlsx | Bonos soberanos (cashflows) | Al agregar bonos |
| BD BOPREALES.xlsx | BOPREAL (cashflows) | Al agregar BOPREALes |
| BD ONs.xlsx | ONs YTM | Al agregar ONs |
| Letras Activas.xlsx | Letras y Boncaps | Mensual (letras que rotan) |
| Inflacion mensual.xlsx | Bandas carry-trade CER | **Mensual** (IPC INDEC) |
| BD REM.xlsx | Bandas carry-trade CER | **Mensual** (REM BCRA) |
| BD BONOS CER.xlsx | **TEMPLATE** para migración CER | Completar con prospectos CNV/BYMA |
| metadata_cer.xlsx | **TEMPLATE** para migración CER | Completar con datos de instrumentos |

## Fuentes de datos backend

- **data912.com** (primario): precios en tiempo real de bonos, notas, cedears, acciones AR
- **Yahoo Finance** (cookie+crumb auth): índices US, commodities, crypto
- **argentinadatos.com**: Riesgo País (valor + historia), CER index, IPC mensual
- **Bonistas.com**: tabla CER via `__NEXT_DATA__` scraping (frágil — migración planificada)
- **dolarapi.com**: Dólar Oficial
- **IOL**: fallback de precios por scraping HTML
- **CAFCI**: FCI (fondos)
- **Finnhub**: Análisis Fundamental (plan pago)

## Para producción (pendiente)

- Configurar Google OAuth (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
- Quitar DEV_BYPASS_AUTH=true
- Migrar a app.dcfinversiones.com
- Upgrade Render paid tier (elimina cold start ~50s)

## App Streamlit (paralela, NO deprecar aún)

La app Streamlit vive en `G:\...\App DCF Dani`. No modificar. Coexisten en paralelo hasta que la HTML esté completa.
