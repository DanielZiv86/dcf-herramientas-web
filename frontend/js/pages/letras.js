/* ─── Letras y Boncaps — BondTerminal v2 ──────────────────────────────── */

let _ltData = [];
let _ltMep  = null;
let _ltView = 'TNA';

(window.pages = window.pages || {}).letras = async function(container) {
  container.innerHTML = `
    <div class="bt2-page">

      <!-- Header -->
      <div class="bt2-header">
        <h1 class="bt2-title">Letras y Boncaps</h1>
        <div class="ltr-mep-badge">
          <span class="ltr-mep-label">MEP</span>
          <span class="ltr-mep-val" id="ltr-mep-val">—</span>
        </div>
      </div>

      <!-- Tabs globales -->
      <div class="bt2-tabs" id="ltr-pills"></div>

      <!-- Main two-column grid -->
      <div class="ltr-grid">

        <!-- LEFT: tabla -->
        <div class="bt2-panel">
          <div class="bt2-panel-hdr">
            <span class="bt2-panel-title">LETRAS Y BONCAPS ACTIVOS</span>
          </div>
          <div class="bt2-snapshot-scroll" id="ltr-table-wrap">
            ${_ltrSkeleton(8)}
          </div>
        </div>

        <!-- RIGHT: chart -->
        <div class="bt2-panel ltr-chart-panel">
          <div class="bt2-panel-hdr">
            <span class="bt2-panel-title" id="ltr-chart-title">TNA POR PLAZO</span>
          </div>
          <div id="ltr-chart"></div>
        </div>

      </div>
    </div>`;

  // Pills: controlan tabla Y gráfico simultáneamente
  const views = ['TNA', 'TEM', 'Carry-Trade'];
  document.getElementById('ltr-pills').appendChild(
    ui.pills(views, views.indexOf(_ltView), (_, lbl) => {
      _ltView = lbl;
      _ltrUpdateAll();
    })
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
  // MEP badge
  const mepEl = document.getElementById('ltr-mep-val');
  if (mepEl) {
    mepEl.textContent = _ltMep != null
      ? '$' + _ltMep.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : 'N/D';
  }

  // Chart title
  const titles = { 'TNA': 'TNA POR PLAZO', 'TEM': 'TEM POR PLAZO', 'Carry-Trade': 'CARRY-TRADE — BANDAS MEP' };
  const tEl = document.getElementById('ltr-chart-title');
  if (tEl) tEl.textContent = titles[_ltView];

  _ltrRenderTable();
  _ltrRenderChart();
}

// ── Tabla ──────────────────────────────────────────────────────────────────
function _ltrRenderTable() {
  const wrap = document.getElementById('ltr-table-wrap');
  if (!wrap) return;

  if (!_ltData.length) {
    wrap.innerHTML = `<p style="padding:16px 12px;font-family:var(--font-mono);color:var(--text-muted);font-size:.75rem">Sin datos disponibles</p>`;
    return;
  }

  const sorted = [..._ltData].sort((a, b) => (a.dias ?? 9999) - (b.dias ?? 9999));

  function tdNum(val)          { return `<td class="bt2-td-num">${val ?? '—'}</td>`; }
  function tdPct(val, hl=false) {
    if (val == null) return `<td class="bt2-td-num bt2-sub">—</td>`;
    const str = val.toFixed(2).replace('.', ',') + '%';
    return `<td class="bt2-td-num${hl ? ' ltr-hl' : ''}">${str}</td>`;
  }
  function tdARS(val) {
    if (val == null) return `<td class="bt2-td-num bt2-sub">—</td>`;
    return `<td class="bt2-td-num">$${Number(val).toLocaleString('es-AR', { maximumFractionDigits: 0 })}</td>`;
  }
  function tdDate(val) {
    if (!val) return `<td class="bt2-td-num bt2-sub">—</td>`;
    const [y, m, d] = val.split('-');
    return `<td class="bt2-td-num bt2-sub">${d}/${m}/${y}</td>`;
  }
  function tdPrecio(val) {
    if (val == null) return `<td class="bt2-td-num">—</td>`;
    return `<td class="bt2-td-num">$${val.toFixed(2).replace('.', ',')}</td>`;
  }

  let headers, rows;

  if (_ltView === 'TNA') {
    headers = `<tr>
      <th style="text-align:left">TICKER</th>
      <th>PRECIO</th><th>DÍAS</th>
      <th class="ltr-th-hl">TNA</th>
      <th>TEA</th><th>TEM</th><th>VENC.</th>
    </tr>`;
    rows = sorted.map(d => `<tr class="bt2-row">
      <td class="bt2-td-ticker ltr-tk">${d.ticker}</td>
      ${tdPrecio(d.precio)}
      ${tdNum(d.dias)}
      ${tdPct(d.tna, true)}
      ${tdPct(d.tea)}
      ${tdPct(d.tem)}
      ${tdDate(d.vencimiento)}
    </tr>`).join('');

  } else if (_ltView === 'TEM') {
    headers = `<tr>
      <th style="text-align:left">TICKER</th>
      <th>PRECIO</th><th>DÍAS</th>
      <th class="ltr-th-hl">TEM</th>
      <th>TNA</th><th>MEP BE</th><th>VENC.</th>
    </tr>`;
    rows = sorted.map(d => `<tr class="bt2-row">
      <td class="bt2-td-ticker ltr-tk">${d.ticker}</td>
      ${tdPrecio(d.precio)}
      ${tdNum(d.dias)}
      ${tdPct(d.tem, true)}
      ${tdPct(d.tna)}
      ${tdARS(d.mep_be)}
      ${tdDate(d.vencimiento)}
    </tr>`).join('');

  } else { // Carry-Trade
    headers = `<tr>
      <th style="text-align:left">TICKER</th>
      <th>PRECIO</th><th>DÍAS</th>
      <th>TNA</th>
      <th class="ltr-th-hl">MEP BE</th>
      <th>BANDA ↑</th><th>BANDA ↓</th>
    </tr>`;
    rows = sorted.map(d => `<tr class="bt2-row">
      <td class="bt2-td-ticker ltr-tk">${d.ticker}</td>
      ${tdPrecio(d.precio)}
      ${tdNum(d.dias)}
      ${tdPct(d.tna)}
      ${tdARS(d.mep_be)}
      ${tdARS(d.banda_sup)}
      ${tdARS(d.banda_inf)}
    </tr>`).join('');
  }

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

function _ltrCurvaChart() {
  const el = document.getElementById('ltr-chart');
  if (!el) return;

  const yKey    = _ltView === 'TNA' ? 'tna' : 'tem';
  const yLabel  = _ltView === 'TNA' ? 'TNA (%)' : 'TEM (%)';
  const valid   = _ltData.filter(d => d[yKey] != null).sort((a, b) => a.dias - b.dias);
  const mono    = "'JetBrains Mono',monospace";

  if (!valid.length) {
    dcfCharts.disposeChart('ltr-chart');
    el.style.height = '';
    el.innerHTML = `<p style="padding:20px;font-family:${mono};color:var(--text-muted);font-size:.78rem;text-align:center">Sin datos disponibles para graficar</p>`;
    return;
  }

  const existing = echarts.getInstanceByDom(el);
  if (existing) existing.dispose();
  el.style.height = '430px';
  const chart = echarts.init(el, 'dcf');

  const trend = _ltrLogReg(valid.map(d => [d.dias, d[yKey]]));

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
        const fp = (v, dec=2) => v != null ? v.toFixed(dec).replace('.', ',') + '%' : '—';
        const row = (l, v) =>
          `<div style="display:flex;justify-content:space-between;gap:16px;margin-top:2px">` +
          `<span style="color:#7a8fa6">${l}</span><span>${v}</span></div>`;
        let h = `<div style="font-family:${mono};font-size:11.5px;min-width:170px">`;
        h += `<div style="font-size:13px;font-weight:700;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.08)">${d.ticker}</div>`;
        h += row('Precio',  d.precio != null ? `$${d.precio.toFixed(2).replace('.', ',')}` : '—');
        h += row('Días',    d.dias ?? '—');
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
    grid: { left: 8, right: 8, top: 20, bottom: 32, containLabel: true },
    xAxis: {
      type: 'value', name: 'Días al vencimiento',
      nameLocation: 'middle', nameGap: 28,
      nameTextStyle: { color: '#64748b', fontFamily: mono, fontSize: 10 },
      axisLabel:  { color: '#64748b', fontFamily: mono, fontSize: 10 },
      axisLine:   { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitLine:  { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } },
    },
    yAxis: {
      type: 'value', name: yLabel,
      nameLocation: 'middle', nameGap: 44,
      nameTextStyle: { color: '#64748b', fontFamily: mono, fontSize: 10 },
      axisLabel:  { color: '#64748b', fontFamily: mono, fontSize: 10, formatter: v => `${v?.toFixed(1)}%` },
      axisLine:   { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitLine:  { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } },
    },
    series: [
      {
        type: 'scatter',
        name: _ltView,
        data: valid.map(d => [d.dias, d[yKey]]),
        symbolSize: 10,
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
        lineStyle: { color: '#f97316', type: 'dashed', width: 1.5, opacity: 0.5 },
        tooltip: { show: false }, silent: true,
      }] : []),
    ],
    legend: { show: false },
  });

  new ResizeObserver(() => chart.resize()).observe(el);
}

