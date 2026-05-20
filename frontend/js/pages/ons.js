/* ─── ONs — Obligaciones Negociables — BondTerminal v2 ──────────────────── */

let _onsPageData = [];

(window.pages = window.pages || {}).ons = async function(container) {
  container.innerHTML = `
    <div class="bt2-page">

      <!-- Header -->
      <div class="bt2-header">
        <h1 class="bt2-title">Obligaciones Negociables</h1>
        <div class="bt2-kpis" id="ons-kpis"></div>
      </div>

      <!-- Filtros inline -->
      <div class="ltr-grid" style="grid-template-columns:auto auto 1fr auto;gap:10px;align-items:end;margin-bottom:14px">
        <div>
          <div class="bt2-filter-label">Legislación</div>
          <select class="dcf-select" id="ons-filter-leg" style="min-width:120px">
            <option value="">Todas</option>
            <option value="NY">Ley NY</option>
            <option value="AR">Ley AR</option>
          </select>
        </div>
        <div>
          <div class="bt2-filter-label">Buscar</div>
          <input class="dcf-input" id="ons-search" placeholder="Ticker..." style="width:150px" />
        </div>
        <div>
          <div class="bt2-filter-label">TIR mínima (%)</div>
          <input class="dcf-input" id="ons-tir-min" type="number" placeholder="ej: 4" style="width:110px" step="0.5" />
        </div>
        <div>
          <div class="bt2-filter-label">Ordenar por</div>
          <select class="dcf-select" id="ons-sort" style="min-width:130px">
            <option value="ytm_desc">TIR ↓</option>
            <option value="ytm_asc">TIR ↑</option>
            <option value="duration">Duration</option>
            <option value="maturity">Vencimiento</option>
          </select>
        </div>
      </div>

      <!-- Grid: tabla + chart -->
      <div class="ltr-grid">

        <!-- LEFT: tabla -->
        <div class="bt2-panel">
          <div class="bt2-panel-hdr">
            <span class="bt2-panel-title">YTM POR EMISIÓN</span>
            <span class="bt2-panel-sub" id="ons-count"></span>
          </div>
          <div class="bt2-snapshot-scroll" id="ons-tabla-wrap" style="overflow-x:auto">
            ${_onsSkeleton(10)}
          </div>
        </div>

        <!-- RIGHT: chart -->
        <div class="bt2-panel ltr-chart-panel">
          <div class="bt2-panel-hdr">
            <span class="bt2-panel-title" id="ons-chart-title">TIR vs DURATION</span>
          </div>
          <div id="ons-chart"></div>
        </div>

      </div>

      <!-- Nota fuente -->
      <div class="cer-note-strip" style="margin-top:10px">
        <span style="color:#94a3b8">ℹ</span>
        TIR calculada en USD (base 30/360) usando precio ARS / MEP.
        Precios: data912.com · fallback IOL. BD cashflows: BD ONs.xlsx.
      </div>

    </div>`;

  // Cargar datos
  try {
    const data = await api.ons.tabla();
    _onsPageData = Array.isArray(data) ? data : (data?.items || []);
    _onsRenderKPIs(_onsPageData);
    _onsRenderTable(_onsPageData);
    _onsRenderChart(_onsPageData);
  } catch (e) {
    console.error('[ONs] Error cargando /api/ons/tabla:', e);
    // Intentar ping para diagnóstico más preciso
    try {
      const ping = await api.ons.ping();
      console.info('[ONs] Ping result:', ping);
      _onsShowErrorWithDiag(e, ping);
    } catch (pingErr) {
      console.error('[ONs] Ping también falló:', pingErr);
      _onsShowError(e);
    }
  }

  // Wiring de filtros
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
};

