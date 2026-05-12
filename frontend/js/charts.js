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

function renderTreemap(domId, data, {
  height = 400,
  labelKey = 'ticker',
  valueKey = 'pct_change',
  priceKey = 'price',
  extraKey = null,       // e.g. 'tir' for bonds
  extraLabel = '',       // e.g. 'TIR'
  groupKey = null,
  periodLabel = '1D',    // shown in tooltip header
} = {}) {
  const chart = initChart(domId, height);
  if (!chart) return;

  const treeData = groupKey
    ? _groupedTreemap(data, groupKey, labelKey, valueKey, priceKey, extraKey)
    : _flatTreemap(data, labelKey, valueKey, priceKey, extraKey);

  const option = {
    tooltip: {
      formatter: (info) => {
        if (!info.data || info.data.children) return `<b>${info.name}</b>`;
        const d = info.data;
        const pct = d.pct;
        const pct1d = d.pct1d;
        const price = d.price;
        const extra = d.extra;
        const sign = v => v >= 0 ? '+' : '';
        const col  = v => v >= 0 ? '#22c55e' : '#ef4444';
        const mono = "font-family:'JetBrains Mono',monospace";

        let html = `<div style="${mono};font-size:12px;min-width:140px">`;
        html += `<div style="font-size:13px;font-weight:700;margin-bottom:6px">${info.name}</div>`;
        if (price != null)
          html += `<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:#7a8fa6">Precio</span><span>${_n(price)}</span></div>`;
        if (pct != null)
          html += `<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:#7a8fa6">${periodLabel}</span><span style="color:${col(pct)}">${sign(pct)}${pct.toFixed(2)}%</span></div>`;
        if (pct1d != null && periodLabel !== '1D')
          html += `<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:#7a8fa6">1D</span><span style="color:${col(pct1d)}">${sign(pct1d)}${pct1d.toFixed(2)}%</span></div>`;
        if (extra != null)
          html += `<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:#7a8fa6">${extraLabel || 'Extra'}</span><span style="color:#f97316">${typeof extra === 'number' ? extra.toFixed(2) + '%' : extra}</span></div>`;
        html += '</div>';
        return html;
      },
      backgroundColor: '#0d1424',
      borderColor: 'rgba(255,255,255,0.12)',
      borderWidth: 1,
      padding: 10,
    },
    series: [{
      type: 'treemap',
      data: treeData,
      width: '100%',
      height: '100%',
      roam: false,
      leafDepth: groupKey ? 2 : 1,
      label: {
        show: true,
        fontFamily: "'JetBrains Mono', monospace",
        formatter: (p) => {
          if (!p.data || p.data.children) return p.name;
          const d = p.data;
          const pct   = d.pct;
          const price = d.price;
          const extra = d.extra;
          const sign  = pct !== null && pct >= 0 ? '+' : '';
          const pctStr = pct !== null ? `${sign}${pct.toFixed(2)}%` : '';
          // Use _n() — local formatter, no external dependency
          if (extra != null) {
            return `{tk|${p.name}}\n{px|${price ? _n(price) : ''}}\n{pct|${pctStr}}\n{ex|${typeof extra === 'number' ? extra.toFixed(2) + '%' : extra}}`;
          }
          if (price != null) {
            return `{tk|${p.name}}\n{px|${_n(price)}}\n{pct|${pctStr}}`;
          }
          return `{tk|${p.name}}\n{pct|${pctStr}}`;
        },
        rich: {
          tk:  { fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.95)', fontFamily: "'JetBrains Mono',monospace", lineHeight: 16 },
          px:  { fontSize: 9,  fontWeight: 400, color: 'rgba(255,255,255,0.65)', fontFamily: "'JetBrains Mono',monospace", lineHeight: 13 },
          pct: { fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.90)', fontFamily: "'JetBrains Mono',monospace", lineHeight: 14 },
          ex:  { fontSize: 9,  fontWeight: 600, color: '#f97316',                fontFamily: "'JetBrains Mono',monospace", lineHeight: 13 },
        },
      },
      upperLabel: {
        show: !!groupKey,
        height: 18,
        color: 'rgba(148,163,184,0.75)',
        fontSize: 9,
        fontWeight: 700,
        textBorderColor: 'transparent',
        fontFamily: "'JetBrains Mono',monospace",
      },
      itemStyle: { gapWidth: 2, borderWidth: 0 },
      breadcrumb: { show: false },
      levels: groupKey ? [
        { itemStyle: { gapWidth: 3, borderColor: '#060b17', borderWidth: 1 } },
        { itemStyle: { gapWidth: 1 } },
      ] : [{ itemStyle: { gapWidth: 1 } }],
    }],
  };

  chart.setOption(option);
  _autoResize(chart);
}

function _flatTreemap(data, labelKey, valueKey, priceKey, extraKey) {
  return data.map(d => {
    const pct   = d[valueKey] ?? 0;
    const price = d[priceKey] ?? null;
    const extra = extraKey ? (d[extraKey] ?? null) : null;
    const pct1d = d.pct_1d ?? null;
    return {
      name: d[labelKey],
      value: Math.abs(pct) || 0.01,
      pct, price, extra, pct1d,
      itemStyle: { color: _treemapColor(pct) },
    };
  });
}

function _groupedTreemap(data, groupKey, labelKey, valueKey, priceKey, extraKey) {
  const groups = {};
  for (const d of data) {
    const g = d[groupKey] || 'Other';
    if (!groups[g]) groups[g] = [];
    groups[g].push(d);
  }
  return Object.entries(groups).map(([group, items]) => ({
    name: group,
    value: items.reduce((s, d) => s + Math.abs(d[valueKey] ?? 0), 0),
    children: _flatTreemap(items, labelKey, valueKey, priceKey, extraKey),
  }));
}

function _treemapColor(pct) {
  if (pct > 3)  return '#15803d';
  if (pct > 1)  return '#16a34a';
  if (pct > 0.3) return '#1f6b2f';
  if (pct > -0.3) return '#1f2937';
  if (pct > -1) return '#7f1d1d';
  if (pct > -3) return '#dc2626';
  return '#991b1b';
}

// ── Line chart ────────────────────────────────────────────────────────────

function renderLine(domId, series, { height = 280, xLabels = [], yFormatter = null, smooth = true, areaOpacity = 0.08 } = {}) {
  const chart = initChart(domId, height);
  if (!chart) return;

  const echartseries = series.map(s => ({
    name: s.name,
    type: 'line',
    data: s.data,
    smooth,
    lineStyle: { width: 2, color: s.color || COLORS.accent },
    itemStyle: { color: s.color || COLORS.accent },
    symbol: 'none',
    areaStyle: s.area ? {
      color: {
        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [
          { offset: 0, color: (s.color || COLORS.accent).replace(')', `, ${areaOpacity})`).replace('rgb', 'rgba') },
          { offset: 1, color: 'rgba(0,0,0,0)' },
        ],
      },
    } : undefined,
  }));

  chart.setOption({
    tooltip: {
      trigger: 'axis',
      valueFormatter: yFormatter,
    },
    legend: series.length > 1 ? { bottom: 0 } : { show: false },
    xAxis: { type: 'category', data: xLabels, boundaryGap: false },
    yAxis: { type: 'value', axisLabel: { formatter: yFormatter } },
    series: echartseries,
  });

  _autoResize(chart);
}

// ── Scatter chart ─────────────────────────────────────────────────────────

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
  renderTreemap, renderLine, renderScatter, renderBar, renderCandlestick,
  pctToColor, COLORS, TREEMAP_COLORSCALE,
};
