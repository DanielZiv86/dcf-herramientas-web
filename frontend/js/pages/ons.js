/* ─── ONs — Obligaciones Negociables — BondTerminal v2 ──────────────────── */

let _onsPageData = [];

(window.pages = window.pages || {}).ons = async function(container) {
  container.innerHTML = `
    <div class="bt2-page">

      <!-- ── Header: título + subtítulo (SIN kpis aquí) ──────────────────── -->
      <div class="bt2-header" style="flex-direction:column;align-items:flex-start;gap:2px;margin-bottom:12px">
        <h1 class="bt2-title" style="font-size:1.25rem;letter-spacing:-.02em">
          ONs — Obligaciones Negociables
        </h1>
        <p style="font-family:var(--font-mono);font-size:.72rem;color:var(--bt2-sub);margin:0">
          Análisis de TIR USD · Duration · Vencimientos · Liquidez
        </p>
      </div>

      <!-- ── KPI row: debajo del header, ancho completo ───────────────────── -->
      <div id="ons-kpis" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        ${_onsSkeleton(1, true)}
      </div>

      <!-- ── Filtros: una fila compacta ────────────────────────────────────── -->
      <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px">
        <div>
          <div class="ons-filter-lbl">Legislación</div>
          <select class="dcf-select" id="ons-filter-leg" style="width:120px">
            <option value="">Todas</option>
            <option value="NY">Ley NY</option>
            <option value="AR">Ley AR</option>
          </select>
        </div>
        <div>
          <div class="ons-filter-lbl">Buscar</div>
          <input class="dcf-input" id="ons-search" placeholder="Ticker…" style="width:130px" />
        </div>
        <div>
          <div class="ons-filter-lbl">TIR mín. (%)</div>
          <input class="dcf-input" id="ons-tir-min" type="number" placeholder="ej: 4"
                 style="width:90px" step="0.5" />
        </div>
        <div>
          <div class="ons-filter-lbl">Ordenar por</div>
          <select class="dcf-select" id="ons-sort" style="width:130px">
            <option value="ytm_desc">TIR ↓</option>
            <option value="ytm_asc">TIR ↑</option>
            <option value="duration">Duration</option>
            <option value="maturity">Vencimiento</option>
            <option value="price">Precio USD</option>
          </select>
        </div>
      </div>

      <!-- ── Grid principal: tabla 40% | gráfico 60% ──────────────────────── -->
      <div class="ltr-grid">

        <!-- Tabla ONs -->
        <div class="bt2-panel">
          <div class="bt2-panel-hdr">
            <span class="bt2-panel-title">YTM POR EMISIÓN</span>
            <span class="bt2-panel-sub" id="ons-count"></span>
          </div>
          <div class="bt2-snapshot-scroll" id="ons-tabla-wrap">
            ${_onsSkeleton(10)}
          </div>
        </div>

        <!-- Gráfico TIR vs Duration -->
        <div class="bt2-panel ltr-chart-panel">
          <div class="bt2-panel-hdr">
            <span class="bt2-panel-title" id="ons-chart-title">TIR vs DURATION</span>
            <div id="ons-chart-pills"></div>
          </div>
          <div id="ons-chart" style="flex:1;min-height:430px"></div>
        </div>

      </div><!-- /ltr-grid -->

      <!-- ── Nota fuente ────────────────────────────────────────────────────── -->
      <div class="cer-note-strip" style="margin-top:10px">
        <span style="color:#94a3b8">ℹ</span>
        TIR calculada en USD · convención 30/360 · precio ARS / MEP.
        Precios: data912.com · fallback IOL. Cashflows: BD ONs.xlsx.
      </div>

    </div>`;

  // Pills de charts
  const chartLabels = ['TIR vs Duration', 'TIR vs Venc.', 'Ranking TIR'];
  let _chartView = 'TIR vs Duration';
  const pillsEl = document.getElementById('ons-chart-pills');
  if (pillsEl) {
    pillsEl.appendChild(ui.pills(chartLabels, 0, (_, lbl) => {
      _chartView = lbl;
      document.getElementById('ons-chart-title').textContent = lbl.toUpperCase();
      _onsRenderChart(_onsPageData);
    }, 'pills-sm'));
  }

  // Cargar datos
  try {
    const data = await api.ons.tabla();
    _onsPageData = Array.isArray(data) ? data : (data?.items || []);
    _onsRenderKPIs(_onsPageData);
    _onsRenderTable(_onsPageData);
    _onsRenderChart(_onsPageData);
  } catch (e) {
    console.error('[ONs] Error cargando /api/ons/tabla:', e);
    try {
      const ping = await api.ons.ping();
      console.info('[ONs] Ping:', ping);
      _onsShowErrorWithDiag(e, ping);
    } catch (pingErr) {
      console.error('[ONs] Ping también falló:', pingErr);
      _onsShowError(e);
    }
  }

  // Wiring filtros
  ['ons-filter-leg', 'ons-sort'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', () => {
      _onsRenderTable(_onsPageData);
      _onsRenderChart(_onsPageData);
    })
  );
  ['ons-search', 'ons-tir-min'].forEach(id =>
    document.getElementById(id)?.addEventListener('input', () => {
      _onsRenderTable(_onsPageData);
      _onsRenderChart(_onsPageData);
    })
  );

  // Referencia al getter de vista para el chart
  window._onsGetChartView = () => _chartView;
};

