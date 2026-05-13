/* ─── DCF SPA Router + App shell ─────────────────────────────────────────── */

const ROUTES = {
  dashboard:   { label: 'Dashboard' },
  bonos:       { label: 'Bonos Soberanos' },
  letras:      { label: 'Letras / Boncaps' },
  cer:         { label: 'Bonos CER' },
  ons:         { label: 'ONs' },
  fci:         { label: 'FCI' },
  fundamental: { label: 'An. Fundamental' },
};

let _currentRoute = null;
let _user = null;

// ── Market status (Argentina) ─────────────────────────────────────────────

function _getMarketStatus() {
  try {
    const art = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
    const day = art.getDay();     // 0=Sun, 6=Sat
    const h   = art.getHours();
    const m   = art.getMinutes();
    const mins = h * 60 + m;
    const isWeekend = day === 0 || day === 6;
    const isOpen = !isWeekend && mins >= 11 * 60 + 1 && mins < 18 * 60;
    return { open: isOpen, time: art };
  } catch {
    return { open: false, time: new Date() };
  }
}

function _updateMarketStatus() {
  const { open, time } = _getMarketStatus();
  const dot  = document.getElementById('market-dot');
  const text = document.getElementById('market-status-text');
  if (!dot || !text) return;
  dot.className = `market-dot ${open ? 'open' : 'closed'}`;
  text.textContent = open ? 'Mercado Abierto' : 'Mercado Cerrado';
}

// ── Last update timestamp ─────────────────────────────────────────────────

function markUpdated() {
  const el = document.getElementById('topbar-timestamp');
  if (!el) return;
  const art = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
  const hh = String(art.getHours()).padStart(2, '0');
  const mm = String(art.getMinutes()).padStart(2, '0');
  el.textContent = `Act. ${hh}:${mm} ART`;
}

window.markUpdated = markUpdated;

// ── Init ──────────────────────────────────────────────────────────────────

async function init() {
  _user = await api.auth.me();
  if (!_user) {
    window.location.href = BASE_PATH + '/login.html';
    return;
  }

  const userEl = document.getElementById('topbar-user');
  if (userEl) userEl.textContent = _user.email;

  _buildNav();
  _updateMarketStatus();
  setInterval(_updateMarketStatus, 60000);

  document.getElementById('logout-btn')?.addEventListener('click', () => api.auth.logout());

  window.addEventListener('hashchange', _route);
  _route();
}

function _buildNav() {
  const nav = document.getElementById('topnav-links');
  if (!nav) return;
  nav.innerHTML = '';
  Object.entries(ROUTES).forEach(([id, route]) => {
    const link = document.createElement('a');
    link.className = 'nav-link';
    link.dataset.route = id;
    link.href = `#${id}`;
    link.textContent = route.label;
    link.addEventListener('click', (e) => { e.preventDefault(); navigateTo(id); });
    nav.appendChild(link);
  });
}

function _route() {
  const hash = window.location.hash.slice(1) || 'dashboard';
  navigateTo(hash);
}

async function navigateTo(routeId) {
  const route = ROUTES[routeId];
  if (!route) { navigateTo('dashboard'); return; }
  if (_currentRoute === routeId) return;
  _currentRoute = routeId;

  document.querySelectorAll('.nav-link').forEach(el => {
    el.classList.toggle('active', el.dataset.route === routeId);
  });

  if (window.location.hash !== `#${routeId}`) {
    history.pushState(null, '', `#${routeId}`);
  }

  const content = document.getElementById('page-content');
  if (!content) return;
  content.innerHTML = '';

  try {
    await loadPage(routeId, content);
  } catch (e) {
    content.innerHTML = `<div class="page"><p class="text-negative" style="font-family:var(--font-mono);padding:24px">Error: ${e.message}</p></div>`;
    console.error(e);
  }
}

async function loadPage(module, container) {
  if (window.pages && window.pages[module]) {
    await window.pages[module](container);
  } else {
    container.innerHTML = `<div class="page"><p class="text-muted" style="font-family:var(--font-mono)">Módulo "${module}" no disponible.</p></div>`;
  }
}

window.app = { init, navigateTo };
document.addEventListener('DOMContentLoaded', init);
