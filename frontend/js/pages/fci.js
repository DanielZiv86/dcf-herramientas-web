/* ─── FCI page ───────────────────────────────────────────────────────────── */

(window.pages = window.pages || {}).fci = async function(container) {
  container.innerHTML = `
    <div class="page">
      <div class="page-header"><h1>FCI — Fondos Comunes de Inversión</h1></div>
      <div id="fci-pills" class="mb-4"></div>
      <div id="fci-content"></div>
    </div>`;

  const pillEl = document.getElementById('fci-pills');
  const content = document.getElementById('fci-content');

  const pillsEl = ui.pills(['Rendimientos', 'Gráfico Comparativo'], 0, (i) => {
    if (i === 0) renderRendimientos(content);
    else renderComparativo(content);
  });
  pillEl.appendChild(pillsEl);

  renderRendimientos(content);
};

const ALYCS = ['Balanz', 'IOL', 'Cocos Capital'];
const TIPOS = ['', 'Money Market', 'Renta Fija', 'Renta Variable', 'Renta Mixta', 'Retorno Total'];

async function renderRendimientos(container) {
  container.innerHTML = `
    <div class="fci-filters">
      <div>
        <div class="text-muted text-xs uppercase mb-1">ALyC</div>
        <div id="fci-alyc-pills"></div>
      </div>
      <div>
        <div class="text-muted text-xs uppercase mb-1">Tipo</div>
        <select class="dcf-select" id="fci-tipo" style="width:160px">
          ${TIPOS.map(t => `<option value="${t}">${t || 'Todos'}</option>`).join('')}
        </select>
      </div>
      <div>
        <div class="text-muted text-xs uppercase mb-1">Moneda</div>
        <select class="dcf-select" id="fci-moneda" style="width:120px">
          <option value="">Todas</option>
          <option value="ARS">ARS</option>
          <option value="USD">USD</option>
        </select>
      </div>
    </div>
    <div id="fci-kpis" class="grid-4 mb-4"></div>
    <div id="fci-section-tabla"></div>
    <div id="fci-tabla"></div>`;

  let activeAlyc = 'Balanz';

  const alycPillEl = document.getElementById('fci-alyc-pills');
  const alycPillsEl = ui.pills(ALYCS, 0, (_, label) => { activeAlyc = label; loadFondos(); });
  alycPillEl.appendChild(alycPillsEl);

  document.getElementById('fci-section-tabla').innerHTML = ui.sectionLabel('Fondos disponibles');

  async function loadFondos() {
    const tipo = document.getElementById('fci-tipo')?.value;
    const moneda = document.getElementById('fci-moneda')?.value;
    const tableEl = document.getElementById('fci-tabla');
    const kpiEl = document.getElementById('fci-kpis');

    tableEl.innerHTML = '';
    tableEl.appendChild(ui.skeletonTable(8, 6));

    try {
      const fondos = await api.fci.fondos({ alyc: activeAlyc, tipo: tipo || undefined, moneda: moneda || undefined });
      renderKPIs(kpiEl, fondos);
      renderFondosTable(tableEl, fondos);
    } catch (e) {
      tableEl.innerHTML = `<p class="text-negative">${e.message}</p>`;
    }
  }

  document.getElementById('fci-tipo')?.addEventListener('change', loadFondos);
  document.getElementById('fci-moneda')?.addEventListener('change', loadFondos);

  await loadFondos();
}

function renderKPIs(el, fondos) {
  const valid = fondos.filter(f => f.rend_year !== null);
  const best = valid.length ? Math.max(...valid.map(f => f.rend_year)) : null;
  const worst = valid.length ? Math.min(...valid.map(f => f.rend_year)) : null;
  const avg = valid.length ? valid.reduce((s, f) => s + f.rend_year, 0) / valid.length : null;

  el.innerHTML = [
    ui.kpiCard({ label: 'Fondos', value: fondos.length }),
    ui.kpiCard({ label: 'Mejor 12M', value: best !== null ? fmt.pctNoSign(best) : '—', delta: null }),
    ui.kpiCard({ label: 'Promedio 12M', value: avg !== null ? fmt.pctNoSign(avg) : '—', delta: null }),
    ui.kpiCard({ label: 'Peor 12M', value: worst !== null ? fmt.pctNoSign(worst) : '—', delta: null }),
  ].join('');
}

function renderFondosTable(el, fondos) {
  const headers = ['Fondo', 'Tipo', 'Moneda', '% Día', '% Mes', '% 12M', '% YTD'];
  const rows = fondos.map(f => [
    `<span class="text-primary font-medium">${f.nombre}</span>`,
    `<span class="badge badge-muted">${f.tipo}</span>`,
    `<span class="badge ${f.moneda === 'USD' ? 'badge-sky' : 'badge-emerald'}">${f.moneda}</span>`,
    f.rend_dia !== null ? ui.changeBadge(f.rend_dia) : '—',
    f.rend_mes !== null ? ui.changeBadge(f.rend_mes) : '—',
    f.rend_year !== null ? `<span class="font-semibold ${f.rend_year >= 0 ? 'text-positive' : 'text-negative'} tabular">${fmt.pctNoSign(f.rend_year)}</span>` : '—',
    f.rend_ytd !== null ? ui.changeBadge(f.rend_ytd) : '—',
  ]);
  const table = ui.btTable(headers, rows, { maxHeight: 550 });
  el.innerHTML = '';
  el.appendChild(table);
}

async function renderComparativo(container) {
  container.innerHTML = `
    <div class="card">
      <div class="chart-title mb-2">Rendimiento comparativo 12 meses</div>
      <p class="text-muted text-sm p-4">Seleccioná un fondo en la tab de Rendimientos para ver el gráfico detallado.</p>
    </div>`;
}
