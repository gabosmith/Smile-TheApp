// ── SMILE GLOBAL NAV ──────────────────────────────────
// Inject this script in any SMILE page to get the floating nav
// <script src="smile-nav.js"></script>

(function() {
  const BASE = 'https://gabosmith.github.io/smile-app';

  // Don't show on the clinic app itself (index.html with ?clinica=)
  const params = new URLSearchParams(window.location.search);
  if (params.get('clinica')) return;

  const css = `
    #smile-global-nav {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 99999;
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    }

    #smile-nav-pill {
      background: rgba(30, 28, 26, 0.92);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-radius: 100px;
      padding: 8px 8px 8px 20px;
      display: flex;
      align-items: center;
      gap: 4px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.06);
      white-space: nowrap;
    }

    #smile-nav-logo {
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 6px;
      color: rgba(255,255,255,0.4);
      margin-right: 8px;
      user-select: none;
    }

    .snav-link {
      font-size: 12px;
      font-weight: 300;
      color: rgba(255,255,255,0.55);
      text-decoration: none;
      padding: 8px 14px;
      border-radius: 100px;
      transition: color 0.2s, background 0.2s;
      letter-spacing: 0.3px;
      cursor: pointer;
      border: none;
      background: none;
      font-family: inherit;
    }
    .snav-link:hover {
      color: rgba(255,255,255,0.9);
      background: rgba(255,255,255,0.07);
    }
    .snav-link.active {
      color: rgba(255,255,255,0.9);
    }

    .snav-cta {
      background: #C4856A;
      color: white !important;
      font-size: 11px !important;
      letter-spacing: 1.5px !important;
      text-transform: uppercase;
      padding: 10px 18px !important;
      box-shadow: 0 2px 12px rgba(196,133,106,0.4);
      font-weight: 400 !important;
    }
    .snav-cta:hover {
      background: #B5745A !important;
      color: white !important;
    }

    /* Clinica login dropdown */
    .snav-dropdown-wrap {
      position: relative;
    }
    #snav-clinica-menu {
      position: absolute;
      bottom: calc(100% + 12px);
      left: 50%;
      transform: translateX(-50%);
      background: rgba(30,28,26,0.97);
      backdrop-filter: blur(20px);
      border-radius: 16px;
      padding: 8px;
      min-width: 240px;
      box-shadow: 0 16px 40px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06);
      display: none;
      flex-direction: column;
      gap: 2px;
    }
    #snav-clinica-menu.open { display: flex; }

    .snav-menu-label {
      font-size: 9px;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: rgba(255,255,255,0.25);
      padding: 8px 12px 4px;
    }

    .snav-menu-input {
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 10px;
      padding: 10px 14px;
      font-size: 13px;
      font-family: inherit;
      color: white;
      outline: none;
      width: 100%;
      transition: border-color 0.2s;
      margin: 2px 0;
    }
    .snav-menu-input::placeholder { color: rgba(255,255,255,0.25); }
    .snav-menu-input:focus { border-color: rgba(196,133,106,0.6); }

    .snav-menu-btn {
      background: #C4856A;
      color: white;
      border: none;
      border-radius: 10px;
      padding: 10px 14px;
      font-size: 12px;
      font-family: inherit;
      letter-spacing: 1px;
      cursor: pointer;
      width: 100%;
      transition: background 0.2s;
      margin-top: 4px;
    }
    .snav-menu-btn:hover { background: #B5745A; }

    .snav-menu-sep {
      height: 1px;
      background: rgba(255,255,255,0.06);
      margin: 6px 0;
    }

    .snav-menu-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 10px;
      color: rgba(255,255,255,0.7);
      font-size: 13px;
      text-decoration: none;
      transition: background 0.15s, color 0.15s;
      cursor: pointer;
    }
    .snav-menu-item:hover {
      background: rgba(255,255,255,0.07);
      color: white;
    }
    .snav-menu-icon { font-size: 15px; }

    @media (max-width: 600px) {
      #smile-nav-logo { display: none; }
      .snav-link { font-size: 11px; padding: 7px 10px; }
      #smile-nav-pill { padding: 6px 6px 6px 10px; }
    }
  `;

  // Detect current page
  const path = window.location.pathname;
  const isHome    = path.endsWith('smile-brand.html') || path === '/' || path.endsWith('/smile-app/');
  const isOnboard = path.includes('smile-onboarding');
  const isAdmin   = path.includes('admin');

  function navLink(label, href, cls = '') {
    const active = window.location.href.includes(href) ? 'active' : '';
    return `<a class="snav-link ${active} ${cls}" href="${href}">${label}</a>`;
  }

  const html = `
    <style>${css}</style>
    <div id="smile-global-nav">
      <div id="smile-nav-pill">
        <div id="smile-nav-logo">SMILE</div>

        ${navLink('Inicio', BASE + '/smile-brand.html')}
        ${navLink('Onboarding', BASE + '/smile-onboarding.html')}

        <div class="snav-dropdown-wrap">
          <button class="snav-link" id="snav-clinica-btn" onclick="toggleClinicaMenu()">
            Entrar a clínica ↑
          </button>
          <div id="snav-clinica-menu">
            <div class="snav-menu-label">Acceder a una clínica</div>
            <input
              class="snav-menu-input"
              id="snav-clinica-input"
              placeholder="ID de tu clínica (ej: clinica-garcia)"
              onkeydown="if(event.key==='Enter') goToClinica()"
            >
            <button class="snav-menu-btn" onclick="goToClinica()">Ir a mi clínica →</button>
            <div class="snav-menu-sep"></div>
            <div class="snav-menu-label">Accesos rápidos</div>
            <a class="snav-menu-item" href="${BASE}/?clinica=clinica-demo">
              <span class="snav-menu-icon">🦷</span> clinica-demo
            </a>
          </div>
        </div>

        ${navLink('Admin', BASE + '/admin.html', isAdmin ? 'active' : '')}
      </div>
    </div>
  `;

  // Inject into body
  const div = document.createElement('div');
  div.innerHTML = html;
  document.body.appendChild(div);

  // Close dropdown on outside click
  document.addEventListener('click', e => {
    const menu = document.getElementById('snav-clinica-menu');
    const btn  = document.getElementById('snav-clinica-btn');
    if (menu && !menu.contains(e.target) && !btn.contains(e.target)) {
      menu.classList.remove('open');
    }
  });

  window.toggleClinicaMenu = function() {
    const menu = document.getElementById('snav-clinica-menu');
    menu.classList.toggle('open');
    if (menu.classList.contains('open')) {
      setTimeout(() => document.getElementById('snav-clinica-input')?.focus(), 100);
    }
  };

  window.goToClinica = function() {
    const val = document.getElementById('snav-clinica-input').value.trim()
      .toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (!val) return;
    window.location.href = BASE + '/?clinica=' + val;
  };

})();
