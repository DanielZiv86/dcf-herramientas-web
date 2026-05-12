/* ─── Análisis Fundamental page ──────────────────────────────────────────── */

(window.pages = window.pages || {}).fundamental = async function(container) {
  container.innerHTML = `
    <div class="page fundamental-layout">
      <div class="page-header"><h1>Análisis Fundamental</h1></div>

      <!-- Ticker selector -->
      <div>
        <div class="text-muted text-xs uppercase mb-2">Tickers curados</div>
        <div class="ticker-selector" id="fund-chips"></div>
      </div>
      <div class="flex gap-2 mb-4">
        <input class="dcf-input" id="fund-custom-ticker" placeholder="Buscar ticker (eg. AAPL)..." style="max-width:220px" />
        <button class="btn btn-primary" id="fund-search-btn">Buscar</button>
      </div>

      <!-- Company header -->
      <div id="fund-company-header" class="hidden"></div>

      <!-- Tabs -->
      <div id="fund-tabs" class="hidden">
        <div id="fund-tab-pills" class="mb-4"></div>
        <div id="fund-tab-content"></div>
      </div>

      <div id="fund-placeholder" class="card" style="text-align:center; padding:40px;">
        <p class="text-muted">Seleccioná una empresa para comenzar el análisis</p>
      </div>
    </div>`;

  let currentTicker = null;

  // Load curated tickers
  try {
    const { tickers } = await api.fundamental.tickers();
    const chips = document.getElementById('fund-chips');
    tickers.forEach(tk => {
      const chip = document.createElement('div');
      chip.className = 'ticker-chip';
      chip.textContent = tk;
      chip.onclick = () => loadTicker(tk);
      chips.appendChild(chip);
    });
  } catch {}

  document.getElementById('fund-search-btn')?.addEventListener('click', () => {
    const tk = document.getElementById('fund-custom-ticker')?.value?.trim()?.toUpperCase();
    if (tk) loadTicker(tk);
  });

  document.getElementById('fund-custom-ticker')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const tk = e.target.value.trim().toUpperCase();
      if (tk) loadTicker(tk);
    }
  });

  async function loadTicker(ticker) {
    currentTicker = ticker;

    // Update chip active state
    document.querySelectorAll('.ticker-chip').forEach(c => {
      c.classList.toggle('active', c.textContent === ticker);
    });

    // Show loading
    document.getElementById('fund-placeholder').classList.add('hidden');
    const header = document.getElementById('fund-company-header');
    header.classList.remove('hidden');
    header.innerHTML = `<div class="skeleton" style="height:80px; border-radius:var(--radius); margin-bottom:16px"></div>`;

    const tabs = document.getElementById('fund-tabs');
    tabs.classList.remove('hidden');

    try {
      const [perfil, financieros, candles] = await Promise.allSettled([
        api.fundamental.perfil(ticker),
        api.fundamental.financieros(ticker),
        api.fundamental.candles(ticker),
      ]);

      const p = perfil.status === 'fulfilled' ? perfil.value : {};
      const f = financieros.status === 'fulfilled' ? financieros.value : {};
      const c = candles.status === 'fulfilled' ? candles.value : {};

      renderCompanyHeader(header, p);
      setupTabs(ticker, p, f, c);

    } catch (e) {
      header.innerHTML = `<p class="text-negative">${e.message}</p>`;
    }
  }
};