// ── Error display ──────────────────────────────────────────────────────────
function _onsShowError(e, diagDetail = '') {
  const wrap = document.getElementById('ons-tabla-wrap');
  if (!wrap) return;

  let msg = 'No se pudo cargar la información de Obligaciones Negociables.';
  let detail = diagDetail;

  if (e && e.message) {
    if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError') || e.message.includes('ERR_')) {
      msg = 'No se pudo conectar al servidor de datos.';
      if (!detail) detail = 'Verificá que el backend está corriendo en Render y que no está en cold start.';
    } else if (e.message.includes('500')) {
      msg = 'El servidor respondió con un error interno (500).';
      detail = detail || e.message;
    } else if (e.message.includes('404')) {
      msg = 'El endpoint /api/ons/tabla no existe en el backend.';
      detail = detail || e.message;
    } else if (e.message.includes('401')) {
      msg = 'Sesión expirada. Recargá la página.';
    } else {
      detail = detail || e.message;
    }
  }

  wrap.innerHTML = `
    <div style="padding:20px 16px">
      <div style="font-family:var(--font-mono);color:var(--negative);font-size:.82rem;font-weight:700;margin-bottom:8px">
        ✕ ${msg}
      </div>
      ${detail ? `<div style="font-family:var(--font-mono);color:var(--text-muted);font-size:.72rem;background:#0a1020;border-radius:4px;padding:8px 10px;margin-top:6px;word-break:break-word">${detail}</div>` : ''}
      <div style="font-family:var(--font-mono);color:var(--text-muted);font-size:.68rem;margin-top:10px">
        Podés diagnosticar el problema abriendo la consola del browser (F12) y ejecutando:<br>
        <code style="color:#94a3b8">api.ons.ping().then(r => console.log(r))</code>
      </div>
    </div>`;
}

function _onsShowErrorWithDiag(e, ping) {
  let diagDetail = '';
  if (ping) {
    if (ping.status === 'bd_error') {
      diagDetail = `Error en BD ONs: ${ping.errors?.join(', ')}`;
    } else if (ping.status === 'ok' || ping.status === 'partial') {
      const bdInfo = ping.bd ? `BD: ${ping.bd.tickers} tickers` : 'BD: ?';
      const mepInfo = ping.mep ? `MEP: $${ping.mep}` : 'MEP: no disponible';
      diagDetail = `${bdInfo} | ${mepInfo} — Ping OK pero /tabla falló. Errores: ${ping.errors?.join(', ') || 'ninguno'}`;
    }
  }
  _onsShowError(e, diagDetail);
}

// ── Filtrado y ordenamiento ────────────────────────────────────────────────
function _onsFilter(data) {
  const leg     = document.getElementById('ons-filter-leg')?.value || '';
  const search  = (document.getElementById('ons-search')?.value || '').toUpperCase().trim();
  const tirMin  = parseFloat(document.getElementById('ons-tir-min')?.value || '');
  const sortBy  = document.getElementById('ons-sort')?.value || 'ytm_desc';

  let filtered = (data || []).filter(d => {
    if (d.status !== 'OK') return false;
    if (leg    && d.legislacion !== leg)          return false;
    if (search && !d.ticker?.includes(search))    return false;
    if (!isNaN(tirMin) && (d.ytm == null || d.ytm < tirMin)) return false;
    return true;
  });

  // Ordenamiento
  filtered.sort((a, b) => {
    if (sortBy === 'ytm_desc') return (b.ytm ?? -999) - (a.ytm ?? -999);
    if (sortBy === 'ytm_asc')  return (a.ytm ?? 999)  - (b.ytm ?? 999);
    if (sortBy === 'duration') return (a.duration ?? 999) - (b.duration ?? 999);
    if (sortBy === 'maturity') return (a.maturity ?? '').localeCompare(b.maturity ?? '');
    return 0;
  });

  return filtered;
}

