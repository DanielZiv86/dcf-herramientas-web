/* ─── Análisis Fundamental — BondTerminal v2 ────────────────────────────────
   Espejo de views/analisis_fundamental.py del proyecto Streamlit.
   5 tabs: Empresa · Negocio · Rentabilidad · Financiera · Valuación
   Accent: dorado #D4AF37 (igual que Streamlit's AF_GOLD)
   ─────────────────────────────────────────────────────────────────────────── */

/* ── Constantes de color ─────────────────────────────────────────────────── */
const _AF_GOLD        = '#D4AF37';
const _AF_GOLD_DIM    = 'rgba(212,175,55,0.12)';
const _AF_GOLD_BORDER = 'rgba(212,175,55,0.30)';

const _AF_NEG_COLORS = [
  '#22d3ee', '#a78bfa', '#34d399', '#38bdf8', '#fbbf24', '#f97316', '#f472b6',
];
const _AF_RENT_COLORS = ['#22d3ee', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#f97316'];
const _AF_FIN_COLORS  = ['#22d3ee', '#ef4444', '#22c55e', '#a78bfa', '#fbbf24', '#34d399', '#f97316', '#60a5fa'];
const _AF_VAL_COLORS  = ['#22d3ee', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#f97316'];

const _TAG_COLORS = [
  ['rgba(56,189,248,0.15)',  '#38bdf8'],
  ['rgba(167,139,250,0.15)', '#a78bfa'],
  ['rgba(52,211,153,0.15)',  '#34d399'],
  ['rgba(249,115,22,0.15)',  '#f97316'],
  ['rgba(212,175,55,0.15)',  '#D4AF37'],
];

const MONO = "'JetBrains Mono',monospace";


/* ── Entrada de la página ─────────────────────────────────────────────────── */

(window.pages = window.pages || {}).fundamental = async function(container) {
  container.innerHTML = `
    <div class="bt2-page">
      <div class="bt2-header" style="flex-direction:column;align-items:flex-start;gap:2px;margin-bottom:12px">
        <h1 class="bt2-title" style="font-size:1.25rem;letter-spacing:-.02em;color:${_AF_GOLD}">
          Análisis Fundamental
        </h1>
        <p style="font-family:${MONO};font-size:.72rem;color:var(--bt2-sub);margin:0">
          US Equities · Finnhub · CrowdStrike · Arista · NEE · COP · FISV y más
        </p>
      </div>

      <!-- Ticker selector -->
      <div style="margin-bottom:14px">
        <div style="font-family:${MONO};font-size:9px;color:var(--bt2-sub);text-transform:uppercase;
          letter-spacing:.08em;font-weight:600;margin-bottom:6px">Tickers curados</div>
        <div id="af-ticker-pills" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px"></div>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="dcf-input" id="af-custom-input"
            placeholder="Buscar cualquier ticker US (AAPL, NVDA…)"
            style="width:260px;font-family:${MONO};font-size:.78rem"/>
          <button id="af-search-btn"
            style="background:${_AF_GOLD_DIM};border:1px solid ${_AF_GOLD_BORDER};color:${_AF_GOLD};
              padding:5px 14px;border-radius:6px;font-family:${MONO};font-size:.75rem;
              font-weight:700;cursor:pointer;transition:.15s">
            BUSCAR
          </button>
        </div>
      </div>

      <!-- Contenido principal -->
      <div id="af-content">
        <div class="bt2-panel" style="padding:28px 20px;text-align:center">
          <div style="font-family:${MONO};color:var(--bt2-sub);font-size:.82rem">
            Seleccioná un ticker para comenzar el análisis fundamental
          </div>
        </div>
      </div>
    </div>`;

  let _currentTicker = null;
  let _configData    = null;

  // Cargar config curada (descripciones + tags)
  try {
    _configData = await api.fundamental.config();
  } catch (e) {
    console.warn('[AF] config load failed:', e);
    _configData = { tickers: [], config: {} };
  }

  // Renderizar pills de tickers curados
  const tickers = _configData.tickers || [];
  const pillsEl = document.getElementById('af-ticker-pills');
  tickers.forEach(tk => {
    const btn = document.createElement('button');
    btn.id = `af-pill-${tk}`;
    btn.textContent = tk;
    btn.style.cssText = `background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.20);
      color:#94a3b8;padding:3px 10px;border-radius:20px;font-family:${MONO};font-size:.72rem;
      font-weight:700;cursor:pointer;transition:.15s;letter-spacing:.04em`;
    btn.onmouseenter = () => { if (_currentTicker !== tk) btn.style.borderColor = _AF_GOLD_BORDER; };
    btn.onmouseleave = () => { if (_currentTicker !== tk) btn.style.borderColor = 'rgba(212,175,55,0.20)'; };
    btn.onclick = () => _loadTicker(tk);
    pillsEl.appendChild(btn);
  });

  // Search button + enter
  document.getElementById('af-search-btn')?.addEventListener('click', () => {
    const tk = document.getElementById('af-custom-input')?.value?.trim()?.toUpperCase();
    if (tk) _loadTicker(tk);
  });
  document.getElementById('af-custom-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const tk = e.target.value.trim().toUpperCase();
      if (tk) _loadTicker(tk);
    }
  });

  // Cargar CRWD por default
  _loadTicker('CRWD');

  // ── Cargador principal ────────────────────────────────────────────────────

  async function _loadTicker(ticker) {
    if (!ticker) return;
    _currentTicker = ticker;

    // Actualizar estado visual de pills
    tickers.forEach(tk => {
      const b = document.getElementById(`af-pill-${tk}`);
      if (!b) return;
      if (tk === ticker) {
        b.style.background = _AF_GOLD_DIM;
        b.style.borderColor = _AF_GOLD_BORDER;
        b.style.color = _AF_GOLD;
      } else {
        b.style.background = 'rgba(212,175,55,0.08)';
        b.style.borderColor = 'rgba(212,175,55,0.20)';
        b.style.color = '#94a3b8';
      }
    });

    const content = document.getElementById('af-content');
    content.innerHTML = `
      <div style="padding:18px 0">
        ${[...Array(3)].map(() => `<div class="skeleton" style="height:52px;border-radius:6px;margin-bottom:8px"></div>`).join('')}
        <div class="skeleton" style="height:280px;border-radius:6px;margin-top:16px"></div>
      </div>`;

    try {
      const [perfil, financieros, candles] = await Promise.allSettled([
        api.fundamental.perfil(ticker),
        api.fundamental.financieros(ticker),
        api.fundamental.candles(ticker, 'W'),
      ]);

      const p = perfil.status      === 'fulfilled' ? perfil.value      : {};
      const f = financieros.status === 'fulfilled' ? financieros.value : { data: [] };
      const c = candles.status     === 'fulfilled' ? candles.value     : { status: 'no_data' };

      // Enriquecer con config curada
      const cfg = (_configData?.config || {})[ticker] || {};
      if (cfg.description && !p.description) p.description = cfg.description;
      if (cfg.tags?.length && !p.tags?.length) p.tags = cfg.tags;

      _renderPage(content, ticker, p, f, c);

    } catch (e) {
      console.error('[AF] loadTicker error:', e);
      content.innerHTML = `
        <div class="bt2-panel" style="padding:24px;color:var(--negative)">
          ✕ Error cargando ${ticker}: ${e.message || 'error desconocido'}
        </div>`;
    }
  }

  // ── Render principal con tabs ─────────────────────────────────────────────

  function _renderPage(container, ticker, perfil, financieros, candles) {
    const { profile = {}, quote = {}, metrics = {}, description = '', tags = [] } = perfil;
    const data = (financieros.data || []).filter(r => r && r.year);

    container.innerHTML = `
      <!-- Header empresa -->
      <div id="af-company-header" style="margin-bottom:16px"></div>

      <!-- Tabs -->
      <div id="af-tab-pills" style="margin-bottom:14px"></div>
      <div id="af-tab-content"></div>

      <div class="cer-note-strip" style="margin-top:16px">
        <span style="color:#94a3b8">ℹ</span>
        Fuente: Finnhub · yfinance · Datos con delay. No constituye asesoramiento de inversión.
      </div>`;

    _renderHeader(document.getElementById('af-company-header'), ticker, profile, quote, metrics, description, tags);

    const TAB_NAMES = ['🏢 Empresa', '📈 Negocio', '💰 Rentabilidad', '🏦 Financiera', '🎯 Valuación'];
    const pillsEl = document.getElementById('af-tab-pills');
    const tabContent = document.getElementById('af-tab-content');

    pillsEl.appendChild(ui.pills(TAB_NAMES, 0, (i, label) => {
      _renderTab(tabContent, label, ticker, profile, quote, metrics, description, tags, data, candles);
    }));

    _renderTab(tabContent, TAB_NAMES[0], ticker, profile, quote, metrics, description, tags, data, candles);
  }
};


