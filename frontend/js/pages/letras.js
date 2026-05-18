/* ─── Letras y Boncaps — BondTerminal v2 ──────────────────────────────── */

let _ltData = [];
let _ltMep  = null;
let _ltView = 'TNA';

(window.pages = window.pages || {}).letras = async function(container) {
  container.innerHTML = `
    <div class="bt2-page">

      <!-- Header compacto: título + MEP badge -->
      <div class="bt2-header">
        <h1 class="bt2-title">Letras y Boncaps</h1>
        <div class="ltr-mep-badge">
          <span class="ltr-mep-label">MEP</span>
          <span class="ltr-mep-val" id="ltr-mep-val">—</span>
        </div>
      </div>

      <!-- Main two-column grid -->
      <div class="ltr-grid">

        <!-- LEFT: tabla sin selector propio -->
        <div class="bt2-panel">
          <div class="bt2-panel-hdr">
            <span class="bt2-panel-title">LETRAS Y BONCAPS ACTIVOS</span>
          </div>
          <div class="bt2-snapshot-scroll" id="ltr-table-wrap">
            ${_ltrSkeleton(8)}
          </div>
        </div>

        <!-- RIGHT: chart — selector dentro del header de esta card -->
        <div class="bt2-panel ltr-chart-panel">
          <div class="bt2-panel-hdr">
            <span class="bt2-panel-title" id="ltr-chart-title">TNA POR PLAZO</span>
            <div id="ltr-pills"></div>
          </div>
          <div id="ltr-chart"></div>
        </div>

      </div>
    </div>`;

  // Pills dentro del header del chart — controlan también el destaque de la tabla
  const views = ['TNA', 'TEM', 'Carry-Trade'];
  document.getElementById('ltr-pills').appendChild(
    ui.pills(views, views.indexOf(_ltView), (_, lbl) => {
      _ltView = lbl;
      _ltrUpdateAll();
    }, 'pills-sm')
  );

  try {
    const res = await api.letras.carry();
    _ltData = (res.rows || []).filter(d => d.dias != null && d.dias > 0);
    _ltMep  = res.mep || null;
    _ltrUpdateAll();
  } catch (e) {
    document.getElementById('ltr-table-wrap').innerHTML =
      `<p style="padding:14px;font-family:var(--font-mono);color:var(--negative);font-size:.78rem">Error: ${e.message}</p>`;
  }
};

// ── Orquestador central ────────────────────────────────────────────────────
function _ltrUpdateAll() {
  const mepEl = document.getElementById('ltr-mep-val');
  if (mepEl) {
    mepEl.textContent = _ltMep != null
      ? '$' + _ltMep.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : 'N/D';
  }

  const titles = { 'TNA': 'TNA POR PLAZO', 'TEM': 'TEM POR PLAZO', 'Carry-Trade': 'CARRY-TRADE — BANDAS MEP' };
  const tEl = document.getElementById('ltr-chart-title');
  if (tEl) tEl.textContent = titles[_ltView];

  _ltrRenderTable();
  _ltrRenderChart();
}

