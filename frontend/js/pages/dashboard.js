/* ─── Dashboard page ─────────────────────────────────────────────────────── */

(window.pages = window.pages || {}).dashboard = async function(container) {
  // Ticker band OUTSIDE .page (no margin overlap with topnav)
  container.innerHTML = `
    <div class="ticker-band" id="dash-ticker-band">
      <div class="ticker-band-inner" id="ticker-band-inner"></div>
    </div>

    <div class="page" id="dash-root">
      <!-- KPI Row: macro -->
      <div id="dash-kpis" class="dash-kpi-row mb-3"></div>

      <!-- Section: Mercados -->
      <div id="dash-section-mercados"></div>

      <!-- Índices: S&P + MERVAL en una fila -->
      <div class="dash-indices-row mb-3">
        <div>
          <div id="dash-label-global"></div>
          <div id="dash-indices-global" class="grid-3 mb-0"></div>
        </div>
        <div>
          <div id="dash-label-local"></div>
          <div id="dash-indices-local" class="grid-2 mb-0"></div>
        </div>
      </div>

      <!-- S&P 500 Treemap — full width -->
      <div class="card mb-3" id="card-sp500">
        <div class="card-header">
          <div class="card-title">S&P 500 — Mapa sectorial · Variación 1D · Tamaño = Volumen USD</div>
          <div id="treemap-legend" class="treemap-legend-inline"></div>
        </div>
        <div id="chart-sp500-treemap"></div>
      </div>

      <!-- Panel Líder Treemap — full width -->
      <div class="card mb-3">
        <div class="card-header">
          <div class="card-title">Panel Líder — Variación 1D · Tamaño = Volumen operado</div>
          <div class="treemap-legend-inline" id="treemap-legend-merval"></div>
        </div>
        <div id="chart-merval-treemap"></div>
      </div>

    </div>`;

  _startTickerRefresh();
  _loadDashboard();
};

// ── Data loaders ──────────────────────────────────────────────────────────

async function _loadDashboard() {
  const [macro, indices] = await Promise.allSettled([
    api.dashboard.macro(),
    api.dashboard.indices(),
  ]);

  const macroData   = macro.status === 'fulfilled'   ? macro.value   : null;
  const indicesData = indices.status === 'fulfilled' ? indices.value : [];

  _renderMacroKPIs(macroData);
  _renderIndices(indicesData, macroData);
  markUpdated();

  // Treemaps in parallel
  const [sp500, merval] = await Promise.allSettled([
    api.dashboard.sp500Treemap('1D'),
    api.dashboard.mervalTreemap(),
  ]);

  _renderTreemapLegend('treemap-legend');
  _renderTreemapLegend('treemap-legend-merval');

  if (sp500.status === 'fulfilled' && sp500.value?.length) {
    dcfCharts.renderTreemap('chart-sp500-treemap', sp500.value, {
      height: 440, labelKey: 'ticker', valueKey: 'pct_change',
      priceKey: 'price', groupKey: 'sector', periodLabel: '1D',
      sizeKey: 'dollar_vol',
    });
  } else {
    document.getElementById('chart-sp500-treemap').innerHTML =
      '<p class="text-muted text-sm" style="padding:16px;font-family:var(--font-mono)">Sin datos — Render puede estar iniciando (cold start ~50s). Recargá en un momento.</p>';
  }

  if (merval.status === 'fulfilled' && merval.value?.length) {
    dcfCharts.renderTreemap('chart-merval-treemap', merval.value, {
      height: 280, labelKey: 'ticker', valueKey: 'pct_change',
      priceKey: 'price', sizeKey: 'dollar_vol', periodLabel: '1D',
    });
  }

}

// ── KPI renderers ─────────────────────────────────────────────────────────

function _renderMacroKPIs(m) {
  const el = document.getElementById('dash-kpis');
  if (!el) return;
  if (!m) { el.appendChild(ui.skeletonKpiRow(6)); return; }

  el.innerHTML = [
    ui.kpiCard({ label: 'Dólar MEP',     value: m.mep    ? _ars(m.mep)    : '—', delta: m.mep_var,          suffix: '%' }),
    ui.kpiCard({ label: 'Dólar CCL',     value: m.ccl    ? _ars(m.ccl)    : '—', delta: m.ccl_var,          suffix: '%' }),
    ui.kpiCard({ label: 'Dólar Oficial', value: m.oficial ? _ars(m.oficial) : '—' }),
    ui.kpiCard({ label: 'Brecha MEP',    value: m.brecha_mep != null ? m.brecha_mep.toFixed(2) + '%' : '—' }),
    ui.kpiCard({ label: 'Brecha CCL',    value: m.brecha_ccl != null ? m.brecha_ccl.toFixed(2) + '%' : '—' }),
    ui.kpiCard({ label: 'Riesgo País',   value: m.riesgo_pais ? Math.round(m.riesgo_pais) + ' bps' : '—', delta: m.riesgo_pais_var, suffix: '%' }),
  ].join('');
}

