/* ─── FCI — Fondos Comunes de Inversión — BondTerminal v2 ────────────────── */

let _fciAllData = [];  // cache local del último fetch

(window.pages = window.pages || {}).fci = async function(container) {
  container.innerHTML = `
    <div class="bt2-page">
      <div class="bt2-header" style="flex-direction:column;align-items:flex-start;gap:2px;margin-bottom:12px">
        <h1 class="bt2-title" style="font-size:1.25rem;letter-spacing:-.02em">
          FCI — Fondos Comunes de Inversión
        </h1>
        <p style="font-family:var(--font-mono);font-size:.72rem;color:var(--bt2-sub);margin:0">
          Rendimientos · Balanz · IOL · Cocos Capital · Fuente: CAFCI
        </p>
      </div>
      <div id="fci-pills-tab" style="margin-bottom:14px"></div>
      <div id="fci-content"></div>
    </div>`;

  const tabPills = document.getElementById('fci-pills-tab');
  const content  = document.getElementById('fci-content');

  tabPills.appendChild(ui.pills(
    ['Rendimientos', 'Gráfico Comparativo'], 0,
    (i) => {
      if (i === 0) _fciRenderRendimientos(content);
      else         _fciRenderComparativo(content);
    }
  ));

  _fciRenderRendimientos(content);
};


// ── Constantes ────────────────────────────────────────────────────────────────

const _FCI_ALYCS = ['Balanz', 'IOL', 'Cocos Capital'];

const _FCI_TIPOS = [
  '', 'Money Market', 'Renta Fija', 'Renta Variable',
  'Renta Mixta', 'Retorno Total', 'PyMEs / Infra',
];

const _FCI_TIPO_COLORS = {
  'Money Market':   { bg: '#0e4f6b', fg: '#38bdf8' },
  'Renta Fija':     { bg: '#3b1f8a', fg: '#a78bfa' },
  'Renta Variable': { bg: '#7c2d00', fg: '#f97316' },
  'Renta Mixta':    { bg: '#064e3b', fg: '#34d399' },
  'Retorno Total':  { bg: '#78350f', fg: '#fbbf24' },
  'PyMEs / Infra':  { bg: '#1e293b', fg: '#94a3b8' },
};

function _fciTipoBadge(tipo) {
  const c = _FCI_TIPO_COLORS[tipo] || { bg: '#1e293b', fg: '#94a3b8' };
  return `<span style="background:${c.bg};color:${c.fg};padding:2px 7px;border-radius:4px;
    font-size:9.5px;font-weight:700;letter-spacing:.05em;font-family:var(--font-mono)">${tipo || '—'}</span>`;
}

function _fciMonedaBadge(moneda) {
  const color = moneda === 'USD' ? '#34d399' : '#94a3b8';
  return `<span style="color:${color};font-weight:700;font-size:11px;font-family:var(--font-mono)">${moneda}</span>`;
}

function _fciPct(v, withSign = true) {
  if (v == null) return '—';
  const n = Number(v);
  const color = n > 0 ? '#22c55e' : n < 0 ? '#ef4444' : '#94a3b8';
  const sign  = withSign && n > 0 ? '+' : '';
  return `<span style="color:${color};font-weight:600;font-family:var(--font-mono)">${sign}${n.toFixed(2).replace('.', ',')}%</span>`;
}


// ── Tab: Rendimientos ─────────────────────────────────────────────────────────