// ── Tabla compacta uniforme ────────────────────────────────────────────────
// TICKER | PRECIO | VAR % | TNA | TEA | TEM  — siempre igual, sin importar el tab activo.
// Días, vencimiento y datos extendidos van en el modal al hacer click.
function _ltrRenderTable() {
  const wrap = document.getElementById('ltr-table-wrap');
  if (!wrap) return;

  if (!_ltData.length) {
    wrap.innerHTML = `<p style="padding:16px 12px;font-family:var(--font-mono);color:var(--text-muted);font-size:.75rem">Sin datos disponibles</p>`;
    return;
  }

  const sorted = [..._ltData].sort((a, b) => (a.dias ?? 9999) - (b.dias ?? 9999));

  function tdPct(val, hl = false) {
    if (val == null) return `<td class="bt2-td-num bt2-sub">—</td>`;
    return `<td class="bt2-td-num${hl ? ' ltr-hl' : ''}">${val.toFixed(2).replace('.', ',')}%</td>`;
  }
  function tdVar(val) {
    if (val == null) return `<td class="bt2-td-num bt2-sub">—</td>`;
    const sign = val > 0 ? '+' : '';
    const cls  = val > 0.01 ? 'bt2-pos' : val < -0.01 ? 'bt2-neg' : 'bt2-sub';
    return `<td class="bt2-td-num ${cls}">${sign}${val.toFixed(2).replace('.', ',')}%</td>`;
  }

  const headers = `<tr>
    <th style="text-align:left">TICKER</th>
    <th>PRECIO</th>
    <th>VAR %</th>
    <th class="ltr-th-hl">TNA</th>
    <th>TEA</th>
    <th>TEM</th>
  </tr>`;

  const rows = sorted.map(d => {
    const priceStr = d.precio != null ? `$${d.precio.toFixed(2).replace('.', ',')}` : '—';
    return `<tr class="bt2-row">
      <td class="bt2-td-ticker ltr-tk bond-clickable"
          onclick="_openLetraCalc('${d.ticker}')"
          title="Click para abrir calculadora">${d.ticker}</td>
      <td class="bt2-td-num">${priceStr}</td>
      ${tdVar(d.pct_change)}
      ${tdPct(d.tna, true)}
      ${tdPct(d.tea)}
      ${tdPct(d.tem)}
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <table class="bt2-table">
      <thead>${headers}</thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Charts ─────────────────────────────────────────────────────────────────
function _ltrRenderChart() {
  if (_ltView === 'Carry-Trade') {
    _ltrCarryChart();
  } else {
    _ltrCurvaChart();
  }
}

// ── Chart TNA / TEM con autofit y regresión log ────────────────────────────
function _ltrCurvaChart() {
  const el = document.getElementById('ltr-chart');
  if (!el) return;

  const yKey   = _ltView === 'TNA' ? 'tna' : 'tem';
  const yLabel = _ltView === 'TNA' ? 'TNA (%)' : 'TEM (%)';
  const valid  = _ltData.filter(d => d[yKey] != null && d.dias > 0).sort((a, b) => a.dias - b.dias);
  const mono   = "'JetBrains Mono',monospace";

  if (!valid.length) {
    _ltrEmptyChart('ltr-chart', 'Sin datos disponibles para graficar');
    return;
  }

  // ── Autofit ejes ──────────────────────────────────────────────────────────
  const xVals = valid.map(d => d.dias);
  const xMin  = Math.min(...xVals);
  const xMax  = Math.max(...xVals);
  const xPad  = Math.max((xMax - xMin) * 0.08, 10);

  const yVals = valid.map(d => d[yKey]).filter(Number.isFinite);
  const yMin  = Math.min(...yVals);
  const yMax  = Math.max(...yVals);
  const yPad  = Math.max((yMax - yMin) * 0.18, yKey === 'tna' ? 0.5 : 0.05);

  const trend = _ltrLogReg(valid.map(d => [d.dias, d[yKey]]));

  const existing = echarts.getInstanceByDom(el);
  if (existing) existing.dispose();
  el.style.height = '430px';
  const chart = echarts.init(el, 'dcf');

  chart.setOption({
    tooltip: {
      trigger: 'item',
      backgroundColor: '#0d1424',
      borderColor: 'rgba(255,255,255,0.12)',
      borderWidth: 1,
      padding: [10, 14],
      formatter: (p) => {
        if (!p.value || p.seriesType === 'line') return '';
        const d = valid[p.dataIndex];
        if (!d) return '';
        const fp = (v) => v != null ? v.toFixed(2).replace('.', ',') + '%' : '—';
        const row = (l, v) => `<div style="display:flex;justify-content:space-between;gap:16px;margin-top:2px"><span style="color:#7a8fa6">${l}</span><span>${v}</span></div>`;
        let h = `<div style="font-family:${mono};font-size:11.5px;min-width:170px">`;
        h += `<div style="font-size:13px;font-weight:700;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.08)">${d.ticker}</div>`;
        h += row('Precio',  d.precio != null ? `$${d.precio.toFixed(2).replace('.', ',')}` : '—');
        h += row('Días',    d.dias);
        h += row('TNA',     fp(d.tna));
        h += row('TEM',     fp(d.tem));
        h += row('TEA',     fp(d.tea));
        if (d.vencimiento) {
          const [y, m, dv] = d.vencimiento.split('-');
          h += row('Venc.', `${dv}/${m}/${y}`);
        }
        return h + '</div>';
      },
    },
    // Más margen derecho/superior para que labels no se corten
    grid: { left: 10, right: 20, top: 22, bottom: 36, containLabel: true },
    xAxis: {
      type: 'value',
      name: 'Días al vencimiento',
      nameLocation: 'middle', nameGap: 28,
      min: Math.max(0, Math.floor(xMin - xPad)),
      max: Math.ceil(xMax + xPad),
      nameTextStyle: { color: '#64748b', fontFamily: mono, fontSize: 10 },
      axisLabel:  { color: '#64748b', fontFamily: mono, fontSize: 10 },
      axisLine:   { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitLine:  { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } },
    },
    yAxis: {
      type: 'value',
      name: yLabel,
      nameLocation: 'middle', nameGap: 44,
      min: Math.max(0, +(yMin - yPad).toFixed(2)),
      max: +(yMax + yPad).toFixed(2),
      nameTextStyle: { color: '#64748b', fontFamily: mono, fontSize: 10 },
      axisLabel:  { color: '#64748b', fontFamily: mono, fontSize: 10, formatter: v => `${v?.toFixed(yKey === 'tem' ? 2 : 1)}%` },
      axisLine:   { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitLine:  { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } },
    },
    series: [
      {
        type: 'scatter',
        name: _ltView,
        data: valid.map(d => [d.dias, d[yKey]]),
        symbolSize: 10,
        clip: false,
        itemStyle: { color: 'transparent', borderColor: '#f97316', borderWidth: 2 },
        label: {
          show: true,
          fontFamily: mono, fontSize: 9, fontWeight: 700,
          color: '#f97316',
          textBorderColor: 'rgba(8,17,28,0.9)', textBorderWidth: 2,
          formatter: p => valid[p.dataIndex]?.ticker || '',
          position: 'top', distance: 6,
        },
      },
      ...(trend ? [{
        type: 'line',
        data: trend,
        showSymbol: false,
        clip: true,
        lineStyle: { color: '#f97316', type: 'dashed', width: 1.5, opacity: 0.55 },
        tooltip: { show: false }, silent: true,
      }] : []),
    ],
    legend: { show: false },
  });

  new ResizeObserver(() => chart.resize()).observe(el);
}

// ── Chart Carry-Trade con autofit ──────────────────────────────────────────
function _ltrCarryChart() {
  const el = document.getElementById('ltr-chart');
  if (!el) return;

  const valid = _ltData.filter(d => d.mep_be != null && d.dias > 0).sort((a, b) => a.dias - b.dias);
  const mono  = "'JetBrains Mono',monospace";

  if (!valid.length) {
    _ltrEmptyChart('ltr-chart', 'Sin datos de Carry-Trade disponibles');
    return;
  }

  // ── Autofit ejes ──────────────────────────────────────────────────────────
  const xVals = valid.map(d => d.dias);
  const xMin  = Math.min(...xVals);
  const xMax  = Math.max(...xVals);
  const xPad  = Math.max((xMax - xMin) * 0.08, 10);

  const yAll  = [
    ...valid.map(d => d.mep_be),
    ...valid.filter(d => d.banda_sup != null).map(d => d.banda_sup),
    ...valid.filter(d => d.banda_inf != null).map(d => d.banda_inf),
    ...(_ltMep != null ? [_ltMep] : []),
  ].filter(v => v != null && Number.isFinite(v));
  const yMin  = Math.min(...yAll);
  const yMax  = Math.max(...yAll);
  const yPad  = Math.max((yMax - yMin) * 0.12, 50);

  const fmtARS = v => `$${Math.round(v).toLocaleString('es-AR')}`;

  const existing = echarts.getInstanceByDom(el);
  if (existing) existing.dispose();
  el.style.height = '430px';
  const chart = echarts.init(el, 'dcf');

  chart.setOption({
    tooltip: {
      trigger: 'item',
      backgroundColor: '#0d1424',
      borderColor: 'rgba(255,255,255,0.12)',
      borderWidth: 1,
      padding: [10, 14],
      formatter: (p) => {
        if (!p.value || p.seriesIndex !== 0) return '';
        const d = valid[p.dataIndex];
        if (!d) return '';
        const row = (l, v, col) =>
          `<div style="display:flex;justify-content:space-between;gap:16px;margin-top:2px">` +
          `<span style="color:#7a8fa6">${l}</span>` +
          `<span${col ? ` style="color:${col}"` : ''}>${v}</span></div>`;
        let h = `<div style="font-family:${mono};font-size:11.5px;min-width:190px">`;
        h += `<div style="font-size:13px;font-weight:700;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.08)">${d.ticker}</div>`;
        if (d.precio != null) h += row('Precio', `$${d.precio.toFixed(2).replace('.', ',')}`, '');
        h += row('Días', d.dias, '');
        h += row('MEP BE', fmtARS(d.mep_be), '#f97316');
        if (_ltMep != null) {
          h += row('MEP actual', fmtARS(_ltMep), '#4DA3FF');
          const diff = d.mep_be - _ltMep;
          const pct  = ((d.mep_be / _ltMep) - 1) * 100;
          h += row('vs MEP', `${diff >= 0 ? '+' : ''}${fmtARS(diff)} (${pct.toFixed(1).replace('.', ',')}%)`, diff >= 0 ? '#22c55e' : '#ef4444');
        }
        if (d.banda_sup != null) h += row('Banda ↑',  fmtARS(d.banda_sup), '#22c55e');
        if (d.banda_inf != null) h += row('Banda ↓',  fmtARS(d.banda_inf), '#ef4444');
        if (d.vencimiento) {
          const [y, m, dv] = d.vencimiento.split('-');
          h += row('Venc.', `${dv}/${m}/${y}`, '');
        }
        return h + '</div>';
      },
    },
    grid: { left: 10, right: 20, top: 36, bottom: 36, containLabel: true },
    xAxis: {
      type: 'value',
      name: 'Días al vencimiento',
      nameLocation: 'middle', nameGap: 28,
      min: Math.max(0, Math.floor(xMin - xPad)),
      max: Math.ceil(xMax + xPad),
      nameTextStyle: { color: '#64748b', fontFamily: mono, fontSize: 10 },
      axisLabel:  { color: '#64748b', fontFamily: mono, fontSize: 10 },
      axisLine:   { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitLine:  { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } },
    },
    yAxis: {
      type: 'value',
      name: 'MEP (ARS)',
      nameLocation: 'middle', nameGap: 58,
      min: Math.max(0, Math.floor(yMin - yPad)),
      max: Math.ceil(yMax + yPad),
      nameTextStyle: { color: '#64748b', fontFamily: mono, fontSize: 10 },
      axisLabel:  { color: '#64748b', fontFamily: mono, fontSize: 10, formatter: fmtARS },
      axisLine:   { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitLine:  { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } },
    },
    legend: {
      top: 4, right: 8,
      data: ['MEP BE', 'Banda ↑', 'Banda ↓'],
      textStyle: { color: '#94a3b8', fontFamily: mono, fontSize: 9 },
      itemHeight: 8, itemWidth: 14, itemGap: 12,
    },
    series: [
      // MEP Breakeven scatter con markLine de MEP actual
      {
        type: 'scatter',
        name: 'MEP BE',
        data: valid.map(d => [d.dias, d.mep_be]),
        symbolSize: 10,
        clip: false,
        itemStyle: { color: 'transparent', borderColor: '#f97316', borderWidth: 2 },
        label: {
          show: true,
          fontFamily: mono, fontSize: 9, fontWeight: 700,
          color: '#f97316',
          textBorderColor: 'rgba(8,17,28,0.9)', textBorderWidth: 2,
          formatter: p => valid[p.dataIndex]?.ticker || '',
          position: 'top', distance: 6,
        },
        ...((_ltMep != null) ? {
          markLine: {
            symbol: 'none',
            data: [{ yAxis: _ltMep }],
            lineStyle: { color: '#4DA3FF', type: 'solid', width: 1.5, opacity: 0.85 },
            label: {
              formatter: () => `MEP ${fmtARS(_ltMep)}`,
              color: '#4DA3FF', fontFamily: mono, fontSize: 9,
              position: 'insideEndTop',
            },
          },
        } : {}),
      },
      // Banda superior
      {
        type: 'line', name: 'Banda ↑',
        data: valid.filter(d => d.banda_sup != null).map(d => [d.dias, d.banda_sup]),
        showSymbol: false,
        lineStyle: { color: '#22c55e', type: 'dashed', width: 1.5, opacity: 0.7 },
        tooltip: { show: false }, silent: true,
      },
      // Banda inferior
      {
        type: 'line', name: 'Banda ↓',
        data: valid.filter(d => d.banda_inf != null).map(d => [d.dias, d.banda_inf]),
        showSymbol: false,
        lineStyle: { color: '#ef4444', type: 'dashed', width: 1.5, opacity: 0.7 },
        tooltip: { show: false }, silent: true,
      },
    ],
  });

  new ResizeObserver(() => chart.resize()).observe(el);
}

// ── Empty chart helper ─────────────────────────────────────────────────────
function _ltrEmptyChart(domId, msg) {
  dcfCharts.disposeChart(domId);
  const el = document.getElementById(domId);
  if (el) {
    el.style.height = '';
    el.innerHTML = `<p style="padding:20px;font-family:'JetBrains Mono',monospace;color:var(--text-muted);font-size:.78rem;text-align:center">${msg}</p>`;
  }
}

// ── Regresión logarítmica y = a·ln(x) + b ─────────────────────────────────
function _ltrLogReg(points) {
  const valid = points.filter(p => p[0] > 0 && p[1] != null && Number.isFinite(p[1]));
  if (valid.length < 2) return null;
  const n    = valid.length;
  const lnx  = valid.map(p => Math.log(p[0]));
  const sy   = valid.reduce((s, p) => s + p[1], 0);
  const slx  = lnx.reduce((s, x) => s + x, 0);
  const slxy = valid.reduce((s, p, i) => s + lnx[i] * p[1], 0);
  const slx2 = lnx.reduce((s, x) => s + x * x, 0);
  const denom = n * slx2 - slx * slx;
  if (Math.abs(denom) < 1e-10) return null;
  const a = (n * slxy - slx * sy) / denom;
  const b = (sy - a * slx) / n;
  const xs = valid.map(p => p[0]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  return Array.from({ length: 50 }, (_, i) => {
    const x = x0 + (x1 - x0) * i / 49;
    const y = a * Math.log(x) + b;
    return [x, Math.max(0, y)];  // no negativos
  });
}

// ── Skeleton loader ─────────────────────────────────────────────────────────
function _ltrSkeleton(n) {
  return Array.from({ length: n }, () =>
    `<div class="skeleton skeleton-table-row" style="margin:2px 12px"></div>`
  ).join('');
}

/* ─────────────────────────────────────────────────────────────────────────
   CALCULADORA DE LETRAS Y BONCAPS
   ───────────────────────────────────────────────────────────────────────── */

const LTR_COMM_DEFAULT = 0.50;  // % comisión
const LTR_TAX_DEFAULT  = 0.01;  // % impuestos

// ── Abrir calculadora ─────────────────────────────────────────────────────
function _openLetraCalc(ticker) {
  const d = _ltData.find(x => x.ticker === ticker);
  if (!d) return;
  _buildLetraModal(d);
}

// ── Construir modal ───────────────────────────────────────────────────────
function _buildLetraModal(d) {
  const old = document.getElementById('ltr-calc-overlay');
  if (old) old.remove();

  const fmtP = (v, d2=2) => v != null ? `$${Number(v).toLocaleString('es-AR',{minimumFractionDigits:d2,maximumFractionDigits:d2})}` : '—';
  const fmtPct = v => v != null ? v.toFixed(2).replace('.',',')+'%' : '—';
  const fmtDate = s => { if (!s) return '—'; const [y,m,dv]=s.split('-'); return `${dv}/${m}/${y}`; };

  const retorno = (d.payoff != null && d.precio != null && d.precio > 0)
    ? (d.payoff / d.precio - 1) * 100 : null;
  const retCls  = retorno != null ? (retorno > 0 ? 'green' : retorno < 0 ? 'neg' : '') : '';
  const retStr  = retorno != null ? (retorno >= 0 ? '+' : '') + retorno.toFixed(2).replace('.',',') + '%' : '—';

  const mi = (label, val, cls='') =>
    `<div class="bcc-meta-item"><span class="bcc-meta-label">${label}</span><span class="bcc-meta-val ${cls}">${val}</span></div>`;

  const el = document.createElement('div');
  el.id = 'ltr-calc-overlay';
  el.className = 'bcc-overlay';
  el.innerHTML = `
    <div class="bcc-modal">

      <div class="bcc-header">
        <div>
          <span class="bcc-title" style="color:var(--bt2-accent)">${d.ticker}</span>
          <span class="bcc-subtitle">CALCULADORA LETRA / BONCAP</span>
        </div>
        <button class="bcc-close" onclick="document.getElementById('ltr-calc-overlay').remove()">✕</button>
      </div>

      <div class="bcc-body">

        <!-- Metadata: fechas y tasas -->
        <div class="bcc-meta">
          ${d.vencimiento ? mi('VENCE', fmtDate(d.vencimiento), '') : ''}
          ${d.dias != null ? mi('DÍAS', d.dias + '', '') : ''}
          ${mi('TNA', fmtPct(d.tna), 'accent')}
          ${mi('TEA', fmtPct(d.tea), '')}
          ${mi('TEM', fmtPct(d.tem), '')}
          ${d.mep_be != null ? mi('MEP BE', '$' + Number(d.mep_be).toLocaleString('es-AR'), '') : ''}
        </div>

        <!-- Strip de precios -->
        <div class="ltr-price-strip">
          <div class="ltr-price-card">
            <div class="ltr-price-label">PRECIO ACTUAL</div>
            <div class="ltr-price-val">${fmtP(d.precio)}</div>
          </div>
          <div class="ltr-price-card ltr-price-card-accent">
            <div class="ltr-price-label">PRECIO AL VENCIMIENTO</div>
            <div class="ltr-price-val">${fmtP(d.payoff)}</div>
            ${d.payoff == null ? `<div class="ltr-price-note">No disponible para este instrumento</div>` : ''}
          </div>
          <div class="ltr-price-card">
            <div class="ltr-price-label">RETORNO EST. HASTA VENC.</div>
            <div class="ltr-price-val ${retCls}">${retStr}</div>
            ${d.payoff != null && d.precio != null
              ? `<div class="ltr-price-note">${fmtP(d.payoff)} − ${fmtP(d.precio)} = ${fmtP(d.payoff != null && d.precio != null ? d.payoff - d.precio : null)}</div>`
              : ''}
          </div>
        </div>

        <!-- Calculadora -->
        <div class="bcc-card">
          <div class="bcc-card-title">CALCULADORA</div>
          <div class="bcc-card-body">
            <div class="bcc-mode-toggle">
              <button class="bcc-mode-btn active" id="ltr-btn-amount" onclick="_setLtrMode('amount')">Por monto invertido</button>
              <button class="bcc-mode-btn"        id="ltr-btn-nom"    onclick="_setLtrMode('nom')">Por nominales</button>
            </div>
            <div class="bcc-inputs">
              <div class="bcc-field">
                <label id="ltr-amount-label">Monto bruto a invertir ($)</label>
                <input type="number" id="ltr-input-amount" placeholder="Ej: 100.000" min="0" oninput="_letraCalcUpdate()">
              </div>
              <div class="bcc-field">
                <label>Nominales a comprar</label>
                <input type="number" id="ltr-input-nom" placeholder="Ej: 750" min="0" disabled oninput="_letraCalcUpdate()">
              </div>
              <div class="bcc-field">
                <label>Precio actual</label>
                <input type="number" id="ltr-input-price" value="${d.precio ?? ''}" step="0.0001" oninput="_letraCalcUpdate()">
              </div>
              <div class="bcc-field">
                <label>Precio al vencimiento</label>
                <input type="number" id="ltr-input-payoff" value="${d.payoff ?? ''}" step="0.0001" oninput="_letraCalcUpdate()">
              </div>
              <div class="bcc-field">
                <label>Comisión (%)</label>
                <input type="number" id="ltr-input-comm" value="${LTR_COMM_DEFAULT}" step="0.01" min="0" max="10" oninput="_letraCalcUpdate()">
              </div>
              <div class="bcc-field">
                <label>Impuestos (%)</label>
                <input type="number" id="ltr-input-tax" value="${LTR_TAX_DEFAULT}" step="0.01" min="0" max="10" oninput="_letraCalcUpdate()">
              </div>
            </div>
            <p class="bcc-note">El monto ingresado es el desembolso total incluyendo costos. Net = bruto ÷ (1 + costos).</p>
          </div>
        </div>

        <!-- Resumen -->
        <div class="bcc-card" id="ltr-calc-summary">
          <div class="bcc-card-title">RESUMEN ESTIMADO</div>
          <div class="bcc-card-body">
            <p class="bcc-note">Ingresá monto o nominales para ver el resumen.</p>
          </div>
        </div>

      </div>
    </div>`;

  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });
  const esc = e => { if (e.key === 'Escape') { el.remove(); document.removeEventListener('keydown', esc); } };
  document.addEventListener('keydown', esc);
  _setLtrMode('amount');
}

// ── Toggle modo ───────────────────────────────────────────────────────────
let _ltrCalcMode = 'amount';
function _setLtrMode(mode) {
  _ltrCalcMode = mode;
  document.getElementById('ltr-btn-amount')?.classList.toggle('active', mode === 'amount');
  document.getElementById('ltr-btn-nom')?.classList.toggle('active', mode === 'nom');
  const amtEl = document.getElementById('ltr-input-amount');
  const nomEl = document.getElementById('ltr-input-nom');
  if (mode === 'amount') {
    if (amtEl) amtEl.disabled = false;
    if (nomEl) { nomEl.value = ''; nomEl.disabled = true; }
  } else {
    if (nomEl) nomEl.disabled = false;
    if (amtEl) { amtEl.value = ''; amtEl.disabled = true; }
  }
  _letraCalcUpdate();
}

// ── Recalcular ────────────────────────────────────────────────────────────
function _letraCalcUpdate() {
  const price  = parseFloat(document.getElementById('ltr-input-price')?.value) || 0;
  const payoff = parseFloat(document.getElementById('ltr-input-payoff')?.value) || 0;
  const commPct = parseFloat(document.getElementById('ltr-input-comm')?.value ?? LTR_COMM_DEFAULT);
  const taxPct  = parseFloat(document.getElementById('ltr-input-tax')?.value  ?? LTR_TAX_DEFAULT);

  if (!price) { _ltrClearSummary(); return; }

  const commRate = (isFinite(commPct) ? commPct : LTR_COMM_DEFAULT) / 100;
  const taxRate  = (isFinite(taxPct)  ? taxPct  : LTR_TAX_DEFAULT) / 100;
  const costRate = commRate + taxRate;

  let net, gross, nom;

  if (_ltrCalcMode === 'amount') {
    gross = parseFloat(document.getElementById('ltr-input-amount')?.value) || 0;
    if (!gross) { _ltrClearSummary(); return; }
    net = gross / (1 + costRate);
    nom = (net / price) * 100;          // precio en base 100 → VN = (neto / precio) × 100
  } else {
    nom = parseFloat(document.getElementById('ltr-input-nom')?.value) || 0;
    if (!nom) { _ltrClearSummary(); return; }
    net   = nom * price / 100;          // base 100: neto = VN × precio / 100
    gross = net * (1 + costRate);
  }

  const commission = net * commRate;
  const taxes      = net * taxRate;
  const totalCosts = commission + taxes;
  const atMaturity = payoff > 0 ? nom * payoff / 100 : null;  // base 100: VN × payoff / 100
  const ganancia   = atMaturity != null ? atMaturity - gross : null;
  const retorno    = atMaturity != null && gross > 0 ? (atMaturity / gross - 1) * 100 : null;

  const fmtM = (v, d=2) => v != null ? `$${Number(v).toLocaleString('es-AR',{minimumFractionDigits:d,maximumFractionDigits:d})}` : '—';
  const fmtN = v => Number(v).toLocaleString('es-AR',{minimumFractionDigits:0,maximumFractionDigits:2});
  const fmtPct = v => v != null ? (v >= 0 ? '+' : '') + v.toFixed(2).replace('.',',') + '%' : '—';
  const fmtPctRate = v => (v * 100).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}) + '%';

  const sRow = (label, val, cls='') =>
    `<div class="bcc-sum-row"><span class="bcc-sum-label">${label}</span><span class="bcc-sum-val ${cls}">${val}</span></div>`;

  let col1, col2;
  if (_ltrCalcMode === 'amount') {
    col1 = [
      sRow('Monto bruto ingresado',          fmtM(gross)),
      sRow(`Comisión ${fmtPctRate(commRate)}`, fmtM(commission), 'neg'),
      sRow(`Impuestos ${fmtPctRate(taxRate)}`, fmtM(taxes),      'neg'),
      sRow(`Costos ${fmtPctRate(costRate)}`,   fmtM(totalCosts), 'neg'),
      sRow('Monto neto aplicado a compra',   fmtM(net)),
    ];
    col2 = [
      sRow('Nominales estimados',      fmtN(nom),                   'accent'),
      sRow('Precio actual',            fmtM(price, 4)),
      sRow('Precio al vencimiento',    payoff > 0 ? fmtM(payoff, 4) : '—'),
      sRow('Monto estimado al venc.',  atMaturity != null ? fmtM(atMaturity) : '—', 'pos'),
      sRow('Ganancia estimada',        ganancia != null ? fmtM(ganancia) : '—', ganancia != null && ganancia >= 0 ? 'pos' : 'neg'),
      sRow('Retorno estimado',         fmtPct(retorno), retorno != null && retorno >= 0 ? 'pos' : 'neg'),
    ];
  } else {
    col1 = [
      sRow('Nominales ingresados',       fmtN(nom),                   'accent'),
      sRow('Monto neto de compra',       fmtM(net)),
      sRow(`Comisión ${fmtPctRate(commRate)}`, fmtM(commission), 'neg'),
      sRow(`Impuestos ${fmtPctRate(taxRate)}`, fmtM(taxes),      'neg'),
      sRow('Monto bruto total',          fmtM(gross)),
    ];
    col2 = [
      sRow('Precio actual',            fmtM(price, 4)),
      sRow('Precio al vencimiento',    payoff > 0 ? fmtM(payoff, 4) : '—'),
      sRow('Monto estimado al venc.',  atMaturity != null ? fmtM(atMaturity) : '—', 'pos'),
      sRow('Ganancia estimada',        ganancia != null ? fmtM(ganancia) : '—', ganancia != null && ganancia >= 0 ? 'pos' : 'neg'),
      sRow('Retorno estimado',         fmtPct(retorno), retorno != null && retorno >= 0 ? 'pos' : 'neg'),
    ];
  }

  const sumEl = document.querySelector('#ltr-calc-summary .bcc-card-body');
  if (sumEl) {
    sumEl.innerHTML = `<div class="bcc-sum-grid"><div>${col1.join('')}</div><div>${col2.join('')}</div></div>`;
  }
}

function _ltrClearSummary() {
  const sumEl = document.querySelector('#ltr-calc-summary .bcc-card-body');
  if (sumEl) sumEl.innerHTML = `<p class="bcc-note">Ingresá monto o nominales para ver el resumen.</p>`;
}
