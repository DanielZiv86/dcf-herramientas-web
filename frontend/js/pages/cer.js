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
          </div>
          <div class="bt2-snapshot-scroll" id="cer-table-wrap">
            ${_cerSkeleton(8)}
          </div>
        </div>

        <!-- RIGHT: curva -->
        <div class="bt2-panel ltr-chart-panel">
          <div class="bt2-panel-hdr">
            <span class="bt2-panel-title">CURVA CER — TIR REAL</span>
          </div>
          <div id="cer-chart"></div>
        </div>

      </div>

      <!-- Nota interpretativa tramo corto -->
      <div class="cer-note-strip">
        <span style="color:var(--bt2-ny)">ℹ</span>
        Los rendimientos son <strong>TIR real sobre CER (IPC INDEC)</strong>. Instrumentos de muy corto plazo
        pueden operar con ajuste CER prácticamente conocido — su TIR se interpreta más como tasa efectiva
        de corto plazo que como rendimiento real futuro. Fuente: Bonistas.com / data912.
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
          No se pudo cargar la fuente de datos CER. Verificá conectividad con Bonistas.com.
        </p>
      </div>`;
  }
};

// ── KPIs superiores por tramo ──────────────────────────────────────────────
function _cerRenderKPIs(data) {
  const el = document.getElementById('cer-kpis');
  if (!el) return;

  const valid = (data || []).filter(d => d.tir_real != null && d.duration != null);
  if (!valid.length) { el.innerHTML = ''; return; }

  const short  = valid.filter(d => d.duration < 1);
  const medium = valid.filter(d => d.duration >= 1 && d.duration < 3);
  const long_  = valid.filter(d => d.duration >= 3);
  const avg    = arr => arr.length ? arr.reduce((s, d) => s + d.tir_real, 0) / arr.length : null;
  const best   = valid.reduce((b, d) => (b == null || d.tir_real > b.tir_real) ? d : b, null);

  const fmtTIR = v => v != null ? (v >= 0 ? '+' : '') + v.toFixed(2).replace('.', ',') + '%' : '—';
  const tirCls = v => v == null ? '' : v > 0.05 ? 'bt2-pos' : v < -0.05 ? 'bt2-neg' : '';

  const kpi = (label, val, cls = '', sub = '') => `
    <div class="bt2-kpi-card">
      <div class="bt2-kpi-label">${label}</div>
      <div class="bt2-kpi-value ${cls}">${val}</div>
      ${sub ? `<div class="bt2-kpi-sub">${sub}</div>` : ''}
    </div>`;

  el.innerHTML = [
    short.length  ? kpi('CER CORTO', fmtTIR(avg(short)),  tirCls(avg(short)),  'DUR &lt; 1A') : '',
    medium.length ? kpi('CER MEDIO', fmtTIR(avg(medium)), tirCls(avg(medium)), '1 — 3 AÑOS')  : '',
    long_.length  ? kpi('CER LARGO', fmtTIR(avg(long_)),  tirCls(avg(long_)),  'DUR &gt; 3A') : '',
    best          ? kpi('MAYOR TIR', fmtTIR(best.tir_real), 'bt2-pos', best.ticker)            : '',
    kpi('ACTIVOS', valid.length + '', '', 'CON TIR'),
  ].filter(Boolean).join('');
}

// ── Tabla ──────────────────────────────────────────────────────────────────
function _cerRenderTable(data) {
  const wrap = document.getElementById('cer-table-wrap');
  if (!wrap) return;

  if (!data?.length) {
    wrap.innerHTML = `<div style="padding:20px 12px"><p style="font-family:var(--font-mono);color:var(--text-muted);font-size:.75rem">No hay datos disponibles para Bonos CER en este momento.</p></div>`;
    return;
  }

  const today = new Date().toISOString().split('T')[0];

  const sorted = [...data]
    .filter(d => !d.vencimiento || d.vencimiento > today)     // excluir vencidos
    .filter(d => d.precio != null || d.tir_real != null)       // excluir sin datos útiles
    .sort((a, b) => {
      if (a.duration != null && b.duration != null) return a.duration - b.duration;
      if (a.duration != null) return -1;
      if (b.duration != null) return 1;
      return (a.vencimiento || '').localeCompare(b.vencimiento || '');
    });

  if (!sorted.length) {
    wrap.innerHTML = `<p style="padding:16px 12px;font-family:var(--font-mono);color:var(--text-muted);font-size:.75rem">Sin instrumentos activos con datos válidos.</p>`;
    return;
  }

  const fmtTIR  = v => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2).replace('.', ',') + '%';
  const fmtPx   = v => v != null ? `$${Number(v).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—';
  const fmtVar  = v => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2).replace('.', ',') + '%';
  const fmtDur  = v => v != null ? v.toFixed(2).replace('.', ',') : '—';
  const fmtDate = s => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };

  const tirCls = v => v == null ? 'bt2-sub' : v > 0.05 ? 'bt2-pos' : v < -0.05 ? 'bt2-neg' : 'bt2-sub';
  const varCls = v => v == null ? 'bt2-sub' : v > 0.01 ? 'bt2-pos' : v < -0.01 ? 'bt2-neg' : 'bt2-sub';

  const headers = `<tr>
    <th style="text-align:left">TICKER</th>
    <th>PRECIO</th>
    <th>VAR %</th>
    <th class="cer-th-hl">TIR REAL</th>
    <th>DUR.</th>
    <th>VENC.</th>
  </tr>`;

  const rows = sorted.map(d => `
    <tr class="bt2-row">
      <td class="bt2-td-ticker cer-tk bond-clickable"
          onclick="_openCerDetail('${d.ticker}')"
          title="Click para ver detalle">${d.ticker}</td>
      <td class="bt2-td-num">${fmtPx(d.precio)}</td>
      <td class="bt2-td-num ${varCls(d.var_dia)}">${fmtVar(d.var_dia)}</td>
      <td class="bt2-td-num ${tirCls(d.tir_real)}">${fmtTIR(d.tir_real)}</td>
      <td class="bt2-td-num bt2-sub">${fmtDur(d.duration)}</td>
      <td class="bt2-td-num bt2-sub cer-venc">${fmtDate(d.vencimiento)}</td>
    </tr>`).join('');

  wrap.innerHTML = `
    <table class="bt2-table">
      <thead>${headers}</thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Curva CER ─────────────────────────────────────────────────────────────
function _cerRenderChart(data) {
  const el = document.getElementById('cer-chart');
  if (!el) return;

  const valid = (data || [])
    .filter(d => d.tir_real != null && d.duration != null && d.duration > 0)
    .sort((a, b) => a.duration - b.duration);

  if (!valid.length) {
    dcfCharts.disposeChart('cer-chart');
    el.style.height = '';
    el.innerHTML = `<p style="padding:20px;font-family:var(--font-mono);color:var(--text-muted);font-size:.78rem;text-align:center">Sin datos disponibles para graficar</p>`;
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
        const fT = v => v != null ? (v >= 0 ? '+' : '') + v.toFixed(2).replace('.', ',') + '%' : '—';
        const fP = v => v != null ? `$${Number(v).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—';
        const fD = s => { if (!s) return '—'; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; };
        const row = (l, v) => `<div style="display:flex;justify-content:space-between;gap:16px;margin-top:2px"><span style="color:#7a8fa6">${l}</span><span>${v}</span></div>`;
        let h = `<div style="font-family:${mono};font-size:11.5px;min-width:170px">`;
        h += `<div style="font-size:13px;font-weight:700;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.08)">${d.ticker}</div>`;
        h += row('Precio',      fP(d.precio));
        h += row('TIR Real',    `<span style="color:${d.tir_real >= 0 ? '#22c55e' : '#ef4444'}">${fT(d.tir_real)}</span>`);
        h += row('TIR Nominal', fT(d.tir_nominal));
        h += row('Duration',    d.duration != null ? d.duration.toFixed(2).replace('.', ',') : '—');
        h += row('Venc.',       fD(d.vencimiento));
        if (d.var_dia != null) h += row('Var %', fT(d.var_dia));
        return h + '</div>';
      },
    },
    grid: { left: 10, right: 14, top: 22, bottom: 38, containLabel: true },
    xAxis: {
      type: 'value',
      name: 'Duration (yr)',
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
      axisLabel:  {
        color: '#64748b', fontFamily: mono, fontSize: 10,
        formatter: v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%',
      },
      axisLine:   { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitLine:  { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } },
    },
    series: [
      {
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
      },
      ...(trend ? [{
        type: 'line',
        data: trend,
        showSymbol: false, clip: true,
        lineStyle: { color: '#34d399', type: 'dashed', width: 1.5, opacity: 0.5 },
        tooltip: { show: false }, silent: true,
      }] : []),
    ],
    legend: { show: false },
  });

  new ResizeObserver(() => chart.resize()).observe(el);
}

