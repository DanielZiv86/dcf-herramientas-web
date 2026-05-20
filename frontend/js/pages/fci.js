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
      Fuente: CAFCI (api.pub.cafci.org.ar) · Clase A · Rendimientos al último VCP publicado.
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
      const params = { alyc: activeAlyc };
      if (tipo)   params.tipo   = tipo;
      if (moneda) params.moneda = moneda;

      _fciAllData = await api.fci.fondos(params);
      _fciApplyFiltersAndRender();
    } catch (e) {
      console.error('[FCI] Error cargando fondos:', e);
      if (wrap) wrap.innerHTML = `
        <div style="padding:18px 14px">
          <div style="font-family:var(--font-mono);color:var(--negative);font-size:.8rem;margin-bottom:6px">
            ✕ No se pudo cargar la información de FCI.
          </div>
          <div style="font-family:var(--font-mono);color:var(--text-muted);font-size:.7rem">${e.message || ''}</div>
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


// ── Tab: Gráfico Comparativo ──────────────────────────────────────────────────

async function _fciRenderComparativo(container) {
  container.innerHTML = `
    <div class="bt2-panel" style="padding:24px 20px">
      <div class="bt2-panel-title" style="margin-bottom:12px">RENDIMIENTO COMPARATIVO 12 MESES</div>
      <p style="font-family:var(--font-mono);color:var(--bt2-sub);font-size:.78rem">
        Seleccioná fondos en la tab de Rendimientos para comparar su evolución mensual.
        Esta funcionalidad estará disponible próximamente.
      </p>
    </div>`;
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
