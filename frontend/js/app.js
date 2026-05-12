/* ─── DCF SPA Router + App shell ─────────────────────────────────────────── */

const ROUTES = {
  dashboard:    { label: 'Dashboard',        icon: '◉', module: 'dashboard' },
  bonos:        { label: 'Bonos Soberanos',  icon: '◈', module: 'bonos' },
  letras:       { label: 'Letras / Boncaps', icon: '◇', module: 'letras' },
  cer:          { label: 'Bonos CER',        icon: '◎', module: 'cer' },
  ons:          { label: 'ONs',              icon: '◆', module: 'ons' },
  fci:          { label: 'FCI',              icon: '◑', module: 'fci' },
  fundamental:  { label: 'An. Fundamental',  icon: '◐', module: 'fundamental' },
};

let _currentRoute = null;
let _user = null;

// ── Init ──────────────────────────────────────────────────────────────────

async function init() {
  // Check auth
  _user = await api.auth.me();
  if (!_user) {
    window.location.href = BASE_PATH + '/login.html';
    return;
  }

  // Render user info
  const userEl = document.getElementById('topbar-user');
  if (userEl) userEl.textContent = _user.email;

  // Build sidebar nav
  _buildNav();

  // Logout button
  document.getElementById('logout-btn')?.addEventListener('click', () => api.auth.logout());

  // Handle hash routing
  window.addEventListener('hashchange', _route);
  _route();
}

function _buildNav() {
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;
  nav.innerHTML = '';

  const label = document.createElement('div');
  label.className = 'nav-section-label';
  label.textContent = 'Herramientas';
  nav.appendChild(label);

  Object.entries(ROUTES).forEach(([id, route]) => {
    const link = document.createElement('a');
    link.className = 'nav-link';
    link.dataset.route = id;
    link.href = `#${id}`;
    link.innerHTML = `<span class="nav-icon">${route.icon}</span><span>${route.label}</span>`;
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

// ── Navigation ────────────────────────────────────────────────────────────

async function navigateTo(routeId) {
  const route = ROUTES[routeId];
  if (!route) {
    navigateTo('dashboard');
    return;
  }

  if (_currentRoute === routeId) return;
  _currentRoute = routeId;

  // Update active nav link
  document.querySelectorAll('.nav-link').forEach(el => {
    el.classList.toggle('active', el.dataset.route === routeId);
  });

  // Update topbar title
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = route.label;

  // Update URL
  if (window.location.hash !== `#${routeId}`) {
    history.pushState(null, '', `#${routeId}`);
  }

  // Load page module
  const content = document.getElementById('page-content');
  if (!content) return;
  content.innerHTML = '';

  try {
    await loadPage(route.module, content);
  } catch (e) {
    content.innerHTML = `<div class="page"><p class="text-negative">Error cargando ${route.label}: ${e.message}</p></div>`;
    console.error(e);
  }
}

async function loadPage(module, container) {
  if (window.pages && window.pages[module]) {
    await window.pages[module](container);
  } else {
    container.innerHTML = `<div class="page"><p class="text-muted">Módulo "${module}" no cargado.</p></div>`;
  }
}

window.app = { init, navigateTo };

// ── Auto-start when DOM ready ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
