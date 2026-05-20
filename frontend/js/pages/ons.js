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

async function _openOnsDetail(ticker) {
  document.getElementById('ons-detail-overlay')?.remove();

  // Overlay con loading inmediato
  const overlay = document.createElement('div');
  overlay.id = 'ons-detail-overlay';
  overlay.className = 'bcc-overlay';
  overlay.innerHTML = `
    <div class="bcc-modal ons-detail-wide" id="ons-detail-modal">
      <div class="bcc-header" id="ons-detail-hdr">
        <div style="display:flex;align-items:center;gap:10px">
          <span class="bcc-title" style="color:var(--bt2-accent)">${ticker}</span>
          <span style="font-family:var(--font-mono);font-size:.72rem;color:var(--bt2-sub)">Cargando detalle…</span>
        </div>
        <button class="bcc-close" onclick="document.getElementById('ons-detail-overlay').remove()">✕</button>
      </div>
      <div class="bcc-body" id="ons-detail-body">
        <div style="padding:24px 16px">
          ${[80,60,90,50,70].map(w =>
            `<div class="skeleton" style="height:14px;width:${w}%;border-radius:4px;margin:8px 0"></div>`
          ).join('')}
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') overlay.remove();
  }, { once: true });

  // Fetch detalle
  try {
    const d = await api.ons.detalle(ticker);
    _onsRenderDetailModal(ticker, d);
  } catch (err) {
    console.error(`[ONs] Error detalle ${ticker}:`, err);
    const body = document.getElementById('ons-detail-body');
    if (body) {
      const msg = err?.status === 404
        ? 'No se encontró información para este ticker.'
        : err?.status === 500
          ? 'Error al calcular el detalle del instrumento.'
          : 'No se pudo cargar el detalle de ' + ticker + '.';
      body.innerHTML = `
        <div style="padding:20px 16px">
          <div style="font-family:var(--font-mono);color:var(--negative);font-size:.8rem;margin-bottom:8px">✕ ${msg}</div>
          <div style="font-family:var(--font-mono);color:var(--text-muted);font-size:.7rem">${err?.message || ''}</div>
        </div>`;
    }
  }
}

function _onsRenderDetailModal(ticker, d) {
  const overlay = document.getElementById('ons-detail-overlay');
  if (!overlay) return;

  // Helpers de formato
  const fT  = v => v != null ? (v >= 0 ? '+' : '') + Number(v).toFixed(2).replace('.', ',') + '%' : '—';
  const fU  = (v, dec=4) => v != null ? Number(v).toFixed(dec).replace('.', ',') : '—';
  const fA  = v => v != null ? '$ ' + Number(v).toLocaleString('es-AR', {minimumFractionDigits:0}) : '—';
  const fD  = s => s ? s.split('-').reverse().join('/') : '—';
  const fN  = (v, dec=2) => v != null ? Number(v).toFixed(dec).replace('.', ',') : '—';

  // Badges
  const legBadge = d.legislacion === 'NY'
    ? '<span class="ons-badge-ny" style="font-size:11px;padding:2px 7px">Ley NY</span>'
    : '<span class="ons-badge-ar" style="font-size:11px;padding:2px 7px">Ley AR</span>';
  const alerts = [];
  if (d.dias_vencimiento != null && d.dias_vencimiento <= 90)
    alerts.push('<span style="color:#fbbf24;font-family:var(--font-mono);font-size:.7rem">⚠ Venc. cercano</span>');
  if (d.ytm != null && d.ytm < 0)
    alerts.push('<span style="color:#ef4444;font-family:var(--font-mono);font-size:.7rem">TIR negativa</span>');
  if (d.status === 'NO_PRICE' || !d.price_usd_mep)
    alerts.push('<span style="color:#f97316;font-family:var(--font-mono);font-size:.7rem">Sin precio</span>');

  // Header
  const hdr = document.getElementById('ons-detail-hdr');
  if (hdr) {
    hdr.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:4px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="bcc-title" style="color:var(--bt2-accent)">${ticker}</span>
          ${legBadge}
          <span class="ons-badge-ny" style="background:#0f2a3d;color:#64748b;padding:2px 7px;font-size:10px">USD</span>
          ${alerts.join('')}
        </div>
        <span style="font-family:var(--font-mono);font-size:.65rem;color:var(--bt2-sub)">
          ${d.periodicidad || '—'} · Vence ${fD(d.maturity)}
          ${d.lamina_minima != null ? '· Lámina mín. ' + d.lamina_minima + ' VN' : ''}
          ${d.ticker_d ? '· Ticker D: <b>' + d.ticker_d + '</b>' : ''}
        </span>
      </div>
      <button class="bcc-close" onclick="document.getElementById('ons-detail-overlay').remove()">✕</button>`;
  }

  // Colores dinámicos
  const tirColor  = d.ytm == null ? '#94a3b8' : d.ytm >= 9 ? '#22c55e' : d.ytm >= 5 ? '#84cc16' : d.ytm >= 2 ? '#f97316' : d.ytm < 0 ? '#ef4444' : '#94a3b8';
  const parColor  = v => v == null ? '' : v < 0 ? 'color:#22c55e' : v > 0 ? 'color:#ef4444' : 'color:#94a3b8';

  // Micro-card de métrica
  const mi = (label, val, sub='', style='') => `
    <div class="ons-detail-mi">
      <div class="ons-detail-mi-label">${label}</div>
      <div class="ons-detail-mi-val"${style ? ' style="' + style + '"' : ''}>${val}</div>
      ${sub ? `<div class="ons-detail-mi-sub">${sub}</div>` : ''}
    </div>`;

  // Título de sección interna
  const sec = t => `<div class="ons-detail-sec">${t}</div>`;

  const metricsHtml = `
    ${sec('PRECIO Y RENDIMIENTO')}
    <div class="ons-detail-grid4">
      ${mi('TIR USD',        fT(d.ytm),           '', 'color:' + tirColor + ';font-size:1rem')}
      ${mi('P. USD (MEP)',   fU(d.price_usd_mep), 'ARS ÷ MEP')}
      ${mi('P. USD (D)',     fU(d.price_usd_d),   'Ticker ' + (d.ticker_d || 'D'))}
      ${mi('Precio ARS',     fA(d.price_ars),     '')}
    </div>
    <div class="ons-detail-grid4">
      ${mi('Duration (Mac.)',   fN(d.duration) + ' a',          '')}
      ${mi('Mod. Duration',     fN(d.modified_duration),         '')}
      ${mi('MEP',               fA(d.mep),                       'AL30D')}
      ${d.pct_change != null
          ? mi('% Día', fT(d.pct_change), '', d.pct_change >= 0 ? 'color:#22c55e' : 'color:#ef4444')
          : mi('% Día', '—')}
    </div>

    ${sec('VALOR TEÓRICO Y PARIDAD')}
    <div class="ons-detail-grid4">
      ${mi('Valor Teórico',   fU(d.valor_teorico),  'USD / 100 VN')}
      ${mi('Paridad (MEP)',   fT(d.paridad_mep),    'vs VT', parColor(d.paridad_mep))}
      ${mi('Paridad (D)',     fT(d.paridad_d),      'vs VT', parColor(d.paridad_d))}
      ${mi('Cupón corrido',   fU(d.cupon_corrido),  'USD / 100 VN')}
    </div>

    ${sec('PRÓXIMO PAGO')}
    <div class="ons-detail-grid4">
      ${mi('Fecha',        fD(d.proximo_pago),             '')}
      ${mi('Días',         d.dias_proximo_pago != null ? String(d.dias_proximo_pago) : '—', '')}
      ${mi('Interés USD',  fU(d.interes_proximo_pago),     '/ 100 VN')}
      ${mi('Amortización', fU(d.amort_proximo_pago),       '/ 100 VN')}
    </div>

    ${sec('CAPITAL E INTERÉS PENDIENTE')}
    <div class="ons-detail-grid4">
      ${mi('Capital pend.',  fU(d.capital_pendiente),  'USD / 100 VN')}
      ${mi('Interés pend.',  fU(d.interes_pendiente),  'USD / 100 VN')}
      ${mi('Periodicidad',   d.periodicidad || '—',    '')}
      ${mi('Lámina mín.',    d.lamina_minima != null ? d.lamina_minima + ' VN' : '—', '')}
    </div>`;

  // Tabla de cashflows
  const cfTable = d.cashflows && d.cashflows.length
    ? `<div style="overflow-x:auto;max-height:280px;overflow-y:auto">
        <table class="bt2-table" style="font-size:.7rem">
          <thead><tr>
            <th style="text-align:left">FECHA</th>
            <th>DÍAS</th>
            <th style="color:#9ecae1">CAPITAL</th>
            <th style="color:#f97316">INTERÉS</th>
            <th>TOTAL</th>
            <th style="color:#64748b">VAL. PRES.</th>
          </tr></thead>
          <tbody>
            ${d.cashflows.map(cf => `
              <tr class="bt2-row">
                <td class="cer-venc">${fD(cf.fecha)}</td>
                <td class="bt2-td-num bt2-sub">${cf.dias_hasta_flujo}</td>
                <td class="bt2-td-num" style="color:#9ecae1">${cf.capital_usd > 0 ? fU(cf.capital_usd) : '—'}</td>
                <td class="bt2-td-num" style="color:#f97316">${fU(cf.interes_usd)}</td>
                <td class="bt2-td-num" style="font-weight:700">${fU(cf.cashflow_total_usd)}</td>
                <td class="bt2-td-num bt2-sub">${cf.valor_presente != null ? fU(cf.valor_presente) : '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`
    : `<p style="color:var(--text-muted);font-family:var(--font-mono);font-size:.75rem;padding:10px 0">Sin cashflows futuros.</p>`;

  // Body completo
  const body = document.getElementById('ons-detail-body');
  if (!body) return;
  body.innerHTML = `
    <div class="ons-detail-metrics">${metricsHtml}</div>

    <div class="ons-detail-cf-layout">
      <div>
        <div class="ons-detail-sec">CASHFLOWS FUTUROS (USD / 100 VN)</div>
        ${cfTable}
      </div>
      <div>
        <div class="ons-detail-sec">GRÁFICO DE CASHFLOWS</div>
        <div id="ons-detail-chart" style="height:268px;width:100%"></div>
      </div>
    </div>

    <div class="bcc-card" style="margin-top:12px">
      <div class="bcc-card-title">INTERPRETACIÓN AUTOMÁTICA</div>
      <div class="bcc-card-body">
        <p class="bcc-note" style="line-height:1.9">${_onsInterpretation(d)}</p>
        <p class="bcc-note" style="margin-top:8px;color:var(--bt2-sub);font-size:.6rem">
          TIR USD · convención 30/360 · precio ARS / MEP${d.mep ? ' ($'+Number(d.mep).toLocaleString('es-AR',{minimumFractionDigits:0})+')' : ''}.
          Fuente: BD ONs.xlsx + data912.
        </p>
      </div>
    </div>`;

  // ECharts stacked bar — inicializar después de que el DOM sea visible
  requestAnimationFrame(() => {
    setTimeout(() => {
      const chartEl = document.getElementById('ons-detail-chart');
      if (chartEl && d.cashflows && d.cashflows.length) {
        _onsRenderCFChart(chartEl, d.cashflows);
      }
    }, 50);
  });
}