// ── Filtrado + ordenamiento ────────────────────────────────────────────────
function _onsFilter(data) {
  const leg    = document.getElementById('ons-filter-leg')?.value || '';
  const search = (document.getElementById('ons-search')?.value || '').toUpperCase().trim();
  const tirMin = parseFloat(document.getElementById('ons-tir-min')?.value || '');
  const sortBy = document.getElementById('ons-sort')?.value || 'ytm_desc';

  let filtered = (data || []).filter(d => {
    if (d.status !== 'OK') return false;
    if (leg    && d.legislacion !== leg)        return false;
    if (search && !d.ticker?.includes(search))  return false;
    if (!isNaN(tirMin) && (d.ytm == null || d.ytm < tirMin)) return false;
    return true;
  });

  filtered.sort((a, b) => {
    if (sortBy === 'ytm_desc') return (b.ytm ?? -999) - (a.ytm ?? -999);
    if (sortBy === 'ytm_asc')  return (a.ytm ?? 999)  - (b.ytm ?? 999);
    if (sortBy === 'duration') return (a.duration ?? 999) - (b.duration ?? 999);
    if (sortBy === 'maturity') return (a.maturity ?? '').localeCompare(b.maturity ?? '');
    if (sortBy === 'price')    return (b.price_usd ?? -999) - (a.price_usd ?? -999);
    return 0;
  });
  return filtered;
}