/* ── HEADER DE EMPRESA ───────────────────────────────────────────────────── */

function _renderHeader(el, ticker, profile, quote, metrics, description, tags) {
  const name     = profile.name || ticker;
  const sector   = profile.sector || '—';
  const exchange = (profile.exchange || '').replace('NASDAQ NMS - GLOBAL MARKET', 'NASDAQ').replace('New York Stock Exchange', 'NYSE');
  const price    = quote.price;
  const change   = quote.change;
  const pct      = quote.pct_change;

  const priceStr = price ? `$${Number(price).toFixed(2)}` : '—';
  const chgColor = change >= 0 ? '#22c55e' : '#ef4444';
  const chgSign  = change >= 0 ? '+' : '';
  const chgStr   = (change != null && pct != null) ? `${chgSign}${change.toFixed(2)} (${chgSign}${pct.toFixed(2)}%)` : '—';

  const mcap     = profile.market_cap;
  const mcapStr  = mcap ? _afFmtB(mcap * 1e6) : '—';

  // Tags HTML
  const tagsHtml = (tags || []).map((t, i) => {
    const [bg, color] = _TAG_COLORS[i % _TAG_COLORS.length];
    return `<span style="background:${bg};color:${color};border:1px solid ${color}33;
      border-radius:20px;padding:3px 10px;font-size:.72rem;font-weight:600;
      letter-spacing:.04em;white-space:nowrap;font-family:${MONO}">${t}</span>`;
  }).join('');

  el.innerHTML = `
    <div class="bt2-panel" style="padding:16px 18px">
      <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
        <!-- Logo o iniciales -->
        <div style="flex-shrink:0">
          ${profile.logo
            ? `<img src="${profile.logo}" alt="${ticker}"
                style="width:64px;height:64px;border-radius:10px;object-fit:contain;
                  background:#0d1424;border:1px solid rgba(148,163,184,.1)"
                onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
            : ''}
          <div style="width:64px;height:64px;border-radius:10px;background:${_AF_GOLD_DIM};
            border:1px solid ${_AF_GOLD_BORDER};display:${profile.logo ? 'none' : 'flex'};
            align-items:center;justify-content:center;font-size:1.3rem;
            font-weight:700;color:${_AF_GOLD};font-family:${MONO}">
            ${ticker.slice(0, 2)}
          </div>
        </div>

        <!-- Nombre + info -->
        <div style="flex:1;min-width:200px">
          <div style="font-size:1.25rem;font-weight:700;color:#f1f5f9;line-height:1.2">${name}</div>
          <div style="font-size:.78rem;color:#94a3b8;margin-top:2px">
            ${ticker} · ${sector} · ${exchange}
          </div>
          ${tagsHtml ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:8px">${tagsHtml}</div>` : ''}
        </div>

        <!-- Precio -->
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:1.9rem;font-weight:700;color:${_AF_GOLD};line-height:1;
            font-family:${MONO}">${priceStr}</div>
          <div style="font-size:.80rem;color:${chgColor};margin-top:3px;font-family:${MONO}">${chgStr}</div>
          <div style="font-size:.72rem;color:#94a3b8;margin-top:4px">
            Mkt Cap: ${mcapStr}
          </div>
        </div>
      </div>
    </div>`;
}


/* ── DISPATCHER DE TABS ──────────────────────────────────────────────────── */

function _renderTab(container, label, ticker, profile, quote, metrics, description, tags, data, candles) {
  container.innerHTML = '';
  if (label.includes('Empresa'))      _tabEmpresa(container, ticker, profile, quote, metrics, description, tags, data);
  else if (label.includes('Negocio')) _tabNegocio(container, ticker, data, metrics);
  else if (label.includes('Rentabilidad')) _tabRentabilidad(container, ticker, data, metrics);
  else if (label.includes('Financiera'))   _tabFinanciera(container, ticker, data);
  else if (label.includes('Valuación'))    _tabValuacion(container, ticker, data, metrics, profile, candles);
}


/* ════════════════════════════════════════════════════════════════════════════
   TAB 1: EMPRESA
   ════════════════════════════════════════════════════════════════════════════ */

function _tabEmpresa(container, ticker, profile, quote, metrics, description, tags, data) {
  const last    = data.length ? data[data.length - 1] : null;
  const fy      = last ? `FY${String(last.year).slice(2)}` : 'FY—';

  // KPI strip bottom (igual que Streamlit)
  const divYield   = metrics.dividend_yield != null ? `${Number(metrics.dividend_yield).toFixed(2)}%` : '—';
  const revStr     = last?.revenue != null ? _afFmtB(last.revenue * 1e6) : '—';
  const fcfStr     = last?.fcf     != null ? _afFmtB(last.fcf     * 1e6) : '—';
  const empStr     = profile.employees ? `~${Number(profile.employees).toLocaleString('es-AR')}` : '—';
  const ipoStr     = (profile.ipo_date || '').slice(0, 4) || '—';
  const w52h       = metrics.week52_high ? `$${Number(metrics.week52_high).toFixed(2)}` : '—';
  const w52l       = metrics.week52_low  ? `$${Number(metrics.week52_low).toFixed(2)}`  : '—';
  const betaStr    = metrics.beta != null ? Number(metrics.beta).toFixed(2) : '—';

  const kpiItems = [
    [`REV ${fy}`,    revStr],
    [`FCF ${fy}`,    fcfStr],
    ['DIV YIELD',    divYield],
    ['52W HIGH',     w52h],
    ['52W LOW',      w52l],
    ['BETA',         betaStr],
    ['IPO',          ipoStr],
    ['EMPLEADOS',    empStr],
  ];

  const kpiCells = kpiItems.map(([lbl, val]) => `
    <div style="flex:1;min-width:100px;padding:10px 14px;
      border-right:1px solid rgba(148,163,184,.08)">
      <div style="font-size:.60rem;font-weight:700;letter-spacing:.10em;text-transform:uppercase;
        color:#475569;margin-bottom:4px;font-family:${MONO}">${lbl}</div>
      <div style="font-size:.82rem;font-weight:600;color:#f1f5f9;font-family:${MONO}">${val}</div>
    </div>`).join('');

  container.innerHTML = `
    <!-- Descripción -->
    ${description ? `
    <div class="bt2-panel" style="padding:16px 18px;margin-bottom:12px">
      <div style="font-size:.60rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
        color:#475569;margin-bottom:8px;font-family:${MONO}">DESCRIPCIÓN</div>
      <div style="color:#94a3b8;font-size:.82rem;line-height:1.65">${description}</div>
    </div>` : ''}

    <!-- KPI strip -->
    <div style="display:flex;flex-wrap:wrap;background:rgba(13,20,36,.6);
      border:1px solid rgba(148,163,184,.08);border-radius:10px;margin-bottom:12px">
      ${kpiCells}
    </div>

    <!-- Ratios clave en grid -->
    <div class="bt2-panel" style="padding:16px 18px">
      <div style="font-size:.60rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
        color:#475569;margin-bottom:10px;font-family:${MONO}">RATIOS CLAVE (TTM)</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px">
        ${[
          ['P/E TTM',       metrics.pe_ttm,           'x'],
          ['P/E Forward',   metrics.pe_forward,        'x'],
          ['P/S TTM',       metrics.ps_ttm,            'x'],
          ['P/B',           metrics.pb_annual,         'x'],
          ['EV/EBITDA TTM', metrics.ev_ebitda_ttm,     'x'],
          ['ROE TTM',       metrics.roe_ttm,           '%'],
          ['ROA TTM',       metrics.roa_ttm,           '%'],
          ['ROIC TTM',      metrics.roic_ttm,          '%'],
          ['Gross Margin',  metrics.gross_margin_ttm,  '%'],
          ['EBITDA Margin', metrics.ebitda_margin_ttm, '%'],
          ['Net Margin',    metrics.net_margin_ttm,    '%'],
          ['FCF Margin',    metrics.fcf_margin_ttm,    '%'],
        ].map(([lbl, val, suf]) => {
          const vStr = val != null ? `${Number(val).toFixed(1)}${suf}` : '—';
          const color = suf === '%' ? (val > 0 ? '#22c55e' : val < 0 ? '#ef4444' : '#94a3b8') : '#f1f5f9';
          return `<div style="background:rgba(13,20,36,.6);border:1px solid rgba(148,163,184,.08);
            border-radius:8px;padding:10px 12px">
            <div style="font-size:.58rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
              color:#475569;margin-bottom:3px;font-family:${MONO}">${lbl}</div>
            <div style="font-size:.90rem;font-weight:700;color:${color};font-family:${MONO}">${vStr}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}


/* ════════════════════════════════════════════════════════════════════════════
   TAB 2: NEGOCIO
   ════════════════════════════════════════════════════════════════════════════ */

function _tabNegocio(container, ticker, data, metrics) {
  if (!data.length) {
    container.innerHTML = _afNoData('Sin datos financieros anuales para este ticker.');
    return;
  }

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

  const cards = [
    ['Revenue',      _afFmtB(_afM(rev)),    fy,                              last.revenue_yoy,    false],
    ['Gross Profit', _afFmtB(_afM(gp)),    _marginStr(gp, rev),             null,                false],
    ['EBITDA',       _afFmtB(_afM(ebitda)),  _marginStr(ebitda, rev),         null,                ebitda != null && ebitda < 0],
    ['Net Income',   _afFmtB(_afM(ni)),    _marginStr(ni, rev),             last.net_income_yoy, ni != null && ni < 0],
    ['EPS Diluido',  eps != null ? `$${Number(eps).toFixed(2)}` : '—',       fy,                  null,                false],
    ['FCF',          _afFmtB(_afM(fcf)),    _marginStr(fcf, rev),            last.fcf_yoy,        fcf != null && fcf < 0],
    ['Rev CAGR',     cagr != null ? `${cagr > 0 ? '+' : ''}${cagr.toFixed(1)}%` : '—',
                                              `${fy0}→${fy}`,                  null,                false],
  ];

  container.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
      ${cards.map((c, i) => _afKpiCard(c[0], c[1], c[2], c[3], _AF_NEG_COLORS[i % _AF_NEG_COLORS.length], c[4])).join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="bt2-panel" style="padding:12px">
        <div class="bt2-panel-hdr"><span class="bt2-panel-title">REVENUE & EARNINGS</span></div>
        <div id="af-chart-rev-earn" style="height:300px"></div>
      </div>
      <div class="bt2-panel" style="padding:12px">
        <div class="bt2-panel-hdr"><span class="bt2-panel-title">CRECIMIENTO YoY</span></div>
        <div id="af-chart-yoy" style="height:300px"></div>
      </div>
      <div class="bt2-panel" style="padding:12px">
        <div class="bt2-panel-hdr"><span class="bt2-panel-title">EBITDA y MARGEN</span></div>
        <div id="af-chart-ebitda" style="height:300px"></div>
      </div>
      <div class="bt2-panel" style="padding:12px">
        <div class="bt2-panel-hdr"><span class="bt2-panel-title">NET INCOME y EPS</span></div>
        <div id="af-chart-ni-eps" style="height:300px"></div>
      </div>
    </div>`;

  const years = data.map(d => `FY${String(d.year).slice(2)}`);
  const n     = years.length;

  // Chart 1: Revenue & Earnings — barras agrupadas con opacidad gradiente
  _afChartInit('af-chart-rev-earn', chart => {
    const revData = data.map(d => d.revenue ?? null);
    const niData  = data.map(d => d.net_income ?? null);
    chart.setOption({
      ..._afBaseOption(years),
      yAxis: [{ type: 'value', axisLabel: { color: '#475569', fontFamily: MONO, fontSize: 9,
        formatter: v => `$${Math.abs(v) >= 1000 ? (v/1000).toFixed(0)+'B' : v.toFixed(0)+'M'}` },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,.05)', type: 'dashed' } },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } }],
      series: [
        { name: 'Revenue', type: 'bar', data: revData.map((v, i) => ({
            value: v, itemStyle: { color: _afRgba('#22d3ee', _afOpacity(i, n)) }
          })), barGap: '-30%', barCategoryGap: '40%' },
        { name: 'Net Income', type: 'bar', data: niData.map((v, i) => ({
            value: v,
            itemStyle: { color: _afRgba(v >= 0 ? '#34d399' : '#ef4444', _afOpacity(i, n)) }
          })) },
      ],
      tooltip: { ..._afTooltip(), valueFormatter: v => v != null ? `$${v.toFixed(0)}M` : '—' },
    });
  });

  // Chart 2: Crecimiento YoY — línea con fill
  _afChartInit('af-chart-yoy', chart => {
    const yoyData = data.map(d => d.revenue_yoy ?? null);
    chart.setOption({
      ..._afBaseOption(years),
      yAxis: [{ type: 'value', axisLabel: { color: '#475569', fontFamily: MONO, fontSize: 9,
        formatter: v => `${v.toFixed(0)}%` },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,.05)', type: 'dashed' } },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } }],
      series: [{
        name: 'Revenue YoY', type: 'line', data: yoyData,
        smooth: false, symbol: 'circle', symbolSize: 6,
        lineStyle: { color: '#a78bfa', width: 2.2 },
        itemStyle: { color: '#a78bfa' },
        areaStyle: { color: 'rgba(167,139,250,.08)' },
        markLine: { data: [{ yAxis: 0 }], lineStyle: { color: 'rgba(148,163,184,.25)', width: 1 },
          label: { show: false }, symbol: 'none' },
      }],
      tooltip: { ..._afTooltip(), valueFormatter: v => v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : '—' },
    });
  });

  // Chart 3: EBITDA + margen (dual axis)
  _afChartInit('af-chart-ebitda', chart => {
    const ebitdaData  = data.map(d => d.ebitda_est ?? null);
    const marginData  = data.map(d => d.ebitda_margin ?? null);
    chart.setOption({
      ..._afBaseOption(years),
      yAxis: [
        { type: 'value', axisLabel: { color: '#475569', fontFamily: MONO, fontSize: 9,
            formatter: v => `$${Math.abs(v) >= 1000 ? (v/1000).toFixed(0)+'B' : v.toFixed(0)+'M'}` },
          splitLine: { lineStyle: { color: 'rgba(255,255,255,.05)', type: 'dashed' } },
          axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } },
        { type: 'value', axisLabel: { color: '#475569', fontFamily: MONO, fontSize: 9, formatter: v => `${v.toFixed(0)}%` },
          splitLine: { show: false }, axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } },
      ],
      series: [
        { name: 'EBITDA', type: 'bar', yAxisIndex: 0, data: ebitdaData.map((v, i) => ({
            value: v, itemStyle: { color: _afRgba('#4338ca', _afOpacity(i, n, 0.2)) } })) },
        { name: 'Margen EBITDA %', type: 'line', yAxisIndex: 1, data: marginData,
          smooth: false, symbol: 'circle', symbolSize: 5,
          lineStyle: { color: '#f472b6', width: 2 }, itemStyle: { color: '#f472b6' } },
      ],
      tooltip: { ..._afTooltip() },
      legend: { data: ['EBITDA', 'Margen EBITDA %'], textStyle: { color: '#94a3b8', fontSize: 10, fontFamily: MONO },
        top: 4, right: 8 },
    });
  });

  // Chart 4: NI + EPS (dual axis)
  _afChartInit('af-chart-ni-eps', chart => {
    const niData2  = data.map(d => d.net_income ?? null);
    const epsData  = data.map(d => d.eps_diluted ?? null);
    chart.setOption({
      ..._afBaseOption(years),
      yAxis: [
        { type: 'value', axisLabel: { color: '#475569', fontFamily: MONO, fontSize: 9,
            formatter: v => `$${Math.abs(v) >= 1000 ? (v/1000).toFixed(0)+'B' : v.toFixed(0)+'M'}` },
          splitLine: { lineStyle: { color: 'rgba(255,255,255,.05)', type: 'dashed' } },
          axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } },
        { type: 'value', name: 'EPS', axisLabel: { color: '#475569', fontFamily: MONO, fontSize: 9, formatter: v => `$${v.toFixed(1)}` },
          splitLine: { show: false }, axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } },
      ],
      series: [
        { name: 'Net Income', type: 'bar', yAxisIndex: 0, data: niData2.map((v, i) => ({
            value: v, itemStyle: { color: _afRgba(v >= 0 ? '#0d9488' : '#ef4444', _afOpacity(i, n, 0.2)) } })) },
        { name: 'EPS Diluido', type: 'line', yAxisIndex: 1, data: epsData,
          smooth: false, symbol: 'circle', symbolSize: 5,
          lineStyle: { color: '#34d399', width: 2 }, itemStyle: { color: '#34d399' } },
      ],
      tooltip: { ..._afTooltip() },
      legend: { data: ['Net Income', 'EPS Diluido'], textStyle: { color: '#94a3b8', fontSize: 10, fontFamily: MONO },
        top: 4, right: 8 },
    });
  });
}


/* ════════════════════════════════════════════════════════════════════════════
   TAB 3: RENTABILIDAD
   ════════════════════════════════════════════════════════════════════════════ */

function _tabRentabilidad(container, ticker, data, metrics) {
  if (!data.length) { container.innerHTML = _afNoData('Sin datos financieros.'); return; }

  const last   = data[data.length - 1];
  const fy     = `FY${String(last.year).slice(2)}`;
  const fcfV   = last.fcf;
  const cfoV   = last.cfo;
  const roe    = metrics.roe_ttm ?? metrics.roe_annual;
  const roic   = metrics.roic_ttm;
  const roa    = metrics.roa_ttm;
  const ebitdaM = last.ebitda_margin;
  const fcfM   = last.fcf_margin;

  const cards = [
    ['FCF',          _afFmtB(_afM(fcfV)),  _marginStr(fcfV, last.revenue), last.fcf_yoy,  fcfV != null && fcfV < 0],
    ['Op Cash Flow', _afFmtB(_afM(cfoV)),  fy,                             null,           false],
    ['EBITDA Margin',ebitdaM != null ? `${ebitdaM.toFixed(1)}%` : '—', fy, null, ebitdaM < 0],
    ['FCF Margin',   fcfM   != null ? `${fcfM.toFixed(1)}%`    : '—', fy, null, false],
    ['ROE',          roe    != null ? `${roe.toFixed(1)}%`     : '—', 'TTM', null, roe < 0],
    ['ROIC',         roic   != null ? `${roic.toFixed(1)}%`    : '—', 'TTM', null, roic < 0],
  ];

  container.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
      ${cards.map((c, i) => _afKpiCard(c[0], c[1], c[2], c[3], _AF_RENT_COLORS[i % _AF_RENT_COLORS.length], c[4])).join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="bt2-panel" style="padding:12px">
        <div class="bt2-panel-hdr"><span class="bt2-panel-title">MÁRGENES HISTÓRICOS</span></div>
        <div id="af-chart-margenes" style="height:300px"></div>
      </div>
      <div class="bt2-panel" style="padding:12px">
        <div class="bt2-panel-hdr"><span class="bt2-panel-title">FCF y OP CASH FLOW</span></div>
        <div id="af-chart-fcf-cfo" style="height:300px"></div>
      </div>
      <div class="bt2-panel" style="padding:12px">
        <div class="bt2-panel-hdr"><span class="bt2-panel-title">RETORNOS DE CAPITAL</span></div>
        <div id="af-chart-retornos" style="height:300px"></div>
      </div>
      <div class="bt2-panel" style="padding:12px">
        <div class="bt2-panel-hdr"><span class="bt2-panel-title">FCF MARGIN HISTÓRICO</span></div>
        <div id="af-chart-fcf-margin" style="height:300px"></div>
      </div>
    </div>`;

  const years = data.map(d => `FY${String(d.year).slice(2)}`);

  // Márgenes históricos (líneas múltiples)
  _afChartInit('af-chart-margenes', chart => {
    chart.setOption({
      ..._afBaseOption(years),
      yAxis: [{ type: 'value', axisLabel: { color: '#475569', fontFamily: MONO, fontSize: 9, formatter: v => `${v.toFixed(0)}%` },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,.05)', type: 'dashed' } },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } }],
      legend: { data: ['Gross', 'EBIT', 'EBITDA', 'Net', 'FCF'],
        textStyle: { color: '#94a3b8', fontSize: 9, fontFamily: MONO }, top: 0, right: 8 },
      series: [
        { name: 'Gross',  type: 'line', data: data.map(d => d.gross_margin), symbol:'circle', symbolSize:4, lineStyle: {color:'#22d3ee', width:1.8}, itemStyle:{color:'#22d3ee'} },
        { name: 'EBIT',   type: 'line', data: data.map(d => d.ebit_margin),  symbol:'circle', symbolSize:4, lineStyle: {color:'#a78bfa', width:1.8}, itemStyle:{color:'#a78bfa'} },
        { name: 'EBITDA', type: 'line', data: data.map(d => d.ebitda_margin),symbol:'circle', symbolSize:4, lineStyle: {color:'#34d399', width:1.8}, itemStyle:{color:'#34d399'} },
        { name: 'Net',    type: 'line', data: data.map(d => d.net_margin),   symbol:'circle', symbolSize:4, lineStyle: {color:'#38bdf8', width:1.8}, itemStyle:{color:'#38bdf8'} },
        { name: 'FCF',    type: 'line', data: data.map(d => d.fcf_margin),   symbol:'circle', symbolSize:4, lineStyle: {color:'#f97316', width:1.8}, itemStyle:{color:'#f97316'} },
      ],
      tooltip: { ..._afTooltip(), valueFormatter: v => v != null ? `${Number(v).toFixed(1)}%` : '—' },
    });
  });

  // FCF y OCF
  _afChartInit('af-chart-fcf-cfo', chart => {
    const n = data.length;
    chart.setOption({
      ..._afBaseOption(years),
      yAxis: [{ type: 'value', axisLabel: { color: '#475569', fontFamily: MONO, fontSize: 9,
        formatter: v => `$${Math.abs(v) >= 1000 ? (v/1000).toFixed(0)+'B' : v.toFixed(0)+'M'}` },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,.05)', type: 'dashed' } },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } }],
      legend: { data: ['FCF', 'Op Cash Flow'], textStyle: { color: '#94a3b8', fontSize: 9, fontFamily: MONO }, top: 0, right: 8 },
      series: [
        { name: 'FCF', type: 'bar', data: data.map((d, i) => ({
            value: d.fcf ?? null, itemStyle: { color: _afRgba('#f97316', _afOpacity(i, n)) } })),
          barGap: '-30%', barCategoryGap: '40%' },
        { name: 'Op Cash Flow', type: 'bar', data: data.map((d, i) => ({
            value: d.cfo ?? null, itemStyle: { color: _afRgba('#22d3ee', _afOpacity(i, n, 0.2)) } })) },
      ],
      tooltip: { ..._afTooltip(), valueFormatter: v => v != null ? `$${v.toFixed(0)}M` : '—' },
    });
  });

  // Retornos de capital (ROE, ROA, ROIC desde metrics — solo puntos actuales si no hay histórico)
  _afChartInit('af-chart-retornos', chart => {
    // Para el histórico de retornos no tenemos datos por año (Finnhub metrics es TTM),
    // así que mostramos una barra comparativa de los ratios actuales
    const ratioLabels = ['ROE', 'ROA', 'ROIC', 'Gross Margin', 'EBITDA Margin', 'FCF Margin'];
    const ratioValues = [
      metrics.roe_ttm ?? metrics.roe_annual,
      metrics.roa_ttm,
      metrics.roic_ttm,
      metrics.gross_margin_ttm,
      metrics.ebitda_margin_ttm,
      metrics.fcf_margin_ttm,
    ];
    const ratioColors = ['#22d3ee', '#a78bfa', '#34d399', '#38bdf8', '#fbbf24', '#f97316'];
    chart.setOption({
      grid: { left: 80, right: 20, top: 12, bottom: 24 },
      xAxis: { type: 'value', axisLabel: { color: '#475569', fontFamily: MONO, fontSize: 9, formatter: v => `${v.toFixed(0)}%` },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,.05)', type: 'dashed' } },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } },
      yAxis: { type: 'category', data: ratioLabels,
        axisLabel: { color: '#94a3b8', fontFamily: MONO, fontSize: 9.5 },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } }, splitLine: { show: false } },
      series: [{ type: 'bar', data: ratioValues.map((v, i) => ({
          value: v ?? 0, itemStyle: { color: ratioColors[i] } })),
        barMaxWidth: 28,
        label: { show: true, position: 'right', color: '#94a3b8', fontFamily: MONO, fontSize: 9,
          formatter: p => p.value != null && p.value !== 0 ? `${Number(p.value).toFixed(1)}%` : '—' } }],
      tooltip: { ..._afTooltip(), valueFormatter: v => `${Number(v).toFixed(1)}%` },
      backgroundColor: 'transparent',
    });
  });

  // FCF Margin histórico (línea con fill)
  _afChartInit('af-chart-fcf-margin', chart => {
    const fcfMData = data.map(d => d.fcf_margin ?? null);
    chart.setOption({
      ..._afBaseOption(years),
      yAxis: [{ type: 'value', axisLabel: { color: '#475569', fontFamily: MONO, fontSize: 9, formatter: v => `${v.toFixed(0)}%` },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,.05)', type: 'dashed' } },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } }],
      series: [{ name: 'FCF Margin', type: 'line', data: fcfMData,
        smooth: false, symbol: 'circle', symbolSize: 6,
        lineStyle: { color: '#f97316', width: 2.2 }, itemStyle: { color: '#f97316' },
        areaStyle: { color: 'rgba(249,115,22,.08)' } }],
      tooltip: { ..._afTooltip(), valueFormatter: v => v != null ? `${Number(v).toFixed(1)}%` : '—' },
    });
  });
}


/* ════════════════════════════════════════════════════════════════════════════
   TAB 4: FINANCIERA
   ════════════════════════════════════════════════════════════════════════════ */

function _tabFinanciera(container, ticker, data) {
  if (!data.length) { container.innerHTML = _afNoData('Sin datos financieros.'); return; }

  const last  = data[data.length - 1];
  const prev  = data.length > 1 ? data[data.length - 2] : null;
  const fy    = `FY${String(last.year).slice(2)}`;

  const cash     = last.cash;
  const debt     = last.total_debt;
  const netCash  = last.net_cash;
  const assets   = last.total_assets;
  const equity   = last.equity;
  const de       = last.de_ratio;
  const fcf      = last.fcf;
  const capex    = last.capex;

  const _yoy = (curr, prevVal) => {
    if (curr == null || prevVal == null || prevVal === 0) return null;
    return ((curr - prevVal) / Math.abs(prevVal) * 100);
  };

  const cashYoy = _yoy(cash,    prev?.cash);
  const ncYoy   = _yoy(netCash, prev?.net_cash);
  const ncNeg   = netCash != null && netCash < 0;
  const ncSub   = ncNeg ? 'Net Debt' : 'Posición positiva';

  const cards = [
    ['Cash & Equiv.', _afFmtB(_afM(cash)),                   fy,          cashYoy, false],
    ['Deuda Total',   _afFmtB(_afM(debt)),                   fy,          null,    false],
    ['Net Cash',      _afFmtB(_afM(netCash)),                ncSub,       ncYoy,   ncNeg],
    ['Total Assets',  _afFmtB(_afM(assets)),                 fy,          null,    false],
    ['Equity',        _afFmtB(_afM(equity)),                 fy,          null,    false],
    ['Deuda/Equity',  de != null ? `${de.toFixed(2)}x` : '—', 'Leverage', null,    false],
    ['FCF',           _afFmtB(_afM(fcf)),                    _marginStr(fcf, last.revenue), null, fcf != null && fcf < 0],
    ['Capex',         capex != null ? _afFmtB(_afM(capex)) : '—', 'Inversión', null, false],
  ];

  container.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
      ${cards.map((c, i) => _afKpiCard(c[0], c[1], c[2], c[3], _AF_FIN_COLORS[i % _AF_FIN_COLORS.length], c[4])).join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="bt2-panel" style="padding:12px">
        <div class="bt2-panel-hdr"><span class="bt2-panel-title">CASH vs DEUDA TOTAL</span></div>
        <div id="af-chart-cash-debt" style="height:300px"></div>
      </div>
      <div class="bt2-panel" style="padding:12px">
        <div class="bt2-panel-hdr"><span class="bt2-panel-title">NET CASH / NET DEBT</span></div>
        <div id="af-chart-net-cash" style="height:300px"></div>
      </div>
      <div class="bt2-panel" style="padding:12px">
        <div class="bt2-panel-hdr"><span class="bt2-panel-title">ASSETS vs EQUITY</span></div>
        <div id="af-chart-assets-eq" style="height:300px"></div>
      </div>
      <div class="bt2-panel" style="padding:12px">
        <div class="bt2-panel-hdr"><span class="bt2-panel-title">FCF vs CAPEX</span></div>
        <div id="af-chart-fcf-capex" style="height:300px"></div>
      </div>
    </div>`;

  const years = data.map(d => `FY${String(d.year).slice(2)}`);
  const n = data.length;

  _afChartInit('af-chart-cash-debt', chart => {
    chart.setOption({
      ..._afBaseOption(years),
      yAxis: [{ type: 'value', axisLabel: { color: '#475569', fontFamily: MONO, fontSize: 9,
        formatter: v => `$${Math.abs(v) >= 1000 ? (v/1000).toFixed(0)+'B' : v.toFixed(0)+'M'}` },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,.05)', type: 'dashed' } },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } }],
      legend: { data: ['Cash', 'Deuda'], textStyle: { color: '#94a3b8', fontSize: 9, fontFamily: MONO }, top: 0, right: 8 },
      series: [
        { name: 'Cash',  type: 'bar', data: data.map((d, i) => ({ value: d.cash ?? null,
            itemStyle: { color: _afRgba('#22d3ee', _afOpacity(i, n)) } })), barGap: '-30%', barCategoryGap: '40%' },
        { name: 'Deuda', type: 'bar', data: data.map((d, i) => ({ value: d.total_debt ?? null,
            itemStyle: { color: _afRgba('#ef4444', _afOpacity(i, n, 0.2)) } })) },
      ],
      tooltip: { ..._afTooltip(), valueFormatter: v => v != null ? `$${v.toFixed(0)}M` : '—' },
    });
  });

  _afChartInit('af-chart-net-cash', chart => {
    chart.setOption({
      ..._afBaseOption(years),
      yAxis: [{ type: 'value', axisLabel: { color: '#475569', fontFamily: MONO, fontSize: 9,
        formatter: v => `$${Math.abs(v) >= 1000 ? (v/1000).toFixed(0)+'B' : v.toFixed(0)+'M'}` },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,.05)', type: 'dashed' } },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } }],
      series: [{ name: 'Net Cash', type: 'bar', data: data.map((d, i) => ({
          value: d.net_cash ?? null,
          itemStyle: { color: _afRgba(d.net_cash >= 0 ? '#22c55e' : '#ef4444', _afOpacity(i, n)) } })) }],
      tooltip: { ..._afTooltip(), valueFormatter: v => v != null ? `$${v.toFixed(0)}M` : '—' },
    });
  });

  _afChartInit('af-chart-assets-eq', chart => {
    chart.setOption({
      ..._afBaseOption(years),
      yAxis: [{ type: 'value', axisLabel: { color: '#475569', fontFamily: MONO, fontSize: 9,
        formatter: v => `$${Math.abs(v) >= 1000 ? (v/1000).toFixed(0)+'B' : v.toFixed(0)+'M'}` },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,.05)', type: 'dashed' } },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } }],
      legend: { data: ['Total Assets', 'Equity'], textStyle: { color: '#94a3b8', fontSize: 9, fontFamily: MONO }, top: 0, right: 8 },
      series: [
        { name: 'Total Assets', type: 'bar', data: data.map((d, i) => ({ value: d.total_assets ?? null,
            itemStyle: { color: _afRgba('#a78bfa', _afOpacity(i, n, 0.2)) } })), barGap: '-30%', barCategoryGap: '40%' },
        { name: 'Equity', type: 'bar', data: data.map((d, i) => ({ value: d.equity ?? null,
            itemStyle: { color: _afRgba('#34d399', _afOpacity(i, n)) } })) },
      ],
      tooltip: { ..._afTooltip(), valueFormatter: v => v != null ? `$${v.toFixed(0)}M` : '—' },
    });
  });

  _afChartInit('af-chart-fcf-capex', chart => {
    chart.setOption({
      ..._afBaseOption(years),
      yAxis: [{ type: 'value', axisLabel: { color: '#475569', fontFamily: MONO, fontSize: 9,
        formatter: v => `$${Math.abs(v) >= 1000 ? (v/1000).toFixed(0)+'B' : v.toFixed(0)+'M'}` },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,.05)', type: 'dashed' } },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } }],
      legend: { data: ['FCF', 'Capex'], textStyle: { color: '#94a3b8', fontSize: 9, fontFamily: MONO }, top: 0, right: 8 },
      series: [
        { name: 'FCF', type: 'bar', data: data.map((d, i) => ({ value: d.fcf ?? null,
            itemStyle: { color: _afRgba('#f97316', _afOpacity(i, n)) } })), barGap: '-30%', barCategoryGap: '40%' },
        { name: 'Capex', type: 'bar', data: data.map((d, i) => ({ value: -(d.capex ?? 0),
            itemStyle: { color: _afRgba('#94a3b8', _afOpacity(i, n, 0.2)) } })) },
      ],
      tooltip: { ..._afTooltip(), valueFormatter: v => v != null ? `$${v.toFixed(0)}M` : '—' },
    });
  });
}


/* ════════════════════════════════════════════════════════════════════════════
   TAB 5: VALUACIÓN
   ════════════════════════════════════════════════════════════════════════════ */

function _tabValuacion(container, ticker, data, metrics, profile, candles) {
  const last    = data.length ? data[data.length - 1] : null;
  const mcapM   = profile.market_cap;   // millones USD
  const shares  = profile.shares;       // millones de acciones
  const mcapUSD = mcapM ? mcapM * 1e6 : null;
  const netCash = last?.net_cash;       // millones
  const evUSD   = (mcapUSD != null && netCash != null)
                    ? mcapUSD - (netCash * 1e6)
                    : mcapUSD;

  // Múltiplos desde metrics (yfinance)
  const pe      = metrics.pe_ttm ?? metrics.pe_forward;
  const ps      = metrics.ps_ttm;
  const pb      = metrics.pb_annual;
  const evEbitda = metrics.ev_ebitda_ttm;   // puede ser negativo (CRWD tiene EBITDA < 0)
  const evSalesM = metrics.ev_sales_ttm;
  const pfcf    = (mcapM && metrics.fcf_ttm_m && metrics.fcf_ttm_m > 0)
                    ? (mcapM / metrics.fcf_ttm_m) : null;

  // Calcular EV/Sales desde datos propios si no viene de metrics
  const lastRev  = last?.revenue;
  const evSales  = evSalesM ?? ((evUSD && lastRev && lastRev > 0) ? evUSD / (lastRev * 1e6) : null);

  // Price target y upside (calculados en backend desde yfinance consensus)
  const targetPrice = metrics.target_price;
  const upside      = metrics.upside;

  const _multFmt = v => v != null ? `${Number(v).toFixed(1)}x` : '—';
  const _pctFmt  = v => v != null ? `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)}%` : '—';

  // EV/EBITDA: si es muy negativo (empresa sin EBITDA positivo), mostrar "N/A"
  const evEbitdaStr = evEbitda != null
    ? (Math.abs(evEbitda) > 999 ? 'N/A¹' : `${Number(evEbitda).toFixed(1)}x`)
    : '—';

  const kpiCards = [
    ['Market Cap', mcapUSD != null ? _afFmtB(mcapUSD) : '—',   '—', null, false],
    ['EV',         evUSD   != null ? _afFmtB(evUSD)   : '—',   '—', null, false],
    ['P/E TTM',    _multFmt(pe),          pe != null ? 'trailing' : '—',  null, false],
    ['P/FCF',      _multFmt(pfcf),        pfcf != null ? 'trailing' : '—', null, false],
    ['P/S TTM',    _multFmt(ps),          '—', null, false],
    ['EV/EBITDA',  evEbitdaStr,           '—', null, false],
  ];

  // Si hay price target, agregar cards
  const targetCards = (targetPrice != null) ? `
    <div class="bt2-panel" style="padding:14px 18px;margin-bottom:14px">
      <div style="font-size:.60rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
        color:#475569;margin-bottom:10px;font-family:${MONO}">CONSENSO DE ANALISTAS</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:130px">
          <div style="font-size:.60rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
            color:#475569;margin-bottom:4px;font-family:${MONO}">PRECIO TARGET</div>
          <div style="font-size:1.3rem;font-weight:700;color:${_AF_GOLD};font-family:${MONO}">
            $${Number(targetPrice).toFixed(2)}
          </div>
        </div>
        <div style="flex:1;min-width:130px">
          <div style="font-size:.60rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
            color:#475569;margin-bottom:4px;font-family:${MONO}">UPSIDE POTENCIAL</div>
          <div style="font-size:1.3rem;font-weight:700;
            color:${upside != null ? (upside >= 0 ? '#22c55e' : '#ef4444') : '#94a3b8'};
            font-family:${MONO}">
            ${upside != null ? _pctFmt(upside) : '—'}
          </div>
        </div>
        ${metrics.recommendation ? `
        <div style="flex:1;min-width:130px">
          <div style="font-size:.60rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
            color:#475569;margin-bottom:4px;font-family:${MONO}">RECOMENDACIÓN</div>
          <div style="font-size:.95rem;font-weight:700;color:#f1f5f9;text-transform:uppercase;
            font-family:${MONO}">${metrics.recommendation.replace(/_/g, ' ')}
            ${metrics.num_analysts ? `<span style="color:#475569;font-size:.68rem;font-weight:400">
              (${metrics.num_analysts} analistas)</span>` : ''}
          </div>
        </div>` : ''}
      </div>
    </div>` : '';

  // Promedio histórico para P/E y P/S
  const histPeAvg  = _afHistAvg(data, mcapUSD, 'net_income');
  const histPsAvg  = _afHistAvg(data, mcapUSD, 'revenue');

  const multCards = [
    { label: 'P/E',      curr: pe,     histAvg: histPeAvg },
    { label: 'P/S',      curr: ps,     histAvg: histPsAvg },
    { label: 'P/B',      curr: pb,     histAvg: null },
    { label: 'P/FCF',    curr: pfcf,   histAvg: null },
    { label: 'EV/Sales', curr: typeof evSales === 'number' ? evSales : null, histAvg: null },
  ];

  const hasCandles = candles?.status === 'ok' && candles?.dates?.length > 0;

  container.innerHTML = `
    <!-- KPI cards superiores -->
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">
      ${kpiCards.map((c, i) => _afKpiCard(c[0], c[1], c[2], c[3],
          _AF_VAL_COLORS[i % _AF_VAL_COLORS.length], c[4])).join('')}
    </div>

    ${targetCards}

    <!-- Múltiplos vs histórico -->
    <div style="font-size:.60rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
      color:#475569;margin-bottom:8px;font-family:${MONO}">MÚLTIPLOS VS PROMEDIO HISTÓRICO</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
      ${multCards.map(m => _afMultCard(m.label, m.curr, m.histAvg)).join('')}
    </div>

    <!-- Gráficos 2×2 -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="bt2-panel" style="padding:12px">
        <div class="bt2-panel-hdr"><span class="bt2-panel-title">P/E HISTÓRICO</span></div>
        <div id="af-chart-pe" style="height:300px"></div>
      </div>
      <div class="bt2-panel" style="padding:12px">
        <div class="bt2-panel-hdr"><span class="bt2-panel-title">P/S y P/FCF HISTÓRICO</span></div>
        <div id="af-chart-ps-pfcf" style="height:300px"></div>
      </div>
      <div class="bt2-panel" style="padding:12px">
        <div class="bt2-panel-hdr"><span class="bt2-panel-title">MARKET CAP (HIST.)</span></div>
        <div id="af-chart-mcap" style="height:300px"></div>
      </div>
      <div class="bt2-panel" style="padding:12px">
        <div class="bt2-panel-hdr">
          <span class="bt2-panel-title">PRECIO HISTÓRICO (SEMANAL)</span>
          ${hasCandles ? `<span class="bt2-panel-sub">${candles.dates.at(-1)?.slice(0,10)} — ${candles.closes.at(-1)?.toFixed(2)} USD</span>` : ''}
        </div>
        <div id="af-chart-precio" style="height:300px"></div>
      </div>
    </div>
    ${evEbitdaStr === 'N/A¹' ? `<div style="font-family:${MONO};font-size:.65rem;color:#475569;margin-top:8px">
      ¹ EV/EBITDA no aplica cuando el EBITDA estimado es negativo (empresa en fase de crecimiento/pérdida operativa).
    </div>` : ''}`;

  const years    = data.map(d => `FY${String(d.year).slice(2)}`);
  const n        = data.length;
  const histMult = _afComputeHistMult(data, candles, shares);

  // P/E histórico
  const peHist    = histMult.map(h => (h.pe && h.pe > 0 && h.pe < 500) ? h.pe : null);
  const hasHistPe = peHist.some(v => v != null);
  _afChartInit('af-chart-pe', chart => {
    chart.setOption({
      ..._afBaseOption(years),
      yAxis: [{ type: 'value',
        axisLabel: { color: '#475569', fontFamily: MONO, fontSize: 9, formatter: v => `${v.toFixed(0)}x` },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,.05)', type: 'dashed' } },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } }],
      series: hasHistPe
        ? [{ name: 'P/E', type: 'line', data: peHist, smooth: false, symbol: 'circle', symbolSize: 5,
             lineStyle: { color: '#22d3ee', width: 2.2 }, itemStyle: { color: '#22d3ee' } }]
        : (pe && pe > 0 && pe < 500)
          ? [{ name: 'P/E TTM', type: 'scatter', data: [[years.at(-1), pe]],
               symbolSize: 10, itemStyle: { color: '#22d3ee' } }]
          : [],
      tooltip: { ..._afTooltip(), valueFormatter: v => v != null ? `${Number(v).toFixed(1)}x` : '—' },
    });
  }, { hasData: hasHistPe || (pe != null && pe > 0 && pe < 500),
       emptyMsg: 'P/E no disponible (empresa no rentable o múltiplo extremo)' });

  // P/S y P/FCF histórico
  const psHist   = histMult.map(h => (h.ps   && h.ps   < 500)  ? h.ps   : null);
  const pfcfHist = histMult.map(h => (h.pfcf && h.pfcf < 1000) ? h.pfcf : null);
  const hasPsData = psHist.some(v => v != null) || pfcfHist.some(v => v != null);
  _afChartInit('af-chart-ps-pfcf', chart => {
    chart.setOption({
      ..._afBaseOption(years),
      yAxis: [{ type: 'value',
        axisLabel: { color: '#475569', fontFamily: MONO, fontSize: 9, formatter: v => `${v.toFixed(0)}x` },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,.05)', type: 'dashed' } },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } }],
      legend: { data: ['P/S', 'P/FCF'], textStyle: { color: '#94a3b8', fontSize: 9, fontFamily: MONO }, top: 0, right: 8 },
      series: [
        { name: 'P/S',   type: 'line', data: psHist,   smooth: false, symbol: 'circle', symbolSize: 5,
          lineStyle: { color: '#22d3ee', width: 2 }, itemStyle: { color: '#22d3ee' } },
        { name: 'P/FCF', type: 'line', data: pfcfHist, smooth: false, symbol: 'circle', symbolSize: 5,
          lineStyle: { color: '#a78bfa', width: 2, type: 'dashed' }, itemStyle: { color: '#a78bfa' } },
      ],
      tooltip: { ..._afTooltip(), valueFormatter: v => v != null ? `${Number(v).toFixed(1)}x` : '—' },
    });
  }, { hasData: hasPsData, emptyMsg: 'Sin histórico de P/S o P/FCF disponible' });

  // Market Cap histórico
  const mcapHist    = histMult.map(h => h.hist_mcap ? h.hist_mcap / 1e9 : null);
  const hasMcapData = mcapHist.some(v => v != null);
  _afChartInit('af-chart-mcap', chart => {
    chart.setOption({
      ..._afBaseOption(years),
      yAxis: [{ type: 'value',
        axisLabel: { color: '#475569', fontFamily: MONO, fontSize: 9, formatter: v => `$${v.toFixed(0)}B` },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,.05)', type: 'dashed' } },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } }],
      series: [{ name: 'Market Cap', type: 'bar',
        data: mcapHist.map((v, i) => ({ value: v, itemStyle: { color: _afRgba('#22d3ee', _afOpacity(i, n)) } })) }],
      tooltip: { ..._afTooltip(), valueFormatter: v => v != null ? `$${Number(v).toFixed(1)}B` : '—' },
    });
  }, { hasData: hasMcapData || mcapUSD != null,
       emptyMsg: 'Sin datos de capitalización histórica' });

  // Precio histórico semanal
  _afChartInit('af-chart-precio', chart => {
    chart.setOption({
      grid: { left: 12, right: 12, top: 8, bottom: 24, containLabel: true },
      xAxis: { type: 'category', data: candles.dates, boundaryGap: false,
        axisLabel: { color: '#475569', fontFamily: MONO, fontSize: 8.5,
          formatter: d => d.slice(0, 7),
          interval: Math.max(0, Math.floor(candles.dates.length / 8) - 1) },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } }, splitLine: { show: false } },
      yAxis: { type: 'value',
        axisLabel: { color: '#475569', fontFamily: MONO, fontSize: 9,
          formatter: v => `$${v >= 1000 ? (v/1000).toFixed(0)+'K' : v.toFixed(0)}` },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,.05)', type: 'dashed' } },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } },
      series: [{ name: ticker, type: 'line', data: candles.closes,
        smooth: false, symbol: 'none',
        lineStyle: { color: '#a78bfa', width: 1.5 },
        areaStyle: { color: 'rgba(167,139,250,.07)' } }],
      tooltip: { trigger: 'axis', backgroundColor: '#0d1424',
        borderColor: 'rgba(255,255,255,.12)', borderWidth: 1, padding: [8, 12],
        textStyle: { fontFamily: MONO, fontSize: 11, color: '#f1f5f9' },
        formatter: params => {
          const p = params[0];
          return `<div style="font-family:${MONO};font-size:10px">
            <div style="color:#94a3b8;margin-bottom:4px">${p.axisValue}</div>
            <div style="font-weight:700;color:#a78bfa">$${Number(p.value).toFixed(2)}</div>
          </div>`;
        } },
      backgroundColor: 'transparent',
    });
  }, { hasData: hasCandles, emptyMsg: 'Sin datos de precio histórico disponibles para este ticker' });
}


/* ── Helpers ─────────────────────────────────────────────────────────────── */

// Convierte millones → dólares y formatea. Acepta null → '—'
function _afM(v) { return v != null ? v * 1e6 : null; }

function _afFmtB(usdRaw) {
  if (usdRaw == null) return '—';
  const abs = Math.abs(usdRaw);
  const sign = usdRaw < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(1)}T`;
  if (abs >= 1e9)  return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6)  return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3)  return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function _marginStr(num, den) {
  if (num == null || den == null || den === 0) return '';
  return `Margen ${(num / den * 100).toFixed(1)}%`;
}

function _afRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
}

function _afOpacity(i, n, minOp = 0.25) {
  if (n <= 1) return 1.0;
  return minOp + (1.0 - minOp) * i / (n - 1);
}

function _afKpiCard(label, value, sub, delta, color, valueIsNeg = false) {
  let badge = '';
  if (delta != null) {
    const vIsNeg = valueIsNeg || false;
    const col  = vIsNeg ? '#ef4444' : (delta >= 0 ? '#22c55e' : '#ef4444');
    const bg   = vIsNeg ? 'rgba(239,68,68,.12)' : (delta >= 0 ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)');
    const arrow= vIsNeg ? '▼' : (delta >= 0 ? '▲' : '▼');
    const sign = delta >= 0 ? '+' : '';
    const d    = Math.abs(delta) >= 100 ? delta.toFixed(0) : delta.toFixed(1);
    badge = `<span style="background:${bg};color:${col};border:1px solid ${col}33;
      border-radius:4px;padding:1px 5px;font-size:.68rem;font-weight:700;
      margin-left:4px;white-space:nowrap;font-family:${MONO}">${arrow} ${sign}${d}%</span>`;
  }
  const vlen  = String(value).length;
  const vfont = vlen > 8 ? '1.00rem' : vlen > 6 ? '1.15rem' : '1.25rem';

  return `<div style="flex:1;min-width:110px;background:linear-gradient(145deg,#0d1424,#111d35);
    border:1px solid rgba(148,163,184,.10);border-top:2px solid ${color};
    border-radius:10px;padding:12px 14px;overflow:hidden">
    <div style="font-size:.60rem;font-weight:700;letter-spacing:.10em;text-transform:uppercase;
      color:#475569;margin-bottom:5px;white-space:nowrap;font-family:${MONO}">${label}</div>
    <div style="font-size:${vfont};font-weight:700;color:#f1f5f9;line-height:1.1;
      white-space:nowrap;font-family:${MONO}">${value}</div>
    <div style="margin-top:5px;font-size:.70rem;color:#94a3b8;display:flex;align-items:center;
      flex-wrap:wrap;gap:3px;font-family:${MONO}">
      <span>${sub || ''}</span>${badge}
    </div>
  </div>`;
}

function _afMultCard(label, curr, histAvg) {
  let valStr = '—';
  let compEl = '<span style="color:#475569;font-size:.72rem">Sin histórico</span>';

  if (curr != null) {
    valStr = `${Number(curr).toFixed(1)}x`;
    if (histAvg != null && histAvg > 0) {
      const diff = (curr - histAvg) / histAvg * 100;
      const color = diff > 0 ? '#f97316' : '#22c55e';
      const arrow = diff > 0 ? '▲' : '▼';
      compEl = `<span style="color:${color};font-size:.72rem;font-weight:600;font-family:${MONO}">
        ${arrow} ${Math.abs(diff).toFixed(1)}% vs hist (${histAvg.toFixed(1)}x)</span>`;
    }
  }

  return `<div style="flex:1;min-width:150px;background:#0d1424;border:1px solid rgba(148,163,184,.10);
    border-radius:10px;padding:12px 16px">
    <div style="font-size:.60rem;font-weight:700;letter-spacing:.10em;text-transform:uppercase;
      color:#475569;margin-bottom:6px;font-family:${MONO}">${label}</div>
    <div style="font-size:1.3rem;font-weight:700;color:#f1f5f9;font-family:${MONO}">${valStr}</div>
    <div style="margin-top:4px">${compEl}</div>
  </div>`;
}

function _afHistAvg(data, mcapUSD, col) {
  if (!mcapUSD || !data.length) return null;
  const vals = data.slice(-5).map(d => {
    const v = d[col];
    if (!v || v <= 0) return null;
    return mcapUSD / (v * 1e6);
  }).filter(v => v != null && isFinite(v));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function _afComputeHistMult(data, candles, sharesMM) {
  if (!candles?.dates?.length || !sharesMM || !data.length) {
    return data.map(d => ({ year: d.year, hist_mcap: null, ps: null, pfcf: null, pe: null }));
  }
  const cTimes = candles.dates.map(d => new Date(d).getTime());
  return data.map(d => {
    const fyEnd = new Date(d.year, 11, 31).getTime();
    let best = 0, bestDiff = Infinity;
    cTimes.forEach((t, i) => {
      const diff = Math.abs(t - fyEnd);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    });
    const price     = candles.closes[best];
    const histMcap  = price * sharesMM * 1e6;
    return {
      year:       d.year,
      hist_mcap:  histMcap,
      ps:    d.revenue   && d.revenue   > 0 ? histMcap / (d.revenue   * 1e6) : null,
      pfcf:  d.fcf       && d.fcf       > 0 ? histMcap / (d.fcf       * 1e6) : null,
      pe:    d.net_income && d.net_income > 0 ? histMcap / (d.net_income * 1e6) : null,
    };
  });
}

function _afNoData(msg) {
  return `<div class="bt2-panel" style="padding:24px;text-align:center">
    <div style="font-family:${MONO};color:var(--bt2-sub);font-size:.80rem">${msg}</div>
  </div>`;
}

function _afBaseOption(xData) {
  return {
    grid: { left: 12, right: 20, top: 28, bottom: 24, containLabel: true },
    xAxis: [{
      type: 'category', data: xData, boundaryGap: true,
      axisLabel: { color: '#475569', fontFamily: MONO, fontSize: 9.5 },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } }, splitLine: { show: false },
    }],
    backgroundColor: 'transparent',
  };
}

function _afTooltip() {
  return {
    trigger: 'axis',
    backgroundColor: '#0d1424',
    borderColor: 'rgba(255,255,255,.12)',
    borderWidth: 1,
    padding: [10, 14],
    textStyle: { fontFamily: MONO, fontSize: 11, color: '#f1f5f9' },
    axisPointer: { lineStyle: { color: 'rgba(255,255,255,.12)' } },
  };
}

/**
 * Inicializa un gráfico ECharts en el elemento con el ID dado.
 * Si hasData es false, muestra emptyMsg como texto en lugar del chart.
 * Usa requestAnimationFrame para garantizar que el layout CSS esté listo.
 */
function _afChartInit(domId, configureFn, { hasData = true, emptyMsg = 'Sin datos disponibles' } = {}) {
  const el = document.getElementById(domId);
  if (!el) return;

  const existing = echarts.getInstanceByDom(el);
  if (existing) existing.dispose();

  if (!hasData) {
    el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;
      height:100%;font-family:${MONO};color:#475569;font-size:.75rem;
      padding:16px;text-align:center">${emptyMsg}</div>`;
    return;
  }

  requestAnimationFrame(() => {
    const chart = echarts.init(el, 'dcf');
    try {
      configureFn(chart);
    } catch (e) {
      console.warn(`[AF] chart ${domId} error:`, e);
      el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;
        height:100%;font-family:${MONO};color:#475569;font-size:.75rem;padding:16px">
        Error al renderizar el gráfico</div>`;
      return;
    }
    chart.resize();
    new ResizeObserver(() => { try { chart.resize(); } catch (_) {} }).observe(el);
  });
}
