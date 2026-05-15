/* ─── Bonos Soberanos — BondTerminal v2 ──────────────────────────────────── */

const EXCLUDED_BPY = new Set(['BPY26', 'BPY6D', 'BPY6C']);

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
    const { tasas = [], spread_ley_ar_vs_ny } = await api.dashboard.tasas();
    el.innerHTML = [
      ...tasas.map(t => `
        <div class="bt2-kpi-card">
          <div class="bt2-kpi-label">${t.ticker}</div>
          <div class="bt2-kpi-value">${t.tir != null ? t.tir.toFixed(2) + '%' : '—'}</div>
        </div>`),
      `<div class="bt2-kpi-card bt2-kpi-spread">
        <div class="bt2-kpi-label">SPREAD LEY AR VS NY</div>
        <div class="bt2-kpi-value bt2-accent">${spread_ley_ar_vs_ny != null ? '+' + Math.abs(spread_ley_ar_vs_ny) + ' bps' : '—'}</div>
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
            <span class="bt2-expand-btn" title="Expandir">⤢</span>
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
    </div>`;

  let allBondsData = [];
  let rpHistData   = [];

  // Mercado pills
  const mp = ui.pills(['PESOS', 'MEP', 'CCL'], 1, async (_, lbl) => {
    _renderSnapshotTable(allBondsData, lbl);
  }, 'pills-sm');
  document.getElementById('bonos-mercado-pills').appendChild(mp);

  // Period pills
  const rpp = ui.pills(['3M', '6M', '1A', '2A', 'MAX'], 2, (_, lbl) => {
    _renderRPChart(rpHistData, lbl);
  }, 'pills-sm');
  document.getElementById('rp-period-pills').appendChild(rpp);

  // Load parallel
  const [bondsRes, rpRes] = await Promise.allSettled([
    api.bonos.todos('MEP'),
    api.bonos.riesgoPais(),
  ]);

  if (bondsRes.status === 'fulfilled') {
    allBondsData = bondsRes.value;
    _renderSnapshotTable(allBondsData, 'MEP');
    _renderCurvaTIR(allBondsData);
    _renderTopTIR(allBondsData);
  } else {
    document.getElementById('bonos-snapshot-wrap').innerHTML =
      `<p style="padding:12px;font-family:var(--font-mono);color:var(--negative);font-size:.78rem">${bondsRes.reason?.message || 'Error'}</p>`;
  }

  if (rpRes.status === 'fulfilled') {
    rpHistData = rpRes.value;
    _renderRPHeader(rpHistData);
    _renderRPChart(rpHistData, '1A');
  }
}

// ── Snapshot table (BondTerminal style) ──────────────────────────────────
function _renderSnapshotTable(data, mercado) {
  const wrap = document.getElementById('bonos-snapshot-wrap');
  if (!wrap) return;

  const filt = data.filter(d => d.mercado === mercado && !EXCLUDED_BPY.has(d.ticker));

  const globales  = filt.filter(d => d.base?.startsWith('GD') && d.group !== 'BOPREAL');
  const bonares   = filt.filter(d => ['AL','AE','AN','AO'].some(p => d.base?.startsWith(p)) && d.group !== 'BOPREAL');
  const bopreales = filt.filter(d => d.group === 'BOPREAL');

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
function _renderCurvaTIR(data) {
  const valid = data.filter(d =>
    d.tir != null && d.duration != null && d.group !== 'BOPREAL' && !EXCLUDED_BPY.has(d.ticker)
  );
  const globales = valid.filter(d => d.base?.startsWith('GD'));
  const bonares  = valid.filter(d => ['AL','AE','AN','AO'].some(p => d.base?.startsWith(p)));

  const allTIRs = valid.map(d => d.tir);
  const minY = allTIRs.length ? Math.max(0, Math.floor(Math.min(...allTIRs) - 0.5)) : 4;
  const maxY = allTIRs.length ? Math.ceil(Math.max(...allTIRs) + 1.5) : 13;

  dcfCharts.renderScatterBT('chart-curva-tir', [
    { name: 'NY Law',  color: '#4DA3FF', data: globales.map(d => ({ x: d.duration, y: d.tir, label: d.base })), showLabels: true },
    { name: 'Arg Law', color: '#00D084', data: bonares.map(d => ({ x: d.duration, y: d.tir, label: d.base })), showLabels: true },
  ], { height: 360, xLabel: 'Modified Duration (yr)', yLabel: 'YTM (%)', yMin: minY, yMax: maxY, yFormatter: v => `${v?.toFixed(1)}%`, trendLines: true });
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

const _rpDays = { '3M': 90, '6M': 180, '1A': 365, '2A': 730, 'MAX': 9999 };
function _renderRPChart(hist, period) {
  if (!hist?.length) return;
  const data = hist.slice(-(_rpDays[period] || 365));
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
    .sort((a, b) => b.tir - a.tir).slice(0, 7);

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
