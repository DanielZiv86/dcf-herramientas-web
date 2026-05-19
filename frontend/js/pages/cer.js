/* ─── Bonos CER — BondTerminal v2 ─────────────────────────────────────── */

let _cerPageData = [];

(window.pages = window.pages || {}).cer = async function(container) {
  container.innerHTML = `
    <div class="bt2-page">

      <!-- Header -->
      <div class="bt2-header">
        <h1 class="bt2-title">Bonos CER</h1>
        <div class="bt2-kpis" id="cer-kpis"></div>
      </div>

      <!-- Grid: tabla + chart -->
      <div class="ltr-grid">

        <!-- LEFT: tabla -->
        <div class="bt2-panel">
          <div class="bt2-panel-hdr">
            <span class="bt2-panel-title">BONOS CER ACTIVOS</span>
            <span class="bt2-panel-sub" id="cer-table-count"></span>
          </div>
          <div class="bt2-snapshot-scroll" id="cer-table-wrap" style="overflow-x:auto">
            ${_cerSkeleton(10)}
          </div>
        </div>

        <!-- RIGHT: curva TIR real -->
        <div class="bt2-panel ltr-chart-panel">
          <div class="bt2-panel-hdr">
            <span class="bt2-panel-title">CURVA CER — TIR REAL</span>
          </div>
          <div id="cer-chart"></div>
        </div>

      </div>

      <!-- Nota interpretativa -->
      <div class="cer-note-strip">
        <span style="color:#34d399">ℹ</span>
        Los rendimientos son <strong>TIR real sobre CER (IPC INDEC)</strong>. Motor propio: precio_real = precio / index_ratio,
        donde index_ratio = CER(ref_settle) / CER(ref_emisión). Fuente: data912.com · datos.gob.ar + argentinadatos.com.
        <span style="color:var(--bt2-accent);margin-left:8px">&#9679;</span>
        Instrumentos con &lt;45 días al vencimiento
        operan como <strong>descuento de corto plazo</strong> — su pago ya está determinado y no reflejan un real yield CER.
        Se muestran atenuados y se excluyen de los KPIs.
      </div>

    </div>`;

  try {
    const data = await api.cer.tabla();
    _cerPageData = data || [];
    _cerRenderKPIs(_cerPageData);
    _cerRenderTable(_cerPageData);
    _cerRenderChart(_cerPageData);
  } catch (e) {
    document.getElementById('cer-table-wrap').innerHTML =
      `<div style="padding:16px 12px">
        <p style="font-family:var(--font-mono);color:var(--negative);font-size:.78rem">Error: ${e.message}</p>
        <p style="font-family:var(--font-mono);color:var(--text-muted);font-size:.72rem;margin-top:6px">
          No se pudo cargar la tabla CER. Verificá conectividad con el backend.
        </p>
      </div>`;
  }
};

// ── KPIs superiores por tramo — excluye near_maturity ─────────────────────
function _cerRenderKPIs(data) {
  const el = document.getElementById('cer-kpis');
  if (!el) return;

  // near_maturity se excluye de KPIs: su TIR no refleja un real yield CER
  const valid = (data || []).filter(d => d.tir_real != null && d.duration != null && !d.near_maturity);
  const nearCount = (data || []).filter(d => d.near_maturity).length;
  if (!valid.length) { el.innerHTML = ''; return; }

  const short  = valid.filter(d => d.duration < 1);
  const medium = valid.filter(d => d.duration >= 1 && d.duration < 2.5);
  const long_  = valid.filter(d => d.duration >= 2.5);
  const avg    = arr => arr.length ? arr.reduce((s, d) => s + d.tir_real, 0) / arr.length : null;
  const best   = valid.reduce((b, d) => (b == null || d.tir_real > b.tir_real) ? d : b, null);

  const fmtTIR = v => v != null ? (v >= 0 ? '+' : '') + v.toFixed(2).replace('.', ',') + '%' : '—';
  const tirCls = v => v == null ? '' : v > 2 ? 'bt2-pos' : v < -1 ? 'bt2-neg' : '';

  const kpi = (label, val, cls = '', sub = '') => `
    <div class="bt2-kpi-card">
      <div class="bt2-kpi-label">${label}</div>
      <div class="bt2-kpi-value ${cls}">${val}</div>
      ${sub ? `<div class="bt2-kpi-sub">${sub}</div>` : ''}
    </div>`;

  el.innerHTML = [
    short.length  ? kpi('CER CORTO', fmtTIR(avg(short)),  tirCls(avg(short)),  'DUR &lt; 1A') : '',
    medium.length ? kpi('CER MEDIO', fmtTIR(avg(medium)), tirCls(avg(medium)), '1 – 2.5 AÑOS') : '',
    long_.length  ? kpi('CER LARGO', fmtTIR(avg(long_)),  tirCls(avg(long_)),  'DUR &ge; 2.5A') : '',
    best          ? kpi('MEJOR TIR', fmtTIR(best.tir_real), 'bt2-pos', best.ticker) : '',
    kpi('CER ACTIVOS', valid.length + '', '', 'CON TIR REAL'),
    nearCount > 0 ? kpi('VENCIENDO', nearCount + '', 'bt2-sub', '&lt; 45 DÍAS') : '',
  ].filter(Boolean).join('');
}

