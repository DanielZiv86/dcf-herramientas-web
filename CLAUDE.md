# DCF Inversiones — Web HTML (dcf-herramientas-web)

## INSTRUCCIÓN CRÍTICA PARA CLAUDE

**ANTES de implementar cualquier módulo nuevo o corrección en la web HTML, SIEMPRE leer primero el código equivalente en la app Streamlit.**

La Streamlit es la fuente de verdad para la lógica financiera, las fuentes de datos y los cálculos. El trabajo aquí es:

1. **Leer y entender** el módulo en Streamlit
2. **Mejorar** lo que corresponda (UX/UI, robustez, datos)
3. **Portar** al diseño BondTerminal de la web HTML

No implementar a ciegas. No inventar lógica financiera. Replicar lo que ya funciona en Streamlit y mejorarlo donde tenga sentido.

---

## App Streamlit — Ruta completa (NO modificar)

```
G:\...\DCF\Marketing\Instagram\Scripts Python\App DCF Dani\
```

### Mapa de archivos Streamlit → módulo HTML

| Módulo HTML | Archivos Streamlit a leer primero |
|---|---|
| Dashboard | `dashboard_data.py`, `views/dashboard.py` |
| Bonos Soberanos | `bonistas_hd_data.py`, `bopreales_data.py`, `bond_utils.py`, `views/bonos.py`, `views/tabla_sensibilidad.py` |
| Letras y Boncaps | `letras_boncaps_data.py`, `bandas_cambiarias.py`, `views/letras_boncaps.py` |
| Bonos CER | `cer_real_yield/` (paquete completo), `bonos_cer_data.py` (legacy), `views/bonos_cer.py` |
| ONs | `ons_ytm_data.py`, `views/ons_ytm.py` |
| FCI | `cafci_client.py`, `views/fci.py` |
| Análisis Fundamental | `fundamental/` (directorio), `views/analisis_fundamental.py` |
| Calculadora / lógica general | `market_cache.py`, `bond_utils.py`, `ui_utils.py` |

### Workflow para cada nuevo módulo

```
1. cd "G:/.../App DCF Dani/"
2. Leer el archivo de vista (views/xxx.py)
3. Leer el módulo de datos (xxx_data.py o directorio)
4. Identificar: fuentes de datos, fórmulas, caches, columnas, filtros
5. Proponer mejoras antes de codificar
6. Implementar en backend/services/xxx.py + frontend/js/pages/xxx.js
```

---

## Descripción del proyecto HTML

Nueva versión HTML/FastAPI de la herramienta de análisis de mercado financiero argentino de DCF Inversiones.
Reemplazará progresivamente la app Streamlit. Ambas conviven en paralelo — **NO modificar ni borrar la carpeta Streamlit**.

## URLs live

- **Frontend (GitHub Pages):** https://danielziv86.github.io/dcf-herramientas-web/
- **Backend API (Render):** https://dcf-herramientas-web.onrender.com
- **Repo GitHub:** https://github.com/DanielZiv86/dcf-herramientas-web

## Stack

FastAPI (backend async) + Vanilla JS + ECharts 5 + JetBrains Mono font

## Estructura del proyecto HTML

```
dcf-herramientas-web/
├── backend/
│   ├── main.py, auth.py, config.py, cache.py, whitelist.py
│   ├── data/          ← Excels de cashflows y datos estáticos
│   ├── routers/       ← dashboard, bonos, letras, cer, ons, fci, fundamental
│   └── services/      ← data912, bonds, letras, cer, ons, fci, fundamental, yahoo, bandas_cambiarias
├── frontend/
│   ├── index.html
│   ├── css/           ← design-system.css, components.css, pages.css
│   └── js/
│       ├── api.js, app.js, charts.js, components.js
│       └── pages/     ← dashboard.js, bonos.js, letras.js, cer.js, ons.js, fci.js, fundamental.js
├── CLAUDE.md
├── requirements.txt
└── render.yaml
```

## Deploy

