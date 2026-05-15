/* ─── Bonos Soberanos — BondTerminal-inspired layout ─────────────────────── */

(window.pages = window.pages || {}).bonos = async function(container) {
  container.innerHTML = `
    <div class="page">
      <div class="page-header"><h1>Bonos Soberanos</h1></div>
      <div id="bonos-tasas" class="dash-tasas-row mb-3"></div>
      <div id="bonos-pills" class="mb-3"></div>
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

// ── Tasas KPIs ────────────────────────────────────────────────────────────
async function _loadTasasBadge(el) {
  if (!el) return;
  try {
    const { tasas = [], spread_ley_ar_vs_ny } = await api.dashboard.tasas();
    el.innerHTML = [
      ...tasas.map(t => ui.kpiCard({ label: t.ticker, value: t.tir != null ? t.tir.toFixed(2) + '%' : '—' })),
      ui.kpiCard({ label: 'Spread Ley AR vs NY', value: spread_ley_ar_vs_ny != null ? `+${Math.abs(spread_ley_ar_vs_ny)} bps` : '—' }),
    ].join('');
  } catch { el.innerHTML = ''; }
}

// ── SOBERANOS main view ───────────────────────────────────────────────────
async function renderSoberanos(container) {
  container.innerHTML = `
    <div class="bt-bonos-layout">

      <!-- LEFT: Snapshot table -->
      <div class="bt-snapshot">
        <div class="bt-snapshot-header">
          <span class="bt-section-label">SNAPSHOT</span>
          <div id="bonos-mercado-pills"></div>
        </div>
        <div id="bonos-snapshot-wrap">
          <div class="skeleton skeleton-table-row mb-1"></div>
          <div class="skeleton skeleton-table-row mb-1"></div>
          <div class="skeleton skeleton-table-row mb-1"></div>
          <div class="skeleton skeleton-table-row mb-1"></div>
          <div class="skeleton skeleton-table-row mb-1"></div>
          <div class="skeleton skeleton-table-row mb-1"></div>
        </div>
      </div>

      <!-- RIGHT: Curve + RP + Top TIR -->
      <div class="bt-right-col">

        <!-- Sovereign Curve -->
        <div class="bt-panel mb-3">
          <div class="bt-panel-header">
            <span class="bt-section-label">SOVEREIGN CURVE</span>
          </div>
          <div id="chart-curva-tir"></div>
        </div>

        <!-- Bottom row: RP + Top TIR -->
        <div class="bt-bottom-row">

          <!-- Riesgo País -->
          <div class="bt-panel">
            <div class="bt-rp-header">
              <div>
                <div class="bt-section-label">RIESGO PAÍS (EMBI)</div>
                <div class="bt-rp-value" id="rp-value">—</div>
                <div class="bt-rp-changes" id="rp-changes"></div>
              </div>
              <div id="rp-period-pills"></div>
            </div>
            <div id="chart-riesgo-pais"></div>
          </div>

          <!-- Most viewed (Top TIR) -->
          <div class="bt-panel">
            <div class="bt-panel-header">
              <span class="bt-section-label">MAYOR TIR — MEP</span>
            </div>
            <div id="bonos-top-tir"></div>
          </div>

        </div>
      </div>
    </div>`;

  let activeMercado = 'MEP';
  let allBondsData  = [];
  let rpHistData    = [];

  // Mercado pills
  const mpills = ui.pills(['PESOS', 'MEP', 'CCL'], 1, async (_, label) => {
    activeMercado = label;
    _renderSnapshotTable(allBondsData.filter(d => d.mercado === label || !d.mercado), label);
  }, 'pills-sm');
  document.getElementById('bonos-mercado-pills').appendChild(mpills);

  // Period pills for Riesgo País
  const rpPills = ui.pills(['3M', '6M', '1A', '2A', 'MAX'], 2, (_, label) => {
    _renderRPChart(rpHistData, label);
  }, 'pills-sm');
  document.getElementById('rp-period-pills').appendChild(rpPills);

  // Load everything in parallel
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
      `<p class="text-negative text-sm" style="font-family:var(--font-mono);padding:12px">${bondsRes.reason?.message || 'Error cargando datos'}</p>`;
  }

  if (rpRes.status === 'fulfilled') {
    rpHistData = rpRes.value;
    _renderRPHeader(rpHistData);
    _renderRPChart(rpHistData, '1A');
  }
}

// ── Snapshot table (bondterminal SNAPSHOT style) ──────────────────────────
function _renderSnapshotTable(data, mercado) {
  const wrap = document.getElementById('bonos-snapshot-wrap');
  if (!wrap) return;

  const EXCLUDED = new Set(['BPY26', 'BPY6D', 'BPY6C']);

  function buildGroup(label, colorVar, items) {
    if (!items.length) return '';
    const rows = items.map(d => `
      <tr>
        <td class="bt-ticker" style="color:${colorVar}">${d.ticker}</td>
        <td class="bt-num">${d.precio ? _n(d.precio) : '—'}</td>
        <td class="bt-num ${d.tir != null && d.tir >= 0 ? 'bt-tir-pos' : 'bt-tir-neg'}">${d.tir != null ? d.tir.toFixed(2) + '%' : '—'}</td>
        <td class="bt-num">${_n(d.duration, 1)}</td>
      </tr>`).join('');
    return `
      <tr class="bt-group-hdr"><td colspan="4">${label}</td></tr>
      ${rows}`;
  }

  const globales  = data.filter(d => d.base?.startsWith('GD') && d.group !== 'BOPREAL' && !EXCLUDED.has(d.ticker));
  const bonares   = data.filter(d => ['AL','AE','AN','AO'].some(p => d.base?.startsWith(p)) && d.group !== 'BOPREAL' && !EXCLUDED.has(d.ticker));
  const bopreales = data.filter(d => d.group === 'BOPREAL' && !EXCLUDED.has(d.ticker));

  // Weighted avg TIR
  const allValid = [...globales, ...bonares].filter(d => d.tir != null);
  const avgTIR   = allValid.length ? (allValid.reduce((s, d) => s + d.tir, 0) / allValid.length).toFixed(2) : '—';

  wrap.innerHTML = `
    <table class="bt-snapshot-table">
      <thead>
        <tr>
          <th style="text-align:left">TICKER</th>
          <th>PRECIO USD</th>
          <th>TIR</th>
          <th>DUR.</th>
        </tr>
      </thead>
      <tbody>
        ${buildGroup('— SOBERANOS LEY NY', 'var(--sky)',    globales)}
        ${buildGroup('— SOBERANOS LEY AR', 'var(--violet)', bonares)}
        ${bopreales.length ? buildGroup('— BOPREAL (USD)', 'var(--emerald)', bopreales) : ''}
        <tr class="bt-total-row">
          <td colspan="2">Total</td>
          <td class="bt-num bt-tir-pos">${avgTIR !== '—' ? avgTIR + '%' : '—'}</td>
          <td></td>
        </tr>
      </tbody>
    </table>`;
}

// ── Sovereign Curve (bondterminal style) ──────────────────────────────────
function _renderCurvaTIR(data) {
  const EXCLUDED = new Set(['BPY26', 'BPY6D', 'BPY6C']);
  const valid = data.filter(d => d.tir !== null && d.duration !== null && d.group !== 'BOPREAL' && !EXCLUDED.has(d.ticker));

  const globales = valid.filter(d => d.base?.startsWith('GD'));
  const bonares  = valid.filter(d => ['AL','AE','AN','AO'].some(p => d.base?.startsWith(p)));

  const series = [];
  if (globales.length) series.push({
    name: 'NY Law', color: dcfCharts.COLORS.sky, symbolSize: 10,
    data: globales.map(d => ({ x: d.duration, y: d.tir, label: d.base })),
    showLabels: true,
  });
  if (bonares.length) series.push({
    name: 'Arg Law', color: dcfCharts.COLORS.emerald, symbolSize: 10,
    data: bonares.map(d => ({ x: d.duration, y: d.tir, label: d.base })),
    showLabels: true,
  });

  // Compute Y range with some padding
  const allTIRs = valid.map(d => d.tir);
  const minY = Math.max(0, Math.floor(Math.min(...allTIRs) - 1));
  const maxY = Math.ceil(Math.max(...allTIRs) + 1.5);

  dcfCharts.renderScatterBT('chart-curva-tir', series, {
    height: 260,
    xLabel: 'Modified Duration (yr)',
    yLabel: 'YTM (%)',
    yMin: minY,
    yMax: maxY,
    yFormatter: v => `${v?.toFixed(1)}%`,
  });
}

// ── Riesgo País header (large value + 1D/1W/1M) ───────────────────────────
function _renderRPHeader(hist) {
  if (!hist?.length) return;
  const last  = hist[hist.length - 1];
  const val   = Math.round(last.valor);
  const d1    = hist.length > 1  ? Math.round(val - hist[hist.length - 2].valor)  : 0;
  const w1    = hist.length > 5  ? Math.round(val - hist[hist.length - 6].valor)  : 0;
  const m1    = hist.length > 22 ? Math.round(val - hist[hist.length - 22].valor) : 0;

  const sign = v => v > 0 ? `+${v}` : String(v);
  const col  = v => v > 0 ? 'var(--negative)' : v < 0 ? 'var(--positive)' : 'var(--text-muted)';

  document.getElementById('rp-value').innerHTML =
    `<span style="font-size:2.2rem;font-weight:800;font-family:var(--font-mono)">${val}</span><span style="font-size:0.9rem;color:var(--text-muted);margin-left:4px">bps</span>`;

  document.getElementById('rp-changes').innerHTML = `
    <div class="bt-rp-change-grid">
      <span class="bt-rp-period">1D</span><span style="color:${col(d1)}">${sign(d1)}</span>
      <span class="bt-rp-period">1W</span><span style="color:${col(w1)}">${sign(w1)}</span>
      <span class="bt-rp-period">1M</span><span style="color:${col(m1)}">${sign(m1)}</span>
    </div>`;
}

// ── Riesgo País chart ─────────────────────────────────────────────────────
const _rpDays = { '3M': 90, '6M': 180, '1A': 365, '2A': 730, 'MAX': 99999 };

function _renderRPChart(hist, period) {
  if (!hist?.length) return;
  const days = _rpDays[period] || 365;
  const data = hist.slice(-days);
  dcfCharts.renderLine('chart-riesgo-pais', [
    { name: 'EMBI', data: data.map(d => d.valor), color: dcfCharts.COLORS.accent, area: true }
  ], { height: 110, xLabels: data.map(d => d.fecha), yFormatter: v => `${Math.round(v)}` });
}

// ── Top TIR (MOST VIEWED style) ───────────────────────────────────────────
function _renderTopTIR(data) {
  const el = document.getElementById('bonos-top-tir');
  if (!el) return;
  const EXCLUDED = new Set(['BPY26', 'BPY6D', 'BPY6C']);
  const sorted = data
    .filter(d => d.tir !== null && d.group !== 'BOPREAL' && !EXCLUDED.has(d.ticker))
    .sort((a, b) => b.tir - a.tir)
    .slice(0, 7);

  el.innerHTML = `
    <table class="bt-most-viewed">
      <tbody>
        ${sorted.map(d => `
          <tr>
            <td class="bt-mv-ticker ${d.base?.startsWith('GD') ? 'bt-sky' : 'bt-violet'}">${d.ticker}</td>
            <td class="bt-mv-sub">${_n(d.duration, 1)}yr</td>
            <td class="bt-mv-tir">${d.tir.toFixed(2)}%</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// ── SENSIBILIDAD ──────────────────────────────────────────────────────────
async function renderSensibilidad(container) {
  container.innerHTML = `
    <div>
      <div id="sensi-pills" class="mb-3"></div>
      <div id="sensi-table"></div>
    </div>`;

  const loadSensi = async (tipo) => {
    const tEl = document.getElementById('sensi-table');
    tEl.innerHTML = '<p class="text-muted text-sm" style="font-family:var(--font-mono)">Calculando...</p>';
    const data = await api.bonos.sensibilidad(tipo).catch(() => []);
    if (!data?.length) { tEl.innerHTML = '<p class="text-muted text-sm" style="font-family:var(--font-mono)">Sin datos</p>'; return; }
    const shifts  = Object.keys(data[0]).filter(k => k.startsWith('shift_'));
    const headers = ['Ticker', 'TIR Base', ...shifts.map(s => s.replace('shift_', ''))];
    const rows    = data.map(d => [
      `<span class="ticker-sky font-semibold">${d.ticker}</span>`,
      `${d.tir_base?.toFixed(2)}%`,
      ...shifts.map(s => `<span class="${d[s] >= 0 ? 'change-pos' : 'change-neg'} tabular">${d[s]?.toFixed(2)}%</span>`),
    ]);
    tEl.innerHTML = '';
    tEl.appendChild(ui.btTable(headers, rows, { maxHeight: 500 }));
  };

  const pEl = document.getElementById('sensi-pills');
  pEl.appendChild(ui.pills(['GLOBALES', 'BONARES', 'BOPREAL'], 0, (_, tipo) => loadSensi(tipo)));
  await loadSensi('GLOBALES');
}

// ── Helpers ───────────────────────────────────────────────────────────────
function _n(v, d = 2) {
  if (v == null) return '—';
  return Number(v).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
}
