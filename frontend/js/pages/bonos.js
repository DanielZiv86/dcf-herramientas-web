/* ─── Bonos Soberanos — BondTerminal v2 ──────────────────────────────────── */

const EXCLUDED_BPY = new Set(['BPY26', 'BPY6D', 'BPY6C']);

// Module-level state for BOPREAL toggle (persists across tab switches)
let _showBopreal = false;

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

  _loadTasasBadge(document.getElementById('bonos-tasas'));

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
              <span class="bt2-panel-title">MAYOR TIR — MEP</span>
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
        <div id="heatmap-mercado-pills"></div>
      </div>
      <div id="chart-heatmap"></div>
      <div class="bt2-heatmap-legend">
        <span class="bt2-legend-item"><span class="bt2-legend-dot bt2-leg-neg"></span>Negative</span>
        <span class="bt2-legend-item"><span class="bt2-legend-dot bt2-leg-flat"></span>Flat / unavailable</span>
        <span class="bt2-legend-item"><span class="bt2-legend-dot bt2-leg-pos"></span>Positive</span>
      </div>
    </div>`;

  let allBondsData = { PESOS: [], MEP: [], CCL: [] };
  let rpHistData   = [];

  // Snapshot mercado pills
  const mp = ui.pills(['PESOS', 'MEP', 'CCL'], 1, (_, lbl) => {
    _renderSnapshotTable(allBondsData[lbl] || [], lbl);
  }, 'pills-sm');
  document.getElementById('bonos-mercado-pills').appendChild(mp);

  // Period pills — solo 1M / 3M / 6M, default 1M
  const rpp = ui.pills(['1M', '3M', '6M'], 0, (_, lbl) => {
    _renderRPChart(rpHistData, lbl);
  }, 'pills-sm');
  document.getElementById('rp-period-pills').appendChild(rpp);

  // Heatmap mercado pills (independent from snapshot)
  const hmp = ui.pills(['PESOS', 'MEP', 'CCL'], 1, (_, lbl) => {
    _renderHeatmap(allBondsData[lbl] || [], lbl);
  }, 'pills-sm');
  document.getElementById('heatmap-mercado-pills').appendChild(hmp);

  // BOPREAL toggle for sovereign curve
  const bopBtn = document.getElementById('bop-toggle');
  if (bopBtn) {
    bopBtn.classList.toggle('active', _showBopreal);
    bopBtn.addEventListener('click', () => {
      _showBopreal = !_showBopreal;
      bopBtn.classList.toggle('active', _showBopreal);
      _renderCurvaTIR(allBondsData.MEP, _showBopreal);
    });
  }

  // Fetch the three markets + riesgo país in parallel
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
    allBondsData = {
      PESOS: pesosRes.status === 'fulfilled' ? pesosRes.value : [],
      MEP:   mepRes.status   === 'fulfilled' ? mepRes.value   : [],
      CCL:   cclRes.status   === 'fulfilled' ? cclRes.value   : [],
    };
    _renderSnapshotTable(allBondsData.MEP, 'MEP');
    _renderCurvaTIR(allBondsData.MEP, _showBopreal);
    _renderTopTIR(allBondsData.MEP);
    _renderHeatmap(allBondsData.MEP, 'MEP');
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

// ── Snapshot table (BondTerminal style) ──────────────────────────────────
function _renderSnapshotTable(data, mercado) {
  const wrap = document.getElementById('bonos-snapshot-wrap');
  if (!wrap) return;

  // data is already the market-specific array; filter excluded tickers only
  const filt = data.filter(d => !EXCLUDED_BPY.has(d.ticker));

  const globales  = filt.filter(d => d.base?.startsWith('GD') && d.group !== 'BOPREAL');
  const bonares   = filt.filter(d => ['AL','AE','AN','AO'].some(p => d.base?.startsWith(p)) && d.group !== 'BOPREAL');
  const bopreales = filt.filter(d => d.group === 'BOPREAL');

  if (!globales.length && !bonares.length && !bopreales.length) {
    wrap.innerHTML = `<p style="padding:16px 12px;font-family:var(--font-mono);color:var(--text-muted);font-size:.75rem">Sin datos disponibles para este mercado</p>`;
    return;
  }

  const allValid = [...globales, ...bonares].filter(d => d.tir != null);
  const avgTIR   = allValid.length ? (allValid.reduce((s, d) => s + d.tir, 0) / allValid.length) : null;

  function rows(items, cls) {
    return items.map(d => `
      <tr class="bt2-row">
        <td class="bt2-td-ticker ${cls}">${d.ticker}</td>
        <td class="bt2-td-num">${d.precio ? _n(d.precio) : '—'}</td>
        <td class="bt2-td-num ${d.tir != null ? (d.tir >= 0 ? 'bt2-pos' : 'bt2-neg') : ''}">${d.tir != null ? d.tir.toFixed(2) + '%' : '—'}</td>
        <td class="bt2-td-num bt2-sub">${_n(d.duration, 1)}</td>
      </tr>`).join('');
  }

  function groupHdr(label) {
    return `<tr class="bt2-group-hdr"><td colspan="4">${label}</td></tr>`;
  }

  wrap.innerHTML = `
    <table class="bt2-table">
      <thead>
        <tr>
          <th style="text-align:left">TICKER</th>
          <th>PRECIO</th>
          <th>TIR</th>
          <th>DUR.</th>
        </tr>
      </thead>
      <tbody>
        ${globales.length  ? groupHdr('SOBERANOS LEY NY')  + rows(globales,  'bt2-ny')  : ''}
        ${bonares.length   ? groupHdr('SOBERANOS LEY AR')  + rows(bonares,   'bt2-ar')  : ''}
        ${bopreales.length ? groupHdr('BOPREAL (USD)')     + rows(bopreales, 'bt2-bp')  : ''}
        <tr class="bt2-total-row">
          <td colspan="2">Total</td>
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

  dcfCharts.renderScatterBT('chart-curva-tir', series, { height: 360, xLabel: 'Modified Duration (yr)', yLabel: 'YTM (%)', yMin: minY, yMax: maxY, yFormatter: v => `${v?.toFixed(1)}%`, trendLines: true });
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

