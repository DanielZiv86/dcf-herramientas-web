/* ─── Letras y Boncaps page ──────────────────────────────────────────────── */

(window.pages = window.pages || {}).letras = async function(container) {
  container.innerHTML = `
    <div class="page">
      <div class="page-header"><h1>Letras y Boncaps</h1></div>
      <div id="letras-pills" class="mb-4"></div>
      <div id="letras-mep" class="letras-mep-display mb-4">
        MEP: <span class="letras-mep-value" id="letras-mep-val">—</span>
      </div>
      <div class="card mb-4">
        <div class="chart-title">Curva TNA/TEM vs días al vencimiento</div>
        <div id="chart-letras-curva" class="letras-chart-wrapper"></div>
      </div>
      <div id="letras-section-tabla"></div>
      <div id="letras-tabla"></div>
    </div>`;

  const pillEl = document.getElementById('letras-pills');
  let activeView = 'TNA';
  const pillsEl = ui.pills(['TNA', 'TEM', 'Carry-Trade'], 0, (_, label) => {
    activeView = label;
    renderTable(allData, label);
  });
  pillEl.appendChild(pillsEl);

  let allData = null;

  document.getElementById('letras-section-tabla').innerHTML = ui.sectionLabel('Tabla de letras activas');

  try {
    const result = await api.letras.carry();
    allData = result.rows;

    // MEP display
    const mepEl = document.getElementById('letras-mep-val');
    if (mepEl && result.mep) mepEl.textContent = fmt.ars(result.mep, 2);

    // Curva
    const curva = await api.letras.curva().catch(() => []);
    renderCurva(curva);

    // Table
    renderTable(allData, 'TNA');
  } catch (e) {
    document.getElementById('letras-tabla').innerHTML = `<p class="text-negative">${e.message}</p>`;
  }
};

function renderCurva(data) {
  if (!data || !data.length) return;
  const sorted = data.sort((a, b) => a.dias - b.dias);
  const series = [
    { name: 'TNA', color: dcfCharts.COLORS.accent,
      data: sorted.map(d => ({ x: d.dias, y: d.tna, label: d.ticker })),
      showLabels: true },
    { name: 'TEM', color: dcfCharts.COLORS.sky,
      data: sorted.map(d => ({ x: d.dias, y: d.tem, label: '' })),
      showLabels: false },
  ];
  dcfCharts.renderScatter('chart-letras-curva', series, {
    height: 300, xLabel: 'Días', yLabel: '%',
    yFormatter: v => `${v?.toFixed(2)}%`,
  });
}

function renderTable(data, view) {
  const el = document.getElementById('letras-tabla');
  if (!data || !el) return;

  const colsMap = {
    'TNA': {
      headers: ['Ticker', 'Precio', 'Días', 'TNA', 'TEA', 'TEM', 'Vencimiento'],
      row: d => [
        `<span class="ticker-amber font-semibold">${d.ticker}</span>`,
        fmt.ars(d.precio, 4),
        d.dias,
        d.tna !== null ? `<span class="text-accent tabular">${fmt.pctNoSign(d.tna)}</span>` : '—',
        fmt.pctNoSign(d.tea),
        fmt.pctNoSign(d.tem),
        fmt.date(d.vencimiento),
      ],
    },
    'TEM': {
      headers: ['Ticker', 'Precio', 'Días', 'TEM', 'TNA', 'MEP BE'],
      row: d => [
        `<span class="ticker-amber font-semibold">${d.ticker}</span>`,
        fmt.ars(d.precio, 4),
        d.dias,
        d.tem !== null ? `<span class="text-accent tabular">${fmt.pctNoSign(d.tem)}</span>` : '—',
        fmt.pctNoSign(d.tna),
        fmt.ars(d.mep_be, 0),
      ],
    },
    'Carry-Trade': {
      headers: ['Ticker', 'Precio', 'Días', 'TNA', 'MEP BE', 'Banda Sup.', 'Banda Inf.'],
      row: d => [
        `<span class="ticker-amber font-semibold">${d.ticker}</span>`,
        fmt.ars(d.precio, 4),
        d.dias,
        fmt.pctNoSign(d.tna),
        fmt.ars(d.mep_be, 0),
        fmt.ars(d.banda_sup, 0),
        fmt.ars(d.banda_inf, 0),
      ],
    },
  };

  const config = colsMap[view] || colsMap['TNA'];
  const rows = data.map(d => config.row(d));
  const table = ui.btTable(config.headers, rows, { maxHeight: 500 });
  el.innerHTML = '';
  el.appendChild(table);
}
