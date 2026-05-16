/* ─── Bonos Soberanos — BondTerminal v2 ──────────────────────────────────── */

const EXCLUDED_BPY = new Set(['BPY26', 'BPY6D', 'BPY6C']);

// ── Costos de entrada ────────────────────────────────────────────────────────
const BUY_COMMISSION_RATE  = 0.005;   // 0,5%
const BUY_TAX_RATE         = 0.001;   // 0,1%
const BUY_TOTAL_COST_RATE  = BUY_COMMISSION_RATE + BUY_TAX_RATE;

// Module-level state — persists across SOBERANOS/SENSIBILIDAD tab switches
let _showBopreal    = false;
let _currentMercado = 'MEP';
let _allBondsData   = { PESOS: [], MEP: [], CCL: [] };
let _tasasEl        = null;

(window.pages = window.pages || {}).bonos = async function(container) {
  container.innerHTML = `
    <div class="bt2-page">

      <!-- ── Header compacto ── -->
      <div class="bt2-header">
        <h1 class="bt2-title">Bonos Soberanos</h1>
        <div class="bt2-kpis" id="bonos-tasas"></div>
      </div>

      <!-- ── Tabs ── -->
      <div class="bt2-tabs" id="bonos-pills"></div>

      <!-- ── Content ── -->
      <div id="bonos-content"></div>
    </div>`;

  _tasasEl = document.getElementById('bonos-tasas');
  _loadTasasBadge(_tasasEl);

  const pillsEl = ui.pills(['SOBERANOS', 'SENSIBILIDAD'], 0, (i) => {
    if (i === 0) renderSoberanos(document.getElementById('bonos-content'));
    else         renderSensibilidad(document.getElementById('bonos-content'));
  });
  document.getElementById('bonos-pills').appendChild(pillsEl);
  renderSoberanos(document.getElementById('bonos-content'));
};

// ── Tasas KPIs (compact) ──────────────────────────────────────────────────
async function _loadTasasBadge(el) {
  if (!el) return;
  try {
    const { tasas = [], spread_ley_ar_vs_ny, spread_pair } = await api.dashboard.tasas();
    const spreadSign = spread_ley_ar_vs_ny != null ? (spread_ley_ar_vs_ny >= 0 ? '+' : '') : '';
    el.innerHTML = [
      ...tasas.map(t => `
        <div class="bt2-kpi-card">
          <div class="bt2-kpi-label">${t.ticker}</div>
          <div class="bt2-kpi-value">${t.tir != null ? t.tir.toFixed(2) + '%' : '—'}</div>
        </div>`),
      `<div class="bt2-kpi-card bt2-kpi-spread">
        <div class="bt2-kpi-label">SPREAD LEY AR VS NY</div>
        <div class="bt2-kpi-value bt2-accent">${spread_ley_ar_vs_ny != null ? spreadSign + Math.round(spread_ley_ar_vs_ny) + ' bps' : '—'}</div>
        <div class="bt2-kpi-sub">${spread_pair || 'AL30D — GD30D'}</div>
      </div>`,
    ].join('');
  } catch { el.innerHTML = ''; }
}

