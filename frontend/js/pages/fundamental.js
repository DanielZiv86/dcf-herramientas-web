/* ─── Análisis Fundamental v3 — Dashboard Institucional ────────────────────
   Layout: Hero Card → Tabs (Empresa / Negocio / Rentabilidad / Financiera /
           Valuación / Ranking IA / Comparar)
   Fuente: yfinance via backend + JSONs estáticos data/fundamental/tickers/
   Accent: dorado #D4AF37 (sección diferenciada)
   ─────────────────────────────────────────────────────────────────────────── */

/* ── Paleta ──────────────────────────────────────────────────────────────── */
const _G   = '#D4AF37';          // gold accent
const _GD  = 'rgba(212,175,55,.12)';
const _GB  = 'rgba(212,175,55,.28)';
const _CY  = '#22d3ee';          // cyan    — revenue
const _VI  = '#a78bfa';          // violet  — margins / price history
const _GR  = '#34d399';          // green   — positive / FCF
const _OR  = '#f97316';          // orange  — accent secundario
const _PI  = '#f472b6';          // pink    — margins lines
const _RE  = '#ef4444';          // red     — negative
const _AM  = '#fbbf24';          // amber   — EPS
const _SK  = '#38bdf8';          // sky     — secondary lines
const _MONO = "'JetBrains Mono',monospace";

const _TABS = [
  { id: 'empresa',      label: 'Empresa',      icon: '🏢' },
  { id: 'negocio',      label: 'Negocio',      icon: '📈' },
  { id: 'rentabilidad', label: 'Rentabilidad', icon: '💰' },
  { id: 'financiera',   label: 'Financiera',   icon: '🏦' },
  { id: 'valuacion',    label: 'Valuación',    icon: '🎯' },
  { id: 'ranking',      label: 'Ranking IA',   icon: '⭐' },
  { id: 'comparar',     label: 'Comparar',     icon: '⚡' },
];

const _MESES_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];


/* ══════════════════════════════════════════════════════════════════════════
   ENTRADA DE LA PÁGINA
   ══════════════════════════════════════════════════════════════════════════ */

