/* ─── DCF ECharts Theme + helpers ────────────────────────────────────────── */
/* Requires ECharts 5 loaded via CDN                                          */

const DCF_THEME = {
  backgroundColor: 'transparent',
  textStyle: { fontFamily: "'Inter', sans-serif", color: '#94a3b8', fontSize: 12 },
  title: { textStyle: { color: '#f1f5f9', fontSize: 14, fontWeight: 700 } },
  legend: {
    textStyle: { color: '#94a3b8', fontSize: 11 },
    pageTextStyle: { color: '#94a3b8' },
  },
  tooltip: {
    backgroundColor: '#0d1424',
    borderColor: 'rgba(148,163,184,0.20)',
    borderWidth: 1,
    textStyle: { color: '#f1f5f9', fontSize: 12, fontFamily: "'Inter', sans-serif" },
    axisPointer: {
      lineStyle: { color: 'rgba(148,163,184,0.3)', type: 'dashed' },
      crossStyle: { color: 'rgba(148,163,184,0.3)' },
    },
  },
  toolbox: {
    iconStyle: { borderColor: '#475569' },
    emphasis: { iconStyle: { borderColor: '#94a3b8' } },
  },
  grid: {
    left: '12px', right: '12px', top: '40px', bottom: '12px',
    containLabel: true,
  },
  xAxis: {
    axisLine:  { lineStyle: { color: 'rgba(148,163,184,0.12)' } },
    axisTick:  { lineStyle: { color: 'rgba(148,163,184,0.12)' } },
    axisLabel: { color: '#64748b', fontSize: 11 },
    splitLine: { lineStyle: { color: 'rgba(148,163,184,0.06)', type: 'dashed' } },
  },
  yAxis: {
    axisLine:  { show: false },
    axisTick:  { show: false },
    axisLabel: { color: '#64748b', fontSize: 11 },
    splitLine: { lineStyle: { color: 'rgba(148,163,184,0.06)', type: 'dashed' } },
  },
  color: ['#38bdf8', '#a78bfa', '#34d399', '#f97316', '#fbbf24', '#f472b6', '#22c55e', '#ef4444'],
};

// Register theme
if (typeof echarts !== 'undefined') {
  echarts.registerTheme('dcf', DCF_THEME);
}

// ── Color helpers ─────────────────────────────────────────────────────────

const COLORS = {
  accent:  '#f97316',
  sky:     '#38bdf8',
  violet:  '#a78bfa',
  emerald: '#34d399',
  amber:   '#fbbf24',
  positive: '#22c55e',
  negative: '#ef4444',
  muted:   '#64748b',
};

const TREEMAP_COLORSCALE = [
  [0,    '#991b1b'],
  [0.35, '#dc2626'],
  [0.5,  '#1f2937'],
  [0.65, '#16a34a'],
  [1,    '#15803d'],
];

function pctToColor(pct) {
  if (pct === null || pct === undefined) return COLORS.muted;
  if (pct > 1)  return COLORS.positive;
  if (pct < -1) return COLORS.negative;
  return '#64748b';
}

// ── Safe number formatter (no dependency on components.js) ────────────────

