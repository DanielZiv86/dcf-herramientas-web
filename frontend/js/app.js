/* ─── DCF SPA Router + App shell ─────────────────────────────────────────── */

const ROUTES = {
  dashboard:   { label: 'Dashboard',        icon: '◉' },
  bonos:       { label: 'Bonos Soberanos',  icon: '◈' },
  letras:      { label: 'Letras / Boncaps', icon: '◇' },
  cer:         { label: 'Bonos CER',        icon: '◎' },
  ons:         { label: 'ONs',              icon: '◆' },
  fci:         { label: 'FCI',              icon: '◑' },
  fundamental: { label: 'An. Fundamental',  icon: '◐' },
};

let _currentRoute = null;
let _user = null;

async function init() {
  _user = await api.auth.me();
  if (!_user) {
    window.location.href = BASE_PATH + '/login.html';
    return;
  }

  const userEl = document.getElementById('topbar-user');
  if (userEl) userEl.textContent = _user.email;

  _buildNav();

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
    link.innerHTML = `<span>${route.label}</span>`;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(id);
    });
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

  // Update active nav link
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
    content.innerHTML = `<div class="page"><p class="text-negative" style="font-family:var(--font-mono);padding:24px">Error cargando ${route.label}: ${e.message}</p></div>`;
    console.error(e);
  }
}

async function loadPage(module, container) {
  if (window.pages && window.pages[module]) {
    await window.pages[module](container);
  } else {
    container.innerHTML = `<div class="page"><p class="text-muted" style="font-family:var(--font-mono)">Módulo "${module}" no cargado.</p></div>`;
  }
}

window.app = { init, navigateTo };

document.addEventListener('DOMContentLoaded', init);