// ── SOBERANOS main view ───────────────────────────────────────────────────
async function renderSoberanos(container) {
  container.innerHTML = `
    <div class="bt2-layout">

      <!-- LEFT: Snapshot table -->
      <div class="bt2-snapshot-col">
        <div class="bt2-panel">
          <div class="bt2-panel-hdr">
            <span class="bt2-panel-title">SNAPSHOT</span>
            <div id="bonos-mercado-pills"></div>
          </div>
          <div id="bonos-snapshot-wrap" class="bt2-snapshot-scroll">
            ${_skeletonRows(10)}
          </div>
        </div>
      </div>

      <!-- RIGHT column -->
      <div class="bt2-right-col">

        <!-- Sovereign Curve -->
        <div class="bt2-panel bt2-curve-panel">
          <div class="bt2-panel-hdr">
            <span class="bt2-panel-title">SOVEREIGN CURVE</span>
            <div style="display:flex;align-items:center;gap:8px">
              <button class="bt2-bop-btn" id="bop-toggle">BOPREAL</button>
              <span class="bt2-expand-btn" title="Expandir">⤢</span>
            </div>
          </div>
          <div id="chart-curva-tir"></div>
        </div>

        <!-- Bottom: RP + Top TIR -->
        <div class="bt2-bottom-row">

          <div class="bt2-panel bt2-rp-panel">
            <div class="bt2-panel-hdr">
              <span class="bt2-panel-title">RIESGO PAÍS (EMBI)</span>
              <div id="rp-period-pills"></div>
            </div>
            <div class="bt2-rp-body">
              <div class="bt2-rp-top">
                <div class="bt2-rp-big" id="rp-value">—</div>
                <div class="bt2-rp-grid" id="rp-changes"></div>
              </div>
              <div id="chart-riesgo-pais"></div>
            </div>
          </div>

          <div class="bt2-panel">
            <div class="bt2-panel-hdr">
              <span class="bt2-panel-title" id="top-tir-title">MAYOR TIR — MEP</span>
            </div>
            <div id="bonos-top-tir"></div>
          </div>

        </div>
      </div>
    </div>

    <!-- ── Bond Market Heatmap ── -->
    <div class="bt2-panel bt2-heatmap-panel">
      <div class="bt2-panel-hdr">
        <span class="bt2-panel-title">BOND MARKET HEATMAP</span>
        <span class="bt2-kpi-sub" id="heatmap-mkt-label" style="color:var(--bt2-accent);font-weight:700;letter-spacing:.06em">MEP</span>
      </div>
      <div id="chart-heatmap"></div>
      <div class="bt2-heatmap-legend">
        <span class="bt2-legend-item"><span class="bt2-legend-dot bt2-leg-neg"></span>Negative</span>
        <span class="bt2-legend-item"><span class="bt2-legend-dot bt2-leg-flat"></span>Flat / unavailable</span>
        <span class="bt2-legend-item"><span class="bt2-legend-dot bt2-leg-pos"></span>Positive</span>
      </div>
    </div>`;

  let rpHistData = [];

  // ── Un único selector de mercado controla todos los componentes ──────────
  const _mkts = ['PESOS', 'MEP', 'CCL'];
  const mp = ui.pills(_mkts, Math.max(0, _mkts.indexOf(_currentMercado)), (_, lbl) => {
    _setMercado(lbl);
  }, 'pills-sm');
  document.getElementById('bonos-mercado-pills').appendChild(mp);

  // Período de RP (independiente del mercado de bonos)
  const rpp = ui.pills(['1M', '3M', '6M'], 0, (_, lbl) => {
    _renderRPChart(rpHistData, lbl);
  }, 'pills-sm');
  document.getElementById('rp-period-pills').appendChild(rpp);

  // Toggle BOPREAL — siempre usa el mercado activo
  const bopBtn = document.getElementById('bop-toggle');
  if (bopBtn) {
    bopBtn.classList.toggle('active', _showBopreal);
    bopBtn.addEventListener('click', () => {
      _showBopreal = !_showBopreal;
      bopBtn.classList.toggle('active', _showBopreal);
      _renderCurvaTIR(_allBondsData[_currentMercado] || [], _showBopreal);
    });
  }

  // Carga los tres mercados + riesgo país en paralelo
  const [bondsRes, rpRes] = await Promise.allSettled([
    Promise.allSettled([
      api.bonos.todos('PESOS'),
      api.bonos.todos('MEP'),
      api.bonos.todos('CCL'),
    ]),
    api.bonos.riesgoPais(),
  ]);

  if (bondsRes.status === 'fulfilled') {
    const [pesosRes, mepRes, cclRes] = bondsRes.value;
    _allBondsData = {
      PESOS: pesosRes.status === 'fulfilled' ? pesosRes.value : [],
      MEP:   mepRes.status   === 'fulfilled' ? mepRes.value   : [],
      CCL:   cclRes.status   === 'fulfilled' ? cclRes.value   : [],
    };
    _setMercado(_currentMercado);  // renderiza todos los componentes para el mercado activo
  } else {
    document.getElementById('bonos-snapshot-wrap').innerHTML =
      `<p style="padding:12px;font-family:var(--font-mono);color:var(--negative);font-size:.78rem">Error cargando datos</p>`;
  }

  if (rpRes.status === 'fulfilled') {
    rpHistData = rpRes.value;
    _renderRPHeader(rpHistData);
    _renderRPChart(rpHistData, '1M');
  }
}

// ── Controlador global de mercado ─────────────────────────────────────────
function _setMercado(lbl) {
  _currentMercado = lbl;
  const data = _allBondsData[lbl] || [];

  _renderSnapshotTable(data, lbl);
  _renderCurvaTIR(data, _showBopreal);
  _renderTopTIR(data);
  _renderHeatmap(data, lbl);

  // Actualiza el título dinámico de "Mayor TIR"
  const titleEl = document.getElementById('top-tir-title');
  if (titleEl) titleEl.textContent = `MAYOR TIR — ${lbl}`;

  // Actualiza el badge de mercado en el heatmap
  const mktLabel = document.getElementById('heatmap-mkt-label');
  if (mktLabel) mktLabel.textContent = lbl;

  // Actualiza KPIs desde datos ya cargados (tickers correctos por mercado)
  if (_tasasEl && data.length) _renderTasasBadgeFromData(_tasasEl, data, lbl);
}

// ── KPI tasas calculados desde datos de bonos ya cargados ─────────────────
// Reemplaza el valor del API (siempre MEP) con el mercado activo.
function _renderTasasBadgeFromData(el, data, mercado) {
  if (!el) return;
  const suf     = mercado === 'MEP' ? 'D' : mercado === 'CCL' ? 'C' : '';
  const tickers = ['AL30', 'GD30', 'AL35', 'GD35'].map(b => b + suf);

  const tirMap = {};
  for (const d of data) tirMap[d.ticker] = d.tir;

  const alTir      = tirMap[tickers[0]];
  const gdTir      = tirMap[tickers[1]];
  const spreadBps  = (alTir != null && gdTir != null) ? Math.round((alTir - gdTir) * 100) : null;
  const spreadPair = `${tickers[0]} — ${tickers[1]}`;
  const sign       = (spreadBps != null && spreadBps >= 0) ? '+' : '';

  el.innerHTML = [
    ...tickers.map(tk => `
      <div class="bt2-kpi-card">
        <div class="bt2-kpi-label">${tk}</div>
        <div class="bt2-kpi-value">${tirMap[tk] != null ? tirMap[tk].toFixed(2) + '%' : '—'}</div>
      </div>`),
    `<div class="bt2-kpi-card bt2-kpi-spread">
      <div class="bt2-kpi-label">SPREAD LEY AR VS NY</div>
      <div class="bt2-kpi-value bt2-accent">${spreadBps != null ? sign + Math.round(spreadBps) + ' bps' : '—'}</div>
      <div class="bt2-kpi-sub">${spreadPair}</div>
    </div>`,
  ].join('');
}