function _onsRenderCFChart(el, cashflows) {
  const ex = echarts.getInstanceByDom(el);
  if (ex) ex.dispose();
  const chart = echarts.init(el, 'dcf');
  const mono  = "'JetBrains Mono',monospace";

  const labels   = cashflows.map(cf => cf.fecha.split('-').reverse().join('/'));
  const capitals = cashflows.map(cf => cf.capital_usd  || 0);
  const interests= cashflows.map(cf => cf.interes_usd  || 0);

  chart.setOption({
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      backgroundColor: '#0d1424', borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, padding: [8, 12],
      formatter: params => {
        const idx = params[0]?.dataIndex;
        const cf  = cashflows[idx];
        if (!cf) return '';
        return `<div style="font-family:${mono};font-size:11px;min-width:160px">
          <b style="color:var(--bt2-accent)">${cf.fecha.split('-').reverse().join('/')}</b>
          <div style="margin-top:4px">
            <span style="color:#9ecae1">Capital: ${cf.capital_usd > 0 ? Number(cf.capital_usd).toFixed(4).replace('.',',') : '—'}</span><br>
            <span style="color:#f97316">Interés: ${Number(cf.interes_usd).toFixed(4).replace('.',',')}</span><br>
            <b>Total: ${Number(cf.cashflow_total_usd).toFixed(4).replace('.',',')}</b>
          </div>
        </div>`;
      },
    },
    legend: {
      data: ['Capital', 'Interés'],
      textStyle: { color: '#94a3b8', fontFamily: mono, fontSize: 10 },
      top: 0, right: 8,
    },
    grid: { left: 10, right: 10, top: 28, bottom: 30, containLabel: true },
    xAxis: {
      type: 'category', data: labels,
      axisLabel: { color: '#64748b', fontFamily: mono, fontSize: 9, rotate: labels.length > 6 ? 30 : 0 },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value', name: 'USD/100 VN', nameLocation: 'end', nameGap: 6,
      nameTextStyle: { color: '#64748b', fontFamily: mono, fontSize: 9, align: 'left' },
      axisLabel: { color: '#64748b', fontFamily: mono, fontSize: 9, formatter: v => v.toFixed(1) },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } },
    },
    series: [
      {
        name: 'Capital', type: 'bar', stack: 'cf',
        data: capitals, barMaxWidth: 48,
        itemStyle: { color: '#9ecae1', opacity: 0.9 },
      },
      {
        name: 'Interés', type: 'bar', stack: 'cf',
        data: interests, barMaxWidth: 48,
        itemStyle: { color: '#f97316', opacity: 0.9 },
      },
    ],
  });

  new ResizeObserver(() => chart.resize()).observe(el);
}