function _renderIndices(indices, macro) {
  const secEl = document.getElementById('dash-section-mercados');
  if (secEl) secEl.innerHTML = ui.sectionLabel('Mercados');

  const global = indices.filter(i => ['S&P 500', 'QQQ', 'Dow Jones'].includes(i.label));
  const local  = indices.filter(i => i.label === 'MERVAL');

  // Global section
  const lbGlobal = document.getElementById('dash-label-global');
  if (lbGlobal) lbGlobal.innerHTML = '<div class="text-muted text-xs uppercase mb-2" style="font-family:var(--font-mono);letter-spacing:0.08em">Mercados Globales</div>';

  const elGlobal = document.getElementById('dash-indices-global');
  if (elGlobal) {
    elGlobal.innerHTML = global.map(i =>
      ui.kpiCard({ label: i.label, value: _num(i.price), delta: i.pct_change, suffix: '%' })
    ).join('');
  }

  // Local section — MERVAL + MERVAL USD
  const lbLocal = document.getElementById('dash-label-local');
  if (lbLocal) lbLocal.innerHTML = '<div class="text-muted text-xs uppercase mb-2" style="font-family:var(--font-mono);letter-spacing:0.08em">Mercado Local</div>';

  const elLocal = document.getElementById('dash-indices-local');
  if (elLocal) {
    const mervalItem = local[0];
    const mervalUSD = (mervalItem?.price && macro?.ccl && macro.ccl > 0)
      ? Math.round(mervalItem.price / macro.ccl).toLocaleString('es-AR')
      : '—';

    elLocal.innerHTML = [
      ui.kpiCard({ label: 'MERVAL',     value: _num(mervalItem?.price, 0), delta: mervalItem?.pct_change, suffix: '%' }),
      ui.kpiCard({ label: 'MERVAL USD', value: mervalUSD ? `$${mervalUSD}` : '—' }),
    ].join('');
  }
}

function _renderCedears(body, cedears) {
  if (!cedears?.length) { body.innerHTML = '<p class="text-muted text-sm" style="font-family:var(--font-mono)">Sin datos</p>'; return; }
  const headers = ['Ticker', 'Precio', 'Vol ARS', 'Vol USD'];
  const rows = cedears.slice(0, 20).map(c => [
    `<span class="ticker-sky font-semibold">${c.ticker || c.symbol || '?'}</span>`,
    c.close ? _ars(c.close, 2) : '—',
    _compact(c.v_ars),
    _compact(c.v_usd),
  ]);
  const table = ui.btTable(headers, rows, { maxHeight: 280 });
  body.innerHTML = '';
  body.appendChild(table);
}

// ── Treemap color legend ──────────────────────────────────────────────────

function _renderTreemapLegend(domId) {
  const el = document.getElementById(domId);
  if (!el) return;
  el.innerHTML = `
    <div class="tm-legend">
      <span class="tm-dot" style="background:#be123c"></span><span>-3%+</span>
      <span class="tm-dot" style="background:#e11d48"></span><span>-1.5%</span>
      <span class="tm-dot" style="background:#fb7185"></span><span>-0.5%</span>
      <span class="tm-dot" style="background:#334155"></span><span>plano</span>
      <span class="tm-dot" style="background:#4ade80"></span><span>+0.5%</span>
      <span class="tm-dot" style="background:#16a34a"></span><span>+1.5%</span>
      <span class="tm-dot" style="background:#166534"></span><span>+3%+</span>
    </div>`;
}

// ── Ticker band ───────────────────────────────────────────────────────────

let _tickerInterval;

async function _loadTickerBand() {
  try {
    const items = await api.dashboard.tickerBand();
    ui.buildTickerBand(items);
  } catch {}
}

function _startTickerRefresh() {
  _loadTickerBand();
  _tickerInterval = setInterval(_loadTickerBand, 30000);
}

// ── Helpers ───────────────────────────────────────────────────────────────

function _ars(v, d = 2) {
  if (v == null) return '—';
  return '$' + Number(v).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function _num(v, d = 2) {
  if (v == null) return '—';
  return Number(v).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function _compact(v) {
  if (!v) return '—';
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
  return String(v);
}
