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

// Nro mínimo de meses con datos para considerar un fondo "con histórico"
const FCI_MIN_HISTORY_MONTHS = 2;

/**
 * Un FCI tiene datos válidos si cumple al menos UNA de:
 *   - tiene rend_mes, rend_year o rend_ytd no nulo (dato puntual)
 *   - tiene ≥ FCI_MIN_HISTORY_MONTHS meses con retornos no nulos
 * Fondos que no cumplen ninguna = inactivos/discontinuados → se ocultan.
 */
function _fciHasValidData(f) {
  const hasPuntual = f.rend_mes != null || f.rend_year != null || f.rend_ytd != null || f.rend_dia != null;
  const validMonths = (f.monthly_returns || []).filter(v => v !== null && v !== undefined).length;
  const hasHistory  = validMonths >= FCI_MIN_HISTORY_MONTHS;
  return hasPuntual || hasHistory;
}

/**
 * Un FCI tiene histórico suficiente para el gráfico de líneas.
 * Si devuelve false, el fondo puede mostrarse en tabla pero NO se auto-selecciona
 * en el comparador ni se incluye en el selector por defecto.
 */
function _fciHasValidHistory(f) {
  const validMonths = (f.monthly_returns || []).filter(v => v !== null && v !== undefined).length;
  return validMonths >= FCI_MIN_HISTORY_MONTHS;
}

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

      const resp = await api.fci.fondos(params);
      // La API ahora devuelve {date_cols, fondos} en lugar de array plano
      const rawFondos = Array.isArray(resp) ? resp : (resp?.fondos || []);
      _fciAllData = rawFondos.filter(_fciHasValidData);
      const removed = rawFondos.length - _fciAllData.length;
      console.log('[FCI] Fondos recibidos:', rawFondos.length,
        '| válidos:', _fciAllData.length, '| excluidos (sin datos):', removed);
      if (removed > 0)
        console.log('[FCI] Excluidos:', rawFondos.filter(f => !_fciHasValidData(f)).map(f => f.clase_nombre));

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
    wrap.innerHTML = `<div style="padding:18px 14px;font-family:var(--font-mono);color:var(--bt2-sub);font-size:.78rem">
      No hay fondos activos con información disponible para los filtros seleccionados.</div>`;
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


// ── Tab: Gráfico Comparativo — Líneas de retorno acumulado ───────────────────

// Paleta de líneas: 12 colores sobrios para dark theme
const _COMP_COLORS = [
  '#38bdf8', '#a78bfa', '#f97316', '#34d399', '#fbbf24',
  '#f472b6', '#60a5fa', '#4ade80', '#fb923c', '#e879f9',
  '#facc15', '#94a3b8',
];

// Meses abreviados para eje X
const _MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function _fmtMonthLabel(dateStr) {
  // "2025-05-30" → "May '25"
  try {
    const [y, m] = dateStr.split('-');
    return `${_MESES[parseInt(m)]} '${y.slice(2)}`;
  } catch (_) { return dateStr; }
}

function _computeCumulative(monthlyReturns, nMonths) {
  // slice últimos nMonths, compone (1+r/100) acumulado
  const slice = (monthlyReturns || []).slice(-nMonths);
  let compound = 1.0;
  return slice.map(v => {
    if (v === null || v === undefined) return null;
    compound *= (1.0 + v / 100.0);
    return parseFloat(((compound - 1.0) * 100.0).toFixed(2));
  });
}

function _shortFundName(clase_nombre) {
  return (clase_nombre || '').replace(' - Clase A', '').trim();
}