function _onsInterpretation(d) {
  const fT = v => v != null ? (v >= 0 ? '+' : '') + Number(v).toFixed(2).replace('.', ',') + '%' : null;
  const fD = s => s ? s.split('-').reverse().join('/') : null;
  const parts = [];

  if (d.ytm != null) {
    const nivel = d.ytm >= 9 ? 'alta' : d.ytm >= 5 ? 'moderada' : d.ytm >= 2 ? 'baja' : 'muy baja';
    const tirCol = d.ytm >= 5 ? '#22c55e' : d.ytm < 0 ? '#ef4444' : '#f97316';
    parts.push(`La ON <b>${d.ticker}</b> presenta TIR estimada en USD de <b style="color:${tirCol}">${fT(d.ytm)}</b> (nivel ${nivel}).`);
  }

  if (d.duration != null) {
    const sens = d.duration < 1 ? 'baja' : d.duration < 2.5 ? 'moderada' : 'alta';
    parts.push(`Duration de <b>${Number(d.duration).toFixed(2).replace('.', ',')} años</b> implica sensibilidad <b>${sens}</b> ante variaciones de tasa.`);
  }

  if (d.proximo_pago) {
    const cfParts = [];
    if (d.interes_proximo_pago > 0)
      cfParts.push(`interés <b>USD ${Number(d.interes_proximo_pago).toFixed(4).replace('.', ',')}</b>`);
    if (d.amort_proximo_pago > 0)
      cfParts.push(`capital <b>USD ${Number(d.amort_proximo_pago).toFixed(4).replace('.', ',')}</b>`);
    if (cfParts.length)
      parts.push(`Próximo flujo: <b>${fD(d.proximo_pago)}</b> — ${cfParts.join(' + ')} cada 100 VN.`);
  }

  if (d.paridad_mep != null) {
    const col  = d.paridad_mep < 0 ? '#22c55e' : '#ef4444';
    const desc = d.paridad_mep < -5
      ? 'cotiza <b>con descuento</b> — potencial de apreciación hacia la par'
      : d.paridad_mep > 5
        ? 'cotiza <b>con prima</b> sobre el valor teórico'
        : 'cotiza <b>cerca de la par</b>';
    parts.push(`Paridad (MEP): <b style="color:${col}">${fT(d.paridad_mep)}</b> vs valor teórico — ${desc}.`);
  }

  if (d.valor_teorico != null)
    parts.push(`Valor teórico: <b>USD ${Number(d.valor_teorico).toFixed(4).replace('.', ',')}</b> / 100 VN (capital pendiente + cupón corrido).`);

  if (d.dias_vencimiento != null && d.dias_vencimiento <= 90)
    parts.push(`<span style="color:#fbbf24">⚠ <b>Vencimiento en ${d.dias_vencimiento} días</b> — cotización y liquidez pueden volverse más volátiles.</span>`);

  return parts.length
    ? parts.join(' ')
    : 'Completá los datos de mercado para ver la interpretación.';
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