(window.pages = window.pages || {}).fundamental = async function(container) {
  container.innerHTML = `
    <div class="bt2-page" id="af-root">
      <div class="bt2-header" style="flex-direction:column;align-items:flex-start;gap:2px;margin-bottom:14px">
        <h1 class="bt2-title" style="font-size:1.25rem;letter-spacing:-.02em;color:${_G}">
          Análisis Fundamental
        </h1>
        <p style="font-family:${_MONO};font-size:.70rem;color:var(--bt2-sub);margin:0">
          US Equities · 13 compañías curadas · Finnhub + yfinance
        </p>
      </div>

      <!-- Selector de tickers -->
      <div style="margin-bottom:16px">
        <div style="font-family:${_MONO};font-size:9px;color:var(--bt2-sub);text-transform:uppercase;
          letter-spacing:.08em;font-weight:600;margin-bottom:6px">Tickers curados</div>
        <div id="af-pills" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px"></div>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="dcf-input" id="af-input"
            placeholder="Buscar cualquier ticker US (AAPL, NVDA…)"
            style="width:260px;font-family:${_MONO};font-size:.78rem"/>
          <button id="af-search"
            style="background:${_GD};border:1px solid ${_GB};color:${_G};
              padding:5px 14px;border-radius:6px;font-family:${_MONO};font-size:.75rem;
              font-weight:700;cursor:pointer;white-space:nowrap">BUSCAR</button>
        </div>
      </div>

      <!-- Contenido principal -->
      <div id="af-main"></div>

      <!-- Disclaimer -->
      <div style="margin-top:20px;padding:12px 16px;background:rgba(249,115,22,.06);
        border:1px solid rgba(249,115,22,.20);border-radius:8px;
        display:flex;gap:10px;align-items:flex-start">
        <span style="color:#f97316;font-size:1rem;flex-shrink:0">⚠</span>
        <div style="font-family:${_MONO};font-size:.65rem;color:#475569;line-height:1.6">
          <strong style="color:#94a3b8">Disclaimer:</strong>
          Este dashboard es exclusivamente para fines educativos e informativos. No constituye
          asesoramiento financiero ni recomendación de inversión. Los datos pueden contener errores
          o diferir de fuentes primarias. Consultá a un asesor certificado antes de tomar decisiones.
          Fuentes: yfinance · Finnhub · DCF Inversiones.
        </div>
      </div>
    </div>`;

  let _active  = null;
  let _cfgData = null;
  let _tabId   = 'negocio';  // tab activo al cargar un ticker

  // Cargar config curada
  try { _cfgData = await api.fundamental.config(); }
  catch (e) { _cfgData = { tickers: [], config: {} }; }

  // Renderizar pills
  const tickers = _cfgData.tickers || [];
  const pillsEl = document.getElementById('af-pills');
  tickers.forEach(tk => {
    const b = document.createElement('button');
    b.id = `af-p-${tk}`;
    b.textContent = tk;
    b.style.cssText = `background:${_GD};border:1px solid rgba(212,175,55,.20);color:#94a3b8;
      padding:3px 10px;border-radius:20px;font-family:${_MONO};font-size:.70rem;
      font-weight:700;cursor:pointer;transition:.15s;letter-spacing:.04em`;
    b.onmouseenter = () => { if (_active !== tk) b.style.borderColor = _GB; };
    b.onmouseleave = () => { if (_active !== tk) b.style.borderColor = 'rgba(212,175,55,.20)'; };
    b.onclick = () => _load(tk);
    pillsEl.appendChild(b);
  });

  // Buscar
  document.getElementById('af-search')?.addEventListener('click', () => {
    const v = document.getElementById('af-input')?.value?.trim()?.toUpperCase();
    if (v) _load(v);
  });
  document.getElementById('af-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const v = e.target.value.trim().toUpperCase();
      if (v) _load(v);
    }
  });

  // Cargar CRWD al inicio
  _load('CRWD');

  /* ── Cargador principal ───────────────────────────────────────────────── */
  async function _load(tk) {
    _active = tk;
    _afSetPillActive(tickers, tk);

    const main = document.getElementById('af-main');
    main.innerHTML = `
      <div class="bt2-panel" style="padding:20px">
        ${[1,2,3].map(() => `<div class="skeleton" style="height:48px;border-radius:6px;margin-bottom:8px"></div>`).join('')}
        <div class="skeleton" style="height:240px;border-radius:6px;margin-top:12px"></div>
      </div>`;

    try {
      const [p, f, c] = await Promise.allSettled([
        api.fundamental.perfil(tk),
        api.fundamental.financieros(tk),
        api.fundamental.candles(tk, 'W'),
      ]);

      const perfil     = p.status === 'fulfilled' ? p.value : {};
      const financieros= f.status === 'fulfilled' ? f.value : { data: [] };
      const candles    = c.status === 'fulfilled' ? c.value : { status: 'no_data', dates: [], closes: [] };

      // Enriquecer con config curada si falta descripción/tags
      const cfg = (_cfgData?.config || {})[tk] || {};
      if (cfg.description && !perfil.description) perfil.description = cfg.description;
      if (cfg.tags?.length && !perfil.tags?.length)  perfil.tags = cfg.tags;

      _renderFull(main, tk, perfil, financieros, candles);

    } catch (e) {
      main.innerHTML = `<div class="bt2-panel" style="padding:24px;color:var(--negative)">
        ✕ Error cargando ${tk}: ${e.message || 'error desconocido'}</div>`;
    }
  }

  /* ── Render completo: hero + tabs ─────────────────────────────────────── */
  function _renderFull(main, tk, perfil, financieros, candles) {
    const { profile = {}, quote = {}, metrics = {}, description = '', tags = [] } = perfil;
    const data = (financieros.data || []).filter(r => r?.year);

    main.innerHTML = `
      <div id="af-hero" style="margin-bottom:14px"></div>
      <div id="af-tabs-bar" style="margin-bottom:12px"></div>
      <div id="af-tab-body"></div>`;

    _renderHero(document.getElementById('af-hero'), tk, profile, quote, metrics, description, tags, data);
    _renderTabsBar(document.getElementById('af-tabs-bar'), tk, profile, quote, metrics, description, tags, data, candles);
  }

  /* ── Tab bar ─────────────────────────────────────────────────────────── */
  function _renderTabsBar(el, tk, profile, quote, metrics, desc, tags, data, candles) {
    el.innerHTML = `<div style="display:flex;gap:4px;flex-wrap:wrap;padding:4px;
      background:rgba(13,20,36,.8);border:1px solid rgba(148,163,184,.08);
      border-radius:10px;width:fit-content"></div>`;
    const bar = el.querySelector('div');

    const body = document.getElementById('af-tab-body');

    _TABS.forEach(tab => {
      const btn = document.createElement('button');
      const isActive = tab.id === _tabId;
      btn.setAttribute('data-tab', tab.id);
      btn.innerHTML = `${tab.icon}&nbsp;${tab.label}`;
      btn.style.cssText = `background:${isActive ? _GD : 'transparent'};
        border:1px solid ${isActive ? _GB : 'transparent'};
        color:${isActive ? _G : '#64748b'};
        padding:5px 12px;border-radius:7px;font-family:${_MONO};
        font-size:.72rem;font-weight:600;cursor:pointer;transition:.15s;
        letter-spacing:.02em;white-space:nowrap`;
      btn.onmouseenter = () => {
        if (tab.id !== _tabId) { btn.style.color='#94a3b8'; btn.style.background='rgba(255,255,255,.04)'; }
      };
      btn.onmouseleave = () => {
        if (tab.id !== _tabId) { btn.style.color='#64748b'; btn.style.background='transparent'; }
      };
      btn.onclick = () => {
        _tabId = tab.id;
        bar.querySelectorAll('button').forEach(b => {
          const tid = b.getAttribute('data-tab');
          const act = tid === _tabId;
          b.style.background = act ? _GD : 'transparent';
          b.style.border = `1px solid ${act ? _GB : 'transparent'}`;
          b.style.color  = act ? _G : '#64748b';
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
      case 'ranking':      _tabRanking(body, tk); break;
      case 'comparar':     _tabComparar(body); break;
    }
  }
};  // fin entry point


/* ══════════════════════════════════════════════════════════════════════════
   HERO CARD
   ══════════════════════════════════════════════════════════════════════════ */

function _renderHero(el, tk, profile, quote, metrics, desc, tags, data) {
  const name     = profile.name || tk;
  const sector   = profile.sector || '';
  const industry = profile.industry || '';
  const exchange = (profile.exchange || '').replace('NASDAQ NMS - GLOBAL MARKET','NASDAQ').replace('New York Stock Exchange','NYSE');
  const price    = quote.price;
  const chg      = quote.change;
  const pct      = quote.pct_change;
  const mcapM    = profile.market_cap;  // millones

  const priceStr = price ? `$${Number(price).toFixed(2)}` : '—';
  const chgColor = chg >= 0 ? _GR : _RE;
  const chgSign  = chg >= 0 ? '+' : '';
  const chgStr   = (chg != null && pct != null)
    ? `${chgSign}${chg.toFixed(2)} (${chgSign}${pct.toFixed(2)}%)`
    : '—';

  const mcapStr = _fmtB(mcapM != null ? mcapM * 1e6 : null);
  const w52h    = metrics.week52_high ? `$${Number(metrics.week52_high).toFixed(2)}` : '—';
  const w52l    = metrics.week52_low  ? `$${Number(metrics.week52_low).toFixed(2)}`  : '—';
  const beta    = metrics.beta != null ? Number(metrics.beta).toFixed(2) : '—';
  const target  = metrics.target_price;
  const upside  = metrics.upside;

  // Tags badges
  const tagColors = [
    ['rgba(34,211,238,.15)','#22d3ee'],['rgba(167,139,250,.15)','#a78bfa'],
    ['rgba(52,211,153,.15)','#34d399'],['rgba(249,115,22,.15)','#f97316'],
    ['rgba(212,175,55,.15)','#D4AF37'],
  ];
  const tagsHtml = (tags || []).map((t, i) => {
    const [bg, c] = tagColors[i % tagColors.length];
    return `<span style="background:${bg};color:${c};border:1px solid ${c}33;
      border-radius:20px;padding:2px 9px;font-size:.68rem;font-weight:700;
      letter-spacing:.04em;white-space:nowrap;font-family:${_MONO}">${t}</span>`;
  }).join('');

  // KPI strip inferior — datos del último año fiscal
  const last  = data.length ? data[data.length - 1] : null;
  const fy    = last ? `FY${String(last.year).slice(2)}` : '';
  const fyEnd = _fyEndingStr(last);

  const strip = [
    { lbl: 'FY ENDING',  val: fyEnd,                             sub: fy },
    { lbl: `REV ${fy}`,  val: _fmtM(last?.revenue),             sub: last?.revenue_yoy != null ? `▲ ${last.revenue_yoy.toFixed(1)}%` : '' },
    { lbl: `FCF ${fy}`,  val: _fmtM(last?.fcf),                 sub: last?.fcf_margin != null  ? `${last.fcf_margin.toFixed(1)}% FCF%` : '' },
    { lbl: 'EMPLEADOS',  val: profile.employees ? `~${Number(profile.employees).toLocaleString('es-AR')}` : '—', sub: '' },
    { lbl: 'IPO',        val: (profile.ipo_date || '').slice(0, 4) || '—', sub: '' },
    { lbl: 'BETA',       val: beta,                              sub: '' },
    { lbl: 'DIV YIELD',  val: profile.dividend_yield != null ? `${profile.dividend_yield.toFixed(2)}%` : '—', sub: '' },
  ].map(({ lbl, val, sub }) => `
    <div style="flex:1;min-width:90px;padding:9px 14px;
      border-right:1px solid rgba(148,163,184,.07)">
      <div style="font-size:.57rem;font-weight:700;letter-spacing:.10em;text-transform:uppercase;
        color:#334155;margin-bottom:3px;font-family:${_MONO}">${lbl}</div>
      <div style="font-size:.85rem;font-weight:700;color:#e2e8f0;font-family:${_MONO}">${val}</div>
      ${sub ? `<div style="font-size:.62rem;color:#22c55e;font-family:${_MONO}">${sub}</div>` : ''}
    </div>`).join('');

  el.innerHTML = `
    <div class="bt2-panel" style="padding:0;overflow:hidden">
      <!-- Main row: logo + info | price -->
      <div style="display:flex;gap:0;align-items:stretch">

        <!-- Logo / iniciales -->
        <div style="padding:18px 16px;display:flex;align-items:flex-start;flex-shrink:0">
          ${profile.logo
            ? `<img src="${profile.logo}" alt="${tk}"
                style="width:60px;height:60px;border-radius:10px;object-fit:contain;
                  background:#0d1424;border:1px solid rgba(148,163,184,.1)"
                onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
            : ''}
          <div style="width:60px;height:60px;border-radius:10px;background:${_GD};
            border:1px solid ${_GB};display:${profile.logo ? 'none' : 'flex'};
            align-items:center;justify-content:center;font-size:1.3rem;
            font-weight:700;color:${_G};font-family:${_MONO}">
            ${tk.slice(0, 2)}
          </div>
        </div>

        <!-- Info principal -->
        <div style="flex:1;padding:18px 4px 14px 0;min-width:0">
          <div style="font-size:1.25rem;font-weight:700;color:#f1f5f9;line-height:1.2;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>
          <div style="font-size:.75rem;color:#64748b;margin-top:2px;font-family:${_MONO}">
            ${tk} · ${exchange}${sector ? ' · ' + sector : ''}${industry && industry !== sector ? ' · ' + industry : ''}
          </div>
          ${tagsHtml ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:8px">${tagsHtml}</div>` : ''}
          ${desc ? `<div style="color:#94a3b8;font-size:.75rem;line-height:1.55;margin-top:10px;
            max-width:680px;display:-webkit-box;-webkit-line-clamp:2;
            -webkit-box-orient:vertical;overflow:hidden">${desc}</div>` : ''}
        </div>

        <!-- Precio y datos de mercado -->
        <div style="padding:16px 20px 14px;text-align:right;flex-shrink:0;
          border-left:1px solid rgba(148,163,184,.07);min-width:180px">
          <div style="font-size:2.1rem;font-weight:700;color:${_G};line-height:1;
            font-family:${_MONO}">${priceStr}</div>
          <div style="font-size:.80rem;color:${chgColor};margin-top:3px;font-family:${_MONO}">${chgStr}</div>
          <div style="margin-top:8px;display:flex;flex-direction:column;gap:3px">
            ${[
              ['Mkt Cap',   mcapStr],
              ['52W High',  w52h],
              ['52W Low',   w52l],
              ...(target != null ? [['Target', `$${Number(target).toFixed(2)}`]] : []),
              ...(upside != null ? [['Upside', `${upside >= 0 ? '+' : ''}${upside.toFixed(1)}%`]] : []),
            ].map(([l, v]) => `
              <div style="display:flex;justify-content:space-between;gap:12px">
                <span style="font-size:.65rem;color:#334155;text-transform:uppercase;
                  letter-spacing:.06em;font-family:${_MONO}">${l}</span>
                <span style="font-size:.72rem;font-weight:600;color:#e2e8f0;
                  font-family:${_MONO}">${v}</span>
              </div>`).join('')}
          </div>
        </div>
      </div>

      <!-- KPI strip inferior -->
      <div style="display:flex;flex-wrap:wrap;background:rgba(6,11,23,.6);
        border-top:1px solid rgba(148,163,184,.07)">
        ${strip}
      </div>
    </div>`;
}

function _fyEndingStr(last) {
  if (!last?.end_date) return '—';
  try {
    const d = new Date(last.end_date + 'T00:00:00');
    return `${_MESES_ES[d.getMonth()]} ${d.getDate()}`;
  } catch (_) { return '—'; }
}


/* ══════════════════════════════════════════════════════════════════════════
   TAB: EMPRESA
   ══════════════════════════════════════════════════════════════════════════ */

function _tabEmpresa(container, tk, profile, quote, metrics, desc, tags, data) {
  const last = data.length ? data[data.length - 1] : null;
  const fy   = last ? `FY${String(last.year).slice(2)}` : '';

  const facts = [
    ['Sector',        profile.sector || '—'],
    ['Industria',     profile.industry || '—'],
    ['Exchange',      (profile.exchange || '—').replace('NASDAQ NMS - GLOBAL MARKET','NASDAQ')],
    ['País',          profile.country || '—'],
    ['Moneda',        profile.currency || '—'],
    ['IPO',           (profile.ipo_date || '').slice(0, 10) || '—'],
    ['Empleados',     profile.employees ? `~${Number(profile.employees).toLocaleString('es-AR')}` : '—'],
    ['Div. Yield',    profile.dividend_yield != null ? `${profile.dividend_yield.toFixed(2)}%` : '—'],
    ['FY End',        _fyEndingStr(last)],
    ['Website',       profile.website
                        ? `<a href="${profile.website}" target="_blank" style="color:${_CY};
                             text-decoration:none;font-size:.78rem">${profile.website.replace('https://','')}</a>`
                        : '—'],
  ];

  const metricsGrid = [
    ['P/E TTM',       metrics.pe_ttm,       'x'],
    ['P/E Forward',   metrics.pe_forward,   'x'],
    ['P/S TTM',       metrics.ps_ttm,       'x'],
    ['P/B',           metrics.pb_annual,    'x'],
    ['EV/EBITDA',     metrics.ev_ebitda_ttm,'x', true],
    ['EV/Sales',      metrics.ev_sales_ttm, 'x'],
    ['ROE TTM',       metrics.roe_ttm,      '%'],
    ['ROA TTM',       metrics.roa_ttm,      '%'],
    ['Gross Margin',  metrics.gross_margin_ttm, '%'],
    ['EBITDA Margin', metrics.ebitda_margin_ttm,'%'],
    ['Net Margin',    metrics.net_margin_ttm,'%'],
    ['Beta',          metrics.beta,         ''],
  ].map(([lbl, val, suf, absClamp]) => {
    let v = val != null ? Number(val) : null;
    const isNa = absClamp && v != null && Math.abs(v) > 500;
    const str  = isNa ? 'N/A' : (v != null ? `${v.toFixed(1)}${suf}` : '—');
    const col  = suf === '%' ? (v > 0 ? _GR : v < 0 ? _RE : '#94a3b8') : '#f1f5f9';
    return `<div style="background:rgba(13,20,36,.6);border:1px solid rgba(148,163,184,.07);
      border-radius:8px;padding:10px 12px">
      <div style="font-size:.57rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
        color:#334155;margin-bottom:3px;font-family:${_MONO}">${lbl}</div>
      <div style="font-size:.92rem;font-weight:700;color:${col};font-family:${_MONO}">${str}</div>
    </div>`;
  });

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">

      <!-- Descripción + datos compañía -->
      <div style="display:flex;flex-direction:column;gap:12px">
        ${desc ? `<div class="bt2-panel" style="padding:16px">
          <div style="font-size:.60rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
            color:#475569;margin-bottom:8px;font-family:${_MONO}">DESCRIPCIÓN</div>
          <div style="color:#94a3b8;font-size:.80rem;line-height:1.65">${desc}</div>
        </div>` : ''}
        <div class="bt2-panel" style="padding:0;overflow:hidden">
          ${facts.map(([l, v]) => `
            <div style="display:flex;align-items:center;justify-content:space-between;
              padding:9px 14px;border-bottom:1px solid rgba(148,163,184,.06)">
              <span style="font-size:.65rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
                color:#334155;font-family:${_MONO}">${l}</span>
              <span style="font-size:.78rem;font-weight:600;color:#e2e8f0;
                font-family:${_MONO}">${v}</span>
            </div>`).join('')}
        </div>
      </div>

      <!-- Ratios rápidos -->
      <div>
        <div style="font-size:.60rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
          color:#475569;margin-bottom:8px;font-family:${_MONO}">RATIOS CLAVE (TTM)</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${metricsGrid.join('')}
        </div>
      </div>
    </div>`;
}


/* ══════════════════════════════════════════════════════════════════════════
   TAB: NEGOCIO
   ══════════════════════════════════════════════════════════════════════════ */

function _tabNegocio(container, tk, data, metrics) {
  if (!data.length) { container.innerHTML = _afEmpty('Sin datos financieros anuales'); return; }

  const last  = data[data.length - 1];
  const first = data[0];
  const fy    = `FY${String(last.year).slice(2)}`;
  const fy0   = `FY${String(first.year).slice(2)}`;

  const rev    = last.revenue;
  const gp     = last.gross_profit;
  const ebitda = last.ebitda_est;
  const ni     = last.net_income;
  const fcf    = last.fcf;
  const eps    = last.eps_diluted ?? metrics.eps_ttm;
  const cagr   = last.rev_cagr_3y;

  const kpis = [
    { lbl:'REVENUE',     val:_fmtM(rev),      sub:fy,                    badge:last.revenue_yoy, color:_CY  },
    { lbl:'GROSS PROFIT',val:_fmtM(gp),       sub:_margin(gp,rev),       badge:null,             color:_SK  },
    { lbl:'EBITDA',      val:_fmtM(ebitda),   sub:_margin(ebitda,rev),   badge:null,             color:_VI  },
    { lbl:'NET INCOME',  val:_fmtM(ni),       sub:_margin(ni,rev),       badge:last.net_income_yoy, color: ni != null && ni >= 0 ? _GR : _RE },
    { lbl:'EPS DILUIDO', val:eps != null ? `$${Number(eps).toFixed(2)}` : '—', sub:fy, badge:null, color:_AM },
    { lbl:'FCF',         val:_fmtM(fcf),      sub:_margin(fcf,rev),      badge:last.fcf_yoy,     color:_OR  },
    { lbl:'REV CAGR',   val:cagr != null ? `${cagr.toFixed(1)}%` : '—',
      sub:`${fy0}→${fy}`, badge:null, color:_PI },
  ];

  container.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">
      ${kpis.map(k => _kpi(k.lbl, k.val, k.sub, k.badge, k.color)).join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${_chartPanel('af-c-rev',    'REVENUE & EARNINGS', '')}
      ${_chartPanel('af-c-yoy',    'CRECIMIENTO YoY', '')}
      ${_chartPanel('af-c-ebitda', 'EBITDA & MARGEN', '')}
      ${_chartPanel('af-c-nieps',  'NET INCOME & EPS', '')}
    </div>`;

  const years = data.map(d => `FY${String(d.year).slice(2)}`);
  const n = years.length;

  // Revenue & Earnings
  _chart('af-c-rev', ch => {
    ch.setOption({
      ..._base(years),
      yAxis: [_yaxM()],
      series: [
        { name:'Revenue',   type:'bar', data: data.map((d,i)=>({ value:d.revenue,
            itemStyle:{color:_rgba(_CY, _op(i,n))} })), barGap:'-30%', barCategoryGap:'40%' },
        { name:'Net Income',type:'bar', data: data.map((d,i)=>({ value:d.net_income,
            itemStyle:{color:_rgba(d.net_income>=0?_GR:_RE, _op(i,n))} })) },
      ],
      tooltip: { ..._tt(), valueFormatter: v => v!=null?`$${v.toFixed(0)}M`:'—' },
      legend: _leg(['Revenue','Net Income']),
    });
  });

  // YoY
  _chart('af-c-yoy', ch => {
    const d = data.map(d => d.revenue_yoy);
    const hasData = d.some(v => v != null);
    ch.setOption({
      ..._base(years),
      yAxis: [_yaxPct()],
      series: [{ name:'Revenue YoY', type:'line', data: d,
        smooth:false, symbol:'circle', symbolSize:6,
        lineStyle:{color:_VI,width:2.2}, itemStyle:{color:_VI},
        areaStyle:{color:`${_VI}12`},
        markLine:{data:[{yAxis:0}],lineStyle:{color:'rgba(148,163,184,.2)',width:1},label:{show:false},symbol:'none'},
      }],
      tooltip: { ..._tt(), valueFormatter: v => v!=null?`${v>=0?'+':''}${v.toFixed(1)}%`:'—' },
    }, { hasData });
  }, !data.map(d => d.revenue_yoy).some(v => v != null));

  // EBITDA + Margen
  _chart('af-c-ebitda', ch => {
    ch.setOption({
      ..._base(years),
      yAxis: [_yaxM(), { type:'value', axisLabel:{color:'#475569',fontFamily:_MONO,fontSize:9,formatter:v=>`${v.toFixed(0)}%`}, splitLine:{show:false}, axisLine:{lineStyle:{color:'rgba(255,255,255,.06)'}} }],
      legend: _leg(['EBITDA','Margen EBITDA %']),
      series: [
        { name:'EBITDA',      type:'bar',  yAxisIndex:0, data:data.map((d,i)=>({value:d.ebitda_est, itemStyle:{color:_rgba(_VI,_op(i,n,.2))}})) },
        { name:'Margen EBITDA %',type:'line',yAxisIndex:1, data:data.map(d=>d.ebitda_margin),
          smooth:false, symbol:'circle', symbolSize:5, lineStyle:{color:_PI,width:2}, itemStyle:{color:_PI} },
      ],
      tooltip: { ..._tt() },
    });
  });

  // NI + EPS
  _chart('af-c-nieps', ch => {
    ch.setOption({
      ..._base(years),
      yAxis: [_yaxM(), { type:'value', axisLabel:{color:'#475569',fontFamily:_MONO,fontSize:9,formatter:v=>`$${v.toFixed(1)}`}, splitLine:{show:false}, axisLine:{lineStyle:{color:'rgba(255,255,255,.06)'}} }],
      legend: _leg(['Net Income','EPS']),
      series: [
        { name:'Net Income', type:'bar',  yAxisIndex:0, data:data.map((d,i)=>({value:d.net_income, itemStyle:{color:_rgba(d.net_income>=0?_GR:_RE,_op(i,n,.2))}})) },
        { name:'EPS', type:'line', yAxisIndex:1, data:data.map(d=>d.eps_diluted),
          smooth:false, symbol:'circle', symbolSize:5, lineStyle:{color:_AM,width:2}, itemStyle:{color:_AM} },
      ],
      tooltip: { ..._tt() },
    });
  });
}


/* ══════════════════════════════════════════════════════════════════════════
   TAB: RENTABILIDAD
   ══════════════════════════════════════════════════════════════════════════ */

function _tabRentabilidad(container, tk, data, metrics) {
  if (!data.length) { container.innerHTML = _afEmpty('Sin datos financieros'); return; }

  const last = data[data.length - 1];
  const fy   = `FY${String(last.year).slice(2)}`;

  const kpis = [
    { lbl:'FCF',          val:_fmtM(last.fcf),    sub:_margin(last.fcf,last.revenue),   badge:last.fcf_yoy,  color:_OR },
    { lbl:'OP CASH FLOW', val:_fmtM(last.cfo),    sub:fy,                                badge:null,          color:_CY },
    { lbl:'EBITDA MARGIN',val:last.ebitda_margin!=null?`${last.ebitda_margin.toFixed(1)}%`:'—', sub:fy, badge:null, color:_VI },
    { lbl:'FCF MARGIN',   val:last.fcf_margin!=null?`${last.fcf_margin.toFixed(1)}%`:'—',      sub:fy, badge:null, color:_GR },
    { lbl:'ROE TTM',      val:metrics.roe_ttm!=null?`${metrics.roe_ttm.toFixed(1)}%`:'—',       sub:'TTM',badge:null, color:metrics.roe_ttm>=0?_GR:_RE },
    { lbl:'ROIC TTM',     val:metrics.roic_ttm!=null?`${metrics.roic_ttm.toFixed(1)}%`:'—',     sub:'TTM',badge:null, color:_PI },
  ];

  container.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">
      ${kpis.map(k => _kpi(k.lbl, k.val, k.sub, k.badge, k.color)).join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${_chartPanel('af-c-marg',  'MÁRGENES HISTÓRICOS', '')}
      ${_chartPanel('af-c-fcfcfo','FCF y OP CASH FLOW', '')}
      ${_chartPanel('af-c-ret',   'RETORNOS DE CAPITAL', '')}
      ${_chartPanel('af-c-fcfm',  'FCF MARGIN', '')}
    </div>`;

  const years = data.map(d => `FY${String(d.year).slice(2)}`);

  // Márgenes
  _chart('af-c-marg', ch => {
    ch.setOption({
      ..._base(years),
      yAxis: [_yaxPct()],
      legend: _leg(['Gross','EBIT','EBITDA','Net','FCF']),
      series: [
        { name:'Gross',  type:'line', data:data.map(d=>d.gross_margin),  ...lineSeries(_CY) },
        { name:'EBIT',   type:'line', data:data.map(d=>d.ebit_margin),   ...lineSeries(_SK) },
        { name:'EBITDA', type:'line', data:data.map(d=>d.ebitda_margin), ...lineSeries(_VI) },
        { name:'Net',    type:'line', data:data.map(d=>d.net_margin),    ...lineSeries(_GR) },
        { name:'FCF',    type:'line', data:data.map(d=>d.fcf_margin),    ...lineSeries(_OR) },
      ],
      tooltip: { ..._tt(), valueFormatter: v => v!=null?`${v.toFixed(1)}%`:'—' },
    });
  });

  // FCF / OCF
  _chart('af-c-fcfcfo', ch => {
    const n = data.length;
    ch.setOption({
      ..._base(years),
      yAxis: [_yaxM()],
      legend: _leg(['FCF','Op Cash Flow']),
      series: [
        { name:'FCF',          type:'bar', data:data.map((d,i)=>({value:d.fcf, itemStyle:{color:_rgba(_OR,_op(i,n))}})), barGap:'-30%', barCategoryGap:'40%' },
        { name:'Op Cash Flow', type:'bar', data:data.map((d,i)=>({value:d.cfo, itemStyle:{color:_rgba(_CY,_op(i,n,.2))}})) },
      ],
      tooltip: { ..._tt(), valueFormatter: v => v!=null?`$${v.toFixed(0)}M`:'—' },
    });
  });

  // Retornos de capital (bar horizontal con valores actuales)
  _chart('af-c-ret', ch => {
    const labels = ['ROE','ROA','ROIC','Gross Margin','EBITDA Margin','Net Margin'];
    const vals   = [metrics.roe_ttm,metrics.roa_ttm,metrics.roic_ttm,metrics.gross_margin_ttm,metrics.ebitda_margin_ttm,metrics.net_margin_ttm];
    const cols   = [_CY,_VI,_GR,_SK,_PI,_OR];
    ch.setOption({
      grid: { left:70,right:16,top:8,bottom:8 },
      xAxis: { type:'value', axisLabel:{color:'#475569',fontFamily:_MONO,fontSize:9,formatter:v=>`${v.toFixed(0)}%`}, splitLine:{lineStyle:{color:'rgba(255,255,255,.05)',type:'dashed'}}, axisLine:{lineStyle:{color:'rgba(255,255,255,.06)'}} },
      yAxis: { type:'category', data:labels, axisLabel:{color:'#94a3b8',fontFamily:_MONO,fontSize:9.5}, axisLine:{lineStyle:{color:'rgba(255,255,255,.06)'}}, splitLine:{show:false} },
      series: [{ type:'bar', data:vals.map((v,i)=>({value:v??0, itemStyle:{color:cols[i]}})), barMaxWidth:24,
        label:{show:true,position:'right',color:'#94a3b8',fontFamily:_MONO,fontSize:9,
          formatter:p=>p.value!=null&&p.value!==0?`${p.value.toFixed(1)}%`:'—'} }],
      tooltip: { ..._tt(), valueFormatter: v=>`${v?.toFixed?.(1)||'—'}%` },
      backgroundColor:'transparent',
    });
  }, vals => !vals.some(v => v != null));

  // FCF Margin line
  _chart('af-c-fcfm', ch => {
    ch.setOption({
      ..._base(years),
      yAxis: [_yaxPct()],
      series: [{ name:'FCF Margin', type:'line', data:data.map(d=>d.fcf_margin),
        smooth:false, symbol:'circle', symbolSize:6,
        lineStyle:{color:_OR,width:2.2}, itemStyle:{color:_OR}, areaStyle:{color:`${_OR}10`} }],
      tooltip: { ..._tt(), valueFormatter: v => v!=null?`${v.toFixed(1)}%`:'—' },
    });
  }, !data.some(d => d.fcf_margin != null));
}


/* ══════════════════════════════════════════════════════════════════════════
   TAB: FINANCIERA
   ══════════════════════════════════════════════════════════════════════════ */

function _tabFinanciera(container, tk, data) {
  if (!data.length) { container.innerHTML = _afEmpty('Sin datos financieros'); return; }

  const last = data[data.length - 1];
  const prev = data.length > 1 ? data[data.length - 2] : null;
  const fy   = `FY${String(last.year).slice(2)}`;
  const ncNeg = last.net_cash != null && last.net_cash < 0;

  const kpis = [
    { lbl:'CASH & EQUIV.',  val:_fmtM(last.cash),      sub:fy,                                                  badge:_yoy(last.cash,prev?.cash),   color:_CY },
    { lbl:'DEUDA TOTAL',    val:_fmtM(last.total_debt), sub:fy,                                                  badge:null,                         color:_RE },
    { lbl:'NET CASH',       val:_fmtM(last.net_cash),   sub:ncNeg?'Net Debt':'Pos. neta',                        badge:_yoy(last.net_cash,prev?.net_cash), color:ncNeg?_RE:_GR },
    { lbl:'TOTAL ASSETS',   val:_fmtM(last.total_assets),sub:fy,                                                 badge:null,                         color:_VI },
    { lbl:'EQUITY',         val:_fmtM(last.equity),     sub:fy,                                                  badge:null,                         color:_GR },
    { lbl:'DEUDA/EQUITY',   val:last.de_ratio!=null?`${last.de_ratio.toFixed(2)}x`:'—', sub:'Leverage',          badge:null,                         color:_AM },
    { lbl:'FCF',            val:_fmtM(last.fcf),        sub:_margin(last.fcf,last.revenue),                      badge:null,                         color:_OR },
    { lbl:'CAPEX',          val:last.capex!=null?_fmtM(last.capex):'—', sub:'Inversión',                         badge:null,                         color:'#94a3b8' },
  ];

  container.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">
      ${kpis.map(k => _kpi(k.lbl, k.val, k.sub, k.badge, k.color)).join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${_chartPanel('af-c-cashd', 'CASH vs DEUDA TOTAL', '')}
      ${_chartPanel('af-c-netc',  'NET CASH / NET DEBT', '')}
      ${_chartPanel('af-c-aseq',  'ASSETS vs EQUITY', '')}
      ${_chartPanel('af-c-fcfcx', 'FCF vs CAPEX', '')}
    </div>`;

  const years = data.map(d => `FY${String(d.year).slice(2)}`);
  const n = data.length;

  _chart('af-c-cashd', ch => {
    ch.setOption({
      ..._base(years),
      yAxis: [_yaxM()],
      legend: _leg(['Cash','Deuda']),
      series: [
        { name:'Cash',  type:'bar', data:data.map((d,i)=>({value:d.cash,       itemStyle:{color:_rgba(_CY,_op(i,n))}})), barGap:'-30%', barCategoryGap:'40%' },
        { name:'Deuda', type:'bar', data:data.map((d,i)=>({value:d.total_debt, itemStyle:{color:_rgba(_RE,_op(i,n,.2))}})) },
      ],
      tooltip: { ..._tt(), valueFormatter: v => v!=null?`$${v.toFixed(0)}M`:'—' },
    });
  });

  _chart('af-c-netc', ch => {
    ch.setOption({
      ..._base(years),
      yAxis: [_yaxM()],
      series: [{ name:'Net Cash', type:'bar',
        data:data.map((d,i)=>({value:d.net_cash, itemStyle:{color:_rgba(d.net_cash>=0?_GR:_RE,_op(i,n))}})) }],
      tooltip: { ..._tt(), valueFormatter: v => v!=null?`$${v.toFixed(0)}M`:'—' },
    });
  });

  _chart('af-c-aseq', ch => {
    ch.setOption({
      ..._base(years),
      yAxis: [_yaxM()],
      legend: _leg(['Total Assets','Equity']),
      series: [
        { name:'Total Assets', type:'bar', data:data.map((d,i)=>({value:d.total_assets, itemStyle:{color:_rgba(_VI,_op(i,n,.2))}})), barGap:'-30%', barCategoryGap:'40%' },
        { name:'Equity',       type:'bar', data:data.map((d,i)=>({value:d.equity,       itemStyle:{color:_rgba(_GR,_op(i,n))}})) },
      ],
      tooltip: { ..._tt(), valueFormatter: v => v!=null?`$${v.toFixed(0)}M`:'—' },
    });
  });

  _chart('af-c-fcfcx', ch => {
    ch.setOption({
      ..._base(years),
      yAxis: [_yaxM()],
      legend: _leg(['FCF','Capex']),
      series: [
        { name:'FCF',   type:'bar', data:data.map((d,i)=>({value:d.fcf,   itemStyle:{color:_rgba(_OR,_op(i,n))}})), barGap:'-30%', barCategoryGap:'40%' },
        { name:'Capex', type:'bar', data:data.map((d,i)=>({value:d.capex!=null?-d.capex:null, itemStyle:{color:_rgba('#94a3b8',_op(i,n,.2))}})) },
      ],
      tooltip: { ..._tt(), valueFormatter: v => v!=null?`$${v.toFixed(0)}M`:'—' },
    });
  });
}


/* ══════════════════════════════════════════════════════════════════════════
   TAB: VALUACIÓN
   ══════════════════════════════════════════════════════════════════════════ */

function _tabValuacion(container, tk, data, metrics, profile, candles) {
  const last    = data.length ? data[data.length - 1] : null;
  const mcapM   = profile.market_cap;
  const shares  = profile.shares;
  const mcapUSD = mcapM ? mcapM * 1e6 : null;
  const netCash = last?.net_cash;
  const evUSD   = (mcapUSD != null && netCash != null) ? mcapUSD - (netCash * 1e6) : mcapUSD;
  const evM     = metrics.enterprise_value_m;

  const pe      = metrics.pe_ttm;
  const peF     = metrics.pe_forward;
  const ps      = metrics.ps_ttm;
  const pb      = metrics.pb_annual;
  const evEbit  = metrics.ev_ebitda_ttm;
  const evSales = metrics.ev_sales_ttm;
  const pfcf    = (mcapM && metrics.fcf_ttm_m && metrics.fcf_ttm_m > 0) ? mcapM / metrics.fcf_ttm_m : null;

  const _mFmt = v => {
    if (v == null) return '—';
    const abs = Math.abs(v);
    return abs > 999 ? 'N/A' : `${Number(v).toFixed(1)}x`;
  };

  const target = metrics.target_price;
  const upside = metrics.upside;
  const rec    = metrics.recommendation;

  const kpis = [
    { lbl:'MARKET CAP',  val:mcapUSD!=null?_fmtB(mcapUSD):'—',         sub:'', badge:null, color:_CY },
    { lbl:'EV',          val:evM!=null?_fmtB(evM*1e6):(evUSD!=null?_fmtB(evUSD):'—'), sub:'', badge:null, color:_VI },
    { lbl:'P/E TTM',     val:_mFmt(pe),                                  sub:peF?`Fwd: ${_mFmt(peF)}`:'', badge:null, color:'#f1f5f9' },
    { lbl:'EV/EBITDA',   val:_mFmt(evEbit),                             sub:'', badge:null, color:'#f1f5f9' },
    { lbl:'P/FCF',       val:_mFmt(pfcf),                               sub:'', badge:null, color:'#f1f5f9' },
    { lbl:'P/S TTM',     val:_mFmt(ps),                                  sub:'', badge:null, color:'#f1f5f9' },
  ];

  const multCards = [
    { l:'P/E',      v:pe,     avg:_histAvg(data,mcapUSD,'net_income') },
    { l:'P/S',      v:ps,     avg:_histAvg(data,mcapUSD,'revenue') },
    { l:'P/B',      v:pb,     avg:null },
    { l:'P/FCF',    v:pfcf,   avg:null },
    { l:'EV/Sales', v:evSales,avg:null },
    { l:'EV/EBITDA',v:evEbit, avg:null },
  ].map(({l,v,avg}) => {
    const isNa = v != null && Math.abs(v) > 999;
    const str  = isNa ? 'N/A' : (v != null ? `${v.toFixed(1)}x` : '—');
    let comp = '<span style="color:#334155;font-size:.65rem">Sin histórico</span>';
    if (!isNa && v != null && avg != null && avg > 0) {
      const diff = (v - avg) / avg * 100;
      const col  = diff > 0 ? _OR : _GR;
      const arr  = diff > 0 ? '▲' : '▼';
      comp = `<span style="color:${col};font-size:.65rem;font-weight:600;font-family:${_MONO}">
        ${arr} ${Math.abs(diff).toFixed(1)}% vs hist (${avg.toFixed(1)}x)</span>`;
    }
    return `<div style="flex:1;min-width:130px;background:#0d1424;border:1px solid rgba(148,163,184,.08);
      border-radius:9px;padding:12px 14px">
      <div style="font-size:.57rem;font-weight:700;letter-spacing:.10em;text-transform:uppercase;
        color:#334155;margin-bottom:5px;font-family:${_MONO}">${l}</div>
      <div style="font-size:1.3rem;font-weight:700;color:#f1f5f9;font-family:${_MONO}">${str}</div>
      <div style="margin-top:4px">${comp}</div>
    </div>`;
  });

  const hasCandles = candles?.status === 'ok' && candles?.dates?.length > 0;

  container.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">
      ${kpis.map(k => _kpi(k.lbl, k.val, k.sub, k.badge, k.color)).join('')}
    </div>

    ${(target != null || rec) ? `
    <div class="bt2-panel" style="padding:14px 18px;margin-bottom:14px">
      <div style="font-size:.60rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
        color:#475569;margin-bottom:10px;font-family:${_MONO}">CONSENSO ANALISTAS</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        ${target!=null?`<div>
          <div style="font-size:.57rem;text-transform:uppercase;letter-spacing:.09em;color:#334155;margin-bottom:3px;font-family:${_MONO}">PRECIO TARGET</div>
          <div style="font-size:1.25rem;font-weight:700;color:${_G};font-family:${_MONO}">$${Number(target).toFixed(2)}</div>
        </div>`:''}
        ${upside!=null?`<div>
          <div style="font-size:.57rem;text-transform:uppercase;letter-spacing:.09em;color:#334155;margin-bottom:3px;font-family:${_MONO}">UPSIDE POTENCIAL</div>
          <div style="font-size:1.25rem;font-weight:700;color:${upside>=0?_GR:_RE};font-family:${_MONO}">${upside>=0?'+':''}${upside.toFixed(1)}%</div>
        </div>`:''}
        ${rec?`<div>
          <div style="font-size:.57rem;text-transform:uppercase;letter-spacing:.09em;color:#334155;margin-bottom:3px;font-family:${_MONO}">RECOMENDACIÓN</div>
          <div style="font-size:.95rem;font-weight:700;color:#f1f5f9;text-transform:uppercase;font-family:${_MONO}">${rec.replace(/_/g,' ')}${metrics.num_analysts?` <span style="color:#475569;font-size:.65rem">(${metrics.num_analysts})</span>`:''}</div>
        </div>`:''}
      </div>
    </div>` : ''}

    <div style="font-size:.58rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
      color:#475569;margin-bottom:8px;font-family:${_MONO}">MÚLTIPLOS VS PROMEDIO HISTÓRICO</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
      ${multCards.join('')}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${_chartPanel('af-c-pe',    'P/E HISTÓRICO', '')}
      ${_chartPanel('af-c-pspf',  'P/S y P/FCF HISTÓRICO', '')}
      ${_chartPanel('af-c-mcap',  'MARKET CAP (HIST.)', '')}
      ${_chartPanel('af-c-px',    'PRECIO HISTÓRICO (SEMANAL)',
          hasCandles?`${candles.dates.at(-1)?.slice(0,10)} — $${candles.closes.at(-1)?.toFixed(2)}`:'')}
    </div>`;

  const years    = data.map(d => `FY${String(d.year).slice(2)}`);
  const n        = data.length;
  const hist     = _computeHistMult(data, candles, shares);

  // P/E histórico
  const peHist = hist.map(h => (h.pe && h.pe > 0 && h.pe < 400) ? h.pe : null);
  _chart('af-c-pe', ch => {
    ch.setOption({
      ..._base(years),
      yAxis: [_yaxX()],
      series: [{ name:'P/E', type:'line', data:peHist, smooth:false, symbol:'circle', symbolSize:5,
        lineStyle:{color:_CY,width:2.2}, itemStyle:{color:_CY} }],
      tooltip: { ..._tt(), valueFormatter: v => v!=null?`${v.toFixed(1)}x`:'—' },
    });
  }, !peHist.some(v=>v!=null));

  // P/S + P/FCF
  const psH   = hist.map(h => (h.ps   && h.ps<400)   ? h.ps   : null);
  const pfcfH = hist.map(h => (h.pfcf && h.pfcf<800) ? h.pfcf : null);
  _chart('af-c-pspf', ch => {
    ch.setOption({
      ..._base(years),
      yAxis: [_yaxX()],
      legend: _leg(['P/S','P/FCF']),
      series: [
        { name:'P/S',   type:'line', data:psH,   ...lineSeries(_CY) },
        { name:'P/FCF', type:'line', data:pfcfH, ...lineSeries2(_VI) },
      ],
      tooltip: { ..._tt(), valueFormatter: v => v!=null?`${v.toFixed(1)}x`:'—' },
    });
  }, !psH.some(v=>v!=null) && !pfcfH.some(v=>v!=null));

  // Market Cap
  const mcapH = hist.map(h => h.hist_mcap ? h.hist_mcap / 1e9 : null);
  _chart('af-c-mcap', ch => {
    ch.setOption({
      ..._base(years),
      yAxis: [{ type:'value', axisLabel:{color:'#475569',fontFamily:_MONO,fontSize:9,formatter:v=>`$${v.toFixed(0)}B`}, splitLine:{lineStyle:{color:'rgba(255,255,255,.05)',type:'dashed'}}, axisLine:{lineStyle:{color:'rgba(255,255,255,.06)'}} }],
      series: [{ name:'Mkt Cap', type:'bar', data:mcapH.map((v,i)=>({value:v, itemStyle:{color:_rgba(_CY,_op(i,n))}})) }],
      tooltip: { ..._tt(), valueFormatter: v => v!=null?`$${v.toFixed(1)}B`:'—' },
    });
  }, !mcapH.some(v=>v!=null) && mcapUSD==null);

  // Precio histórico
  _chart('af-c-px', ch => {
    ch.setOption({
      grid:{left:12,right:12,top:8,bottom:24,containLabel:true},
      xAxis:{type:'category',data:candles.dates,boundaryGap:false,
        axisLabel:{color:'#475569',fontFamily:_MONO,fontSize:8,formatter:d=>d.slice(0,7),
          interval:Math.max(0,Math.floor(candles.dates.length/8)-1)},
        axisLine:{lineStyle:{color:'rgba(255,255,255,.06)'}},splitLine:{show:false}},
      yAxis:{type:'value',
        axisLabel:{color:'#475569',fontFamily:_MONO,fontSize:9,
          formatter:v=>`$${v>=1000?(v/1000).toFixed(0)+'K':v.toFixed(0)}`},
        splitLine:{lineStyle:{color:'rgba(255,255,255,.05)',type:'dashed'}},
        axisLine:{lineStyle:{color:'rgba(255,255,255,.06)'}}},
      series:[{name:tk,type:'line',data:candles.closes,smooth:false,symbol:'none',
        lineStyle:{color:_VI,width:1.5},areaStyle:{color:`${_VI}10`}}],
      tooltip:{trigger:'axis',backgroundColor:'#0d1424',borderColor:'rgba(255,255,255,.12)',
        borderWidth:1,padding:[8,12],textStyle:{fontFamily:_MONO,fontSize:11,color:'#f1f5f9'},
        formatter:params=>{const p=params[0];return `<div style="font-family:${_MONO};font-size:10px">
          <div style="color:#94a3b8;margin-bottom:3px">${p.axisValue}</div>
          <div style="font-weight:700;color:${_VI}">$${Number(p.value).toFixed(2)}</div></div>`;}},
      backgroundColor:'transparent',
    });
  }, !hasCandles);
}


/* ══════════════════════════════════════════════════════════════════════════
   TAB: RANKING IA
   ══════════════════════════════════════════════════════════════════════════ */

function _tabRanking(container, tk) {
  container.innerHTML = `
    <div class="bt2-panel" style="padding:28px 24px;text-align:center;max-width:640px;margin:0 auto">
      <div style="font-size:2rem;margin-bottom:12px">⭐</div>
      <div style="font-size:1rem;font-weight:700;color:#f1f5f9;font-family:${_MONO};
        letter-spacing:-.01em;margin-bottom:8px">Ranking IA — Próximamente</div>
      <div style="color:#94a3b8;font-size:.78rem;line-height:1.65;margin-bottom:20px">
        Este módulo generará un ranking de las 13 empresas para el inversor argentino
        con horizonte 2-5 años, considerando sector, macro, momentum y valuación.
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:20px;text-align:left">
        ${['📊 Score Fundamental','📈 Score Crecimiento','💰 Score Rentabilidad',
           '🎯 Score Valuación','🏦 Score Financiero','⚡ Score Global'].map(s => `
          <div style="background:rgba(13,20,36,.8);border:1px solid rgba(148,163,184,.08);
            border-radius:8px;padding:10px 12px">
            <div style="font-size:.72rem;color:#94a3b8;font-family:${_MONO}">${s}</div>
            <div style="font-size:1.1rem;font-weight:700;color:#334155;margin-top:4px;font-family:${_MONO}">—/10</div>
          </div>`).join('')}
      </div>

      <button disabled
        style="background:${_GD};border:1px solid ${_GB};color:${_G};
          padding:8px 20px;border-radius:8px;font-family:${_MONO};font-size:.78rem;
          font-weight:700;opacity:.5;cursor:not-allowed">
        ⭐ Generar Ranking IA
      </button>
      <div style="font-family:${_MONO};font-size:.62rem;color:#334155;margin-top:8px">
        Requiere configurar ANTHROPIC_API_KEY en secrets
      </div>
    </div>`;
}


/* ══════════════════════════════════════════════════════════════════════════
   TAB: COMPARAR
   ══════════════════════════════════════════════════════════════════════════ */

async function _tabComparar(container) {
  container.innerHTML = `
    <div class="bt2-panel" style="padding:14px 18px">
      <div class="bt2-panel-hdr">
        <span class="bt2-panel-title">COMPARATIVA — 13 TICKERS CURADOS</span>
        <span class="bt2-panel-sub" id="cmp-sub">Cargando…</span>
      </div>
      <div id="cmp-body" class="bt2-snapshot-scroll" style="overflow-x:auto">
        ${[...Array(6)].map(()=>`<div class="skeleton" style="height:32px;border-radius:4px;margin-bottom:4px"></div>`).join('')}
      </div>
    </div>`;

  try {
    const summaries = await api.fundamental.compare();
    _renderCompareTable(document.getElementById('cmp-body'), summaries);
    const sub = document.getElementById('cmp-sub');
    if (sub) sub.textContent = `${summaries.filter(s=>!s.error).length} tickers`;
  } catch (e) {
    document.getElementById('cmp-body').innerHTML = `
      <div style="padding:16px;font-family:${_MONO};color:var(--negative);font-size:.78rem">
        Error cargando comparativa: ${e.message}
      </div>`;
  }
}

function _renderCompareTable(el, summaries) {
  const cols = [
    { key:'ticker',      hdr:'TICKER',     fmt:(s)=>`<span style="font-weight:700;color:${_G};font-family:${_MONO};cursor:pointer" onclick="document.getElementById('af-p-${s.ticker}')?.click()||document.getElementById('af-input').value='${s.ticker}'">${s.ticker}</span>`, align:'left' },
    { key:'name',        hdr:'EMPRESA',    fmt:s=>`<span style="color:#94a3b8;font-size:.72rem">${(s.name||'').split(' ').slice(0,3).join(' ')}</span>`, align:'left' },
    { key:'sector',      hdr:'SECTOR',     fmt:s=>`<span style="color:#64748b;font-size:.65rem">${s.sector||'—'}</span>`, align:'left' },
    { key:'market_cap',  hdr:'MKT CAP',    fmt:s=>s.market_cap!=null?_fmtB(s.market_cap*1e6):'—',        num:true, color:null },
    { key:'revenue',     hdr:`REV FY`,     fmt:s=>s.revenue!=null?_fmtM(s.revenue):'—',                   num:true, color:null },
    { key:'revenue_yoy', hdr:'REV YoY',    fmt:s=>_fmtPct(s.revenue_yoy),                                  num:true, pct:true },
    { key:'gross_margin',hdr:'GP%',        fmt:s=>_fmtPct1(s.gross_margin),                                num:true, pct:true },
    { key:'ebitda_margin',hdr:'EBITDA%',   fmt:s=>_fmtPct1(s.ebitda_margin),                               num:true, pct:true },
    { key:'fcf_margin',  hdr:'FCF%',       fmt:s=>_fmtPct1(s.fcf_margin),                                  num:true, pct:true },
    { key:'roe',         hdr:'ROE',        fmt:s=>_fmtPct1(s.roe),                                          num:true, pct:true },
    { key:'pe_ttm',      hdr:'P/E',        fmt:s=>s.pe_ttm!=null?`${s.pe_ttm.toFixed(1)}x`:'—',            num:true, lower:true },
    { key:'ps_ttm',      hdr:'P/S',        fmt:s=>s.ps_ttm!=null?`${s.ps_ttm.toFixed(1)}x`:'—',            num:true, lower:true },
    { key:'ev_ebitda',   hdr:'EV/EBITDA',  fmt:s=>{const v=s.ev_ebitda;return v!=null&&Math.abs(v)<999?`${v.toFixed(1)}x`:'N/A';}, num:true, lower:true },
    { key:'beta',        hdr:'BETA',       fmt:s=>s.beta!=null?s.beta.toFixed(2):'—',                      num:true, color:null },
    { key:'rev_cagr_3y', hdr:'CAGR 3Y',   fmt:s=>_fmtPct1(s.rev_cagr_3y),                                 num:true, pct:true },
  ];

  // Calcular best values para highlight
  const best = {};
  cols.filter(c => c.num).forEach(c => {
    const vals = summaries.filter(s=>!s.error).map(s=>s[c.key]).filter(v=>v!=null&&isFinite(v));
    if (!vals.length) return;
    best[c.key] = c.lower ? Math.min(...vals) : Math.max(...vals);
  });

  const thStyle = `padding:6px 10px;font-family:${_MONO};font-size:.57rem;font-weight:700;
    text-transform:uppercase;letter-spacing:.08em;color:#334155;white-space:nowrap;
    border-bottom:2px solid rgba(148,163,184,.12)`;
  const tdStyle = (right, isBest, pctCol, v) => {
    let col = '#94a3b8';
    if (pctCol && v != null) col = v > 0 ? '#22c55e' : v < 0 ? '#ef4444' : '#94a3b8';
    const bg = isBest ? 'rgba(212,175,55,.08)' : 'transparent';
    return `padding:6px 10px;font-family:${_MONO};font-size:.75rem;
      text-align:${right?'right':'left'};color:${col};background:${bg};
      border-bottom:1px solid rgba(148,163,184,.05);white-space:nowrap`;
  };

  const headers = cols.map(c => `<th style="${thStyle};text-align:${c.align||'right'}">${c.hdr}</th>`).join('');

  const rows = summaries.map(s => {
    if (s.error) return `<tr><td colspan="${cols.length}" style="padding:6px 10px;color:#334155;
      font-family:${_MONO};font-size:.72rem">${s.ticker} — sin datos</td></tr>`;
    return `<tr class="bt2-row">${cols.map(c => {
      const raw = s[c.key];
      const isBest = c.num && best[c.key] != null && raw != null && Math.abs(raw - best[c.key]) < 0.0001;
      return `<td style="${tdStyle(c.align !== 'left', isBest, c.pct, raw)}">${c.fmt(s)}</td>`;
    }).join('')}</tr>`;
  }).join('');

  el.innerHTML = `<table class="bt2-table" style="min-width:900px">
    <thead><tr>${headers}</tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}


/* ══════════════════════════════════════════════════════════════════════════
   CHART HELPERS
   ══════════════════════════════════════════════════════════════════════════ */

function _chartPanel(id, title, sub) {
  return `<div class="bt2-panel" style="padding:12px">
    <div class="bt2-panel-hdr">
      <span class="bt2-panel-title">${title}</span>
      ${sub ? `<span class="bt2-panel-sub">${sub}</span>` : ''}
    </div>
    <div id="${id}" style="height:280px"></div>
  </div>`;
}

function _chart(id, fn, noData = false, emptyMsg = 'Sin datos disponibles para este gráfico') {
  const el = document.getElementById(id);
  if (!el) return;
  const ex = echarts.getInstanceByDom(el);
  if (ex) ex.dispose();
  if (noData) {
    el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;
      height:100%;font-family:${_MONO};color:#334155;font-size:.72rem;
      text-align:center;padding:16px">${emptyMsg}</div>`;
    return;
  }
  const ch = echarts.init(el, 'dcf');
  try { fn(ch); } catch (e) {
    console.warn(`[AF] chart ${id}:`, e);
    el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;
      height:100%;font-family:${_MONO};color:#334155;font-size:.72rem">
      Error al renderizar</div>`;
    return;
  }
  ch.resize();
  new ResizeObserver(() => { try { ch.resize(); } catch(_) {} }).observe(el);
}

// Base option reutilizable
function _base(xData) {
  return {
    grid: { left:12, right:16, top:28, bottom:24, containLabel:true },
    xAxis: [{ type:'category', data:xData, boundaryGap:true,
      axisLabel:{color:'#475569',fontFamily:_MONO,fontSize:9.5},
      axisLine:{lineStyle:{color:'rgba(255,255,255,.06)'}}, splitLine:{show:false} }],
    backgroundColor:'transparent',
  };
}

function _yaxM() {
  return { type:'value', axisLabel:{color:'#475569',fontFamily:_MONO,fontSize:9,
    formatter:v=>`$${Math.abs(v)>=1000?(v/1000).toFixed(0)+'B':v.toFixed(0)+'M'}`},
    splitLine:{lineStyle:{color:'rgba(255,255,255,.05)',type:'dashed'}},
    axisLine:{lineStyle:{color:'rgba(255,255,255,.06)'}} };
}

function _yaxPct() {
  return { type:'value', axisLabel:{color:'#475569',fontFamily:_MONO,fontSize:9,formatter:v=>`${v.toFixed(0)}%`},
    splitLine:{lineStyle:{color:'rgba(255,255,255,.05)',type:'dashed'}},
    axisLine:{lineStyle:{color:'rgba(255,255,255,.06)'}} };
}

function _yaxX() {
  return { type:'value', axisLabel:{color:'#475569',fontFamily:_MONO,fontSize:9,formatter:v=>`${v.toFixed(0)}x`},
    splitLine:{lineStyle:{color:'rgba(255,255,255,.05)',type:'dashed'}},
    axisLine:{lineStyle:{color:'rgba(255,255,255,.06)'}} };
}

function _tt() {
  return { trigger:'axis', backgroundColor:'#0d1424',
    borderColor:'rgba(255,255,255,.12)',borderWidth:1,padding:[10,14],
    textStyle:{fontFamily:_MONO,fontSize:11,color:'#f1f5f9'},
    axisPointer:{lineStyle:{color:'rgba(255,255,255,.1)'}} };
}

function _leg(data) {
  return { data, textStyle:{color:'#94a3b8',fontSize:9,fontFamily:_MONO}, top:2, right:6 };
}

function lineSeries(color) {
  return { smooth:false, symbol:'circle', symbolSize:4,
    lineStyle:{color,width:1.8}, itemStyle:{color} };
}

function lineSeries2(color) {
  return { smooth:false, symbol:'circle', symbolSize:4,
    lineStyle:{color,width:1.8,type:'dashed'}, itemStyle:{color} };
}


/* ══════════════════════════════════════════════════════════════════════════
   MATH HELPERS
   ══════════════════════════════════════════════════════════════════════════ */

function _computeHistMult(data, candles, sharesMM) {
  if (!candles?.dates?.length || !sharesMM || !data.length) {
    return data.map(d => ({ year:d.year, hist_mcap:null, ps:null, pfcf:null, pe:null }));
  }
  const cTimes = candles.dates.map(d => new Date(d).getTime());
  return data.map(d => {
    const fyEnd = new Date(d.year, 11, 31).getTime();
    let best = 0, bestDiff = Infinity;
    cTimes.forEach((t, i) => { const diff = Math.abs(t - fyEnd); if (diff < bestDiff) { bestDiff = diff; best = i; } });
    const price = candles.closes[best];
    const histMcap = price * sharesMM * 1e6;
    return {
      year: d.year, hist_mcap: histMcap,
      ps:   d.revenue    && d.revenue    > 0 ? histMcap / (d.revenue    * 1e6) : null,
      pfcf: d.fcf        && d.fcf        > 0 ? histMcap / (d.fcf        * 1e6) : null,
      pe:   d.net_income && d.net_income > 0 ? histMcap / (d.net_income * 1e6) : null,
    };
  });
}

function _histAvg(data, mcapUSD, col) {
  if (!mcapUSD || !data.length) return null;
  const vals = data.slice(-5).map(d => {
    const v = d[col];
    if (!v || v <= 0) return null;
    return mcapUSD / (v * 1e6);
  }).filter(v => v != null && isFinite(v));
  return vals.length ? vals.reduce((a,b) => a+b, 0) / vals.length : null;
}

function _yoy(curr, prev) {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev) * 100);
}


/* ══════════════════════════════════════════════════════════════════════════
   FORMAT HELPERS
   ══════════════════════════════════════════════════════════════════════════ */

function _fmtB(usdRaw) {
  if (usdRaw == null) return '—';
  const abs = Math.abs(usdRaw), sign = usdRaw < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}$${(abs/1e12).toFixed(1)}T`;
  if (abs >= 1e9)  return `${sign}$${(abs/1e9).toFixed(1)}B`;
  if (abs >= 1e6)  return `${sign}$${(abs/1e6).toFixed(1)}M`;
  if (abs >= 1e3)  return `${sign}$${(abs/1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function _fmtM(v) { return _fmtB(v != null ? v * 1e6 : null); }

function _fmtPct(v) {
  if (v == null) return '<span style="color:#334155">—</span>';
  const c = v > 0 ? _GR : v < 0 ? _RE : '#94a3b8';
  return `<span style="color:${c};font-weight:600">${v>=0?'+':''}${v.toFixed(1)}%</span>`;
}

function _fmtPct1(v) {
  if (v == null) return '<span style="color:#334155">—</span>';
  const c = v > 0 ? _GR : v < 0 ? _RE : '#94a3b8';
  return `<span style="color:${c}">${v.toFixed(1)}%</span>`;
}

function _margin(num, den) {
  if (num == null || den == null || den === 0) return '';
  return `Margen ${(num / den * 100).toFixed(1)}%`;
}

function _rgba(hex, alpha) {
  const h = hex.replace('#','');
  return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${alpha.toFixed(2)})`;
}