// ── SENSIBILIDAD ──────────────────────────────────────────────────────────
async function renderSensibilidad(container) {
  container.innerHTML = `
    <div style="padding:4px 0">
      <div id="sensi-pills" class="mb-3"></div>
      <div id="sensi-table"></div>
    </div>`;

  const loadSensi = async (tipo) => {
    const tEl = document.getElementById('sensi-table');
    tEl.innerHTML = `<p style="font-family:var(--font-mono);color:var(--text-muted);padding:12px;font-size:.78rem">Calculando sensibilidad...</p>`;
    const data = await api.bonos.sensibilidad(tipo).catch(() => []);
    if (!data?.length) { tEl.innerHTML = `<p style="font-family:var(--font-mono);color:var(--text-muted);padding:12px;font-size:.78rem">Sin datos</p>`; return; }
    const shifts  = Object.keys(data[0]).filter(k => k.startsWith('shift_'));
    const headers = ['Ticker', 'TIR Base', ...shifts.map(s => s.replace('shift_', ''))];
    const rows    = data.map(d => [
      `<span class="bt2-ny" style="font-weight:700">${d.ticker}</span>`,
      `${d.tir_base?.toFixed(2)}%`,
      ...shifts.map(s => `<span style="color:${d[s] >= 0 ? 'var(--positive)' : 'var(--negative)'};font-family:var(--font-mono)">${d[s]?.toFixed(2)}%</span>`),
    ]);
    tEl.innerHTML = '';
    tEl.appendChild(ui.btTable(headers, rows, { maxHeight: 500 }));
  };

  document.getElementById('sensi-pills').appendChild(
    ui.pills(['GLOBALES', 'BONARES', 'BOPREAL'], 0, (_, t) => loadSensi(t))
  );
  await loadSensi('GLOBALES');
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
