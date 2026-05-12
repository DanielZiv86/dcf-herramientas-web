/* ─── Dashboard page ─────────────────────────────────────────────────────── */

(window.pages = window.pages || {}).dashboard = async function(container) {
  container.innerHTML = `
    <div class="page" id="dash-root">
      <!-- Ticker Band -->
      <div class="ticker-band mb-4" style="margin: -24px -24px 16px; border-radius:0; border-left:none; border-right:none;">
        <div class="ticker-band-inner" id="ticker-band-inner"></div>
      </div>

      <!-- KPI Row -->
      <div id="dash-kpis" class="dash-kpi-row"></div>

      <!-- Tasas soberanas -->
      <div id="dash-section-tasas"></div>
      <div id="dash-tasas" class="dash-tasas-row"></div>

      <!-- Two-column layout -->
      <div class="dash-two-col mt-4">
        <div>
          <div id="dash-section-us"></div>
          <div id="dash-indices" class="grid-3 mb-4"></div>
          <div class="card">
            <div class="card-header">
              <div class="card-title">S&amp;P 500 — Mapa sectorial</div>
              <div id="perf-pills"></div>
            </div>
            <div id="chart-sp500-treemap"></div>
          </div>
        </div>
        <div>
          <div id="dash-section-ar"></div>
          <div id="dash-merval" class="grid-2 mb-4"></div>
          <div class="card">
            <div class="card-title" style="padding: 12px 16px 0">Panel Líder</div>
            <div id="chart-merval-treemap"></div>
          </div>
        </div>
      </div>

      <!-- CEDEARs expander -->
      <div id="dash-cedears-wrap" class="mt-4"></div>
    </div>`;

  // Load all data in parallel
  _loadDashboard();
  _startTickerRefresh();
};

async function _loadDashboard() {
  const [macro, tasas, indices] = await Promise.allSettled([
    api.dashboard.macro(),
    api.dashboard.tasas(),
    api.dashboard.indices(),
  ]);

  _renderMacroKPIs(macro.status === 'fulfilled' ? macro.value : null);
  _renderTasas(tasas.status === 'fulfilled' ? tasas.value : null);
  _renderIndices(indices.status === 'fulfilled' ? indices.value : null);

  // Charts in parallel
  const [sp500, merval] = await Promise.allSettled([
    api.dashboard.sp500Treemap(),
    api.dashboard.mervalTreemap(),
  ]);

  if (sp500.status === 'fulfilled') {
    dcfCharts.renderTreemap('chart-sp500-treemap', sp500.value, {
      height: 380, labelKey: 'ticker', valueKey: 'pct_change', groupKey: 'sector',
    });
  }

  if (merval.status === 'fulfilled') {
    dcfCharts.renderTreemap('chart-merval-treemap', merval.value, {
      height: 380, labelKey: 'ticker', valueKey: 'pct_change',
    });
  }

  // CEDEARs expander
  const wrap = document.getElementById('dash-cedears-wrap');
  if (wrap) {
    const exp = ui.expander('CEDEARs — Top por volumen', async (body) => {
      body.innerHTML = '<p class="text-muted text-sm">Cargando...</p>';
      const cedears = await api.dashboard.cedears().catch(() => []);
      _renderCedears(body, cedears);
    });
    wrap.appendChild(exp);
  }

  // Performance pills
  _setupPerfPills();
}

function _renderMacroKPIs(m) {
  const el = document.getElementById('dash-kpis');
  if (!el) return;
  if (!m) { el.innerHTML = ui.skeletonKpiRow(6).outerHTML; return; }

  el.innerHTML = [
    ui.kpiCard({ label: 'Dólar MEP', value: fmt.ars(m.mep, 2), delta: m.mep_var, suffix: '%' }),
    ui.kpiCard({ label: 'Dólar CCL', value: fmt.ars(m.ccl, 2), delta: m.ccl_var, suffix: '%' }),
    ui.kpiCard({ label: 'Dólar Oficial', value: fmt.ars(m.oficial, 2) }),
    ui.kpiCard({ label: 'Brecha MEP', value: fmt.pctNoSign(m.brecha_mep), delta: null }),
    ui.kpiCard({ label: 'Brecha CCL', value: fmt.pctNoSign(m.brecha_ccl), delta: null }),
    ui.kpiCard({ label: 'Riesgo País', value: m.riesgo_pais ? Math.round(m.riesgo_pais) + ' bps' : '—', delta: m.riesgo_pais_var, suffix: '%' }),
  ].join('');
}