// ── KPIs ───────────────────────────────────────────────────────────────────
function _onsRenderKPIs(data) {
  const el = document.getElementById('ons-kpis');
  if (!el) return;

  const ok   = (data || []).filter(d => d.status === 'OK');
  if (!ok.length) { el.innerHTML = ''; return; }

  const tirs = ok.map(d => d.ytm).filter(v => v != null);
  const durs = ok.map(d => d.duration).filter(v => v != null);
  const avg  = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

  const best = ok.reduce((b, d) => (!b || (d.ytm ?? -999) > (b.ytm ?? -999)) ? d : b, null);
  const mep  = ok[0]?.mep;
  const now  = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  const fT  = v => v != null ? (v >= 0 ? '+' : '') + v.toFixed(2).replace('.', ',') + '%' : '—';
  const fD  = v => v != null ? v.toFixed(2).replace('.', ',') + ' a' : '—';
  const fM  = v => v != null ? '$ ' + Number(v).toLocaleString('es-AR', { minimumFractionDigits: 0 }) : '—';

  const tirProm = avg(tirs);
  const durProm = avg(durs);

  // Cards con ancho uniforme y tamaño generoso
  const kpi = (label, val, cls = '', sub = '') => `
    <div class="bt2-kpi-card" style="flex:1;min-width:120px;max-width:200px">
      <div class="bt2-kpi-label">${label}</div>
      <div class="bt2-kpi-value ${cls}" style="font-size:1.05rem">${val}</div>
      ${sub ? `<div class="bt2-kpi-sub">${sub}</div>` : ''}
    </div>`;

  el.innerHTML = [
    kpi('ONs ACTIVAS',   ok.length + '',   '', 'CON TIR'),
    kpi('TIR PROMEDIO',  fT(tirProm),      tirProm != null && tirProm >= 5 ? 'bt2-pos' : ''),
    best ? kpi('MAYOR TIR',   fT(best.ytm),   'bt2-pos', best.ticker) : '',
    kpi('DUR. PROMEDIO', fD(durProm),      '', 'AÑOS'),
    mep  ? kpi('MEP',        fM(mep),          'bt2-sub', 'AL30D') : '',
    kpi('ACTUALIZADO',   now,              'bt2-sub', 'ART'),
  ].filter(Boolean).join('');
}