// ── KPIs ───────────────────────────────────────────────────────────────────
function _onsRenderKPIs(data) {
  const el = document.getElementById('ons-kpis');
  if (!el) return;

  const ok = (data || []).filter(d => d.status === 'OK');
  if (!ok.length) { el.innerHTML = ''; return; }

  const tirs = ok.map(d => d.ytm).filter(v => v != null);
  const durs = ok.map(d => d.duration).filter(v => v != null);
  const avg  = arr => arr.length ? arr.reduce((s,v) => s+v, 0)/arr.length : null;
  const best = ok.reduce((b, d) => (!b || (d.ytm ?? -999) > (b.ytm ?? -999)) ? d : b, null);
  const mep  = ok[0]?.mep;

  const fmtTIR = v => v != null ? (v >= 0 ? '+' : '') + v.toFixed(2).replace('.', ',') + '%' : '—';
  const fmtDur = v => v != null ? v.toFixed(2).replace('.', ',') + ' a' : '—';

  const kpi = (label, val, cls = '', sub = '') => `
    <div class="bt2-kpi-card">
      <div class="bt2-kpi-label">${label}</div>
      <div class="bt2-kpi-value ${cls}">${val}</div>
      ${sub ? `<div class="bt2-kpi-sub">${sub}</div>` : ''}
    </div>`;

  const tirPromedio = avg(tirs);
  const durPromedio = avg(durs);

  el.innerHTML = [
    kpi('ONs ACTIVAS',   ok.length + '', '', 'CON TIR'),
    kpi('TIR PROMEDIO',  fmtTIR(tirPromedio), tirPromedio != null && tirPromedio >= 5 ? 'bt2-pos' : ''),
    best ? kpi('MAYOR TIR', fmtTIR(best.ytm), 'bt2-pos', best.ticker) : '',
    kpi('DUR. PROMEDIO', fmtDur(durPromedio), '', 'AÑOS'),
    mep ? kpi('MEP',     '$ ' + mep.toLocaleString('es-AR', {minimumFractionDigits:0}), 'bt2-sub', 'AL30D') : '',
  ].filter(Boolean).join('');
}