function _ltrCarryChart() {
  const el = document.getElementById('ltr-chart');
  if (!el) return;

  const valid = _ltData.filter(d => d.mep_be != null).sort((a, b) => a.dias - b.dias);
  const mono  = "'JetBrains Mono',monospace";

  if (!valid.length) {
    dcfCharts.disposeChart('ltr-chart');
    el.style.height = '';
    el.innerHTML = `<p style="padding:20px;font-family:${mono};color:var(--text-muted);font-size:.78rem;text-align:center">Sin datos de Carry-Trade disponibles</p>`;
    return;
  }

  const existing = echarts.getInstanceByDom(el);
  if (existing) existing.dispose();
  el.style.height = '430px';
  const chart = echarts.init(el, 'dcf');

  const fmtARS = v => `$${Math.round(v).toLocaleString('es-AR')}`;

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
        const row = (l, v) =>
          `<div style="display:flex;justify-content:space-between;gap:16px;margin-top:2px">` +
          `<span style="color:#7a8fa6">${l}</span><span>${v}</span></div>`;
        let h = `<div style="font-family:${mono};font-size:11.5px;min-width:180px">`;
        h += `<div style="font-size:13px;font-weight:700;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.08)">${d.ticker}</div>`;
        h += row('Días', d.dias);
        h += row('MEP BE', fmtARS(d.mep_be));
        if (_ltMep) {
          const diff = d.mep_be - _ltMep;
          const pct  = ((d.mep_be / _ltMep) - 1) * 100;
          const col  = diff >= 0 ? '#22c55e' : '#ef4444';
          h += `<div style="display:flex;justify-content:space-between;gap:16px;margin-top:2px"><span style="color:#7a8fa6">vs MEP actual</span><span style="color:${col}">${diff >= 0 ? '+' : ''}${fmtARS(diff)} (${pct.toFixed(1).replace('.', ',')}%)</span></div>`;
        }
        h += row('Banda ↑', d.banda_sup != null ? fmtARS(d.banda_sup) : '—');
        h += row('Banda ↓', d.banda_inf != null ? fmtARS(d.banda_inf) : '—');
        return h + '</div>';
      },
    },
    grid: { left: 8, right: 8, top: 36, bottom: 32, containLabel: true },
    xAxis: {
      type: 'value', name: 'Días al vencimiento',
      nameLocation: 'middle', nameGap: 28,
      nameTextStyle: { color: '#64748b', fontFamily: mono, fontSize: 10 },
      axisLabel:  { color: '#64748b', fontFamily: mono, fontSize: 10 },
      axisLine:   { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitLine:  { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } },
    },
    yAxis: {
      type: 'value', name: 'MEP (ARS)',
      nameLocation: 'middle', nameGap: 58,
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
      // MEP Breakeven scatter + current MEP markLine
      {
        type: 'scatter',
        name: 'MEP BE',
        data: valid.map(d => [d.dias, d.mep_be]),
        symbolSize: 10,
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
            lineStyle: { color: '#4DA3FF', type: 'solid', width: 1.5, opacity: 0.8 },
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
        lineStyle: { color: '#22c55e', type: 'dashed', width: 1.2, opacity: 0.65 },
        tooltip: { show: false }, silent: true,
      },
      // Banda inferior
      {
        type: 'line', name: 'Banda ↓',
        data: valid.filter(d => d.banda_inf != null).map(d => [d.dias, d.banda_inf]),
        showSymbol: false,
        lineStyle: { color: '#ef4444', type: 'dashed', width: 1.2, opacity: 0.65 },
        tooltip: { show: false }, silent: true,
      },
    ],
  });

  new ResizeObserver(() => chart.resize()).observe(el);
}

// ── Regresión logarítmica y = a·ln(x) + b ─────────────────────────────────
function _ltrLogReg(points) {
  const valid = points.filter(p => p[0] > 0 && p[1] != null);
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
    return [x, a * Math.log(x) + b];
  });
}

// ── Skeleton loader ─────────────────────────────────────────────────────────
function _ltrSkeleton(n) {
  return Array.from({ length: n }, () =>
    `<div class="skeleton skeleton-table-row" style="margin:2px 12px"></div>`
  ).join('');
}