// ── Tabla ──────────────────────────────────────────────────────────────────
function _onsRenderTable(data) {
  const wrap    = document.getElementById('ons-tabla-wrap');
  const countEl = document.getElementById('ons-count');
  if (!wrap) return;

  const filtered = _onsFilter(data);

  if (!filtered.length) {
    wrap.innerHTML = `<div style="padding:20px 12px">
      <p style="font-family:var(--font-mono);color:var(--text-muted);font-size:.75rem">
        Sin ONs para los filtros seleccionados.
      </p></div>`;
    if (countEl) countEl.textContent = '';
    return;
  }
  if (countEl) countEl.textContent = filtered.length + ' instrumentos';

  // Formateadores
  const fPct  = (v, sign = false) =>
    v == null ? '—' : (sign && v > 0 ? '+' : '') + v.toFixed(2).replace('.', ',') + '%';
  const fUSD  = v =>
    v == null ? '—' : '$ ' + Number(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fARS  = v =>
    v == null ? '—' : '$ ' + Number(v).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fDur  = v => v == null ? '—' : v.toFixed(2).replace('.', ',');
  const fDate = s => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
  const fDias = v => v == null ? '—' : String(v);

  // Colores
  const tirStyle = v =>
    v == null ? '' :
    v >= 9    ? 'color:#22c55e;font-weight:700' :
    v >= 5    ? 'color:#84cc16;font-weight:700' :
    v >= 2    ? 'color:#f97316;font-weight:700' :
    v < 0     ? 'color:#ef4444;font-weight:700' :
                'color:#94a3b8;font-weight:700';
  const varCls = v => v == null ? 'bt2-sub' : v > 0.01 ? 'bt2-pos' : v < -0.01 ? 'bt2-neg' : 'bt2-sub';

  const legBadge = l => l === 'NY'
    ? '<span class="ons-badge-ny">NY</span>'
    : '<span class="ons-badge-ar">AR</span>';

  // Tabla compacta: 8 columnas clave
  const headers = `<tr>
    <th style="text-align:left;white-space:nowrap">TICKER</th>
    <th style="white-space:nowrap">VENC.</th>
    <th style="white-space:nowrap">DÍAS</th>
    <th style="white-space:nowrap">P. USD</th>
    <th class="ltr-th-hl" style="white-space:nowrap">TIR USD</th>
    <th style="white-space:nowrap">DUR.</th>
    <th style="white-space:nowrap">CUPÓN</th>
    <th style="white-space:nowrap">LEY</th>
  </tr>`;

  const rows = filtered.map(d => `
    <tr class="bt2-row">
      <td class="bt2-td-ticker"
          style="color:var(--bt2-accent);font-weight:700;cursor:pointer"
          onclick="_openOnsDetail('${d.ticker}')"
          title="Ver detalle de ${d.ticker}">${d.ticker}</td>
      <td class="bt2-td-num cer-venc">${fDate(d.maturity)}</td>
      <td class="bt2-td-num" style="color:#64748b">${fDias(d.dias_vencimiento)}</td>
      <td class="bt2-td-num">${fUSD(d.price_usd)}</td>
      <td class="bt2-td-num" style="${tirStyle(d.ytm)}">${fPct(d.ytm)}</td>
      <td class="bt2-td-num bt2-sub">${fDur(d.duration)}</td>
      <td class="bt2-td-num bt2-sub">${fPct(d.cupon)}</td>
      <td class="bt2-td-num">${legBadge(d.legislacion)}</td>
    </tr>`).join('');

  wrap.innerHTML = `<table class="bt2-table"><thead>${headers}</thead><tbody>${rows}</tbody></table>`;
}

// ── Gráficos ───────────────────────────────────────────────────────────────
function _onsRenderChart(data) {
  const chartView = (window._onsGetChartView && window._onsGetChartView()) || 'TIR vs Duration';
  const filtered  = _onsFilter(data);
  const el        = document.getElementById('ons-chart');
  if (!el) return;

  if (chartView === 'Ranking TIR') {
    _onsChartRanking(filtered, el);
  } else if (chartView === 'TIR vs Venc.') {
    _onsChartVencimiento(filtered, el);
  } else {
    _onsChartDuration(filtered, el);
  }
}

function _onsChartDuration(data, el) {
  const valid = data.filter(d => d.ytm != null && d.duration != null && d.duration > 0);
  if (!valid.length) { _onsChartEmpty(el); return; }

  const xVals = valid.map(d => d.duration);
  const yVals = valid.map(d => d.ytm);
  const xPad  = Math.max((Math.max(...xVals) - Math.min(...xVals)) * 0.12, 0.3);
  const yPad  = Math.max((Math.max(...yVals) - Math.min(...yVals)) * 0.18, 1.0);
  const mono  = "'JetBrains Mono',monospace";

  const existing = echarts.getInstanceByDom(el);
  if (existing) existing.dispose();
  el.style.height = '';
  const chart = echarts.init(el, 'dcf');

  const trend = valid.length >= 3 ? _quadReg(valid.map(d => [d.duration, d.ytm])) : null;

  chart.setOption({
    tooltip: {
      trigger: 'item',
      backgroundColor: '#0d1424',
      borderColor: 'rgba(255,255,255,0.12)',
      borderWidth: 1,
      padding: [10, 14],
      formatter: p => {
        if (p.seriesType === 'line') return '';
        const d = valid[p.dataIndex];
        if (!d) return '';
        const row = (l, v) => `<div style="display:flex;justify-content:space-between;gap:14px;margin-top:2px"><span style="color:#7a8fa6">${l}</span><span>${v}</span></div>`;
        const fP = v => v != null ? '$ ' + Number(v).toLocaleString('es-AR',{minimumFractionDigits:2}) : '—';
        const fD = s => s ? s.split('-').reverse().join('/') : '—';
        let h = `<div style="font-family:${mono};font-size:11.5px;min-width:180px">`;
        h += `<div style="font-size:13px;font-weight:700;margin-bottom:6px;color:var(--bt2-accent)">${d.ticker}</div>`;
        h += row('TIR USD',   `<span style="color:${d.ytm >= 5 ? '#22c55e' : '#f97316'}">${d.ytm != null ? d.ytm.toFixed(2).replace('.', ',') + '%' : '—'}</span>`);
        h += row('Duration',  d.duration != null ? d.duration.toFixed(2).replace('.', ',') + ' a' : '—');
        h += row('Mod. Dur.', d.modified_duration != null ? d.modified_duration.toFixed(2).replace('.', ',') : '—');
        h += row('P. USD',    fP(d.price_usd));
        h += row('Cupón',     d.cupon != null ? d.cupon.toFixed(2).replace('.', ',') + '%' : '—');
        h += row('Venc.',     fD(d.maturity));
        h += row('Ley',       d.legislacion || '—');
        return h + '</div>';
      },
    },
    grid: { left: 10, right: 14, top: 22, bottom: 38, containLabel: true },
    xAxis: {
      type: 'value', name: 'Duration (años)', nameLocation: 'middle', nameGap: 26,
      min: Math.max(0, +(Math.min(...xVals) - xPad).toFixed(2)),
      max: +(Math.max(...xVals) + xPad).toFixed(2),
      nameTextStyle: { color: '#64748b', fontFamily: mono, fontSize: 10 },
      axisLabel:  { color: '#64748b', fontFamily: mono, fontSize: 10 },
      axisLine:   { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitLine:  { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } },
    },
    yAxis: {
      type: 'value', name: 'TIR USD (%)', nameLocation: 'end', nameGap: 6,
      min: +(Math.min(...yVals) - yPad).toFixed(1),
      max: +(Math.max(...yVals) + yPad).toFixed(1),
      nameTextStyle: { color: '#64748b', fontFamily: mono, fontSize: 10, align: 'left' },
      axisLabel: {
        color: '#64748b', fontFamily: mono, fontSize: 10,
        formatter: v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%',
      },
      axisLine:  { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } },
    },
    series: [
      {
        type: 'scatter',
        data: valid.map(d => [d.duration, d.ytm]),
        symbolSize: 11,
        clip: false,
        itemStyle: {
          color: 'transparent',
          borderColor: p => valid[p.dataIndex]?.legislacion === 'NY' ? '#9ecae1' : '#f28e2b',
          borderWidth: 2,
        },
        label: {
          show: true, fontFamily: mono, fontSize: 9, fontWeight: 700,
          color: p => valid[p.dataIndex]?.legislacion === 'NY' ? '#9ecae1' : '#f28e2b',
          textBorderColor: 'rgba(8,17,28,0.9)', textBorderWidth: 2,
          formatter: p => valid[p.dataIndex]?.ticker || '',
          position: 'top', distance: 6,
        },
      },
      ...(trend ? [{
        type: 'line', data: trend, showSymbol: false, clip: true,
        lineStyle: { color: '#f97316', type: 'dashed', width: 1.5, opacity: 0.45 },
        tooltip: { show: false }, silent: true,
      }] : []),
    ],
    legend: { show: false },
  });

  new ResizeObserver(() => chart.resize()).observe(el);
}