function renderCompanyHeader(el, data) {
  const { profile = {}, quote = {}, metrics = {} } = data;
  const pct = quote.pct_change;
  const deltaCls = pct >= 0 ? 'positive' : 'negative';
  const sign = pct >= 0 ? '▲' : '▼';

  el.innerHTML = `
    <div class="company-header">
      ${profile.logo ? `<img class="company-logo" src="${profile.logo}" alt="${profile.name}" onerror="this.style.display='none'"/>` : ''}
      <div>
        <div class="company-name">${profile.name || '—'}</div>
        <div class="company-sector">${profile.sector || ''} · ${profile.exchange || ''} · ${profile.country || ''}</div>
        <div class="mt-2">
          ${profile.sector ? `<span class="badge badge-muted">${profile.sector}</span>` : ''}
          ${profile.currency ? `<span class="badge badge-muted ml-2">${profile.currency}</span>` : ''}
        </div>
      </div>
      <div class="company-price" style="margin-left:auto; text-align:right">
        <div class="company-price-value tabular">$${fmt.num(quote.price)}</div>
        <div class="kpi-delta ${deltaCls} mt-2" style="display:inline-flex">
          ${sign} ${Math.abs(pct || 0).toFixed(2)}%
        </div>
        <div class="text-muted text-xs mt-1">
          P/E: ${fmt.num(metrics.pe_ttm, 1)} · Mcap: $${fmt.compact((profile.market_cap || 0) * 1e6)}
        </div>
      </div>
    </div>`;
}

function setupTabs(ticker, perfil, financieros, candles) {
  const pillEl = document.getElementById('fund-tab-pills');
  const content = document.getElementById('fund-tab-content');
  const tabs = ['🏢 Empresa', '📈 Negocio', '💰 Rentabilidad', '🏦 Financiera', '🎯 Valuación'];

  const pillsEl = ui.pills(tabs, 0, (i, label) => {
    renderTab(label, ticker, perfil, financieros, candles, content);
  });
  pillEl.innerHTML = '';
  pillEl.appendChild(pillsEl);

  renderTab(tabs[0], ticker, perfil, financieros, candles, content);
}

function renderTab(tabLabel, ticker, perfil, financieros, candles, container) {
  const { profile = {}, metrics = {} } = perfil;
  const data = financieros.data || [];

  container.innerHTML = '';

  if (tabLabel.includes('Empresa')) {
    _renderEmpresa(container, profile, metrics);
  } else if (tabLabel.includes('Negocio')) {
    _renderNegocio(container, data);
  } else if (tabLabel.includes('Rentabilidad')) {
    _renderRentabilidad(container, data, metrics);
  } else if (tabLabel.includes('Financiera')) {
    _renderFinanciera(container, data);
  } else if (tabLabel.includes('Valuación')) {
    _renderValuacion(container, data, metrics, candles);
  }
}

function _renderEmpresa(container, profile, metrics) {
  container.innerHTML = `
    <div class="grid-4 mb-4">
      ${ui.kpiCard({ label: 'Market Cap', value: '$' + fmt.compact((profile.market_cap || 0) * 1e6) })}
      ${ui.kpiCard({ label: 'P/E TTM', value: fmt.num(metrics.pe_ttm, 1) })}
      ${ui.kpiCard({ label: 'EV/EBITDA', value: fmt.num(metrics.ev_ebitda_ttm, 1) })}
      ${ui.kpiCard({ label: 'Div Yield', value: metrics.dividend_yield ? fmt.pctNoSign(metrics.dividend_yield) : '—' })}
    </div>
    <div class="card">
      <div class="card-title mb-2">Información de la empresa</div>
      <div class="grid-2 gap-4 text-sm">
        <div><span class="text-muted">Empleados: </span>${fmt.compact(profile.employees)}</div>
        <div><span class="text-muted">IPO: </span>${profile.ipo_date || '—'}</div>
        <div><span class="text-muted">País: </span>${profile.country || '—'}</div>
        <div><span class="text-muted">Web: </span><a href="${profile.website}" target="_blank">${profile.website || '—'}</a></div>
      </div>
    </div>`;
}

function _renderNegocio(container, data) {
  if (!data.length) { container.innerHTML = '<p class="text-muted">Sin datos financieros</p>'; return; }
  const years = data.map(d => d.year);
  const revenue = data.map(d => d.revenue);
  const netIncome = data.map(d => d.net_income);

  container.innerHTML = `
    <div class="grid-2 gap-4">
      <div class="card">
        <div class="chart-title">Revenue (USD M)</div>
        <div id="chart-revenue"></div>
      </div>
      <div class="card">
        <div class="chart-title">Net Income (USD M)</div>
        <div id="chart-netincome"></div>
      </div>
    </div>`;

  dcfCharts.renderBar('chart-revenue', years.map(String), [{ name: 'Revenue', data: revenue }], {
    height: 240, yFormatter: v => `$${fmt.compact(v)}M`,
  });
  dcfCharts.renderBar('chart-netincome', years.map(String), [{ name: 'Net Income', data: netIncome }], {
    height: 240, yFormatter: v => `$${fmt.compact(v)}M`,
  });
}