async function _fciRenderRendimientos(container) {
  container.innerHTML = `
    <!-- Filtros compactos -->
    <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px">
      <div>
        <div class="ons-filter-lbl">ALyC</div>
        <div id="fci-alyc-pills" style="display:flex;gap:4px"></div>
      </div>
      <div>
        <div class="ons-filter-lbl">Tipo</div>
        <select class="dcf-select" id="fci-tipo" style="width:160px">
          ${_FCI_TIPOS.map(t => `<option value="${t}">${t || 'Todos'}</option>`).join('')}
        </select>
      </div>
      <div>
        <div class="ons-filter-lbl">Moneda</div>
        <select class="dcf-select" id="fci-moneda" style="width:110px">
          <option value="">Todas</option>
          <option value="ARS">ARS</option>
          <option value="USD">USD</option>
        </select>
      </div>
      <div>
        <div class="ons-filter-lbl">Buscar</div>
        <input class="dcf-input" id="fci-search" placeholder="Nombre…" style="width:160px"/>
      </div>
    </div>

    <!-- KPIs -->
    <div id="fci-kpis" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      ${_fciKpiSkeleton()}
    </div>

    <!-- Panel + sección label -->
    <div class="bt2-panel">
      <div class="bt2-panel-hdr">
        <span class="bt2-panel-title">FONDOS DISPONIBLES</span>
        <span class="bt2-panel-sub" id="fci-count"></span>
      </div>
      <div id="fci-tabla-wrap" class="bt2-snapshot-scroll">
        ${_fciTableSkeleton()}
      </div>
    </div>

    <div class="cer-note-strip" style="margin-top:10px">
      <span style="color:#94a3b8">ℹ</span>
      Fuente: CAFCI · Clase A · Rendimientos VCP mensual.
      Datos estáticos actualizados semanalmente.
    </div>`;

  let activeAlyc = 'Balanz';

  // Wiring ALyC pills
  const alycContainer = document.getElementById('fci-alyc-pills');
  alycContainer.appendChild(ui.pills(_FCI_ALYCS, 0, (_, label) => {
    activeAlyc = label;
    _fciLoad();
  }, 'pills-sm'));

  // Wiring filtros
  ['fci-tipo', 'fci-moneda'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', _fciLoad)
  );
  document.getElementById('fci-search')?.addEventListener('input', _fciApplyFiltersAndRender);

  async function _fciLoad() {
    const tipo   = document.getElementById('fci-tipo')?.value  || undefined;
    const moneda = document.getElementById('fci-moneda')?.value || undefined;
    const wrap   = document.getElementById('fci-tabla-wrap');
    const kpiEl  = document.getElementById('fci-kpis');

    if (wrap)  wrap.innerHTML  = _fciTableSkeleton();
    if (kpiEl) kpiEl.innerHTML = _fciKpiSkeleton();

    try {
      console.log('[FCI] Cargando fondos alyc=%s tipo=%s moneda=%s', activeAlyc, tipo, moneda);
      const params = { alyc: activeAlyc };
      if (tipo)   params.tipo   = tipo;
      if (moneda) params.moneda = moneda;

      _fciAllData = await api.fci.fondos(params);
      console.log('[FCI] Fondos recibidos:', _fciAllData.length,
        _fciAllData.slice(0,2).map(f => ({nombre:f.nombre, tipo:f.tipo, rend_year:f.rend_year})));

      if (!_fciAllData.length) {
        if (wrap) wrap.innerHTML = `
          <div style="padding:18px 14px">
            <div style="font-family:var(--font-mono);color:var(--bt2-sub);font-size:.8rem;margin-bottom:4px">
              Sin fondos disponibles para <b>${activeAlyc}</b> con estos filtros.
            </div>
            <div style="font-family:var(--font-mono);color:var(--text-muted);font-size:.68rem">
              Si el problema persiste, verificar que backend/data/fci_data.json existe
              y contiene fondos para esta ALyC.
            </div>
          </div>`;
        if (kpiEl) kpiEl.innerHTML = '';
        return;
      }

      _fciApplyFiltersAndRender();
    } catch (e) {
      console.error('[FCI] Error cargando fondos:', e);
      if (wrap) wrap.innerHTML = `
        <div style="padding:18px 14px">
          <div style="font-family:var(--font-mono);color:var(--negative);font-size:.8rem;margin-bottom:6px">
            ✕ Error al cargar FCI: ${e.message || 'error desconocido'}
          </div>
          <div style="font-family:var(--font-mono);color:var(--text-muted);font-size:.68rem">
            Revisar la consola para más detalles.
          </div>
        </div>`;
      if (kpiEl) kpiEl.innerHTML = '';
    }
  }

  function _fciApplyFiltersAndRender() {
    const search = (document.getElementById('fci-search')?.value || '').toLowerCase().trim();
    let fondos = _fciAllData;
    if (search) {
      fondos = fondos.filter(f =>
        (f.nombre || '').toLowerCase().includes(search) ||
        (f.clase_nombre || '').toLowerCase().includes(search)
      );
    }
    _fciRenderKPIs(document.getElementById('fci-kpis'), fondos);
    _fciRenderTable(document.getElementById('fci-tabla-wrap'), fondos);
  }

  await _fciLoad();
}


