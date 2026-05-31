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
| ONs | ✅ Completo | Tabla + 3 charts (Duration/Venc./Ranking) + modal detalle con cashflows |
| FCI | ✅ Completo | Tabla + gráfico comparativo. Ver sección FCI más abajo. |
| Análisis Fundamental | ✅ Completo | 5 subtabs benchmark-match. Ver memory/project_fundamental_rentabilidad.md |

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
| cafci_fondos_con_agentes.json | FCI — metadata fondos | Mensual: `python backend/build_cafci_sources.py --solo-fondos` |
| cafci_vcp_mensual.csv | FCI — retornos mensuales | Mensual: `python backend/build_cafci_sources.py --solo-vcp` |

## Fuentes de datos

- **data912.com** (primario): bonos, notas, cedears, acciones AR en tiempo real
- **Yahoo Finance** (cookie+crumb auth): índices US, commodities, crypto
- **argentinadatos.com**: Riesgo País (historia), CER index, IPC mensual
- **Bonistas.com**: tabla CER via `__NEXT_DATA__` scraping (frágil, migración planificada)
- **dolarapi.com**: Dólar Oficial
- **IOL**: fallback de precios (scraping HTML)
- **CAFCI**: FCI fondos
- **Finnhub**: Análisis Fundamental (plan pago)

## FCI — Workflow de actualización

### Archivos fuente (en backend/data/ — independientes del repo Streamlit)
- `cafci_fondos_con_agentes.json` — metadata de ~1128 fondos activos (agentes, gerente, tipoRenta, clase)
- `cafci_vcp_mensual.csv` — rendimientos mensuales (% por mes) para ~3943 fondos × 11+ meses

### Actualización manual (requiere IP local — CAFCI bloquea datacenters con 403)
```bash
python backend/build_cafci_sources.py        # actualiza ambos archivos fuente
python backend/build_fci_data.py             # regenera fci_data.json (44 fondos curados)
```

### GitHub Actions (automático)
- `update-cafci-sources.yml` — 1° de cada mes 08:00 UTC: intenta actualizar fuentes via CAFCI
- `update-fci-data.yml` — 1° de cada mes 09:00 UTC: regenera fci_data.json desde las fuentes
- Si CAFCI bloquea (403): scripts hacen `sys.exit(1)` → NO sobreescriben archivos existentes

### Servicio (backend/services/fci.py)
- Carga `fci_data.json` en memoria al primer request
- Refresh de rendimientos en background desde CAFCI `/ficha` cada 24h (sin bloquear requests)
- Si CAFCI bloquea el refresh: reintenta en 5 minutos

---

## Reglas de desarrollo — lecciones aprendidas

### Filtrado de datos financieros
- Siempre tratar `0.0` y `null` como "sin dato", no como valor válido. Los fondos discontinuados o inactivos en CAFCI reportan exactamente `0.0` en meses sin actividad — filtrarlos igual que `None`.
- Antes de incluir un fondo/instrumento en la tabla, validar que tenga al menos un dato útil (rendimiento puntual o mínimo 2 meses de histórico no nulos).

### APIs externas en Render/datacenters
- CAFCI (y posiblemente otras APIs financieras argentinas) bloquean IPs de datacenter con 403. Siempre implementar un path de caché/fallback estático.
- Si un script de actualización obtiene 0 resultados de una API externa, hacer `sys.exit(1)` — nunca sobreescribir datos buenos con un resultado vacío.
- Verificar el comportamiento de la API desde datacenter antes de asumir que funciona en GitHub Actions o Render.

### Verificación post-rediseño de UI
- Después de cualquier cambio de CSS global o rediseño, verificar explícitamente: (1) que no queden áreas blancas en topbar o fondos de charts, (2) que los labels de ejes no estén cortados, (3) que las fórmulas de calculadoras sean correctas (divisiones vs multiplicaciones).
- Los tests de código verifican correctitud lógica, no visual — los problemas de UI solo aparecen mirando el browser.

### Seguridad — pendiente para migración a producción
- `DEV_BYPASS_AUTH=true` en `render.yaml` debe cambiarse a `false` antes del go-live
- `/api/cache-info` necesita auth guard igual que el resto de endpoints
- CORS regex debe pinarse al dominio exacto: `r"https://danielziv86\.github\.io"`
- `whitelist.py` debe fallar cerrado (deny) si las credenciales de Google Sheet fallan, no abierto
- `bonds.py:477` tiene `_fetch_prices` no definida — reemplazar por `_prices_from_data(await _fetch_all_bond_data(...))`
- `yahoo.py:169` usa `isinstance(results, Exception)` en vez de `isinstance(r, Exception)` — datos corruptos silenciosos

---

## Para producción (pendiente)

- Google OAuth (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirect URI)
- Quitar DEV_BYPASS_AUTH=true
- Migrar a app.dcfinversiones.com
- Upgrade Render paid tier (elimina cold start ~50s)
