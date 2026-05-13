/* ─── Bonos Soberanos page ───────────────────────────────────────────────── */

(window.pages = window.pages || {}).bonos = async function(container) {
  container.innerHTML = `
    <div class="page">
      <div class="page-header"><h1>Bonos Soberanos</h1></div>

      <!-- Tasas soberanas KPIs -->
      <div id="bonos-tasas" class="dash-tasas-row mb-3"></div>

      <div id="bonos-pills" class="mb-3"></div>
      <div id="bonos-content"></div>
    </div>`;

  // Load tasas soberanas at the top
  _loadTasasBadge(container.querySelector('#bonos-tasas'));

  const pillEl = document.getElementById('bonos-pills');
  const content = document.getElementById('bonos-content');

  const pillsEl = ui.pills(['SOBERANOS', 'SENSIBILIDAD'], 0, (i) => {
    if (i === 0) renderSoberanos(content);
    else renderSensibilidad(content);
  });
  pillEl.appendChild(pillsEl);

  renderSoberanos(content);
};

async function _loadTasasBadge(el) {
  if (!el) return;
  el.innerHTML = ui.skeletonKpiRow(5).outerHTML;
  try {
    const { tasas = [], spread_ley_ar_vs_ny } = await api.dashboard.tasas();
    const labels = { AL30D: 'AL30D', GD30D: 'GD30D', AL35D: 'AL35D', GD35D: 'GD35D' };
    el.innerHTML = [
      ...tasas.map(t => ui.kpiCard({ label: labels[t.ticker] || t.ticker,
        value: t.tir != null ? t.tir.toFixed(2) + '%' : '—' })),
      ui.kpiCard({ label: 'Spread Ley AR vs NY',
        value: spread_ley_ar_vs_ny != null ? `+${Math.abs(spread_ley_ar_vs_ny)} bps` : '—' }),
    ].join('');
  } catch { el.innerHTML = ''; }
}

async function renderSoberanos(container) {
  container.innerHTML = `
    <div class="bonos-layout">
      <div>
        <div id="bonos-section-tabla"></div>
        <div id="bonos-tabla-wrap"></div>
      </div>
      <div>
        <div class="card mb-3">
          <div class="card-header">
            <div class="card-title">Curva TIR — Hard Dollar</div>
          </div>
          <div id="chart-curva-tir"></div>
        </div>
        <div class="card mb-3">
          <div class="card-title" style="padding:10px 12px 0">Bond Market Heatmap</div>
          <div id="chart-bonos-treemap"></div>
        </div>
        <div class="card mb-3">
          <div class="card-title" style="padding:10px 12px 0">Riesgo País (EMBI)</div>
          <div id="chart-riesgo-pais"></div>
        </div>
      </div>
    </div>`;

  // Load in parallel
  const [full, rp] = await Promise.allSettled([
    api.bonos.todos(),
    api.bonos.riesgoPais(),
  ]);

  if (full.status === 'fulfilled') {
    _renderBonosTabla(full.value);
    _renderCurvaTIR(full.value);
    _renderBonosTreemap(full.value);
  }

  if (rp.status === 'fulfilled') {
    _renderRiesgoPais(rp.value);
  }
}

function _renderBonosTabla(data) {
  const secEl = document.getElementById('bonos-section-tabla');
  if (secEl) secEl.innerHTML = ui.sectionLabel('Tabla unificada — MEP');
  const wrap = document.getElementById('bonos-tabla-wrap');
  if (!wrap) return;

  // Filter to MEP only for default view
  const mep = data.filter(d => d.mercado === 'MEP');

  // Group by bond family
  const globales  = mep.filter(d => d.base?.startsWith('GD'));
  const bonares   = mep.filter(d => ['AL','AE','AN','AO'].some(p => d.base?.startsWith(p)));
  const bopreales = mep.filter(d => d.group === 'BOPREAL');

  const headers = ['Ticker', 'Precio USD', 'TIR %', 'Dur. Mod'];

  function groupRows(items, cls, label, color) {
    if (!items.length) return '';
    const rows = items.map(d => [
      `<span class="${color} font-semibold tabular">${d.ticker}</span>`,
      fmt.usd(d.precio, 2),
      d.tir !== null ? `<span class="${ui.tirColor(d.tir)} tabular">${fmt.num(d.tir)}%</span>` : '—',
      fmt.num(d.duration, 2),
    ]);
    const table = ui.btTable(headers, rows, { maxHeight: null });
    const groupHeader = `<div class="bond-group-header ${cls} mb-2">${label}</div>`;
    return groupHeader + table.outerHTML;
  }

  wrap.innerHTML =
    groupRows(globales,  'bond-group-ny',      '🇺🇸 Soberanos Ley NY',   'ticker-sky') +
    groupRows(bonares,   'bond-group-ar',      '🇦🇷 Soberanos Ley AR',   'ticker-violet') +
    groupRows(bopreales, 'bond-group-bopreal', 'BOPREAL (USD)',          'ticker-emerald');
}