function _onsChartVencimiento(data, el) {
  const valid = data.filter(d => d.ytm != null && d.maturity);
  if (!valid.length) { _onsChartEmpty(el); return; }

  const existing = echarts.getInstanceByDom(el);
  if (existing) existing.dispose();
  el.style.height = '';
  const chart = echarts.init(el, 'dcf');
  const mono  = "'JetBrains Mono',monospace";

  const dates  = valid.map(d => d.maturity);
  const yVals  = valid.map(d => d.ytm);
  const yPad   = Math.max((Math.max(...yVals) - Math.min(...yVals)) * 0.18, 1.0);

  chart.setOption({
    tooltip: {
      trigger: 'item',
      backgroundColor: '#0d1424', borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, padding: [8, 12],
      formatter: p => {
        const d = valid[p.dataIndex]; if (!d) return '';
        return `<div style="font-family:${mono};font-size:11.5px">
          <b style="color:var(--bt2-accent)">${d.ticker}</b><br>
          TIR: <b>${d.ytm != null ? d.ytm.toFixed(2).replace('.',',')+'%' : '—'}</b><br>
          Venc.: ${d.maturity?.split('-').reverse().join('/')}<br>
          Ley: ${d.legislacion || '—'}
        </div>`;
      },
    },
    grid: { left: 10, right: 14, top: 22, bottom: 38, containLabel: true },
    xAxis: {
      type: 'category', data: dates, boundaryGap: true,
      axisLabel: {
        color: '#64748b', fontFamily: mono, fontSize: 9, rotate: 30,
        formatter: v => v ? v.split('-').reverse().slice(1).join('/') : '',
      },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value', name: 'TIR USD (%)', nameLocation: 'end', nameGap: 6,
      min: +(Math.min(...yVals) - yPad).toFixed(1),
      max: +(Math.max(...yVals) + yPad).toFixed(1),
      nameTextStyle: { color: '#64748b', fontFamily: mono, fontSize: 10, align: 'left' },
      axisLabel: { color: '#64748b', fontFamily: mono, fontSize: 10, formatter: v => v.toFixed(1) + '%' },
      axisLine:  { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } },
    },
    series: [{
      type: 'scatter',
      data: valid.map((d, i) => ({ value: [i, d.ytm], name: d.ticker })),
      symbolSize: 10, clip: false,
      itemStyle: { color: p => valid[p.dataIndex]?.legislacion === 'NY' ? '#9ecae1' : '#f28e2b', opacity: 0.85 },
      label: {
        show: true, fontFamily: mono, fontSize: 9, fontWeight: 700,
        color: p => valid[p.dataIndex]?.legislacion === 'NY' ? '#9ecae1' : '#f28e2b',
        textBorderColor: 'rgba(8,17,28,0.9)', textBorderWidth: 2,
        formatter: p => valid[p.dataIndex]?.ticker || '',
        position: 'top', distance: 5,
      },
    }],
    legend: { show: false },
  });
  new ResizeObserver(() => chart.resize()).observe(el);
}