function _renderTasas(data) {
  const secEl = document.getElementById('dash-section-tasas');
  if (secEl) secEl.innerHTML = ui.sectionLabel('Tasas soberanas AR');
  const el = document.getElementById('dash-tasas');
  if (!el) return;
  if (!data) { el.innerHTML = '<p class="text-muted text-sm">—</p>'; return; }

  const { tasas = [], spread_ley_ar_vs_ny } = data;
  const cards = tasas.map(t =>
    ui.kpiCard({ label: t.ticker, value: t.tir !== null ? `${t.tir?.toFixed(2)}%` : '—' })
  );
  if (spread_ley_ar_vs_ny !== null) {
    cards.push(ui.kpiCard({ label: 'Spread Ley AR vs NY', value: spread_ley_ar_vs_ny !== null ? `${spread_ley_ar_vs_ny} bps` : '—' }));
  }
  el.innerHTML = cards.join('');
}

function _renderIndices(indices) {
  const secEl = document.getElementById('dash-section-us');
  if (secEl) secEl.innerHTML = ui.sectionLabel('Mercados globales');
  const el = document.getElementById('dash-indices');
  if (!el) return;
  if (!indices) { el.innerHTML = '<p class="text-muted text-sm">—</p>'; return; }

  const usIndices = indices.filter(i => ['S&P 500', 'QQQ', 'Dow Jones'].includes(i.label));
  const arIndices = indices.filter(i => i.label === 'MERVAL');

  el.innerHTML = usIndices.map(i =>
    ui.kpiCard({ label: i.label, value: fmt.num(i.price), delta: i.pct_change, suffix: '%' })
  ).join('');

  const secAR = document.getElementById('dash-section-ar');
  if (secAR) secAR.innerHTML = ui.sectionLabel('Mercado local');
  const elAR = document.getElementById('dash-merval');
  if (elAR) {
    elAR.innerHTML = arIndices.map(i =>
      ui.kpiCard({ label: i.label, value: fmt.num(i.price, 0), delta: i.pct_change, suffix: '%' })
    ).join('');
  }
}

function _renderCedears(body, cedears) {
  if (!cedears || !cedears.length) {
    body.innerHTML = '<p class="text-muted text-sm">Sin datos</p>';
    return;
  }
  const headers = ['Ticker', 'Precio ARS', 'Vol ARS', 'Vol USD'];
  const rows = cedears.slice(0, 20).map(c => [
    `<span class="ticker-sky font-semibold">${c.ticker || c.symbol || '?'}</span>`,
    fmt.ars(c.close || c.mark, 2),
    fmt.compact(c.v_ars),
    fmt.compact(c.v_usd),
  ]);
  const table = ui.btTable(headers, rows, { maxHeight: 280 });
  body.innerHTML = '';
  body.appendChild(table);
}

function _setupPerfPills() {
  const el = document.getElementById('perf-pills');
  if (!el) return;
  const periods = ['1S', '1M', '3M', 'YTD', '1A'];
  const pillsEl = ui.pills(periods, 1, async (i, period) => {
    const el2 = document.getElementById('chart-sp500-treemap');
    if (el2) el2.innerHTML = '<p class="text-muted text-sm p-4">Cargando...</p>';
    try {
      const data = await api.dashboard.performance(period);
      _renderPerformance(data);
    } catch (e) {
      ui.toast('Error cargando performance', 'error');
    }
  }, 'pills-sm');
  el.appendChild(pillsEl);
}

function _renderPerformance(data) {
  if (!data || !data.dates) return;
  const series = Object.entries(data)
    .filter(([k]) => k !== 'dates')
    .map(([name, vals]) => ({
      name,
      data: vals,
      color: name === 'S&P 500' ? dcfCharts.COLORS.sky : name === 'QQQ' ? dcfCharts.COLORS.violet : dcfCharts.COLORS.emerald,
      area: true,
    }));
  dcfCharts.renderLine('chart-sp500-treemap', series, {
    height: 380, xLabels: data.dates, yFormatter: v => `${v > 0 ? '+' : ''}${v?.toFixed(1)}%`,
  });
}

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
