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

// ── Market status polling ─────────────────────────────────────────────────

let _lastRefreshTs = null;   // ISO string del último last_refresh del backend

// Fallback client-side (para el render inicial antes del primer poll)
function _marketStatusFallback() {
  try {
    const art = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
    const day  = art.getDay();
    const mins = art.getHours() * 60 + art.getMinutes();
    const isWeekend = day === 0 || day === 6;
    return !isWeekend && mins >= 10 * 60 + 35 && mins <= 18 * 60;
  } catch {
    return false;
  }
}

function _applyMarketBadge(open) {
  const dot  = document.getElementById('market-dot');
  const text = document.getElementById('market-status-text');
  if (!dot || !text) return;
  dot.className    = `market-dot ${open ? 'open' : 'closed'}`;
  text.textContent = open ? 'Mercado Abierto' : 'Mercado Cerrado';
}

function _applyLastRefresh(isoTs) {
  const el = document.getElementById('topbar-timestamp');
  if (!el || !isoTs) return;
  const d   = new Date(isoTs);
  const art = new Date(d.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
  const p   = n => String(n).padStart(2, '0');
  el.textContent = `Act. ${p(art.getDate())}/${p(art.getMonth() + 1)} ${p(art.getHours())}:${p(art.getMinutes())} ART`;
  el.title = `Última actualización: ${art.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`;
}

async function _pollStatus() {
  try {
    const s = await api.status();

    // Estado del mercado desde el backend (conoce feriados AR)
    _applyMarketBadge(s.market_open ?? false);

    // Timestamp de última actualización
    if (s.last_refresh) {
      _applyLastRefresh(s.last_refresh);
    }

    // Auto-reload de la tab activa si el backend hizo un refresh nuevo
    if (s.last_refresh && s.last_refresh !== _lastRefreshTs) {
      if (_lastRefreshTs !== null) {
        // Hubo un refresh posterior al que ya teníamos → recargar datos
        console.log('[DCF] Refresh de mercado detectado, recargando datos...');
        await _refreshCurrentPage();
      }
      _lastRefreshTs = s.last_refresh;
    }
  } catch {
    // Silent — no interrumpir la app si el endpoint falla
  }
}

async function _refreshCurrentPage() {
  if (!_currentRoute) return;
  const route = _currentRoute;
  _currentRoute = null;   // forzar reload en navigateTo
  try {
    await navigateTo(route);
  } catch {
    _currentRoute = route;   // restaurar si falla
  }
}

// Llamado por cada módulo de página cuando termina de cargar datos
function markUpdated() {
  const el = document.getElementById('topbar-timestamp');
  if (!el) return;
  const art = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
  const p   = n => String(n).padStart(2, '0');
  el.textContent = `Act. ${p(art.getDate())}/${p(art.getMonth() + 1)} ${p(art.getHours())}:${p(art.getMinutes())} ART`;
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

  // Render inicial con fallback client-side (sin esperar al backend)
  _applyMarketBadge(_marketStatusFallback());

  document.getElementById('logout-btn')?.addEventListener('click', () => api.auth.logout());

  window.addEventListener('hashchange', _route);
  _route();

  // Primer poll inmediato + cada 60s (actualiza estado mercado y detecta refreshes)
  await _pollStatus();
  setInterval(_pollStatus, 60_000);
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