// ── Tabla ──────────────────────────────────────────────────────────────────
function _onsRenderTable(data) {
  const wrap   = document.getElementById('ons-tabla-wrap');
  const countEl = document.getElementById('ons-count');
  if (!wrap) return;

  const filtered = _onsFilter(data);

  if (!filtered.length) {
    wrap.innerHTML = `<div style="padding:20px 12px"><p style="font-family:var(--font-mono);color:var(--text-muted);font-size:.75rem">Sin ONs para los filtros seleccionados.</p></div>`;
    if (countEl) countEl.textContent = '';
    return;
  }

  if (countEl) countEl.textContent = filtered.length + ' instrumentos';

  const fmtPct  = (v, sign=false) => v == null ? '—' : (sign && v > 0 ? '+' : '') + v.toFixed(2).replace('.', ',') + '%';
  const fmtUSD  = v => v == null ? '—' : '$ ' + Number(v).toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2});
  const fmtARS  = v => v == null ? '—' : '$ ' + Number(v).toLocaleString('es-AR', {minimumFractionDigits:0, maximumFractionDigits:0});
  const fmtDur  = v => v == null ? '—' : v.toFixed(2).replace('.', ',');
  const fmtDate = s => { if (!s) return '—'; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; };
  const fmtDias = v => v == null ? '—' : v.toString();

  const tirCls  = v => v == null ? '' : v >= 9 ? 'color:#22c55e;font-weight:700' : v >= 5 ? 'color:#84cc16;font-weight:700' : v >= 2 ? 'color:#f97316;font-weight:700' : v < 0 ? 'color:#ef4444;font-weight:700' : 'color:#94a3b8;font-weight:700';
  const varCls  = v => v == null ? 'bt2-sub' : v > 0.01 ? 'bt2-pos' : v < -0.01 ? 'bt2-neg' : 'bt2-sub';
  const legBadge = l => l === 'NY'
    ? '<span style="background:#1e3a5f;color:#9ecae1;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:700">NY</span>'
    : '<span style="background:#3b2a0d;color:#f28e2b;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:700">AR</span>';

  const headers = `<tr>
    <th style="text-align:left;white-space:nowrap">TICKER</th>
    <th style="white-space:nowrap">VENC.</th>
    <th style="white-space:nowrap">DÍAS</th>
    <th style="white-space:nowrap">P. USD</th>
    <th style="white-space:nowrap">P. ARS</th>
    <th class="cer-th-hl" style="white-space:nowrap">TIR USD</th>
    <th style="white-space:nowrap">DUR.</th>
    <th style="white-space:nowrap">MOD.DUR</th>
    <th style="white-space:nowrap">CUPÓN</th>
    <th style="white-space:nowrap">PRÓX.PAGO</th>
    <th style="white-space:nowrap">% DÍA</th>
    <th style="white-space:nowrap">LEY</th>
  </tr>`;

  const rows = filtered.map(d => `
    <tr class="bt2-row">
      <td class="bt2-td-ticker" style="color:#f97316;font-weight:700;cursor:pointer"
          onclick="_openOnsDetail('${d.ticker}')"
          title="Ver detalle">${d.ticker}</td>
      <td class="bt2-td-num" style="font-size:.72rem;color:#64748b">${fmtDate(d.maturity)}</td>
      <td class="bt2-td-num" style="color:#64748b">${fmtDias(d.dias_vencimiento)}</td>
      <td class="bt2-td-num">${fmtUSD(d.price_usd)}</td>
      <td class="bt2-td-num" style="color:#64748b">${fmtARS(d.price_ars)}</td>
      <td class="bt2-td-num" style="${tirCls(d.ytm)}">${fmtPct(d.ytm)}</td>
      <td class="bt2-td-num bt2-sub">${fmtDur(d.duration)}</td>
      <td class="bt2-td-num bt2-sub">${fmtDur(d.modified_duration)}</td>
      <td class="bt2-td-num bt2-sub">${fmtPct(d.cupon)}</td>
      <td class="bt2-td-num" style="font-size:.72rem;color:#64748b">${fmtDate(d.next_coupon)}</td>
      <td class="bt2-td-num ${varCls(d.pct_change)}">${fmtPct(d.pct_change, true)}</td>
      <td class="bt2-td-num">${legBadge(d.legislacion)}</td>
    </tr>`).join('');

  wrap.innerHTML = `<table class="bt2-table" style="min-width:640px"><thead>${headers}</thead><tbody>${rows}</tbody></table>`;
}