// ── Tabla principal ─────────────────────────────────────────────────────────
function _cerRenderTable(data) {
  const wrap = document.getElementById('cer-table-wrap');
  const countEl = document.getElementById('cer-table-count');
  if (!wrap) return;

  if (!data?.length) {
    wrap.innerHTML = `<div style="padding:20px 12px"><p style="font-family:var(--font-mono);color:var(--text-muted);font-size:.75rem">No hay datos CER disponibles.</p></div>`;
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const sorted = [...data]
    .filter(d => !d.vencimiento || d.vencimiento > today)
    .filter(d => d.precio != null || d.tir_real != null)
    .sort((a, b) => (a.vencimiento || '9999').localeCompare(b.vencimiento || '9999'));

  if (!sorted.length) {
    wrap.innerHTML = `<p style="padding:16px 12px;font-family:var(--font-mono);color:var(--text-muted);font-size:.75rem">Sin instrumentos activos.</p>`;
    return;
  }
  if (countEl) countEl.textContent = sorted.length + ' instrumentos';

  // max volumen para barra proporcional
  const maxVol = Math.max(...sorted.map(d => d.volumen || 0), 1);

  const fmtPx  = v => v != null ? `$ ${Number(v).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—';
  const fmtPct = v => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2).replace('.', ',') + '%';
  const fmtPar = v => v == null ? '—' : v.toFixed(2).replace('.', ',') + '%';
  const fmtDur = v => v != null ? v.toFixed(2).replace('.', ',') : '—';
  const fmtDias = v => v != null ? v.toString() : '—';
  const fmtDate = s => { if (!s) return '—'; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; };

  // colores
  const varCls  = v => v == null ? 'bt2-sub' : v > 0.01 ? 'bt2-pos' : v < -0.01 ? 'bt2-neg' : 'bt2-sub';
  const tirCls  = v => v == null ? '' : v >= 5 ? 'cer-tir-vpos' : v >= 1 ? 'cer-tir-pos' : v >= -1 ? '' : v >= -5 ? 'cer-tir-neg' : 'cer-tir-vneg';
  const tirTxtC = v => v == null ? 'bt2-sub' : v > 0 ? 'bt2-pos' : v < 0 ? 'bt2-neg' : 'bt2-sub';
  const parCls  = v => v == null ? 'bt2-sub' : v > 101 ? 'cer-par-lo' : v < 99 ? 'bt2-pos' : 'bt2-sub';

  // volumen formateado
  const fmtVol = v => {
    if (v == null || v === 0) return '—';
    if (v >= 1e9) return (v / 1e9).toFixed(1).replace('.', ',') + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',') + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(0).replace('.', ',') + 'K';
    return String(v);
  };

  const headers = `<tr>
    <th style="text-align:left;white-space:nowrap">TICKER</th>
    <th style="white-space:nowrap">VENC.</th>
    <th style="white-space:nowrap">DÍAS</th>
    <th style="white-space:nowrap">PRECIO</th>
    <th style="white-space:nowrap">PAR.</th>
    <th class="cer-th-tna" style="white-space:nowrap">TNA</th>
    <th class="cer-th-hl"  style="white-space:nowrap">TIR</th>
    <th style="white-space:nowrap">TEM</th>
    <th style="white-space:nowrap">DUR.</th>
    <th style="white-space:nowrap">VOL.</th>
    <th style="white-space:nowrap">% DÍA</th>
  </tr>`;

  const rows = sorted.map(d => {
    const nm     = !!d.near_maturity;
    const volPct = d.volumen ? Math.round((d.volumen / maxVol) * 100) : 0;
    const volCell = `<div class="cer-vol-cell">
      <span>${fmtVol(d.volumen)}</span>
      <div class="cer-vol-bar-bg"><div class="cer-vol-bar-fill" style="width:${volPct}%"></div></div>
    </div>`;
    // near_maturity: fila atenuada, ticker en naranja, TIR sin heatmap
    const rowStyle = nm ? ' style="opacity:0.55"' : '';
    const tkClass  = nm ? 'bt2-td-ticker cer-tk-nm bond-clickable' : 'bt2-td-ticker cer-tk bond-clickable';
    const tkBadge  = nm ? ` <span class="cer-nm-badge" title="Pago determinado, opera como descuento de corto plazo">VENC.</span>` : '';
    const tirCell  = nm
      ? `<td class="bt2-td-num bt2-sub" style="font-weight:700">${fmtPct(d.tir_real)}</td>`
      : `<td class="bt2-td-num ${tirCls(d.tir_real)}" style="font-weight:700"><span class="${tirTxtC(d.tir_real)}">${fmtPct(d.tir_real)}</span></td>`;
    return `
    <tr class="bt2-row"${rowStyle}>
      <td class="${tkClass}"
          onclick="_openCerDetail('${d.ticker}')"
          title="Click para ver detalle">${d.ticker}${tkBadge}</td>
      <td class="bt2-td-num cer-venc">${fmtDate(d.vencimiento)}</td>
      <td class="bt2-td-num cer-dias">${fmtDias(d.dias)}</td>
      <td class="bt2-td-num">${fmtPx(d.precio)}</td>
      <td class="bt2-td-num ${parCls(d.paridad)}">${fmtPar(d.paridad)}</td>
      <td class="bt2-td-num bt2-sub">${fmtPct(d.tna)}</td>
      ${tirCell}
      <td class="bt2-td-num bt2-sub">${fmtPct(d.tem)}</td>
      <td class="bt2-td-num bt2-sub">${fmtDur(d.duration)}</td>
      <td class="bt2-td-num bt2-sub" style="min-width:80px">${volCell}</td>
      <td class="bt2-td-num ${varCls(d.var_dia)}">${fmtPct(d.var_dia)}</td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `<table class="bt2-table" style="min-width:680px"><thead>${headers}</thead><tbody>${rows}</tbody></table>`;
}

// ── Curva CER ─────────────────────────────────────────────────────────────
function _cerRenderChart(data) {
  const el = document.getElementById('cer-chart');
  if (!el) return;

  // Separar: instrumentos CER "reales" vs near_maturity (operan como descuento)
  const allValid = (data || [])
    .filter(d => d.tir_real != null && d.duration != null && d.duration > 0
                 && Math.abs(d.tir_real) < 50)
    .sort((a, b) => a.duration - b.duration);

  const valid = allValid.filter(d => !d.near_maturity);   // curva principal
  const nearM = allValid.filter(d =>  d.near_maturity);   // serie secundaria

  if (!valid.length) {
    dcfCharts.disposeChart('cer-chart');
    el.style.height = '';
    el.innerHTML = `<p style="padding:20px;font-family:var(--font-mono);color:var(--text-muted);font-size:.78rem;text-align:center">Sin datos para graficar</p>`;
    return;
  }

  const xVals = valid.map(d => d.duration);
  const yVals = valid.map(d => d.tir_real);
  const xPad  = Math.max((Math.max(...xVals) - Math.min(...xVals)) * 0.1, 0.3);
  const yPad  = Math.max((Math.max(...yVals) - Math.min(...yVals)) * 0.2, 1.0);

  const mono  = "'JetBrains Mono',monospace";
  const pts   = valid.map(d => [d.duration, d.tir_real]);
  const trend = valid.length >= 3 ? _quadReg(pts) : valid.length >= 2 ? _linReg(pts) : null;

  const existing = echarts.getInstanceByDom(el);
  if (existing) existing.dispose();
  el.style.height = '430px';
  const chart = echarts.init(el, 'dcf');

  const fmtT = v => v != null ? (v >= 0 ? '+' : '') + v.toFixed(2).replace('.', ',') + '%' : '—';
  const fmtP = v => v != null ? `$ ${Number(v).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—';
  const fmtD = s => { if (!s) return '—'; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; };

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
        const row = (l, v) => `<div style="display:flex;justify-content:space-between;gap:16px;margin-top:2px"><span style="color:#7a8fa6">${l}</span><span>${v}</span></div>`;
        let h = `<div style="font-family:${mono};font-size:11.5px;min-width:190px">`;
        h += `<div style="font-size:13px;font-weight:700;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.08);color:#34d399">${d.ticker}</div>`;
        h += row('Precio',   fmtP(d.precio));
        h += row('TIR Real', `<span style="color:${d.tir_real >= 0 ? '#22c55e' : '#ef4444'}">${fmtT(d.tir_real)}</span>`);
        h += row('TNA',      fmtT(d.tna));
        h += row('TEM',      fmtT(d.tem));
        h += row('Paridad',  d.paridad != null ? d.paridad.toFixed(2).replace('.', ',') + '%' : '—');
        h += row('Duration', d.duration != null ? d.duration.toFixed(2).replace('.', ',') : '—');
        h += row('Venc.',    fmtD(d.vencimiento));
        h += row('Días',     d.dias != null ? d.dias.toString() : '—');
        if (d.var_dia != null) h += row('% Día', fmtT(d.var_dia));
        return h + '</div>';
      },
    },
    grid: { left: 10, right: 14, top: 22, bottom: 38, containLabel: true },
    xAxis: {
      type: 'value',
      name: 'Duration (años)',
      nameLocation: 'middle', nameGap: 26,
      min: Math.max(0, +(Math.min(...xVals) - xPad).toFixed(2)),
      max: +(Math.max(...xVals) + xPad).toFixed(2),
      nameTextStyle: { color: '#64748b', fontFamily: mono, fontSize: 10 },
      axisLabel:  { color: '#64748b', fontFamily: mono, fontSize: 10 },
      axisLine:   { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitLine:  { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } },
    },
    yAxis: {
      type: 'value',
      name: 'TIR Real (%)',
      nameLocation: 'end', nameGap: 6,
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
      // Curva principal CER — emerald
      {
        name: 'CER Real',
        type: 'scatter',
        data: valid.map(d => [d.duration, d.tir_real]),
        symbolSize: 10,
        clip: false,
        itemStyle: { color: 'transparent', borderColor: '#34d399', borderWidth: 2 },
        label: {
          show: true,
          fontFamily: mono, fontSize: 9, fontWeight: 700,
          color: '#34d399',
          textBorderColor: 'rgba(8,17,28,0.9)', textBorderWidth: 2,
          formatter: p => valid[p.dataIndex]?.ticker || '',
          position: 'top', distance: 6,
        },
        tooltip: {
          formatter: (p) => {
            const d = valid[p.dataIndex];
            if (!d) return '';
            const row = (l, v) => `<div style="display:flex;justify-content:space-between;gap:16px;margin-top:2px"><span style="color:#7a8fa6">${l}</span><span>${v}</span></div>`;
            let h = `<div style="font-family:${mono};font-size:11.5px;min-width:190px">`;
            h += `<div style="font-size:13px;font-weight:700;margin-bottom:6px;color:#34d399">${d.ticker}</div>`;
            h += row('TIR Real', `<span style="color:${d.tir_real >= 0 ? '#22c55e' : '#ef4444'}">${fmtT(d.tir_real)}</span>`);
            h += row('Precio', fmtP(d.precio));
            h += row('Paridad', d.paridad != null ? d.paridad.toFixed(2).replace('.', ',') + '%' : '—');
            h += row('Duration', d.duration != null ? d.duration.toFixed(2).replace('.', ',') : '—');
            h += row('Venc.', fmtD(d.vencimiento));
            return h + '</div>';
          },
        },
      },
      // Near-maturity — gris, serie separada, no forma parte de la curva CER
      ...(nearM.length ? [{
        name: 'Venciendo',
        type: 'scatter',
        data: nearM.map(d => [d.duration, d.tir_real]),
        symbolSize: 8,
        symbol: 'diamond',
        clip: false,
        itemStyle: { color: 'transparent', borderColor: '#64748b', borderWidth: 1.5 },
        label: {
          show: true,
          fontFamily: mono, fontSize: 8, fontWeight: 600,
          color: '#64748b',
          textBorderColor: 'rgba(8,17,28,0.9)', textBorderWidth: 2,
          formatter: p => nearM[p.dataIndex]?.ticker || '',
          position: 'top', distance: 6,
        },
        tooltip: {
          formatter: (p) => {
            const d = nearM[p.dataIndex];
            if (!d) return '';
            const row = (l, v) => `<div style="display:flex;justify-content:space-between;gap:16px;margin-top:2px"><span style="color:#7a8fa6">${l}</span><span>${v}</span></div>`;
            let h = `<div style="font-family:${mono};font-size:11.5px;min-width:200px">`;
            h += `<div style="font-size:13px;font-weight:700;margin-bottom:4px;color:#94a3b8">${d.ticker}</div>`;
            h += `<div style="font-size:.68rem;color:#f97316;margin-bottom:6px">Pago determinado — opera como descuento de c/p</div>`;
            h += row('Precio', fmtP(d.precio));
            h += row('Paridad', d.paridad != null ? d.paridad.toFixed(2).replace('.', ',') + '%' : '—');
            h += row('Días', d.dias != null ? d.dias.toString() : '—');
            return h + '</div>';
          },
        },
      }] : []),
      // Trendline curva principal
      ...(trend ? [{
        type: 'line',
        data: trend,
        showSymbol: false, clip: true,
        lineStyle: { color: '#34d399', type: 'dashed', width: 1.5, opacity: 0.5 },
        tooltip: { show: false }, silent: true,
      }] : []),
    ],
    legend: {
      show: nearM.length > 0,
      bottom: 0,
      textStyle: { color: '#64748b', fontFamily: mono, fontSize: 10 },
      itemWidth: 10, itemHeight: 10,
      data: [
        { name: 'CER Real',   icon: 'circle',  itemStyle: { borderColor: '#34d399', color: 'transparent', borderWidth: 2 } },
        { name: 'Venciendo',  icon: 'diamond', itemStyle: { borderColor: '#64748b', color: 'transparent', borderWidth: 1.5 } },
      ],
    },
  });

  new ResizeObserver(() => chart.resize()).observe(el);
}

// ── Modal de detalle por ticker ────────────────────────────────────────────
async function _openCerDetail(ticker) {
  const d = _cerPageData.find(x => x.ticker === ticker);
  if (!d) return;

  const old = document.getElementById('cer-detail-overlay');
  if (old) old.remove();

  const fT  = v => v != null ? (v >= 0 ? '+' : '') + v.toFixed(2).replace('.', ',') + '%' : 'N/D';
  const fP  = v => v != null ? `$ ${Number(v).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})}` : 'N/D';
  const fDu = v => v != null ? v.toFixed(2).replace('.', ',') : 'N/D';
  const fDa = s => { if (!s) return 'N/D'; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; };
  const fPar = v => v != null ? v.toFixed(2).replace('.', ',') + '%' : 'N/D';

  const tirColor = d.tir_real == null ? '' : d.tir_real > 0 ? '#22c55e' : '#ef4444';
  const mi = (label, val, style = '') =>
    `<div class="bcc-meta-item"><span class="bcc-meta-label">${label}</span><span class="bcc-meta-val" style="${style}">${val}</span></div>`;

  const isNM    = !!d.near_maturity;
  const isShort = d.dias != null && d.dias < 30;

  const el = document.createElement('div');
  el.id = 'cer-detail-overlay';
  el.className = 'bcc-overlay';

  // Construir modal inicial con datos ya disponibles
  el.innerHTML = `
    <div class="bcc-modal" style="max-width:600px">
      <div class="bcc-header">
        <div>
          <span class="bcc-title ${isNM ? 'cer-tk-nm' : 'cer-tk'}">${d.ticker}${isNM ? ' <span class="cer-nm-badge">VENC.</span>' : ''}</span>
          <span class="bcc-subtitle" id="cer-detail-tipo">BONO CER — CARGANDO…</span>
        </div>
        <button class="bcc-close" onclick="document.getElementById('cer-detail-overlay').remove()">✕</button>
      </div>
      <div class="bcc-body">

        <!-- Métricas principales -->
        <div class="bcc-meta">
          ${mi('PRECIO',    fP(d.precio))}
          ${mi('PARIDAD',   fPar(d.paridad), d.paridad != null && d.paridad < 100 ? 'color:#22c55e' : d.paridad != null && d.paridad > 101 ? 'color:#f97316' : '')}
          ${mi('TNA',       fT(d.tna))}
          ${mi('TIR REAL',  fT(d.tir_real), `color:${tirColor};font-weight:700`)}
          ${mi('TEM',       fT(d.tem))}
          ${mi('DURATION',  fDu(d.duration) + ' años')}
          ${mi('VENC.',     fDa(d.vencimiento))}
          ${mi('DÍAS',      d.dias != null ? d.dias.toString() : 'N/D')}
          ${d.var_dia != null ? mi('% DÍA', fT(d.var_dia), d.var_dia >= 0 ? 'color:#22c55e' : 'color:#ef4444') : ''}
        </div>

        ${isNM ? `
        <div class="bcc-card" style="border-color:rgba(249,115,22,0.35)">
          <div class="bcc-card-title" style="color:var(--bt2-accent)">INSTRUMENTO EN ZONA DE VENCIMIENTO</div>
          <div class="bcc-card-body">
            <p class="bcc-note" style="line-height:1.7">
              Con <strong>${d.dias} días</strong> al vencimiento, el pago nominal ya está esencialmente determinado
              porque el CER en la fecha de referencia de madurez (<code>venc. - 10bdays</code>) es conocido o muy estimable.
              El instrumento opera como <strong>descuento de corto plazo</strong> (renta fija), no como CER real yield.
            </p>
            <p class="bcc-note" style="margin-top:6px;color:var(--bt2-sub)">
              Se excluye de los KPIs de la curva CER y del tramo de tendencia para no distorsionar el análisis
              de real yield a mayor plazo.
            </p>
          </div>
        </div>` : (isShort ? `
        <div class="bcc-card" style="border-color:rgba(249,115,22,0.25)">
          <div class="bcc-card-title" style="color:var(--bt2-accent)">TRAMO CORTO</div>
          <div class="bcc-card-body">
            <p class="bcc-note">El ajuste CER aplicable puede estar prácticamente determinado.
            La TIR refleja más la tasa efectiva de convergencia que un rendimiento real futuro.</p>
          </div>
        </div>` : '')}

        <!-- Flujo de fondos — se rellena async -->
        <div class="bcc-card" id="cer-detail-flows">
          <div class="bcc-card-title">FLUJO DE FONDOS CONTRACTUAL</div>
          <div class="bcc-card-body">
            <p class="bcc-note" style="color:var(--bt2-sub)">Cargando…</p>
          </div>
        </div>

        <!-- Metodología -->
        <div class="bcc-card">
          <div class="bcc-card-title">METODOLOGÍA TIR REAL CER</div>
          <div class="bcc-card-body">
            <p class="bcc-note" style="line-height:1.8">
              El bono ajusta su capital por <span style="color:#34d399">CER</span> (IPC INDEC, base diaria).<br>
              <strong>index_ratio</strong> = CER(ref_settle) / CER(ref_emisión)
              <em style="color:var(--bt2-sub);font-size:.64rem"> — donde ref = 10 días hábiles antes</em><br>
              <strong>precio_real</strong> = precio_mercado / index_ratio<br>
              <strong>TIR real</strong> = r tal que: precio_real = Σ CF / (1+r)^t<br>
              Los flujos reales son los contractuales (CER se cancela algebraicamente).<br>
              <span style="color:var(--bt2-sub)">TNA = TEM × 12  |  TEM = (1+TIR)^(1/12) – 1</span>
            </p>
            <div id="cer-detail-ratio" style="margin-top:8px;font-family:var(--font-mono);font-size:.67rem;color:var(--bt2-sub)">
              Calculando index_ratio…
            </div>
          </div>
        </div>

        <p class="bcc-note" style="margin-top:8px;color:var(--bt2-sub);font-size:.6rem">
          Precios: data912.com / IOL · CER: datos.gob.ar + argentinadatos.com · Motor: propio (sin Bonistas).
        </p>

      </div>
    </div>`;

  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });
  const esc = e => { if (e.key === 'Escape') { el.remove(); document.removeEventListener('keydown', esc); } };
  document.addEventListener('keydown', esc);

  // Fetch async: instrumento detail (cashflows + index_ratio)
  try {
    const det = await api.cer.instrumento(ticker);

    // Actualizar tipo de instrumento
    const tipoEl = document.getElementById('cer-detail-tipo');
    if (tipoEl && det.tipo_display) tipoEl.textContent = det.tipo_display;

    // Actualizar index_ratio y precio_real
    const ratioEl = document.getElementById('cer-detail-ratio');
    if (ratioEl && det.index_ratio) {
      ratioEl.innerHTML =
        `index_ratio = <strong>${det.index_ratio.toFixed(6)}</strong>` +
        (det.precio_real ? `  |  precio_real ≈ <strong>${det.precio_real.toFixed(4)}</strong>` : '');
    } else if (ratioEl) {
      ratioEl.textContent = '';
    }

    // Renderizar cashflows
    const flowsEl = document.getElementById('cer-detail-flows');
    if (flowsEl && det.cashflows && det.cashflows.length > 0) {
      const fmtFlowDate = s => { const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; };
      const flowRows = det.cashflows.map(f =>
        `<tr>
          <td>${fmtFlowDate(f.fecha)}</td>
          <td>${f.dias_restantes}</td>
          <td>${f.monto.toFixed(4).replace('.', ',')}</td>
        </tr>`
      ).join('');
      flowsEl.querySelector('.bcc-card-body').innerHTML = `
        <table class="cer-cf-table">
          <thead><tr>
            <th style="text-align:left">Fecha</th>
            <th>Días</th>
            <th>Monto (% VN base)</th>
          </tr></thead>
          <tbody>${flowRows}</tbody>
        </table>
        <p style="font-family:var(--font-mono);font-size:.62rem;color:var(--bt2-sub);margin-top:6px">
          Flujos en términos reales (CER cancelado). VN base = ${det.vn_base} · Cupón: ${det.coupon_rate_pct}% (${det.coupon_freq > 0 ? det.coupon_freq + 'x/año' : 'cero cupón'})
        </p>`;
    } else if (flowsEl && det.error) {
      flowsEl.querySelector('.bcc-card-body').innerHTML =
        `<p class="bcc-note" style="color:var(--bt2-sub)">${det.error}</p>`;
    } else if (flowsEl) {
      flowsEl.querySelector('.bcc-card-body').innerHTML =
        `<p class="bcc-note" style="color:var(--bt2-sub)">Sin flujos disponibles en metadata.</p>`;
    }
  } catch (err) {
    const flowsEl = document.getElementById('cer-detail-flows');
    if (flowsEl) flowsEl.querySelector('.bcc-card-body').innerHTML =
      `<p class="bcc-note" style="color:var(--bt2-sub)">No se pudo cargar el detalle del instrumento.</p>`;
  }
}

// ── Validación contra benchmark (disponible en consola del browser) ────────
// Uso: cerValidateBenchmark() — compara datos cargados contra la tabla benchmark
window.cerValidateBenchmark = function() {
  const BENCHMARK = [
    { ticker: 'X29Y6',  venc: '2026-05-29', tir_ref: 24.51, tna_ref: 21.98, tem_ref: 1.82, dur_ref: 0.02, par_ref: 100.35 },
    { ticker: 'TZX26',  venc: '2026-06-30', tir_ref: 24.96, tna_ref: 22.56, tem_ref: 1.85, dur_ref: 0.11, par_ref: 101.07 },
    { ticker: 'X31L6',  venc: '2026-07-31', tir_ref: -7.49, tna_ref: -7.73, tem_ref: -0.64, dur_ref: 0.20, par_ref: 101.55 },
    { ticker: 'X30S6',  venc: '2026-09-30', tir_ref: -3.40, tna_ref: -3.44, tem_ref: -0.28, dur_ref: 0.36, par_ref: 101.27 },
    { ticker: 'TZXO6',  venc: '2026-10-30', tir_ref: -1.81, tna_ref: -1.82, tem_ref: -0.15, dur_ref: 0.45, par_ref: 100.82 },
    { ticker: 'TX26',   venc: '2026-11-09', tir_ref: -1.18, tna_ref: -1.18, tem_ref: -0.10, dur_ref: 0.47, par_ref: 101.57 },
    { ticker: 'X30N6',  venc: '2026-11-30', tir_ref: -0.81, tna_ref: -0.81, tem_ref: -0.07, dur_ref: 0.53, par_ref: 100.43 },
    { ticker: 'TZXD6',  venc: '2026-12-15', tir_ref: -0.26, tna_ref: -0.26, tem_ref: -0.02, dur_ref: 0.57, par_ref: 100.15 },
    { ticker: 'TZXM7',  venc: '2027-03-31', tir_ref: 0.65,  tna_ref: 0.65,  tem_ref: 0.05,  dur_ref: 0.86, par_ref: 99.44  },
    { ticker: 'TZXA7',  venc: '2027-04-30', tir_ref: 0.98,  tna_ref: 0.98,  tem_ref: 0.08,  dur_ref: 0.95, par_ref: 99.08  },
    { ticker: 'TZXY7',  venc: '2027-05-31', tir_ref: 3.36,  tna_ref: 3.37,  tem_ref: 0.27,  dur_ref: 1.03, par_ref: 96.65  },
    { ticker: 'TZX27',  venc: '2027-06-30', tir_ref: 1.40,  tna_ref: 1.41,  tem_ref: 0.11,  dur_ref: 1.11, par_ref: 98.46  },
    { ticker: 'TZXS7',  venc: '2027-09-30', tir_ref: 5.33,  tna_ref: 5.26,  tem_ref: 0.43,  dur_ref: 1.36, par_ref: 93.16  },
    { ticker: 'TZXD7',  venc: '2027-12-15', tir_ref: 5.82,  tna_ref: 5.92,  tem_ref: 0.47,  dur_ref: 1.44, par_ref: 91.49  },
    { ticker: 'TZXM8',  venc: '2028-03-31', tir_ref: 5.81,  tna_ref: 5.73,  tem_ref: 0.47,  dur_ref: 1.86, par_ref: 90.00  },
    { ticker: 'TZX28',  venc: '2028-06-30', tir_ref: 7.33,  tna_ref: 7.20,  tem_ref: 0.58,  dur_ref: 2.11, par_ref: 86.11  },
    { ticker: 'TXM8',   venc: '2028-06-30', tir_ref: 4.51,  tna_ref: 4.46,  tem_ref: 0.36,  dur_ref: 2.11, par_ref: 91.09  },
    { ticker: 'TZXS8',  venc: '2028-09-29', tir_ref: 7.74,  tna_ref: 7.59,  tem_ref: 0.61,  dur_ref: 2.36, par_ref: 83.84  },
    { ticker: 'TX28',   venc: '2028-11-09', tir_ref: 5.72,  tna_ref: 5.64,  tem_ref: 0.46,  dur_ref: 1.41, par_ref: 80.35  },
    { ticker: 'TZXM9',  venc: '2029-03-28', tir_ref: 7.87,  tna_ref: 7.72,  tem_ref: 0.62,  dur_ref: 2.86, par_ref: 80.53  },
    { ticker: 'TXM9',   venc: '2029-06-29', tir_ref: 5.80,  tna_ref: 5.72,  tem_ref: 0.46,  dur_ref: 3.11, par_ref: 83.91  },
    { ticker: 'TX31',   venc: '2031-11-30', tir_ref: 7.65,  tna_ref: 7.51,  tem_ref: 0.61,  dur_ref: 2.96, par_ref: 87.13  },
  ];

  const diff = (a, b) => a != null && b != null ? +(a - b).toFixed(4) : null;
  const pctDiff = (a, b) => a != null && b != null && b !== 0 ? +((a - b) / Math.abs(b) * 100).toFixed(2) : null;

  console.group('%c📊 Validación CER vs Benchmark (precios del 2026-05-20)', 'font-weight:bold;font-size:14px');
  console.log('NOTA: diferencias esperadas por actualización de precios de mercado.');
  console.log('Benchmark: 20/05/2026 · Motor: propio datos.gob.ar + data912\n');

  BENCHMARK.forEach(ref => {
    const live = _cerPageData.find(x => x.ticker === ref.ticker);
    if (!live) {
      console.warn(`⚠ ${ref.ticker}: no encontrado en datos live`);
      return;
    }
    const tirDiff = diff(live.tir_real, ref.tir_ref);
    const tnaDiff = diff(live.tna,      ref.tna_ref);
    const temDiff = diff(live.tem,      ref.tem_ref);
    const durDiff = diff(live.duration, ref.dur_ref);
    const parDiff = diff(live.paridad,  ref.par_ref);
    const flag = (tirDiff != null && Math.abs(tirDiff) > 1.0) ? '⚠' : '✓';
    console.log(
      `${flag} ${ref.ticker.padEnd(7)} | TIR: ${(live.tir_real ?? '—').toString().padStart(6)} vs ${ref.tir_ref.toString().padStart(6)} (Δ${tirDiff ?? '—'}) | TNA: Δ${tnaDiff ?? '—'} | DUR: Δ${durDiff ?? '—'} | PAR: Δ${parDiff ?? '—'}%`
    );
  });

  console.log('\nTickers live sin benchmark:',
    _cerPageData.filter(d => !BENCHMARK.find(b => b.ticker === d.ticker)).map(d => d.ticker));
  console.groupEnd();
  return 'Validación completada. Ver resultados en consola.';
};

function _cerSkeleton(n) {
  return Array.from({ length: n }, () =>
    `<div class="skeleton skeleton-table-row" style="margin:2px 12px"></div>`
  ).join('');
}