function _renderRentabilidad(container, data, metrics) {
  container.innerHTML = `
    <div class="grid-4 mb-4">
      ${ui.kpiCard({ label: 'ROE TTM', value: metrics.roe_ttm !== null ? fmt.pctNoSign(metrics.roe_ttm) : '—' })}
      ${ui.kpiCard({ label: 'ROIC TTM', value: metrics.roic_ttm !== null ? fmt.pctNoSign(metrics.roic_ttm) : '—' })}
      ${ui.kpiCard({ label: 'EBITDA Margin', value: metrics.ebitda_margin_ttm !== null ? fmt.pctNoSign(metrics.ebitda_margin_ttm) : '—' })}
      ${ui.kpiCard({ label: 'FCF Margin', value: metrics.fcf_margin_ttm !== null ? fmt.pctNoSign(metrics.fcf_margin_ttm) : '—' })}
    </div>
    <div class="grid-2 gap-4">
      <div class="card">
        <div class="chart-title">FCF (USD M)</div>
        <div id="chart-fcf"></div>
      </div>
      <div class="card">
        <div class="chart-title">Gross Margin %</div>
        <div id="chart-gross-margin"></div>
      </div>
    </div>`;

  if (data.length) {
    const years = data.map(d => String(d.year));
    dcfCharts.renderBar('chart-fcf', years, [{ name: 'FCF', data: data.map(d => d.fcf) }], { height: 240, yFormatter: v => `$${fmt.compact(v)}M` });

    const gm = data.map(d => d.revenue && d.gross_profit ? (d.gross_profit / d.revenue * 100) : null);
    dcfCharts.renderBar('chart-gross-margin', years, [{ name: 'Gross Margin', data: gm }], { height: 240, yFormatter: v => `${v?.toFixed(1)}%` });
  }
}

function _renderFinanciera(container, data) {
  container.innerHTML = `
    <div class="grid-2 gap-4">
      <div class="card">
        <div class="chart-title">Net Cash (USD M)</div>
        <div id="chart-net-cash"></div>
      </div>
      <div class="card">
        <div class="chart-title">Total Debt (USD M)</div>
        <div id="chart-debt"></div>
      </div>
    </div>`;

  if (data.length) {
    const years = data.map(d => String(d.year));
    dcfCharts.renderBar('chart-net-cash', years, [{ name: 'Net Cash', data: data.map(d => d.net_cash) }], { height: 240, yFormatter: v => `$${fmt.compact(v)}M` });
    dcfCharts.renderBar('chart-debt', years, [{ name: 'Total Debt', data: data.map(d => d.total_debt) }], { height: 240, yFormatter: v => `$${fmt.compact(v)}M` });
  }
}

function _renderValuacion(container, data, metrics, candles) {
  container.innerHTML = `
    <div class="grid-4 mb-4">
      ${ui.kpiCard({ label: 'P/E TTM', value: fmt.num(metrics.pe_ttm, 1) })}
      ${ui.kpiCard({ label: 'P/S TTM', value: fmt.num(metrics.ps_ttm, 1) })}
      ${ui.kpiCard({ label: 'P/B', value: fmt.num(metrics.pb_annual, 1) })}
      ${ui.kpiCard({ label: 'EV/EBITDA', value: fmt.num(metrics.ev_ebitda_ttm, 1) })}
    </div>
    <div class="card">
      <div class="chart-title">Precio histórico (semanal)</div>
      <div id="chart-candles"></div>
    </div>`;

  if (candles.status === 'ok' && candles.dates.length) {
    dcfCharts.renderCandlestick('chart-candles', candles, { height: 360 });
  }
}
