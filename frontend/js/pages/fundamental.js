/* ─── Análisis Fundamental v5 — Rentabilidad benchmark-exact ────────────────
   Cambios v4:
   - _hist(i,n): binario 0.35/1.0 en lugar de degradé progresivo
   - barGap: '5%' (agrupadas lado a lado, sin superposición)
   - _chartPanel: header con título + línea naranja + valor métrico
   - _kpi: cards más compactas y uniformes
   - Paleta semántica fija por concepto
   - Colores positivo/negativo correctos por tipo de dato
   ─────────────────────────────────────────────────────────────────────────── */

/* ── Paleta semántica fija ────────────────────────────────────────────────── */
const _G    = '#D4AF37';               // gold  — accent sección
const _GD   = 'rgba(212,175,55,.12)';
const _GB   = 'rgba(212,175,55,.28)';

// Conceptos semánticos
const _CY   = '#22D3EE';  // Revenue / Cash / Assets — cyan
const _GR   = '#34D399';  // Positivo / Net Cash / Equity — emerald
const _RE   = '#F87171';  // Negativo / Deuda / Pérdida — red
const _VI   = '#8B5CF6';  // Márgenes / Múltiplos / EV — violet
const _OR   = '#F59E0B';  // FCF / Capex / Accent — amber/orange
const _PI   = '#EC4899';  // Líneas de margen — pink
const _YL   = '#FACC15';  // EPS / Price Target — yellow
const _SK   = '#38BDF8';  // Op Cash Flow / secondary — sky

// Versiones transparentes para histórico
const _CYS  = 'rgba(34,211,238,.35)';
const _GRS  = 'rgba(52,211,153,.35)';
const _RES  = 'rgba(248,113,113,.35)';
const _VIS  = 'rgba(139,92,246,.35)';
const _ORS  = 'rgba(245,158,11,.35)';
const _SKS  = 'rgba(56,189,248,.35)';

const _MONO = "'JetBrains Mono',monospace";
const _BG   = '#0B1220';   // fondo de chart cards
const _CARD = '#101827';   // fondo de cards
const _BOR  = '#1E2D3D';   // borde

const _TABS = [
  { id: 'empresa',      label: 'Empresa',      icon: '🏢' },
  { id: 'negocio',      label: 'Negocio',      icon: '📈' },
  { id: 'rentabilidad', label: 'Rentabilidad', icon: '💰' },
  { id: 'financiera',   label: 'Financiera',   icon: '🏦' },
  { id: 'valuacion',    label: 'Valuación',    icon: '🎯' },
];

const _AF_MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];


/* ══════════════════════════════════════════════════════════════════════════
   ENTRADA DE LA PÁGINA
   ══════════════════════════════════════════════════════════════════════════ */