function _onsChartRanking(data, el) {
  const top = data.filter(d => d.ytm != null).sort((a, b) => b.ytm - a.ytm).slice(0, 15);
  if (!top.length) { _onsChartEmpty(el); return; }

  const existing = echarts.getInstanceByDom(el);
  if (existing) existing.dispose();
  el.style.height = '';
  const chart = echarts.init(el, 'dcf');
  const mono  = "'JetBrains Mono',monospace";

  const sorted = [...top].sort((a, b) => a.ytm - b.ytm);
  const colors = sorted.map(d => d.ytm >= 9 ? '#22c55e' : d.ytm >= 5 ? '#84cc16' : d.ytm >= 2 ? '#f97316' : '#ef4444');

  chart.setOption({
    tooltip: {
      trigger: 'item', backgroundColor: '#0d1424', borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, padding: [8, 12],
      formatter: p => `<div style="font-family:${mono};font-size:11.5px"><b style="color:var(--bt2-accent)">${p.name}</b><br>TIR: <b>${p.value.toFixed(2).replace('.',',')}%</b></div>`,
    },
    grid: { left: 10, right: 50, top: 10, bottom: 10, containLabel: true },
    xAxis: {
      type: 'value',
      axisLabel: { color: '#64748b', fontFamily: mono, fontSize: 10, formatter: v => v.toFixed(1) + '%' },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } },
    },
    yAxis: {
      type: 'category', data: sorted.map(d => d.ticker),
      axisLabel: { color: '#94a3b8', fontFamily: mono, fontSize: 10, fontWeight: 700 },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitLine: { show: false },
    },
    series: [{
      type: 'bar',
      data: sorted.map((d, i) => ({ value: d.ytm, itemStyle: { color: colors[i] } })),
      name: sorted.map(d => d.ticker),
      barMaxWidth: 18,
      label: { show: true, position: 'right', color: '#64748b', fontFamily: mono, fontSize: 9, formatter: p => p.value.toFixed(2).replace('.', ',') + '%' },
    }],
    legend: { show: false },
  });
  new ResizeObserver(() => chart.resize()).observe(el);
}

function _onsChartEmpty(el) {
  const ex = echarts.getInstanceByDom(el);
  if (ex) ex.dispose();
  el.innerHTML = `<p style="padding:20px;font-family:var(--font-mono);color:var(--text-muted);font-size:.78rem;text-align:center">Sin datos para graficar</p>`;
}