// ── Chart TIR vs Duration ─────────────────────────────────────────────────
function _onsRenderChart(data) {
  const el = document.getElementById('ons-chart');
  if (!el) return;

  const filtered = _onsFilter(data).filter(d => d.ytm != null && d.duration != null && d.duration > 0);

  if (!filtered.length) {
    dcfCharts?.disposeChart?.('ons-chart');
    el.style.height = '';
    el.innerHTML = `<p style="padding:20px;font-family:var(--font-mono);color:var(--text-muted);font-size:.78rem;text-align:center">Sin datos para graficar</p>`;
    return;
  }

  const xVals = filtered.map(d => d.duration);
  const yVals = filtered.map(d => d.ytm);
  const xPad  = Math.max((Math.max(...xVals) - Math.min(...xVals)) * 0.12, 0.3);
  const yPad  = Math.max((Math.max(...yVals) - Math.min(...yVals)) * 0.18, 1.0);
  const mono  = "'JetBrains Mono',monospace";

  const existing = echarts.getInstanceByDom(el);
  if (existing) existing.dispose();
  el.style.height = '430px';
  const chart = echarts.init(el, 'dcf');

  // Trendline quadratic
  const trend = filtered.length >= 3 ? _quadReg(filtered.map(d => [d.duration, d.ytm])) : null;

  chart.setOption({
    tooltip: {
      trigger: 'item',
      backgroundColor: '#0d1424',
      borderColor: 'rgba(255,255,255,0.12)',
      borderWidth: 1,
      padding: [10, 14],
      formatter: (p) => {
        if (p.seriesType === 'line') return '';
        const d = filtered[p.dataIndex];
        if (!d) return '';
        const row = (l, v) => `<div style="display:flex;justify-content:space-between;gap:14px;margin-top:2px"><span style="color:#7a8fa6">${l}</span><span>${v}</span></div>`;
        const fmtP = v => v != null ? '$ ' + Number(v).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—';
        const fmtD = s => { if (!s) return '—'; const [y,m,dd] = s.split('-'); return `${dd}/${m}/${y}`; };
        let h = `<div style="font-family:${mono};font-size:11.5px;min-width:180px">`;
        h += `<div style="font-size:13px;font-weight:700;margin-bottom:6px;color:#f97316">${d.ticker}</div>`;
        h += row('TIR USD',   `<span style="color:${d.ytm >= 5 ? '#22c55e' : '#f97316'}">${d.ytm != null ? d.ytm.toFixed(2).replace('.', ',') + '%' : '—'}</span>`);
        h += row('Duration',  d.duration != null ? d.duration.toFixed(2).replace('.', ',') + ' a' : '—');
        h += row('Mod. Dur.', d.modified_duration != null ? d.modified_duration.toFixed(2).replace('.', ',') : '—');
        h += row('P. USD',    fmtP(d.price_usd));
        h += row('Cupón',     d.cupon != null ? d.cupon.toFixed(2).replace('.', ',') + '%' : '—');
        h += row('Venc.',     fmtD(d.maturity));
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
        data: filtered.map(d => [d.duration, d.ytm]),
        symbolSize: 10,
        clip: false,
        itemStyle: {
          color: (params) => filtered[params.dataIndex]?.legislacion === 'NY' ? 'transparent' : 'transparent',
          borderColor: (params) => filtered[params.dataIndex]?.legislacion === 'NY' ? '#9ecae1' : '#f28e2b',
          borderWidth: 2,
        },
        label: {
          show: true, fontFamily: mono, fontSize: 9, fontWeight: 700,
          color: (params) => filtered[params.dataIndex]?.legislacion === 'NY' ? '#9ecae1' : '#f28e2b',
          textBorderColor: 'rgba(8,17,28,0.9)', textBorderWidth: 2,
          formatter: p => filtered[p.dataIndex]?.ticker || '',
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

// ── Modal de detalle por ticker ────────────────────────────────────────────
function _openOnsDetail(ticker) {
  const d = _onsPageData.find(x => x.ticker === ticker);
  if (!d) return;

  const old = document.getElementById('ons-detail-overlay');
  if (old) old.remove();

  const fT  = v => v != null ? (v >= 0 ? '+' : '') + v.toFixed(2).replace('.', ',') + '%' : 'N/D';
  const fU  = v => v != null ? '$ ' + Number(v).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}) : 'N/D';
  const fA  = v => v != null ? '$ ' + Number(v).toLocaleString('es-AR',{minimumFractionDigits:0,maximumFractionDigits:0}) : 'N/D';
  const fDu = v => v != null ? v.toFixed(2).replace('.', ',') : 'N/D';
  const fDa = s => { if (!s) return 'N/D'; const [y,m,dd] = s.split('-'); return `${dd}/${m}/${y}`; };
  const tirColor = d.ytm == null ? '' : d.ytm >= 5 ? 'color:#22c55e' : d.ytm < 0 ? 'color:#ef4444' : 'color:#f97316';
  const mi = (label, val, style = '') =>
    `<div class="bcc-meta-item"><span class="bcc-meta-label">${label}</span><span class="bcc-meta-val" style="${style}">${val}</span></div>`;

  const dias = d.dias_vencimiento;
  const legBadge = d.legislacion === 'NY'
    ? '<span style="background:#1e3a5f;color:#9ecae1;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700">Ley New York</span>'
    : '<span style="background:#3b2a0d;color:#f28e2b;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700">Ley Argentina</span>';

  // Interpretación automática
  const nivelTIR  = d.ytm >= 9 ? 'alta' : d.ytm >= 5 ? 'moderada' : d.ytm >= 2 ? 'baja' : 'muy baja o negativa';
  const sensDur   = d.duration == null ? '' : d.duration < 1 ? 'baja sensibilidad a cambios de tasa' : d.duration < 2.5 ? 'sensibilidad moderada' : 'sensibilidad alta';

  const el = document.createElement('div');
  el.id = 'ons-detail-overlay';
  el.className = 'bcc-overlay';
  el.innerHTML = `
    <div class="bcc-modal" style="max-width:560px">
      <div class="bcc-header">
        <div>
          <span class="bcc-title" style="color:#f97316">${d.ticker}</span>
          <span style="margin-left:8px">${legBadge}</span>
        </div>
        <button class="bcc-close" onclick="document.getElementById('ons-detail-overlay').remove()">✕</button>
      </div>
      <div class="bcc-body">

        <!-- Datos de mercado -->
        <div class="bcc-meta">
          ${mi('PRECIO USD',     fU(d.price_usd),      '')}
          ${mi('PRECIO ARS',     fA(d.price_ars),      'color:#64748b')}
          ${mi('MEP USADO',      '$ ' + (d.mep?.toLocaleString('es-AR',{minimumFractionDigits:0}) || '—'), 'color:#64748b')}
          ${mi('TIR USD',        fT(d.ytm),             tirColor + ';font-weight:700')}
          ${mi('DURATION',       fDu(d.duration) + ' años', '')}
          ${mi('MOD. DURATION',  fDu(d.modified_duration), '')}
          ${mi('CUPÓN',          fT(d.cupon),           '')}
          ${mi('VENCIMIENTO',    fDa(d.maturity),       '')}
          ${mi('DÍAS AL VENC.',  dias != null ? dias.toString() : 'N/D', '')}
          ${mi('PRÓX. CUPÓN',    fDa(d.next_coupon),    '')}
          ${d.pct_change != null ? mi('% DÍA', fT(d.pct_change), d.pct_change >= 0 ? 'color:#22c55e' : 'color:#ef4444') : ''}
        </div>

        <!-- Interpretación -->
        <div class="bcc-card">
          <div class="bcc-card-title">INTERPRETACIÓN</div>
          <div class="bcc-card-body">
            <p class="bcc-note" style="line-height:1.8">
              La ON <b>${d.ticker}</b> presenta una TIR estimada en USD de
              <span style="${tirColor};font-weight:700">${fT(d.ytm)}</span> (nivel ${nivelTIR}).
              ${d.duration != null ? `Con duration de <b>${fDu(d.duration)} años</b> implica ${sensDur} ante variaciones en tasas de descuento.` : ''}
              ${d.next_coupon ? `El próximo flujo de fondos ocurre el <b>${fDa(d.next_coupon)}</b>.` : ''}
              ${dias != null && dias <= 90 ? `<br><span style="color:#fbbf24">⚠ Vencimiento en ${dias} días.</span>` : ''}
            </p>
            <p class="bcc-note" style="margin-top:8px;color:var(--bt2-sub);font-size:.62rem">
              TIR calculada en USD sobre precio ARS / MEP (${d.mep != null ? '$ ' + d.mep.toLocaleString('es-AR',{minimumFractionDigits:0}) : '—'}).
              Convención 30/360. Fuente cashflows: BD ONs.xlsx. Precios: data912 / IOL.
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

function _onsSkeleton(n) {
  return Array.from({ length: n }, () =>
    `<div class="skeleton skeleton-table-row" style="margin:2px 12px"></div>`
  ).join('');
}