(window.pages = window.pages || {}).fundamental = async function(container) {

  /* ── Estado de la sección ──────────────────────────────────────────────── */
  let _tabId   = 'negocio';
  const _cache = new Map();   // ticker → { perfil, financieros, candles }
  let _symbols = [];          // cargado una vez para autocomplete
  let _ddSel   = -1;          // fila seleccionada en dropdown

  /* ── Shell HTML ─────────────────────────────────────────────────────────── */
  container.innerHTML = `
    <div class="bt2-page" id="af-root">
      <style>@keyframes af-spin{to{transform:rotate(360deg)}}</style>

      <!-- Header + buscador en la misma línea -->
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;flex-wrap:wrap">
        <div style="flex:1;min-width:0">
          <h1 style="font-size:1.20rem;font-weight:700;color:${_G};letter-spacing:-.02em;margin:0 0 2px">
            Análisis Fundamental
          </h1>
          <div style="font-family:${_MONO};font-size:.58rem;color:#4A5F75">
            US Equities · Carga bajo demanda · Finnhub + yfinance
          </div>
        </div>

        <!-- Buscador con autocomplete -->
        <div style="position:relative;flex-shrink:0">
          <div style="display:flex;gap:6px;align-items:center">
            <div style="position:relative">
              <input id="af-input" autocomplete="off" spellcheck="false"
                placeholder="Ticker USA…"
                style="background:#0D1525;border:1px solid #2A3350;color:#F8FAFC;
                  padding:6px 30px 6px 10px;border-radius:8px;
                  font-family:${_MONO};font-size:.76rem;font-weight:700;
                  width:180px;outline:none;letter-spacing:.05em;
                  transition:border-color .15s;text-transform:uppercase"/>
              <span style="position:absolute;right:9px;top:50%;transform:translateY(-50%);
                color:#4A5F75;font-size:.80rem;pointer-events:none;font-family:${_MONO}">⌕</span>
            </div>
            <button id="af-btn"
              style="background:${_GD};border:1px solid ${_GB};color:${_G};
                padding:6px 14px;border-radius:8px;font-family:${_MONO};font-size:.70rem;
                font-weight:700;cursor:pointer;white-space:nowrap;letter-spacing:.04em">
              ANALIZAR
            </button>
          </div>
          <!-- Dropdown autocomplete -->
          <div id="af-dd" style="display:none;position:absolute;top:calc(100% + 4px);right:0;
            width:340px;max-height:240px;overflow-y:auto;
            background:#0D1525;border:1px solid #2A3350;border-radius:8px;
            z-index:999;box-shadow:0 8px 24px rgba(0,0,0,.7)"></div>
        </div>
      </div>

      <!-- Área de contenido principal -->
      <div id="af-main"></div>

      <!-- Disclaimer -->
      <div style="margin-top:10px;padding:6px 10px;background:rgba(245,158,11,.04);
        border:1px solid rgba(245,158,11,.10);border-radius:6px;
        display:flex;gap:7px;align-items:flex-start">
        <span style="color:#F59E0B;font-size:.66rem;flex-shrink:0;margin-top:1px">⚠</span>
        <div style="font-family:${_MONO};font-size:.58rem;color:#4A5F75;line-height:1.35">
          Solo fines informativos. No constituye asesoramiento de inversión.
          Fuentes: Finnhub · yfinance · DCF Inversiones.
        </div>
      </div>
    </div>`;

  /* ── Cargar símbolos en background (no bloquea el render) ─────────────── */
  api.fundamental.symbols().then(d => { _symbols = Array.isArray(d) ? d : []; }).catch(() => {});

  /* ── Mostrar estado inicial ─────────────────────────────────────────────── */
  _showIdle();

  /* ── Referencias a elementos del DOM ───────────────────────────────────── */
  const input = document.getElementById('af-input');
  const dd    = document.getElementById('af-dd');

  /* ── Autocomplete: lógica ────────────────────────────────────────────────── */
  function _filterSymbols(q, limit = 10) {
    if (!_symbols.length || !q) return [];
    const prefix = [], partial = [];
    for (const s of _symbols) {
      if (prefix.length + partial.length >= limit * 2) break;
      if (s.symbol.startsWith(q)) prefix.push(s);
      else if (s.name && s.name.includes(q)) partial.push(s);
    }
    return [...prefix, ...partial].slice(0, limit);
  }

  function _micLabel(mic) {
    return { XNAS:'NASDAQ', XNYS:'NYSE', ARCX:'NYSE Arca', BATS:'CBOE', XASE:'AMEX' }[mic] || mic || '';
  }

  function _capName(s) {
    if (!s) return '';
    return s.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ').slice(0, 28);
  }

  function _renderDropdown(matches) {
    if (!matches.length) { dd.style.display = 'none'; return; }
    dd.innerHTML = matches.map((s, i) =>
      `<div data-i="${i}" data-sym="${s.symbol}"
        style="padding:7px 12px;cursor:pointer;font-family:${_MONO};
          border-bottom:1px solid rgba(42,51,80,.4)">
        <span style="color:${_G};font-size:.78rem;font-weight:700">${s.symbol}</span>
        <span style="color:#5A7390;font-size:.66rem;margin-left:7px">${_capName(s.name)}</span>
        ${s.mic ? `<span style="color:#2D4157;font-size:.58rem;margin-left:5px">${_micLabel(s.mic)}</span>` : ''}
      </div>`
    ).join('');
    _ddSel = -1;
    dd.style.display = 'block';
    dd.querySelectorAll('div[data-sym]').forEach(row => {
      row.onmouseenter = () => {
        dd.querySelectorAll('div[data-sym]').forEach(r => r.style.background = '');
        row.style.background = 'rgba(212,175,55,.08)';
        _ddSel = +row.dataset.i;
      };
      row.onmouseleave = () => { row.style.background = ''; };
      row.onclick      = () => { _selectFromDD(row.dataset.sym); };
    });
  }

  function _selectFromDD(sym) {
    input.value = sym;
    dd.style.display = 'none';
    _ddSel = -1;
    _load(sym);
  }

  function _ddMove(dir) {
    const rows = dd.querySelectorAll('div[data-sym]');
    if (!rows.length) return;
    rows.forEach(r => r.style.background = '');
    _ddSel = Math.max(0, Math.min(rows.length - 1, _ddSel + dir));
    rows[_ddSel].style.background = 'rgba(212,175,55,.12)';
    input.value = rows[_ddSel].dataset.sym;
  }

  /* ── Eventos de búsqueda ─────────────────────────────────────────────────── */
  input.addEventListener('focus',  () => { input.style.borderColor = _GB; });
  input.addEventListener('blur',   () => {
    input.style.borderColor = '#2A3350';
    setTimeout(() => { dd.style.display = 'none'; _ddSel = -1; }, 160);
  });
  input.addEventListener('input',  () => {
    const q = input.value.trim().toUpperCase();
    _renderDropdown(_filterSymbols(q));
  });
  input.addEventListener('keydown', e => {
    if      (e.key === 'ArrowDown')  { e.preventDefault(); _ddMove(1); }
    else if (e.key === 'ArrowUp')    { e.preventDefault(); _ddMove(-1); }
    else if (e.key === 'Escape')     { dd.style.display = 'none'; input.blur(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const rows = dd.querySelectorAll('div[data-sym]');
      const sym  = (_ddSel >= 0 && rows[_ddSel]) ? rows[_ddSel].dataset.sym : null;
      const v    = (sym || input.value).replace(/[^A-Z0-9.]/gi, '').toUpperCase().slice(0, 10);
      if (v) { dd.style.display = 'none'; _load(v); }
    }
  });
  document.getElementById('af-btn').addEventListener('click', () => {
    const v = input.value.replace(/[^A-Z0-9.]/gi, '').toUpperCase().slice(0, 10);
    if (v) { dd.style.display = 'none'; _load(v); }
  });

  /* ── Estados visuales ───────────────────────────────────────────────────── */
  function _showIdle() {
    const quick = ['AAPL','MSFT','NVDA','AMZN','META','GOOGL','TSLA','MELI'];
    document.getElementById('af-main').innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;
        justify-content:center;min-height:300px;text-align:center;padding:20px">
        <div style="font-size:2.4rem;margin-bottom:14px;opacity:.25">📊</div>
        <div style="font-family:${_MONO};font-size:.88rem;font-weight:700;
          color:#3A5068;margin-bottom:8px">
          Ingresá un ticker para iniciar el análisis
        </div>
        <div style="font-family:${_MONO};font-size:.63rem;color:#2D4157;
          line-height:1.7;max-width:360px;margin-bottom:18px">
          Podés buscar cualquier acción que cotice en USA.<br>
          Usá el buscador o seleccioná uno de los ejemplos.
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center">
          ${quick.map(t =>
            `<button
              style="background:rgba(212,175,55,.06);border:1px solid rgba(212,175,55,.14);
                color:#4A5F75;padding:4px 11px;border-radius:16px;font-family:${_MONO};
                font-size:.65rem;font-weight:700;cursor:pointer;letter-spacing:.04em;
                transition:.12s"
              onmouseenter="this.style.borderColor='rgba(212,175,55,.35)';this.style.color='${_G}'"
              onmouseleave="this.style.borderColor='rgba(212,175,55,.14)';this.style.color='#4A5F75'"
              onclick="(()=>{document.getElementById('af-input').value='${t}';window.__afLoad('${t}')})()">
              ${t}
            </button>`
          ).join('')}
        </div>
      </div>`;
    window.__afLoad = _load;
  }

  function _showLoading(tk) {
    document.getElementById('af-main').innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;
        justify-content:center;min-height:240px;text-align:center;padding:20px">
        <div style="width:26px;height:26px;border:2px solid rgba(212,175,55,.18);
          border-top-color:${_G};border-radius:50%;
          animation:af-spin .75s linear infinite;margin-bottom:14px"></div>
        <div style="font-family:${_MONO};font-size:.82rem;font-weight:700;
          color:${_G};margin-bottom:6px">
          Buscando información de ${tk}…
        </div>
        <div style="font-family:${_MONO};font-size:.62rem;color:#4A5F75;line-height:1.6">
          Consultando datos fundamentales, precios históricos y métricas de valuación
        </div>
      </div>`;
  }

  function _showError(tk, msg) {
    document.getElementById('af-main').innerHTML = `
      <div style="max-width:480px;margin:0 auto;padding:20px 0">
        <div style="background:#12182B;border:1px solid rgba(248,113,113,.22);
          border-radius:12px;padding:24px;text-align:center">
          <div style="font-size:1.5rem;margin-bottom:10px;opacity:.7">✕</div>
          <div style="font-family:${_MONO};font-size:.80rem;font-weight:700;
            color:${_RE};margin-bottom:8px">No se pudo cargar ${tk}</div>
          <div style="font-family:${_MONO};font-size:.64rem;color:#4A5F75;
            line-height:1.6;margin-bottom:16px">${msg}</div>
          <button onclick="window.__afIdle&&window.__afIdle()"
            style="background:${_GD};border:1px solid ${_GB};color:${_G};
              padding:5px 16px;border-radius:7px;font-family:${_MONO};
              font-size:.68rem;font-weight:700;cursor:pointer">
            Buscar otro ticker
          </button>
        </div>
      </div>`;
    window.__afIdle = _showIdle;
  }

  /* ── Carga bajo demanda con cache ────────────────────────────────────────── */
  async function _load(rawTicker) {
    const tk = rawTicker.replace(/[^A-Z0-9.]/gi, '').toUpperCase().slice(0, 10);
    if (!tk) return;
    input.value = tk;
    _showLoading(tk);

    try {
      if (!_cache.has(tk)) {
        const [p, f, c] = await Promise.allSettled([
          api.fundamental.perfil(tk),
          api.fundamental.financieros(tk),
          api.fundamental.candles(tk, 'W'),
        ]);
        const cached = {
          perfil:      p.status === 'fulfilled' ? p.value : {},
          financieros: f.status === 'fulfilled' ? f.value : { data: [] },
          candles:     c.status === 'fulfilled' ? c.value : { dates: [], closes: [] },
        };
        // Validar datos mínimos: profile con nombre/mcap, o al menos un año financiero
        const prof    = cached.perfil?.profile || {};
        const finData = (cached.financieros?.data || []).filter(r => r?.year);
        if (!prof.name && !prof.market_cap && !finData.length) {
          _showError(tk, `No encontramos datos para <strong>${tk}</strong>.<br>Verificá que sea un símbolo válido de USA.`);
          return;
        }
        _cache.set(tk, cached);
      }

      const { perfil, financieros, candles } = _cache.get(tk);
      _renderFull(document.getElementById('af-main'), tk, perfil, financieros, candles);
    } catch (e) {
      const msg = e?.status === 429
        ? 'Fuente de datos temporalmente limitada. Intentá de nuevo en unos minutos.'
        : (e.message || 'Error de conexión. Verificá tu acceso e intentá nuevamente.');
      _showError(tk, msg);
    }
  }

  /* ── Render completo (sin cambios respecto al diseño benchmark) ──────────── */
  function _renderFull(main, tk, perfil, financieros, candles) {
    const { profile = {}, quote = {}, metrics = {}, description = '', tags = [] } = perfil;
    const data = (financieros.data || []).filter(r => r?.year);
    main.innerHTML = `
      <div id="af-hero" style="margin-bottom:10px"></div>
      <div id="af-tabs-bar" style="margin-bottom:10px"></div>
      <div id="af-tab-body"></div>`;
    _renderHero(document.getElementById('af-hero'), tk, profile, quote, metrics, description, tags, data);
    _renderTabsBar(document.getElementById('af-tabs-bar'), tk, profile, quote, metrics, description, tags, data, candles);
  }

  function _renderTabsBar(el, tk, profile, quote, metrics, desc, tags, data, candles) {
    el.innerHTML = `<div style="display:flex;gap:2px;flex-wrap:wrap;padding:3px;
      background:rgba(11,18,32,.9);border:1px solid ${_BOR};
      border-radius:9px;width:fit-content"></div>`;
    const bar  = el.querySelector('div');
    const body = document.getElementById('af-tab-body');

    _TABS.forEach(tab => {
      const btn = document.createElement('button');
      const isA = tab.id === _tabId;
      btn.setAttribute('data-tab', tab.id);
      btn.innerHTML = `<span style="opacity:.7;font-size:.8em">${tab.icon}</span>&nbsp;${tab.label}`;
      btn.style.cssText = `background:${isA ? 'rgba(36,54,77,.9)' : 'transparent'};
        border:1px solid ${isA ? 'rgba(36,54,77,1)' : 'transparent'};
        color:${isA ? '#C8D8E8' : '#4A5F75'};
        padding:4px 10px;border-radius:6px;font-family:${_MONO};
        font-size:.68rem;font-weight:600;cursor:pointer;transition:.12s;
        letter-spacing:.02em;white-space:nowrap`;
      btn.onmouseenter = () => { if (tab.id !== _tabId) { btn.style.color='#7F93AD'; btn.style.background='rgba(36,54,77,.5)'; } };
      btn.onmouseleave = () => { if (tab.id !== _tabId) { btn.style.color='#4A5F75'; btn.style.background='transparent'; } };
      btn.onclick = () => {
        _tabId = tab.id;
        bar.querySelectorAll('button').forEach(b => {
          const a = b.getAttribute('data-tab') === _tabId;
          b.style.background = a ? 'rgba(36,54,77,.9)' : 'transparent';
          b.style.border     = `1px solid ${a ? 'rgba(36,54,77,1)' : 'transparent'}`;
          b.style.color      = a ? '#C8D8E8' : '#4A5F75';
        });
        _dispatchTab(body, tab.id, tk, profile, quote, metrics, desc, tags, data, candles);
      };
      bar.appendChild(btn);
    });
    _dispatchTab(body, _tabId, tk, profile, quote, metrics, desc, tags, data, candles);
  }

  function _dispatchTab(body, tabId, tk, profile, quote, metrics, desc, tags, data, candles) {
    body.innerHTML = '';
    switch (tabId) {
      case 'empresa':      _tabEmpresa(body, tk, profile, quote, metrics, desc, tags, data); break;
      case 'negocio':      _tabNegocio(body, tk, data, metrics); break;
      case 'rentabilidad': _tabRentabilidad(body, tk, data, metrics); break;
      case 'financiera':   _tabFinanciera(body, tk, data); break;
      case 'valuacion':    _tabValuacion(body, tk, data, metrics, profile, candles); break;
    }
  }
};


/* ══════════════════════════════════════════════════════════════════════════
   HERO CARD
   ══════════════════════════════════════════════════════════════════════════ */

function _renderHero(el, tk, profile, quote, metrics, desc, tags, data) {
  const name     = profile.name || tk;
  const exchange = (profile.exchange || '').replace('NASDAQ NMS - GLOBAL MARKET','NASDAQ').replace('New York Stock Exchange','NYSE');
  const sector   = profile.sector || '';
  const industry = profile.industry || '';
  const price    = quote.price;
  const chg      = quote.change;
  const pct      = quote.pct_change;
  const mcapM    = profile.market_cap;

  const priceStr = price ? `$${Number(price).toFixed(2)}` : '—';
  const chgColor = chg >= 0 ? _GR : _RE;
  const chgSign  = chg >= 0 ? '+' : '';
  const chgStr   = (chg != null && pct != null) ? `${chgSign}${chg.toFixed(2)} (${chgSign}${pct.toFixed(2)}%)` : '—';
  const mcapStr  = _fmtB(mcapM != null ? mcapM * 1e6 : null);
  const w52h     = metrics.week52_high ? `$${Number(metrics.week52_high).toFixed(2)}` : '—';
  const w52l     = metrics.week52_low  ? `$${Number(metrics.week52_low).toFixed(2)}`  : '—';
  const target   = metrics.target_price;
  const upside   = metrics.upside;
  const beta     = metrics.beta != null ? Number(metrics.beta).toFixed(2) : '—';

  const tagPalette = [
    ['rgba(34,211,238,.12)','#22D3EE'],['rgba(139,92,246,.12)','#8B5CF6'],
    ['rgba(52,211,153,.12)','#34D399'],['rgba(245,158,11,.12)','#F59E0B'],
    ['rgba(212,175,55,.12)','#D4AF37'],
  ];
  const tagsHtml = (tags || []).map((t, i) => {
    const [bg, c] = tagPalette[i % tagPalette.length];
    return `<span style="background:${bg};color:${c};border:1px solid ${c}30;
      border-radius:16px;padding:2px 8px;font-size:.62rem;font-weight:700;
      letter-spacing:.04em;white-space:nowrap;font-family:${_MONO}">${t}</span>`;
  }).join('');

  const last  = data.length ? data[data.length - 1] : null;
  const fy    = last ? `FY${String(last.year).slice(2)}` : '';
  const fyEnd = _fyStr(last);

  const stripItems = [
    { l:'FY END',    v: fyEnd },
    { l:`REV ${fy}`, v: _fmtM(last?.revenue),
      s: last?.revenue_yoy != null ? `+${last.revenue_yoy.toFixed(1)}%` : '' },
    { l:`FCF ${fy}`, v: _fmtM(last?.fcf),
      s: last?.fcf_margin != null ? `${last.fcf_margin.toFixed(1)}% FCF%` : '' },
    { l:'EMPLEADOS', v: profile.employees ? `~${Number(profile.employees).toLocaleString('es-AR')}` : '—' },
    { l:'IPO',       v: (profile.ipo_date||'').slice(0,4)||'—' },
    { l:'BETA',      v: beta },
    { l:'DIV YIELD', v: profile.dividend_yield!=null?`${profile.dividend_yield.toFixed(2)}%`:'—' },
  ];

  const strip = stripItems.map(({ l, v, s }) => `
    <div style="flex:1;min-width:84px;padding:7px 12px;border-right:1px solid rgba(30,45,61,.8)">
      <div style="font-size:.55rem;font-weight:700;letter-spacing:.10em;text-transform:uppercase;
        color:#2D4157;font-family:${_MONO};margin-bottom:2px">${l}</div>
      <div style="font-size:.80rem;font-weight:700;color:#C8D8E8;font-family:${_MONO}">${v}</div>
      ${s ? `<div style="font-size:.58rem;color:${_GR};font-family:${_MONO}">${s}</div>` : ''}
    </div>`).join('');

  const marketRows = [
    ['Mkt Cap',  mcapStr],
    ['52W High', w52h],
    ['52W Low',  w52l],
    ...(target!=null?[['Target', `$${Number(target).toFixed(2)}`]]:[]),
    ...(upside!=null?[['Upside', `${upside>=0?'+':''}${upside.toFixed(1)}%`]]:[]),
  ].map(([l,v])=>`<div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:3px">
    <span style="font-size:.60rem;color:#2D4157;text-transform:uppercase;letter-spacing:.06em;font-family:${_MONO}">${l}</span>
    <span style="font-size:.68rem;font-weight:600;color:#C8D8E8;font-family:${_MONO}">${v}</span>
  </div>`).join('');

  el.innerHTML = `
    <div style="background:${_CARD};border:1px solid ${_BOR};border-radius:10px;overflow:hidden">
      <div style="display:flex;align-items:stretch">
        <!-- Logo -->
        <div style="padding:14px 12px;display:flex;align-items:flex-start;flex-shrink:0">
          ${profile.logo?`<img src="${profile.logo}" alt="${tk}"
            style="width:52px;height:52px;border-radius:8px;object-fit:contain;
              background:#0B1220;border:1px solid ${_BOR}"
            onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`:``}
          <div style="width:52px;height:52px;border-radius:8px;background:${_GD};
            border:1px solid ${_GB};display:${profile.logo?'none':'flex'};
            align-items:center;justify-content:center;font-size:1.15rem;
            font-weight:700;color:${_G};font-family:${_MONO}">${tk.slice(0,2)}</div>
        </div>

        <!-- Info -->
        <div style="flex:1;padding:14px 8px 12px 0;min-width:0">
          <div style="font-size:1.15rem;font-weight:700;color:#F4F7FB;line-height:1.2;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>
          <div style="font-size:.68rem;color:#4A5F75;margin-top:2px;font-family:${_MONO}">
            ${tk} · ${exchange}${sector?' · '+sector:''}${industry&&industry!==sector?' · '+industry:''}
          </div>
          ${tagsHtml?`<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:7px">${tagsHtml}</div>`:''}
          ${desc?`<div style="color:#5A7390;font-size:.72rem;line-height:1.5;margin-top:8px;
            max-width:620px;display:-webkit-box;-webkit-line-clamp:2;
            -webkit-box-orient:vertical;overflow:hidden">${desc}</div>`:''}
        </div>

        <!-- Precio -->
        <div style="padding:14px 16px 12px;text-align:right;flex-shrink:0;
          border-left:1px solid rgba(30,45,61,.8);min-width:160px">
          <div style="font-size:1.9rem;font-weight:800;color:${_G};line-height:1;
            font-family:${_MONO};letter-spacing:-.02em">${priceStr}</div>
          <div style="font-size:.75rem;color:${chgColor};margin-top:3px;font-family:${_MONO};font-weight:600">${chgStr}</div>
          <div style="margin-top:8px">${marketRows}</div>
        </div>
      </div>

      <!-- Strip inferior -->
      <div style="display:flex;flex-wrap:wrap;background:rgba(6,11,23,.6);
        border-top:1px solid rgba(30,45,61,.8)">${strip}</div>
    </div>`;
}

function _fyStr(last) {
  if (!last?.end_date) return '—';
  try { const d=new Date(last.end_date+'T00:00:00'); return `${_AF_MESES[d.getMonth()]} ${d.getDate()}`; }
  catch(_) { return '—'; }
}


/* ══════════════════════════════════════════════════════════════════════════
   TAB: EMPRESA
   ══════════════════════════════════════════════════════════════════════════ */

function _tabEmpresa(container, tk, profile, quote, metrics, desc, tags, data) {
  const last = data.length ? data[data.length-1] : null;
  const mcapM = profile.market_cap;  // millones USD

  // Primer valor no-nulo, finito y distinto de cero
  const _pv = (...vs) => { for(const v of vs){ const n=+v; if(v!=null&&Number.isFinite(n)&&n!==0) return n; } return null; };

  // Ratios calculados desde estados financieros como fallback cuando metrics es vacío
  const _pe   = _pv(metrics.pe_ttm,
                    mcapM&&last?.net_income>0 ? mcapM/last.net_income : null);
  const _pef  = _pv(metrics.pe_forward);
  const _ps   = _pv(metrics.ps_ttm,
                    mcapM&&last?.revenue>0    ? mcapM/last.revenue    : null);
  const _pb   = _pv(metrics.pb_annual);

  // EV y TTM figures para fallback de EV/EBITDA y EV/Sales
  const _evMv     = metrics.enterprise_value_m;
  const _ncM      = last?.net_cash ?? 0;
  const _evUSDv   = _evMv != null ? _evMv*1e6 : (mcapM != null ? mcapM*1e6 - _ncM*1e6 : null);
  const _ebitdaMv = metrics.ebitda_ttm_m ?? last?.ebitda_est ?? null;
  const _revTtmMv = metrics.revenue_ttm_m ?? last?.revenue ?? null;

  const _eveb = _pv(metrics.ev_ebitda_ttm,
                    _evUSDv&&_ebitdaMv&&_ebitdaMv>0 ? _evUSDv/(_ebitdaMv*1e6) : null);
  const _evsl = _pv(metrics.ev_sales_ttm,
                    _evUSDv&&_revTtmMv&&_revTtmMv>0 ? _evUSDv/(_revTtmMv*1e6) : null);
  const _roe  = _pv(metrics.roe_ttm,
                    last?.net_income&&last?.equity>0    ? last.net_income/last.equity*100       : null);
  const _roa  = _pv(metrics.roa_ttm,
                    last?.net_income&&last?.total_assets>0 ? last.net_income/last.total_assets*100 : null);
  const _gm   = _pv(metrics.gross_margin_ttm,  last?.gross_margin);
  const _em   = _pv(metrics.ebitda_margin_ttm, last?.ebitda_margin);
  const _nm   = _pv(metrics.net_margin_ttm,    last?.net_margin);
  const _beta = _pv(metrics.beta);

  const exchange = (profile.exchange||'—').replace('NASDAQ NMS - GLOBAL MARKET','NASDAQ');
  const facts = [
    ['Sector',    profile.sector||'—'],
    ['Industria', profile.industry||'—'],
    ['Exchange',  exchange],
    ['País',      profile.country||'—'],
    ['Moneda',    profile.currency||'—'],
    ['IPO',       (profile.ipo_date||'').slice(0,10)||'—'],
    ['Empleados', profile.employees?`~${Number(profile.employees).toLocaleString('es-AR')}`:'—'],
    ['Div. Yield',(()=>{ const dy=profile.dividend_yield??metrics.dividend_yield; return dy!=null?`${Number(dy).toFixed(2)}%`:'—'; })()],
    ['FY End',    _fyStr(last)],
    ['Website',   profile.website?`<a href="${profile.website}" target="_blank"
      style="color:${_CY};text-decoration:none;font-size:.76rem">${profile.website.replace('https://','')}</a>`:'—'],
  ];

  const ratios = [
    ['P/E TTM',      _pe,   'x'],
    ['P/E Forward',  _pef,  'x'],
    ['P/S TTM',      _ps,   'x'],
    ['P/B',          _pb,   'x'],
    ['EV/EBITDA',    _eveb, 'x', true],
    ['EV/Sales',     _evsl, 'x'],
    ['ROE TTM',      _roe,  '%'],
    ['ROA TTM',      _roa,  '%'],
    ['Gross Margin', _gm,   '%'],
    ['EBITDA Margin',_em,   '%'],
    ['Net Margin',   _nm,   '%'],
    ['Beta',         _beta, ''],
  ].map(([l,val,suf,clamp])=>{
    const v   = val!=null?Number(val):null;
    // clamp: EV/EBITDA → N/A si negativo o absurdo (EBITDA < 0 o múltiplo > 999)
    const isNa= clamp&&v!=null&&(v<=0||Math.abs(v)>999);
    const str = isNa?'N/A':(v!=null?`${v.toFixed(1)}${suf}`:'—');
    const col = suf==='%'?(v>0?_GR:v<0?_RE:'#7F93AD'):'#C8D8E8';
    return `<div style="background:rgba(11,18,32,.7);border:1px solid ${_BOR};
      border-radius:7px;padding:9px 11px">
      <div style="font-size:.55rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
        color:#2D4157;margin-bottom:2px;font-family:${_MONO}">${l}</div>
      <div style="font-size:.90rem;font-weight:700;color:${col};font-family:${_MONO}">${str}</div>
    </div>`;
  });

  container.innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div style="display:flex;flex-direction:column;gap:10px">
        ${desc?`<div style="background:${_CARD};border:1px solid ${_BOR};border-radius:9px;padding:14px 16px">
          <div style="font-size:.55rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
            color:#2D4157;margin-bottom:7px;font-family:${_MONO}">DESCRIPCIÓN</div>
          <div style="color:#5A7390;font-size:.76rem;line-height:1.65">${desc}</div>
        </div>`:''}
        <div style="background:${_CARD};border:1px solid ${_BOR};border-radius:9px;overflow:hidden">
          ${facts.map(([l,v])=>`<div style="display:flex;align-items:center;justify-content:space-between;
            padding:8px 13px;border-bottom:1px solid rgba(30,45,61,.6)">
            <span style="font-size:.60rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
              color:#2D4157;font-family:${_MONO}">${l}</span>
            <span style="font-size:.74rem;font-weight:600;color:#C8D8E8;font-family:${_MONO}">${v}</span>
          </div>`).join('')}
        </div>
      </div>
      <div>
        <div style="font-size:.55rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
          color:#2D4157;margin-bottom:7px;font-family:${_MONO}">RATIOS CLAVE (TTM)</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px">${ratios.join('')}</div>
      </div>
    </div>`;
}


/* ══════════════════════════════════════════════════════════════════════════
   TAB: NEGOCIO — v5 benchmark-match
   Helpers propios (_kpiN, _cPanelN, _nBase, _nYaxM, _nYaxPct, _nLeg, _nTt)
   para no afectar Rentabilidad / Financiera / Valuación.
   ══════════════════════════════════════════════════════════════════════════ */

/* ── Negocio helpers ────────────────────────────────────────────────────── */

// KPI card para Negocio — benchmark style (#12182B, 2px top, 12px radius)
function _kpiN(label, value, sub, badge, color, negVal=false) {
  let badgeHtml='';
  if(badge!=null){
    const col=negVal?_RE:(badge>=0?_GR:_RE);
    const bg =negVal?'rgba(248,113,113,.10)':(badge>=0?'rgba(52,211,153,.10)':'rgba(248,113,113,.10)');
    const arr=badge>=0?'▲':'▼';
    const d  =Math.abs(badge)>=100?badge.toFixed(0):badge.toFixed(1);
    badgeHtml=`<span style="background:${bg};color:${col};border:1px solid ${col}28;
      border-radius:3px;padding:1px 4px;font-size:.50rem;font-weight:700;
      margin-left:3px;white-space:nowrap;font-family:${_MONO}">${arr} ${badge>=0?'+':''}${d}%</span>`;
  }
  const vlen=String(value).length;
  const vfont=vlen>9?'.84rem':vlen>7?'.95rem':'1.06rem';
  return`<div style="background:#12182B;border:1px solid #2A3350;border-top:2px solid ${color};
    border-radius:12px;padding:.75rem .9rem;box-sizing:border-box">
    <div style="font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;
      color:#94A3B8;margin-bottom:4px;font-family:${_MONO};white-space:nowrap;
      overflow:hidden;text-overflow:ellipsis">${label}</div>
    <div style="font-size:${vfont};font-weight:800;color:#F8FAFC;line-height:1;
      white-space:nowrap;font-family:${_MONO}">${value}</div>
    <div style="margin-top:4px;font-size:.56rem;color:#94A3B8;font-family:${_MONO};
      display:flex;align-items:center;flex-wrap:wrap;gap:2px">
      <span>${sub||''}</span>${badgeHtml}
    </div>
  </div>`;
}

// Panel de chart para Negocio — benchmark style (#12182B, sin divider naranja, 190px)
function _cPanelN(id, title, sub) {
  return `<div style="background:#12182B;border:1px solid #2A3350;border-radius:12px;overflow:hidden">
    <div style="padding:.9rem 1rem .5rem">
      <div style="font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;
        color:#94A3B8;font-family:${_MONO};margin-bottom:${sub?'4px':'0'}">${title}</div>
      ${sub?`<div style="font-size:14px;font-weight:800;color:#F8FAFC;font-family:${_MONO};
        line-height:1.1">${sub}</div>`:''}
    </div>
    <div id="${id}" style="height:190px"></div>
  </div>`;
}

// ECharts base para Negocio — gridlines más sutiles (.07), ejes en #7F93AD
function _nBase(xData) {
  return {
    grid:{left:10,right:10,top:8,bottom:28,containLabel:true},
    xAxis:[{type:'category',data:xData,boundaryGap:true,
      axisLabel:{color:'#7F93AD',fontFamily:_MONO,fontSize:8.5,interval:0},
      axisLine:{lineStyle:{color:'rgba(30,45,61,.7)'}},
      axisTick:{lineStyle:{color:'rgba(30,45,61,.5)'}},
      splitLine:{show:false}}],
    backgroundColor:'transparent',
  };
}

function _nYaxM(){
  return{type:'value',
    axisLabel:{color:'#7F93AD',fontFamily:_MONO,fontSize:8.5,
      formatter:v=>`${Math.abs(v)>=1000?(v<0?'-':'')+'$'+(Math.abs(v)/1000).toFixed(0)+'B':'$'+v.toFixed(0)+'M'}`},
    splitLine:{lineStyle:{color:'rgba(120,150,180,.07)',type:'dashed'}},
    axisLine:{show:false},axisTick:{show:false}};
}

function _nYaxPct(){
  return{type:'value',
    axisLabel:{color:'#7F93AD',fontFamily:_MONO,fontSize:8.5,
      formatter:v=>`${v.toFixed(0)}%`},
    splitLine:{lineStyle:{color:'rgba(120,150,180,.07)',type:'dashed'}},
    axisLine:{show:false},axisTick:{show:false}};
}

function _nYax2(fmt){
  return{type:'value',
    axisLabel:{color:'#7F93AD',fontFamily:_MONO,fontSize:8.5,formatter:fmt},
    splitLine:{show:false},axisLine:{show:false},axisTick:{show:false}};
}

// Leyenda horizontal compacta para Negocio
function _nLeg(data) {
  return{data,orient:'horizontal',bottom:2,left:0,
    textStyle:{color:'#7F93AD',fontSize:8.5,fontFamily:_MONO},
    icon:'rect',itemWidth:12,itemHeight:7,
    backgroundColor:'transparent'};
}

// Tooltip oscuro para Negocio
function _nTt(){
  return{trigger:'axis',backgroundColor:'#0B1220',
    borderColor:'rgba(30,45,61,.9)',borderWidth:1,padding:[7,11],
    textStyle:{fontFamily:_MONO,fontSize:10,color:'#C8D8E8'},
    axisPointer:{lineStyle:{color:'rgba(120,150,180,.12)'}}};
}

// Benchmark-match helpers para Negocio (grid oscuro rgba(30,41,59,.7))
function _nBaseN(xData) {
  return {
    grid:{left:10,right:10,top:8,bottom:28,containLabel:true},
    xAxis:[{type:'category',data:xData,boundaryGap:true,
      axisLabel:{color:'#94A3B8',fontFamily:_MONO,fontSize:9,interval:0},
      axisLine:{lineStyle:{color:'rgba(42,51,80,.9)'}},
      axisTick:{lineStyle:{color:'rgba(42,51,80,.7)'}},
      splitLine:{show:false}}],
    backgroundColor:'transparent',
  };
}
function _nYaxMN(){
  return{type:'value',
    axisLabel:{color:'#94A3B8',fontFamily:_MONO,fontSize:9,
      formatter:v=>`${Math.abs(v)>=1000?(v<0?'-':'')+'$'+(Math.abs(v)/1000).toFixed(0)+'B':'$'+v.toFixed(0)+'M'}`},
    splitLine:{lineStyle:{color:'rgba(30,41,59,.7)',type:'solid'}},
    axisLine:{show:false},axisTick:{show:false}};
}
function _nYaxPctN(){
  return{type:'value',
    axisLabel:{color:'#94A3B8',fontFamily:_MONO,fontSize:9,
      formatter:v=>`${v.toFixed(0)}%`},
    splitLine:{lineStyle:{color:'rgba(30,41,59,.7)',type:'solid'}},
    axisLine:{show:false},axisTick:{show:false}};
}
function _nYax2N(fmt){
  return{type:'value',
    axisLabel:{color:'#94A3B8',fontFamily:_MONO,fontSize:9,formatter:fmt},
    splitLine:{show:false},axisLine:{show:false},axisTick:{show:false}};
}
function _nLegN(data) {
  return{data,orient:'horizontal',bottom:2,left:0,
    textStyle:{color:'#94A3B8',fontSize:9,fontFamily:_MONO},
    icon:'circle',itemWidth:8,itemHeight:8,
    backgroundColor:'transparent'};
}
function _nTtN(){
  return{trigger:'axis',backgroundColor:'#0B0F1A',
    borderColor:'rgba(42,51,80,.9)',borderWidth:1,padding:[7,11],
    textStyle:{fontFamily:_MONO,fontSize:10,color:'#F8FAFC'},
    axisPointer:{lineStyle:{color:'rgba(42,51,80,.5)'}}};
}

// Y-axis múltiplos (x format, dark gridlines benchmark)
function _nYaxXN(){
  return{type:'value',
    axisLabel:{color:'#94A3B8',fontFamily:_MONO,fontSize:9,formatter:v=>`${v.toFixed(0)}x`},
    splitLine:{lineStyle:{color:'rgba(30,41,59,.7)',type:'solid'}},
    axisLine:{show:false},axisTick:{show:false}};
}

// Y-axis billones ($B format, dark gridlines benchmark)
function _nYaxBN(){
  return{type:'value',
    axisLabel:{color:'#94A3B8',fontFamily:_MONO,fontSize:9,formatter:v=>`$${v.toFixed(0)}B`},
    splitLine:{lineStyle:{color:'rgba(30,41,59,.7)',type:'solid'}},
    axisLine:{show:false},axisTick:{show:false}};
}

// Cierre anual: precio más cercano al 31-dic de cada año fiscal
function _buildAnnualPriceSeries(candles,years){
  if(!candles?.dates?.length||!years?.length)return years.map(()=>null);
  const cT=candles.dates.map(d=>new Date(d).getTime());
  return years.map(yr=>{
    const fyE=new Date(yr,11,31).getTime();
    let b=0,bD=Infinity;
    cT.forEach((t,i)=>{const diff=Math.abs(t-fyE);if(diff<bD){bD=diff;b=i;}});
    return candles.closes[b]!=null?+Number(candles.closes[b]).toFixed(2):null;
  });
}

/* ── Tab Negocio ─────────────────────────────────────────────────────────── */

function _tabNegocio(container, tk, data, metrics) {
  if (!data.length) { container.innerHTML = _noData('Sin datos financieros anuales'); return; }

  const last  = data[data.length-1];
  const first = data[0];
  const fy    = `FY${String(last.year).slice(2)}`;
  const fy0   = `FY${String(first.year).slice(2)}`;
  const rev   = last.revenue;
  const gp    = last.gross_profit;
  const ebitda= last.ebitda_est;
  const ni    = last.net_income;
  const fcf   = last.fcf;
  const eps   = last.eps_diluted ?? metrics.eps_ttm;
  const cagr  = last.rev_cagr_3y;

  // Benchmark: colores fijos por concepto, sin lógica de signo en KPIs
  const kpis=[
    {l:'REVENUE',      v:_fmtM(rev),    s:fy,                b:last.revenue_yoy,    c:'#22D3EE'},
    {l:'GROSS PROFIT', v:_fmtM(gp),     s:_marg(gp,rev),     b:null,                c:'#7C3AED'},
    {l:'EBITDA',       v:_fmtM(ebitda), s:_marg(ebitda,rev), b:null,                c:'#34D399'},
    {l:'NET INCOME',   v:_fmtM(ni),     s:_marg(ni,rev),     b:last.net_income_yoy, c:'#60A5FA'},
    {l:'EPS DILUIDO',  v:eps!=null?`$${Number(eps).toFixed(2)}`:'—',s:fy,b:null,   c:'#F59E0B'},
    {l:'FCF',          v:_fmtM(fcf),    s:_marg(fcf,rev),    b:last.fcf_yoy,        c:'#34D399'},
    {l:'REV CAGR',     v:cagr!=null?`${cagr.toFixed(1)}%`:'—',s:`${fy0}→${fy}`,b:null,c:'#F472B6'},
  ];

  const years = data.map(d=>`FY${String(d.year).slice(2)}`);
  const n     = years.length;

  const revStr  = _fmtM(rev);
  const yoyLast = last.revenue_yoy;
  const yoyStr  = yoyLast!=null?`${yoyLast>=0?'+':''}${yoyLast.toFixed(1)}% YoY`:'';
  const ebitStr = ebitda!=null?`EBITDA ${_fmtM(ebitda)}`:'';
  const niStr   = ni!=null?`NI ${_fmtM(ni)}`:'';

  container.innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:8px;margin-bottom:1rem">
      ${kpis.map(k=>_kpiN(k.l,k.v,k.s,k.b,k.c,false)).join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      ${_cPanelN('af-c-rev',   'REVENUE & EARNINGS', revStr)}
      ${_cPanelN('af-c-yoy',   'CRECIMIENTO YoY',    yoyStr)}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${_cPanelN('af-c-ebitda','EBITDA & MARGEN',    ebitStr)}
      ${_cPanelN('af-c-nieps', 'NET INCOME & EPS',   niStr)}
    </div>`;

  // Chart 1: Revenue barras uniform cyan .75, NI sign-based uniform .75
  _ch('af-c-rev', ch=>{
    ch.setOption({
      ..._nBaseN(years),
      yAxis:[_nYaxMN()],
      legend:_nLegN(['Revenue','Net Income']),
      series:[
        {name:'Revenue',   type:'bar',barGap:'4%',barCategoryGap:'38%',
          itemStyle:{borderRadius:[3,3,0,0],color:'rgba(34,211,238,.75)'},
          data:data.map(d=>d.revenue)},
        {name:'Net Income',type:'bar',
          itemStyle:{borderRadius:[3,3,0,0]},
          data:data.map(d=>({value:d.net_income,
            itemStyle:{color:d.net_income!=null&&d.net_income<0?'rgba(248,113,113,.75)':'rgba(52,211,153,.75)'}}))},
      ],
      tooltip:{..._nTtN(),valueFormatter:v=>v!=null?`$${v.toFixed(0)}M`:'—'},
    });
  });

  // Chart 2: Revenue YoY — línea #7C3AED + área + smooth:true (benchmark)
  _ch('af-c-yoy', ch=>{
    const yoyPairs=data.map(d=>({y:`FY${String(d.year).slice(2)}`,v:d.revenue_yoy})).filter(p=>p.v!=null);
    const yoyYears=yoyPairs.map(p=>p.y);
    const yoyVals =yoyPairs.map(p=>p.v);
    ch.setOption({
      ..._nBaseN(yoyYears),
      yAxis:[_nYaxPctN()],
      series:[{name:'Rev YoY %',type:'line',data:yoyVals,
        smooth:true,symbol:'circle',symbolSize:4,
        lineStyle:{color:'#7C3AED',width:2},itemStyle:{color:'#7C3AED'},
        areaStyle:{color:'rgba(124,58,237,.10)'},
        markLine:{silent:true,data:[{yAxis:0}],
          lineStyle:{color:'rgba(124,58,237,.30)',width:1,type:'dashed'},
          label:{show:false},symbol:'none'},
      }],
      tooltip:{..._nTtN(),valueFormatter:v=>v!=null?`${v>=0?'+':''}${v.toFixed(1)}%`:'—'},
    });
  },!data.some(d=>d.revenue_yoy!=null));

  // Chart 3: EBITDA #7C3AED binary (último sólido, histórico rgba .20) + Margen #F472B6 smooth
  _ch('af-c-ebitda', ch=>{
    ch.setOption({
      ..._nBaseN(years),
      yAxis:[
        _nYaxMN(),
        _nYax2N(v=>`${v.toFixed(0)}%`),
      ],
      legend:_nLegN(['EBITDA','Margen %']),
      series:[
        {name:'EBITDA',type:'bar',yAxisIndex:0,barCategoryGap:'38%',
          itemStyle:{borderRadius:[2,2,0,0]},
          data:data.map((d,i)=>({value:d.ebitda_est,
            itemStyle:{color:i===n-1?'#7C3AED':'rgba(124,58,237,.20)'}}))},
        {name:'Margen %',type:'line',yAxisIndex:1,
          data:data.map(d=>d.ebitda_margin??null),
          connectNulls:false,smooth:true,symbol:'circle',symbolSize:4,
          lineStyle:{color:'#F472B6',width:1.8},itemStyle:{color:'#F472B6'}},
      ],
      tooltip:{..._nTtN()},
    });
  });

  // Chart 4: NI #22D3EE binary (último sólido, histórico .20), EPS #34D399 smooth
  _ch('af-c-nieps', ch=>{
    ch.setOption({
      ..._nBaseN(years),
      yAxis:[
        _nYaxMN(),
        _nYax2N(v=>`$${Math.abs(v)<10?v.toFixed(2):v.toFixed(1)}`),
      ],
      legend:_nLegN(['Net Income','EPS']),
      series:[
        {name:'Net Income',type:'bar',yAxisIndex:0,barCategoryGap:'38%',
          itemStyle:{borderRadius:[2,2,0,0]},
          data:data.map((d,i)=>({value:d.net_income,
            itemStyle:{color:i===n-1?'#22D3EE':'rgba(34,211,238,.20)'}}))},
        {name:'EPS',type:'line',yAxisIndex:1,
          data:data.map(d=>d.eps_diluted??null),
          connectNulls:false,smooth:true,symbol:'circle',symbolSize:4,
          lineStyle:{color:'#34D399',width:1.8},itemStyle:{color:'#34D399'}},
      ],
      tooltip:{..._nTtN()},
    });
  });
}


/* ══════════════════════════════════════════════════════════════════════════
   TAB: RENTABILIDAD — v4 benchmark-match
   Misma estética que Negocio: #12182B/#2A3350/12px/dark-gridlines.
   ══════════════════════════════════════════════════════════════════════════ */

/* ── Rentabilidad helpers ───────────────────────────────────────────────── */

// KPI card Rentabilidad — idéntico al benchmark (mismo estilo que _kpiN)
function _kpiR(label, value, sub, badge, color, negVal=false) {
  let badgeHtml='';
  if(badge!=null){
    const col=badge>=0?_GR:_RE;
    const bg =badge>=0?'rgba(52,211,153,.10)':'rgba(248,113,113,.10)';
    const arr=badge>=0?'▲':'▼';
    const d  =Math.abs(badge)>=100?badge.toFixed(0):badge.toFixed(1);
    badgeHtml=`<span style="background:${bg};color:${col};border:1px solid ${col}28;
      border-radius:3px;padding:1px 4px;font-size:.50rem;font-weight:600;
      margin-left:3px;white-space:nowrap;font-family:${_MONO}">${arr} ${badge>=0?'+':''}${d}%</span>`;
  }
  const vlen=String(value).length;
  const vfont=vlen>9?'13px':vlen>7?'15px':'17px';
  return`<div style="background:#12182B;border:1px solid #2A3350;border-top:2px solid ${color};
    border-radius:12px;padding:.75rem .9rem;box-sizing:border-box">
    <div style="font-size:9px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;
      color:#94A3B8;margin-bottom:2px;font-family:${_MONO};white-space:nowrap;
      overflow:hidden;text-overflow:ellipsis">${label}</div>
    <div style="font-size:${vfont};font-weight:600;color:#F8FAFC;line-height:1.2;
      white-space:nowrap;font-family:${_MONO}">${value}</div>
    <div style="margin-top:2px;font-size:9px;color:#94A3B8;font-family:${_MONO};
      display:flex;align-items:center;flex-wrap:wrap;gap:2px">
      <span>${sub||''}</span>${badgeHtml}
    </div>
  </div>`;
}

// Panel de chart Rentabilidad — igual que Negocio, sin divider naranja, altura configurable
function _cPanelR(id, title, sub, h=200) {
  return `<div style="background:#12182B;border:1px solid #2A3350;border-radius:12px;overflow:hidden">
    <div style="padding:.9rem 1rem .5rem">
      <div style="font-size:9px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;
        color:#94A3B8;font-family:${_MONO};margin-bottom:${sub?'2px':'0'}">${title}</div>
      ${sub?`<div style="font-size:14px;font-weight:600;color:#F8FAFC;font-family:${_MONO};
        line-height:1.2;margin-bottom:.5rem">${sub}</div>`:''}
    </div>
    <div id="${id}" style="height:${h}px"></div>
  </div>`;
}

/* ── Tab Rentabilidad ────────────────────────────────────────────────────── */

function _tabRentabilidad(container, tk, data, metrics) {
  if (!data.length) { container.innerHTML = _noData('Sin datos financieros'); return; }
  const last=data[data.length-1];
  const fy=`FY${String(last.year).slice(2)}`;

  // KPI cards — colores fijos del benchmark
  const kpis=[
    {l:'FCF',          v:_fmtM(last.fcf),  s:_marg(last.fcf,last.revenue), b:last.fcf_yoy, c:'#22D3EE'},
    {l:'OP CASH FLOW', v:_fmtM(last.cfo),  s:fy,                            b:null,         c:'#7C3AED'},
    {l:'EBITDA MARGIN',v:last.ebitda_margin!=null?`${last.ebitda_margin.toFixed(1)}%`:'—',s:fy,b:null,c:'#34D399'},
    {l:'FCF MARGIN',   v:last.fcf_margin!=null?`${last.fcf_margin.toFixed(1)}%`:'—',s:fy,b:null,c:'#F59E0B'},
    {l:'ROE TTM',      v:metrics.roe_ttm!=null?`${metrics.roe_ttm.toFixed(1)}%`:'—',s:'TTM',b:null,c:'#F472B6'},
    {l:'ROIC TTM',     v:metrics.roic_ttm!=null?`${metrics.roic_ttm.toFixed(1)}%`:'—',s:'TTM',b:null,c:'#60A5FA'},
  ];

  // Últimos 5 ejercicios (igual al benchmark FY22-FY26)
  const d5  = data.slice(-5);
  const n5  = d5.length;
  const yrs = d5.map(d=>`FY${String(d.year).slice(2)}`);

  // Métricas destacadas en header de cada chart (formato benchmark)
  const opStr  = last.ebit_margin!=null   ? `${last.ebit_margin.toFixed(1)}% Op Margin` : '';
  const fcfStr = last.fcf!=null           ? `${_fmtM(last.fcf)} FCF`                    : '';
  const fcfmStr= last.fcf_margin!=null    ? `${last.fcf_margin.toFixed(1)}% FCF Margin` : '';

  // ROE histórico para chart header — calculado desde datos anuales
  const _roeVal = d => (d.net_income!=null && d.equity!=null && Math.abs(d.equity)>0.001)
    ? +(d.net_income / d.equity * 100).toFixed(1) : null;
  const lastRoeCalc = _roeVal(last);
  const retStr = lastRoeCalc!=null ? `ROE ${lastRoeCalc.toFixed(1)}%` : '';

  container.innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin-bottom:1rem">
      ${kpis.map(k=>_kpiR(k.l,k.v,k.s,k.b,k.c)).join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      ${_cPanelR('af-r-marg',  'MÁRGENES',            opStr,  200)}
      ${_cPanelR('af-r-fcfcfo','FREE CASH FLOW',       fcfStr, 200)}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${_cPanelR('af-r-ret',   'RETORNOS CAPITAL',    retStr, 190)}
      ${_cPanelR('af-r-fcfm',  'FCF VS PROFIT MARGIN',fcfmStr,190)}
    </div>`;

  // Chart 1 — MÁRGENES: Gross(cyan sólido) · EBITDA(violeta dash) · Operating(pink dash) · Net(verde dash)
  _ch('af-r-marg', ch=>{
    ch.setOption({
      ..._nBaseN(yrs),
      yAxis:[_nYaxPctN()],
      legend:_nLegN(['Gross','EBITDA','Operating','Net']),
      series:[
        {name:'Gross',     type:'line',data:d5.map(d=>d.gross_margin??null),
          connectNulls:false,smooth:true,symbol:'circle',symbolSize:3,
          lineStyle:{color:'#22D3EE',width:2},itemStyle:{color:'#22D3EE'}},
        {name:'EBITDA',    type:'line',data:d5.map(d=>d.ebitda_margin??null),
          connectNulls:false,smooth:true,symbol:'circle',symbolSize:3,
          lineStyle:{color:'#7C3AED',width:2,type:'dashed'},itemStyle:{color:'#7C3AED'}},
        {name:'Operating', type:'line',data:d5.map(d=>d.ebit_margin??null),
          connectNulls:false,smooth:true,symbol:'circle',symbolSize:3,
          lineStyle:{color:'#F472B6',width:2,type:'dashed'},itemStyle:{color:'#F472B6'}},
        {name:'Net',       type:'line',data:d5.map(d=>d.net_margin??null),
          connectNulls:false,smooth:true,symbol:'circle',symbolSize:3,
          lineStyle:{color:'#34D399',width:2,type:'dashed'},itemStyle:{color:'#34D399'}},
      ],
      tooltip:{..._nTtN(),valueFormatter:v=>v!=null?`${v.toFixed(1)}%`:'—'},
    });
  });

  // Chart 2 — FREE CASH FLOW: FCF barras cyan · OCF línea violeta (benchmark combo)
  _ch('af-r-fcfcfo', ch=>{
    ch.setOption({
      ..._nBaseN(yrs),
      yAxis:[_nYaxMN()],
      legend:_nLegN(['FCF (barras)','OCF (línea)']),
      series:[
        {name:'FCF (barras)', type:'bar',barCategoryGap:'40%',
          itemStyle:{borderRadius:[3,3,0,0]},
          data:d5.map((d,i)=>({value:d.fcf??null,
            itemStyle:{color:i===n5-1?'#22D3EE':'rgba(34,211,238,.20)'}}))},
        {name:'OCF (línea)',  type:'line',
          connectNulls:false,smooth:true,symbol:'circle',symbolSize:3,
          lineStyle:{color:'#7C3AED',width:2},itemStyle:{color:'#7C3AED'},
          data:d5.map(d=>d.cfo??null)},
      ],
      tooltip:{..._nTtN(),valueFormatter:v=>v!=null?`$${v.toFixed(0)}M`:'—'},
    });
  });

  // Chart 3 — RETORNOS CAPITAL: líneas históricas ROE(cyan) · ROA(violeta dash) · ROIC(pink dash)
  _ch('af-r-ret', ch=>{
    const safeDiv = (a, b) => (a!=null && b!=null && Math.abs(b)>0.001) ? +(a/b*100).toFixed(1) : null;
    const roeArr  = d5.map(d => safeDiv(d.net_income, d.equity));
    const roaArr  = d5.map(d => safeDiv(d.net_income, d.total_assets));
    const roicArr = d5.map(d => {
      const ic = (d.equity??0) + (d.total_debt??0);
      return safeDiv(d.net_income, ic > 0.001 ? ic : null);
    });
    const hasAny = [...roeArr,...roaArr,...roicArr].some(v=>v!=null);
    ch.setOption({
      ..._nBaseN(yrs),
      yAxis:[_nYaxPctN()],
      legend:_nLegN(['ROE','ROA','ROIC']),
      series:[
        {name:'ROE',  type:'line',data:roeArr,  connectNulls:false,smooth:true,symbol:'circle',symbolSize:3,
          lineStyle:{color:'#22D3EE',width:2},            itemStyle:{color:'#22D3EE'}},
        {name:'ROA',  type:'line',data:roaArr,  connectNulls:false,smooth:true,symbol:'circle',symbolSize:3,
          lineStyle:{color:'#7C3AED',width:2,type:'dashed'},itemStyle:{color:'#7C3AED'}},
        {name:'ROIC', type:'line',data:roicArr, connectNulls:false,smooth:true,symbol:'circle',symbolSize:3,
          lineStyle:{color:'#F472B6',width:2,type:'dashed'},itemStyle:{color:'#F472B6'}},
      ],
      tooltip:{..._nTtN(),valueFormatter:v=>v!=null?`${Number(v).toFixed(1)}%`:'—'},
    });
    if (!hasAny) ch.setOption({graphic:[{type:'text',left:'center',top:'middle',
      style:{text:'Sin datos disponibles',fill:'#94A3B8',fontSize:11,fontFamily:_MONO}}]});
  });

  // Chart 4 — FCF VS PROFIT MARGIN: FCF Margin cyan+fill · Profit Margin violeta dash
  _ch('af-r-fcfm', ch=>{
    ch.setOption({
      ..._nBaseN(yrs),
      yAxis:[_nYaxPctN()],
      legend:_nLegN(['FCF Margin','Profit Margin']),
      series:[
        {name:'FCF Margin',   type:'line',data:d5.map(d=>d.fcf_margin??null),
          connectNulls:false,smooth:true,symbol:'circle',symbolSize:3,
          lineStyle:{color:'#22D3EE',width:2},itemStyle:{color:'#22D3EE'},
          areaStyle:{color:'rgba(34,211,238,.10)'}},
        {name:'Profit Margin',type:'line',data:d5.map(d=>d.net_margin??null),
          connectNulls:false,smooth:true,symbol:'circle',symbolSize:3,
          lineStyle:{color:'#7C3AED',width:2,type:'dashed'},itemStyle:{color:'#7C3AED'}},
      ],
      tooltip:{..._nTtN(),valueFormatter:v=>v!=null?`${v.toFixed(1)}%`:'—'},
    });
  },!d5.some(d=>d.fcf_margin!=null));
}


/* ══════════════════════════════════════════════════════════════════════════
   TAB: FINANCIERA — v2 benchmark-match
   Misma estética que Negocio/Rentabilidad: _kpiN/_cPanelN/_nBaseN helpers.
   ══════════════════════════════════════════════════════════════════════════ */

function _tabFinanciera(container, tk, data) {
  if (!data.length) { container.innerHTML = _noData('Sin datos financieros'); return; }
  const last=data[data.length-1];
  const prev=data.length>1?data[data.length-2]:null;
  const fy=`FY${String(last.year).slice(2)}`;
  const ncNeg=last.net_cash!=null&&last.net_cash<0;

  // KPI colors exactos del benchmark
  const kpis=[
    {l:'CASH & EQUIV.',v:_fmtM(last.cash),       s:fy,                     b:_yoy(last.cash,prev?.cash),      c:'#22D3EE'},
    {l:'DEUDA TOTAL',  v:_fmtM(last.total_debt),  s:fy,                     b:null,                            c:'#FB7185'},
    {l:'NET CASH',     v:_fmtM(last.net_cash),    s:ncNeg?'Deuda neta':'Posicion positiva',
                                                                              b:_yoy(last.net_cash,prev?.net_cash),c:ncNeg?'#FB7185':'#34D399'},
    {l:'TOTAL ASSETS', v:_fmtM(last.total_assets),s:fy,                     b:_yoy(last.total_assets,prev?.total_assets),c:'#7C3AED'},
    {l:'EQUITY',       v:_fmtM(last.equity),      s:fy,                     b:null,                            c:'#F59E0B'},
    {l:'DEUDA/EQUITY', v:last.de_ratio!=null?`${last.de_ratio.toFixed(2)}x`:'—',s:'Leverage',b:null,           c:'#F472B6'},
    {l:'FCF',          v:_fmtM(last.fcf),         s:_marg(last.fcf,last.revenue),b:null,                      c:'#34D399'},
    {l:'CAPEX',        v:last.capex!=null?_fmtM(last.capex):'—',            s:'Inversion activos',b:null,      c:'#94A3B8'},
  ];

  const years=data.map(d=>`FY${String(d.year).slice(2)}`);
  const n=data.length;

  // Sub-headlines: valor primero, luego label (formato benchmark: "$5.2B Cash")
  const cashSub  = `${_fmtM(last.cash)} Cash`;
  const ncSub    = `${_fmtM(last.net_cash)} Net Cash`;
  const assetsSub= `${_fmtM(last.total_assets)} Assets`;
  const fcfSub   = `${_fmtM(last.fcf)} FCF`;

  container.innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:1rem">
      ${kpis.map(k=>_kpiN(k.l,k.v,k.s,k.b,k.c,false)).join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      ${_cPanelN('af-c-cashd','CASH VS DEUDA TOTAL',  cashSub)}
      ${_cPanelN('af-c-netc', 'NET CASH / DEUDA NETA', ncSub)}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${_cPanelN('af-c-aseq', 'TOTAL ASSETS VS EQUITY',assetsSub)}
      ${_cPanelN('af-c-fcfcx','FCF VS CAPEX',           fcfSub)}
    </div>`;

  // Chart 1 — CASH VS DEUDA TOTAL: barras agrupadas · cyan / pink-red · 20% histórico
  _ch('af-c-cashd', ch=>{
    ch.setOption({
      ..._nBaseN(years),
      yAxis:[_nYaxMN()],
      legend:_nLegN(['Cash & Equiv.','Deuda Total']),
      series:[
        {name:'Cash & Equiv.',type:'bar',barGap:'4%',barCategoryGap:'38%',
          itemStyle:{borderRadius:[3,3,0,0]},
          data:data.map((d,i)=>({value:d.cash??null,
            itemStyle:{color:i===n-1?'#22D3EE':'rgba(34,211,238,.20)'}}))},
        {name:'Deuda Total',  type:'bar',
          itemStyle:{borderRadius:[3,3,0,0]},
          data:data.map((d,i)=>({value:d.total_debt??null,
            itemStyle:{color:i===n-1?'#FB7185':'rgba(251,113,133,.20)'}}))},
      ],
      tooltip:{..._nTtN(),valueFormatter:v=>v!=null?`$${v.toFixed(0)}M`:'—'},
    });
  });

  // Chart 2 — NET CASH / DEUDA NETA: barras simples · verde/rojo por signo · .65 opacity flat
  _ch('af-c-netc', ch=>{
    ch.setOption({
      ..._nBaseN(years),
      yAxis:[_nYaxMN()],
      series:[{name:'Net Cash',type:'bar',barCategoryGap:'45%',
        itemStyle:{borderRadius:[3,3,0,0]},
        data:data.map(d=>({value:d.net_cash??null,
          itemStyle:{
            color:(d.net_cash??0)>=0?'rgba(52,211,153,.65)':'rgba(248,113,113,.65)',
            borderColor:(d.net_cash??0)>=0?'#34D399':'#F87171',
          }}))
      }],
      tooltip:{..._nTtN(),valueFormatter:v=>v!=null?`$${v.toFixed(0)}M`:'—'},
    });
  });

  // Chart 3 — TOTAL ASSETS VS EQUITY: barras agrupadas · violeta / verde · 20% histórico
  _ch('af-c-aseq', ch=>{
    ch.setOption({
      ..._nBaseN(years),
      yAxis:[_nYaxMN()],
      legend:_nLegN(['Total Assets','Equity']),
      series:[
        {name:'Total Assets',type:'bar',barGap:'4%',barCategoryGap:'38%',
          itemStyle:{borderRadius:[3,3,0,0]},
          data:data.map((d,i)=>({value:d.total_assets??null,
            itemStyle:{color:i===n-1?'#7C3AED':'rgba(124,58,237,.20)'}}))},
        {name:'Equity',      type:'bar',
          itemStyle:{borderRadius:[3,3,0,0]},
          data:data.map((d,i)=>({value:d.equity??null,
            itemStyle:{color:i===n-1?'#34D399':'rgba(52,211,153,.20)'}}))},
      ],
      tooltip:{..._nTtN(),valueFormatter:v=>v!=null?`$${v.toFixed(0)}M`:'—'},
    });
  });

  // Chart 4 — FCF VS CAPEX: FCF cyan · Capex valor absoluto amber · 20% histórico
  _ch('af-c-fcfcx', ch=>{
    ch.setOption({
      ..._nBaseN(years),
      yAxis:[_nYaxMN()],
      legend:_nLegN(['FCF','Capex (abs)']),
      series:[
        {name:'FCF',       type:'bar',barGap:'4%',barCategoryGap:'38%',
          itemStyle:{borderRadius:[3,3,0,0]},
          data:data.map((d,i)=>({value:d.fcf??null,
            itemStyle:{color:i===n-1?'#22D3EE':'rgba(34,211,238,.20)'}}))},
        {name:'Capex (abs)',type:'bar',
          itemStyle:{borderRadius:[3,3,0,0]},
          data:data.map((d,i)=>({value:d.capex!=null?Math.abs(d.capex):null,
            itemStyle:{color:i===n-1?'#F59E0B':'rgba(245,158,11,.20)'}}))},
      ],
      tooltip:{..._nTtN(),valueFormatter:v=>v!=null?`$${v.toFixed(0)}M`:'—'},
    });
  });
}


/* ══════════════════════════════════════════════════════════════════════════
   TAB: VALUACIÓN — v2 benchmark-match
   ══════════════════════════════════════════════════════════════════════════ */

// Convierte hist_* de Finnhub [{year, v}] → array paralelo a `years`
function _fhSeries(hist, years) {
  if (!Array.isArray(hist) || !hist.length) return years.map(() => null);
  const byYear = {};
  hist.forEach(h => { if (h?.year != null) byYear[h.year] = h.v; });
  return years.map(yr => {
    const v = byYear[yr];
    return (v != null && Number.isFinite(+v) && +v > 0 && +v < 999) ? +v : null;
  });
}

function _tabValuacion(container, tk, data, metrics, profile, candles) {
  const mcapM   = profile.market_cap;
  const shares  = profile.shares;
  const mcapUSD = mcapM ? mcapM*1e6 : null;
  const last    = data.length ? data[data.length-1] : null;

  // EV: metrics (yfinance) primero, fallback mcap − net_cash
  const ncM     = last?.net_cash ?? 0;
  const evM     = metrics.enterprise_value_m;
  const evUSD   = evM != null ? evM*1e6 : (mcapUSD != null ? mcapUSD - ncM*1e6 : null);

  // EBITDA / FCF / Revenue TTM: metrics o último año P&L como fallback
  const ebitdaM = metrics.ebitda_ttm_m ?? last?.ebitda_est ?? null;
  const fcfTtmM = metrics.fcf_ttm_m ?? (last?.fcf && last.fcf > 0 ? last.fcf : null);
  const revTtmM = metrics.revenue_ttm_m ?? last?.revenue ?? null;

  // Múltiplos TTM — con fallback desde financials si metrics es vacío
  const _pv2 = (...vs) => { for(const v of vs){ const n=+v; if(v!=null&&Number.isFinite(n)&&n>0) return n; } return null; };
  const pe = _pv2(metrics.pe_ttm,
                  mcapM&&last?.net_income>0 ? mcapM/last.net_income : null);
  const ps = _pv2(metrics.ps_ttm,
                  mcapM&&revTtmM&&revTtmM>0 ? mcapM/revTtmM : null,
                  mcapM&&last?.revenue>0     ? mcapM/last.revenue   : null);
  const pb = _pv2(metrics.pb_annual);

  // EV/EBITDA: metrics si positivo, sino fallback calculado
  const _evEbitRaw = metrics.ev_ebitda_ttm;
  const evEbit = (_evEbitRaw != null && _evEbitRaw > 0 && _evEbitRaw < 999)
    ? _evEbitRaw
    : (evUSD != null && ebitdaM != null && ebitdaM > 0 ? evUSD/(ebitdaM*1e6) : null);

  // EV/SALES: metrics si positivo, sino fallback calculado
  const _evSlsRaw = metrics.ev_sales_ttm;
  const evSales = (_evSlsRaw != null && _evSlsRaw > 0)
    ? _evSlsRaw
    : (evUSD != null && revTtmM != null && revTtmM > 0 ? evUSD/(revTtmM*1e6) : null);

  const pfcf = _pv2(mcapM&&fcfTtmM&&fcfTtmM>0 ? mcapM/fcfTtmM : null,
                    mcapM&&last?.fcf>0          ? mcapM/last.fcf : null);

  // Validators / formatters
  const _ok  = v => v != null && Number.isFinite(+v) && +v > 0 && +v < 999;
  const _mF  = v => _ok(v) ? `${(+v).toFixed(1)}x` : '—';
  const _has = arr => Array.isArray(arr) && arr.some(v => _ok(v));

  const ebitdaIsNeg = ebitdaM != null && ebitdaM <= 0;

  // 5 períodos FY22-FY26
  const d5   = data.slice(-5);
  const n5   = d5.length;
  const yrs5 = d5.map(d=>`FY${String(d.year).slice(2)}`);

  // Shares fallback: estimar desde mcapM / precio actual del último candle
  let sharesEst = shares;
  if (!sharesEst && mcapM && candles?.closes?.length) {
    const lastPx = candles.closes[candles.closes.length - 1];
    if (lastPx && lastPx > 0) sharesEst = mcapM / lastPx;  // ambos en unidades homogéneas → millones
  }

  // Múltiplos históricos reales (precio FY-end × shares)
  const hist5 = _computeHistMult(d5, candles, sharesEst);
  const histEx = hist5.map((h,i)=>{
    const d  = d5[i];
    const hev= h.hist_mcap ? h.hist_mcap-(d.net_cash??0)*1e6 : null;
    return{...h,
      pb:       (h.hist_mcap&&d.equity&&d.equity>0)        ? h.hist_mcap/(d.equity*1e6)  : null,
      ev_ebitda:(hev&&d.ebitda_est&&d.ebitda_est>0)         ? hev/(d.ebitda_est*1e6)      : null,
      ev_sales: (hev&&d.revenue&&d.revenue>0)               ? hev/(d.revenue*1e6)         : null,
    };
  });

  // Arrays históricos — Finnhub historical (primario, no depende de candles) + computed fallback
  const fhYears = d5.map(d => d.year);
  const fhPeH   = _fhSeries(metrics.hist_pe,       fhYears);
  const fhPsH   = _fhSeries(metrics.hist_ps,        fhYears);
  const fhPbH   = _fhSeries(metrics.hist_pb,        fhYears);
  const fhEvH   = _fhSeries(metrics.hist_ev_ebitda, fhYears);

  // Computed desde candles × shares (fallback cuando Finnhub no tiene series)
  const compPeH     = histEx.map(h=>h.pe      &&h.pe     >0&&h.pe     <999?+h.pe.toFixed(1)        :null);
  const compPsH     = histEx.map(h=>h.ps      &&h.ps     >0&&h.ps     <999?+h.ps.toFixed(1)        :null);
  const compPbH     = histEx.map(h=>h.pb      &&h.pb     >0&&h.pb     <200?+h.pb.toFixed(1)        :null);
  const compEvEbitH = histEx.map(h=>h.ev_ebitda&&h.ev_ebitda>0&&h.ev_ebitda<400?+h.ev_ebitda.toFixed(1):null);

  // Merge: Finnhub historical primero, computed desde candles como fallback
  const peH     = fhPeH.map((v,i)  => v ?? compPeH[i]);
  const psH     = fhPsH.map((v,i)  => v ?? compPsH[i]);
  const pfH     = histEx.map(h=>h.pfcf&&h.pfcf>0&&h.pfcf<999?+h.pfcf.toFixed(1):null);
  const pbH     = fhPbH.map((v,i)  => v ?? compPbH[i]);
  const evEbitH = fhEvH.map((v,i)  => v ?? compEvEbitH[i]);
  const evSlsH  = histEx.map(h=>h.ev_sales&&h.ev_sales>0&&h.ev_sales<999?+h.ev_sales.toFixed(1):null);
  const mcapH   = histEx.map(h=>h.hist_mcap ? +(h.hist_mcap/1e9).toFixed(1) : null);
  const evH     = histEx.map((h,i)=>{
    if(!h.hist_mcap)return null;
    return +((h.hist_mcap-(d5[i]?.net_cash??0)*1e6)/1e9).toFixed(1);
  });

  const _avg5 = arr=>{ const v=arr.filter(x=>x!=null&&Number.isFinite(x)&&x>0); return v.length?v.reduce((a,b)=>a+b,0)/v.length:null; };

  // ── KPI row: P/E y EV/EBITDA solo aparecen si tienen valor válido ──────────
  const kpiAll = [
    {l:'MARKET CAP', v:mcapUSD!=null?_fmtB(mcapUSD):'—', s:'',    c:'#22D3EE'},
    {l:'EV',         v:evUSD!=null?_fmtB(evUSD):'—',     s:'',    c:'#7C3AED'},
    ..._ok(pe)     ? [{l:'P/E',       v:_mF(pe),     s:'TTM', c:'#94A3B8'}] : [],
    ..._ok(evEbit) ? [{l:'EV/EBITDA', v:_mF(evEbit), s:'TTM', c:'#94A3B8'}] : [],
    {l:'P/FCF',      v:_mF(pfcf),                         s:'TTM', c:'#94A3B8'},
    {l:'P/S',        v:_mF(ps),                           s:'TTM', c:'#94A3B8'},
  ];

  // ── Cards de múltiplos: solo si tiene valor actual O histórico válido ───────
  const multDefs = [
    {l:'P/E',      v:pe,      avg:_avg5(peH),     h:peH},
    {l:'EV/EBITDA',v:evEbit,  avg:_avg5(evEbitH), h:evEbitH},
    {l:'P/S',      v:ps,      avg:_avg5(psH),     h:psH},
    {l:'P/B',      v:pb,      avg:_avg5(pbH),     h:pbH},
    {l:'P/FCF',    v:pfcf,    avg:_avg5(pfH),     h:pfH},
    {l:'EV/SALES', v:evSales, avg:_avg5(evSlsH),  h:evSlsH},
  ].filter(m => _ok(m.v) || _has(m.h));

  const multCards = multDefs.map(({l,v,avg})=>{
    const str = _ok(v) ? `${(+v).toFixed(1)}x` : '—';
    let comp  = `<span style="color:#94A3B8;font-size:.60rem;font-family:${_MONO}">N/D</span>`;
    if(_ok(v) && avg!=null && avg>0){
      const diff=(+v-avg)/avg*100;
      const col =diff>0?'#F59E0B':'#34D399';
      const arr =diff>0?'▲':'▼';
      comp=`<span style="color:${col};font-size:.60rem;font-weight:600;font-family:${_MONO}">${arr} ${Math.abs(diff).toFixed(1)}% vs hist (${avg.toFixed(1)}x)</span>`;
    }
    return `<div style="background:#12182B;border:1px solid #2A3350;border-radius:12px;padding:10px 12px;box-sizing:border-box">
      <div style="font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#94A3B8;margin-bottom:4px;font-family:${_MONO}">${l}</div>
      <div style="font-size:1.05rem;font-weight:700;color:#F8FAFC;font-family:${_MONO}">${str}</div>
      <div style="margin-top:3px">${comp}</div>
    </div>`;
  });

  // Serie anual de precio
  const annualPx = _buildAnnualPriceSeries(candles, d5.map(d=>d.year));
  const pxLast   = annualPx.filter(v=>v!=null).at(-1);

  const DEBUG_FUNDAMENTALS = false;
  if (DEBUG_FUNDAMENTALS) {
    console.group('[AF DEBUG] _tabValuacion:', tk);
    console.log('candles:', {dates: candles?.dates?.length, closes: candles?.closes?.length});
    console.log('sharesEst:', sharesEst, '| shares:', shares, '| mcapM:', mcapM);
    console.log('fhPeH:', fhPeH, '→ peH:', peH);
    console.log('fhPsH:', fhPsH, '→ psH:', psH);
    console.log('fhPbH:', fhPbH, '→ pbH:', pbH);
    console.log('fhEvH:', fhEvH, '→ evEbitH:', evEbitH);
    console.log('pfH:', pfH, '| mcapH:', mcapH, '| evH:', evH);
    console.log('annualPx:', annualPx);
    console.groupEnd();
  }

  // Sub-headers
  const peSub   = `P/E ${_mF(pe)}`;
  const psSub   = `P/S ${_mF(ps)}`;
  const mcapSub = mcapUSD!=null ? `${_fmtB(mcapUSD)} Mkt Cap` : '';
  const pxSub   = pxLast!=null  ? `$${pxLast.toFixed(2)}`    : '';

  // ── Chart P/E VS EV/EBITDA: solo si alguna serie tiene datos ───────────────
  const showPeChart = _has(peH) || _has(evEbitH);

  // ── Grid de charts dinámico: omitir P/E si no hay datos ────────────────────
  const chartItems = [
    ...(showPeChart ? [_cPanelN('af-c-pe',   'P/E VS EV/EBITDA',    peSub)] : []),
    _cPanelN('af-c-pspf', 'P/S Y P/FCF',          psSub),
    _cPanelN('af-c-mcap', 'MARKET CAP Y EV ($B)', mcapSub),
    _cPanelN('af-c-px',   'PRECIO HISTÓRICO',      pxSub),
  ];

  // Si hay número impar de charts, el último ocupa las dos columnas
  const chartHTML = chartItems.map((html, i) => {
    if(chartItems.length % 2 !== 0 && i === chartItems.length - 1)
      return `<div style="grid-column:1/-1">${html}</div>`;
    return html;
  }).join('');

  container.innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(${kpiAll.length},minmax(0,1fr));gap:8px;margin-bottom:1rem">
      ${kpiAll.map(k=>_kpiN(k.l,k.v,k.s,null,k.c)).join('')}
    </div>
    ${multCards.length ? `
    <div style="display:flex;align-items:center;gap:6px;margin:4px 0 10px">
      <span style="width:6px;height:6px;border-radius:50%;background:#22D3EE;display:inline-block;flex-shrink:0"></span>
      <span style="font-size:9px;font-weight:700;letter-spacing:.10em;text-transform:uppercase;color:#94A3B8;font-family:${_MONO}">MULTIPLES VS HISTORICO</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:14px">
      ${multCards.join('')}
    </div>` : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${chartHTML}
    </div>
    ${ebitdaIsNeg&&!_ok(evEbit)?`<div style="font-family:${_MONO};font-size:.58rem;color:#4A5F75;margin-top:6px">¹ EV/EBITDA no aplica cuando EBITDA estimado es negativo.</div>`:''}`;

  if(showPeChart) _ch('af-c-pe', ch=>{
    ch.setOption({
      ..._nBaseN(yrs5),
      yAxis:[_nYaxXN()],
      legend:_nLegN(['P/E','EV/EBITDA']),
      series:[
        {name:'P/E',      type:'line',data:peH,    ..._ls('#22D3EE'), smooth:false},
        {name:'EV/EBITDA',type:'line',data:evEbitH,..._ls2('#7C3AED'),smooth:false},
      ],
      tooltip:{..._nTtN(),valueFormatter:v=>v!=null?`${v.toFixed(1)}x`:'—'},
    });
  }, false);

  _ch('af-c-pspf', ch=>{
    ch.setOption({
      ..._nBaseN(yrs5),
      yAxis:[_nYaxXN()],
      legend:_nLegN(['P/S','P/FCF']),
      series:[
        {name:'P/S',  type:'line',data:psH,..._ls('#22D3EE'), smooth:false},
        {name:'P/FCF',type:'line',data:pfH,..._ls2('#7C3AED'),smooth:false},
      ],
      tooltip:{..._nTtN(),valueFormatter:v=>v!=null?`${v.toFixed(1)}x`:'—'},
    });
  }, false);

  _ch('af-c-mcap', ch=>{
    ch.setOption({
      ..._nBaseN(yrs5),
      yAxis:[_nYaxBN()],
      legend:_nLegN(['Market Cap','Enterprise Value']),
      series:[
        {name:'Market Cap',      type:'bar',barCategoryGap:'38%',
          itemStyle:{borderRadius:[3,3,0,0]},
          data:mcapH.map((v,i)=>({value:v,itemStyle:{color:i===n5-1?'#22D3EE':'rgba(34,211,238,.20)'}}))},
        {name:'Enterprise Value',type:'line',data:evH,
          smooth:false,symbol:'circle',symbolSize:4,
          lineStyle:{color:'#7C3AED',width:1.8},itemStyle:{color:'#7C3AED'}},
      ],
      tooltip:{..._nTtN(),valueFormatter:v=>v!=null?`$${v.toFixed(1)}B`:'—'},
    });
  }, false);

  _ch('af-c-px', ch=>{
    ch.setOption({
      ..._nBaseN(yrs5),
      yAxis:[{type:'value',
        axisLabel:{color:'#94A3B8',fontFamily:_MONO,fontSize:9,
          formatter:v=>`$${v>=1000?(v/1000).toFixed(0)+'K':v.toFixed(0)}`},
        splitLine:{lineStyle:{color:'rgba(30,41,59,.7)',type:'solid'}},
        axisLine:{show:false},axisTick:{show:false}}],
      series:[{name:tk,type:'line',data:annualPx,
        smooth:true,symbol:'circle',symbolSize:4,
        lineStyle:{color:'#7C3AED',width:1.8},itemStyle:{color:'#7C3AED'},
        areaStyle:{color:'rgba(124,58,237,.12)'}}],
      tooltip:{..._nTtN(),valueFormatter:v=>v!=null?`$${v.toFixed(2)}`:'—'},
    });
  }, !annualPx.some(v=>v!=null));
}


/* ══════════════════════════════════════════════════════════════════════════
   CHART HELPERS
   ══════════════════════════════════════════════════════════════════════════ */

// Panel de chart: título + línea naranja accent + valor métrico
function _cPanel(id, title, sub) {
  return `<div style="background:${_CARD};border:1px solid ${_BOR};border-radius:10px;overflow:hidden">
    <div style="padding:9px 13px 7px;background:rgba(6,11,23,.45);border-bottom:1px solid rgba(245,158,11,.18)">
      <div style="font-size:.55rem;font-weight:700;letter-spacing:.10em;text-transform:uppercase;
        color:#4A5F75;font-family:${_MONO};margin-bottom:4px">${title}</div>
      ${sub?`<div style="font-size:.82rem;font-weight:700;color:#C8D8E8;font-family:${_MONO};
        line-height:1.1">${sub}</div>`:''}
    </div>
    <div id="${id}" style="height:240px"></div>
  </div>`;
}

function _ch(id, fn, noData=false, msg='Sin datos disponibles para este gráfico') {
  const el=document.getElementById(id);
  if(!el)return;
  const ex=echarts.getInstanceByDom(el);
  if(ex)ex.dispose();
  if(noData){
    el.innerHTML=`<div style="display:flex;align-items:center;justify-content:center;
      height:100%;font-family:${_MONO};color:#2D4157;font-size:.68rem;text-align:center;padding:16px">${msg}</div>`;
    return;
  }
  const ch=echarts.init(el,'dcf');
  try{ fn(ch); }catch(e){
    console.warn(`[AF] chart ${id}:`,e);
    el.innerHTML=`<div style="display:flex;align-items:center;justify-content:center;
      height:100%;font-family:${_MONO};color:#2D4157;font-size:.68rem">Error al renderizar</div>`;
    return;
  }
  ch.resize();
  new ResizeObserver(()=>{ try{ch.resize();}catch(_){} }).observe(el);
}

// ECharts base config
function _base(xData) {
  return {
    grid:{left:10,right:10,top:10,bottom:26,containLabel:true},
    xAxis:[{type:'category',data:xData,boundaryGap:true,
      axisLabel:{color:'#4A5F75',fontFamily:_MONO,fontSize:9,interval:0},
      axisLine:{lineStyle:{color:_BOR}},splitLine:{show:false}}],
    backgroundColor:'transparent',
  };
}

function _yaxM(){return{type:'value',axisLabel:{color:'#4A5F75',fontFamily:_MONO,fontSize:9,
  formatter:v=>`${Math.abs(v)>=1000?(v<0?'-':'')+'$'+(Math.abs(v)/1000).toFixed(0)+'B':'$'+v.toFixed(0)+'M'}`},
  splitLine:{lineStyle:{color:'rgba(120,150,180,.10)',type:'dashed'}},axisLine:{show:false}};}

function _yaxPct(){return{type:'value',axisLabel:{color:'#4A5F75',fontFamily:_MONO,fontSize:9,
  formatter:v=>`${v.toFixed(0)}%`},
  splitLine:{lineStyle:{color:'rgba(120,150,180,.10)',type:'dashed'}},axisLine:{show:false}};}

function _yaxX(){return{type:'value',axisLabel:{color:'#4A5F75',fontFamily:_MONO,fontSize:9,
  formatter:v=>`${v.toFixed(0)}x`},
  splitLine:{lineStyle:{color:'rgba(120,150,180,.10)',type:'dashed'}},axisLine:{show:false}};}

function _tt(){return{trigger:'axis',backgroundColor:'#0B1220',
  borderColor:_BOR,borderWidth:1,padding:[9,13],
  textStyle:{fontFamily:_MONO,fontSize:10,color:'#C8D8E8'},
  axisPointer:{lineStyle:{color:'rgba(120,150,180,.15)'}}};}

function _leg(data,extra={}) {
  return{data,textStyle:{color:'#5A7390',fontSize:9,fontFamily:_MONO},...extra};
}

// Helpers de serie
function _ls(color){return{smooth:false,symbol:'circle',symbolSize:4,lineStyle:{color,width:1.8},itemStyle:{color}};}
function _ls2(color){return{smooth:false,symbol:'circle',symbolSize:4,lineStyle:{color,width:1.8,type:'dashed'},itemStyle:{color}};}


/* ══════════════════════════════════════════════════════════════════════════
   COLOR HELPERS — sin degradé por antigüedad
   ══════════════════════════════════════════════════════════════════════════ */

// Binario: último dato = color sólido, histórico = versión transparente
function _hist(solidColor, softColor, i, n) {
  return i === n - 1 ? solidColor : softColor;
}

// Verde si positivo, rojo si negativo — último sólido, histórico transparente
function _signHist(val, i, n) {
  if (val == null) return 'rgba(0,0,0,0)';
  const isLast = i === n - 1;
  return val >= 0 ? (isLast ? _GR : _GRS) : (isLast ? _RE : _RES);
}


/* ══════════════════════════════════════════════════════════════════════════
   MATH HELPERS
   ══════════════════════════════════════════════════════════════════════════ */

function _computeHistMult(data, candles, sharesMM) {
  if(!candles?.dates?.length||!sharesMM||!data.length)
    return data.map(d=>({year:d.year,hist_mcap:null,ps:null,pfcf:null,pe:null}));
  const cT=candles.dates.map(d=>new Date(d).getTime());
  return data.map(d=>{
    const fyE=new Date(d.year,11,31).getTime();
    let b=0,bD=Infinity;
    cT.forEach((t,i)=>{const diff=Math.abs(t-fyE);if(diff<bD){bD=diff;b=i;}});
    const price=candles.closes[b];
    const hm=price*sharesMM*1e6;
    return{year:d.year,hist_mcap:hm,
      ps:  d.revenue&&d.revenue>0?hm/(d.revenue*1e6):null,
      pfcf:d.fcf&&d.fcf>0?hm/(d.fcf*1e6):null,
      pe:  d.net_income&&d.net_income>0?hm/(d.net_income*1e6):null};
  });
}

function _histAvg(data, mcapUSD, col) {
  if(!mcapUSD||!data.length)return null;
  const vals=data.slice(-5).map(d=>{const v=d[col];if(!v||v<=0)return null;return mcapUSD/(v*1e6);})
    .filter(v=>v!=null&&isFinite(v));
  return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
}

function _yoy(curr, prev) {
  if(curr==null||prev==null||prev===0)return null;
  return(curr-prev)/Math.abs(prev)*100;
}


/* ══════════════════════════════════════════════════════════════════════════
   FORMAT HELPERS
   ══════════════════════════════════════════════════════════════════════════ */

function _fmtB(usdRaw) {
  if(usdRaw==null)return'—';
  const abs=Math.abs(usdRaw),s=usdRaw<0?'-':'';
  if(abs>=1e12)return`${s}$${(abs/1e12).toFixed(1)}T`;
  if(abs>=1e9) return`${s}$${(abs/1e9).toFixed(1)}B`;
  if(abs>=1e6) return`${s}$${(abs/1e6).toFixed(1)}M`;
  if(abs>=1e3) return`${s}$${(abs/1e3).toFixed(1)}K`;
  return`${s}$${abs.toFixed(0)}`;
}

function _fmtM(v){return _fmtB(v!=null?v*1e6:null);}

function _pct(v){
  if(v==null)return`<span style="color:#2D4157">—</span>`;
  const c=v>0?_GR:v<0?_RE:'#7F93AD';
  return`<span style="color:${c};font-weight:600">${v>=0?'+':''}${v.toFixed(1)}%</span>`;
}

function _pct1(v){
  if(v==null)return`<span style="color:#2D4157">—</span>`;
  const c=v>0?_GR:v<0?_RE:'#7F93AD';
  return`<span style="color:${c}">${v.toFixed(1)}%</span>`;
}

function _marg(num, den) {
  if(num==null||den==null||den===0)return'';
  return`${(num/den*100).toFixed(1)}%`;
}

function _rgba(hex, alpha) {
  const h=hex.replace('#','');
  return`rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${alpha.toFixed(2)})`;
}

function _noData(msg){
  return`<div class="bt2-panel" style="padding:20px;text-align:center">
    <div style="font-family:${_MONO};color:#2D4157;font-size:.72rem">${msg}</div>
  </div>`;
}

/* ── KPI card compacta con borde superior de color ───────────────────────── */
function _kpi(label, value, sub, badge, color, negVal=false) {
  let badgeHtml='';
  if(badge!=null){
    const col=negVal?_RE:(badge>=0?_GR:_RE);
    const bg =negVal?'rgba(248,113,113,.10)':(badge>=0?'rgba(52,211,153,.10)':'rgba(248,113,113,.10)');
    const arr=badge>=0?'▲':'▼';
    const d  =Math.abs(badge)>=100?badge.toFixed(0):badge.toFixed(1);
    badgeHtml=`<span style="background:${bg};color:${col};border:1px solid ${col}28;
      border-radius:3px;padding:1px 4px;font-size:.56rem;font-weight:700;
      margin-left:4px;white-space:nowrap;font-family:${_MONO}">${arr} ${badge>=0?'+':''}${d}%</span>`;
  }
  const vlen=String(value).length;
  const vfont=vlen>9?'.90rem':vlen>7?'1.05rem':'1.18rem';

  return`<div style="background:${_CARD};border:1px solid ${_BOR};border-top:3px solid ${color};
    border-radius:10px;padding:9px 11px;min-height:68px">
    <div style="font-size:.54rem;font-weight:700;letter-spacing:.10em;text-transform:uppercase;
      color:#2D4157;margin-bottom:4px;font-family:${_MONO};white-space:nowrap">${label}</div>
    <div style="font-size:${vfont};font-weight:800;color:#F4F7FB;line-height:1.1;
      white-space:nowrap;font-family:${_MONO}">${value}</div>
    <div style="margin-top:3px;font-size:.58rem;color:#4A5F75;font-family:${_MONO};
      display:flex;align-items:center;flex-wrap:wrap;gap:2px">
      <span>${sub||''}</span>${badgeHtml}
    </div>
  </div>`;
}