function _renderCurvaTIR(data) {
  const mep = data.filter(d => d.mercado === 'MEP' && d.tir !== null && d.duration !== null);
  const globales  = mep.filter(d => d.base?.startsWith('GD'));
  const bonares   = mep.filter(d => ['AL','AE','AN','AO'].some(p => d.base?.startsWith(p)));
  const bopreales = mep.filter(d => d.group === 'BOPREAL');

  const series = [];
  if (globales.length) series.push({ name: 'Ley NY', color: dcfCharts.COLORS.sky,
    data: globales.map(d => ({ x: d.duration, y: d.tir, label: d.base })), showLabels: true });
  if (bonares.length) series.push({ name: 'Ley AR', color: dcfCharts.COLORS.violet,
    data: bonares.map(d => ({ x: d.duration, y: d.tir, label: d.base })), showLabels: true });
  if (bopreales.length) series.push({ name: 'BOPREAL', color: dcfCharts.COLORS.emerald,
    data: bopreales.map(d => ({ x: d.duration, y: d.tir, label: d.base })), showLabels: true });

  dcfCharts.renderScatter('chart-curva-tir', series, {
    height: 260, xLabel: 'Dur. Mod', yLabel: 'TIR %',
    yFormatter: v => `${v?.toFixed(2)}%`,
  });
}

function _renderBonosTreemap(data) {
  const el = document.getElementById('chart-bonos-treemap');
  if (!el) return;
  const mep = data.filter(d => d.mercado === 'MEP' && d.tir !== null);
  // Add group field based on family
  mep.forEach(d => {
    if (d.group === 'BOPREAL') d._fam = 'BOPREAL';
    else if (d.base?.startsWith('GD')) d._fam = 'Soberanos NY';
    else d._fam = 'Soberanos AR';
  });
  dcfCharts.renderTreemap('chart-bonos-treemap', mep, {
    height: 300, labelKey: 'base', valueKey: 'tir',
    priceKey: 'precio', extraKey: 'tir', extraLabel: 'TIR',
    groupKey: '_fam', periodLabel: 'TIR',
  });
}

function _renderRiesgoPais(data) {
  if (!data || !data.length) return;
  const dates = data.map(d => d.fecha);
  const values = data.map(d => d.valor);
  dcfCharts.renderLine('chart-riesgo-pais', [
    { name: 'Riesgo País', data: values, color: dcfCharts.COLORS.accent, area: true }
  ], { height: 200, xLabels: dates });
}

async function renderSensibilidad(container) {
  container.innerHTML = `
    <div>
      <div id="sensi-pills" class="mb-4"></div>
      <div id="sensi-table"></div>
    </div>`;

  const pillEl = document.getElementById('sensi-pills');
  const tableEl = document.getElementById('sensi-table');

  const loadSensi = async (tipo) => {
    tableEl.innerHTML = '<p class="text-muted text-sm">Calculando...</p>';
    const data = await api.bonos.sensibilidad(tipo).catch(() => []);
    _renderSensibilidadTable(tableEl, data);
  };

  const pillsEl = ui.pills(['GLOBALES', 'BONARES', 'BOPREAL'], 0, (_, tipo) => loadSensi(tipo));
  pillEl.appendChild(pillsEl);
  await loadSensi('GLOBALES');
}

function _renderSensibilidadTable(container, data) {
  if (!data || !data.length) {
    container.innerHTML = '<p class="text-muted text-sm">Sin datos de sensibilidad</p>';
    return;
  }
  const shifts = Object.keys(data[0]).filter(k => k.startsWith('shift_'));
  const headers = ['Ticker', 'TIR Base', ...shifts.map(s => s.replace('shift_', ''))];
  const rows = data.map(d => [
    `<span class="ticker-sky font-semibold">${d.ticker}</span>`,
    `${d.tir_base?.toFixed(2)}%`,
    ...shifts.map(s => {
      const v = d[s];
      const cls = v >= 0 ? 'change-pos' : 'change-neg';
      return `<span class="${cls} tabular">${v?.toFixed(2)}%</span>`;
    }),
  ]);

  const table = ui.btTable(headers, rows, { maxHeight: 500 });
  container.innerHTML = '';
  container.appendChild(table);
}
