/* ─── Bonos Soberanos page — replicates Streamlit layout ─────────────────── */

(window.pages = window.pages || {}).bonos = async function(container) {
  container.innerHTML = `
    <div class="page">
      <div class="page-header"><h1>Bonos Soberanos</h1></div>

      <!-- Tasas KPIs -->
      <div id="bonos-tasas" class="dash-tasas-row mb-3"></div>

      <!-- Pills -->
      <div id="bonos-pills" class="mb-3"></div>
      <div id="bonos-content"></div>
    </div>`;

  _loadTasasBadge(document.getElementById('bonos-tasas'));

  const pillEl  = document.getElementById('bonos-pills');
  const content = document.getElementById('bonos-content');

  const pillsEl = ui.pills(['SOBERANOS', 'SENSIBILIDAD'], 0, (i) => {
    if (i === 0) renderSoberanos(content);
    else         renderSensibilidad(content);
  });
  pillEl.appendChild(pillsEl);

  renderSoberanos(content);
};

// ── Tasas soberanas KPIs ──────────────────────────────────────────────────

async function _loadTasasBadge(el) {
  if (!el) return;
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

// ── SOBERANOS view ────────────────────────────────────────────────────────

async function renderSoberanos(container) {
  container.innerHTML = `
    <div class="bonos-layout">

      <!-- Left: tabla + mercado selector -->
      <div>
        <div class="flex items-center gap-3 mb-3">
          <div class="text-muted text-xs uppercase" style="font-family:var(--font-mono)">Mercado</div>
          <div id="bonos-mercado-pills"></div>
        </div>
        <div id="bonos-section-tabla"></div>
        <div id="bonos-tabla-wrap"></div>
      </div>

      <!-- Right: curva + riesgo pais + top TIR -->
      <div>
        <div class="card mb-3">
          <div class="card-header">
            <div class="card-title">Curva TIR — Hard Dollar (MEP)</div>
          </div>
          <div id="chart-curva-tir"></div>
        </div>
        <div class="card mb-3">
          <div class="card-header">
            <div class="card-title" id="rp-title">Riesgo País (EMBI)</div>
            <div id="rp-pills"></div>
          </div>
          <div id="chart-riesgo-pais"></div>
        </div>
        <div class="card">
          <div class="card-title" style="padding:10px 12px 6px">Mayor TIR — MEP</div>
          <div id="bonos-top-tir"></div>
        </div>
      </div>
    </div>`;

  let activeMercado = 'MEP';

  // Mercado pills
  const mpEl = document.getElementById('bonos-mercado-pills');
  const mpills = ui.pills(['PESOS', 'MEP', 'CCL'], 1, async (_, label) => {
    activeMercado = label;
    await _loadBondTable(label);
    _renderCurvaTIR(label);
  }, 'pills-sm');
  mpEl.appendChild(mpills);

  // Riesgo País period pills
  const rpPillEl = document.getElementById('rp-pills');
  const rpPills = ui.pills(['3M', '6M', '1A', '2A', 'MAX'], 2, (_, label) => _loadRiesgoPais(label), 'pills-sm');
  rpPillEl.appendChild(rpPills);

  // Load all in parallel
  document.getElementById('bonos-section-tabla').innerHTML =
    ui.sectionLabel('Soberanos Ley NY / Ley AR / BOPREAL');

  await Promise.allSettled([
    _loadBondTable('MEP'),
    _loadRiesgoPais('1A'),
  ]);

  _renderCurvaTIR('MEP');
}

// ── Bond table ────────────────────────────────────────────────────────────

async function _loadBondTable(mercado) {
  const wrap = document.getElementById('bonos-tabla-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  wrap.appendChild(ui.skeletonTable(12, 5));

  try {
    const data = await api.bonos.todos(mercado);
    _renderBonosTabla(wrap, data, mercado);
    _renderTopTIR(data);
  } catch (e) {
    wrap.innerHTML = `<p class="text-negative text-sm" style="font-family:var(--font-mono);padding:12px">${e.message}</p>`;
  }
}

function _renderBonosTabla(container, data, mercado) {
  const headers = ['Ticker', 'Precio USD', 'Dur. Mod', 'TIR %'];

  function group(label, colorClass, items) {
    if (!items.length) return '';
    const rows = items.map(d => [
      `<span class="${colorClass} font-semibold tabular">${d.ticker}</span>`,
      d.precio ? `$${_n(d.precio)}` : '—',
      _n(d.duration, 2),
      d.tir != null
        ? `<span class="${d.tir >= 0 ? 'tir-positive' : 'tir-negative'} font-semibold tabular">${d.tir.toFixed(2)}%</span>`
        : '—',
    ]);
    const table = ui.btTable(headers, rows, { maxHeight: null });
    return `<div class="bond-group-header ${colorClass === 'ticker-sky' ? 'bond-group-ny' : colorClass === 'ticker-violet' ? 'bond-group-ar' : 'bond-group-bopreal'} mb-1">${label}</div>${table.outerHTML}`;
  }

  const globales  = data.filter(d => d.base?.startsWith('GD') && d.group !== 'BOPREAL');
  const bonares   = data.filter(d => ['AL','AE','AN','AO'].some(p => d.base?.startsWith(p)) && d.group !== 'BOPREAL');
  const bopreales = data.filter(d => d.group === 'BOPREAL');

  container.innerHTML =
    group('🇺🇸 Soberanos Ley NY',   'ticker-sky',     globales) +
    group('🇦🇷 Soberanos Ley AR',   'ticker-violet',   bonares) +
    group('BOPREAL (USD)',          'ticker-emerald',   bopreales);
}

// ── TIR curve ─────────────────────────────────────────────────────────────

async function _renderCurvaTIR(mercado) {
  try {
    const data = await api.bonos.todos(mercado);
    const mep = data.filter(d => d.tir !== null && d.duration !== null && d.group !== 'BOPREAL');
    const globales  = mep.filter(d => d.base?.startsWith('GD'));
    const bonares   = mep.filter(d => ['AL','AE','AN','AO'].some(p => d.base?.startsWith(p)));
    const bopreales = data.filter(d => d.group === 'BOPREAL' && d.tir !== null && d.duration !== null);

    const series = [];
    if (globales.length)  series.push({ name: 'Ley NY',  color: dcfCharts.COLORS.sky,
      data: globales.map(d => ({ x: d.duration, y: d.tir, label: d.base })), showLabels: true });
    if (bonares.length)   series.push({ name: 'Ley AR',  color: dcfCharts.COLORS.violet,
      data: bonares.map(d => ({ x: d.duration, y: d.tir, label: d.base })), showLabels: true });
    if (bopreales.length) series.push({ name: 'BOPREAL', color: dcfCharts.COLORS.emerald,
      data: bopreales.map(d => ({ x: d.duration, y: d.tir, label: d.base })), showLabels: true });

    dcfCharts.renderScatter('chart-curva-tir', series, {
      height: 260, xLabel: 'Duration (años)', yLabel: 'TIR %',
      yFormatter: v => `${v?.toFixed(2)}%`,
    });
  } catch {}
}

// ── Riesgo País chart ─────────────────────────────────────────────────────

const _rpPeriods = { '3M': 90, '6M': 180, '1A': 365, '2A': 730, 'MAX': 99999 };

async function _loadRiesgoPais(period = '1A') {
  try {
    const all = await api.bonos.riesgoPais();
    const days = _rpPeriods[period] || 365;
    const data = all.slice(-days);
    const last = all[all.length - 1];
    const rpTitle = document.getElementById('rp-title');
    if (rpTitle && last) rpTitle.textContent = `Riesgo País (EMBI): ${Math.round(last.valor)} bps`;

    dcfCharts.renderLine('chart-riesgo-pais', [
      { name: 'EMBI', data: data.map(d => d.valor), color: dcfCharts.COLORS.accent, area: true }
    ], { height: 200, xLabels: data.map(d => d.fecha) });
  } catch {}
}

// ── Top TIR ───────────────────────────────────────────────────────────────

function _renderTopTIR(data) {
  const el = document.getElementById('bonos-top-tir');
  if (!el) return;
  const sorted = data
    .filter(d => d.tir !== null && d.group !== 'BOPREAL')
    .sort((a, b) => b.tir - a.tir)
    .slice(0, 7);

  const headers = ['Ticker', 'Dur.', 'TIR'];
  const rows = sorted.map(d => [
    `<span class="${d.base?.startsWith('GD') ? 'ticker-sky' : 'ticker-violet'} font-semibold">${d.ticker}</span>`,
    _n(d.duration, 1),
    `<span class="tir-positive font-semibold tabular">${d.tir.toFixed(2)}%</span>`,
  ]);
  const table = ui.btTable(headers, rows, { maxHeight: 260 });
  el.innerHTML = '';
  el.appendChild(table);
}

// ── SENSIBILIDAD view ─────────────────────────────────────────────────────

async function renderSensibilidad(container) {
  container.innerHTML = `
    <div>
      <div id="sensi-pills" class="mb-3"></div>
      <div id="sensi-table"></div>
    </div>`;

  const pillEl  = document.getElementById('sensi-pills');
  const tableEl = document.getElementById('sensi-table');

  const loadSensi = async (tipo) => {
    tableEl.innerHTML = '<p class="text-muted text-sm" style="font-family:var(--font-mono)">Calculando sensibilidad...</p>';
    const data = await api.bonos.sensibilidad(tipo).catch(() => []);
    _renderSensibilidadTable(tableEl, data);
  };

  const pillsEl = ui.pills(['GLOBALES', 'BONARES', 'BOPREAL'], 0, (_, tipo) => loadSensi(tipo));
  pillEl.appendChild(pillsEl);
  await loadSensi('GLOBALES');
}

function _renderSensibilidadTable(container, data) {
  if (!data?.length) {
    container.innerHTML = '<p class="text-muted text-sm" style="font-family:var(--font-mono)">Sin datos</p>';
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

// ── Helpers ───────────────────────────────────────────────────────────────

function _n(v, d = 2) {
  if (v == null) return '—';
  return Number(v).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
}