// ── Snapshot table (BondTerminal style) ──────────────────────────────────
function _renderSnapshotTable(data, mercado) {
  const wrap = document.getElementById('bonos-snapshot-wrap');
  if (!wrap) return;

  const filt = data.filter(d => !EXCLUDED_BPY.has(d.ticker));

  // Sort each sub-group by Modified Duration ascending; nulls go to the end
  const _byDur = arr => [...arr].sort((a, b) => {
    if (a.duration == null && b.duration == null) return 0;
    if (a.duration == null) return 1;
    if (b.duration == null) return -1;
    return a.duration - b.duration;
  });

  const globales  = _byDur(filt.filter(d => d.base?.startsWith('GD') && d.group !== 'BOPREAL'));
  const bonares   = _byDur(filt.filter(d => ['AL','AE','AN','AO'].some(p => d.base?.startsWith(p)) && d.group !== 'BOPREAL'));
  const bopreales = _byDur(filt.filter(d => d.group === 'BOPREAL'));

  if (!globales.length && !bonares.length && !bopreales.length) {
    wrap.innerHTML = `<p style="padding:16px 12px;font-family:var(--font-mono);color:var(--text-muted);font-size:.75rem">Sin datos disponibles para este mercado</p>`;
    return;
  }

  const allValid = [...globales, ...bonares].filter(d => d.tir != null);
  const avgTIR   = allValid.length ? (allValid.reduce((s, d) => s + d.tir, 0) / allValid.length) : null;

  function varCell(pct) {
    if (pct == null) return `<td class="bt2-td-num bt2-sub">—</td>`;
    const sign = pct > 0 ? '+' : '';
    const cls  = pct > 0.01 ? 'bt2-pos' : pct < -0.01 ? 'bt2-neg' : 'bt2-sub';
    return `<td class="bt2-td-num ${cls}">${sign}${pct.toFixed(2)}%</td>`;
  }

  function rows(items, cls) {
    return items.map(d => `
      <tr class="bt2-row">
        <td class="bt2-td-ticker ${cls} bond-clickable"
            onclick="_openBondCalc('${d.ticker}','${d.base}','${mercado}')"
            title="Click para abrir calculadora">${d.ticker}</td>
        <td class="bt2-td-num">${d.precio ? _n(d.precio) : '—'}</td>
        ${varCell(d.pct_change)}
        <td class="bt2-td-num ${d.tir != null ? (d.tir >= 0 ? 'bt2-pos' : 'bt2-neg') : ''}">${d.tir != null ? d.tir.toFixed(2) + '%' : '—'}</td>
        <td class="bt2-td-num bt2-sub">${_n(d.duration, 1)}</td>
      </tr>`).join('');
  }

  function groupHdr(label) {
    return `<tr class="bt2-group-hdr"><td colspan="5">${label}</td></tr>`;
  }

  wrap.innerHTML = `
    <table class="bt2-table">
      <thead>
        <tr>
          <th style="text-align:left">TICKER</th>
          <th>PRECIO</th>
          <th>VAR %</th>
          <th>TIR</th>
          <th>DUR.</th>
        </tr>
      </thead>
      <tbody>
        ${globales.length  ? groupHdr('SOBERANOS LEY NY')  + rows(globales,  'bt2-ny')  : ''}
        ${bonares.length   ? groupHdr('SOBERANOS LEY AR')  + rows(bonares,   'bt2-ar')  : ''}
        ${bopreales.length ? groupHdr('BOPREAL')           + rows(bopreales, 'bt2-bp')  : ''}
        <tr class="bt2-total-row">
          <td colspan="2">TIR prom.</td>
          <td></td>
          <td class="bt2-pos">${avgTIR != null ? avgTIR.toFixed(2) + '%' : '—'}</td>
          <td></td>
        </tr>
      </tbody>
    </table>`;
}

// ── Sovereign Curve with trend lines ─────────────────────────────────────
function _renderCurvaTIR(data, showBopreal = false) {
  const validBase = data.filter(d =>
    d.tir != null && d.duration != null && !EXCLUDED_BPY.has(d.ticker)
  );
  const validHD   = validBase.filter(d => d.group !== 'BOPREAL');
  const globales  = validHD.filter(d => d.base?.startsWith('GD'));
  const bonares   = validHD.filter(d => ['AL','AE','AN','AO'].some(p => d.base?.startsWith(p)));
  const bopreales = showBopreal ? validBase.filter(d => d.group === 'BOPREAL') : [];

  const allForScale = showBopreal ? validBase : validHD;
  const allTIRs = allForScale.map(d => d.tir);
  const minY = allTIRs.length ? Math.max(0, Math.floor(Math.min(...allTIRs) - 0.5)) : 4;
  const maxY = allTIRs.length ? Math.ceil(Math.max(...allTIRs) + 1.5) : 13;

  const series = [
    { name: 'NY Law',  color: '#4DA3FF', data: globales.map(d => ({ x: d.duration, y: d.tir, label: d.base, price: d.precio })), showLabels: true },
    { name: 'Arg Law', color: '#00D084', data: bonares.map(d => ({ x: d.duration, y: d.tir, label: d.base, price: d.precio })), showLabels: true },
  ];
  if (bopreales.length) {
    series.push({ name: 'BOPREAL', color: '#F59E0B', data: bopreales.map(d => ({ x: d.duration, y: d.tir, label: d.base, price: d.precio })), showLabels: true, trendType: 'linear' });
  }

  dcfCharts.renderScatterBT('chart-curva-tir', series, { height: 400, xLabel: 'Modified Duration (yr)', yLabel: 'YTM (%)', yMin: minY, yMax: maxY, yFormatter: v => `${v?.toFixed(1)}%`, trendLines: true });
}