// ── KPIs ──────────────────────────────────────────────────────────────────────

function _fciRenderKPIs(el, fondos) {
  if (!el) return;
  const valid  = fondos.filter(f => f.rend_year != null);
  const best   = valid.length ? Math.max(...valid.map(f => f.rend_year)) : null;
  const worst  = valid.length ? Math.min(...valid.map(f => f.rend_year)) : null;
  const avg    = valid.length ? valid.reduce((s, f) => s + f.rend_year, 0) / valid.length : null;
  const bestFd = valid.find(f => f.rend_year === best);

  const fP = v => v != null ? (v >= 0 ? '+' : '') + Number(v).toFixed(1).replace('.', ',') + '%' : '—';

  const kpi = (label, val, cls = '', sub = '') => `
    <div class="bt2-kpi-card" style="flex:1;min-width:110px;max-width:190px">
      <div class="bt2-kpi-label">${label}</div>
      <div class="bt2-kpi-value ${cls}" style="font-size:1rem">${val}</div>
      ${sub ? `<div class="bt2-kpi-sub">${sub}</div>` : ''}
    </div>`;

  el.innerHTML = [
    kpi('FONDOS', fondos.length + '', '', 'CLASE A'),
    kpi('MEJOR 12M',   fP(best),  best  != null && best  >= 0 ? 'bt2-pos' : 'bt2-neg', bestFd?.nombre?.split(' ')[0] || ''),
    kpi('PROMEDIO 12M', fP(avg),  avg   != null && avg   >= 0 ? 'bt2-pos' : 'bt2-neg', ''),
    kpi('PEOR 12M',    fP(worst), worst != null && worst >= 0 ? 'bt2-pos' : 'bt2-neg', ''),
  ].join('');
}


// ── Tabla de fondos ───────────────────────────────────────────────────────────

function _fciRenderTable(wrap, fondos) {
  if (!wrap) return;
  const countEl = document.getElementById('fci-count');

  if (!fondos.length) {
    wrap.innerHTML = `<div style="padding:18px 14px;font-family:var(--font-mono);color:var(--text-muted);font-size:.78rem">
      Sin fondos para los filtros seleccionados.</div>`;
    if (countEl) countEl.textContent = '';
    return;
  }

  if (countEl) countEl.textContent = fondos.length + ' fondos';

  // Ordenar: tipo → rend_year desc
  const tipoOrder = ['Money Market', 'Renta Fija', 'Renta Variable', 'Renta Mixta', 'Retorno Total', 'PyMEs / Infra'];
  fondos = [...fondos].sort((a, b) => {
    const ti = tipoOrder.indexOf(a.tipo) - tipoOrder.indexOf(b.tipo);
    if (ti !== 0) return ti;
    return (b.rend_year ?? -9999) - (a.rend_year ?? -9999);
  });

  const headers = `<tr>
    <th style="text-align:left">FONDO</th>
    <th>TIPO</th>
    <th>MON.</th>
    <th class="ltr-th-hl">% 12M</th>
    <th>% MES</th>
    <th>% YTD</th>
    <th>% DÍA</th>
  </tr>`;

  let prevTipo = null;
  const rows = fondos.map(f => {
    const nombre = (f.clase_nombre || f.nombre || '').replace(' - Clase A', '').trim();
    const tipoRow = f.tipo !== prevTipo
      ? `<tr style="background:rgba(30,49,69,.25)">
           <td colspan="7" style="font-family:var(--font-mono);font-size:9px;font-weight:700;
             letter-spacing:.09em;text-transform:uppercase;padding:5px 10px;
             color:${(_FCI_TIPO_COLORS[f.tipo] || {fg:'#94a3b8'}).fg}">${f.tipo || '—'}</td>
         </tr>`
      : '';
    prevTipo = f.tipo;
    return tipoRow + `
      <tr class="bt2-row">
        <td style="font-family:var(--font-mono);font-size:.78rem;color:var(--bt2-text);max-width:320px;
          white-space:normal;line-height:1.3">${nombre}</td>
        <td class="bt2-td-num" style="white-space:nowrap">${_fciTipoBadge(f.tipo)}</td>
        <td class="bt2-td-num">${_fciMonedaBadge(f.moneda)}</td>
        <td class="bt2-td-num" style="font-weight:700">${_fciPct(f.rend_year)}</td>
        <td class="bt2-td-num">${_fciPct(f.rend_mes)}</td>
        <td class="bt2-td-num">${_fciPct(f.rend_ytd)}</td>
        <td class="bt2-td-num">${_fciPct(f.rend_dia)}</td>
      </tr>`;
  }).join('');

  wrap.innerHTML = `<table class="bt2-table"><thead>${headers}</thead><tbody>${rows}</tbody></table>`;
}