function _op(i, n, min = 0.25) {
  if (n <= 1) return 1;
  return min + (1 - min) * i / (n - 1);
}

function _afEmpty(msg) {
  return `<div class="bt2-panel" style="padding:24px;text-align:center">
    <div style="font-family:${_MONO};color:#334155;font-size:.78rem">${msg}</div>
  </div>`;
}

function _afSetPillActive(tickers, active) {
  tickers.forEach(tk => {
    const b = document.getElementById(`af-p-${tk}`);
    if (!b) return;
    const isA = tk === active;
    b.style.background    = isA ? _GD : 'rgba(212,175,55,.08)';
    b.style.borderColor   = isA ? _GB : 'rgba(212,175,55,.20)';
    b.style.color         = isA ? _G  : '#94a3b8';
  });
}

/* ── KPI card con borde superior de color ────────────────────────────────── */
function _kpi(label, value, sub, badge, color, negVal = false) {
  let badgeHtml = '';
  if (badge != null) {
    const col  = negVal ? _RE : (badge >= 0 ? _GR : _RE);
    const bg   = negVal ? 'rgba(239,68,68,.10)' : (badge >= 0 ? 'rgba(34,197,94,.10)' : 'rgba(239,68,68,.10)');
    const arr  = badge >= 0 ? '▲' : '▼';
    const d    = Math.abs(badge) >= 100 ? badge.toFixed(0) : badge.toFixed(1);
    badgeHtml  = `<span style="background:${bg};color:${col};border:1px solid ${col}33;
      border-radius:3px;padding:1px 5px;font-size:.62rem;font-weight:700;
      margin-left:4px;white-space:nowrap;font-family:${_MONO}">${arr} ${badge>=0?'+':''}${d}%</span>`;
  }
  const vlen  = String(value).length;
  const vfont = vlen > 9 ? '.95rem' : vlen > 7 ? '1.1rem' : '1.25rem';

  return `<div style="flex:1;min-width:110px;max-width:200px;
    background:linear-gradient(145deg,#0d1424,#111d35);
    border:1px solid rgba(148,163,184,.09);border-top:2px solid ${color};
    border-radius:9px;padding:11px 13px;overflow:hidden">
    <div style="font-size:.57rem;font-weight:700;letter-spacing:.10em;text-transform:uppercase;
      color:#334155;margin-bottom:4px;font-family:${_MONO};white-space:nowrap">${label}</div>
    <div style="font-size:${vfont};font-weight:700;color:#f1f5f9;line-height:1.1;
      white-space:nowrap;font-family:${_MONO}">${value}</div>
    <div style="margin-top:4px;font-size:.65rem;color:#64748b;font-family:${_MONO};
      display:flex;align-items:center;flex-wrap:wrap;gap:3px">
      <span>${sub||''}</span>${badgeHtml}
    </div>
  </div>`;
}