// ── Riesgo País header ────────────────────────────────────────────────────
function _renderRPHeader(hist) {
  if (!hist?.length) return;
  const last = hist[hist.length - 1];
  const val  = Math.round(last.valor);
  // Risk country: UP = bad = red, DOWN = good = green (inverse to usual)
  const d1   = hist.length > 1  ? Math.round(val - hist[hist.length - 2].valor)  : 0;
  const w1   = hist.length > 5  ? Math.round(val - hist[hist.length - 6].valor)  : 0;
  const m1   = hist.length > 22 ? Math.round(val - hist[hist.length - 22].valor) : 0;
  const rpSign = v => v > 0 ? `+${v}` : String(v);
  const rpCol  = v => v > 0 ? 'var(--negative)' : v < 0 ? 'var(--positive)' : 'var(--text-muted)';

  document.getElementById('rp-value').innerHTML =
    `<span class="bt2-rp-num">${val}</span><span class="bt2-rp-bps">bps</span>`;

  document.getElementById('rp-changes').innerHTML = `
    <div class="bt2-rp-row"><span class="bt2-rp-period">1D</span><span style="color:${rpCol(d1)};font-weight:600">${rpSign(d1)}</span></div>
    <div class="bt2-rp-row"><span class="bt2-rp-period">1W</span><span style="color:${rpCol(w1)};font-weight:600">${rpSign(w1)}</span></div>
    <div class="bt2-rp-row"><span class="bt2-rp-period">1M</span><span style="color:${rpCol(m1)};font-weight:600">${rpSign(m1)}</span></div>`;
}

const _rpDays = { '1M': 30, '3M': 90, '6M': 180 };
function _renderRPChart(hist, period) {
  if (!hist?.length) return;
  const data = hist.slice(-(_rpDays[period] || 30));
  dcfCharts.renderLine('chart-riesgo-pais', [
    { name: 'EMBI', data: data.map(d => d.valor), color: '#4DA3FF', area: true }
  ], { height: 64, xLabels: data.map(d => d.fecha), yFormatter: v => `${Math.round(v)}`, mini: true });
}

// ── Top TIR (Most Viewed style) ───────────────────────────────────────────
function _renderTopTIR(data) {
  const el = document.getElementById('bonos-top-tir');
  if (!el) return;
  const sorted = data
    .filter(d => d.tir != null && d.group !== 'BOPREAL' && !EXCLUDED_BPY.has(d.ticker))
    .sort((a, b) => b.tir - a.tir).slice(0, 5);

  el.innerHTML = sorted.map(d => `
    <div class="bt2-mv-row">
      <span class="bt2-mv-ticker ${d.base?.startsWith('GD') ? 'bt2-ny' : 'bt2-ar'}">${d.ticker}</span>
      <span class="bt2-mv-dur">${_n(d.duration, 1)}yr</span>
      <span class="bt2-mv-tir">${d.tir.toFixed(2)}%</span>
    </div>`).join('');
}