function _n(v, d = 2) {
  if (v == null) return '';
  return Number(v).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ── Chart factory ─────────────────────────────────────────────────────────

function initChart(domId, height = 300) {
  const el = document.getElementById(domId);
  if (!el) return null;
  // Dispose existing instance to avoid double-init errors
  const existing = echarts.getInstanceByDom(el);
  if (existing) existing.dispose();
  el.style.height = height + 'px';
  return echarts.init(el, 'dcf');
}

function disposeChart(domId) {
  const el = document.getElementById(domId);
  if (el) {
    const existing = echarts.getInstanceByDom(el);
    if (existing) existing.dispose();
  }
}

// ── Treemap ───────────────────────────────────────────────────────────────

/**
 * renderTreemap — two visual modes:
 *
 * bondStyle=false (default, equities):
 *   Cell background = colored by pct. Ticker bold white on color.
 *   Like FinViz / Bloomberg equity heatmaps.
 *
 * bondStyle=true (bonds):
 *   Cell background = fixed dark navy. Color is in the TEXT of % change.
 *   Ticker large bold, price, % colored text, extra (TIR) in cyan.
 *   Like bondterminal.com.
 */
function renderTreemap(domId, data, {
  height = 400,
  labelKey = 'ticker',
  valueKey = 'pct_change',
  priceKey = 'price',
  sizeKey = null,        // if set, use this field for cell size (e.g. 'dollar_vol')
  extraKey = null,
  extraLabel = '',
  groupKey = null,
  periodLabel = '1D',
  bondStyle = false,
} = {}) {
  const chart = initChart(domId, height);
  if (!chart) return;

  const treeData = bondStyle
    ? (groupKey
        ? _groupedBondTreemap(data, groupKey, labelKey, valueKey, priceKey, extraKey)
        : _flatBondTreemap(data, labelKey, valueKey, priceKey, extraKey))
    : (groupKey
        ? _groupedTreemap(data, groupKey, labelKey, valueKey, priceKey, extraKey, sizeKey)
        : _flatTreemap(data, labelKey, valueKey, priceKey, extraKey, sizeKey));

  const mono = "'JetBrains Mono',monospace";

  // ── Shared tooltip ────────────────────────────────────────────────────────
  const tooltipFormatter = (info) => {
    if (!info.data || info.data.children) return `<b>${info.name}</b>`;
    const d = info.data;
    const pct   = d.pct;
    const pct1d = d.pct1d;
    const price = d.price;
    const extra = d.extra;
    const sign = v => v >= 0 ? '+' : '';
    const col  = v => v >= 0 ? '#22c55e' : '#ef4444';
    let html = `<div style="font-family:${mono};font-size:12px;min-width:150px">`;
    html += `<div style="font-size:14px;font-weight:700;margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:6px">${info.name}</div>`;
    if (price != null)
      html += `<div style="display:flex;justify-content:space-between;gap:20px;margin-bottom:3px"><span style="color:#7a8fa6">Precio</span><span style="font-weight:600">${_n(price)}</span></div>`;
    if (pct != null)
      html += `<div style="display:flex;justify-content:space-between;gap:20px;margin-bottom:3px"><span style="color:#7a8fa6">${periodLabel}</span><span style="color:${col(pct)};font-weight:600">${sign(pct)}${pct.toFixed(2)}%</span></div>`;
    if (pct1d != null && periodLabel !== '1D')
      html += `<div style="display:flex;justify-content:space-between;gap:20px;margin-bottom:3px"><span style="color:#7a8fa6">1D</span><span style="color:${col(pct1d)};font-weight:600">${sign(pct1d)}${pct1d.toFixed(2)}%</span></div>`;
    if (extra != null)
      html += `<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#7a8fa6">${extraLabel || 'YTM'}</span><span style="color:#22d3ee;font-weight:600">${typeof extra === 'number' ? extra.toFixed(2) + '%' : extra}</span></div>`;
    html += '</div>';
    return html;
  };

  // ── Label formatters ──────────────────────────────────────────────────────

  // Equity style: white text on colored background
  // Adaptive content: big cells show ticker+price+%, small cells show ticker+% only
  const equityLabel = {
    show: true,
    fontFamily: mono,
    overflow: 'truncate',
    formatter: (p) => {
      if (!p.data || p.data.children) return p.name;
      const d = p.data;
      const pct    = d.pct;
      const price  = d.price;
      const sign   = pct !== null && pct >= 0 ? '+' : '';
      const pctStr = pct !== null ? `${sign}${pct.toFixed(2)}%` : '';
      // Show price only if cell is large enough (value proxy: size > 5% of total or price available)
      const priceStr = price != null ? `$${_n(price)}` : null;
      if (priceStr) return `{tk|${p.name}}\n{px|${priceStr}}\n{pct|${pctStr}}`;
      return `{tk|${p.name}}\n{pct|${pctStr}}`;
    },
    rich: {
      tk:  { fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.97)', fontFamily: mono, lineHeight: 17 },
      px:  { fontSize: 9,  fontWeight: 400, color: 'rgba(255,255,255,0.70)', fontFamily: mono, lineHeight: 13 },
      pct: { fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.95)', fontFamily: mono, lineHeight: 14 },
    },
  };

  // Bond style: larger ticker, colored % text, cyan YTM on dark background
  const bondLabel = {
    show: true,
    fontFamily: mono,
    formatter: (p) => {
      if (!p.data || p.data.children) return p.name;
      const d = p.data;
      const pct    = d.pct;
      const price  = d.price;
      const extra  = d.extra;
      const sign   = pct !== null && pct >= 0 ? '+' : '';
      const pctKey = pct !== null ? (pct >= 0 ? 'pctPos' : 'pctNeg') : 'pctNeu';
      const pctStr = pct !== null ? `${sign}${pct.toFixed(2)}%` : '—';
      const exStr  = extra != null ? `${typeof extra === 'number' ? extra.toFixed(2) + '% TIR' : extra}` : '';
      if (extra != null && price != null)
        return `{tk|${p.name}}\n{px|${_n(price)}}\n{${pctKey}|${pctStr}}\n{ex|${exStr}}`;
      if (price != null)
        return `{tk|${p.name}}\n{px|${_n(price)}}\n{${pctKey}|${pctStr}}`;
      return `{tk|${p.name}}\n{${pctKey}|${pctStr}}`;
    },
    rich: {
      tk:     { fontSize: 13, fontWeight: 700, color: '#e8edf5', fontFamily: mono, lineHeight: 20 },
      px:     { fontSize: 10, fontWeight: 400, color: 'rgba(232,237,245,0.65)', fontFamily: mono, lineHeight: 15 },
      pctPos: { fontSize: 11, fontWeight: 600, color: '#22c55e', fontFamily: mono, lineHeight: 15 },
      pctNeg: { fontSize: 11, fontWeight: 600, color: '#fb7185', fontFamily: mono, lineHeight: 15 },
      pctNeu: { fontSize: 11, fontWeight: 400, color: 'rgba(232,237,245,0.4)', fontFamily: mono, lineHeight: 15 },
      ex:     { fontSize: 10, fontWeight: 600, color: '#22d3ee', fontFamily: mono, lineHeight: 14 },
    },
  };

  const option = {
    tooltip: {
      formatter: tooltipFormatter,
      backgroundColor: '#0d1424',
      borderColor: 'rgba(255,255,255,0.12)',
      borderWidth: 1,
      padding: 12,
    },
    series: [{
      type: 'treemap',
      data: treeData,
      width: '100%',
      height: '100%',
      roam: false,
      leafDepth: groupKey ? 2 : 1,
      label: bondStyle ? bondLabel : equityLabel,
      upperLabel: {
        show: !!groupKey,
        height: 20,
        color: 'rgba(148,163,184,0.8)',
        fontSize: 9,
        fontWeight: 700,
        textBorderColor: 'transparent',
        fontFamily: mono,
      },
      visibleMin: 800,       // hide cells too small to read (area in px²)
      itemStyle: { gapWidth: 1, borderWidth: 0 },
      breadcrumb: { show: false },
      levels: groupKey ? [
        {
          // Sector header: dark navy bg matching page theme, white text
          upperLabel: {
            show: true,
            height: 20,
            color: '#94a3b8',
            fontSize: 9,
            fontWeight: 700,
            fontFamily: mono,
            textBorderColor: 'transparent',
            textTransform: 'uppercase',
          },
          itemStyle: {
            color: '#0d1424',          // dark navy — matches --bg-surface
            borderColor: '#0d1424',
            borderWidth: 2,
            gapWidth: 2,
          },
        },
        { itemStyle: { gapWidth: 1, borderColor: '#0d1424', borderWidth: 1 } },
      ] : [{ itemStyle: { gapWidth: 1 } }],
    }],
  };

  chart.setOption(option);
  _autoResize(chart);
}

// ── Bond-style flat/grouped treemap (dark cells) ──────────────────────────

// Fixed dark background color based on direction (very subtle)
function _bondCellColor(pct) {
  if (pct == null) return '#0f1c2e';
  if (pct >  0.5) return '#0f2318';   // dark green tint
  if (pct >  0.05) return '#0d1d14';  // very subtle green
  if (pct > -0.05) return '#111d2e';  // neutral navy
  if (pct > -0.5) return '#1e1020';   // very subtle rose
  return '#1e0e14';                    // dark rose tint
}

function _flatBondTreemap(data, labelKey, valueKey, priceKey, extraKey) {
  return data.map(d => {
    const pct   = d[valueKey] ?? 0;
    const price = d[priceKey] ?? null;
    const extra = extraKey ? (d[extraKey] ?? null) : null;
    const pct1d = d.pct_1d ?? null;
    const vol = d.volume || d.ars_volume || 1;
    return {
      name: d[labelKey],
      value: vol > 1 ? Math.log(vol + 1) : 1,
      pct, price, extra, pct1d,
      duration: d.duration ?? null,
      volume: vol,
      itemStyle: { color: _bondCellColor(pct) },
    };
  });
}

function _groupedBondTreemap(data, groupKey, labelKey, valueKey, priceKey, extraKey) {
  const groups = {};
  for (const d of data) {
    const g = d[groupKey] || 'Other';
    if (!groups[g]) groups[g] = [];
    groups[g].push(d);
  }
  return Object.entries(groups).map(([group, items]) => ({
    name: group,
    value: items.length,
    children: _flatBondTreemap(items, labelKey, valueKey, priceKey, extraKey),
  }));
}

// ── Equity-style flat/grouped treemap (colored cells) ──────────────────────

function _flatTreemap(data, labelKey, valueKey, priceKey, extraKey, sizeKey) {
  return data.map(d => {
    const pct   = d[valueKey] ?? 0;
    const price = d[priceKey] ?? null;
    const extra = extraKey ? (d[extraKey] ?? null) : null;
    const pct1d = d.pct_1d ?? null;
    let size;
    if (sizeKey) {
      const raw = Math.abs(d[sizeKey] ?? 0) || 1;
      // Square-root scale: preserves relative importance (AAPL > OTIS)
      // while preventing mega-caps from taking 80% of the treemap.
      // log10 was too compressed; linear was too extreme.
      size = Math.sqrt(raw);
    } else {
      size = Math.abs(pct) || 0.01;
    }
    return {
      name: d[labelKey],
      value: size,
      pct, price, extra, pct1d,
      itemStyle: { color: _treemapColor(pct) },
    };
  });
}

function _groupedTreemap(data, groupKey, labelKey, valueKey, priceKey, extraKey, sizeKey) {
  const groups = {};
  for (const d of data) {
    const g = d[groupKey] || 'Other';
    if (!groups[g]) groups[g] = [];
    groups[g].push(d);
  }
  return Object.entries(groups).map(([group, items]) => {
    const ch = _flatTreemap(items, labelKey, valueKey, priceKey, extraKey, sizeKey);
    return {
    name: group,
    value: ch.reduce((s, c) => s + c.value, 0),
    children: ch,
    };
  });
}

// Bondterminal-inspired color scale: soft gradient rose↔gray↔green
function _treemapColor(pct) {
  if (pct == null) return '#1e2d40';
  if (pct >=  3)   return '#166534';   // deep green
  if (pct >=  1.5) return '#16a34a';   // strong green
  if (pct >=  0.5) return '#22c55e';   // medium green
  if (pct >=  0.1) return '#4ade80';   // light green
  if (pct >  -0.1) return '#334155';   // flat gray
  if (pct >  -0.5) return '#fda4af';   // very light rose
  if (pct >  -1.5) return '#fb7185';   // rose
  if (pct >  -3)   return '#e11d48';   // deep rose
  return '#be123c';                     // crimson
}

// ── Line chart ────────────────────────────────────────────────────────────

function renderLine(domId, series, { height = 280, xLabels = [], yFormatter = null, smooth = true, areaOpacity = 0.08, mini = false } = {}) {
  const chart = initChart(domId, height);
  if (!chart) return;

  const echartseries = series.map(s => ({
    name: s.name,
    type: 'line',
    data: s.data,
    smooth,
    lineStyle: { width: mini ? 1.5 : 2, color: s.color || COLORS.accent },
    itemStyle: { color: s.color || COLORS.accent },
    symbol: 'none',
    areaStyle: s.area ? {
      color: {
        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [
          { offset: 0, color: (s.color || COLORS.accent).replace(')', `, ${mini ? 0.15 : areaOpacity})`).replace('rgb', 'rgba') },
          { offset: 1, color: 'rgba(0,0,0,0)' },
        ],
      },
    } : undefined,
  }));

  if (mini) {
    chart.setOption({
      grid: { left: 0, right: 0, top: 2, bottom: 0 },
      tooltip: { trigger: 'axis', valueFormatter: yFormatter, axisPointer: { lineStyle: { color: 'rgba(148,163,184,0.3)' } } },
      legend: { show: false },
      xAxis: { type: 'category', data: xLabels, boundaryGap: false, show: false },
      yAxis: { type: 'value', show: false, scale: true },
      series: echartseries,
    });
  } else {
    chart.setOption({
      tooltip: { trigger: 'axis', valueFormatter: yFormatter },
      legend: series.length > 1 ? { bottom: 0 } : { show: false },
      xAxis: { type: 'category', data: xLabels, boundaryGap: false },
      yAxis: { type: 'value', axisLabel: { formatter: yFormatter } },
      series: echartseries,
    });
  }

  _autoResize(chart);
}

// ── Linear regression helper ───────────────────────────────────────────────
function _linReg(points) {
  const n = points.length;
  if (n < 2) return null;
  const sx  = points.reduce((s, p) => s + p[0], 0);
  const sy  = points.reduce((s, p) => s + p[1], 0);
  const sxy = points.reduce((s, p) => s + p[0] * p[1], 0);
  const sx2 = points.reduce((s, p) => s + p[0] * p[0], 0);
  const m   = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
  const b   = (sy - m * sx) / n;
  const xs  = points.map(p => p[0]);
  const x0  = Math.min(...xs);
  const x1  = Math.max(...xs);
  // Return 20 interpolated points so callers get consistent array shape
  return Array.from({ length: 20 }, (_, i) => {
    const x = x0 + (x1 - x0) * i / 19;
    return [x, m * x + b];
  });
}

// ── Quadratic regression helper — y = a·x² + b·x + c ─────────────────────
// Falls back to linear if fewer than 3 points.
function _quadReg(points) {
  const n = points.length;
  if (n < 3) return _linReg(points);

  // Accumulate sums for normal equations
  let s0 = n, s1 = 0, s2 = 0, s3 = 0, s4 = 0;
  let t0 = 0, t1 = 0, t2 = 0;
  for (const [x, y] of points) {
    s1 += x;    s2 += x*x;    s3 += x*x*x;  s4 += x*x*x*x;
    t0 += y;    t1 += x*y;    t2 += x*x*y;
  }

  // Normal equations: M · [c, b, a]ᵀ = T
  const M = [[s0,s1,s2],[s1,s2,s3],[s2,s3,s4]];
  const T = [t0, t1, t2];

  // Gaussian elimination with partial pivoting
  for (let col = 0; col < 3; col++) {
    let maxRow = col;
    for (let r = col + 1; r < 3; r++)
      if (Math.abs(M[r][col]) > Math.abs(M[maxRow][col])) maxRow = r;
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    [T[col], T[maxRow]] = [T[maxRow], T[col]];
    if (Math.abs(M[col][col]) < 1e-10) return _linReg(points);
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c < 3; c++) M[r][c] -= f * M[col][c];
      T[r] -= f * T[col];
    }
  }

  const c = T[0] / M[0][0], b = T[1] / M[1][1], a = T[2] / M[2][2];

  // Generate 30 smooth interpolated points
  const xs = points.map(p => p[0]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  return Array.from({ length: 31 }, (_, i) => {
    const x = x0 + (x1 - x0) * i / 30;
    return [x, a*x*x + b*x + c];
  });
}