// ── Tab: Gráfico Comparativo — Ranking real ───────────────────────────────────

async function _fciRenderComparativo(container) {
  container.innerHTML = `
    <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px">
      <div>
        <div class="ons-filter-lbl">ALyC</div>
        <div id="fci-comp-alyc-pills" style="display:flex;gap:4px"></div>
      </div>
      <div>
        <div class="ons-filter-lbl">Métrica</div>
        <select class="dcf-select" id="fci-comp-metrica" style="width:130px">
          <option value="rend_year">12 Meses</option>
          <option value="rend_ytd">YTD</option>
          <option value="rend_mes">Último mes</option>
        </select>
      </div>
      <div>
        <div class="ons-filter-lbl">Moneda</div>
        <select class="dcf-select" id="fci-comp-moneda" style="width:110px">
          <option value="">Todas</option>
          <option value="ARS">ARS</option>
          <option value="USD">USD</option>
        </select>
      </div>
      <div>
        <div class="ons-filter-lbl">Top N</div>
        <select class="dcf-select" id="fci-comp-top" style="width:80px">
          <option value="10">10</option>
          <option value="15">15</option>
          <option value="20">20</option>
          <option value="0">Todos</option>
        </select>
      </div>
    </div>

    <div class="bt2-panel ltr-chart-panel" style="min-height:460px">
      <div class="bt2-panel-hdr">
        <span class="bt2-panel-title" id="fci-comp-title">RANKING — 12 MESES</span>
        <span class="bt2-panel-sub" id="fci-comp-sub"></span>
      </div>
      <div id="fci-comp-chart" style="flex:1;min-height:420px"></div>
    </div>

    <div class="cer-note-strip" style="margin-top:10px">
      <span style="color:#94a3b8">ℹ</span>
      Clase A · Rendimiento compuesto 12M calculado desde VCP mensual · CAFCI.
    </div>`;

  let compAlyc = 'Balanz';
  const alycC = document.getElementById('fci-comp-alyc-pills');
  alycC.appendChild(ui.pills(_FCI_ALYCS, 0, (_, label) => {
    compAlyc = label; _renderComp();
  }, 'pills-sm'));

  ['fci-comp-metrica', 'fci-comp-moneda', 'fci-comp-top'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', _renderComp)
  );

  async function _renderComp() {
    const metrica = document.getElementById('fci-comp-metrica')?.value || 'rend_year';
    const moneda  = document.getElementById('fci-comp-moneda')?.value  || '';
    const topN    = parseInt(document.getElementById('fci-comp-top')?.value || '10');
    const el      = document.getElementById('fci-comp-chart');
    const titleEl = document.getElementById('fci-comp-title');
    const subEl   = document.getElementById('fci-comp-sub');
    if (!el) return;

    const metricaLabel = {
      rend_year: '12 MESES', rend_ytd: 'YTD', rend_mes: 'ÚLTIMO MES'
    }[metrica] || '12 MESES';

    if (titleEl) titleEl.textContent = `RANKING ${compAlyc.toUpperCase()} — ${metricaLabel}`;

    try {
      const params = { alyc: compAlyc };
      if (moneda) params.moneda = moneda;
      let fondos = await api.fci.fondos(params);
      fondos = fondos.filter(f => f[metrica] != null);
      fondos.sort((a, b) => (b[metrica] ?? -9999) - (a[metrica] ?? -9999));
      if (topN > 0) fondos = fondos.slice(0, topN);

      if (subEl) subEl.textContent = fondos.length + ' fondos';

      if (!fondos.length) {
        el.innerHTML = `<p style="padding:20px;font-family:var(--font-mono);color:var(--bt2-sub);font-size:.78rem;text-align:center">
          Sin datos para los filtros seleccionados.</p>`;
        return;
      }

      _fciRenderRankingChart(el, fondos, metrica, metricaLabel);
    } catch (e) {
      console.error('[FCI comparativo]', e);
      el.innerHTML = `<p style="padding:20px;font-family:var(--font-mono);color:var(--negative);font-size:.78rem">Error: ${e.message}</p>`;
    }
  }

  await _renderComp();
}