// ── Modal de detalle por ticker ────────────────────────────────────────────
function _openCerDetail(ticker) {
  const d = _cerPageData.find(x => x.ticker === ticker);
  if (!d) return;

  const old = document.getElementById('cer-detail-overlay');
  if (old) old.remove();

  const fT  = v => v != null ? (v >= 0 ? '+' : '') + v.toFixed(2).replace('.', ',') + '%' : 'N/D';
  const fP  = v => v != null ? `$${Number(v).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})}` : 'N/D';
  const fDu = v => v != null ? v.toFixed(2).replace('.', ',') : 'N/D';
  const fDa = s => { if (!s) return 'N/D'; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; };
  const tirCls = v => v == null ? '' : v > 0.05 ? 'green' : v < -0.05 ? 'neg' : '';
  const mi = (label, val, cls = '') =>
    `<div class="bcc-meta-item"><span class="bcc-meta-label">${label}</span><span class="bcc-meta-val ${cls}">${val}</span></div>`;

  const isShort = d.duration != null && d.duration < 0.5;

  const el = document.createElement('div');
  el.id = 'cer-detail-overlay';
  el.className = 'bcc-overlay';
  el.innerHTML = `
    <div class="bcc-modal" style="max-width:560px">
      <div class="bcc-header">
        <div>
          <span class="bcc-title cer-tk">${d.ticker}</span>
          <span class="bcc-subtitle">BONO CER — DETALLE</span>
        </div>
        <button class="bcc-close" onclick="document.getElementById('cer-detail-overlay').remove()">✕</button>
      </div>
      <div class="bcc-body">

        <div class="bcc-meta">
          ${mi('PRECIO',      fP(d.precio),       '')}
          ${mi('TIR REAL',    fT(d.tir_real),     tirCls(d.tir_real))}
          ${mi('TIR NOMINAL', fT(d.tir_nominal),  '')}
          ${mi('DURATION',    fDu(d.duration),    '')}
          ${mi('VENC.',       fDa(d.vencimiento), '')}
          ${d.var_dia != null ? mi('VAR %', fT(d.var_dia), d.var_dia >= 0 ? 'green' : 'neg') : ''}
        </div>

        <div class="bcc-card">
          <div class="bcc-card-title">INTERPRETACIÓN</div>
          <div class="bcc-card-body">
            <p class="bcc-note" style="line-height:1.7">
              Ajusta por <span style="color:#34d399">CER</span> (Coeficiente de Estabilización de Referencia = IPC INDEC).
              La TIR real representa el rendimiento <em>por encima de la inflación</em> oficial.
            </p>
            ${isShort ? `
            <p class="bcc-note" style="margin-top:8px;border-left:2px solid var(--bt2-accent);padding-left:8px">
              <span style="color:var(--bt2-accent)">⚠ Tramo corto:</span>
              El ajuste CER aplicable puede estar prácticamente determinado.
              Su TIR se interpreta más como tasa efectiva que como rendimiento real futuro.
            </p>` : ''}
            <p class="bcc-note" style="margin-top:10px;color:var(--bt2-sub);font-size:.6rem">
              Fuente: Bonistas.com · Precios: data912 / IOL · TIR: dato fuente, no calculada internamente.
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

function _cerSkeleton(n) {
  return Array.from({ length: n }, () =>
    `<div class="skeleton skeleton-table-row" style="margin:2px 12px"></div>`
  ).join('');
}
