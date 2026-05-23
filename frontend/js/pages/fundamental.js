/* ─── Análisis Fundamental v4 — Visual refinement ───────────────────────────
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
  { id: 'ranking',      label: 'Ranking IA',   icon: '⭐' },
  { id: 'comparar',     label: 'Comparar',     icon: '⚡' },
];

const _AF_MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];


/* ══════════════════════════════════════════════════════════════════════════
   ENTRADA DE LA PÁGINA
   ══════════════════════════════════════════════════════════════════════════ */

(window.pages = window.pages || {}).fundamental = async function(container) {
  container.innerHTML = `
    <div class="bt2-page" id="af-root">
      <!-- Page header -->
      <div style="margin-bottom:12px">
        <h1 style="font-size:1.20rem;font-weight:700;color:${_G};letter-spacing:-.02em;margin:0 0 2px">
          Análisis Fundamental
        </h1>
        <div style="font-family:${_MONO};font-size:.68rem;color:#4A5F75">
          US Equities · 13 compañías curadas · yfinance + Finnhub
        </div>
      </div>

      <!-- Ticker selector -->
      <div style="margin-bottom:14px">
        <div style="font-family:${_MONO};font-size:.57rem;color:#4A5F75;text-transform:uppercase;
          letter-spacing:.09em;font-weight:700;margin-bottom:6px">Tickers curados</div>
        <div id="af-pills" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px"></div>
        <div style="display:flex;gap:6px;align-items:center">
          <input class="dcf-input" id="af-input"
            placeholder="Buscar cualquier ticker US…"
            style="width:240px;font-family:${_MONO};font-size:.76rem"/>
          <button id="af-search"
            style="background:${_GD};border:1px solid ${_GB};color:${_G};
              padding:4px 12px;border-radius:6px;font-family:${_MONO};font-size:.70rem;
              font-weight:700;cursor:pointer;white-space:nowrap;letter-spacing:.04em">BUSCAR</button>
        </div>
      </div>

      <!-- Contenido principal -->
      <div id="af-main"></div>

      <!-- Disclaimer compacto -->
      <div style="margin-top:10px;padding:6px 10px;background:rgba(245,158,11,.04);
        border:1px solid rgba(245,158,11,.10);border-radius:6px;
        display:flex;gap:7px;align-items:flex-start">
        <span style="color:#F59E0B;font-size:.66rem;flex-shrink:0;margin-top:1px">⚠</span>
        <div style="font-family:${_MONO};font-size:.58rem;color:#4A5F75;line-height:1.35">
          Solo fines informativos. No constituye asesoramiento de inversión.
          Fuentes: yfinance · Finnhub · DCF Inversiones.
        </div>
      </div>
    </div>`;

  let _active  = null;
  let _cfgData = null;
  let _tabId   = 'negocio';

  try { _cfgData = await api.fundamental.config(); }
  catch (e) { _cfgData = { tickers: [], config: {} }; }

  const tickers = _cfgData.tickers || [];
  const pillsEl = document.getElementById('af-pills');
  tickers.forEach(tk => {
    const b = document.createElement('button');
    b.id = `af-p-${tk}`;
    b.textContent = tk;
    b.style.cssText = `background:rgba(212,175,55,.08);border:1px solid rgba(212,175,55,.18);
      color:#7F93AD;padding:3px 9px;border-radius:16px;font-family:${_MONO};
      font-size:.67rem;font-weight:700;cursor:pointer;transition:.12s;letter-spacing:.04em`;
    b.onmouseenter = () => { if (_active !== tk) b.style.borderColor = _GB; };
    b.onmouseleave = () => { if (_active !== tk) b.style.borderColor = 'rgba(212,175,55,.18)'; };
    b.onclick = () => _load(tk);
    pillsEl.appendChild(b);
  });

  document.getElementById('af-search')?.addEventListener('click', () => {
    const v = document.getElementById('af-input')?.value?.trim()?.toUpperCase();
    if (v) _load(v);
  });
  document.getElementById('af-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const v = e.target.value.trim().toUpperCase(); if (v) _load(v); }
  });

  _load('CRWD');

  async function _load(tk) {
    _active = tk;
    _afSetPillActive(tickers, tk);
    const main = document.getElementById('af-main');
    main.innerHTML = `<div style="padding:16px 0">
      ${[1,2,3].map(()=>`<div class="skeleton" style="height:44px;border-radius:6px;margin-bottom:7px"></div>`).join('')}
      <div class="skeleton" style="height:200px;border-radius:8px;margin-top:12px"></div></div>`;

    try {
      const [p, f, c] = await Promise.allSettled([
        api.fundamental.perfil(tk),
        api.fundamental.financieros(tk),
        api.fundamental.candles(tk, 'W'),
      ]);
      const perfil      = p.status === 'fulfilled' ? p.value : {};
      const financieros = f.status === 'fulfilled' ? f.value : { data: [] };
      const candles     = c.status === 'fulfilled' ? c.value : { status: 'no_data', dates: [], closes: [] };
      const cfg = (_cfgData?.config || {})[tk] || {};
      if (cfg.description && !perfil.description) perfil.description = cfg.description;
      if (cfg.tags?.length && !perfil.tags?.length)  perfil.tags = cfg.tags;
      _renderFull(main, tk, perfil, financieros, candles);
    } catch (e) {
      main.innerHTML = `<div class="bt2-panel" style="padding:20px;color:var(--negative)">
        ✕ Error cargando ${tk}: ${e.message || 'error desconocido'}</div>`;
    }
  }

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
    const bar = el.querySelector('div');
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
          b.style.border = `1px solid ${a ? 'rgba(36,54,77,1)' : 'transparent'}`;
          b.style.color  = a ? '#C8D8E8' : '#4A5F75';
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
  const exchange = (profile.exchange||'—').replace('NASDAQ NMS - GLOBAL MARKET','NASDAQ');
  const facts = [
    ['Sector',    profile.sector||'—'],
    ['Industria', profile.industry||'—'],
    ['Exchange',  exchange],
    ['País',      profile.country||'—'],
    ['Moneda',    profile.currency||'—'],
    ['IPO',       (profile.ipo_date||'').slice(0,10)||'—'],
    ['Empleados', profile.employees?`~${Number(profile.employees).toLocaleString('es-AR')}`:'—'],
    ['Div. Yield',profile.dividend_yield!=null?`${profile.dividend_yield.toFixed(2)}%`:'—'],
    ['FY End',    _fyStr(last)],
    ['Website',   profile.website?`<a href="${profile.website}" target="_blank"
      style="color:${_CY};text-decoration:none;font-size:.76rem">${profile.website.replace('https://','')}</a>`:'—'],
  ];

  const ratios = [
    ['P/E TTM',     metrics.pe_ttm,      'x'],
    ['P/E Forward', metrics.pe_forward,  'x'],
    ['P/S TTM',     metrics.ps_ttm,      'x'],
    ['P/B',         metrics.pb_annual,   'x'],
    ['EV/EBITDA',   metrics.ev_ebitda_ttm,'x',true],
    ['EV/Sales',    metrics.ev_sales_ttm,'x'],
    ['ROE TTM',     metrics.roe_ttm,     '%'],
    ['ROA TTM',     metrics.roa_ttm,     '%'],
    ['Gross Margin',metrics.gross_margin_ttm,'%'],
    ['EBITDA Margin',metrics.ebitda_margin_ttm,'%'],
    ['Net Margin',  metrics.net_margin_ttm,'%'],
    ['Beta',        metrics.beta,         ''],
  ].map(([l,val,suf,clamp])=>{
    const v   = val!=null?Number(val):null;
    const isNa= clamp&&v!=null&&Math.abs(v)>500;
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

// KPI card compacta para Negocio
function _kpiN(label, value, sub, badge, color, negVal=false) {
  let badgeHtml='';
  if(badge!=null){
    const col=negVal?_RE:(badge>=0?_GR:_RE);
    const bg =negVal?'rgba(248,113,113,.10)':(badge>=0?'rgba(52,211,153,.10)':'rgba(248,113,113,.10)');
    const arr=badge>=0?'▲':'▼';
    const d  =Math.abs(badge)>=100?badge.toFixed(0):badge.toFixed(1);
    badgeHtml=`<span style="background:${bg};color:${col};border:1px solid ${col}28;
      border-radius:3px;padding:1px 4px;font-size:.53rem;font-weight:700;
      margin-left:3px;white-space:nowrap;font-family:${_MONO}">${arr} ${badge>=0?'+':''}${d}%</span>`;
  }
  const vlen=String(value).length;
  const vfont=vlen>9?'.84rem':vlen>7?'.97rem':'1.10rem';
  return`<div style="background:#101827;border:1px solid #1E2D3D;border-top:3px solid ${color};
    border-radius:9px;padding:8px 10px;min-height:66px;box-sizing:border-box">
    <div style="font-size:.51rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
      color:#4A5F75;margin-bottom:3px;font-family:${_MONO};white-space:nowrap;
      overflow:hidden;text-overflow:ellipsis">${label}</div>
    <div style="font-size:${vfont};font-weight:800;color:#F4F7FB;line-height:1;
      white-space:nowrap;font-family:${_MONO}">${value}</div>
    <div style="margin-top:3px;font-size:.56rem;color:#4A5F75;font-family:${_MONO};
      display:flex;align-items:center;flex-wrap:wrap;gap:2px">
      <span>${sub||''}</span>${badgeHtml}
    </div>
  </div>`;
}

// Panel de chart para Negocio — header más oscuro, borde naranja más nítido
function _cPanelN(id, title, sub) {
  return `<div style="background:#101827;border:1px solid #1E2D3D;border-radius:10px;overflow:hidden">
    <div style="padding:8px 12px 6px;background:rgba(10,18,30,.85);
      border-bottom:1px solid rgba(245,158,11,.32)">
      <div style="font-size:.52rem;font-weight:700;letter-spacing:.11em;text-transform:uppercase;
        color:#7F93AD;font-family:${_MONO};margin-bottom:${sub?'3px':'0'}">${title}</div>
      ${sub?`<div style="font-size:.90rem;font-weight:800;color:#F4F7FB;font-family:${_MONO};
        line-height:1.1">${sub}</div>`:''}
    </div>
    <div id="${id}" style="height:228px"></div>
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

  const ebitdaC = ebitda!=null&&ebitda<0 ? _RE : _VI;
  const niC     = ni!=null&&ni<0         ? _RE : _GR;
  const fcfC    = fcf!=null&&fcf<0       ? _RE : _OR;

  const kpis=[
    {l:'REVENUE',      v:_fmtM(rev),    s:fy,                b:last.revenue_yoy,    c:_CY},
    {l:'GROSS PROFIT', v:_fmtM(gp),     s:_marg(gp,rev),     b:null,                c:_SK},
    {l:'EBITDA',       v:_fmtM(ebitda), s:_marg(ebitda,rev), b:null,                c:ebitdaC, neg:ebitda!=null&&ebitda<0},
    {l:'NET INCOME',   v:_fmtM(ni),     s:_marg(ni,rev),     b:last.net_income_yoy, c:niC,     neg:ni!=null&&ni<0},
    {l:'EPS DILUIDO',  v:eps!=null?`$${Number(eps).toFixed(2)}`:'—',s:fy,b:null,   c:_YL},
    {l:'FCF',          v:_fmtM(fcf),    s:_marg(fcf,rev),    b:last.fcf_yoy,        c:fcfC,    neg:fcf!=null&&fcf<0},
    {l:'REV CAGR',     v:cagr!=null?`${cagr.toFixed(1)}%`:'—',s:`${fy0}→${fy}`,b:null,c:_PI},
  ];

  const years = data.map(d=>`FY${String(d.year).slice(2)}`);
  const n     = years.length;

  const revStr  = _fmtM(rev);
  const yoyLast = last.revenue_yoy;
  const yoyStr  = yoyLast!=null?`${yoyLast>=0?'+':''}${yoyLast.toFixed(1)}% YoY`:'';
  const ebitStr = ebitda!=null?`EBITDA ${_fmtM(ebitda)}`:'';
  const niStr   = ni!=null?`NI ${_fmtM(ni)}`:'';

  container.innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:9px;margin-bottom:10px">
      ${kpis.map(k=>_kpiN(k.l,k.v,k.s,k.b,k.c,k.neg||false)).join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${_cPanelN('af-c-rev',   'REVENUE & EARNINGS', revStr)}
      ${_cPanelN('af-c-yoy',   'CRECIMIENTO YoY',    yoyStr)}
      ${_cPanelN('af-c-ebitda','EBITDA & MARGEN',     ebitStr)}
      ${_cPanelN('af-c-nieps', 'NET INCOME & EPS',    niStr)}
    </div>`;

  // Chart 1: Revenue (cyan binary) + Net Income (sign-based green/red)
  _ch('af-c-rev', ch=>{
    ch.setOption({
      ..._nBase(years),
      yAxis:[_nYaxM()],
      legend:_nLeg(['Revenue','Net Income']),
      series:[
        {name:'Revenue',   type:'bar',barGap:'4%',barCategoryGap:'38%',
          itemStyle:{borderRadius:[3,3,0,0]},
          data:data.map((d,i)=>({value:d.revenue,   itemStyle:{color:_hist(_CY,_CYS,i,n)}}))},
        {name:'Net Income',type:'bar',
          itemStyle:{borderRadius:[3,3,0,0]},
          data:data.map((d,i)=>({value:d.net_income,itemStyle:{color:_signHist(d.net_income,i,n)}}))},
      ],
      tooltip:{..._nTt(),valueFormatter:v=>v!=null?`$${v.toFixed(0)}M`:'—'},
    });
  });

  // Chart 2: Revenue YoY — línea violeta + área suave + markLine cero
  _ch('af-c-yoy', ch=>{
    const yoyPairs=data.map(d=>({y:`FY${String(d.year).slice(2)}`,v:d.revenue_yoy})).filter(p=>p.v!=null);
    const yoyYears=yoyPairs.map(p=>p.y);
    const yoyVals =yoyPairs.map(p=>p.v);
    ch.setOption({
      ..._nBase(yoyYears),
      yAxis:[_nYaxPct()],
      series:[{name:'Rev YoY %',type:'line',data:yoyVals,
        smooth:false,symbol:'circle',symbolSize:4,
        lineStyle:{color:_VI,width:2},itemStyle:{color:_VI},
        areaStyle:{color:'rgba(139,92,246,.11)'},
        markLine:{silent:true,data:[{yAxis:0}],
          lineStyle:{color:'rgba(139,92,246,.22)',width:1,type:'dashed'},
          label:{show:false},symbol:'none'},
      }],
      tooltip:{..._nTt(),valueFormatter:v=>v!=null?`${v>=0?'+':''}${v.toFixed(1)}%`:'—'},
    });
  },!data.some(d=>d.revenue_yoy!=null));

  // Chart 3: EBITDA sign-based (violet positivo, red negativo) + Margen pink
  _ch('af-c-ebitda', ch=>{
    ch.setOption({
      ..._nBase(years),
      yAxis:[
        _nYaxM(),
        _nYax2(v=>`${v.toFixed(0)}%`),
      ],
      legend:_nLeg(['EBITDA','Margen %']),
      series:[
        {name:'EBITDA',type:'bar',yAxisIndex:0,barCategoryGap:'38%',
          itemStyle:{borderRadius:[2,2,0,0]},
          data:data.map((d,i)=>{
            const v=d.ebitda_est,isL=i===n-1;
            return{value:v,itemStyle:{color:v!=null&&v<0?(isL?_RE:_RES):(isL?_VI:_VIS)}};
          })},
        {name:'Margen %',type:'line',yAxisIndex:1,
          data:data.map(d=>d.ebitda_margin??null),
          connectNulls:false,smooth:false,symbol:'circle',symbolSize:4,
          lineStyle:{color:_PI,width:1.8},itemStyle:{color:_PI}},
      ],
      tooltip:{..._nTt()},
    });
  });

  // Chart 4: Net Income sign-based (green/red) + EPS línea amarilla
  _ch('af-c-nieps', ch=>{
    ch.setOption({
      ..._nBase(years),
      yAxis:[
        _nYaxM(),
        _nYax2(v=>`$${Math.abs(v)<10?v.toFixed(2):v.toFixed(1)}`),
      ],
      legend:_nLeg(['Net Income','EPS']),
      series:[
        {name:'Net Income',type:'bar',yAxisIndex:0,barCategoryGap:'38%',
          itemStyle:{borderRadius:[2,2,0,0]},
          data:data.map((d,i)=>({value:d.net_income,itemStyle:{color:_signHist(d.net_income,i,n)}}))},
        {name:'EPS',type:'line',yAxisIndex:1,
          data:data.map(d=>d.eps_diluted??null),
          connectNulls:false,smooth:false,symbol:'circle',symbolSize:4,
          lineStyle:{color:_YL,width:1.8},itemStyle:{color:_YL}},
      ],
      tooltip:{..._nTt()},
    });
  });
}


/* ══════════════════════════════════════════════════════════════════════════
   TAB: RENTABILIDAD — v2 benchmark-match
   Usa los helpers de Negocio (_kpiN, _cPanelN, _nBase, _nYaxM, _nYaxPct,
   _nLeg, _nTt) para consistencia visual sin afectar otras tabs.
   ══════════════════════════════════════════════════════════════════════════ */

function _tabRentabilidad(container, tk, data, metrics) {
  if (!data.length) { container.innerHTML = _noData('Sin datos financieros'); return; }
  const last=data[data.length-1];
  const fy=`FY${String(last.year).slice(2)}`;
  const roe=metrics.roe_ttm;
  const roic=metrics.roic_ttm;

  const kpis=[
    {l:'FCF',          v:_fmtM(last.fcf),  s:_marg(last.fcf,last.revenue), b:last.fcf_yoy,  c:_OR, neg:last.fcf!=null&&last.fcf<0},
    {l:'OP CASH FLOW', v:_fmtM(last.cfo),  s:fy,                            b:null,          c:_SK},
    {l:'EBITDA MARGIN',v:last.ebitda_margin!=null?`${last.ebitda_margin.toFixed(1)}%`:'—',s:fy,b:null,c:_VI,neg:last.ebitda_margin!=null&&last.ebitda_margin<0},
    {l:'FCF MARGIN',   v:last.fcf_margin!=null?`${last.fcf_margin.toFixed(1)}%`:'—',s:fy,b:null,c:_GR},
    {l:'ROE TTM',      v:roe!=null?`${roe.toFixed(1)}%`:'—',s:'TTM',b:null,c:roe!=null&&roe<0?_RE:_CY,neg:roe!=null&&roe<0},
    {l:'ROIC TTM',     v:roic!=null?`${roic.toFixed(1)}%`:'—',s:'TTM',b:null,c:_PI},
  ];

  const years=data.map(d=>`FY${String(d.year).slice(2)}`);
  const n=data.length;
  const lastFcfMarg=last.fcf_margin!=null?`FCF ${last.fcf_margin.toFixed(1)}%`:'';
  const lastGross=last.gross_margin!=null?`Gross ${last.gross_margin.toFixed(1)}%`:'';

  container.innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px;margin-bottom:10px">
      ${kpis.map(k=>_kpiN(k.l,k.v,k.s,k.b,k.c,k.neg||false)).join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${_cPanelN('af-r-marg',  'MÁRGENES HISTÓRICOS',  lastGross)}
      ${_cPanelN('af-r-fcfcfo','FCF y OP CASH FLOW',   '')}
      ${_cPanelN('af-r-ret',   'RETORNOS DE CAPITAL (TTM)', '')}
      ${_cPanelN('af-r-fcfm',  'FCF MARGIN',           lastFcfMarg)}
    </div>`;

  // Chart 1: Márgenes — líneas múltiples (5 series)
  _ch('af-r-marg', ch=>{
    ch.setOption({
      ..._nBase(years),
      yAxis:[_nYaxPct()],
      legend:_nLeg(['Gross','EBIT','EBITDA','Net','FCF']),
      series:[
        {name:'Gross', type:'line',data:data.map(d=>d.gross_margin??null), smooth:false,symbol:'circle',symbolSize:4,lineStyle:{color:_CY,width:1.8},itemStyle:{color:_CY},connectNulls:false},
        {name:'EBIT',  type:'line',data:data.map(d=>d.ebit_margin??null),  smooth:false,symbol:'circle',symbolSize:4,lineStyle:{color:_SK,width:1.8},itemStyle:{color:_SK},connectNulls:false},
        {name:'EBITDA',type:'line',data:data.map(d=>d.ebitda_margin??null),smooth:false,symbol:'circle',symbolSize:4,lineStyle:{color:_VI,width:1.8},itemStyle:{color:_VI},connectNulls:false},
        {name:'Net',   type:'line',data:data.map(d=>d.net_margin??null),   smooth:false,symbol:'circle',symbolSize:4,lineStyle:{color:_GR,width:1.8},itemStyle:{color:_GR},connectNulls:false},
        {name:'FCF',   type:'line',data:data.map(d=>d.fcf_margin??null),   smooth:false,symbol:'circle',symbolSize:4,lineStyle:{color:_OR,width:1.8},itemStyle:{color:_OR},connectNulls:false},
      ],
      tooltip:{..._nTt(),valueFormatter:v=>v!=null?`${v.toFixed(1)}%`:'—'},
    });
  });

  // Chart 2: FCF y OCF — barras agrupadas, opacidad binaria (último=sólido, histórico=.35)
  _ch('af-r-fcfcfo', ch=>{
    ch.setOption({
      ..._nBase(years),
      yAxis:[_nYaxM()],
      legend:_nLeg(['FCF','Op Cash Flow']),
      series:[
        {name:'FCF',         type:'bar',barGap:'4%',barCategoryGap:'38%',
          itemStyle:{borderRadius:[3,3,0,0]},
          data:data.map((d,i)=>({value:d.fcf??null,itemStyle:{color:_hist(_OR,_ORS,i,n)}}))},
        {name:'Op Cash Flow',type:'bar',
          itemStyle:{borderRadius:[3,3,0,0]},
          data:data.map((d,i)=>({value:d.cfo??null,itemStyle:{color:_hist(_SK,_SKS,i,n)}}))},
      ],
      tooltip:{..._nTt(),valueFormatter:v=>v!=null?`$${v.toFixed(0)}M`:'—'},
    });
  });

  // Chart 3: Retornos de Capital — barras horizontales actuales, sin nulls
  _ch('af-r-ret', ch=>{
    const pool=[
      {l:'Net Margin',   v:last.net_margin,    c:(last.net_margin??0)>=0?_GR:_RE},
      {l:'EBITDA Margin',v:last.ebitda_margin, c:_VI},
      {l:'Gross Margin', v:last.gross_margin,  c:_CY},
      {l:'ROIC',         v:metrics.roic_ttm,   c:(metrics.roic_ttm??0)>=0?_PI:_RE},
      {l:'ROA',          v:metrics.roa_ttm,    c:(metrics.roa_ttm??0)>=0?_SK:_RE},
      {l:'ROE',          v:metrics.roe_ttm,    c:(metrics.roe_ttm??0)>=0?_CY:_RE},
    ].filter(m=>m.v!=null);
    ch.setOption({
      grid:{left:80,right:20,top:8,bottom:8,containLabel:false},
      xAxis:{type:'value',
        axisLabel:{color:'#7F93AD',fontFamily:_MONO,fontSize:8.5,formatter:v=>`${v.toFixed(0)}%`},
        splitLine:{lineStyle:{color:'rgba(120,150,180,.07)',type:'dashed'}},
        axisLine:{show:false},axisTick:{show:false}},
      yAxis:{type:'category',data:pool.map(m=>m.l),
        axisLabel:{color:'#7F93AD',fontFamily:_MONO,fontSize:8.5},
        axisLine:{lineStyle:{color:_BOR}},splitLine:{show:false},axisTick:{show:false}},
      series:[{type:'bar',barMaxWidth:16,
        data:pool.map(m=>({value:m.v,itemStyle:{color:m.c}})),
        label:{show:true,position:'right',color:'#7F93AD',fontFamily:_MONO,fontSize:8.5,
          formatter:p=>p.value!=null?`${Number(p.value).toFixed(1)}%`:'—'}}],
      tooltip:{..._nTt(),valueFormatter:v=>`${Number(v).toFixed(1)}%`},
      backgroundColor:'transparent',
    });
  },!([last.net_margin,last.ebitda_margin,last.gross_margin,
       metrics.roic_ttm,metrics.roa_ttm,metrics.roe_ttm].some(v=>v!=null)));

  // Chart 4: FCF Margin — línea naranja + fill suave · Net Margin verde punteado
  _ch('af-r-fcfm', ch=>{
    ch.setOption({
      ..._nBase(years),
      yAxis:[_nYaxPct()],
      legend:_nLeg(['FCF Margin','Net Margin']),
      series:[
        {name:'FCF Margin',type:'line',data:data.map(d=>d.fcf_margin??null),
          smooth:false,symbol:'circle',symbolSize:4,connectNulls:false,
          lineStyle:{color:_OR,width:2},itemStyle:{color:_OR},
          areaStyle:{color:'rgba(245,158,11,.10)'}},
        {name:'Net Margin',type:'line',data:data.map(d=>d.net_margin??null),
          smooth:false,symbol:'circle',symbolSize:4,connectNulls:false,
          lineStyle:{color:_GR,width:1.8,type:'dashed'},itemStyle:{color:_GR}},
      ],
      tooltip:{..._nTt(),valueFormatter:v=>v!=null?`${v.toFixed(1)}%`:'—'},
    });
  },!data.some(d=>d.fcf_margin!=null));
}


/* ══════════════════════════════════════════════════════════════════════════
   TAB: FINANCIERA
   ══════════════════════════════════════════════════════════════════════════ */

function _tabFinanciera(container, tk, data) {
  if (!data.length) { container.innerHTML = _noData('Sin datos financieros'); return; }
  const last=data[data.length-1];
  const prev=data.length>1?data[data.length-2]:null;
  const fy=`FY${String(last.year).slice(2)}`;
  const ncNeg=last.net_cash!=null&&last.net_cash<0;

  const kpis=[
    {l:'CASH & EQUIV.',v:_fmtM(last.cash),      s:fy,                  b:_yoy(last.cash,prev?.cash),  c:_CY},
    {l:'DEUDA TOTAL',  v:_fmtM(last.total_debt), s:fy,                  b:null,                        c:_RE},
    {l:'NET CASH',     v:_fmtM(last.net_cash),   s:ncNeg?'Net Debt':'Pos. neta',b:_yoy(last.net_cash,prev?.net_cash),c:ncNeg?_RE:_GR,neg:ncNeg},
    {l:'TOTAL ASSETS', v:_fmtM(last.total_assets),s:fy,                 b:null,                        c:_VI},
    {l:'EQUITY',       v:_fmtM(last.equity),     s:fy,                  b:null,                        c:_GR},
    {l:'DEUDA/EQUITY', v:last.de_ratio!=null?`${last.de_ratio.toFixed(2)}x`:'—',s:'Leverage',b:null,  c:_YL},
    {l:'FCF',          v:_fmtM(last.fcf),        s:_marg(last.fcf,last.revenue),b:null,               c:_OR,neg:last.fcf!=null&&last.fcf<0},
    {l:'CAPEX',        v:last.capex!=null?_fmtM(last.capex):'—',        s:'Inversión',b:null,          c:'#4A5F75'},
  ];

  const years=data.map(d=>`FY${String(d.year).slice(2)}`);
  const n=data.length;

  container.innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:12px">
      ${kpis.map(k=>_kpi(k.l,k.v,k.s,k.b,k.c,k.neg||false)).join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${_cPanel('af-c-cashd','CASH vs DEUDA TOTAL',`Cash ${_fmtM(last.cash)}`)}
      ${_cPanel('af-c-netc', 'NET CASH / NET DEBT', _fmtM(last.net_cash))}
      ${_cPanel('af-c-aseq', 'ASSETS vs EQUITY',`Assets ${_fmtM(last.total_assets)}`)}
      ${_cPanel('af-c-fcfcx','FCF vs CAPEX',`FCF ${_fmtM(last.fcf)}`)}
    </div>`;

  // Cash vs Deuda — barras agrupadas lado a lado
  _ch('af-c-cashd', ch=>{
    ch.setOption({
      ..._base(years),
      yAxis:[_yaxM()],
      legend:_leg(['Cash','Deuda'],{bottom:0}),
      series:[
        {name:'Cash', type:'bar',barGap:'5%',barCategoryGap:'22%',
          data:data.map((d,i)=>({value:d.cash,       itemStyle:{color:i===n-1?_CY:_CYS}}))},
        {name:'Deuda',type:'bar',
          data:data.map((d,i)=>({value:d.total_debt,  itemStyle:{color:i===n-1?_RE:_RES}}))},
      ],
      tooltip:{..._tt(),valueFormatter:v=>v!=null?`$${v.toFixed(0)}M`:'—'},
    });
  });

  // Net Cash — verde positivo / rojo negativo
  _ch('af-c-netc', ch=>{
    ch.setOption({
      ..._base(years),
      yAxis:[_yaxM()],
      series:[{name:'Net Cash',type:'bar',
        data:data.map((d,i)=>({value:d.net_cash,
          itemStyle:{color:d.net_cash>=0?(i===n-1?_GR:_GRS):(i===n-1?_RE:_RES)}}))
      }],
      tooltip:{..._tt(),valueFormatter:v=>v!=null?`$${v.toFixed(0)}M`:'—'},
    });
  });

  // Assets vs Equity — barras agrupadas
  _ch('af-c-aseq', ch=>{
    ch.setOption({
      ..._base(years),
      yAxis:[_yaxM()],
      legend:_leg(['Assets','Equity'],{bottom:0}),
      series:[
        {name:'Assets',type:'bar',barGap:'5%',barCategoryGap:'22%',
          data:data.map((d,i)=>({value:d.total_assets,itemStyle:{color:i===n-1?_VI:_VIS}}))},
        {name:'Equity',type:'bar',
          data:data.map((d,i)=>({value:d.equity,       itemStyle:{color:i===n-1?_GR:_GRS}}))},
      ],
      tooltip:{..._tt(),valueFormatter:v=>v!=null?`$${v.toFixed(0)}M`:'—'},
    });
  });

  // FCF vs Capex — barras agrupadas (capex negativo para mostrar salida de caja)
  _ch('af-c-fcfcx', ch=>{
    ch.setOption({
      ..._base(years),
      yAxis:[_yaxM()],
      legend:_leg(['FCF','Capex (salida)'],{bottom:0}),
      series:[
        {name:'FCF',type:'bar',barGap:'5%',barCategoryGap:'22%',
          data:data.map((d,i)=>({value:d.fcf,itemStyle:{color:i===n-1?_OR:_ORS}}))},
        {name:'Capex (salida)',type:'bar',
          data:data.map((d,i)=>({value:d.capex!=null?-d.capex:null,
            itemStyle:{color:i===n-1?'rgba(74,95,117,.9)':'rgba(74,95,117,.35)'}}))},
      ],
      tooltip:{..._tt(),valueFormatter:v=>v!=null?`$${v.toFixed(0)}M`:'—'},
    });
  });
}


/* ══════════════════════════════════════════════════════════════════════════
   TAB: VALUACIÓN
   ══════════════════════════════════════════════════════════════════════════ */

function _tabValuacion(container, tk, data, metrics, profile, candles) {
  const last   = data.length?data[data.length-1]:null;
  const mcapM  = profile.market_cap;
  const shares = profile.shares;
  const mcapUSD= mcapM?mcapM*1e6:null;
  const netCash= last?.net_cash;
  const evM    = metrics.enterprise_value_m;
  const evUSD  = evM?evM*1e6:((mcapUSD!=null&&netCash!=null)?mcapUSD-(netCash*1e6):mcapUSD);
  const pe     = metrics.pe_ttm;
  const peF    = metrics.pe_forward;
  const ps     = metrics.ps_ttm;
  const pb     = metrics.pb_annual;
  const evEbit = metrics.ev_ebitda_ttm;
  const evSales= metrics.ev_sales_ttm;
  const pfcf   = (mcapM&&metrics.fcf_ttm_m&&metrics.fcf_ttm_m>0)?mcapM/metrics.fcf_ttm_m:null;
  const _mF    = v=>{if(v==null)return'—';return Math.abs(v)>999?'N/A¹':`${Number(v).toFixed(1)}x`;};
  const target = metrics.target_price;
  const upside = metrics.upside;
  const rec    = metrics.recommendation;

  const kpis=[
    {l:'MARKET CAP',v:mcapUSD!=null?_fmtB(mcapUSD):'—',s:'',b:null,c:_CY},
    {l:'EV',        v:evUSD!=null?_fmtB(evUSD):'—',      s:'',b:null,c:_VI},
    {l:'P/E TTM',   v:_mF(pe),  s:peF?`Fwd ${_mF(peF)}`:'',b:null,c:'#C8D8E8'},
    {l:'EV/EBITDA', v:_mF(evEbit),s:'',b:null,c:'#C8D8E8'},
    {l:'P/FCF',     v:_mF(pfcf),  s:'',b:null,c:'#C8D8E8'},
    {l:'P/S TTM',   v:_mF(ps),    s:'',b:null,c:'#C8D8E8'},
  ];

  const histPeAvg=_histAvg(data,mcapUSD,'net_income');
  const histPsAvg=_histAvg(data,mcapUSD,'revenue');
  const multCards=[
    {l:'P/E',       v:pe,      avg:histPeAvg},
    {l:'P/S',       v:ps,      avg:histPsAvg},
    {l:'P/B',       v:pb,      avg:null},
    {l:'P/FCF',     v:pfcf,    avg:null},
    {l:'EV/Sales',  v:evSales, avg:null},
    {l:'EV/EBITDA', v:evEbit,  avg:null},
  ].map(({l,v,avg})=>{
    const isNa=v!=null&&Math.abs(v)>999;
    const str=isNa?'N/A':(v!=null?`${v.toFixed(1)}x`:'—');
    let comp=`<span style="color:#2D4157;font-size:.60rem;font-family:${_MONO}">Sin histórico</span>`;
    if(!isNa&&v!=null&&avg!=null&&avg>0){
      const diff=(v-avg)/avg*100;
      const col=diff>0?_OR:_GR;
      const arr=diff>0?'▲':'▼';
      comp=`<span style="color:${col};font-size:.60rem;font-weight:600;font-family:${_MONO}">
        ${arr} ${Math.abs(diff).toFixed(1)}% vs hist (${avg.toFixed(1)}x)</span>`;
    }
    return `<div style="flex:1;min-width:110px;background:#0B1220;border:1px solid ${_BOR};
      border-radius:8px;padding:10px 12px">
      <div style="font-size:.55rem;font-weight:700;letter-spacing:.10em;text-transform:uppercase;
        color:#2D4157;margin-bottom:4px;font-family:${_MONO}">${l}</div>
      <div style="font-size:1.20rem;font-weight:700;color:#F4F7FB;font-family:${_MONO}">${str}</div>
      <div style="margin-top:3px">${comp}</div>
    </div>`;
  });

  const hasCandles=candles?.status==='ok'&&candles?.dates?.length>0;
  const lastPxStr=hasCandles?`${candles.dates.at(-1)?.slice(0,10)} · $${candles.closes.at(-1)?.toFixed(2)}`:'';

  const years=data.map(d=>`FY${String(d.year).slice(2)}`);
  const n=data.length;
  const hist=_computeHistMult(data,candles,shares);

  container.innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:12px">
      ${kpis.map(k=>_kpi(k.l,k.v,k.s,k.b,k.c)).join('')}
    </div>

    ${(target!=null||rec)?`<div style="background:${_CARD};border:1px solid ${_BOR};border-radius:9px;
      padding:12px 16px;margin-bottom:12px">
      <div style="font-size:.55rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
        color:#2D4157;margin-bottom:9px;font-family:${_MONO}">CONSENSO ANALISTAS</div>
      <div style="display:flex;gap:20px;flex-wrap:wrap">
        ${target!=null?`<div>
          <div style="font-size:.55rem;text-transform:uppercase;letter-spacing:.09em;color:#2D4157;margin-bottom:2px;font-family:${_MONO}">PRECIO TARGET</div>
          <div style="font-size:1.20rem;font-weight:700;color:${_G};font-family:${_MONO}">$${Number(target).toFixed(2)}</div>
        </div>`:''}
        ${upside!=null?`<div>
          <div style="font-size:.55rem;text-transform:uppercase;letter-spacing:.09em;color:#2D4157;margin-bottom:2px;font-family:${_MONO}">UPSIDE POTENCIAL</div>
          <div style="font-size:1.20rem;font-weight:700;color:${upside>=0?_GR:_RE};font-family:${_MONO}">${upside>=0?'+':''}${upside.toFixed(1)}%</div>
        </div>`:''}
        ${rec?`<div>
          <div style="font-size:.55rem;text-transform:uppercase;letter-spacing:.09em;color:#2D4157;margin-bottom:2px;font-family:${_MONO}">RECOMENDACIÓN</div>
          <div style="font-size:.88rem;font-weight:700;color:#C8D8E8;text-transform:uppercase;font-family:${_MONO}">${rec.replace(/_/g,' ')}${metrics.num_analysts?` <span style="color:#2D4157;font-size:.62rem">(${metrics.num_analysts})</span>`:''}</div>
        </div>`:''}
      </div>
    </div>`:''}

    <div style="font-size:.55rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
      color:#2D4157;margin-bottom:7px;font-family:${_MONO}">MÚLTIPLOS VS PROMEDIO HISTÓRICO</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">${multCards.join('')}</div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${_cPanel('af-c-pe',   'P/E HISTÓRICO',pe?`P/E ${_mF(pe)}`:'')}
      ${_cPanel('af-c-pspf', 'P/S y P/FCF HISTÓRICO',ps?`P/S ${_mF(ps)}`:'')}
      ${_cPanel('af-c-mcap', 'MARKET CAP + EV',mcapUSD?_fmtB(mcapUSD):'')}
      ${_cPanel('af-c-px',   'PRECIO HISTÓRICO (SEMANAL)',lastPxStr)}
    </div>
    ${evEbit!=null&&Math.abs(evEbit)>999?`<div style="font-family:${_MONO};font-size:.58rem;
      color:#2D4157;margin-top:6px">¹ EV/EBITDA no aplica cuando EBITDA estimado es negativo.</div>`:''}`;

  // P/E histórico
  const peH=hist.map(h=>(h.pe&&h.pe>0&&h.pe<400)?h.pe:null);
  _ch('af-c-pe', ch=>{
    ch.setOption({
      ..._base(years),yAxis:[_yaxX()],
      series:[{name:'P/E',type:'line',data:peH,smooth:false,symbol:'circle',symbolSize:5,
        lineStyle:{color:_CY,width:2},itemStyle:{color:_CY}}],
      tooltip:{..._tt(),valueFormatter:v=>v!=null?`${v.toFixed(1)}x`:'—'},
    });
  },!peH.some(v=>v!=null));

  // P/S y P/FCF
  const psH=hist.map(h=>(h.ps&&h.ps<400)?h.ps:null);
  const pfH=hist.map(h=>(h.pfcf&&h.pfcf<800)?h.pfcf:null);
  _ch('af-c-pspf', ch=>{
    ch.setOption({
      ..._base(years),yAxis:[_yaxX()],
      legend:_leg(['P/S','P/FCF'],{bottom:0}),
      series:[
        {name:'P/S',  type:'line',data:psH,  ..._ls(_CY)},
        {name:'P/FCF',type:'line',data:pfH,  ..._ls2(_VI)},
      ],
      tooltip:{..._tt(),valueFormatter:v=>v!=null?`${v.toFixed(1)}x`:'—'},
    });
  },!psH.some(v=>v!=null)&&!pfH.some(v=>v!=null));

  // Market Cap + EV — barras MCap + línea EV
  const mcapH=hist.map(h=>h.hist_mcap?h.hist_mcap/1e9:null);
  const evH=hist.map((h,i)=>{
    if(!h.hist_mcap||!data[i]?.net_cash)return null;
    return(h.hist_mcap-(data[i].net_cash*1e6))/1e9;
  });
  _ch('af-c-mcap', ch=>{
    ch.setOption({
      ..._base(years),
      yAxis:[{type:'value',axisLabel:{color:'#4A5F75',fontFamily:_MONO,fontSize:9,
        formatter:v=>`$${v.toFixed(0)}B`},
        splitLine:{lineStyle:{color:'rgba(120,150,180,.10)',type:'dashed'}},axisLine:{show:false}}],
      legend:_leg(['Mkt Cap','EV'],{bottom:0}),
      series:[
        {name:'Mkt Cap',type:'bar',data:mcapH.map((v,i)=>({value:v,itemStyle:{color:i===n-1?_CY:_CYS}}))},
        {name:'EV',type:'line',data:evH,smooth:false,symbol:'circle',symbolSize:4,
          lineStyle:{color:_VI,width:1.8,type:'dashed'},itemStyle:{color:_VI}},
      ],
      tooltip:{..._tt(),valueFormatter:v=>v!=null?`$${v.toFixed(1)}B`:'—'},
    });
  },!mcapH.some(v=>v!=null)&&mcapUSD==null);

  // Precio histórico semanal
  _ch('af-c-px', ch=>{
    ch.setOption({
      grid:{left:10,right:10,top:6,bottom:22,containLabel:true},
      xAxis:{type:'category',data:candles.dates,boundaryGap:false,
        axisLabel:{color:'#4A5F75',fontFamily:_MONO,fontSize:8,
          formatter:d=>d.slice(0,7),
          interval:Math.max(0,Math.floor(candles.dates.length/7)-1)},
        axisLine:{lineStyle:{color:_BOR}},splitLine:{show:false}},
      yAxis:{type:'value',
        axisLabel:{color:'#4A5F75',fontFamily:_MONO,fontSize:9,
          formatter:v=>`$${v>=1000?(v/1000).toFixed(0)+'K':v.toFixed(0)}`},
        splitLine:{lineStyle:{color:'rgba(120,150,180,.10)',type:'dashed'}},axisLine:{show:false}},
      series:[{name:tk,type:'line',data:candles.closes,smooth:false,symbol:'none',
        lineStyle:{color:_VI,width:1.5},areaStyle:{color:'rgba(139,92,246,.08)'}}],
      tooltip:{trigger:'axis',backgroundColor:'#0B1220',borderColor:_BOR,borderWidth:1,
        padding:[8,12],textStyle:{fontFamily:_MONO,fontSize:10,color:'#C8D8E8'},
        formatter:params=>{const p=params[0];return `<div style="font-family:${_MONO}">
          <div style="color:#4A5F75;font-size:9px;margin-bottom:2px">${p.axisValue}</div>
          <div style="font-weight:700;color:${_VI};font-size:11px">$${Number(p.value).toFixed(2)}</div></div>`;}},
      backgroundColor:'transparent',
    });
  },!hasCandles);
}


/* ══════════════════════════════════════════════════════════════════════════
   TAB: RANKING IA
   ══════════════════════════════════════════════════════════════════════════ */

function _tabRanking(container, tk) {
  container.innerHTML = `
    <div style="max-width:600px;margin:0 auto">
      <div style="background:${_CARD};border:1px solid ${_BOR};border-radius:10px;padding:24px;text-align:center;margin-bottom:12px">
        <div style="font-size:1.8rem;margin-bottom:10px">⭐</div>
        <div style="font-size:.95rem;font-weight:700;color:#F4F7FB;font-family:${_MONO};margin-bottom:6px">
          Ranking IA — Próximamente</div>
        <div style="color:#5A7390;font-size:.72rem;line-height:1.6">
          Este módulo rankeará las 13 empresas para el inversor argentino
          con horizonte 2-5 años, considerando sector, macro, momentum y valuación.
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">
        ${['📊 Fundamental','📈 Crecimiento','💰 Rentabilidad',
           '🎯 Valuación','🏦 Financiero','⚡ Score Global'].map(s=>`
          <div style="background:#0B1220;border:1px solid ${_BOR};border-radius:8px;padding:9px 11px">
            <div style="font-size:.65rem;color:#5A7390;font-family:${_MONO};margin-bottom:3px">${s}</div>
            <div style="font-size:1rem;font-weight:700;color:#2D4157;font-family:${_MONO}">—/10</div>
          </div>`).join('')}
      </div>
      <div style="text-align:center">
        <button disabled style="background:${_GD};border:1px solid ${_GB};color:${_G};
          padding:7px 18px;border-radius:7px;font-family:${_MONO};font-size:.72rem;
          font-weight:700;opacity:.5;cursor:not-allowed">⭐ Generar Ranking IA</button>
        <div style="font-family:${_MONO};font-size:.58rem;color:#2D4157;margin-top:6px">
          Requiere ANTHROPIC_API_KEY en secrets</div>
      </div>
    </div>`;
}


/* ══════════════════════════════════════════════════════════════════════════
   TAB: COMPARAR
   ══════════════════════════════════════════════════════════════════════════ */

async function _tabComparar(container) {
  container.innerHTML = `
    <div class="bt2-panel" style="padding:12px 16px">
      <div class="bt2-panel-hdr">
        <span class="bt2-panel-title">COMPARATIVA — 13 TICKERS CURADOS</span>
        <span class="bt2-panel-sub" id="cmp-sub">Cargando…</span>
      </div>
      <div id="cmp-body" class="bt2-snapshot-scroll" style="overflow-x:auto">
        ${[...Array(6)].map(()=>`<div class="skeleton" style="height:28px;border-radius:4px;margin-bottom:4px"></div>`).join('')}
      </div>
    </div>`;
  try {
    const summaries = await api.fundamental.compare();
    _renderCompareTable(document.getElementById('cmp-body'), summaries);
    const sub = document.getElementById('cmp-sub');
    if (sub) sub.textContent = `${summaries.filter(s=>!s.error).length} tickers`;
  } catch (e) {
    document.getElementById('cmp-body').innerHTML = `
      <div style="padding:14px;font-family:${_MONO};color:var(--negative);font-size:.72rem">
        Error: ${e.message}</div>`;
  }
}

function _renderCompareTable(el, summaries) {
  const thS=`padding:5px 9px;font-family:${_MONO};font-size:.55rem;font-weight:700;
    text-transform:uppercase;letter-spacing:.08em;color:#2D4157;white-space:nowrap;
    border-bottom:1px solid ${_BOR}`;
  const cols = [
    {k:'ticker',    h:'TICKER',  f:s=>`<span style="font-weight:700;color:${_G};font-family:${_MONO};cursor:pointer"
       onclick="document.getElementById('af-p-${s.ticker}')?.click()">${s.ticker}</span>`, al:'left'},
    {k:'name',      h:'EMPRESA', f:s=>`<span style="color:#7F93AD;font-size:.68rem">${(s.name||'').split(' ').slice(0,3).join(' ')}</span>`, al:'left'},
    {k:'sector',    h:'SECTOR',  f:s=>`<span style="color:#4A5F75;font-size:.62rem">${s.sector||'—'}</span>`, al:'left'},
    {k:'market_cap',h:'MKT CAP', f:s=>s.market_cap!=null?_fmtB(s.market_cap*1e6):'—',  num:true},
    {k:'revenue',   h:'REV FY',  f:s=>s.revenue!=null?_fmtM(s.revenue):'—',             num:true},
    {k:'revenue_yoy',h:'REV YoY',f:s=>_pct(s.revenue_yoy),                              num:true,pct:true},
    {k:'gross_margin',h:'GP%',   f:s=>_pct1(s.gross_margin),                            num:true,pct:true},
    {k:'ebitda_margin',h:'EBITDA%',f:s=>_pct1(s.ebitda_margin),                         num:true,pct:true},
    {k:'fcf_margin',h:'FCF%',    f:s=>_pct1(s.fcf_margin),                              num:true,pct:true},
    {k:'roe',       h:'ROE',     f:s=>_pct1(s.roe),                                     num:true,pct:true},
    {k:'pe_ttm',    h:'P/E',     f:s=>s.pe_ttm!=null?`${s.pe_ttm.toFixed(1)}x`:'—',    num:true,lo:true},
    {k:'ps_ttm',    h:'P/S',     f:s=>s.ps_ttm!=null?`${s.ps_ttm.toFixed(1)}x`:'—',    num:true,lo:true},
    {k:'ev_ebitda', h:'EV/EBITDA',f:s=>{const v=s.ev_ebitda;return v!=null&&Math.abs(v)<999?`${v.toFixed(1)}x`:'N/A';}, num:true,lo:true},
    {k:'beta',      h:'BETA',    f:s=>s.beta!=null?s.beta.toFixed(2):'—',               num:true},
    {k:'rev_cagr_3y',h:'CAGR 3Y',f:s=>_pct1(s.rev_cagr_3y),                            num:true,pct:true},
  ];
  const best={};
  cols.filter(c=>c.num).forEach(c=>{
    const vals=summaries.filter(s=>!s.error).map(s=>s[c.k]).filter(v=>v!=null&&isFinite(v));
    if(vals.length) best[c.k]=c.lo?Math.min(...vals):Math.max(...vals);
  });
  const headers=cols.map(c=>`<th style="${thS};text-align:${c.al||'right'}">${c.h}</th>`).join('');
  const rows=summaries.map(s=>{
    if(s.error)return`<tr><td colspan="${cols.length}" style="padding:5px 9px;color:#2D4157;font-family:${_MONO};font-size:.68rem">${s.ticker}—sin datos</td></tr>`;
    return`<tr class="bt2-row">${cols.map(c=>{
      const raw=s[c.k];
      const isBest=c.num&&best[c.k]!=null&&raw!=null&&Math.abs(raw-best[c.k])<0.001;
      let col='#7F93AD';
      if(c.pct&&raw!=null)col=raw>0?_GR:raw<0?_RE:'#7F93AD';
      const bg=isBest?'rgba(212,175,55,.08)':'transparent';
      return`<td style="padding:5px 9px;font-family:${_MONO};font-size:.72rem;
        text-align:${c.al!=='left'?'right':'left'};color:${col};background:${bg};
        border-bottom:1px solid rgba(30,45,61,.5);white-space:nowrap">${c.f(s)}</td>`;
    }).join('')}</tr>`;
  }).join('');
  el.innerHTML=`<table class="bt2-table" style="min-width:900px">
    <thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
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

function _afSetPillActive(tickers, active) {
  tickers.forEach(tk=>{
    const b=document.getElementById(`af-p-${tk}`);
    if(!b)return;
    const isA=tk===active;
    b.style.background  =isA?_GD:'rgba(212,175,55,.08)';
    b.style.borderColor =isA?_GB:'rgba(212,175,55,.18)';
    b.style.color       =isA?_G:'#7F93AD';
  });
}