// ── Scatter BondTerminal style ─────────────────────────────────────────────
function renderScatterBT(domId, series, {
  height = 280, xLabel = 'x', yLabel = 'y',
  yMin = null, yMax = null, yFormatter = null,
  trendLines = false,
} = {}) {
  const chart = initChart(domId, height);
  if (!chart) return;

  const mono = "'JetBrains Mono',monospace";

  chart.setOption({
    tooltip: {
      trigger: 'item',
      backgroundColor: '#0d1424',
      borderColor: 'rgba(255,255,255,0.12)',
      borderWidth: 1,
      padding: [10, 14],
      formatter: (p) => {
        if (!p.value || !p.seriesType || p.seriesType === 'line') return '';
        const [x, y, label, price] = p.value;
        const row = (lbl, val) =>
          `<div style="display:flex;justify-content:space-between;gap:20px;margin-top:3px">` +
          `<span style="color:#7a8fa6">${lbl}</span><span style="font-weight:600">${val}</span></div>`;
        let html = `<div style="font-family:${mono};font-size:11.5px;min-width:160px">`;
        html += `<div style="font-size:13px;font-weight:700;margin-bottom:6px;padding-bottom:5px;border-bottom:1px solid rgba(255,255,255,0.08)">${label || ''}</div>`;
        html += row('Duration (yr)', Number(x).toFixed(2));
        html += row('YTM (%)', Number(y).toFixed(2) + '%');
        if (price != null) html += row('Precio', Number(price).toFixed(2));
        html += '</div>';
        return html;
      },
    },
    // Legend at top — only scatter series (trend lines excluded)
    legend: {
      top: 4,
      right: 8,
      data: series.map(s => s.name),
      textStyle: { color: '#94a3b8', fontFamily: mono, fontSize: 10 },
      itemHeight: 8,
      itemWidth: 14,
      itemGap: 14,
    },
    // Grid: enough bottom room for xAxis name; containLabel handles tick labels
    grid: { left: 8, right: 8, top: 36, bottom: 38, containLabel: true },
    xAxis: {
      type: 'value', name: xLabel,
      nameLocation: 'middle', nameGap: 26,
      nameTextStyle: { color: '#64748b', fontFamily: mono, fontSize: 10 },
      axisLabel: { color: '#64748b', fontFamily: mono, fontSize: 10 },
      axisLine:  { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } },
    },
    yAxis: {
      type: 'value', name: yLabel,
      // 'end' posiciona el nombre en el extremo superior del eje (sin riesgo de clipping lateral)
      nameLocation: 'end', nameGap: 6,
      nameTextStyle: { color: '#64748b', fontFamily: mono, fontSize: 10, align: 'left' },
      axisLabel: { color: '#64748b', fontFamily: mono, fontSize: 10, formatter: yFormatter },
      axisLine:  { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } },
      ...(yMin != null ? { min: yMin } : {}),
      ...(yMax != null ? { max: yMax } : {}),
    },
    series: [
      // Scatter series — price passed as 4th array element for tooltip
      ...series.map(s => ({
        name: s.name,
        type: 'scatter',
        data: s.data.map(p => [p.x, p.y, p.label, p.price ?? null]),
        symbolSize: s.symbolSize || 10,
        itemStyle: {
          color: 'transparent',
          borderColor: s.color || '#f97316',
          borderWidth: 2,
          opacity: 1,
        },
        label: {
          show: true,
          fontFamily: mono,
          fontSize: 9,
          fontWeight: 700,
          color: s.color || '#f97316',
          formatter: p => p.value[2] || '',
          position: 'top',
          distance: 5,
          textBorderColor: 'rgba(8,17,28,0.9)',
          textBorderWidth: 2,
        },
      })),
      // Trend lines — quadratic by default, linear when trendType:'linear'
      ...(trendLines ? series.map(s => {
        const pts = s.data.map(p => [p.x, p.y]);
        const curve = s.trendType === 'linear' ? _linReg(pts) : _quadReg(pts);
        return {
          name: s.name + ' trend',
          type: 'line',
          data: curve || [],
          showSymbol: false,
          lineStyle: { color: s.color, type: 'dashed', width: 1.5, opacity: 0.55 },
          tooltip: { show: false },
          legendHoverLink: false,
          silent: true,
        };
      }) : []),
    ],
  });

  _autoResize(chart);
}