// ── SENSIBILIDAD — tres tablas apiladas, fórmula duration ─────────────────
async function renderSensibilidad(container) {
  // TIR objetivo por grupo (valores absolutos en %)
  const SCEN = {
    NY:      [5.0, 5.5, 6.0, 6.5, 7.0, 7.5],
    AR:      [5.0, 5.5, 6.0, 6.5, 7.0, 7.5],
    BOPREAL: [-5.0, -2.0, 0.0, 2.0, 3.0],
  };

  container.innerHTML = `
    <div class="bt2-sensi-wrap">
      <p class="bt2-sensi-note">
        <span style="color:var(--bt2-accent)">→</span>
        Upside/downside estimado ante distintos escenarios de exit yield.
        Fórmula: <span class="bt2-sensi-code">−DM × (TIR objetivo − TIR actual)</span>
        · Base <strong>MEP/USD</strong>
      </p>
      <div id="sensi-content"></div>
    </div>`;

  const wrap = document.getElementById('sensi-content');

  // Usa datos ya cargados o fetch si el usuario entró directo al tab
  let mepData = (_allBondsData.MEP || [])
    .filter(d => d.tir != null && d.duration != null && !EXCLUDED_BPY.has(d.ticker));

  if (!mepData.length) {
    wrap.innerHTML = `<p class="bt2-sensi-loading">Cargando datos…</p>`;
    try {
      const result = await api.bonos.todos('MEP');
      if (result?.length) {
        _allBondsData.MEP = result;
        mepData = result.filter(d => d.tir != null && d.duration != null && !EXCLUDED_BPY.has(d.ticker));
      }
    } catch (_) { /* fall through to empty message */ }
  }

  if (!mepData.length) {
    wrap.innerHTML = `
      <div class="bt2-panel" style="padding:20px 16px">
        <p style="font-family:var(--font-mono);color:var(--text-muted);font-size:.78rem">
          Sin datos disponibles. Navegue primero a la vista Soberanos para cargar los datos.
        </p>
      </div>`;
    return;
  }

  const _byDur = arr => [...arr].sort((a, b) => {
    if (a.duration == null) return 1;
    if (b.duration == null) return -1;
    return a.duration - b.duration;
  });

  const globales  = _byDur(mepData.filter(d => d.base?.startsWith('GD') && d.group !== 'BOPREAL'));
  const bonares   = _byDur(mepData.filter(d => ['AL','AE','AN','AO'].some(p => d.base?.startsWith(p)) && d.group !== 'BOPREAL'));
  const bopreales = _byDur(mepData.filter(d => d.group === 'BOPREAL'));

  // ΔP% = −DM × (TIR_obj% − TIR_actual%)
  function sensiVal(d, tirObj) {
    return -d.duration * (tirObj - d.tir);
  }

  function sensiColor(v) {
    if (v >= 20)  return '#14532d';
    if (v >= 12)  return '#166534';
    if (v >= 6)   return '#15803d';
    if (v >= 1)   return '#1a4a32';
    if (v > -1)   return '#1b2d42';
    if (v >= -6)  return '#5c1f03';
    if (v >= -12) return '#7f1d1d';
    return '#5c0a0a';
  }

  function fmtTIR(v) {
    return v != null ? v.toFixed(2).replace('.', ',') + '%' : '—';
  }
  function fmtDM(v) {
    return v != null ? v.toFixed(2).replace('.', ',') : '—';
  }
  function fmtSensi(v) {
    if (v == null) return '—';
    const sign = v > 0 ? '+' : '';
    return sign + v.toFixed(2).replace('.', ',') + '%';
  }

  function buildSection(title, bonds, scenarios, tkCls) {
    if (!bonds.length) return;

    const sCols = scenarios.map(s => ({
      val: s,
      label: (s < 0 ? '' : '') + s.toLocaleString('es-AR', { minimumFractionDigits: 1 }) + '%',
    }));

    const tbody = bonds.map(d => {
      const cells = sCols.map(c => {
        const v   = sensiVal(d, c.val);
        const bg  = sensiColor(v);
        return `<td class="bt2-sensi-cell" style="background:${bg}">${fmtSensi(v)}</td>`;
      }).join('');
      return `<tr class="bt2-row">
        <td class="bt2-td-ticker ${tkCls}">${d.ticker}</td>
        <td class="bt2-td-num">${fmtTIR(d.tir)}</td>
        <td class="bt2-td-num bt2-sub">${fmtDM(d.duration)}</td>
        ${cells}
      </tr>`;
    }).join('');

    const thTargets = sCols.map(c => `<th class="bt2-sensi-th">${c.label}</th>`).join('');

    const el = document.createElement('div');
    el.className = 'bt2-panel bt2-sensi-section';
    el.innerHTML = `
      <div class="bt2-panel-hdr">
        <span class="bt2-panel-title">${title}</span>
      </div>
      <div class="bt2-sensi-scroll">
        <table class="bt2-table bt2-sensi-table">
          <thead>
            <tr>
              <th style="text-align:left" rowspan="2">BONO</th>
              <th rowspan="2">TIR ACT.</th>
              <th rowspan="2">DM</th>
              <th colspan="${sCols.length}" class="bt2-sensi-group-hdr">TIR OBJETIVO</th>
            </tr>
            <tr>${thTargets}</tr>
          </thead>
          <tbody>${tbody}</tbody>
        </table>
      </div>`;
    wrap.appendChild(el);
  }

  wrap.innerHTML = '';
  buildSection('SOBERANOS LEY NY — GLOBALES', globales,  SCEN.NY,      'bt2-ny');
  buildSection('SOBERANOS LEY AR — BONARES',  bonares,   SCEN.AR,      'bt2-ar');
  buildSection('BOPREAL',                     bopreales, SCEN.BOPREAL, 'bt2-bp');
}

// ── Bond Market Heatmap ───────────────────────────────────────────────────
function _renderHeatmap(data, mercado = 'MEP') {
  const el = document.getElementById('chart-heatmap');
  if (!el) return;

  const filt = data.filter(d => !EXCLUDED_BPY.has(d.ticker) && d.precio != null);

  if (!filt.length) {
    dcfCharts.disposeChart('chart-heatmap');
    el.style.height = '';
    el.innerHTML = `<p style="padding:16px 12px;font-family:var(--font-mono);color:var(--text-muted);font-size:.75rem">Sin datos disponibles para este mercado</p>`;
    return;
  }

  // Map groups: HD bonds split into SOVEREIGN NY / SOVEREIGN AR
  const mapped = filt.map(d => ({
    ...d,
    pct_change: d.pct_change ?? 0,
    group: d.group === 'BOPREAL' ? 'BOPREAL'
         : d.base?.startsWith('GD') ? 'SOVEREIGN NY'
         : 'SOVEREIGN AR',
  }));

  dcfCharts.renderTreemap('chart-heatmap', mapped, {
    height: 340,
    labelKey:   'ticker',
    valueKey:   'pct_change',
    priceKey:   'precio',
    extraKey:   'tir',
    extraLabel: 'YTM',
    groupKey:   'group',
    bondStyle:  true,
    periodLabel:'1D',
  });

  // Override tooltip with full heatmap info (duration, volume, mercado)
  const mono = "'JetBrains Mono',monospace";
  const chart = echarts.getInstanceByDom(el);
  if (chart) {
    chart.setOption({
      tooltip: {
        backgroundColor: '#0d1424',
        borderColor: 'rgba(255,255,255,0.12)',
        borderWidth: 1,
        padding: [10, 14],
        formatter: (info) => {
          if (!info.data || info.data.children) return `<b style="font-family:${mono}">${info.name}</b>`;
          const d = info.data;
          const sign = v => (v != null && v >= 0) ? '+' : '';
          const col  = v => (v != null && v >= 0) ? '#22c55e' : (v != null ? '#ef4444' : '#64748b');
          const row = (lbl, val, color) =>
            `<div style="display:flex;justify-content:space-between;gap:20px;margin-top:2px">` +
            `<span style="color:#7a8fa6">${lbl}</span>` +
            `<span style="font-weight:600;${color ? 'color:' + color : ''}">${val}</span></div>`;
          let html = `<div style="font-family:${mono};font-size:11.5px;min-width:170px">`;
          html += `<div style="font-size:13px;font-weight:700;margin-bottom:6px;padding-bottom:5px;border-bottom:1px solid rgba(255,255,255,0.08)">${info.name}</div>`;
          if (d.price != null)    html += row('Precio', _n(d.price), '');
          if (d.pct != null)      html += row('Var día', `${sign(d.pct)}${d.pct.toFixed(2)}%`, col(d.pct));
          if (d.extra != null)    html += row('YTM', `${d.extra.toFixed(2)}%`, '#22d3ee');
          if (d.duration != null) html += row('Duration (yr)', d.duration.toFixed(1), '');
          if (d.volume > 1)       html += row('Volumen', _nCompact(d.volume), '');
          html += row('Mercado', mercado, '#f97316');
          html += '</div>';
          return html;
        },
      },
    });
  }
}

