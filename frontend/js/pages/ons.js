/* ─── ONs YTM page ───────────────────────────────────────────────────────── */

(window.pages = window.pages || {}).ons = async function(container) {
  container.innerHTML = `
    <div class="page">
      <div class="page-header"><h1>ONs — Obligaciones Negociables</h1></div>
      <div class="ons-filters mb-4">
        <div>
          <label class="text-muted text-xs uppercase" style="display:block;margin-bottom:4px">Legislación</label>
          <select class="dcf-select" id="ons-filter-leg" style="width:140px">
            <option value="">Todas</option>
            <option value="AR">Ley AR</option>
            <option value="NY">Ley NY</option>
          </select>
        </div>
        <div>
          <label class="text-muted text-xs uppercase" style="display:block;margin-bottom:4px">Buscar</label>
          <input class="dcf-input" id="ons-search" placeholder="Ticker..." style="width:160px" />
        </div>
      </div>
      <div id="ons-section"></div>
      <div id="ons-tabla"></div>
    </div>`;

  document.getElementById('ons-section').innerHTML = ui.sectionLabel('YTM por emisión');

  const tableEl = document.getElementById('ons-tabla');
  tableEl.appendChild(ui.skeletonTable(10, 6));

  let allData = [];

  try {
    allData = await api.ons.tabla();
    render(allData);
  } catch (e) {
    tableEl.innerHTML = `<p class="text-negative">${e.message}</p>`;
  }

  function render(data) {
    const leg = document.getElementById('ons-filter-leg')?.value || '';
    const search = document.getElementById('ons-search')?.value?.toUpperCase() || '';
    const filtered = data.filter(d =>
      d.status === 'OK' &&
      (!leg || d.legislacion === leg) &&
      (!search || d.ticker?.includes(search))
    );

    const headers = ['Ticker', 'Precio ARS', 'Precio USD', 'YTM', '% Día', 'Prox. Cupón', 'Vencimiento', 'Ley'];
    const rows = filtered.map(d => [
      `<span class="ticker-amber font-semibold">${d.ticker}</span>`,
      fmt.ars(d.price_ars, 2),
      fmt.usd(d.price_usd, 2),
      d.ytm !== null ? `<span class="text-accent tabular font-semibold">${fmt.num(d.ytm)}%</span>` : '—',
      d.pct_change !== null ? ui.changeBadge(d.pct_change) : '—',
      fmt.date(d.next_coupon),
      fmt.date(d.maturity),
      d.legislacion ? `<span class="badge ${d.legislacion === 'NY' ? 'badge-sky' : 'badge-violet'}">${d.legislacion}</span>` : '—',
    ]);

    const table = ui.btTable(headers, rows, { maxHeight: 600 });
    tableEl.innerHTML = '';
    tableEl.appendChild(table);
  }

  document.getElementById('ons-filter-leg')?.addEventListener('change', () => render(allData));
  document.getElementById('ons-search')?.addEventListener('input', () => render(allData));
};