function _fciRenderRankingChart(el, fondos, metrica, metricaLabel) {
  const ex = echarts.getInstanceByDom(el);
  if (ex) ex.dispose();
  const chart = echarts.init(el, 'dcf');
  const mono  = "'JetBrains Mono',monospace";

  const sorted = [...fondos].sort((a, b) => (a[metrica] ?? -9999) - (b[metrica] ?? -9999));
  const labels = sorted.map(f => {
    let n = (f.clase_nombre || f.nombre || '').replace(' - Clase A', '').trim();
    return n.length > 32 ? n.slice(0, 30) + '…' : n;
  });
  const values = sorted.map(f => f[metrica] ?? 0);
  const colors = values.map(v => {
    const tipo = sorted[values.indexOf(v)]?.tipo || '';
    return _FCI_TIPO_COLORS[tipo]?.fg || (v >= 0 ? '#22c55e' : '#ef4444');
  });

  chart.setOption({
    tooltip: {
      trigger: 'item',
      backgroundColor: '#0d1424',
      borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, padding: [8, 12],
      formatter: p => {
        const f = sorted[p.dataIndex];
        const fmtV = (v) => v != null ? (v >= 0 ? '+' : '') + Number(v).toFixed(2).replace('.', ',') + '%' : '—';
        return `<div style="font-family:${mono};font-size:11px;min-width:200px">
          <b style="color:var(--bt2-accent)">${(f.clase_nombre || '').replace(' - Clase A','')}</b>
          <div style="margin-top:4px;color:#94a3b8">${f.tipo || ''} · ${f.moneda}</div>
          <div style="margin-top:4px">${metricaLabel}: <b>${fmtV(f[metrica])}</b></div>
          ${metrica !== 'rend_mes' && f.rend_mes != null ? `<div>Mes: ${fmtV(f.rend_mes)}</div>` : ''}
        </div>`;
      },
    },
    grid: { left: 16, right: 72, top: 10, bottom: 10, containLabel: true },
    xAxis: {
      type: 'value',
      axisLabel: { color: '#475569', fontFamily: mono, fontSize: 9,
        formatter: v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%' },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } },
    },
    yAxis: {
      type: 'category', data: labels,
      axisLabel: { color: '#94a3b8', fontFamily: mono, fontSize: 9.5 },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitLine: { show: false },
    },
    series: [{
      type: 'bar', data: values.map((v, i) => ({ value: v, itemStyle: { color: colors[i] } })),
      barMaxWidth: 20,
      label: {
        show: true, position: 'right',
        fontFamily: mono, fontSize: 9.5, color: '#94a3b8',
        formatter: p => (p.value >= 0 ? '+' : '') + Number(p.value).toFixed(2).replace('.', ',') + '%',
      },
    }],
  });
  chart.resize();
  new ResizeObserver(() => chart.resize()).observe(el);
}


// ── Skeletons ─────────────────────────────────────────────────────────────────

function _fciTableSkeleton() {
  return Array.from({ length: 8 }, () =>
    `<div class="skeleton skeleton-table-row" style="margin:3px 12px"></div>`
  ).join('');
}

function _fciKpiSkeleton() {
  return `<div class="skeleton" style="height:52px;border-radius:4px;flex:1;min-width:100px;max-width:190px"></div>`.repeat(4);
}
