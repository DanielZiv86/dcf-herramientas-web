/* ─── Bonos CER page ─────────────────────────────────────────────────────── */

(window.pages = window.pages || {}).cer = async function(container) {
  container.innerHTML = `
    <div class="page">
      <div class="page-header"><h1>Bonos CER</h1></div>
      <div id="cer-pills" class="mb-4"></div>
      <div id="cer-content"></div>
    </div>`;

  const pillEl = document.getElementById('cer-pills');
  const content = document.getElementById('cer-content');

  const pillsEl = ui.pills(['📊 Rendimientos', '📈 Curva TIR'], 0, (i) => {
    if (i === 0) renderTabla(content);
    else renderCurva(content);
  });
  pillEl.appendChild(pillsEl);

  renderTabla(content);
};

async function renderTabla(container) {
  container.innerHTML = `
    <div id="cer-section-tabla"></div>
    <div id="cer-tabla"></div>`;

  document.getElementById('cer-section-tabla').innerHTML = ui.sectionLabel('TIR Real — Bonos ajustados por CER');

  const tableEl = document.getElementById('cer-tabla');
  tableEl.appendChild(ui.skeletonTable(8, 5));

  try {
    const data = await api.cer.tabla();
    const headers = ['Ticker', 'Precio', 'TIR Real', 'TIR Nominal', 'Duration', '% Día', 'Vencimiento'];
    const rows = data.map(d => [
      `<span class="ticker-emerald font-semibold">${d.ticker}</span>`,
      fmt.ars(d.precio, 2),
      d.tir_real !== null ? `<span class="${ui.tirColor(d.tir_real)} tabular font-semibold">${fmt.num(d.tir_real)}%</span>` : '—',
      fmt.pctNoSign(d.tir_nominal),
      fmt.num(d.duration, 2),
      d.var_dia !== null ? ui.changeBadge(d.var_dia) : '—',
      fmt.date(d.vencimiento),
    ]);
    const table = ui.btTable(headers, rows, { maxHeight: 600 });
    tableEl.innerHTML = '';
    tableEl.appendChild(table);
  } catch (e) {
    tableEl.innerHTML = `<p class="text-negative">${e.message}</p>`;
  }
}

async function renderCurva(container) {
  container.innerHTML = `
    <div class="card">
      <div class="chart-title">Curva TIR Real vs Duration</div>
      <div id="chart-cer-curva"></div>
    </div>`;

  try {
    const data = await api.cer.curva();
    dcfCharts.renderScatter('chart-cer-curva', [
      { name: 'CER', color: dcfCharts.COLORS.emerald,
        data: data.map(d => ({ x: d.duration, y: d.tir_real, label: d.ticker })),
        showLabels: true },
    ], { height: 380, xLabel: 'Duration', yLabel: 'TIR Real %', yFormatter: v => `${v?.toFixed(2)}%` });
  } catch (e) {
    document.getElementById('chart-cer-curva').innerHTML = `<p class="text-negative">${e.message}</p>`;
  }
}