function _nCompact(v) {
  if (v == null) return '—';
  if (v >= 1e9)  return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6)  return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3)  return (v / 1e3).toFixed(0) + 'K';
  return String(Math.round(v));
}

// ── Helpers ───────────────────────────────────────────────────────────────
function _n(v, d = 2) {
  if (v == null) return '—';
  return Number(v).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function _skeletonRows(n) {
  return Array.from({ length: n }, () =>
    `<div class="skeleton skeleton-table-row" style="margin:2px 12px"></div>`
  ).join('');
}

/* ─────────────────────────────────────────────────────────────────────────
   CALCULADORA DE BONOS
   ───────────────────────────────────────────────────────────────────────── */

let _calcBond = null;   // live bond data (precio, tir, duration…)
let _calcCFs  = [];     // future cashflows array
let _calcMode = 'amount'; // 'amount' | 'vn'

// ── Normalizar ticker → base para buscar cashflows ────────────────────────
function _normTickerCF(ticker) {
  if (!ticker) return ticker;
  const t = ticker.toUpperCase();
  // HD bonds: AL30D→AL30, GD35C→GD35
  if (/^(AL|AE|AN|AO|GD)\d/.test(t)) return t.replace(/[DC]$/, '');
  // BOPREAL display tickers: BPA7D→BPOA7, BPB7D→BPOB7, etc.
  // Format: BP<X><N>D / BP<X><N>C  →  BPO<X><N>
  const bpMep = t.match(/^BP([A-Z])(\d+)[DC]$/);
  if (bpMep) return `BPO${bpMep[1]}${bpMep[2]}`;
  return t;
}

// ── Abrir calculadora ─────────────────────────────────────────────────────
async function _openBondCalc(ticker, base, mercado) {
  const data = (_allBondsData[mercado] || []);
  const bond = data.find(d => d.ticker === ticker) || { ticker, base, mercado };
  _calcBond = { ...bond, mercado };
  _calcMode = 'amount';

  _buildCalcModal(bond, base, mercado);
  const baseCF = base || _normTickerCF(ticker);
  await _loadCalcCFs(baseCF);
}

// ── Construir y mostrar modal ─────────────────────────────────────────────
function _buildCalcModal(bond, base, mercado) {
  const old = document.getElementById('bond-calc-overlay');
  if (old) old.remove();

  const ccy      = mercado === 'PESOS' ? '$' : 'USD ';
  const mktLabel = { PESOS: 'ARS', MEP: 'USD MEP', CCL: 'USD CCL' }[mercado] || mercado;
  const group    = bond.group === 'BOPREAL' ? 'BOPREAL'
                 : bond.base?.startsWith('GD') ? 'LEY NY' : 'LEY AR';
  const tkCls    = bond.base?.startsWith('GD') ? 'bt2-ny'
                 : bond.group === 'BOPREAL'    ? 'bt2-bp' : 'bt2-ar';

  const fmtP = (v, d=2) => v != null ? ccy + Number(v).toLocaleString('es-AR',{minimumFractionDigits:d,maximumFractionDigits:d}) : 'N/D';
  const fmtPct = v => v != null ? v.toFixed(2).replace('.',',')+'%' : 'N/D';

  const mi = (label, val, cls='') =>
    `<div class="bcc-meta-item"><span class="bcc-meta-label">${label}</span><span class="bcc-meta-val ${cls}">${val}</span></div>`;

  const el = document.createElement('div');
  el.id = 'bond-calc-overlay';
  el.className = 'bcc-overlay';
  el.innerHTML = `
    <div class="bcc-modal">

      <div class="bcc-header">
        <div>
          <span class="bcc-title ${tkCls}">${bond.ticker}</span>
          <span class="bcc-subtitle">CALCULADORA DE BONO SOBERANO</span>
        </div>
        <button class="bcc-close" onclick="document.getElementById('bond-calc-overlay').remove()">✕</button>
      </div>

      <div class="bcc-body">

        <!-- Metadata strip -->
        <div class="bcc-meta">
          ${mi('GRUPO',    group,                        tkCls)}
          ${mi('MERCADO',  mktLabel,                     'accent')}
          ${mi('PRECIO',   fmtP(bond.precio),            '')}
          ${mi('YTM',      fmtPct(bond.tir),             bond.tir > 0 ? 'green' : '')}
          ${mi('DUR.',     bond.duration != null ? bond.duration.toFixed(2).replace('.',',')+' Y' : 'N/D', '')}
          ${mi('MONEDA',   mercado === 'PESOS' ? 'ARS' : 'USD', 'sky')}
        </div>

        <!-- Calculadora -->
        <div class="bcc-card">
          <div class="bcc-card-title">CALCULADORA</div>
          <div class="bcc-card-body">
            <div class="bcc-mode-toggle">
              <button class="bcc-mode-btn active" id="calc-btn-amount" onclick="_setCalcMode('amount')">Por monto invertido</button>
              <button class="bcc-mode-btn"        id="calc-btn-vn"     onclick="_setCalcMode('vn')">Por VN en cartera</button>
            </div>
            <div class="bcc-inputs">
              <div class="bcc-field" id="calc-field-amount">
                <label>Monto bruto a invertir (${mercado === 'PESOS' ? 'ARS' : 'USD'})</label>
                <input type="number" id="calc-input-amount" placeholder="Ej: 100.000" min="0" oninput="_calcUpdate()">
              </div>
              <div class="bcc-field" id="calc-field-vn">
                <label>VN en cartera</label>
                <input type="number" id="calc-input-vn" placeholder="Ej: 100.000" min="0" disabled oninput="_calcUpdate()">
              </div>
              <div class="bcc-field">
                <label>Precio actual (${mktLabel} c/100 VN)</label>
                <input type="number" id="calc-input-price" value="${bond.precio ?? ''}" step="0.0001" oninput="_calcUpdate()">
              </div>
            </div>
            <p class="bcc-note">Comisión: <b>0,5%</b> · Impuestos: <b>0,1%</b> · Costo total entrada: <b>0,6%</b>. El VN se calcula sobre el monto neto aplicado a la compra.</p>
          </div>
        </div>

        <!-- Resumen -->
        <div class="bcc-card" id="bcc-summary">
          <div class="bcc-card-title">RESUMEN ESTIMADO</div>
          <div class="bcc-card-body">
            <p class="bcc-note">Ingresá monto o VN para ver el resumen.</p>
          </div>
        </div>

        <!-- Flujos -->
        <div class="bcc-card">
          <div class="bcc-card-title">FLUJOS DE FONDOS</div>
          <div id="bcc-cf-table">
            <p class="bcc-note" style="padding:12px">Cargando flujos…</p>
          </div>
        </div>

      </div>
    </div>`;

  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });
  const esc = e => { if (e.key === 'Escape') { el.remove(); document.removeEventListener('keydown', esc); } };
  document.addEventListener('keydown', esc);
  _setCalcMode('amount');
}

