/* ─── DCF API wrapper ─────────────────────────────────────────────────────── */
/* Fetch wrapper — credentials: 'include' para enviar httpOnly cookie JWT      */

// Auto-detect: local dev → same origin, GitHub Pages / cualquier otro → URL del backend en Render
const API_BASE = (
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'
) ? '' : (window._DCF_API_URL || 'https://dcf-herramientas-web.onrender.com');

class APIError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function apiFetch(path, options = {}) {
  const url = `${API_BASE}/api${path}`;
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (res.status === 401) {
    // Redirect to login on auth failure
    window.location.href = '/login.html';
    throw new APIError('Unauthorized', 401);
  }

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).detail || ''; } catch {}
    throw new APIError(`API error ${res.status}: ${detail}`, res.status);
  }

  return res.json();
}

// ── Per-module API calls ──────────────────────────────────────────────────

const api = {
  dashboard: {
    macro:          () => apiFetch('/dashboard/macro'),
    indices:        () => apiFetch('/dashboard/indices'),
    tickerBand:     () => apiFetch('/dashboard/ticker-band'),
    tasas:          () => apiFetch('/dashboard/tasas-soberanas'),
    sp500Treemap:   () => apiFetch('/dashboard/sp500-treemap'),
    mervalTreemap:  () => apiFetch('/dashboard/merval-treemap'),
    cedears:        () => apiFetch('/dashboard/cedears'),
    performance:   (period = '1M') => apiFetch(`/dashboard/performance?period=${period}`),
  },
  bonos: {
    todos:       () => apiFetch('/bonos/todos'),
    hd:         (mercado = 'MEP') => apiFetch(`/bonos/hd?mercado=${mercado}`),
    riesgoPais: () => apiFetch('/bonos/riesgo-pais'),
    sensibilidad: (tipo = 'GLOBALES') => apiFetch(`/bonos/sensibilidad?tipo=${tipo}`),
  },
  letras: {
    carry:  () => apiFetch('/letras/carry'),
    curva:  () => apiFetch('/letras/curva'),
  },
  cer: {
    tabla:  () => apiFetch('/cer/tabla'),
    curva:  () => apiFetch('/cer/curva'),
  },
  ons: {
    tabla:  () => apiFetch('/ons/tabla'),
  },
  fci: {
    fondos:    (params = {}) => {
      const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v)));
      return apiFetch(`/fci/fondos?${q}`);
    },
    historico: (fondoId, claseId, meses = 12) => apiFetch(`/fci/historico?fondo_id=${fondoId}&clase_id=${claseId}&meses=${meses}`),
  },
  fundamental: {
    tickers:    () => apiFetch('/fundamental/tickers'),
    perfil:     (ticker) => apiFetch(`/fundamental/perfil?ticker=${ticker}`),
    financieros: (ticker) => apiFetch(`/fundamental/financieros?ticker=${ticker}`),
    candles:    (ticker, resolution = 'W') => apiFetch(`/fundamental/candles?ticker=${ticker}&resolution=${resolution}`),
  },
  auth: {
    me:     () => fetch('/auth/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null).catch(() => null),
    logout: () => fetch('/auth/logout', { credentials: 'include' }).then(() => { window.location.href = '/login.html'; }),
  },
};

window.api = api;