// ── Modal de detalle por ticker ────────────────────────────────────────────
function _openOnsDetail(ticker) {
  const d = _onsPageData.find(x => x.ticker === ticker);
  if (!d) return;
  const old = document.getElementById('ons-detail-overlay');
  if (old) old.remove();

  const fT  = v => v != null ? (v >= 0 ? '+' : '') + v.toFixed(2).replace('.', ',') + '%' : 'N/D';
  const fU  = v => v != null ? '$ ' + Number(v).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}) : 'N/D';
  const fA  = v => v != null ? '$ ' + Number(v).toLocaleString('es-AR',{minimumFractionDigits:0}) : 'N/D';
  const fDu = v => v != null ? v.toFixed(2).replace('.', ',') : 'N/D';
  const fDa = s => s ? s.split('-').reverse().join('/') : 'N/D';

  const tirColor = d.ytm == null ? '' : d.ytm >= 5 ? 'color:#22c55e' : d.ytm < 0 ? 'color:#ef4444' : 'color:#f97316';
  const legBadge = d.legislacion === 'NY'
    ? '<span class="ons-badge-ny" style="font-size:12px;padding:2px 8px">Ley New York</span>'
    : '<span class="ons-badge-ar" style="font-size:12px;padding:2px 8px">Ley Argentina</span>';
  const mi = (l, v, s = '') =>
    `<div class="bcc-meta-item"><span class="bcc-meta-label">${l}</span><span class="bcc-meta-val" style="${s}">${v}</span></div>`;

  const nivelTIR = d.ytm == null ? '' : d.ytm >= 9 ? 'alta' : d.ytm >= 5 ? 'moderada' : d.ytm >= 2 ? 'baja' : 'muy baja';
  const sensDur  = d.duration == null ? '' : d.duration < 1 ? 'baja sensibilidad' : d.duration < 2.5 ? 'sensibilidad moderada' : 'sensibilidad alta';

  const el = document.createElement('div');
  el.id = 'ons-detail-overlay';
  el.className = 'bcc-overlay';
  el.innerHTML = `
    <div class="bcc-modal" style="max-width:540px">
      <div class="bcc-header">
        <div>
          <span class="bcc-title" style="color:var(--bt2-accent)">${d.ticker}</span>
          <span style="margin-left:8px">${legBadge}</span>
        </div>
        <button class="bcc-close" onclick="document.getElementById('ons-detail-overlay').remove()">✕</button>
      </div>
      <div class="bcc-body">
        <div class="bcc-meta">
          ${mi('P. USD',        fU(d.price_usd),     '')}
          ${mi('P. ARS',        fA(d.price_ars),     'color:#64748b')}
          ${mi('MEP',           '$ '+(d.mep?.toLocaleString('es-AR',{minimumFractionDigits:0}) || '—'), 'color:#64748b')}
          ${mi('TIR USD',       fT(d.ytm),           tirColor+';font-weight:700')}
          ${mi('Duration',      fDu(d.duration)+' años', '')}
          ${mi('Mod. Duration', fDu(d.modified_duration), '')}
          ${mi('Cupón',         fT(d.cupon),         '')}
          ${mi('Vencimiento',   fDa(d.maturity),     '')}
          ${mi('Días al venc.', d.dias_vencimiento != null ? String(d.dias_vencimiento) : 'N/D', '')}
          ${mi('Próx. cupón',   fDa(d.next_coupon),  'color:#64748b')}
          ${d.pct_change != null ? mi('% Día', fT(d.pct_change), d.pct_change >= 0 ? 'color:#22c55e' : 'color:#ef4444') : ''}
        </div>
        <div class="bcc-card">
          <div class="bcc-card-title">INTERPRETACIÓN</div>
          <div class="bcc-card-body">
            <p class="bcc-note" style="line-height:1.8">
              La ON <b>${d.ticker}</b> presenta TIR en USD de
              <span style="${tirColor};font-weight:700">${fT(d.ytm)}</span>
              ${d.ytm != null ? '(nivel '+nivelTIR+')' : ''}.
              ${d.duration != null ? 'Duration ' + fDu(d.duration) + ' años → ' + sensDur + ' a variaciones de tasa.' : ''}
              ${d.next_coupon ? ' Próximo flujo: <b>'+fDa(d.next_coupon)+'</b>.' : ''}
              ${d.dias_vencimiento != null && d.dias_vencimiento <= 90 ? '<br><span style="color:#fbbf24">⚠ Vencimiento en '+d.dias_vencimiento+' días.</span>' : ''}
            </p>
            <p class="bcc-note" style="margin-top:8px;color:var(--bt2-sub);font-size:.6rem">
              TIR calculada en USD · precio ARS / MEP
              ${d.mep != null ? '($'+d.mep.toLocaleString('es-AR',{minimumFractionDigits:0})+')' : ''}.
              Convención 30/360 · Fuente: BD ONs.xlsx + data912.
            </p>
          </div>
        </div>
      </div>
    </div>`;

  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });
  const esc = e => { if (e.key === 'Escape') { el.remove(); document.removeEventListener('keydown', esc); } };
  document.addEventListener('keydown', esc);
}