// ── Toggle modo ───────────────────────────────────────────────────────────
function _setCalcMode(mode) {
  _calcMode = mode;
  document.getElementById('calc-btn-amount')?.classList.toggle('active', mode === 'amount');
  document.getElementById('calc-btn-vn')?.classList.toggle('active', mode === 'vn');
  const amtEl = document.getElementById('calc-input-amount');
  const vnEl  = document.getElementById('calc-input-vn');
  if (mode === 'amount') {
    if (amtEl) amtEl.disabled = false;
    if (vnEl)  { vnEl.value = ''; vnEl.disabled = true; }
  } else {
    if (vnEl)  vnEl.disabled = false;
    if (amtEl) { amtEl.value = ''; amtEl.disabled = true; }
  }
  _calcUpdate();
}

// ── Cálculo por monto bruto ───────────────────────────────────────────────
function _calcFromGross(gross, price) {
  const commission = gross * BUY_COMMISSION_RATE;
  const taxes      = gross * BUY_TAX_RATE;
  const totalCosts = commission + taxes;
  const netAmount  = gross - totalCosts;
  const vn         = price > 0 ? (netAmount / price * 100) : 0;
  return { gross, commission, taxes, totalCosts, netAmount, vn };
}

// ── Cálculo por VN ───────────────────────────────────────────────────────
function _calcFromVN(vn, price) {
  const netAmount  = vn * price / 100;
  const gross      = netAmount / (1 - BUY_TOTAL_COST_RATE);
  const commission = gross * BUY_COMMISSION_RATE;
  const taxes      = gross * BUY_TAX_RATE;
  const totalCosts = commission + taxes;
  return { vn, gross, commission, taxes, totalCosts, netAmount };
}

