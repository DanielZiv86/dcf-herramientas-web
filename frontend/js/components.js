/* ─── DCF Reusable UI Components ─────────────────────────────────────────── */

// ── Formatting helpers ────────────────────────────────────────────────────

const fmt = {
  num: (v, decimals = 2) => {
    if (v === null || v === undefined) return '—';
    return Number(v).toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  },
  pct: (v, decimals = 2) => {
    if (v === null || v === undefined) return '—';
    const sign = v >= 0 ? '+' : '';
    return `${sign}${Number(v).toFixed(decimals)}%`;
  },
  pctNoSign: (v, decimals = 2) => {
    if (v === null || v === undefined) return '—';
    return `${Number(v).toFixed(decimals)}%`;
  },
  usd: (v, decimals = 2) => {
    if (v === null || v === undefined) return '—';
    return `$${fmt.num(v, decimals)}`;
  },
  ars: (v, decimals = 0) => {
    if (v === null || v === undefined) return '—';
    return `$${fmt.num(v, decimals)}`;
  },
  compact: (v) => {
    if (v === null || v === undefined) return '—';
    const abs = Math.abs(v);
    if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
    return String(v);
  },
  date: (s) => {
    if (!s) return '—';
    const [y, m, d] = String(s).split('-');
    return `${d}/${m}/${y}`;
  },
};

window.fmt = fmt;

// ── KPI Card ──────────────────────────────────────────────────────────────

function kpiCard({ label, value, delta, suffix = '', prefix = '', deltaClass = null }) {
  let deltaHtml = '';
  if (delta !== null && delta !== undefined) {
    const cls = deltaClass || (delta >= 0 ? 'positive' : 'negative');
    const sign = delta >= 0 ? '▲' : '▼';
    deltaHtml = `<div class="kpi-delta ${cls}">${sign} ${Math.abs(delta).toFixed(2)}${suffix}</div>`;
  }
  return `
    <div class="kpi-card">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${prefix}${value !== null && value !== undefined ? value : '—'}</div>
      ${deltaHtml}
    </div>`;
}

// ── Section Label ─────────────────────────────────────────────────────────

function sectionLabel(text) {
  return `
    <div class="section-label">
      <span class="section-label-text">${text}</span>
      <div class="section-label-line"></div>
    </div>`;
}

// ── Pills ─────────────────────────────────────────────────────────────────

function pills(options, activeIndex, onChange, extraClass = '') {
  const el = document.createElement('div');
  el.className = `pills ${extraClass}`;
  options.forEach((label, i) => {
    const btn = document.createElement('button');
    btn.className = `pill-btn${i === activeIndex ? ' active' : ''}`;
    btn.textContent = label;
    btn.onclick = () => {
      el.querySelectorAll('.pill-btn').forEach((b, j) => b.classList.toggle('active', j === i));
      onChange(i, label);
    };
    el.appendChild(btn);
  });
  return el;
}

// ── Bond Terminal Table ───────────────────────────────────────────────────

function btTable(headers, rows, {
  maxHeight = null,
  stickyHeader = true,
  colFormats = null,  // array of format fns per column
  rowClass = null,    // fn(row) => css class string
} = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'bt-table-wrapper';
  if (maxHeight) wrapper.style.maxHeight = maxHeight + 'px';
  if (stickyHeader) wrapper.style.overflowY = 'auto';

  const table = document.createElement('table');
  table.className = 'bt-table';

  // Header
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  headers.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    tr.appendChild(th);
  });
  thead.appendChild(tr);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  rows.forEach(row => {
    const tr = document.createElement('tr');
    if (rowClass) tr.className = rowClass(row);

    const values = Array.isArray(row) ? row : Object.values(row);
    values.forEach((v, i) => {
      const td = document.createElement('td');
      const formatted = colFormats && colFormats[i] ? colFormats[i](v, row) : (v ?? '—');
      if (typeof formatted === 'string') {
        td.innerHTML = formatted;
      } else {
        td.textContent = formatted;
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrapper.appendChild(table);
  return wrapper;
}

// ── Ticker Band items (duplicated for seamless scroll) ────────────────────

function buildTickerBand(items) {
  const inner = document.getElementById('ticker-band-inner');
  if (!inner) return;

  function makeItem(item) {
    const pct = item.pct_change;
    const cls = pct === null ? '' : pct >= 0 ? 'change-pos' : 'change-neg';
    const pctStr = pct === null ? '' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
    const d = document.createElement('div');
    d.className = 'ticker-item';
    d.innerHTML = `
      <span class="ticker-item-label">${item.label}</span>
      <span class="ticker-item-price">${item.price ? fmt.num(item.price) : '—'}</span>
      ${pctStr ? `<span class="ticker-item-change ${cls}">${pctStr}</span>` : ''}`;
    return d;
  }

  inner.innerHTML = '';
  // Duplicate for seamless loop
  [...items, ...items].forEach(item => inner.appendChild(makeItem(item)));
}

// ── Skeleton loaders ──────────────────────────────────────────────────────

function skeletonKpiRow(count = 6) {
  const div = document.createElement('div');
  div.className = 'grid-6';
  for (let i = 0; i < count; i++) {
    const card = document.createElement('div');
    card.className = 'skeleton skeleton-kpi';
    div.appendChild(card);
  }
  return div;
}

function skeletonTable(rows = 8, cols = 5) {
  const div = document.createElement('div');
  div.className = 'bt-table-wrapper';
  for (let i = 0; i < rows; i++) {
    const row = document.createElement('div');
    row.className = 'skeleton skeleton-table-row';
    div.appendChild(row);
  }
  return div;
}

// ── Toast ─────────────────────────────────────────────────────────────────

function toast(message, type = 'info', duration = 4000) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ── Expander ──────────────────────────────────────────────────────────────

function expander(title, contentFn) {
  const div = document.createElement('div');
  div.className = 'expander';
  div.innerHTML = `
    <div class="expander-header">
      <span>${title}</span>
      <span class="expander-icon">▾</span>
    </div>
    <div class="expander-body"></div>`;
  const header = div.querySelector('.expander-header');
  const body = div.querySelector('.expander-body');
  let loaded = false;
  header.onclick = () => {
    div.classList.toggle('open');
    if (div.classList.contains('open') && !loaded) {
      loaded = true;
      contentFn(body);
    }
  };
  return div;
}

// ── Change badge ──────────────────────────────────────────────────────────

function changeBadge(pct) {
  if (pct === null || pct === undefined) return '<span class="text-muted">—</span>';
  const cls = pct >= 0 ? 'positive' : 'negative';
  const sign = pct >= 0 ? '+' : '';
  return `<span class="kpi-delta ${cls}">${sign}${pct.toFixed(2)}%</span>`;
}

// ── Color for TIR ─────────────────────────────────────────────────────────

function tirColor(tir) {
  if (tir === null || tir === undefined) return 'text-muted';
  return tir >= 0 ? 'tir-positive' : 'tir-negative';
}

window.ui = {
  kpiCard, sectionLabel, pills, btTable,
  buildTickerBand, skeletonKpiRow, skeletonTable,
  toast, expander, changeBadge, tirColor,
};