// ── Scatter chart (generic) ───────────────────────────────────────────────

function renderScatter(domId, series, { height = 280, xLabel = 'x', yLabel = 'y', xFormatter = null, yFormatter = null } = {}) {
  const chart = initChart(domId, height);
  if (!chart) return;

  chart.setOption({
    tooltip: {
      formatter: (p) => {
        const [x, y, label] = p.value;
        return `<b>${label || ''}</b><br/>${xLabel}: ${x}<br/>${yLabel}: ${y?.toFixed(2)}`;
      },
    },
    xAxis: { type: 'value', name: xLabel, axisLabel: { formatter: xFormatter } },
    yAxis: { type: 'value', name: yLabel, axisLabel: { formatter: yFormatter } },
    series: series.map(s => ({
      name: s.name,
      type: 'scatter',
      data: s.data.map(p => [p.x, p.y, p.label]),
      symbolSize: s.symbolSize || 8,
      itemStyle: { color: s.color || COLORS.accent, opacity: 0.85 },
      label: {
        show: !!s.showLabels,
        formatter: p => p.value[2] || '',
        fontSize: 9,
        color: '#94a3b8',
        position: 'top',
      },
    })),
  });

  _autoResize(chart);
}

// ── Bar chart ─────────────────────────────────────────────────────────────