async function _fciRenderComparativo(container) {
  // Estado local del comparador
  const cmp = {
    allFunds:   [],
    dateCols:   [],
    alycs:      new Set(['Balanz']),   // ALyCs activas (multiselect)
    tipos:      new Set(),             // empty = todos los tipos
    moneda:     '',
    period:     12,                    // meses
    selected:   [],                    // clase_nombre strings seleccionados
  };

  // ── Render inicial ───────────────────────────────────────────────────────
  container.innerHTML = `
    <!-- Filtros superiores -->
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px">

      <div>
        <div class="ons-filter-lbl">ALyC</div>
        <div id="fci-c-alycs" style="display:flex;gap:4px;flex-wrap:wrap"></div>
      </div>

      <div>
        <div class="ons-filter-lbl">Tipo de fondo</div>
        <div id="fci-c-tipos" style="display:flex;gap:4px;flex-wrap:wrap"></div>
      </div>

      <div>
        <div class="ons-filter-lbl">Moneda</div>
        <div style="display:flex;gap:4px">
          ${['', 'ARS', 'USD'].map((m, i) => `
            <button class="fci-ctoggle${i===0?' fci-ctoggle-active':''}"
                    data-mon="${m}" onclick="_fciCToggleMon(this)">
              ${m || 'Todas'}
            </button>`).join('')}
        </div>
      </div>

      <div>
        <div class="ons-filter-lbl">Período</div>
        <div style="display:flex;gap:4px">
          ${[[3,'3M'],[6,'6M'],[9,'9M'],[12,'12M']].map(([n, lbl], i) => `
            <button class="fci-ctoggle${n===12?' fci-ctoggle-active':''}"
                    data-per="${n}" onclick="_fciCTogglePer(this)">
              ${lbl}
            </button>`).join('')}
        </div>
      </div>

    </div>

    <!-- Selector de fondos -->
    <div class="bt2-panel" style="padding:10px 14px;margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-family:var(--font-mono);font-size:9px;color:var(--bt2-sub);
          text-transform:uppercase;letter-spacing:.08em;white-space:nowrap">
          FONDOS A COMPARAR
        </span>
        <div id="fci-c-chips" style="display:flex;flex-wrap:wrap;gap:5px;flex:1"></div>
        <select class="dcf-select" id="fci-c-add" style="width:220px;font-size:.75rem">
          <option value="">+ Agregar fondo…</option>
        </select>
      </div>
    </div>

    <!-- Gráfico -->
    <div class="bt2-panel" style="min-height:460px;display:flex;flex-direction:column">
      <div class="bt2-panel-hdr">
        <span class="bt2-panel-title" id="fci-c-title">GRÁFICO COMPARATIVO — RETORNO ACUMULADO</span>
        <span class="bt2-panel-sub" id="fci-c-sub"></span>
      </div>
      <div id="fci-c-chart" style="flex:1;min-height:400px"></div>
    </div>

    <!-- Tabla resumen -->
    <div id="fci-c-table" style="margin-top:12px"></div>

    <div class="cer-note-strip" style="margin-top:10px">
      <span style="color:#94a3b8">ℹ</span>
      Retorno acumulado compuesto desde VCP mensual · Clase A · CAFCI.
    </div>`;

  // ── Exponer handlers globales (onclick en HTML) ──────────────────────────
  window._fciCToggleMon = (btn) => {
    document.querySelectorAll('[data-mon]').forEach(b => b.classList.remove('fci-ctoggle-active'));
    btn.classList.add('fci-ctoggle-active');
    cmp.moneda = btn.dataset.mon;
    _fciCRebuildFundList();
  };
  window._fciCTogglePer = (btn) => {
    document.querySelectorAll('[data-per]').forEach(b => b.classList.remove('fci-ctoggle-active'));
    btn.classList.add('fci-ctoggle-active');
    cmp.period = parseInt(btn.dataset.per);
    _fciCUpdateTitle();
    _fciCRenderChart();
    _fciCRenderTable();
  };
  window._fciCRemoveFund = (clase_nombre) => {
    cmp.selected = cmp.selected.filter(x => x !== clase_nombre);
    _fciCRenderChips();
    _fciCRenderChart();
    _fciCRenderTable();
  };

  // ── Build ALyC toggle chips ──────────────────────────────────────────────
  function _fciCBuildAlycToggles() {
    const el = document.getElementById('fci-c-alycs');
    if (!el) return;
    el.innerHTML = _FCI_ALYCS.map(a => `
      <button class="fci-ctoggle${cmp.alycs.has(a) ? ' fci-ctoggle-active' : ''}"
              onclick="_fciCToggleAlyc(this,'${a}')">${a}</button>`).join('');
  }
  window._fciCToggleAlyc = (btn, alyc) => {
    if (cmp.alycs.has(alyc)) { if (cmp.alycs.size > 1) cmp.alycs.delete(alyc); }
    else cmp.alycs.add(alyc);
    document.querySelectorAll('#fci-c-alycs .fci-ctoggle').forEach(b => {
      b.classList.toggle('fci-ctoggle-active', cmp.alycs.has(b.textContent.trim()));
    });
    _fciCRebuildFundList();
  };

  // ── Build Tipo toggle chips ──────────────────────────────────────────────
  function _fciCBuildTipoToggles() {
    const el = document.getElementById('fci-c-tipos');
    if (!el) return;
    const tiposDisp = [...new Set(cmp.allFunds.map(f => f.tipo).filter(Boolean))].sort();
    el.innerHTML = `<button class="fci-ctoggle${cmp.tipos.size===0?' fci-ctoggle-active':''}"
        onclick="_fciCToggleTipo(this,'')">Todos</button>` +
      tiposDisp.map(t => `
        <button class="fci-ctoggle${cmp.tipos.has(t)?' fci-ctoggle-active':''}"
                onclick="_fciCToggleTipo(this,'${t}')">${t}</button>`).join('');
  }
  window._fciCToggleTipo = (btn, tipo) => {
    if (tipo === '') { cmp.tipos.clear(); }
    else {
      if (cmp.tipos.has(tipo)) cmp.tipos.delete(tipo);
      else cmp.tipos.add(tipo);
    }
    document.querySelectorAll('#fci-c-tipos .fci-ctoggle').forEach(b => {
      const bt = b.dataset?.tipo || b.textContent.trim();
      const isAll = b.textContent.trim() === 'Todos';
      b.classList.toggle('fci-ctoggle-active', isAll ? cmp.tipos.size===0 : cmp.tipos.has(b.textContent.trim()));
    });
    _fciCRebuildFundList();
  };

  // ── Filtered fund list ───────────────────────────────────────────────────
  function _fciCFilteredFunds() {
    return cmp.allFunds.filter(f =>
      (!cmp.alycs.size    || cmp.alycs.has(f.alyc)) &&
      (!cmp.tipos.size    || cmp.tipos.has(f.tipo)) &&
      (!cmp.moneda        || f.moneda === cmp.moneda)
    );
  }

  function _fciCRebuildFundList() {
    const available = _fciCFilteredFunds();

    // Rebuild add-fund dropdown
    const sel = document.getElementById('fci-c-add');
    if (sel) {
      const current = new Set(cmp.selected);
      sel.innerHTML = '<option value="">+ Agregar fondo…</option>' +
        available
          .filter(f => !current.has(f.clase_nombre))
          .map(f => {
            const n = _shortFundName(f.clase_nombre);
            return `<option value="${f.clase_nombre}">[${f.alyc}] ${n}</option>`;
          }).join('');
    }

    // Remove selected funds no longer in filtered list
    const availableNames = new Set(available.map(f => f.clase_nombre));
    const removed = cmp.selected.filter(s => !availableNames.has(s));
    if (removed.length) {
      cmp.selected = cmp.selected.filter(s => availableNames.has(s));
    }

    // Auto-select top 5 if nothing selected.
    // Priorizar fondos con histórico (para que el gráfico de líneas tenga data).
    // Fallback: fondos sin histórico pero con rendimiento puntual.
    if (!cmp.selected.length) {
      const withHist = available
        .filter(f => _fciHasValidHistory(f) && f.rend_year != null)
        .sort((a, b) => (b.rend_year ?? -9999) - (a.rend_year ?? -9999))
        .slice(0, 5);
      const fallback = available
        .filter(f => !_fciHasValidHistory(f) && f.rend_year != null)
        .sort((a, b) => (b.rend_year ?? -9999) - (a.rend_year ?? -9999))
        .slice(0, 5 - withHist.length);
      const top5 = [...withHist, ...fallback];
      cmp.selected = top5.map(f => f.clase_nombre);
    }

    _fciCRenderChips();
    _fciCRenderChart();
    _fciCRenderTable();
  }

  // ── Chips ────────────────────────────────────────────────────────────────
  function _fciCRenderChips() {
    const el = document.getElementById('fci-c-chips');
    if (!el) return;
    if (!cmp.selected.length) {
      el.innerHTML = `<span style="font-family:var(--font-mono);color:var(--text-muted);font-size:.72rem">
        Seleccioná fondos para comparar</span>`;
      return;
    }
    el.innerHTML = cmp.selected.map((cn, i) => {
      const color = _COMP_COLORS[i % _COMP_COLORS.length];
      const n = _shortFundName(cn);
      const fund = cmp.allFunds.find(f => f.clase_nombre === cn);
      const alyc = fund?.alyc || '';
      return `<span style="display:inline-flex;align-items:center;gap:5px;padding:2px 8px 2px 6px;
          border-radius:12px;border:1px solid ${color};background:${color}18;
          font-family:var(--font-mono);font-size:.68rem;color:${color};white-space:nowrap">
        <span style="background:${color};width:6px;height:6px;border-radius:50%;flex-shrink:0"></span>
        ${n}${alyc ? ` <span style="color:${color}99;font-size:.6rem">${alyc}</span>` : ''}
        <button onclick="_fciCRemoveFund('${cn.replace(/'/g,"\\'")}')"
          style="background:none;border:none;color:${color};cursor:pointer;padding:0;line-height:1;font-size:12px;margin-left:2px">×</button>
      </span>`;
    }).join('');

    // Rebuild dropdown (exclude selected)
    const available = _fciCFilteredFunds();
    const sel = document.getElementById('fci-c-add');
    if (sel) {
      const current = new Set(cmp.selected);
      sel.innerHTML = '<option value="">+ Agregar fondo…</option>' +
        available
          .filter(f => !current.has(f.clase_nombre))
          .map(f => {
            const n = _shortFundName(f.clase_nombre);
            return `<option value="${f.clase_nombre}">[${f.alyc}] ${n}</option>`;
          }).join('');
    }
  }

  // ── Add fund via dropdown ────────────────────────────────────────────────
  document.getElementById('fci-c-add')?.addEventListener('change', e => {
    const val = e.target.value;
    if (val && !cmp.selected.includes(val)) {
      cmp.selected.push(val);
      _fciCRenderChips();
      _fciCRenderChart();
      _fciCRenderTable();
    }
    e.target.value = '';
  });

  // ── Title helper ─────────────────────────────────────────────────────────
  function _fciCUpdateTitle() {
    const el = document.getElementById('fci-c-title');
    if (el) el.textContent = `GRÁFICO COMPARATIVO — RETORNO ACUMULADO ÚLTIMOS ${cmp.period}M`;
  }

  // ── Chart ─────────────────────────────────────────────────────────────────
  function _fciCRenderChart() {
    const chartEl = document.getElementById('fci-c-chart');
    const subEl   = document.getElementById('fci-c-sub');
    if (!chartEl) return;

    if (!cmp.selected.length) {
      const ex = echarts.getInstanceByDom(chartEl);
      if (ex) ex.dispose();
      chartEl.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;
        font-family:var(--font-mono);color:var(--bt2-sub);font-size:.78rem;padding:40px">
        Seleccioná al menos un fondo para ver el gráfico.</div>`;
      return;
    }

    const nMonths     = Math.min(cmp.period, cmp.dateCols.length);
    const sliceDates  = cmp.dateCols.slice(-nMonths);
    const xLabels     = sliceDates.map(_fmtMonthLabel);

    // Insertar punto inicial 0% antes de la primera fecha
    const xLabelsFull = ['Inicio', ...xLabels];

    const series = [];
    let hasData = false;

    cmp.selected.forEach((cn, idx) => {
      const fund = cmp.allFunds.find(f => f.clase_nombre === cn);
      if (!fund) return;

      const color     = _COMP_COLORS[idx % _COMP_COLORS.length];
      const shortName = _shortFundName(cn);
      const cumVals   = _computeCumulative(fund.monthly_returns || [], nMonths);
      const hasAny    = cumVals.some(v => v !== null);
      if (!hasAny) return;
      hasData = true;

      // Prepend 0 for "Inicio"
      const yVals = [0, ...cumVals.map(v => v ?? null)];

      series.push({
        name: shortName,
        type: 'line',
        data: yVals,
        smooth: false,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color, width: 2.2 },
        itemStyle: { color },
        endLabel: {
          show: true,
          color,
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 10,
          fontWeight: 700,
          formatter: p => {
            const last = yVals[yVals.length - 1];
            return last != null
              ? (last >= 0 ? '+' : '') + last.toFixed(1).replace('.', ',') + '%'
              : '';
          },
        },
        tooltip: {
          valueFormatter: v => v != null
            ? (v >= 0 ? '+' : '') + Number(v).toFixed(2).replace('.', ',') + '%'
            : '—',
        },
      });
    });

    if (subEl) subEl.textContent = series.length + ' fondos';

    const ex = echarts.getInstanceByDom(chartEl);
    if (ex) ex.dispose();
    const chart = echarts.init(chartEl, 'dcf');
    const mono = "'JetBrains Mono',monospace";

    if (!hasData) {
      chartEl.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;
        font-family:${mono};color:var(--bt2-sub);font-size:.78rem;padding:40px">
        No hay histórico mensual para los fondos seleccionados.</div>`;
      return;
    }

    chart.setOption({
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#0d1424',
        borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, padding: [10, 14],
        textStyle: { fontFamily: mono, fontSize: 11 },
        formatter: params => {
          let h = `<div style="font-family:${mono};font-size:11px">
            <div style="font-weight:700;margin-bottom:6px;color:#94a3b8">${params[0]?.axisValue}</div>`;
          params.forEach(p => {
            const v = p.value;
            const color = p.color;
            const fmtV = v != null
              ? `<span style="color:${v >= 0 ? '#22c55e' : '#ef4444'};font-weight:700">${v >= 0 ? '+' : ''}${Number(v).toFixed(2).replace('.', ',')}%</span>`
              : '<span style="color:#475569">—</span>';
            h += `<div style="display:flex;justify-content:space-between;gap:20px;margin:2px 0">
              <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:5px"></span>${p.seriesName}</span>
              ${fmtV}
            </div>`;
          });
          return h + '</div>';
        },
      },
      legend: {
        show: false,   // usamos end-labels en lugar de leyenda
      },
      grid: { left: 10, right: 90, top: 16, bottom: 34, containLabel: true },
      xAxis: {
        type: 'category', data: xLabelsFull, boundaryGap: false,
        axisLabel: { color: '#475569', fontFamily: mono, fontSize: 9.5, rotate: xLabels.length > 8 ? 30 : 0 },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value', name: 'Retorno acumulado (%)', nameLocation: 'end', nameGap: 6,
        nameTextStyle: { color: '#475569', fontFamily: mono, fontSize: 9, align: 'left' },
        axisLabel: {
          color: '#475569', fontFamily: mono, fontSize: 9,
          formatter: v => (v >= 0 ? '+' : '') + v.toFixed(0) + '%',
        },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } },
        axisPointer: { label: { formatter: p => (p.value >= 0 ? '+' : '') + Number(p.value).toFixed(1) + '%' } },
      },
      series,
    });

    chart.resize();
    new ResizeObserver(() => chart.resize()).observe(chartEl);
  }

  // ── Summary table ─────────────────────────────────────────────────────────
  function _fciCRenderTable() {
    const el = document.getElementById('fci-c-table');
    if (!el || !cmp.selected.length) { if (el) el.innerHTML = ''; return; }

    const nMonths = Math.min(cmp.period, cmp.dateCols.length);
    const fP = v => v != null ? `<span style="color:${v >= 0 ? '#22c55e' : '#ef4444'};font-weight:600">${v >= 0 ? '+' : ''}${Number(v).toFixed(2).replace('.', ',')}%</span>` : '—';

    const headers = `<tr>
      <th style="text-align:left">FONDO</th>
      <th>ALYC</th>
      <th>TIPO</th>
      <th>MON.</th>
      <th>MES</th>
      <th>12M</th>
      <th>ACUM. ${cmp.period}M</th>
    </tr>`;

    const rows = cmp.selected.map((cn, idx) => {
      const fund = cmp.allFunds.find(f => f.clase_nombre === cn);
      if (!fund) return '';
      const color  = _COMP_COLORS[idx % _COMP_COLORS.length];
      const cumArr = _computeCumulative(fund.monthly_returns || [], nMonths);
      const acum   = cumArr.length ? cumArr[cumArr.length - 1] : null;
      const n = _shortFundName(cn);
      return `<tr class="bt2-row">
        <td style="font-family:var(--font-mono);font-size:.77rem;max-width:280px;white-space:normal;line-height:1.3">
          <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${color};margin-right:6px;flex-shrink:0"></span>${n}
        </td>
        <td class="bt2-td-num" style="color:#94a3b8;font-size:.72rem">${fund.alyc}</td>
        <td class="bt2-td-num">${_fciTipoBadge(fund.tipo)}</td>
        <td class="bt2-td-num">${_fciMonedaBadge(fund.moneda)}</td>
        <td class="bt2-td-num">${fP(fund.rend_mes)}</td>
        <td class="bt2-td-num">${fP(fund.rend_year)}</td>
        <td class="bt2-td-num" style="font-weight:700">${fP(acum)}</td>
      </tr>`;
    }).join('');

    el.innerHTML = `<table class="bt2-table"><thead>${headers}</thead><tbody>${rows}</tbody></table>`;
  }

  // ── Load data ─────────────────────────────────────────────────────────────
  try {
    const resp = await api.fci.fondos({});
    const rawAll  = Array.isArray(resp) ? resp : (resp?.fondos || []);
    cmp.allFunds  = rawAll.filter(_fciHasValidData);
    cmp.dateCols  = Array.isArray(resp) ? [] : (resp?.date_cols || []);

    console.log('[FCI comparativo] Fondos cargados:', rawAll.length,
      '| válidos:', cmp.allFunds.length,
      '| excluidos:', rawAll.length - cmp.allFunds.length);

    console.log('[FCI comparativo] Fondos cargados:', cmp.allFunds.length,
      '| Fechas:', cmp.dateCols.length);

    _fciCBuildAlycToggles();
    _fciCBuildTipoToggles();
    _fciCRebuildFundList();
    _fciCUpdateTitle();

  } catch (e) {
    console.error('[FCI comparativo] Error:', e);
    container.querySelector('#fci-c-chart').innerHTML = `
      <div style="padding:20px;font-family:var(--font-mono);color:var(--negative);font-size:.8rem">
        Error cargando fondos: ${e.message}
      </div>`;
  }
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