- **Backend (Render):** build = `pip install -r requirements.txt` · start = `python -m uvicorn main:app --host 0.0.0.0 --port $PORT --app-dir backend`
- **Frontend (GitHub Pages):** push a `main` → deploy automático (~1 min)
- **Env vars Render:** `DEV_BYPASS_AUTH=true`, `FINNHUB_TOKEN=...`, `ALLOWED_ORIGINS=https://danielziv86.github.io,...`
- Render redeploya automáticamente en cada push a `main` (~2 min)

## Estado de módulos

| Módulo | Estado | Notas |
|---|---|---|
| Dashboard | ✅ Completo | MEP/CCL, treemaps, ticker band |
| Bonos Soberanos | ✅ Completo | Snapshot, curva, heatmap, sensibilidad, calculadora |
| Letras y Boncaps | ✅ Completo | Tabla + chart + calculadora con precio al vencimiento |
| Bonos CER | 🔧 En corrección | Duplicados y TIR Real pendientes — leer memory/project_cer_tab_debug.md |
| ONs | ⏳ Pendiente | Leer `ons_ytm_data.py` + `views/ons_ytm.py` antes de empezar |
| FCI | ⏳ Pendiente | Leer `cafci_client.py` + `views/fci.py` antes de empezar |
| Análisis Fundamental | ⏳ Pendiente | Leer `fundamental/` + `views/analisis_fundamental.py` antes de empezar |

## Decisiones de diseño clave (HTML)

- **BondTerminal v2:** clases `bt2-*`; emerald CER (#34d399), naranja accent (#f97316), azul NY (#4DA3FF), verde AR (#00D084)
- **Calculadora bonos:** comisión 0,50% + impuestos 0,01% (editables). `net = gross / (1 + costRate)`
- **Calculadora letras:** precio base 100 VN. `VN = (net / price) × 100`
- **Mercado global Bonos:** `_currentMercado` / `_allBondsData` / `_setMercado(lbl)` controla todo simultáneamente
- **Trends:** cuadrática (soberanos NY/AR), lineal (BOPREAL), logarítmica (letras). Ver `charts.js`: `_quadReg`, `_linReg`, `_ltrLogReg`
- **Ejes:** `nameLocation: 'end'` en Y-axis para evitar clipping lateral

## Excels en backend/data/

| Archivo | Módulo | Actualización |
|---|---|---|
| BD BONOS HD.xlsx | Bonos soberanos cashflows | Al agregar bonos |
| BD BOPREALES.xlsx | BOPREAL cashflows | Al agregar BOPREALes |
| BD ONs.xlsx | ONs YTM | Al agregar ONs |
| Letras Activas.xlsx | Letras y Boncaps | Mensual |
| Inflacion mensual.xlsx | Bandas carry-trade | **Mensual** (IPC INDEC) |
| BD REM.xlsx | Bandas carry-trade | **Mensual** (REM BCRA) |
| BD BONOS CER.xlsx | Migración CER — TEMPLATE | Completar con prospectos CNV/BYMA |
| metadata_cer.xlsx | Migración CER — TEMPLATE | Completar con datos de instrumentos |

## Fuentes de datos

- **data912.com** (primario): bonos, notas, cedears, acciones AR en tiempo real
- **Yahoo Finance** (cookie+crumb auth): índices US, commodities, crypto
- **argentinadatos.com**: Riesgo País (historia), CER index, IPC mensual
- **Bonistas.com**: tabla CER via `__NEXT_DATA__` scraping (frágil, migración planificada)
- **dolarapi.com**: Dólar Oficial
- **IOL**: fallback de precios (scraping HTML)
- **CAFCI**: FCI fondos
- **Finnhub**: Análisis Fundamental (plan pago)

## Para producción (pendiente)

- Google OAuth (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirect URI)
- Quitar DEV_BYPASS_AUTH=true
- Migrar a app.dcfinversiones.com
- Upgrade Render paid tier (elimina cold start ~50s)