// ── Errores ────────────────────────────────────────────────────────────────
function _onsShowError(e, diagDetail = '') {
  const wrap = document.getElementById('ons-tabla-wrap');
  if (!wrap) return;

  let msg = 'No se pudo cargar la información de Obligaciones Negociables.';
  let det = diagDetail;

  if (e?.message) {
    if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
      msg = 'No se pudo conectar al servidor.';
      if (!det) det = 'Verificá que el backend en Render no esté en cold start.';
    } else if (e.message.includes('500')) {
      msg = 'El servidor respondió con un error interno (500).';
      det = det || e.message;
    } else if (e.message.includes('404')) {
      msg = 'Endpoint /api/ons/tabla no encontrado en el backend.';
      det = det || e.message;
    } else {
      det = det || e.message;
    }
  }

  wrap.innerHTML = `
    <div style="padding:18px 14px">
      <div style="font-family:var(--font-mono);color:var(--negative);font-size:.8rem;font-weight:700;margin-bottom:6px">✕ ${msg}</div>
      ${det ? `<div style="font-family:var(--font-mono);color:var(--text-muted);font-size:.7rem;background:#0a1020;border-radius:4px;padding:8px 10px;margin-top:4px;word-break:break-word">${det}</div>` : ''}
      <div style="font-family:var(--font-mono);color:var(--text-muted);font-size:.65rem;margin-top:10px">
        Diagnóstico: <code style="color:#94a3b8">api.ons.ping().then(r=>console.log(r))</code>
      </div>
    </div>`;
}

function _onsShowErrorWithDiag(e, ping) {
  let det = '';
  if (ping?.status === 'bd_error') {
    det = 'Error en BD ONs: ' + (ping.errors?.join(', ') || '');
  } else if (ping?.status === 'ok' || ping?.status === 'partial') {
    const bd  = ping.bd ? 'BD: ' + ping.bd.tickers + ' tickers' : 'BD: ?';
    const mep = ping.mep ? 'MEP: $' + ping.mep : 'MEP: no disponible';
    det = bd + ' | ' + mep + '. Ping OK pero /tabla falló. ' + (ping.errors?.join(', ') || '');
  }
  _onsShowError(e, det);
}

function _onsSkeleton(n, kpi = false) {
  if (kpi) return `<div class="skeleton" style="height:52px;border-radius:4px;flex:1;min-width:100px;max-width:180px"></div>`.repeat(6);
  return Array.from({ length: n }, () =>
    `<div class="skeleton skeleton-table-row" style="margin:2px 12px"></div>`
  ).join('');
}
