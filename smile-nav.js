// ── SMILE GLOBAL NAV ──────────────────────────────────
// Floating nav widget — top right corner
// Auto-injected on all SMILE pages except the clinic app

(function() {
  // Detect current page for active states
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const isAdmin   = path.includes('admin');
  const isOnboard = path.includes('onboarding');
  const isApp     = path.includes('app.html') || !!params.get('clinica');
  const isHome    = !isAdmin && !isOnboard && !isApp;

  // Base URL — relative so it works on any domain
  function url(page) {
    // Find the base path of the repo
    const base = path.substring(0, path.lastIndexOf('/') + 1);
    return base + page;
  }

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500&display=swap');

    #snav-root {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 99999;
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    /* Main toggle button */
    #snav-toggle {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: rgba(30,28,26,0.88);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08);
      transition: transform 0.2s, background 0.2s;
      position: relative;
    }
    #snav-toggle:hover { transform: scale(1.06); }
    #snav-toggle.open { background: rgba(30,28,26,0.97); }

    /* SMILE wordmark inside button */
    #snav-toggle-label {
      font-size: 7px;
      font-weight: 500;
      letter-spacing: 3px;
      color: rgba(255,255,255,0.7);
      line-height: 1;
      padding-right: 1px;
    }

    /* Dropdown panel */
    #snav-panel {
      position: absolute;
      top: calc(100% + 10px);
      right: 0;
      background: rgba(22,20,18,0.97);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border-radius: 18px;
      padding: 8px;
      width: 220px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.35), 0 4px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06);
      opacity: 0;
      transform: translateY(-6px) scale(0.97);
      transform-origin: top right;
      pointer-events: none;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }
    #snav-panel.open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: all;
    }

    /* Section label */
    .snav-section {
      font-size: 9px;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: rgba(255,255,255,0.2);
      padding: 10px 12px 4px;
    }

    /* Nav items */
    .snav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 11px;
      text-decoration: none;
      color: rgba(255,255,255,0.6);
      font-size: 13px;
      font-weight: 300;
      transition: background 0.15s, color 0.15s;
      cursor: pointer;
      border: none;
      background: none;
      width: 100%;
      text-align: left;
      font-family: inherit;
    }
    .snav-item:hover {
      background: rgba(255,255,255,0.07);
      color: rgba(255,255,255,0.9);
    }
    .snav-item.active {
      color: rgba(255,255,255,0.95);
      background: rgba(255,255,255,0.05);
    }
    .snav-item-icon {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      flex-shrink: 0;
      background: rgba(255,255,255,0.06);
    }
    .snav-item.active .snav-item-icon {
      background: rgba(196,133,106,0.25);
    }
    .snav-item-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      margin-left: auto;
      background: #C4856A;
      flex-shrink: 0;
    }

    /* Separator */
    .snav-sep {
      height: 1px;
      background: rgba(255,255,255,0.06);
      margin: 6px 4px;
    }

    /* Clinic login mini form */
    #snav-clinica-form {
      padding: 4px 4px 4px;
      display: none;
      flex-direction: column;
      gap: 6px;
    }
    #snav-clinica-form.open { display: flex; }

    .snav-input {
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 10px;
      padding: 9px 12px;
      font-size: 12px;
      font-family: inherit;
      color: white;
      outline: none;
      width: 100%;
      transition: border-color 0.2s;
    }
    .snav-input::placeholder { color: rgba(255,255,255,0.22); }
    .snav-input:focus { border-color: rgba(196,133,106,0.5); }

    .snav-go-btn {
      background: #C4856A;
      color: white;
      border: none;
      border-radius: 10px;
      padding: 9px 12px;
      font-size: 11px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      font-family: inherit;
      cursor: pointer;
      width: 100%;
      transition: background 0.2s;
    }
    .snav-go-btn:hover { background: #B5745A; }

    /* Bottom logo */
    .snav-bottom {
      padding: 8px 12px 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .snav-wordmark {
      font-size: 9px;
      letter-spacing: 5px;
      color: rgba(255,255,255,0.15);
      font-weight: 500;
    }
    .snav-version {
      font-size: 9px;
      color: rgba(255,255,255,0.12);
    }

    @media (max-width: 500px) {
      #snav-root { top: 12px; right: 12px; }
      #snav-panel { width: 190px; }
    }
  `;

  const html = `
    <style>${css}</style>
    <div id="snav-root">
      <button id="snav-toggle" onclick="snavToggle()" title="Menú SMILE">
        <span id="snav-toggle-label">SMILE</span>
      </button>

      <div id="snav-panel">
        <div class="snav-section">Navegar</div>

        <a class="snav-item ${isHome ? 'active' : ''}" href="${url('index.html')}">
          <div class="snav-item-icon">🌐</div>
          Inicio
          ${isHome ? '<div class="snav-item-dot"></div>' : ''}
        </a>

        <a class="snav-item ${isOnboard ? 'active' : ''}" href="${url('smile-onboarding.html')}">
          <div class="snav-item-icon">✦</div>
          Crear clínica
          ${isOnboard ? '<div class="snav-item-dot"></div>' : ''}
        </a>

        <a class="snav-item ${isAdmin ? 'active' : ''}" href="${url('admin.html')}">
          <div class="snav-item-icon">⚙️</div>
          Panel admin
          ${isAdmin ? '<div class="snav-item-dot"></div>' : ''}
        </a>

        <div class="snav-sep"></div>
        <div class="snav-section">Acceder</div>

        <button class="snav-item ${isApp ? 'active' : ''}" onclick="snavToggleClinica()">
          <div class="snav-item-icon">🦷</div>
          Entrar a mi clínica
          ${isApp ? '<div class="snav-item-dot"></div>' : ''}
        </button>

        <div id="snav-clinica-form">
          <input
            class="snav-input"
            id="snav-clinica-input"
            placeholder="ID de clínica (ej: clinica-garcia)"
            onkeydown="if(event.key==='Enter') snavGoClinica()"
          >
          <button class="snav-go-btn" onclick="snavGoClinica()">Entrar →</button>
        </div>

        <div class="snav-sep"></div>
        <div class="snav-bottom">
          <span class="snav-wordmark">SMILE</span>
          <span class="snav-version">v1.0</span>
        </div>
      </div>
    </div>
  `;

  // Mount
  document.addEventListener('DOMContentLoaded', function() {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);
    bindNav();
  });

  // If DOM already loaded
  if (document.readyState !== 'loading') {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);
    setTimeout(bindNav, 0);
  }

  function bindNav() {
    document.addEventListener('click', function(e) {
      const panel = document.getElementById('snav-panel');
      const toggle = document.getElementById('snav-toggle');
      if (!panel || !toggle) return;
      if (!panel.contains(e.target) && !toggle.contains(e.target)) {
        panel.classList.remove('open');
        toggle.classList.remove('open');
      }
    });
  }

  window.snavToggle = function() {
    const panel = document.getElementById('snav-panel');
    const toggle = document.getElementById('snav-toggle');
    panel.classList.toggle('open');
    toggle.classList.toggle('open');
  };

  window.snavToggleClinica = function() {
    const form = document.getElementById('snav-clinica-form');
    form.classList.toggle('open');
    if (form.classList.contains('open')) {
      setTimeout(() => document.getElementById('snav-clinica-input')?.focus(), 80);
    }
  };

  window.snavGoClinica = function() {
    const val = document.getElementById('snav-clinica-input')?.value.trim()
      .toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (!val) return;
    window.location.href = url('app.html') + '?clinica=' + val;
  };

})();