// ── Actualizar resumen y tabla ────────────────────────────────────────────
function _calcUpdate() {
  const price = parseFloat(document.getElementById('calc-input-price')?.value) || 0;
  if (!price) { _calcClearSummary(); return; }

  let calc;
  if (_calcMode === 'amount') {
    const gross = parseFloat(document.getElementById('calc-input-amount')?.value) || 0;
    if (!gross) { _calcClearSummary(); return; }
    calc = _calcFromGross(gross, price);
  } else {
    const vn = parseFloat(document.getElementById('calc-input-vn')?.value) || 0;
    if (!vn) { _calcClearSummary(); return; }
    calc = _calcFromVN(vn, price);
  }

  const mercado  = _calcBond?.mercado || 'MEP';
  const ccy      = mercado === 'PESOS' ? '$' : 'USD ';
  const fmtM = (v, d=2) => ccy + Number(v).toLocaleString('es-AR',{minimumFractionDigits:d,maximumFractionDigits:d});
  const fmtVN = v => Math.round(v).toLocaleString('es-AR');
  const fmtPx = v => ccy + Number(v).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});

  const totalCF    = _calcCFs.reduce((s, cf) => s + (cf.cashflow || 0), 0);
  const totalInv   = totalCF * calc.vn / 100;
  const lastCF     = _calcCFs.length ? _calcCFs[_calcCFs.length - 1] : null;
  const fmtDate    = s => { if (!s) return '—'; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; };

  const sRow = (label, val, cls='') =>
    `<div class="bcc-sum-row"><span class="bcc-sum-label">${label}</span><span class="bcc-sum-val ${cls}">${val}</span></div>`;

  let col1, col2;
  if (_calcMode === 'amount') {
    col1 = [
      sRow('Monto bruto ingresado', fmtM(calc.gross)),
      sRow('Comisión 0,5%',         fmtM(calc.commission), 'neg'),
      sRow('Impuestos 0,1%',        fmtM(calc.taxes),      'neg'),
      sRow('Costos totales 0,6%',   fmtM(calc.totalCosts), 'neg'),
      sRow('Monto neto aplicado',   fmtM(calc.netAmount),  ''),
    ];
    col2 = [
      sRow('Precio usado',         fmtPx(price)),
      sRow('VN real comprado',     fmtVN(calc.vn),    'accent'),
      sRow('Total flujos futuros', fmtM(totalInv),    'pos'),
      sRow('N.º de flujos',        _calcCFs.length + ''),
      sRow('Último flujo',         fmtDate(lastCF?.fecha || '')),
    ];
  } else {
    col1 = [
      sRow('VN ingresado',         fmtVN(calc.vn),    'accent'),
      sRow('Monto neto de compra', fmtM(calc.netAmount)),
      sRow('Comisión 0,5%',        fmtM(calc.commission), 'neg'),
      sRow('Impuestos 0,1%',       fmtM(calc.taxes),      'neg'),
      sRow('Costos totales 0,6%',  fmtM(calc.totalCosts), 'neg'),
    ];
    col2 = [
      sRow('Monto bruto estimado', fmtM(calc.gross)),
      sRow('Precio usado',         fmtPx(price)),
      sRow('Total flujos futuros', fmtM(totalInv),    'pos'),
      sRow('N.º de flujos',        _calcCFs.length + ''),
      sRow('Último flujo',         fmtDate(lastCF?.fecha || '')),
    ];
  }

  const sumEl = document.querySelector('#bcc-summary .bcc-card-body');
  if (sumEl) {
    sumEl.innerHTML = `<div class="bcc-sum-grid"><div>${col1.join('')}</div><div>${col2.join('')}</div></div>`;
  }

  _renderCalcCFs(calc.vn, ccy);
}

function _calcClearSummary() {
  const sumEl = document.querySelector('#bcc-summary .bcc-card-body');
  if (sumEl) sumEl.innerHTML = `<p class="bcc-note">Ingresá monto o VN para ver el resumen.</p>`;
  _renderCalcCFs(null, '');
}

// ── Cargar cashflows desde API ────────────────────────────────────────────
async function _loadCalcCFs(baseTicker) {
  const el = document.getElementById('bcc-cf-table');
  if (!el) return;
  try {
    const res = await api.bonos.cashflows(baseTicker);
    _calcCFs = res.cashflows || [];
    _renderCalcCFs(null, '');
    _calcUpdate();
  } catch (e) {
    if (el) el.innerHTML = `<p class="bcc-note" style="padding:12px;color:var(--negative)">Error al cargar flujos: ${e.message}</p>`;
  }
}

// ── Renderizar tabla de cashflows ─────────────────────────────────────────
function _renderCalcCFs(vn, ccy) {
  const el = document.getElementById('bcc-cf-table');
  if (!el) return;

  if (!_calcCFs.length) {
    el.innerHTML = `<p class="bcc-note" style="padding:12px">No se encontraron flujos de fondos para este bono.</p>`;
    return;
  }

  const hasCmp = _calcCFs.some(cf => cf.interes != null || cf.principal != null);
  const fmtN = (v, d=4) => v != null ? Number(v).toLocaleString('es-AR',{minimumFractionDigits:d,maximumFractionDigits:d}) : '—';
  const fmtD = s => { const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; };

  const thInv = vn != null ? '<th>TU INVERSIÓN</th>' : '';
  let thead;
  if (hasCmp) {
    thead = `<th style="text-align:left">FECHA</th><th>INTERÉS</th><th>AMORT.</th><th>TOTAL /100VN</th>${thInv}`;
  } else {
    thead = `<th style="text-align:left">FECHA</th><th>TOTAL /100VN</th>${thInv}`;
  }

  const tbody = _calcCFs.map(cf => {
    const inv = vn != null
      ? `<td class="bt2-td-num" style="color:var(--bt2-pos);font-weight:700">${ccy}${fmtN(cf.cashflow * vn / 100, 2)}</td>`
      : '';
    if (hasCmp) {
      return `<tr class="bt2-row">
        <td class="bt2-td-ticker" style="color:var(--bt2-sub)">${fmtD(cf.fecha)}</td>
        <td class="bt2-td-num">${fmtN(cf.interes)}</td>
        <td class="bt2-td-num">${fmtN(cf.principal)}</td>
        <td class="bt2-td-num" style="font-weight:700">${fmtN(cf.cashflow)}</td>
        ${inv}</tr>`;
    }
    return `<tr class="bt2-row">
      <td class="bt2-td-ticker" style="color:var(--bt2-sub)">${fmtD(cf.fecha)}</td>
      <td class="bt2-td-num" style="font-weight:700">${fmtN(cf.cashflow)}</td>
      ${inv}</tr>`;
  }).join('');

  el.innerHTML = `
    <div style="overflow-x:auto">
      <table class="bt2-table" style="font-size:.78rem">
        <thead><tr>${thead}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>`;
}