function renderBar(domId, categories, series, { height = 240, yFormatter = null, horizontal = false, stack = false } = {}) {
  const chart = initChart(domId, height);
  if (!chart) return;

  const axisType = 'category';
  const valueAxis = { type: 'value', axisLabel: { formatter: yFormatter } };
  const catAxis = { type: axisType, data: categories, axisLabel: { rotate: categories.length > 6 ? 30 : 0, fontSize: 10 } };

  chart.setOption({
    tooltip: { trigger: 'axis', valueFormatter: yFormatter },
    legend: series.length > 1 ? { bottom: 0 } : { show: false },
    xAxis: horizontal ? valueAxis : catAxis,
    yAxis: horizontal ? catAxis : valueAxis,
    series: series.map(s => ({
      name: s.name,
      type: 'bar',
      data: s.data.map(v => ({
        value: v,
        itemStyle: {
          color: v >= 0 ? (s.positiveColor || COLORS.positive) : (s.negativeColor || COLORS.negative),
        },
      })),
      stack: stack ? 'total' : undefined,
      barMaxWidth: 40,
    })),
  });

  _autoResize(chart);
}

// ── Candlestick ───────────────────────────────────────────────────────────

function renderCandlestick(domId, candles, { height = 320 } = {}) {
  const chart = initChart(domId, height);
  if (!chart) return;

  chart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    xAxis: { type: 'category', data: candles.dates, axisLabel: { rotate: 30, fontSize: 10 } },
    yAxis: { type: 'value', scale: true },
    series: [{
      type: 'candlestick',
      data: candles.dates.map((_, i) => [
        candles.opens[i], candles.closes[i], candles.lows[i], candles.highs[i],
      ]),
      itemStyle: {
        color: COLORS.positive,
        color0: COLORS.negative,
        borderColor: COLORS.positive,
        borderColor0: COLORS.negative,
      },
    }],
  });

  _autoResize(chart);
}

// ── Auto resize ───────────────────────────────────────────────────────────

function _autoResize(chart) {
  const ro = new ResizeObserver(() => chart.resize());
  ro.observe(chart.getDom());
}

// ── Exports ───────────────────────────────────────────────────────────────

window.dcfCharts = {
  initChart, disposeChart,
  renderTreemap, renderLine, renderScatter, renderScatterBT, renderBar, renderCandlestick,
  pctToColor, COLORS, TREEMAP_COLORSCALE,
};
