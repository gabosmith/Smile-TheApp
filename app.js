// ========================================
// MULTI-TENANT CONFIG
// ========================================

let CLINIC_PATH = null;

function detectClinica() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlClinica = urlParams.get('clinica');

    if (urlClinica) {
        const sesionAnterior = sessionStorage.getItem('smile_clinica_session');

        // Si la clínica en la URL es DIFERENTE a la sesión activa,
        // limpiar todo el estado para que Clínica B no vea datos de Clínica A
        if (sesionAnterior && sesionAnterior !== urlClinica) {
            console.warn(`[detectClinica] Cambio de clínica detectado: ${sesionAnterior} → ${urlClinica}. Limpiando estado.`);
            _limpiarEstadoApp();
        }

        CLINIC_PATH = urlClinica;
        sessionStorage.setItem('smile_clinica_session', urlClinica);
        return urlClinica;
    }

    const session = sessionStorage.getItem('smile_clinica_session');
    if (session) {
        CLINIC_PATH = session;
        return session;
    }
    return null;
}

// Limpia todo el estado en memoria y caches locales.
// Se llama cuando se detecta un cambio de clínica en la misma pestaña.
function _limpiarEstadoApp() {
    // Limpiar datos en memoria
    if (typeof appData !== 'undefined') {
        appData.facturas       = [];
        appData.personal       = [];
        appData.gastos         = [];
        appData.avances        = [];
        appData.cuadresDiarios = {};
        appData.citas          = [];
        appData.settings       = {};
        appData.laboratorios   = [];
        appData.reversiones    = [];
        appData.auditLogs      = [];
        appData.pacientes      = [];
        appData.inventario     = [];
        appData.currentUser    = null;
        appData.currentRole    = null;
    }

    // Limpiar clinicConfig
    if (typeof clinicConfig !== 'undefined') {
        clinicConfig.modulos    = [];
        clinicConfig.plan       = 'clinica';
        clinicConfig.nombre     = '';
        clinicConfig.color      = '';
        clinicConfig.activa     = true;
        clinicConfig.enTrial    = false;
        clinicConfig._logoSrc   = null;
        clinicConfig.logoPositivo = null;
        clinicConfig.logoNegativo = null;
    }

    // Limpiar caches locales de la clínica anterior
    const anterior = sessionStorage.getItem('smile_clinica_session');
    if (anterior) {
        localStorage.removeItem('clinicaData_cache_' + anterior);
        localStorage.removeItem('clinicaData_cacheTime_' + anterior);
    }

    // Cancelar listener de Firestore si existe
    if (typeof unsubscribeSnapshot !== 'undefined' && unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
    }

    // Limpiar sesión activa
    sessionStorage.removeItem('smile_session');
}

// Cargar branding dinámico desde Firebase config
// Clinic config stored globally so buildNavigation() can read it
let clinicConfig = {
    modulos: [],
    plan: 'clinica',
    nombre: '',
    color: '',
    activa: true,
    procMode: 'libre',   // 'libre' | 'lista'
    procItems: [],       // [{nombre, precio}] when procMode=lista
    moneda:   'RD$',     // símbolo de moneda — configurable por país
    locale:   getLocale(),   // locale para fechas y números
    pais:     'República Dominicana',
};

async function loadClinicBranding() {
    if (!CLINIC_PATH) return;
    try {
        const cfgDoc = await db.collection('clinicas').doc(CLINIC_PATH)
            .collection('config').doc('settings').get();
        // Si no existe config, usar defaults y salir limpiamente
        if (!cfgDoc.exists) {
            clinicConfig.modulos = [];
            clinicConfig.plan    = 'clinica';
            clinicConfig.activa  = true;
            clinicConfig.enTrial = true;
            return;
        }
        const cfg = cfgDoc.data() || {};

        // ── Store config globally for module gating ──
        clinicConfig.modulos    = cfg.modulos || [];
        clinicConfig.plan       = cfg.plan || 'clinica';
        clinicConfig.nombre        = cfg.nombre || '';
        clinicConfig.color         = cfg.color || '#C4856A';
        clinicConfig.logoPositivo  = cfg.logoPositivo  || null;
        clinicConfig.logoNegativo  = cfg.logoNegativo  || null;
        clinicConfig.activa     = cfg.activa !== false;
        clinicConfig.trial      = cfg.trial !== false;
        clinicConfig.trialHasta = cfg.trialHasta || null;
        clinicConfig.procMode      = cfg.procMode || 'libre';
        clinicConfig.procItems     = cfg.procItems || [];
        clinicConfig.clinicaPadre  = cfg.clinicaPadre || null;
        clinicConfig.esSede        = !!cfg.clinicaPadre;
        clinicConfig.nombreSede    = cfg.nombreSede || cfg.nombre || '';
        clinicConfig.moneda              = cfg.moneda              || 'RD$';
        clinicConfig.locale              = cfg.locale              || getLocale();
        clinicConfig.pais                = cfg.pais                || '';
        clinicConfig.defaultRemuneracion   = cfg.defaultRemuneracion   || 'comision';
        clinicConfig.defaultFrecuenciaPago = cfg.defaultFrecuenciaPago || 'mensual';

        // enTrial: trialHasta es la fuente de verdad
        clinicConfig.enTrial = clinicConfig.trialHasta
            ? (new Date() < new Date(clinicConfig.trialHasta))
            : false;

        // ── Apply branding ──
        if (cfg.nombre) {
            document.title = cfg.nombre;
            const loginName = document.getElementById('clinicNameLogin');
            if (loginName) loginName.textContent = cfg.nombre;
        }

        if (cfg.color) {
            const darker  = darkenColor(cfg.color, 15);
            const lighter = lightenColor(cfg.color, 25);
            const color   = cfg.color;

            // Apply CSS variables on documentElement — works everywhere
            document.documentElement.style.setProperty('--clinic-color',       color);
            document.documentElement.style.setProperty('--clinic-color-dark',  darker);
            document.documentElement.style.setProperty('--clinic-color-light', lighter);

            // Inject a persistent <style> tag so ALL elements get the color
            // even those rendered after this function runs
            let styleTag = document.getElementById('clinic-color-style');
            if (!styleTag) {
                styleTag = document.createElement('style');
                styleTag.id = 'clinic-color-style';
                document.head.appendChild(styleTag);
            }
            styleTag.textContent = `
                :root {
                    --clinic-color: ${color} !important;
                    --clinic-color-dark: ${darker} !important;
                    --clinic-color-light: ${lighter} !important;
                }
                .login-screen { background: linear-gradient(135deg, ${color} 0%, ${darker} 100%) !important; }
                .app-header, .header-bar { background: ${color} !important; }
                .modal-title { color: ${color} !important; }
                .card h2 { color: ${color} !important; }
                .btn-primary, .btn-submit, .btn-save, .btn-action { background: ${color} !important; border-color: ${color} !important; }
                .btn-primary:hover, .btn-submit:hover { background: ${darker} !important; }
                .role-btn { border-color: ${color} !important; color: ${color} !important; }
                .role-btn.active { background: ${color} !important; color: white !important; }
                .nav-item.active { color: ${color} !important; }
                .stat-value { color: ${color} !important; }
                .badge-primary { background: ${color} !important; }
                .input-group input:focus,
                .form-group input:focus,
                .form-group select:focus,
                textarea:focus { border-color: ${color} !important; box-shadow: 0 0 0 3px ${color}22 !important; }
                a { color: ${color}; }
                ::selection { background: ${color}33; }
            `;
        }

        // ── Apply logo across the app ──
        const logoSrc = cfg.logoPositivo || cfg.logoNegativo || cfg.logoUrl || null;
        applyLogoEverywhere(logoSrc, cfg.nombre || '');

        // ── Block access if clinic is paused ──
        if (cfg.activa === false) {
            document.getElementById('loginScreen').style.display = 'flex';
            document.getElementById('appContainer').style.display = 'none';
            const card = document.querySelector('.login-card');
            if (card) card.innerHTML = '<div style="text-align:center;padding:20px"><div style="font-size:40px;margin-bottom:16px">🔒</div><div style="font-weight:600;font-size:18px;margin-bottom:8px">Cuenta pausada</div><div style="color:#666;font-size:14px">Contacta a SMILE para reactivar tu clínica.</div></div>';
        }

    } catch(e) {
        console.error('[Branding] Error cargando config de clínica:', e.code, e.message);
        // Si es permission-denied probablemente auth no está lista — no mostrar "sin conexión"
        // ya que el problema es de auth, no de red
        if (e.code === 'permission-denied') {
            console.warn('[Branding] permission-denied — verificar que firebase-auth-compat.js está cargado');
        } else if (e.code === 'unavailable' || e.message?.includes('offline')) {
            // Problema real de red — intentar cargar branding desde cache
            _loadBrandingFromCache();
        }
        // No llamar setConnectionState('offline') aquí — loadData lo manejará
    }
}

// Intenta restaurar branding básico desde localStorage si Firebase no está disponible
function _loadBrandingFromCache() {
    try {
        const cached = localStorage.getItem('clinicaData_cache_' + (CLINIC_PATH || 'default'));
        if (!cached) return;
        const data = JSON.parse(cached);
        const color = data.clinicColor || clinicConfig.color;
        const nombre = data.clinicNombre || clinicConfig.nombre;
        if (color) {
            const darker  = darkenColor(color, 15);
            const lighter = lightenColor(color, 25);
            document.documentElement.style.setProperty('--clinic-color', color);
            document.documentElement.style.setProperty('--clinic-color-dark', darker);
            document.documentElement.style.setProperty('--clinic-color-light', lighter);
            let styleTag = document.getElementById('clinic-color-style');
            if (!styleTag) { styleTag = document.createElement('style'); styleTag.id = 'clinic-color-style'; document.head.appendChild(styleTag); }
            styleTag.textContent = `:root{--clinic-color:${color}!important;--clinic-color-dark:${darker}!important;--clinic-color-light:${lighter}!important;}.login-screen{background:linear-gradient(135deg,${color} 0%,${darker} 100%)!important;}`;
        }
        if (nombre) {
            document.title = nombre;
            const el = document.getElementById('clinicNameLogin');
            if (el) el.textContent = nombre;
        }
    } catch(e) { /* cache corrupto, ignorar */ }
}

// Applies the clinic logo to every branded surface in one call.
// Called on load and whenever the logo/nombre changes.
function applyLogoEverywhere(logoSrc, nombre) {
    // 1. LOGIN SCREEN — large logo above the card
    const loginLogoEl = document.getElementById('logoImg');
    const loginNameEl = document.getElementById('clinicNameLogin');
    if (loginLogoEl) {
        if (logoSrc) {
            loginLogoEl.src = logoSrc;
            loginLogoEl.style.display = 'block';
            loginLogoEl.classList.add('loaded');
            if (loginNameEl) loginNameEl.classList.add('logo-visible');
            loginLogoEl.onerror = () => {
                loginLogoEl.style.display = 'none';
                loginLogoEl.classList.remove('loaded');
                if (loginNameEl) loginNameEl.classList.remove('logo-visible');
            };
        } else {
            loginLogoEl.style.display = 'none';
            loginLogoEl.classList.remove('loaded');
            if (loginNameEl) loginNameEl.classList.remove('logo-visible');
        }
    }
    if (loginNameEl && nombre) loginNameEl.textContent = nombre;

    // 2. APP HEADER — small logo beside the clinic name
    const headerLogoEl = document.getElementById('appHeaderLogo');
    if (headerLogoEl) {
        if (logoSrc) {
            headerLogoEl.src = logoSrc;
            headerLogoEl.style.display = 'block';
            headerLogoEl.onerror = () => { headerLogoEl.style.display = 'none'; };
        } else {
            headerLogoEl.style.display = 'none';
        }
    }

    // 3. DASHBOARD — branded header card watermark (injected by updateDashboardTab)
    // Store for use when dashboard renders
    clinicConfig._logoSrc = logoSrc;
}

function darkenColor(hex, percent) {
    const num = parseInt(hex.replace('#',''), 16);
    const r = Math.max(0, (num >> 16) - Math.round(2.55 * percent));
    const g = Math.max(0, ((num >> 8) & 0xff) - Math.round(2.55 * percent));
    const b = Math.max(0, (num & 0xff) - Math.round(2.55 * percent));
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function lightenColor(hex, percent) {
    const num = parseInt(hex.replace('#',''), 16);
    const r = Math.min(255, (num >> 16) + Math.round(2.55 * percent));
    const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(2.55 * percent));
    const b = Math.min(255, (num & 0xff) + Math.round(2.55 * percent));
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

// ========================================
// FIREBASE DATA MANAGEMENT
// ========================================

// Show sync indicator
// ═══════════════════════════════════════════════════════════
// ESTADO DE RED Y SINCRONIZACIÓN
// ═══════════════════════════════════════════════════════════

let _connectionState = 'online'; // 'online' | 'saving' | 'offline' | 'error'

function setConnectionState(state, detail) {
    _connectionState = state;
    const el = document.getElementById('syncIndicator');
    if (!el) return;

    const cfg = {
        online:  { text: '✓ Sincronizado',           bg: '#1E1C1A', pulse: false },
        saving:  { text: '⟳ Guardando…',             bg: '#7B8FA1', pulse: true  },
        offline: { text: '⚠️ Sin conexión',           bg: '#e65100', pulse: false },
        error:   { text: '✕ Error al guardar',        bg: '#c0392b', pulse: false },
    };
    const c = cfg[state] || cfg.online;

    el.textContent = detail ? `${c.text.split(' ')[0]} ${detail}` : c.text;
    el.style.background = c.bg;
    el.classList.add('show');
    el.classList.toggle('sync-pulse', c.pulse);

    if (state === 'online') {
        setTimeout(() => el.classList.remove('show'), 2200);
    }
}

function showSyncIndicator() { setConnectionState('online'); }

// Connection detection via browser events + Firestore internal channel
function initConnectionMonitor() {
    // Estado inicial: no mostrar nada hasta confirmar
    // navigator.onLine puede ser true cuando Firebase no responde
    if (!navigator.onLine) {
        setConnectionState('offline');
    }
    // Browser eventos de red
    window.addEventListener('online',  () => {
        setConnectionState('online');
        // Al reconectar, reintentar cargar si hay datos pendientes
        if (_connectionState === 'offline' && CLINIC_PATH && appData.currentUser) {
            loadData().catch(e => console.warn('[Reconexión] loadData fallido:', e.message));
        }
    });
    window.addEventListener('offline', () => setConnectionState('offline'));

    // Firestore tiene su propio detector de conectividad interno
    // que es más confiable que navigator.onLine para detectar problemas con Firebase
    if (typeof db !== 'undefined') {
        try {
            // enableNetwork/disableNetwork de Firestore sigue el estado real de la conexión
            // El listener de onSnapshot ya maneja errors de red — no necesitamos probe extra
            // Solo escuchar el evento 'online' del browser para reconectar
        } catch(e) { /* ignorar */ }
    }
}

// ═══════════════════════════════════════════════════════════
// SANITIZACIÓN CENTRALIZADA DE DATOS
// ═══════════════════════════════════════════════════════════

// Cleans a value before it goes to Firebase.
// Returns the sanitized value, or throws if invalid and required.
const sanitize = {
    // Safe string — trim, strip control chars, cap length
    str(val, max = 500) {
        if (val === null || val === undefined) return '';
        return String(val).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim().slice(0, max);
    },
    // Numeric — returns float or 0; never NaN/Infinity
    num(val, min = 0, max = 99999999) {
        const n = parseFloat(String(val).replace(/[^0-9.\-]/g, ''));
        if (!isFinite(n)) return 0;
        return Math.min(Math.max(n, min), max);
    },
    // Integer
    int(val, min = 0, max = 99999) {
        return Math.round(sanitize.num(val, min, max));
    },
    // Percentage 0-100
    pct(val) { return sanitize.num(val, 0, 100); },
    // Phone — keep digits, spaces, +, -, ()
    phone(val) {
        return String(val || '').replace(/[^0-9\s\+\-\(\)]/g, '').trim().slice(0, 20);
    },
    // Email — basic lowercase trim
    email(val) {
        return String(val || '').toLowerCase().trim().slice(0, 254);
    },
    // Date ISO string — returns '' if invalid
    date(val) {
        if (!val) return '';
        const d = new Date(val);
        return isNaN(d.getTime()) ? '' : d.toISOString();
    },
    // Safe ID — alphanumeric + dash/underscore only
    id(val) {
        return String(val || '').replace(/[^a-zA-Z0-9\-_]/g, '').slice(0, 64);
    },
    // Boolean
    bool(val) { return val === true || val === 'true' || val === 1; },

    // Deep-clean an entire patient object before saving
    paciente(p) {
        if (!p || typeof p !== 'object') return null;
        return {
            ...p,
            id:                   sanitize.id(p.id),
            nombre:               sanitize.str(p.nombre, 120),
            cedula:               sanitize.str(p.cedula, 20),
            telefono:             sanitize.phone(p.telefono),
            email:                sanitize.email(p.email),
            fechaNacimiento:      p.fechaNacimiento ? sanitize.str(p.fechaNacimiento, 10) : '',
            sexo:                 ['M','F',''].includes(p.sexo) ? p.sexo : '',
            grupoSanguineo:       sanitize.str(p.grupoSanguineo, 5),
            direccion:            sanitize.str(p.direccion, 300),
            alergias:             sanitize.str(p.alergias, 500),
            condiciones:          sanitize.str(p.condiciones, 500),
            seguro:               sanitize.str(p.seguro, 100),
            emergenciaNombre:     sanitize.str(p.emergenciaNombre, 120),
            emergenciaTelefono:   sanitize.phone(p.emergenciaTelefono),
        };
    },

    // Deep-clean a factura object
    factura(f) {
        if (!f || typeof f !== 'object') return null;
        return {
            ...f,
            id:          sanitize.id(f.id),
            numero:      sanitize.str(f.numero, 30),
            paciente:    sanitize.str(f.paciente, 120),
            profesional: sanitize.str(f.profesional, 120),
            total:       sanitize.num(f.total),
            subtotal:    sanitize.num(f.subtotal),
            descuento:   sanitize.pct(f.descuento),
            notas:       sanitize.str(f.notas, 1000),
            procedimientos: (f.procedimientos || []).map(pr => ({
                ...pr,
                descripcion:   sanitize.str(pr.descripcion, 300),
                precioUnitario: sanitize.num(pr.precioUnitario),
                cantidad:       sanitize.int(pr.cantidad, 1),
            })),
            pagos: (f.pagos || []).map(pg => ({
                ...pg,
                monto:  sanitize.num(pg.monto),
                metodo: sanitize.str(pg.metodo, 50),
            })),
        };
    },

    // Deep-clean an inventario item
    item(i) {
        if (!i || typeof i !== 'object') return null;
        return {
            ...i,
            id:           sanitize.id(i.id),
            nombre:       sanitize.str(i.nombre, 200),
            categoria:    sanitize.str(i.categoria, 100),
            proveedor:    sanitize.str(i.proveedor, 200),
            unidad:       sanitize.str(i.unidad, 50),
            stock:        sanitize.num(i.stock, 0, 9999999),
            stockMinimo:  sanitize.num(i.stockMinimo, 0, 9999999),
            costo:        sanitize.num(i.costo),
            notas:        sanitize.str(i.notas, 500),
            activo:       sanitize.bool(i.activo !== false),
            movimientos:  (i.movimientos || []).map(m => ({
                ...m,
                tipo:       sanitize.str(m.tipo, 20),
                cantidad:   sanitize.num(m.cantidad, -9999999, 9999999),
                motivo:     sanitize.str(m.motivo, 300),
                usuario:    sanitize.str(m.usuario, 120),
                fecha:      sanitize.str(m.fecha, 30),
            })),
        };
    },

    // Deep-clean a cita object
    cita(c) {
        if (!c || typeof c !== 'object') return null;
        return {
            ...c,
            id:          sanitize.id(c.id),
            paciente:    sanitize.str(c.paciente, 120),
            profesional: sanitize.str(c.profesional, 120),
            motivo:      sanitize.str(c.motivo, 500),
            hora:        sanitize.str(c.hora, 10),
            duracionMin: sanitize.int(c.duracionMin, 5, 480),
        };
    },
};

// ── Error display helper — friendlier than alert() ──────
function showError(msg, detail) {
    const friendly = {
        'permission-denied':  'Sin permiso para guardar. Recarga la página.',
        'unavailable':        'Sin conexión con el servidor. Verifica tu internet.',
        'deadline-exceeded':  'La operación tardó demasiado. Intenta de nuevo.',
        'not-found':          'Documento no encontrado en Firebase.',
        'already-exists':     'Ya existe un registro con ese ID.',
    };
    const code = detail?.code?.replace('firestore/', '') || '';
    const text = friendly[code] || msg;
    setConnectionState('error');
    showToast(`❌ ${text}`, 5000, '#c0392b');
    console.error('[SMILE]', msg, detail);
    // Registrar en el log de errores del admin
    logErrorToFirestore(code || 'DEFAULT', msg, detail?.message || String(detail || ''), 'showError');
}

// Registra errores en Firestore para que aparezcan en el admin log.
// Se llama automáticamente desde showError() y desde canWriteToFirebase().
// Cola local para errores que no pudieron enviarse a Firestore aún
const _errorQueue = [];

async function logErrorToFirestore(codigoError, titulo, detalle, contexto) {
    if (!CLINIC_PATH) return;

    const severidades = {
        'permission-denied': 'critico',
        'snapshot-not-found': 'critico',
        'unavailable':        'error',
        'not-found':          'error',
        'deadline-exceeded':  'aviso',
        'already-exists':     'aviso',
        'cache-corrupto':     'info',
        'canWriteToFirebase': 'aviso',
    };

    const entrada = {
        fecha:       new Date().toISOString(),
        clinicaId:   CLINIC_PATH,
        codigoError: codigoError || 'DEFAULT',
        titulo:      titulo || 'Error sin título',
        detalle:     String(detalle || '').slice(0, 500),
        usuario:     (typeof appData !== 'undefined' && appData.currentUser) || 'Sistema',
        contexto:    contexto || '',
        severidad:   severidades[codigoError] || 'error',
        resuelto:    false,
    };

    try {
        // Verificar que Firebase Auth está lista antes de escribir
        const user = firebase.auth().currentUser;
        if (!user) {
            // Auth no lista — encolar para reintentar después del login
            _errorQueue.push(entrada);
            console.warn('[ErrorLog] Auth no lista, error encolado:', codigoError);
            return;
        }
        await db.collection('smile_errors').add(entrada);
    } catch(e) {
        // Si falla (ej: sin conexión), encolar para reintentar
        _errorQueue.push(entrada);
        console.warn('[ErrorLog] No se pudo registrar en Firestore, encolado:', e.message);
    }
}

// Llamar después del login exitoso para vaciar la cola de errores
async function _flushErrorQueue() {
    if (_errorQueue.length === 0) return;
    const pendientes = [..._errorQueue];
    _errorQueue.length = 0; // vaciar antes de reintentar para evitar duplicados
    for (const entrada of pendientes) {
        try {
            await db.collection('smile_errors').add(entrada);
        } catch(e) {
            console.warn('[ErrorLog] Error al vaciar cola:', e.message);
            _errorQueue.push(entrada); // re-encolar si sigue fallando
        }
    }
}

// Generic toast notification
function showToast(text, duration = 3000, bg = '#1E1C1A') {
    let toast = document.getElementById('smileToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'smileToast';
        toast.style.cssText = `
            position:fixed;bottom:90px;left:50%;transform:translateX(-50%) translateY(20px);
            background:${bg};color:white;padding:10px 20px;border-radius:100px;
            font-size:13px;font-family:inherit;z-index:99999;opacity:0;
            transition:opacity 0.25s,transform 0.25s;pointer-events:none;
            box-shadow:0 4px 20px rgba(0,0,0,0.25);white-space:nowrap;max-width:90vw;text-align:center;`;
        document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.style.background = bg;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
    }, duration);
}

// Load data from Firebase

async function loadData() {
    try {
        // Intentar cargar desde caché primero (más rápido)
        const cached = localStorage.getItem('clinicaData_cache_' + (CLINIC_PATH || 'default'));
        const cacheTimestamp = localStorage.getItem('clinicaData_cacheTime_' + (CLINIC_PATH || 'default'));

        // Si hay caché reciente (menos de 5 minutos), usarlo temporalmente
        if (cached && cacheTimestamp) {
            const cacheAge = Date.now() - parseInt(cacheTimestamp);
            if (cacheAge < 5 * 60 * 1000) { // 5 minutos
                try {
                    const cachedData = JSON.parse(cached);
                    Object.assign(appData, cachedData);
                    // Continuar cargando desde Firebase en background
                } catch(e) {
                    // Cache corrupto — limpiar y continuar con Firebase
                    console.warn('[Cache] JSON inválido, limpiando cache.', e.message);
                    localStorage.removeItem('clinicaData_cache_' + (CLINIC_PATH || 'default'));
                    localStorage.removeItem('clinicaData_cacheTime_' + (CLINIC_PATH || 'default'));
                }
            }
        }
        const doc = await db.collection('clinicas').doc(CLINIC_PATH).get();

        if (doc.exists) {
            const data = doc.data();
            appData.facturas = (data.facturas || []).map(f => ({
                ...f,
                pagos: f.pagos || [],
                procedimientos: f.procedimientos || [],
                ordenesLab: f.ordenesLab || [],
            }));
            appData.personal = data.personal || getDefaultPersonal();
            appData.gastos = data.gastos || [];
            appData.avances = data.avances || [];
            appData.cuadresDiarios = data.cuadresDiarios || {};
            appData.citas = data.citas || [];
            appData.settings = data.settings || {};
            appData.laboratorios = data.laboratorios || [];
            appData.reversiones = data.reversiones || [];
            appData.auditLogs = data.auditLogs || [];
            appData.inventario = (data.inventario || []).map(i => ({ movimientos: [], ...i }));

            // Cargar pacientes desde subcollection (siempre en SMILE multi-tenant)
            const pacientesSnapshot = await db.collection('clinicas').doc(CLINIC_PATH)
                .collection('pacientes').get();
            if (pacientesSnapshot.size > 0) {
                appData.pacientes = pacientesSnapshot.docs.map(doc => doc.data());
            } else {
                appData.pacientes = data.pacientes || [];
            }

            // Guardar en caché local
            updateLocalCache();

            // Limpiar/migrar datos antiguos automáticamente
            await limpiarDatosAntiguos();
        } else {
            // Doc no existe — inicializar todos los campos con defaults seguros
            appData.facturas       = [];
            appData.personal       = getDefaultPersonal();
            appData.gastos         = [];
            appData.avances        = [];
            appData.cuadresDiarios = {};
            appData.citas          = [];
            appData.settings       = {};
            appData.laboratorios   = [];
            appData.reversiones    = [];
            appData.auditLogs      = [];
            appData.pacientes      = [];
            await saveData('saveData-init');
        }
    } catch (error) {
        console.error('❌ Error loading from Firebase:', error.code, error.message);
        logErrorToFirestore(error.code || 'load-error', 'Error al cargar datos de la clínica',
            error.message, 'loadData');

        if (error.code === 'permission-denied') {
            // Problema de autenticación — no es offline, es un problema de auth
            console.error('[loadData] permission-denied: Firebase Auth no está lista o las rules bloquearon la lectura');
            showToast('⚠️ Error de autenticación. Recarga la página.', 7000, '#c0392b');
            // Intentar re-autenticar y reintentar UNA vez
            try {
                await ensureFirebaseAuth();
                const docRetry = await db.collection('clinicas').doc(CLINIC_PATH).get();
                if (docRetry.exists) {
                    const data = docRetry.data();
                    appData.facturas       = (data.facturas || []).map(f => ({ ...f, pagos: f.pagos||[], procedimientos: f.procedimientos||[], ordenesLab: f.ordenesLab||[] }));
                    appData.personal       = data.personal || getDefaultPersonal();
                    appData.gastos         = data.gastos         || [];
                    appData.avances        = data.avances        || [];
                    appData.cuadresDiarios = data.cuadresDiarios || {};
                    appData.citas          = data.citas          || [];
                    appData.laboratorios   = data.laboratorios   || [];
                    appData.inventario     = (data.inventario    || []).map(i => ({ movimientos: [], ...i }));
                    appData.reversiones    = data.reversiones    || [];
                    appData.auditLogs      = data.auditLogs      || [];
                    updateLocalCache();
                    showToast('✓ Conexión restablecida', 2500);
                    return; // éxito en el retry
                }
            } catch(retryErr) {
                console.error('[loadData] Retry también falló:', retryErr.message);
            }
        } else {
            // Error de red genuino
            setConnectionState('offline');
        }

        // Fall back a cache si está disponible
        const cached = localStorage.getItem('clinicaData_cache_' + (CLINIC_PATH || 'default'));
        if (cached) {
            try {
                const cachedData = JSON.parse(cached);
                Object.assign(appData, cachedData);
                // Restaurar branding desde cache si loadClinicBranding también falló
                if (!clinicConfig.color && cachedData.clinicColor) {
                    _loadBrandingFromCache();
                }
                if (error.code !== 'permission-denied') {
                    showToast('⚠️ Sin conexión — mostrando datos guardados localmente', 5000, '#e65100');
                }
            } catch(e) {
                appData.personal = getDefaultPersonal();
            }
        } else {
            appData.personal = getDefaultPersonal();
            if (error.code !== 'permission-denied') {
                showToast('⚠️ Sin conexión. Verifica tu internet e intenta de nuevo.', 6000, '#e65100');
            }
        }
    }
}

function updateLocalCache() {
    try {
        // Guardar copia en localStorage (sin placas para no llenar)
        const dataToCache = {
            facturas: appData.facturas,
            personal: appData.personal,
            gastos: appData.gastos,
            avances: appData.avances,
            cuadresDiarios: appData.cuadresDiarios,
            pacientes: appData.pacientes.map(p => ({
                ...p,
                placas: [] // No cachear placas (muy pesadas)
            })),
            citas: appData.citas,
            laboratorios: appData.laboratorios,
            reversiones: appData.reversiones,
            auditLogs: appData.auditLogs,
            inventario: appData.inventario || [],
            // Guardar branding para restaurar offline sin Firebase
            clinicColor:  clinicConfig.color  || null,
            clinicNombre: clinicConfig.nombre  || null,
            clinicLogo:   clinicConfig.logoNegativo || clinicConfig.logoPositivo || null,
        };

        localStorage.setItem('clinicaData_cache_' + (CLINIC_PATH || 'default'), JSON.stringify(dataToCache));
        localStorage.setItem('clinicaData_cacheTime_' + (CLINIC_PATH || 'default'), Date.now().toString());
    } catch (e) {
        console.warn('No se pudo guardar caché:', e);
        // Si localStorage está lleno, limpiar caché viejo
        localStorage.removeItem('clinicaData_cache_' + (CLINIC_PATH || 'default'));
    }
}

// ── GUARDIA DE ESCRITURA A FIREBASE ──────────────────────────
// Valida que el estado de la app es coherente antes de enviar
// datos a Firestore. Si algo está mal, cancela la escritura y
// muestra un aviso amable. Previene corrupción de datos.
function canWriteToFirebase(context = '') {
    // 1. Debe haber una clínica activa
    if (!CLINIC_PATH) {
        console.error('[Write Guard] Sin CLINIC_PATH —', context);
        showToast('⚠️ No hay clínica activa. Recarga la página.', 5000, '#e65100');
        return false;
    }

    // 2. CLINIC_PATH no puede ser vacío ni solo espacios
    if (CLINIC_PATH.trim() === '') {
        console.error('[Write Guard] CLINIC_PATH vacío —', context);
        showToast('⚠️ ID de clínica inválido. Recarga la página.', 5000, '#e65100');
        return false;
    }

    // 3. El CLINIC_PATH activo debe coincidir con la sesión
    const sessionClinica = sessionStorage.getItem('smile_clinica_session');
    if (sessionClinica && sessionClinica !== CLINIC_PATH) {
        console.error(`[Write Guard] Mismatch clínica: CLINIC_PATH=${CLINIC_PATH}, sesión=${sessionClinica} — ${context}`);
        logErrorToFirestore('canWriteToFirebase', 'Conflicto de sesión al intentar guardar', `CLINIC_PATH=${CLINIC_PATH} vs sesión=${sessionClinica}`, context);
        showToast('⚠️ Conflicto de sesión detectado. Recarga la página.', 6000, '#c0392b');
        return false;
    }

    // 4. Debe haber un usuario logueado (excepto en init)
    const allowedWithoutUser = ['saveData-init', 'savePaciente-init'];
    if (!appData?.currentUser && !allowedWithoutUser.includes(context)) {
        console.error('[Write Guard] Sin usuario logueado —', context);
        showToast('⚠️ Tu sesión expiró. Inicia sesión de nuevo.', 5000, '#e65100');
        return false;
    }

    return true;
}

// Save data to Firebase
async function saveData(context = '') {
    // Guardia: validar estado antes de escribir
    if (!canWriteToFirebase(context || 'saveData')) return;

    try {
        setConnectionState('saving');

        // Sanitize arrays before writing to Firebase
        const facturasSafe  = (appData.facturas  || []).map(f => sanitize.factura(f)).filter(Boolean);
        const citasSafe     = (appData.citas     || []).map(c => sanitize.cita(c)).filter(Boolean);

        await db.collection('clinicas').doc(CLINIC_PATH).set({
            facturas:     facturasSafe,
            personal:     appData.personal,
            gastos:       appData.gastos,
            avances:      appData.avances,
            cuadresDiarios: appData.cuadresDiarios || {},
            pacientes:    [],  // always empty — live in subcollection
            citas:        citasSafe,
            laboratorios: appData.laboratorios || [],
            inventario:   (appData.inventario || []).map(i => sanitize.item(i)).filter(Boolean),
            reversiones:  appData.reversiones  || [],
            auditLogs:    appData.auditLogs    || [],
            settings:     appData.settings     || {},
            lastUpdated:  new Date().toISOString(),
            usaSubcollectionPacientes: true
        });

        // Save patients in batches of 100
        if (appData.pacientes.length > 0) {
            const BATCH_SIZE = 100;
            for (let i = 0; i < appData.pacientes.length; i += BATCH_SIZE) {
                const batch = db.batch();
                const lote = appData.pacientes.slice(i, Math.min(i + BATCH_SIZE, appData.pacientes.length));
                lote.forEach(paciente => {
                    const docRef = db.collection('clinicas').doc(CLINIC_PATH)
                        .collection('pacientes').doc(paciente.id || generateId('PAC-'));
                    batch.set(docRef, sanitize.paciente(paciente) || paciente);
                });
                await batch.commit();
            }
        }
        updateLocalCache();
        setConnectionState('online');
    } catch (error) {
        showError('Error al guardar los datos. Intenta de nuevo.', error);
    }
}

// Guarda UN solo paciente sin re-escribir todos los demás.
// Usar cuando solo cambió la ficha de un paciente (recetas, consentimiento, placas, etc.)
async function savePaciente(paciente) {
    if (!paciente || !paciente.id) {
        console.warn('savePaciente: paciente sin ID, fallback a saveData()');
        return saveData('savePaciente-fallback');
    }
    // Guardia: validar estado antes de escribir
    if (!canWriteToFirebase('savePaciente')) return;

    try {
        setConnectionState('saving');
        const safe = sanitize.paciente(paciente) || paciente;
        await db.collection('clinicas').doc(CLINIC_PATH)
            .collection('pacientes').doc(paciente.id)
            .set(safe);
        updateLocalCache();
        setConnectionState('online');
    } catch (error) {
        showError('Error al guardar el paciente.', error);
    }
}

// Default personnel data — generic for any new SMILE clinic
function getDefaultPersonal() {
    // Returns a generic admin user — password should be set during clinic creation
    return [
        {id: '1', nombre: 'Administrador', tipo: 'regular', password: null, isAdmin: true, canAccessReception: true}
    ];
}

// Real-time synchronization
// Real-time listener se inicializa en login() via initRealtimeListener()
let unsubscribeSnapshot = null;

function initRealtimeListener() {
    if (unsubscribeSnapshot) unsubscribeSnapshot();
    unsubscribeSnapshot = db.collection('clinicas').doc(CLINIC_PATH).onSnapshot(
        (doc) => {
            // Doc eliminado o no existe — no tocar appData
            if (!doc.exists) {
                console.warn('[Snapshot] Documento no encontrado:', CLINIC_PATH);
                return;
            }

            // Ignorar escrituras pendientes propias para evitar loops
            if (doc.metadata.hasPendingWrites) return;

            const data = doc.data() || {};

            // Todos los campos con defaults seguros — nunca undefined
            appData.facturas = (data.facturas || []).map(f => ({
                ...f,
                pagos:          f.pagos          || [],
                procedimientos: f.procedimientos || [],
                ordenesLab:     f.ordenesLab     || [],
            }));
            appData.personal       = data.personal       || getDefaultPersonal();
            appData.gastos         = data.gastos         || [];
            appData.avances        = data.avances        || [];
            appData.cuadresDiarios = data.cuadresDiarios || {};
            appData.citas          = data.citas          || [];
            appData.laboratorios   = data.laboratorios   || [];
            appData.inventario     = (data.inventario    || []).map(i => ({ movimientos: [], ...i }));
            appData.reversiones    = data.reversiones    || [];
            appData.auditLogs      = data.auditLogs      || [];

            // Pacientes viven en subcolleccion — no sobreescribir.
            // Solo usar como fallback si la subcolleccion aun no cargo nada.
            if (!appData.pacientes || appData.pacientes.length === 0) {
                appData.pacientes = data.pacientes || [];
            }

            updateLocalCache();

            // Refrescar la tab activa si el usuario ya esta logueado
            if (!appData.currentUser) return;
            const activeTab = document.querySelector('.tab-content.active');
            if (!activeTab) return;
            const tabId = activeTab.id.replace('tab-', '');
            if (tabId === 'ingresos')    updateIngresosTab();
            if (tabId === 'cobrar')      updateCobrarTab();
            if (tabId === 'gastos')      updateGastosTab();
            if (tabId === 'personal')    updatePersonalTab();
            if (tabId === 'laboratorio') updateLaboratorioTab();
            if (tabId === 'agenda')      updateAgendaTab();
            if (tabId === 'pacientes')   updatePacientesTab();
            // cuadre excluido intencionalmente — su propio save dispara un loop
        },
        (error) => {
            // Error del listener (auth expirada, sin conexion, reglas, etc.)
            console.error('[Snapshot] Error en listener:', error.code, error.message);
            logErrorToFirestore(error.code, 'Error en listener de Firestore', error.message, 'onSnapshot');
            if (error.code === 'permission-denied') {
                showToast('Sesion expirada. Recarga la pagina.', 6000, '#c0392b');
            } else {
                setConnectionState('offline');
            }
        }
    );
}



// ========================================
// INITIALIZE APP
// ========================================

// Wait for Firebase to be ready, then load data
window.addEventListener('load', async function() {
    const clinicaDetectada = detectClinica();

    if (!clinicaDetectada) {
        // Sin clínica en URL → mostrar pantalla de acceso por ID
        mostrarPantallaAcceso();
        return;
    }

    console.log(`🏥 Clínica activa: ${CLINIC_PATH}`);
    initConnectionMonitor(); // ← Estado de conexión correcto desde el inicio
    await ensureFirebaseAuth(); // ← Auth ANTES de cualquier lectura Firestore
    await loadClinicBranding();
    await loadData();
    updateProfessionalPicker();
    inicializarEstadosCitas();
});

// ── PANTALLA DE ACCESO POR ID DE CLÍNICA ──────────────────────
function mostrarPantallaAcceso() {
    const overlay = document.getElementById('clinicAccessOverlay');
    if (overlay) overlay.style.display = 'flex';
}

async function accederPorId() {
    const idInput = document.getElementById('clinicIdInput');
    const passInput = document.getElementById('clinicAccessPass');
    const errEl = document.getElementById('clinicAccessErr');
    const btn = document.getElementById('clinicAccessBtn');

    const clinicId = (idInput.value || '').toLowerCase()
        .replace(/[áàä]/g,'a').replace(/[éèë]/g,'e')
        .replace(/[íìï]/g,'i').replace(/[óòö]/g,'o')
        .replace(/[úùü]/g,'u').replace(/ñ/g,'n')
        .replace(/[^a-z0-9-]/g,'-').replace(/--+/g,'-').replace(/^-|-$/g,'');
    const password = passInput.value.trim();

    if (!clinicId) { errEl.textContent = 'Escribe el ID de tu clínica.'; errEl.style.display='block'; return; }
    if (!password) { errEl.textContent = 'Escribe tu contraseña.'; errEl.style.display='block'; return; }

    btn.disabled = true;
    btn.textContent = 'Verificando...';
    errEl.style.display = 'none';

    try {
        // Ensure Firebase auth for Firestore rules
        const auth = firebase.auth();
        if (!auth.currentUser) await auth.signInAnonymously();

        // Check clinic exists
        const doc = await db.collection('clinicas').doc(clinicId).get();
        if (!doc.exists) {
            errEl.textContent = 'No encontramos una clínica con ese ID.';
            errEl.style.display = 'block';
            btn.disabled = false; btn.textContent = 'Entrar →';
            return;
        }

        // Find admin user in personal array and verify password
        const data = doc.data() || {};
        const personal = data.personal || [];
        const admin = personal.find(p => p.isAdmin);

        if (!admin) {
            errEl.textContent = 'Esta clínica no tiene administrador configurado.';
            errEl.style.display = 'block';
            btn.disabled = false; btn.textContent = 'Entrar →';
            return;
        }

        // Set CLINIC_PATH so hashPassword uses the correct salt
        CLINIC_PATH = clinicId;

        // Verify password (handles both hashed and plaintext legacy)
        const valid = await verifyPassword(admin, password);
        if (!valid) {
            CLINIC_PATH = null; // reset on failure
            errEl.textContent = 'Contraseña incorrecta.';
            errEl.style.display = 'block';
            btn.disabled = false; btn.textContent = 'Entrar →';
            return;
        }

        // ✅ Correct — redirect to clinic URL
        const base = window.location.origin + window.location.pathname;
        window.location.href = base + '?clinica=' + clinicId;

    } catch(e) {
        console.error('accederPorId error:', e);
        errEl.textContent = 'Error de conexión. Intenta de nuevo.';
        errEl.style.display = 'block';
        btn.disabled = false; btn.textContent = 'Entrar →';
    }
}

// ========================================
// REST OF THE APP CODE
// ========================================

// Data Storage
let appData = {
    facturas: [],
    personal: [],
    gastos: [],
    avances: [],
    cuadresDiarios: {},
    pacientes: [],
    citas: [],
    laboratorios: [],
    currentUser: null,
    currentRole: null
};

let currentPersonalToEdit = null;
let currentReciboText = '';
let currentFacturaToReverse = null;

// Role selector
document.querySelectorAll('.role-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');

        const role = this.dataset.role;

        // Hide all first
        document.getElementById('professionalSelect').classList.add('hidden');
        document.getElementById('receptionSelect').classList.add('hidden');
        document.getElementById('usernameInput').classList.add('hidden');

        // Show correct one
        if (role === 'professional') {
            document.getElementById('professionalSelect').classList.remove('hidden');
        } else if (role === 'reception') {
            document.getElementById('receptionSelect').classList.remove('hidden');
            updateReceptionPicker();
        } else {
            document.getElementById('usernameInput').classList.remove('hidden');
        }
    });
});

// Update professional picker
function updateProfessionalPicker() {
    // Rellena el selector unificado del nuevo login
    const picker = document.getElementById('loginUsername');
    if (!picker) return;
    picker.innerHTML = '<option value="">Selecciona tu usuario</option>';
    appData.personal.forEach(p => {
        picker.innerHTML += `<option value="${p.id || p.nombre}">${p.nombre}${p.isAdmin ? ' (Admin)' : ''}</option>`;
    });
}

// ═══════════════════════════════════════════════════════════
// SEGURIDAD — SHA-256, RATE LIMITING, SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// UTILIDADES — estas funciones son candidatas a utils.js
// cuando el proyecto crezca. Son puras (sin side effects)
// y no dependen de appData ni del DOM.
// Candidatas: sha256, hashPassword, verifyPassword,
//             formatCurrency, generateId, darkenColor,
//             lightenColor, sanitize, getTodayKey,
//             isSameDayTZ, getTimezone
// ═══════════════════════════════════════════════════════════

// SHA-256 via Web Crypto API (nativo en todos los browsers modernos)
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray  = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Hash a password with a clinic-specific salt.
// Salt = CLINIC_PATH so hashes are unique per clinic even if password is the same.
async function hashPassword(plaintext) {
    const salt = CLINIC_PATH || 'smile-default-salt';
    return sha256(salt + ':' + plaintext);
}

// Migrate a plaintext password to hash on first successful login.
// Silent — user never notices.
async function migratePasswordIfNeeded(person, plaintext) {
    if (!person || person._pwHashed) return; // already migrated
    try {
        const hashed = await hashPassword(plaintext);
        person.password    = hashed;
        person._pwHashed   = true;
        await saveData('saveData-init');
        console.log('[Auth] Contraseña migrada a SHA-256 para:', person.nombre);
    } catch(e) {
        console.warn('[Auth] No se pudo migrar contraseña:', e);
    }
}

// Compare entered password against stored hash (or plaintext for legacy accounts)
async function verifyPassword(person, entered) {
    if (!person?.password) return false;
    if (person._pwHashed) {
        // Already hashed — compare hash
        const enteredHash = await hashPassword(entered);
        return person.password === enteredHash;
    } else {
        // Legacy plaintext — compare directly, then migrate silently
        const match = person.password === entered;
        if (match) migratePasswordIfNeeded(person, entered); // async, non-blocking
        return match;
    }
}

// ── RATE LIMITING ─────────────────────────────────────────
// Stored in memory only — resets on reload (intentional for UX)
const _loginAttempts = {}; // key: username, value: {count, lockedUntil}
const MAX_ATTEMPTS   = 5;
const LOCKOUT_MS     = 5 * 60 * 1000; // 5 minutes

function checkRateLimit(username) {
    const now    = Date.now();
    const record = _loginAttempts[username] || { count: 0, lockedUntil: 0 };

    if (record.lockedUntil > now) {
        const remaining = Math.ceil((record.lockedUntil - now) / 1000 / 60);
        showToast(`🔒 Cuenta bloqueada. Intenta en ${remaining} min.`, 5000, '#c0392b');
        return false;
    }
    return true;
}

function recordFailedAttempt(username) {
    const record = _loginAttempts[username] || { count: 0, lockedUntil: 0 };
    record.count++;
    if (record.count >= MAX_ATTEMPTS) {
        record.lockedUntil = Date.now() + LOCKOUT_MS;
        record.count = 0;
        showToast(`🔒 Demasiados intentos. Bloqueado por 5 minutos.`, 6000, '#c0392b');
        registrarAuditoria('seguridad', 'login_bloqueado', `${username} bloqueado por exceso de intentos`);
    }
    _loginAttempts[username] = record;
}

function clearLoginAttempts(username) {
    delete _loginAttempts[username];
}

// ── SESSION MANAGEMENT ────────────────────────────────────
const SESSION_DURATION_MS  = 8 * 60 * 60 * 1000;  // 8 hours absolute
const INACTIVITY_MS        = 30 * 60 * 1000;       // 30 min inactivity
let _sessionExpiry         = 0;
let _inactivityTimer       = null;
let _sessionCheckInterval  = null;

function startSession(username) {
    const now = Date.now();
    _sessionExpiry = now + SESSION_DURATION_MS;

    // Store session metadata (not sensitive data)
    sessionStorage.setItem('smile_session', JSON.stringify({
        user: username,
        clinic: CLINIC_PATH,
        expires: _sessionExpiry,
        lastActivity: now
    }));

    resetInactivityTimer();

    // Check session validity every minute
    clearInterval(_sessionCheckInterval);
    _sessionCheckInterval = setInterval(checkSessionValidity, 60 * 1000);
}

function resetInactivityTimer() {
    clearTimeout(_inactivityTimer);
    _inactivityTimer = setTimeout(() => {
        expireSession('inactividad (30 min)');
    }, INACTIVITY_MS);

    // Update lastActivity
    try {
        const raw = sessionStorage.getItem('smile_session') || '{}';
        const s = JSON.parse(raw);
        if (s.user) {
            s.lastActivity = Date.now();
            sessionStorage.setItem('smile_session', JSON.stringify(s));
        }
    } catch(e) {
        // Session corrupta — limpiar silenciosamente
        sessionStorage.removeItem('smile_session');
    }
}

function checkSessionValidity() {
    if (!appData.currentUser) return;
    if (Date.now() > _sessionExpiry) {
        expireSession('tiempo máximo de sesión (8h)');
    }
}

function expireSession(reason) {
    clearTimeout(_inactivityTimer);
    clearInterval(_sessionCheckInterval);
    sessionStorage.removeItem('smile_session');

    // Only show message if user is actually logged in
    if (appData.currentUser) {
        registrarAuditoria('seguridad', 'sesion_expirada', `Sesión cerrada por: ${reason}`);
        // Save audit log before logging out
        saveData().finally(() => {
            showToast(`🔒 Sesión cerrada por ${reason}. Inicia sesión de nuevo.`, 6000, '#c0392b');
            logout();
        });
    }
}

// Register user activity — call on any interaction
// Guard: puede ser llamada antes de que app.js cargue (onmousemove en body)
function registerActivity() {
    if (typeof appData !== 'undefined' && appData.currentUser) resetInactivityTimer();
}

// ── FIREBASE ANONYMOUS AUTH ───────────────────────────────
// Creates an anonymous Firebase Auth session per login.
// This lets Firestore Security Rules verify request.auth != null
// without requiring email/password Firebase Auth.
let _firebaseAuthUid = null;

async function ensureFirebaseAuth() {
    // Verificar que el SDK de Auth está disponible
    if (!firebase.auth) {
        console.error('[Auth] firebase-auth-compat.js no cargado. Verificar scripts en HTML.');
        return;
    }

    const auth = firebase.auth();

    // Ya autenticado en esta sesión
    if (auth.currentUser) {
        _firebaseAuthUid = auth.currentUser.uid;
        return;
    }

    // Intentar auth anónima con timeout de 8 segundos y 2 reintentos
    const intentarAuth = () => new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('auth-timeout')), 8000);
        auth.signInAnonymously()
            .then(cred => { clearTimeout(timeout); resolve(cred); })
            .catch(err => { clearTimeout(timeout); reject(err); });
    });

    for (let intento = 1; intento <= 3; intento++) {
        try {
            const cred = await intentarAuth();
            _firebaseAuthUid = cred.user.uid;
            console.log(`[Auth] Firebase auth OK (intento ${intento}):`, _firebaseAuthUid);
            return;
        } catch(e) {
            console.warn(`[Auth] Intento ${intento}/3 fallido:`, e.message);
            if (intento < 3) await new Promise(r => setTimeout(r, 1000 * intento)); // espera 1s, 2s
        }
    }

    // Si falló los 3 intentos, continuar sin auth (las reglas pueden fallar)
    console.error('[Auth] No se pudo establecer sesión Firebase después de 3 intentos.');
    logErrorToFirestore('auth-failed', 'Error de autenticación Firebase',
        'signInAnonymously falló 3 veces al cargar la app', 'ensureFirebaseAuth');
}

// Update reception picker (unified with professional picker in new login)
function updateReceptionPicker() {
    updateProfessionalPicker(); // same unified selector
}

// Login — async to support SHA-256 password verification
async function login() {
    const select   = document.getElementById('loginUsername');
    const pinInput = document.getElementById('loginPassword');
    const errorDiv = document.getElementById('loginError');

    const selectedId = select?.value;
    const pin        = pinInput?.value || '';

    // Reset error
    if (errorDiv) { errorDiv.style.display = 'none'; errorDiv.textContent = ''; }

    if (!selectedId) {
        if (errorDiv) { errorDiv.textContent = 'Selecciona tu usuario.'; errorDiv.style.display = 'block'; }
        return;
    }
    if (!pin) {
        if (errorDiv) { errorDiv.textContent = 'Ingresa tu PIN.'; errorDiv.style.display = 'block'; }
        return;
    }

    // Find the person by id or nombre
    const person = appData.personal.find(p => (p.id || p.nombre) === selectedId);
    if (!person) {
        if (errorDiv) { errorDiv.textContent = 'Usuario no encontrado. Recarga la página.'; errorDiv.style.display = 'block'; }
        return;
    }

    if (!person.password) {
        if (errorDiv) { errorDiv.textContent = 'Este usuario no tiene PIN configurado. Contacta al administrador.'; errorDiv.style.display = 'block'; }
        return;
    }

    if (!checkRateLimit(person.nombre)) return;

    const ok = await verifyPassword(person, pin);
    if (!ok) {
        recordFailedAttempt(person.nombre);
        if (errorDiv) { errorDiv.textContent = 'PIN incorrecto. Intenta de nuevo.'; errorDiv.style.display = 'block'; }
        if (pinInput) pinInput.value = '';
        return;
    }

    // Determine role
    if (person.isAdmin) {
        appData.currentRole = 'admin';
    } else if (person.canAccessReception) {
        appData.currentRole = 'reception';
    } else {
        appData.currentRole = 'professional';
    }

    clearLoginAttempts(person.nombre);
    appData.currentUser = person.nombre;

    await ensureFirebaseAuth();
    _flushErrorQueue().catch(e => console.warn('[ErrorLog] flush failed:', e));
    startSession(person.nombre);
    registrarAuditoria('seguridad', 'login', `Inicio de sesión: ${person.nombre} (${appData.currentRole})`);
    initRealtimeListener();
    await showApp();
}


// Logout
function logout() {
    if (confirm('🚪 ¿Cerrar sesión?\n\nSe cerrará tu sesión actual.')) {
        // Stop session timers
        clearTimeout(_inactivityTimer);
        clearInterval(_sessionCheckInterval);
        sessionStorage.removeItem('smile_session');
        localStorage.removeItem('clinicaData_cache_' + (CLINIC_PATH || 'default'));
        localStorage.removeItem('clinicaData_cacheTime_' + (CLINIC_PATH || 'default'));

        // Sign out Firebase anonymous session
        try { firebase.auth().signOut(); } catch(e) {}

        if (unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = null; }
        appData.currentUser = null;
        appData.currentRole = null;

        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('appContainer').style.display = 'none';
        document.getElementById('password').value = '';
        document.getElementById('username').value = '';
    }
}

// Show app
async function showApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';

    // Start network/Firebase connection monitor
    initConnectionMonitor();

    // Header: show clinic name (not user name — user is in the nav)
    const clinicTitle = clinicConfig.nombre || getNombreClinica();
    document.getElementById('appTitle').textContent = clinicTitle;

    // Apply logo in header
    applyLogoEverywhere(clinicConfig._logoSrc || clinicConfig.logoPositivo || null, clinicTitle);

    // Cargar y renderizar switcher de sedes (si aplica)
    await _cargarSedesGrupo();
    _renderSwitcherSedes();

    buildNavigation();

    // Iniciar en dashboard si es admin/profesional, pacientes si es recepción
    const tabInicial = (appData.currentRole === 'admin' || appData.currentRole === 'professional')
        ? 'dashboard'
        : 'pacientes';
    showTab(tabInicial);
    updatePerfilTab();
}

// Build navigation
function hasModule(key) {
    const always = ['dashboard','pacientes','agenda','factura','cobrar','cuadre','gastos','perfil'];
    if (always.includes(key)) return true;
    // Plan solo never gets nómina or multisucursal
    const soloExcluded = ['nomina', 'multisucursal'];
    if (clinicConfig.plan === 'solo' && soloExcluded.includes(key)) return false;
    // Trial o pago: solo módulos contratados en el onboarding
    // El trial ya NO da acceso a todos los módulos — solo a los elegidos
    return (clinicConfig.modulos || []).includes(key);
}

// Check if the logged-in user has a specific granular permission.
// Admin always has everything. For others, checks person.permisos[key].
// Undefined (never configured) defaults to true so existing accounts keep working.
function tienePermiso(key) {
    if (appData.currentRole === 'admin') return true;
    const person = appData.personal.find(p => p.nombre === appData.currentUser);
    if (!person) return false;
    if (!person.permisos) return true;
    return person.permisos[key] !== false;
}

function buildNavigation() {
    const role = appData.currentRole;

    const svgDash     = `<svg fill="currentColor" viewBox="0 0 20 20"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"></path></svg>`;
    const svgPax      = `<svg fill="currentColor" viewBox="0 0 20 20"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"></path></svg>`;
    const svgAgenda   = `<svg fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"></path></svg>`;
    const svgLab      = `<svg fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M7 2a1 1 0 00-.707 1.707L7 4.414v3.758a1 1 0 01-.293.707l-4 4C.817 14.769 2.156 18 4.828 18h10.344c2.672 0 4.011-3.231 2.122-5.121l-4-4A1 1 0 0113 8.172V4.414l.707-.707A1 1 0 0013 2H7zm2 6.172V4h2v4.172a3 3 0 00.879 2.12l1.027 1.028a4 4 0 00-2.171.102l-.47.156a4 4 0 01-2.53 0l-.563-.187a1.993 1.993 0 00-.114-.035l1.063-1.063A3 3 0 009 8.172z" clip-rule="evenodd"></path></svg>`;
    const svgCobros   = `<svg fill="currentColor" viewBox="0 0 20 20"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"></path><path fill-rule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clip-rule="evenodd"></path></svg>`;
    const svgMas      = `<svg fill="currentColor" viewBox="0 0 20 20"><path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z"></path></svg>`;

    let nav = '';

    // Dashboard — admin + profesional
    if (role === 'admin' || role === 'professional') {
        nav += `<button class="nav-item" onclick="showTab('dashboard')">${svgDash}<span>Dashboard</span></button>`;
    }

    // Pacientes — todos
    nav += `<button class="nav-item ${role === 'reception' ? 'active' : ''}" onclick="showTab('pacientes')">${svgPax}<span>Pacientes</span></button>`;

    // Agenda — todos
    nav += `<button class="nav-item" onclick="showTab('agenda')">${svgAgenda}<span>Agenda</span></button>`;

    // Lab — solo si módulo activo
    if (hasModule('laboratorio')) {
        nav += `<button class="nav-item" onclick="showTab('laboratorio')">${svgLab}<span>Lab</span></button>`;
    }

    // Cobros — admin + profesional (contiene factura, pendientes, ingresos, cuadre, gastos)
    if (role === 'admin' || role === 'professional') {
        nav += `<button class="nav-item" onclick="showTab('cobros')">${svgCobros}<span>Cobros</span></button>`;
    }

    // Más — siempre
    nav += `<button class="nav-item" onclick="abrirMas()">${svgMas}<span>Más</span></button>`;

    document.getElementById('bottomNav').innerHTML = nav;
}


function showTab(tabName) {
    if (tabName === 'catalogo') { renderCatalogoTab(); return; }
    if (tabName === 'miplan') { renderMiPlanTab(); return; }
    if (tabName === 'cobros') { renderCobrosTab(); return; }
    // Old tab names redirect to cobros subtab for consistency
    const cobrosMap = { 'factura': 'nueva', 'cobrar': 'cobrar', 'ingresos': 'ingresos', 'cuadre': 'cuadre', 'gastos': 'gastos' };
    if (cobrosMap[tabName]) { renderCobrosTab(cobrosMap[tabName]); return; }
    // Personal, reportes go through irTab
    if (tabName === 'personal' || tabName === 'reportes') { irTab(tabName); return; }
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const tab = document.getElementById(`tab-${tabName}`);
    if (tab) {
        tab.classList.add('active');
        const navButtons = Array.from(document.querySelectorAll('.nav-item'));
        const activeNav = navButtons.find(btn => btn.textContent.toLowerCase().includes(tabName));
        if (activeNav) activeNav.classList.add('active');

        if (tabName === 'factura') {
            // Mostrar selector de profesional solo si es admin
            const container = document.getElementById('selectorProfesionalFactura');
            if (container) {
                if (appData.currentRole === 'admin') {
                    container.style.display = 'block';
                    // Llenar dropdown con profesionales
                    const select = document.getElementById('profesionalQueAtendio');
                    const profesionales = appData.personal.filter(p => p.tipo !== 'empleado');
                    select.innerHTML = '<option value="">Seleccione el profesional...</option>' +
                        profesionales.map(p => `<option value="${p.nombre}">${p.nombre}</option>`).join('');
                } else {
                    container.style.display = 'none';
                }
            }
        }
        if (tabName === 'dashboard') updateDashboardTab();
        if (tabName === 'ingresos') updateIngresosTab();
        if (tabName === 'cobrar') updateCobrarTab();
        if (tabName === 'cuadre') updateCuadreTab();
        if (tabName === 'gastos') updateGastosTab();
        if (tabName === 'personal') updatePersonalTab();
        if (tabName === 'pacientes') updatePacientesTab();
        if (tabName === 'agenda') updateAgendaTab();
        if (tabName === 'laboratorio') updateLaboratorioTab();
    }
}

// Currency format
function formatCurrency(amount) {
    const simbolo = (typeof clinicConfig !== 'undefined' && clinicConfig.moneda) ? clinicConfig.moneda : 'RD$';
    const locale  = (typeof clinicConfig !== 'undefined' && clinicConfig.locale)  ? clinicConfig.locale  : getLocale();
    return simbolo + ' ' + parseFloat(amount || 0).toLocaleString(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

// ── Locale helper ───────────────────────────────────────
// Usa el locale de la clínica para formatear fechas y números.
// Fallback a getLocale() si clinicConfig no está listo todavía.
function getLocale() {
    return (typeof clinicConfig !== 'undefined' && clinicConfig.locale) ? clinicConfig.locale : 'es-419';
}

// Procedimientos
// Helper: always find factura form elements in the visible cobros-content clone,
// falling back to the hidden source tab. Fixes the duplicate-ID problem throughout.
function getFacturaEl(id) {
    const contenedor = document.getElementById('cobros-content');
    if (contenedor) {
        const el = contenedor.querySelector('#' + id);
        if (el) return el;
    }
    return document.getElementById(id);
}

let tempProcedimientos = [];

function openAddProcedimiento() {
    document.getElementById('procDesc').value = '';
    document.getElementById('procCant').value = '1';
    document.getElementById('procPrecio').value = '';
    openModal('modalAddProcedimiento');
}

function agregarProcedimiento() {
    const desc   = sanitize.str(document.getElementById('procDesc')?.value, 300);
    const cant   = sanitize.int(document.getElementById('procCant')?.value, 1, 999);
    const precio = sanitize.num(document.getElementById('procPrecio')?.value, 0);

    if (!desc)      { showToast('⚠️ Escribe la descripción del procedimiento'); return; }
    if (cant < 1)   { showToast('⚠️ La cantidad debe ser al menos 1'); return; }
    if (precio <= 0){ showToast('⚠️ El precio debe ser mayor a cero'); return; }

    tempProcedimientos.push({
        id: generateId(),
        descripcion: desc,
        cantidad: cant,
        precioUnitario: precio
    });

    updateProcedimientosList();
    closeModal('modalAddProcedimiento');
}

function updateProcedimientosList() {
    const list = getFacturaEl('procedimientosList');
    if (tempProcedimientos.length === 0) {
        list.innerHTML = '<div style="color: #8e8e93; padding: 10px;">No hay procedimientos agregados</div>';
    } else {
        list.innerHTML = tempProcedimientos.map(p => `
            <div class="procedimiento-item">
                <div>
                    <div style="font-weight: 600;">${p.descripcion}</div>
                    <div style="font-size: 13px; color: #666;">${p.cantidad}x ${formatCurrency(p.precioUnitario)}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <strong style="color: var(--clinic-color, #C4856A);">${formatCurrency(p.cantidad * p.precioUnitario)}</strong>
                    <button class="procedimiento-delete" onclick="removeProcedimiento('${p.id}')">×</button>
                </div>
            </div>
        `).join('');
    }
    updateTotal();
}

function removeProcedimiento(id) {
    tempProcedimientos = tempProcedimientos.filter(p => p.id !== id);
    updateProcedimientosList();
}

function updateDescuento() {
    const val = getFacturaEl('descuentoSlider').value;
    const valEl = getFacturaEl('descuentoValue');
    if (valEl) valEl.textContent = val;
    updateTotal();
}

function setDescuento(val) {
    const slider = getFacturaEl('descuentoSlider');
    if (slider) slider.value = val;
    updateDescuento();
}

function updateTotal() {
    const subtotal = tempProcedimientos.reduce((sum, p) => sum + (p.cantidad * p.precioUnitario), 0);

    // Agregar precio de órdenes de laboratorio
    const totalLab = tempOrdenesLab.reduce((sum, o) => sum + o.precio, 0);
    const subtotalConLab = subtotal + totalLab;

    const slider = getFacturaEl('descuentoSlider');
    const descuento = parseFloat(slider ? slider.value : 0) / 100;
    const total = subtotalConLab * (1 - descuento);
    const totalEl = getFacturaEl('totalFactura');
    if (totalEl) totalEl.textContent = formatCurrency(total);
}

async function generarFactura() {
    try {
    const contenedor  = document.getElementById('cobros-content') || document;
    const pacienteInput = contenedor.querySelector('#pacienteNombre') || document.getElementById('pacienteNombre');
    const paciente = pacienteInput.value;
    const notasEl = contenedor.querySelector('#notasFactura') || document.getElementById('notasFactura');
    const notas = notasEl ? notasEl.value : '';

    if (!paciente) {
        showToast('⚠️ Selecciona el paciente primero');
        return;
    }

    // VALIDACIÓN ESTRICTA: El paciente debe haber sido seleccionado de la lista
    if (!pacienteInput.dataset.pacienteSeleccionado || pacienteInput.dataset.pacienteSeleccionado !== 'true') {
        showToast('⚠️ Selecciona el paciente de la lista — no escribas el nombre libre', 4000);
        return;
    }

    if (tempProcedimientos.length === 0 && tempOrdenesLab.length === 0) {
        showToast('⚠️ Agrega al menos un procedimiento o una orden de lab');
        return;
    }

    const subtotal = tempProcedimientos.reduce((sum, p) => sum + (p.cantidad * p.precioUnitario), 0);

    // Agregar precio de órdenes de laboratorio al subtotal
    const totalLab = tempOrdenesLab.reduce((sum, o) => sum + o.precio, 0);
    const subtotalConLab = subtotal + totalLab;

    const descuento = parseFloat((contenedor.querySelector('#descuentoSlider') || document.getElementById('descuentoSlider')).value);
    const total = subtotalConLab * (1 - descuento / 100);

    // ========================================
    // DETERMINAR PROFESIONAL QUE ATENDIÓ
    // ========================================
    let profesionalQueAtendio = appData.currentUser;

    // Si es admin, DEBE seleccionar el profesional
    if (appData.currentRole === 'admin') {
        const profesionalSelect = contenedor.querySelector('#profesionalQueAtendio') || document.getElementById('profesionalQueAtendio');
        if (!profesionalSelect.value) {
            showToast('⚠️ Selecciona el profesional que atendió al paciente');
            return;
        }
        profesionalQueAtendio = profesionalSelect.value;
    }

    // ========================================
    // BUSCAR CITA DEL DÍA PARA VINCULAR
    // ========================================
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    const pacienteId = document.getElementById('pacienteNombre')?.dataset?.pacienteId || null;
    const citaHoy = appData.citas.find(c => {
        const fechaCita = new Date(c.fecha);
        fechaCita.setHours(0, 0, 0, 0);
        // Buscar por ID si está disponible, sino por nombre (compatibilidad con datos legacy)
        const mismoP = pacienteId
            ? (c.pacienteId === pacienteId || c.paciente === paciente)
            : c.paciente === paciente;
        return mismoP &&
               fechaCita >= hoy &&
               fechaCita < manana &&
               c.profesional === profesionalQueAtendio &&
               c.estado !== 'Cancelada' &&
               c.estado !== 'Inasistencia';
    });

    // Número secuencial basado en facturas existentes
    const ultimoNumero = appData.facturas
        .map(f => parseInt(f.numero.replace('F-', '')) || 0)
        .reduce((max, n) => Math.max(max, n), 0);
    const nuevoNumero = String(ultimoNumero + 1).padStart(4, '0');
    // Sufijo único (últimos 3 dígitos del timestamp) para evitar
    // colisiones si dos usuarios generan facturas simultáneamente
    const sufijo = Date.now().toString().slice(-3);
    const numeroFinal = `F-${nuevoNumero}-${sufijo}`;

    const factura = {
        id: generateId(),
        numero: numeroFinal,
        fecha: new Date().toISOString(),
        paciente,
        pacienteId: document.getElementById('pacienteNombre').dataset.pacienteId || null,
        procedimientos: [...tempProcedimientos],
        ordenesLab: [...tempOrdenesLab],
        subtotal: subtotalConLab,
        descuento,
        total,
        profesional: profesionalQueAtendio,
        estado: 'pendiente',
        pagos: [],
        notas,
        tieneOrdenesLab: tempOrdenesLab.length > 0,
        citaId: citaHoy ? citaHoy.id : null,
        citaHora: citaHoy ? citaHoy.hora : null,
        citaMotivo: citaHoy ? citaHoy.motivo : null
    };

    // Guardar estado anterior para rollback si Firebase falla
    const backupFacturas = appData.facturas.length;
    const backupCitaEstado = citaHoy ? citaHoy.estado : null;

    appData.facturas.push(factura);

    // Marcar cita como completada (SIN vincular a factura)
    if (citaHoy) {
        citaHoy.estado = 'Completada';
        citaHoy.fechaCompletada = new Date().toISOString();
        citaHoy.procedimientosRealizados = tempProcedimientos.map(p => p.descripcion).join(', ');
    }

    // Crear órdenes de laboratorio vinculadas a esta factura
    await crearOrdenesLabDesdeFactura(factura);

    try {
        await saveData();
    } catch(saveErr) {
        // Revertir mutaciones locales si Firebase rechazó la escritura
        appData.facturas.splice(backupFacturas, 1);
        if (citaHoy && backupCitaEstado) citaHoy.estado = backupCitaEstado;
        throw saveErr; // re-throw para que el catch externo lo maneje
    }

    const mensaje = citaHoy
        ? `✅ Factura generada exitosamente\n\n✔️ Vinculada con cita de las ${citaHoy.hora}\n✔️ Cita marcada como Completada`
        : '✅ Factura generada exitosamente';

    const labMsg = tempOrdenesLab.length > 0 ? ` · ${tempOrdenesLab.length} orden(es) de lab creadas` : '';
    showToast(mensaje.replace('✅ ', '') + labMsg);

    const pnEl = getFacturaEl('pacienteNombre');
    if (pnEl) { pnEl.value = ''; pnEl.dataset.pacienteSeleccionado = 'false'; }
    const notasEl2 = getFacturaEl('notasFactura');
    if (notasEl2) notasEl2.value = '';
    const sliderEl = getFacturaEl('descuentoSlider');
    if (sliderEl) sliderEl.value = '0';
    updateDescuento();
    tempProcedimientos = [];
    tempOrdenesLab = [];
    updateProcedimientosList();
    updateListaOrdenesLabTemp();
    } catch(e) {
        showError('Error al generar la factura.', e);
    }
}

// Ingresos Tab
function updateIngresosTab() {
    const todayKey = getTodayKey();
    const misFacturas = appData.facturas.filter(f => f.profesional === appData.currentUser);

    const ingresosHoy = misFacturas
        .flatMap(f => f.pagos || [])
        .filter(p => p && isSameDayTZ(p.fecha, todayKey))
        .reduce((sum, p) => sum + p.monto, 0);

    const prof = appData.personal.find(p => p.nombre === appData.currentUser);
    const comision = prof && prof.tipo !== 'empleado' && !prof.isAdmin ? getComisionRate(prof.tipo, prof) : 0;
    const comisionesHoy = ingresosHoy * comision / 100;

    const lastPayment = prof?.lastPaymentDate ? new Date(prof.lastPaymentDate) : new Date(0);
    const comisionesAcum = misFacturas
        .filter(f => f.estado === 'pagada' && new Date(f.fecha) > lastPayment)
        .reduce((sum, f) => sum + ((f.pagos || []).reduce((s, p) => s + p.monto, 0) * comision / 100), 0);

    const porCobrar = misFacturas
        .filter(f => f.estado !== 'pagada')
        .reduce((sum, f) => sum + (f.total - (f.pagos || []).reduce((s, p) => s + p.monto, 0)), 0);

    document.getElementById('ingresosHoy').textContent = formatCurrency(ingresosHoy);
    document.getElementById('comisionesHoy').textContent = formatCurrency(comisionesHoy);
    document.getElementById('comisionesAcum').textContent = formatCurrency(comisionesAcum);
    document.getElementById('porCobrar').textContent = formatCurrency(porCobrar);

    const list = document.getElementById('facturasPersonal');
    if (misFacturas.length === 0) {
        list.innerHTML = '<li style="text-align: center; color: #8e8e93;">No hay facturas</li>';
    } else {
        list.innerHTML = misFacturas.map(f => `
            <li>
                <div class="item-header">
                    <div>
                        <div style="font-size: 12px; color: #8e8e93;">${f.numero}</div>
                        <div class="item-title">${f.paciente}</div>
                    </div>
                    <span class="badge badge-${f.estado === 'pagada' ? 'paid' : (f.estado === 'parcial' || f.estado === 'partial') ? 'partial' : 'pending'}">
                        ${f.estado === 'pagada' ? 'Pagada' : (f.estado === 'parcial' || f.estado === 'partial') ? 'Con Abono' : 'Pendiente'}
                    </span>
                </div>
                <div class="item-amount">${formatCurrency(f.total)}</div>
            </li>
        `).join('');
    }
}

function getComisionRate(tipo, person) {
    // Individual override takes priority over global setting
    if (person && typeof person.comisionPct === 'number') return person.comisionPct;
    const settings = appData.settings || {};
    if (tipo === 'regular')      return settings.comisionRegular      ?? 60;
    if (tipo === 'especialista') return settings.comisionEspecialista ?? 50;
    return 0;
}

// Cobrar Tab
function updateCobrarTab() {
    const todayKey = getTodayKey();
    const cobradoHoy = appData.facturas
        .flatMap(f => f.pagos)
        .filter(p => isSameDayTZ(p.fecha, todayKey))
        .reduce((sum, p) => sum + p.monto, 0);

    document.getElementById('cobradoHoy').textContent = formatCurrency(cobradoHoy);

    // Aplicar filtros (que también actualiza el contador de pendientes)
    aplicarFiltrosFacturas();
}

let currentFacturaToPay = null;
let tipoPagoSeleccionado = 'total';
let currentFacturaCliente = '';

function selectTipoPago(tipo) {
    tipoPagoSeleccionado = tipo;

    const btnTotal = document.getElementById('btnPagoTotal');
    const btnAbono = document.getElementById('btnPagoAbono');
    const montoInput = document.getElementById('pagoMonto');

    if (tipo === 'total') {
        btnTotal.style.background = 'var(--clinic-color, #C4856A)';
        btnTotal.style.color = 'white';
        btnAbono.style.background = '#f0f0f0';
        btnAbono.style.color = '#333';

        if (currentFacturaToPay) {
            const balance = currentFacturaToPay.total - currentFacturaToPay.pagos.reduce((sum, p) => sum + p.monto, 0);
            montoInput.value = balance.toFixed(2);
        }
    } else {
        btnAbono.style.background = 'var(--clinic-color, #C4856A)';
        btnAbono.style.color = 'white';
        btnTotal.style.background = '#f0f0f0';
        btnTotal.style.color = '#333';

        montoInput.value = '';
    }

    actualizarNuevoBalance();
}

function actualizarNuevoBalance() {
    if (!currentFacturaToPay) return;

    const monto = parseFloat(document.getElementById('pagoMonto').value) || 0;
    const balanceActual = currentFacturaToPay.total - currentFacturaToPay.pagos.reduce((sum, p) => sum + p.monto, 0);
    const nuevoBalance = balanceActual - monto;

    document.getElementById('nuevoBalance').textContent = formatCurrency(nuevoBalance);
    document.getElementById('nuevoBalance').style.color = nuevoBalance <= 0 ? '#34c759' : '#ff3b30';
}

function openPagarFactura(facturaId) {
    if (!tienePermiso('cobrar')) {
        showToast('⛔ Sin autorización para cobros', 3000, '#c0392b');
        return;
    }
    const factura = appData.facturas.find(f => f.id === facturaId);
    if (!factura) return;

    currentFacturaToPay = factura;
    tipoPagoSeleccionado = 'total';

    const balance = factura.total - factura.pagos.reduce((sum, p) => sum + p.monto, 0);

    // Mostrar nombre real en vez de "admin"
    const nombreProfesional = factura.profesional.toLowerCase() === 'admin' ? getNombreAdmin() : factura.profesional;

    document.getElementById('pagoFacturaNum').textContent = factura.numero;
    document.getElementById('pagoPaciente').textContent = factura.paciente;
    document.getElementById('pagoProfesional').textContent = nombreProfesional;
    document.getElementById('pagoTotal').textContent = formatCurrency(factura.total);
    document.getElementById('pagoBalance').textContent = formatCurrency(balance);
    document.getElementById('pagoMonto').value = balance.toFixed(2);
    document.getElementById('pagoMetodo').value = 'efectivo';
    document.getElementById('comprobanteSection').classList.add('hidden');
    document.getElementById('comprobantePreview').classList.add('hidden');

    selectTipoPago('total');

    openModal('modalPagarFactura');
}

document.getElementById('pagoMonto').addEventListener('input', actualizarNuevoBalance);

document.getElementById('pagoMetodo').addEventListener('change', function() {
    if (this.value === 'transferencia') {
        document.getElementById('comprobanteSection').classList.remove('hidden');
    } else {
        document.getElementById('comprobanteSection').classList.add('hidden');
    }
});

document.getElementById('comprobanteFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('comprobantePreview').src = e.target.result;
            document.getElementById('comprobantePreview').classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }
});

async function confirmarPago() {
    const monto  = sanitize.num(document.getElementById('pagoMonto')?.value, 0);
    const metodo = sanitize.str(document.getElementById('pagoMetodo')?.value, 50);

    if (monto <= 0) {
        showToast('⚠️ Ingresa un monto válido mayor a cero'); return;
    }

    const totalPagadoActual = currentFacturaToPay.pagos.reduce((sum, p) => sum + p.monto, 0);
    const balancePendiente  = currentFacturaToPay.total - totalPagadoActual;

    if (monto > balancePendiente + 0.01) {
        showToast(`⚠️ El monto supera el balance pendiente (${formatCurrency(balancePendiente)})`, 4000, '#e65100'); return;
    }

    const pago = {
        id: generateId(),
        monto,
        metodo,
        fecha: new Date().toISOString(),
        comprobanteData: null
    };

    if (metodo === 'transferencia') {
        const preview = document.getElementById('comprobantePreview');
        if (preview.src && !preview.classList.contains('hidden')) {
            pago.comprobanteData = preview.src;
        }
    }

    const estadoAnterior = currentFacturaToPay.estado;
    currentFacturaToPay.pagos.push(pago);

    const totalPagado = currentFacturaToPay.pagos.reduce((sum, p) => sum + p.monto, 0);
    if (totalPagado >= currentFacturaToPay.total) {
        currentFacturaToPay.estado = 'pagada';
    } else if (totalPagado > 0) {
        currentFacturaToPay.estado = 'parcial';
    }

    try {
        await saveData();
    } catch(saveErr) {
        // Rollback: quitar el pago y restaurar estado
        currentFacturaToPay.pagos.pop();
        currentFacturaToPay.estado = estadoAnterior;
        showError('Error al registrar el pago. Intenta de nuevo.', saveErr);
        return;
    }

    // Generar factura para cliente
    generarFacturaCliente(currentFacturaToPay, monto, metodo);

    updateCobrarTab();
    closeModal('modalPagarFactura');
}
function generarFacturaCliente(factura, montoPagado, metodoPago) {
    const fecha = new Date().toLocaleDateString(getLocale(), {year: 'numeric', month: 'long', day: 'numeric'});
    const hora = new Date().toLocaleTimeString(getLocale(), {hour: '2-digit', minute: '2-digit'});
    const balance = factura.total - factura.pagos.reduce((sum, p) => sum + p.monto, 0);
    const esPagoTotal = balance <= 0;

    // Mostrar nombre real en vez de "admin"
    const nombreProfesional = factura.profesional.toLowerCase() === 'admin' ? getNombreAdmin() : factura.profesional;

    let facturaHTML = `
        <div style="text-align: center; margin-bottom: 25px;">
            ${clinicConfig.logoPositivo ? `<img src="${clinicConfig.logoPositivo}" alt="Logo" style="max-width: 200px; margin-bottom: 12px; display: block; margin-left: auto; margin-right: auto;">` : ''}
            <div style="font-size: 18px; font-weight: 700; color: var(--clinic-color, #C4856A); margin-bottom: 6px;">${clinicConfig.nombre || 'Clínica Dental'}</div>
        </div>

        <div style="border-top: 3px solid var(--clinic-color, #C4856A); border-bottom: 3px solid var(--clinic-color, #C4856A); padding: 15px 0; margin: 20px 0;">
            <div style="text-align: center;">
                <h3 style="color: var(--clinic-color, #C4856A); margin: 0; font-size: 20px;">${esPagoTotal ? 'RECIBO DE PAGO' : 'COMPROBANTE DE ABONO'}</h3>
                <div style="color: #666; font-size: 13px; margin-top: 5px;">Factura: ${factura.numero}</div>
            </div>
        </div>

        <div style="margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr>
                    <td style="padding: 8px 0; color: #666; width: 40%;">Fecha:</td>
                    <td style="padding: 8px 0; font-weight: 600;">${fecha} - ${hora}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #666;">Paciente:</td>
                    <td style="padding: 8px 0; font-weight: 600;">${factura.paciente}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; color: #666;">Atendido por:</td>
                    <td style="padding: 8px 0; font-weight: 600;">${nombreProfesional}</td>
                </tr>
            </table>
        </div>

        <div style="border-top: 2px solid #e0e0e0; margin: 20px 0;"></div>

        <div style="margin: 20px 0;">
            <h4 style="color: var(--clinic-color, #C4856A); margin-bottom: 10px;">Detalle del Tratamiento:</h4>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                    <tr style="background: #f5f5f5;">
                        <th style="padding: 8px; text-align: left; color: var(--clinic-color, #C4856A);">Descripción</th>
                        <th style="padding: 8px; text-align: center; color: var(--clinic-color, #C4856A);">Cant.</th>
                        <th style="padding: 8px; text-align: right; color: var(--clinic-color, #C4856A);">Precio</th>
                        <th style="padding: 8px; text-align: right; color: var(--clinic-color, #C4856A);">Total</th>
                    </tr>
                </thead>
                <tbody>
    `;

    factura.procedimientos.forEach(proc => {
        facturaHTML += `
                    <tr style="border-bottom: 1px solid #e0e0e0;">
                        <td style="padding: 8px;">${proc.descripcion}</td>
                        <td style="padding: 8px; text-align: center;">${proc.cantidad}</td>
                        <td style="padding: 8px; text-align: right;">${formatCurrency(proc.precioUnitario)}</td>
                        <td style="padding: 8px; text-align: right; font-weight: 600;">${formatCurrency(proc.cantidad * proc.precioUnitario)}</td>
                    </tr>
        `;
    });

    // AGREGAR ÓRDENES DE LABORATORIO AL RECIBO
    if (factura.ordenesLab && factura.ordenesLab.length > 0) {
        factura.ordenesLab.forEach(orden => {
            facturaHTML += `
                    <tr style="border-bottom: 1px solid #e0e0e0; background: #f0f8ff;">
                        <td style="padding: 8px;">🔬 ${orden.tipo}${orden.dientes ? ` (Dientes: ${orden.dientes})` : ''}</td>
                        <td style="padding: 8px; text-align: center;">1</td>
                        <td style="padding: 8px; text-align: right;">${formatCurrency(orden.precio)}</td>
                        <td style="padding: 8px; text-align: right; font-weight: 600;">${formatCurrency(orden.precio)}</td>
                    </tr>
            `;
        });
    }

    facturaHTML += `
                </tbody>
            </table>
        </div>

        <div style="margin: 20px 0; padding: 15px; background: #f8f8f8; border-radius: 8px;">
            <table style="width: 100%; font-size: 14px;">
                <tr>
                    <td style="padding: 5px 0; color: #666;">Subtotal:</td>
                    <td style="padding: 5px 0; text-align: right; font-weight: 600;">${formatCurrency(factura.subtotal)}</td>
                </tr>
    `;

    if (factura.descuento > 0) {
        facturaHTML += `
                <tr>
                    <td style="padding: 5px 0; color: #666;">Descuento (${factura.descuento}%):</td>
                    <td style="padding: 5px 0; text-align: right; color: #ff3b30; font-weight: 600;">-${formatCurrency(factura.subtotal * factura.descuento / 100)}</td>
                </tr>
        `;
    }

    facturaHTML += `
                <tr style="border-top: 2px solid var(--clinic-color, #C4856A);">
                    <td style="padding: 10px 0; color: var(--clinic-color, #C4856A); font-size: 16px; font-weight: 700;">TOTAL DEL TRATAMIENTO:</td>
                    <td style="padding: 10px 0; text-align: right; color: var(--clinic-color, #C4856A); font-size: 18px; font-weight: 700;">${formatCurrency(factura.total)}</td>
                </tr>
            </table>
        </div>

        <div style="margin: 20px 0; padding: 15px; background: #e8f5e9; border-radius: 8px; border-left: 4px solid #34c759;">
            <table style="width: 100%; font-size: 14px;">
                <tr>
                    <td style="padding: 5px 0; color: #2e7d32; font-weight: 600;">Pago Recibido:</td>
                    <td style="padding: 5px 0; text-align: right; color: #2e7d32; font-weight: 700; font-size: 16px;">${formatCurrency(montoPagado)}</td>
                </tr>
                <tr>
                    <td style="padding: 5px 0; color: #666;">Método de Pago:</td>
                    <td style="padding: 5px 0; text-align: right; font-weight: 600;">${metodoPago.charAt(0).toUpperCase() + metodoPago.slice(1)}</td>
                </tr>
            </table>
        </div>
    `;

    if (!esPagoTotal) {
        facturaHTML += `
        <div style="margin: 20px 0; padding: 15px; background: #fff3e0; border-radius: 8px; border-left: 4px solid #ff9500;">
            <table style="width: 100%; font-size: 14px;">
                <tr>
                    <td style="padding: 5px 0; color: #e65100; font-weight: 600;">Balance Pendiente:</td>
                    <td style="padding: 5px 0; text-align: right; color: #e65100; font-weight: 700; font-size: 16px;">${formatCurrency(balance)}</td>
                </tr>
            </table>
        </div>
        `;
    } else {
        facturaHTML += `
        <div style="margin: 20px 0; padding: 15px; background: #e8f5e9; border-radius: 8px; text-align: center;">
            <div style="color: #2e7d32; font-weight: 700; font-size: 16px;">✓ PAGADO EN SU TOTALIDAD</div>
        </div>
        `;
    }

    if (factura.notas) {
        facturaHTML += `
        <div style="margin: 20px 0; padding: 10px; background: #f5f5f5; border-radius: 8px;">
            <div style="color: #666; font-size: 12px; font-weight: 600; margin-bottom: 5px;">Notas:</div>
            <div style="color: #333; font-size: 13px;">${factura.notas}</div>
        </div>
        `;
    }

    facturaHTML += `
        <div style="border-top: 2px solid #e0e0e0; margin-top: 30px; padding-top: 20px; text-align: center;">
            <div style="color: var(--clinic-color, #C4856A); font-weight: 600; font-size: 16px; margin-bottom: 10px;">
                ¡Gracias por preferirnos!
            </div>
            <div style="color: #888; font-size: 13px;">
                Vuelve pronto
            </div>
            <div style="color: #ccc; font-size: 11px; margin-top: 15px;">
                Recibo generado el ${fecha} a las ${hora}
            </div>
        </div>
    `;

    currentFacturaCliente = facturaHTML;
    document.getElementById('facturaClienteContent').innerHTML = facturaHTML;

    closeModal('modalPagarFactura');
    openModal('modalFacturaCliente');

    // Si el pago vino desde la ficha del paciente, volver a ella al cerrar el recibo
    if (window.tempPacienteIdRetorno) {
        const pacienteIdRetorno = window.tempPacienteIdRetorno;
        window.tempPacienteIdRetorno = null;
        const modalEl = document.getElementById('modalFacturaCliente');
        const handler = function(e) {
            if (e.target === modalEl) {
                modalEl.removeEventListener('click', handler);
                showTab('pacientes');
                setTimeout(() => verPaciente(pacienteIdRetorno), 100);
            }
        };
        modalEl.addEventListener('click', handler);
    }
}

function descargarFacturaImagen() {
    const elemento = document.getElementById('facturaClienteContent');
    const mensajeDiv = document.getElementById('mensajeDescarga');

    // Verificar que html2canvas está disponible
    if (typeof html2canvas === 'undefined') {
        mensajeDiv.style.display = 'block';
        mensajeDiv.style.background = '#ffebee';
        mensajeDiv.style.color = '#c62828';
        mensajeDiv.innerHTML = '❌ Error: Librería no cargada. Por favor, recarga la página.';
        return;
    }

    // Mostrar mensaje de espera
    mensajeDiv.style.display = 'block';
    mensajeDiv.style.background = '#e3f2fd';
    mensajeDiv.style.color = '#1976d2';
    mensajeDiv.innerHTML = '⏳ Generando imagen de la factura...';

    // Pequeño delay para asegurar que el DOM está listo
    setTimeout(() => {
        html2canvas(elemento, {
            scale: 2,
            backgroundColor: '#ffffff',
            logging: false,
            allowTaint: false,
            useCORS: true,
            imageTimeout: 0
        }).then(canvas => {
            canvas.toBlob(blob => {
                const fecha = new Date().toISOString().slice(0,10);
                const factura = currentFacturaToPay ? currentFacturaToPay.numero : 'factura';
                const nombreArchivo = `${factura}_${fecha}.png`;

                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = nombreArchivo;

                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);

                mensajeDiv.style.background = '#e8f5e9';
                mensajeDiv.style.color = '#2e7d32';
                mensajeDiv.innerHTML = `
                    ✅ <strong>¡Factura descargada!</strong><br>
                    <span style="font-size: 13px;">Ahora puedes compartirla por WhatsApp desde tu galería de fotos</span>
                `;

                setTimeout(() => {
                    mensajeDiv.style.display = 'none';
                }, 5000);
            }, 'image/png');
        }).catch(error => {
            console.error('Error al generar imagen:', error);
            mensajeDiv.style.background = '#ffebee';
            mensajeDiv.style.color = '#c62828';
            mensajeDiv.innerHTML = '❌ Error al generar la imagen. Por favor, intenta de nuevo.';

            setTimeout(() => {
                mensajeDiv.style.display = 'none';
            }, 5000);
        });
    }, 300);
}


function imprimirFactura() {
    const ventana = window.open('', '', 'height=600,width=800');
    ventana.document.write('<html><head><title>Factura</title>');
    ventana.document.write('<style>body{font-family: Arial, sans-serif; padding: 20px;}</style>');
    ventana.document.write('</head><body>');
    ventana.document.write(document.getElementById('facturaClienteContent').innerHTML);
    ventana.document.write('</body></html>');
    ventana.document.close();
    ventana.print();
}

function copiarFactura() {
    const texto = document.getElementById('facturaClienteContent').innerText;
    navigator.clipboard.writeText(texto).then(() => {
        showToast('✓ Factura copiada al portapapeles');
    });
}

function verComprobante(comprobanteData) {
    document.getElementById('comprobanteDisplay').src = comprobanteData;
    openModal('modalVerComprobante');
}

function verComprobantesFactura(facturaId) {
    const factura = appData.facturas.find(f => f.id === facturaId);
    if (!factura) return;

    const comprobantesConData = factura.pagos.filter(p => p.comprobanteData);
    if (comprobantesConData.length > 0) {
        // Mostrar el primer comprobante (puedes mejorar esto para mostrar todos)
        verComprobante(comprobantesConData[0].comprobanteData);
    }
}

// Cuadre Tab
function updateCuadreTab() {
    const todayKey = getTodayKey();
    const todayDate = new Date().toLocaleDateString(getLocale(), {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'});
    document.getElementById('fechaCuadre').textContent = todayDate;

    const pagosHoy = appData.facturas
        .flatMap(f => f.pagos || [])
        .filter(p => p && isSameDayTZ(p.fecha, todayKey));

    const efectivoHoy = pagosHoy.filter(p => p.metodo === 'efectivo').reduce((sum, p) => sum + p.monto, 0);
    const tarjetaHoy = pagosHoy.filter(p => p.metodo === 'tarjeta').reduce((sum, p) => sum + p.monto, 0);
    const transferenciaHoy = pagosHoy.filter(p => p.metodo === 'transferencia').reduce((sum, p) => sum + p.monto, 0);
    const totalIngresos = efectivoHoy + tarjetaHoy + transferenciaHoy;

    const gastosHoy = appData.gastos
        .filter(g => isSameDayTZ(g.fecha, todayKey))
        .reduce((sum, g) => sum + g.monto, 0);

    const gastosEfectivoHoy = appData.gastos
        .filter(g => isSameDayTZ(g.fecha, todayKey) && g.metodo === 'efectivo')
        .reduce((sum, g) => sum + g.monto, 0);

    const balance = totalIngresos - gastosHoy;

    // EFECTIVO EN CAJA = Inicial + Ingresos efectivo - Gastos efectivo
    const efectivoInicial = parseFloat(document.getElementById('efectivoInicial').value) || 0;
    const efectivoCaja = efectivoInicial + efectivoHoy - gastosEfectivoHoy;

    document.getElementById('efectivoHoy').textContent = formatCurrency(efectivoHoy);
    document.getElementById('tarjetaHoy').textContent = formatCurrency(tarjetaHoy);
    document.getElementById('transferenciaHoy').textContent = formatCurrency(transferenciaHoy);
    document.getElementById('totalIngresosHoy').textContent = formatCurrency(totalIngresos);
    document.getElementById('gastosHoy').textContent = formatCurrency(gastosHoy);
    document.getElementById('gastosEfectivoHoy').textContent = formatCurrency(gastosEfectivoHoy);
    document.getElementById('balanceDia').textContent = formatCurrency(balance);
    document.getElementById('balanceDia').style.color = balance >= 0 ? 'var(--green, #6B8F71)' : 'var(--red, #C47070)';
    document.getElementById('efectivoCaja').textContent = formatCurrency(efectivoCaja);

    // Guardar cuadre del día actual (solo si hay actividad)
    if (totalIngresos > 0 || gastosHoy > 0) {
        guardarCuadreDiario(todayKey, {
            fecha: new Date().toISOString(),
            efectivoInicial: efectivoInicial,
            efectivo: efectivoHoy,
            tarjeta: tarjetaHoy,
            transferencia: transferenciaHoy,
            totalIngresos: totalIngresos,
            gastos: gastosHoy,
            gastosEfectivo: gastosEfectivoHoy,
            balance: balance,
            efectivoCaja: efectivoCaja
        });
    }

    // Mostrar historial solo para admin
    if (appData.currentRole === 'admin') {
        document.getElementById('historialCuadres').style.display = 'block';
        mostrarHistorialCuadres();
    }

    // RENDERIZAR DETALLE DE TRANSACCIONES
    if (totalIngresos > 0 || gastosHoy > 0) {
        document.getElementById('detalleTransacciones').style.display = 'block';

        // Obtener facturas con pagos de hoy para vincular
        const facturasConPagosHoy = appData.facturas
            .map(f => {
                const pagosDeHoy = (f.pagos || []).filter(p => isSameDayTZ(p.fecha, todayKey));
                return pagosDeHoy.length > 0 ? { ...f, pagosDeHoy } : null;
            })
            .filter(f => f !== null);

        // Lista de ingresos
        let htmlIngresos = '';
        facturasConPagosHoy.forEach(f => {
            f.pagosDeHoy.forEach(p => {
                const hora = new Date(p.fecha).toLocaleTimeString(getLocale(), {hour: '2-digit', minute: '2-digit'});
                const icono = p.metodo === 'efectivo' ? '💵' : p.metodo === 'tarjeta' ? '💳' : '🔄';
                htmlIngresos += `
                    <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e0e0e0;">
                        <div>
                            <span style="font-weight: 600;">${icono} ${f.paciente}</span>
                            <span style="color: #666; font-size: 12px; margin-left: 8px;">${hora}</span>
                            <div style="font-size: 12px; color: #999;">Factura ${f.numero} - ${p.metodo}</div>
                        </div>
                        <div style="font-weight: 500; color: var(--green,#6B8F71);">${formatCurrency(p.monto)}</div>
                    </div>
                `;
            });
        });

        if (htmlIngresos === '') {
            htmlIngresos = '<div style="color: #999; text-align: center; padding: 10px;">No hay ingresos registrados hoy</div>';
        }
        document.getElementById('listaIngresos').innerHTML = htmlIngresos;

        // Lista de gastos
        const gastosDeHoy = appData.gastos.filter(g => isSameDayTZ(g.fecha, todayKey));
        let htmlGastos = '';
        gastosDeHoy.forEach(g => {
            const hora = new Date(g.fecha).toLocaleTimeString(getLocale(), {hour: '2-digit', minute: '2-digit'});
            const icono = g.metodo === 'efectivo' ? '💵' : g.metodo === 'tarjeta' ? '💳' : '🔄';
            htmlGastos += `
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e0e0e0;">
                    <div>
                        <span style="font-weight: 600;">${icono} ${g.descripcion}</span>
                        <span style="color: #666; font-size: 12px; margin-left: 8px;">${hora}</span>
                        ${g.proveedor ? `<div style="font-size: 12px; color: #999;">Proveedor: ${g.proveedor}</div>` : ''}
                        <div style="font-size: 12px; color: #999;">${g.metodo}</div>
                    </div>
                    <div style="font-weight: 500; color: var(--red,#C47070);">${formatCurrency(g.monto)}</div>
                </div>
            `;
        });

        if (htmlGastos === '') {
            htmlGastos = '<div style="color: #999; text-align: center; padding: 10px;">No hay gastos registrados hoy</div>';
        }
        document.getElementById('listaGastos').innerHTML = htmlGastos;
    } else {
        document.getElementById('detalleTransacciones').style.display = 'none';
    }
}

// Guardar cuadre diario (solo llamar manualmente, no en onSnapshot)
function guardarCuadreDiario(fechaKey, cuadre) {
    if (!appData.cuadresDiarios) {
        appData.cuadresDiarios = {};
    }
    // Solo guardar si el valor cambió realmente
    const existente = appData.cuadresDiarios[fechaKey];
    if (existente &&
        existente.totalIngresos === cuadre.totalIngresos &&
        existente.gastos === cuadre.gastos &&
        existente.efectivoInicial === cuadre.efectivoInicial) {
        return; // Sin cambios, no guardar
    }
    appData.cuadresDiarios[fechaKey] = cuadre;
    saveData();
}

// Mostrar historial de última semana
function mostrarHistorialCuadres() {
    const todayKey = getTodayKey();
    const hace7Dias = new Date();
    hace7Dias.setDate(hace7Dias.getDate() - 7);
    const hace7DiasKey = hace7Dias.toISOString().slice(0, 10);

    if (!appData.cuadresDiarios) {
        document.getElementById('historialCuadresList').innerHTML = '<li style="text-align: center; color: #8e8e93;">No hay historial disponible</li>';
        return;
    }

    const cuadres = Object.entries(appData.cuadresDiarios)
        .filter(([key]) => key >= hace7DiasKey && key < todayKey)
        .sort(([a], [b]) => b.localeCompare(a)); // Más reciente primero

    if (cuadres.length === 0) {
        document.getElementById('historialCuadresList').innerHTML = '<li style="text-align: center; color: #8e8e93;">No hay cuadres de la última semana</li>';
        return;
    }

    const list = cuadres.map(([key, cuadre]) => {
        // key is 'YYYY-MM-DD', parse as local date
        const fecha = new Date(key + 'T12:00:00');
        const fechaStr = fecha.toLocaleDateString(getLocale(), {weekday: 'short', day: 'numeric', month: 'short'});

        return `
            <li>
                <div style="margin-bottom: 10px;">
                    <strong style="color: var(--clinic-color, #C4856A);">${fechaStr}</strong>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px;">
                    <div>Ingresos: <strong style="color: var(--green,#6B8F71);">${formatCurrency(cuadre.totalIngresos)}</strong></div>
                    <div>Gastos: <strong style="color: var(--red,#C47070);">${formatCurrency(cuadre.gastos)}</strong></div>
                    <div>Balance: <strong style="color: ${cuadre.balance >= 0 ? 'var(--green,#6B8F71)' : 'var(--red,#C47070)'};">${formatCurrency(cuadre.balance)}</strong></div>
                    <div>En caja: <strong style="color: var(--clinic-color, #C4856A);">${formatCurrency(cuadre.efectivoCaja)}</strong></div>
                </div>
            </li>
        `;
    }).join('');

    document.getElementById('historialCuadresList').innerHTML = list;
}

// Gastos
function openAddGasto() {
    document.getElementById('gastoDesc').value = '';
    document.getElementById('gastoMonto').value = '';
    document.getElementById('gastoProveedor').value = '';
    document.getElementById('gastoMetodo').value = 'efectivo';
    document.getElementById('gastoPreview').classList.add('hidden');
    openModal('modalAddGasto');
}

document.getElementById('gastoFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('gastoPreview').src = e.target.result;
            document.getElementById('gastoPreview').classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }
});

function registrarGasto() {
    const desc      = sanitize.str(document.getElementById('gastoDesc')?.value, 300);
    const monto     = sanitize.num(document.getElementById('gastoMonto')?.value, 0);
    const proveedor = sanitize.str(document.getElementById('gastoProveedor')?.value, 120);
    const metodo    = sanitize.str(document.getElementById('gastoMetodo')?.value, 50);

    if (!desc)      { showToast('⚠️ Describe el gasto'); return; }
    if (monto <= 0) { showToast('⚠️ El monto debe ser mayor a cero'); return; }
    if (!proveedor) { showToast('⚠️ Ingresa el proveedor'); return; }

    const preview = document.getElementById('gastoPreview');
    const facturaData = preview?.src && !preview.classList.contains('hidden') ? preview.src : null;

    const gasto = {
        id:            generateId(),
        fecha:         new Date().toISOString(),
        descripcion:   desc,
        monto,
        proveedor,
        metodo,
        registradoPor: appData.currentUser,
        facturaData,
        aprobado:      true
    };

    const backupGastos = appData.gastos.length;
    appData.gastos.push(gasto);
    saveData().catch(() => {
        appData.gastos.splice(backupGastos, 1); // revertir
        updateGastosTab();
        showToast('❌ No se pudo guardar el gasto. Intenta de nuevo.', 4000, '#c0392b');
    });
    updateGastosTab();
    closeModal('modalAddGasto');
    showToast('✓ Gasto registrado');
}

function updateGastosTab() {
    const list = document.getElementById('gastosList');
    if (appData.gastos.length === 0) {
        list.innerHTML = '<li style="text-align: center; color: #8e8e93;">No hay gastos registrados</li>';
    } else {
        list.innerHTML = appData.gastos.map(g => `
            <li>
                <div class="item-header">
                    <div class="item-title">${g.descripcion}</div>
                    <div class="item-amount" style="color: var(--red, #C47070);">${formatCurrency(g.monto)}</div>
                </div>
                <div class="item-meta">
                    ${g.proveedor || ''} • ${g.metodo ? g.metodo.charAt(0).toUpperCase() + g.metodo.slice(1) : 'N/A'} • ${new Date(g.fecha).toLocaleDateString(getLocale())}
                </div>
                ${g.facturaData ? `
                    <button class="btn btn-secondary" style="margin-top: 10px; padding: 8px 16px; font-size: 13px;" onclick="verComprobante('${g.facturaData}')">
                        📎 Ver Factura
                    </button>
                ` : ''}
                ${appData.currentRole === 'admin' ? `
                    <button class="btn btn-danger" style="margin-top: 10px; padding: 8px 16px; font-size: 13px;" onclick="eliminarGasto('${g.id}')">Eliminar</button>
                ` : ''}
            </li>
        `).join('');
    }
}

function eliminarGasto(id) {
    const gasto = appData.gastos.find(g => g.id === id);
    if (!gasto) return;

    mostrarConfirmacion({
        titulo: 'Eliminar gasto',
        mensaje: `<strong>${gasto.descripcion}</strong><br><span style="color:var(--mid)">${formatCurrency(gasto.monto)}${gasto.proveedor ? ' · ' + gasto.proveedor : ''}</span><br><br>Esta acción no se puede deshacer.`,
        tipo: 'peligro',
        confirmText: 'Eliminar',
        onConfirm: () => {
            const backup = [...appData.gastos];
            appData.gastos = appData.gastos.filter(g => g.id !== id);
            saveData().catch(() => {
                appData.gastos = backup;
                updateGastosTab();
                showToast('❌ No se pudo eliminar. Intenta de nuevo.', 4000, '#c0392b');
            });
            updateGastosTab();
        }
    });
}

// Personal
function openAddPersonal() {
    document.getElementById('personalNombre').value = '';
    document.getElementById('personalTipo').value = 'regular';
    document.getElementById('personalSueldo').value = '';
    document.getElementById('personalSalarioPro') && (document.getElementById('personalSalarioPro').value = '');
    document.getElementById('personalPassword').value = '';
    const defRem = clinicConfig.defaultRemuneracion || 'comision';
    const defFrq = clinicConfig.defaultFrecuenciaPago || 'mensual';
    const rEl = document.getElementById('personalTipoRemuneracion');
    const fEl = document.getElementById('personalFrecuenciaPago');
    if (rEl) rEl.value = defRem;
    if (fEl) fEl.value = defFrq;
    // Reset all optional groups before re-initializing
    ['sueldoGroup','salarioProGroup','frecuenciaPagoGroup',
     'tipoRemuneracionGroup','exequaturGroup','passwordGroup'].forEach(id => {
        const el = document.getElementById(id); if (el) el.classList.add('hidden');
    });
    // toggleSueldo initializes visibility based on selected tipo (default: regular)
    toggleSueldo();
    openModal('modalAddPersonal');
}

function _show(id, vis) {
    const el = document.getElementById(id);
    if (!el) return;
    if (vis) el.classList.remove('hidden'); else el.classList.add('hidden');
}

function toggleSueldo() {
    const tipo = document.getElementById('personalTipo').value;
    const esEmp = tipo === 'empleado';
    _show('exequaturGroup',        !esEmp);
    _show('tipoRemuneracionGroup', !esEmp);
    _show('sueldoGroup',            esEmp);
    _show('passwordGroup',         !esEmp);
    _show('frecuenciaPagoGroup',    esEmp);
    if (!esEmp) toggleTipoRemuneracion();
}

function toggleTipoRemuneracion() {
    const v = document.getElementById('personalTipoRemuneracion')?.value || 'comision';
    _show('salarioProGroup',    v === 'salario');
    _show('frecuenciaPagoGroup', v === 'salario');
}

function toggleEditTipoRemuneracion() {
    const v = document.getElementById('editTipoRemuneracion')?.value || 'comision';
    _show('editSalarioProGroup',    v === 'salario');
    _show('editFrecuenciaPagoGroup', v === 'salario');
}

async function agregarPersonal() {
    const nombre    = sanitize.str(document.getElementById('personalNombre')?.value, 120);
    const tipo      = document.getElementById('personalTipo')?.value || 'regular';
    const sueldoRaw = document.getElementById('personalSueldo')?.value;
    const sueldo    = sanitize.num(sueldoRaw, 0);
    const password  = sanitize.str(document.getElementById('personalPassword')?.value, 100);
    const exequatur = sanitize.str(document.getElementById('personalExequatur')?.value, 20);

    if (!nombre) {
        showToast('⚠️ El nombre es obligatorio'); return;
    }
    if (tipo === 'empleado' && sueldo <= 0) {
        showToast('⚠️ Ingresa el sueldo del empleado'); return;
    }

    // Hash password before storing — never plaintext
    const defaultPw   = tipo === 'empleado' ? 'empleado123' : null;
    const rawPassword = (tipo !== 'empleado' && password) ? password : defaultPw;
    const hashedPw    = rawPassword ? await hashPassword(rawPassword) : null;

    const esEmp = tipo === 'empleado';
    const tipoRem = esEmp ? 'salario'
        : (document.getElementById('personalTipoRemuneracion')?.value || 'comision');
    const salFijo = (!esEmp && tipoRem === 'salario')
        ? sanitize.num(document.getElementById('personalSalarioPro')?.value, 0) : null;
    const frecPago = (esEmp || tipoRem === 'salario')
        ? (document.getElementById('personalFrecuenciaPago')?.value || 'mensual') : null;

    if (!esEmp && tipoRem === 'salario' && (!salFijo || salFijo <= 0)) {
        showToast('⚠️ Ingresa el salario fijo del profesional'); return;
    }

    const person = {
        id: generateId(),
        nombre,
        tipo,
        exequatur:          !esEmp ? exequatur : null,
        sueldo:              esEmp ? sueldo    : null,
        tipoRemuneracion:   tipoRem,
        salarioFijo:        salFijo,
        frecuenciaPago:     frecPago,
        password:           hashedPw,
        _pwHashed:          !!hashedPw,
        canAccessReception: false,
        nextPayDate:        null
    };

    const backupPersonal = appData.personal.length;
    appData.personal.push(person);
    try {
        await saveData();
    } catch(saveErr) {
        appData.personal.splice(backupPersonal, 1); // revertir
        showError('Error al agregar personal. Intenta de nuevo.', saveErr);
        return;
    }
    updatePersonalTab();
    updateProfessionalPicker();
    closeModal('modalAddPersonal');
    showToast('✓ Personal agregado exitosamente');
}

function updatePersonalTab() {
    const list = document.getElementById('personalList');
    const personal = appData.personal.filter(p => !p.isAdmin);

    if (personal.length === 0) {
        list.innerHTML = '<li style="text-align: center; color: #8e8e93;">No hay personal registrado</li>';
    } else {
        list.innerHTML = personal.map(p => {
            const esEmp   = p.tipo === 'empleado';
            const esSalFj = !esEmp && p.tipoRemuneracion === 'salario';
            const avances = calcularTotalAvances(p.id);

            let rightHtml;
            if (esEmp || esSalFj) {
                const base  = esEmp ? (p.sueldo || 0) : (p.salarioFijo || 0);
                const frec  = getFrecuenciaLabel(p.frecuenciaPago || 'mensual');
                rightHtml   = '<div style="font-size:17px;font-weight:600;color:#34c759">' + formatCurrency(base) + '</div>'
                            + '<div style="font-size:11px;color:var(--light)">' + frec + '</div>'
                            + (avances > 0 ? '<div style="font-size:12px;color:#8e44ad">Avances: ' + formatCurrency(avances) + '</div>' : '');
            } else {
                const rate  = getComisionRate(p.tipo, p);
                const acum  = calcularComisionesAcumuladas(p);
                rightHtml   = '<div style="font-size:17px;font-weight:600;color:var(--clinic-color,#C4856A)">' + rate + '%</div>'
                            + '<div style="font-size:11px;color:var(--light)">comisión</div>'
                            + (acum > 0 ? '<div style="font-size:12px;color:#ff9500">' + formatCurrency(acum) + '</div>' : '');
            }

            return '<li onclick="openPersonalDetail(\'' + p.id + '\')">' 
                 + '<div class="item-header">'
                 + '<div style="flex:1;min-width:0">'
                 + '<div class="item-title" style="font-size:15px;font-weight:500;color:var(--dark)">' + p.nombre + '</div>'
                 + '<div class="item-meta">' + getTipoLabel(p.tipo, p) + '</div>'
                 + '</div>'
                 + '<div style="text-align:right;flex-shrink:0;margin-left:12px">' + rightHtml + '</div>'
                 + '</div></li>';
        }).join('');
    }
}

function getTipoLabel(tipo, person) {
    const labels = {
        'regular': 'Odontólogo Regular',
        'especialista': 'Especialista',
        'empleado': 'Empleado / Administrativo'
    };
    let label = labels[tipo] || tipo;
    if (person && tipo !== 'empleado') {
        if (person.tipoRemuneracion === 'salario') label += ' · Salario fijo';
        else label += ' · Comisión';
        if (person.frecuenciaPago && person.frecuenciaPago !== 'mensual')
            label += ' · pago ' + (person.frecuenciaPago);
    }
    return label;
}

function getFrecuenciaLabel(frec) {
    return { mensual:'Mensual', quincenal:'Quincenal', semanal:'Semanal' }[frec] || 'Mensual';
}

function calcularComisionesAcumuladas(person) {
    const lastPayment = person.lastPaymentDate ? new Date(person.lastPaymentDate) : new Date(0);
    const comisionRate = getComisionRate(person.tipo, person);

    // Calcular comisiones sobre el TOTAL COBRADO de facturas pagadas
    // (el total ya incluye laboratorio, no hay que contarlo aparte)
    // Incluir facturas pagadas Y parciales — la comisión es sobre lo cobrado, no el total
    const comisiones = appData.facturas
        .filter(f => f.profesional === person.nombre &&
                    (f.estado === 'pagada' || f.estado === 'parcial' || f.estado === 'partial') &&
                    new Date(f.fecha) > lastPayment)
        .reduce((sum, f) => sum + ((f.pagos || []).reduce((s, p) => s + p.monto, 0) * comisionRate / 100), 0);

    return comisiones;
}

function calcularTotalAvances(personalId) {
    return appData.avances
        .filter(a => a.personalId === personalId)
        .reduce((sum, a) => sum + a.monto, 0);
}

let currentPersonalDetail = null;

function openPersonalDetail(id) {
    const person = appData.personal.find(p => p.id === id);
    if (!person) return;

    // Registrar acceso a información sensible
    if (person.tipo === 'empleado') {
        registrarAuditoria(
            'acceso',
            'dato_sensible',
            'Consultó info salarial de ' + person.nombre + ' (' + getTipoLabel(person.tipo, person) + ')'
        );
    }

    currentPersonalDetail = person;
    document.getElementById('personalDetailName').textContent = person.nombre;

    let content = `
        <div style="margin-bottom: 20px;">
            <div style="color: #666; font-size: 14px;">Tipo</div>
            <div style="font-weight: 600; font-size: 16px;">${getTipoLabel(person.tipo, person)}</div>
        </div>
    `;

    if (person.tipo !== 'empleado') {
        const esSalFj = person.tipoRemuneracion === 'salario';

        if (esSalFj) {
            // ── Profesional con salario fijo ──
            const avances = calcularTotalAvances(person.id);
            const base    = person.salarioFijo || 0;
            const neto    = Math.max(0, base - avances);
            const frec    = getFrecuenciaLabel(person.frecuenciaPago || 'mensual');
            content += '<div style="background:var(--surface);border-radius:14px;padding:18px;margin-bottom:18px">'
                     + '<div style="font-size:11px;color:var(--light);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">Salario fijo &middot; ' + frec + '</div>'
                     + '<div style="font-size:30px;font-weight:300;color:#34c759;letter-spacing:-1px">' + formatCurrency(base) + '</div>'
                     + (avances > 0
                         ? '<div style="font-size:13px;color:#8e44ad;margin-top:4px">Avances: -' + formatCurrency(avances) + '</div>'
                         + '<div style="font-size:13px;color:var(--dark);font-weight:500">Neto: ' + formatCurrency(neto) + '</div>'
                         : '')
                     + '</div>'
                     + '<button class="btn btn-submit" style="background:#34c759;margin-bottom:12px;width:100%" onclick="event.stopPropagation();confirmarPagoProfesional(\'' + person.id + '\')">💰 Pagar Salario</button>'
                     + '<button class="btn btn-add" style="width:100%;margin-bottom:15px" onclick="event.stopPropagation();openAvance(\'' + person.id + '\')">+ Registrar Avance</button>';
        } else {
            // ── Profesional con comisiones ──
            const rate = getComisionRate(person.tipo, person);
            const acum = calcularComisionesAcumuladas(person);
            const avances = calcularTotalAvances(person.id);
            const hasCustom = typeof person.comisionPct === 'number';
            content += '<div style="background:var(--surface);border-radius:14px;padding:18px;margin-bottom:18px">'
                     + '<div style="font-size:11px;color:var(--light);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">Comisiones acumuladas</div>'
                     + '<div style="font-size:30px;font-weight:300;color:#ff9500;letter-spacing:-1px">' + formatCurrency(acum) + '</div>'
                     + (avances > 0
                         ? '<div style="font-size:13px;color:#8e44ad;margin-top:4px">Avances: -' + formatCurrency(avances) + '</div>'
                         + '<div style="font-size:13px;color:var(--dark);font-weight:500">Neto: ' + formatCurrency(Math.max(0, acum - avances)) + '</div>'
                         : '')
                     + '</div>'
                     + '<div style="margin-bottom:18px">'
                     + '<div style="color:#666;font-size:13px;margin-bottom:8px">Tasa de comisión</div>'
                     + '<div style="display:flex;align-items:center;gap:10px">'
                     + '<input type="number" id="inputComisionPersonal" value="' + rate + '" min="0" max="100" step="1"'
                     + ' style="width:72px;padding:8px 10px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:16px;font-family:inherit;text-align:center"'
                     + ' onfocus="this.style.borderColor=\'var(--clinic-color)\'" onblur="this.style.borderColor=\'#e0e0e0\'">'
                     + '<span style="color:#666;font-size:16px">%</span>'
                     + '<button onclick="guardarComisionPersonal(\'' + person.id + '\')" style="padding:8px 16px;background:var(--clinic-color);color:white;border:none;border-radius:100px;font-size:13px;font-family:inherit;cursor:pointer">Guardar</button>'
                     + (hasCustom ? '<button onclick="resetearComisionPersonal(\'' + person.id + '\')" style="padding:8px 12px;background:none;border:1.5px solid #e0e0e0;color:#999;border-radius:100px;font-size:12px;font-family:inherit;cursor:pointer" title="Usar tasa global">↺</button>' : '')
                     + '</div>'
                     + (hasCustom
                         ? '<div style="font-size:11px;color:var(--clinic-color);margin-top:4px">Tasa individual activa (global: ' + getComisionRate(person.tipo) + '%)</div>'
                         : '<div style="font-size:11px;color:#999;margin-top:4px">Usando tasa global</div>')
                     + '</div>'
                     + '<button class="btn btn-submit" style="background:#ff9500;margin-bottom:12px;width:100%" onclick="event.stopPropagation();confirmarPagoProfesional(\'' + person.id + '\')">💰 Pagar Comisiones</button>';
        }
    } else {
        const totalAvances = calcularTotalAvances(person.id);
        const avances = appData.avances.filter(a => a.personalId === person.id).slice(0, 5);
        const nextPayDate = person.nextPayDate ? new Date(person.nextPayDate).toLocaleDateString(getLocale()) : 'No establecida';

        content += `
            <div style="margin-bottom: 20px;">
                <div style="color: #666; font-size: 14px;">Sueldo Mensual</div>
                <div style="font-weight: 700; font-size: 18px; color: #34c759;">${formatCurrency(person.sueldo)}</div>
            </div>
            <div style="margin-bottom: 20px;">
                <div style="color: #666; font-size: 14px;">Total Avances</div>
                <div style="font-weight: 700; font-size: 24px; color: #8e44ad;">${formatCurrency(totalAvances)}</div>
            </div>
            <div style="margin-bottom: 20px;">
                <div style="color: #666; font-size: 14px;">Próxima Fecha de Pago</div>
                <div style="font-weight: 600; font-size: 16px;">${nextPayDate}</div>
            </div>
            <button class="btn btn-submit" style="background: #34c759; margin-bottom: 15px; width: 100%;" onclick="event.stopPropagation(); confirmarPagoEmpleado('${person.id}')">
                💰 Pagar Salario
            </button>
            <button class="btn btn-add" style="width: 100%;" onclick="event.stopPropagation(); openAvance('${person.id}')">+ Registrar Avance</button>
            ${avances.length > 0 ? `
                <div style="margin-top: 20px;">
                    <h3 style="font-size: 16px; margin-bottom: 10px;">Últimos Avances</h3>
                    ${avances.map(a => `
                        <div style="padding: 10px; background: #f8f8f8; border-radius: 8px; margin-bottom: 8px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                <strong>${formatCurrency(a.monto)}</strong>
                                <span style="color: #8e8e93; font-size: 13px;">${new Date(a.fecha).toLocaleDateString(getLocale())}</span>
                            </div>
                            ${a.notas ? `<div style="font-size: 13px; color: #666;">${a.notas}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        `;
    }

    // ── Permisos granulares (solo admin puede ver/editar) ──
    if (appData.currentRole === 'admin' && !person.isAdmin) {
        const permisos = person.permisos || {};
        const PERMS = [
            { key: 'cobrar',      label: 'Procesar cobros',   icon: '💳' },
            { key: 'facturar',    label: 'Crear facturas',    icon: '🧾' },
            { key: 'cuadre',      label: 'Ver cuadre diario', icon: '📊' },
            { key: 'gastos',      label: 'Registrar gastos',  icon: '💸' },
            { key: 'verIngresos', label: 'Ver ingresos',      icon: '📈' },
        ];
        content += `
            <div style="margin-top: 8px; margin-bottom: 20px; border-top: 1px solid #f0f0f0; padding-top: 20px;">
                <div style="font-size: 11px; font-weight: 500; color: #999; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 14px;">
                    Permisos
                </div>
                ${PERMS.map(p => {
                    const activo = permisos[p.key] !== false; // default true
                    return `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #f8f8f8;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 16px;">${p.icon}</span>
                            <span style="font-size: 14px; color: #333;">${p.label}</span>
                        </div>
                        <button onclick="togglePermiso('${person.id}', '${p.key}', ${activo})"
                            id="permBtn_${person.id}_${p.key}"
                            style="width: 48px; height: 28px; border-radius: 100px; border: none; cursor: pointer;
                                   background: ${activo ? 'var(--clinic-color, #C4856A)' : '#e0e0e0'};
                                   position: relative; transition: background 0.2s;">
                            <div style="width: 22px; height: 22px; border-radius: 50%; background: white;
                                        position: absolute; top: 3px; transition: left 0.2s;
                                        left: ${activo ? '23px' : '3px'};
                                        box-shadow: 0 1px 3px rgba(0,0,0,0.2);"></div>
                        </button>
                    </div>`;
                }).join('')}
            </div>
        `;
    }

        content += `
        <button class="btn btn-secondary" style="width: 100%; margin-top: 15px;" onclick="event.stopPropagation(); openEditPersonal('${person.id}')">
            ✏️ Editar Perfil
        </button>
        <button class="btn btn-danger" style="width: 100%; margin-top: 10px;" onclick="event.stopPropagation(); eliminarPersonal('${person.id}')">
            Eliminar Personal
        </button>
    `;

    document.getElementById('personalDetailContent').innerHTML = content;
    openModal('modalPersonalDetail');
}

function confirmarPagoSalarioFijo(person) {
    const avances = calcularTotalAvances(person.id);
    const base    = person.salarioFijo || 0;
    const neto    = Math.max(0, base - avances);
    const frec    = getFrecuenciaLabel(person.frecuenciaPago || 'mensual');
    mostrarConfirmacion({
        titulo: '💰 Pagar Salario',
        mensaje: '<div style="background:var(--surface);border-radius:12px;padding:20px;margin-bottom:16px">'
               + '<div style="font-size:11px;color:var(--mid);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">Neto a pagar &middot; ' + frec + '</div>'
               + '<div style="font-size:32px;font-weight:300;color:#34c759">' + formatCurrency(neto) + '</div></div>'
               + '<div style="font-size:14px;color:var(--mid)"><strong>' + person.nombre + '</strong> &middot; ' + getTipoLabel(person.tipo, person) + '</div>'
               + (avances > 0 ? '<div style="font-size:13px;color:var(--mid);margin-top:4px">Base: ' + formatCurrency(base) + ' &minus; Avances: ' + formatCurrency(avances) + '</div>' : ''),
        tipo: 'normal',
        confirmText: 'Sí, Pagar Ahora',
        onConfirm: async () => {
            const fecha = new Date().toLocaleDateString(getLocale(), {weekday:'long',year:'numeric',month:'long',day:'numeric'});
            const hora  = new Date().toLocaleTimeString(getLocale());
            let recibo  = '================================\n' + getNombreClinica() + '\n================================\n\n'
                        + 'RECIBO DE PAGO DE SALARIO\n\n'
                        + 'Fecha: ' + fecha + '\nHora: ' + hora + '\n'
                        + 'Para: ' + person.nombre + '\nCargo: ' + getTipoLabel(person.tipo, person) + '\n\n'
                        + '================================\n'
                        + 'Salario base:  ' + formatCurrency(base) + '\n'
                        + (avances > 0 ? 'Avances:      -' + formatCurrency(avances) + '\nNETO:          ' + formatCurrency(neto) + '\n' : '')
                        + '================================\n\n'
                        + 'Registrado por: ' + appData.currentUser + '\nFirma: _____________________\n';
            const backupAvances = [...appData.avances];
            appData.avances = appData.avances.filter(a => a.personalId !== person.id);
            const idx = appData.personal.findIndex(p => p.id === person.id);
            if (idx >= 0) appData.personal[idx].lastPaymentDate = new Date().toISOString();
            currentReciboText = recibo;
            document.getElementById('reciboContent').textContent = recibo;
            try {
                await saveData();
                closeModal('modalPersonalDetail');
                openModal('modalRecibo');
                updatePersonalTab();
            } catch(e) {
                appData.avances = backupAvances;
                showError('Error al registrar el pago.', e);
            }
        }
    });
}

function confirmarPagoProfesional(id) {
    const person = appData.personal.find(p => p.id === id);
    if (!person) return;

    if (person.tipoRemuneracion === 'salario') {
        confirmarPagoSalarioFijo(person); return;
    }

    const comisionesAcum = calcularComisionesAcumuladas(person);
    const avancesPendientes = calcularTotalAvances(person.id);
    const netoAPagar = Math.max(0, comisionesAcum - avancesPendientes);

    // Contar facturas que generaron la comisión
    const lastPayment = person.lastPaymentDate ? new Date(person.lastPaymentDate) : new Date(0);
    const facturasPagadas = appData.facturas.filter(f =>
        f.profesional === person.nombre &&
        f.estado === 'pagada' &&
        new Date(f.fecha) > lastPayment
    );

    mostrarConfirmacion({
        titulo: '💰 Pagar Comisiones',
        mensaje: `
            <div style="background: linear-gradient(135deg, #34c759 0%, #30d158 100%); padding: 20px; border-radius: 8px; color: white; margin-bottom: 15px; text-align: center;">
                <div style="font-size: 14px; opacity: 0.9; margin-bottom: 8px;">Neto a Pagar</div>
                <div style="font-size: 36px; font-weight: 700;">${formatCurrency(netoAPagar)}</div>
            </div>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <div style="font-size: 16px; font-weight: 600; color: var(--clinic-color, #C4856A); margin-bottom: 8px;">
                    ${person.nombre}
                </div>
                <div style="font-size: 14px; color: #666; margin-bottom: 4px;">
                    <strong>Cargo:</strong> ${getTipoLabel(person.tipo)}
                </div>
                <div style="font-size: 14px; color: #666; margin-bottom: 4px;">
                    <strong>Tasa de Comisión:</strong> ${getComisionRate(person.tipo, person)}%
                </div>
                <div style="font-size: 14px; color: #666; margin-bottom: 4px;">
                    <strong>Comisiones brutas:</strong> ${formatCurrency(comisionesAcum)}
                </div>
                ${avancesPendientes > 0 ? `
                <div style="font-size: 14px; color: #ff3b30; margin-bottom: 4px;">
                    <strong>Avances a descontar:</strong> -${formatCurrency(avancesPendientes)}
                </div>` : ''}
                <div style="font-size: 14px; color: #666;">
                    <strong>Facturas cobradas:</strong> ${facturasPagadas.length}
                </div>
            </div>
            <div style="background: #e3f2fd; padding: 12px; border-radius: 6px; font-size: 13px; color: #0d47a1; text-align: center;">
                ℹ️ Se generará un recibo imprimible
            </div>
        `,
        tipo: 'normal',
        confirmText: 'Sí, Pagar Ahora',
        onConfirm: () => {
            // Generar recibo
            const fecha = new Date().toLocaleDateString(getLocale(), {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'});
            const hora = new Date().toLocaleTimeString(getLocale());

            let recibo = `
================================
${getNombreClinica()}
${getNombreAdmin()}
================================

RECIBO DE PAGO DE COMISIONES

Fecha: ${fecha}
Hora: ${hora}
Para: ${person.nombre}
Cargo: ${getTipoLabel(person.tipo)}
Comisión: ${getComisionRate(person.tipo, person)}%

================================
DETALLE
================================

Comisiones brutas:   ${formatCurrency(comisionesAcum)}
${avancesPendientes > 0 ? `Avances descontados: -${formatCurrency(avancesPendientes)}\n` : ''}
NETO PAGADO:         ${formatCurrency(netoAPagar)}

================================

Registrado por: ${appData.currentUser}

Firma: _____________________

¡Gracias por su excelente trabajo!

================================
            `;

            // Resetear comisiones
            const backupLastPayment = person.lastPaymentDate;
            person.lastPaymentDate = new Date().toISOString();

            currentReciboText = recibo;
            document.getElementById('reciboContent').textContent = recibo;

            saveData().then(() => {
                closeModal('modalPersonalDetail');
                openModal('modalRecibo');
                updatePersonalTab();
            }).catch(e => {
                person.lastPaymentDate = backupLastPayment; // rollback
                showError('Error al registrar el pago. Intenta de nuevo.', e);
            });
        }
    });
}

function confirmarPagoEmpleado(id) {
    const person = appData.personal.find(p => p.id === id);
    if (!person) return;

    const totalAvances = calcularTotalAvances(person.id);
    const neto = person.sueldo - totalAvances;

    mostrarConfirmacion({
        titulo: '💰 Pagar Salario',
        mensaje: `
            <div style="background:var(--surface,#F5F2EE);border-radius:12px;padding:20px;margin-bottom:16px">
                <div style="font-size:11px;color:var(--mid);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">Neto a pagar &middot; ${getFrecuenciaLabel(person.frecuenciaPago || 'mensual')}</div>
                <div style="font-size:32px;font-weight:300;color:var(--green,#6B8F71)">${formatCurrency(neto)}</div>
            </div>
            <div style="font-size:14px;color:var(--mid);margin-bottom:4px"><strong style="color:var(--dark)">${person.nombre}</strong> · ${getTipoLabel(person.tipo, person)}</div>
            <div style="font-size:13px;color:var(--mid)">Salario base: ${formatCurrency(person.sueldo)}${totalAvances > 0 ? ` · Avances descontados: -${formatCurrency(totalAvances)}` : ''}</div>
        `,
        tipo: 'normal',
        confirmText: 'Sí, Pagar Ahora',
        onConfirm: async () => {

    // Generar recibo
    const fecha = new Date().toLocaleDateString(getLocale(), {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'});
    const hora = new Date().toLocaleTimeString(getLocale());

    let recibo = `
================================
${getNombreClinica()}
${getNombreAdmin()}
================================

RECIBO DE PAGO DE SALARIO

Fecha: ${fecha}
Hora: ${hora}
Para: ${person.nombre}
Cargo: ${getTipoLabel(person.tipo)}

================================
DETALLE DEL PAGO
================================

Salario Base:        ${formatCurrency(person.sueldo)}
`;

    if (totalAvances > 0) {
        recibo += `Avances Descontados: ${formatCurrency(totalAvances)}\n`;
        recibo += `--------------------------------\n`;
        recibo += `PAGO NETO:           ${formatCurrency(neto)}\n`;
    } else {
        recibo += `--------------------------------\n`;
        recibo += `PAGO TOTAL:          ${formatCurrency(person.sueldo)}\n`;
    }

    recibo += `
================================

Registrado por: ${appData.currentUser}

Firma: _____________________

¡Gracias por su dedicación!

================================
    `;

    // Resetear avances con rollback
    const backupAvances = [...appData.avances];
    appData.avances = appData.avances.filter(a => a.personalId !== person.id);

    currentReciboText = recibo;
    document.getElementById('reciboContent').textContent = recibo;

    try {
        await saveData();
        closeModal('modalPersonalDetail');
        openModal('modalRecibo');
        updatePersonalTab();
    } catch(e) {
        appData.avances = backupAvances; // rollback
        showError('Error al registrar el pago. Intenta de nuevo.', e);
    }
        } // end onConfirm
    }); // end mostrarConfirmacion
}

function compartirWhatsApp() {
    const texto = encodeURIComponent(currentReciboText);
    window.open(`https://wa.me/?text=${texto}`, '_blank');
}

function copiarRecibo() {
    navigator.clipboard.writeText(currentReciboText).then(() => {
        showToast('✓ Recibo copiado al portapapeles');
    });
}

function openEditPersonal(id) {
    const person = appData.personal.find(p => p.id === id);
    if (!person) return;

    currentPersonalToEdit = person;

    document.getElementById('editNombre').value = person.nombre;
    document.getElementById('editPassword').value = '';

    // Password field always visible for admin
    document.getElementById('editPasswordGroup').classList.remove('hidden');

    const esEmpEdit = person.tipo === 'empleado';
    _show('editSueldoGroup',           esEmpEdit);
    _show('editTipoRemuneracionGroup', !esEmpEdit);
    _show('editSalarioProGroup',       !esEmpEdit && person.tipoRemuneracion === 'salario');
    _show('editFrecuenciaPagoGroup',   esEmpEdit || person.tipoRemuneracion === 'salario');
    _show('editReceptionGroup',        esEmpEdit);
    _show('editPayDateGroup',          esEmpEdit);
    if (esEmpEdit) {
        document.getElementById('editSueldo').value = person.sueldo || '';
        document.getElementById('editReceptionAccess').checked = person.canAccessReception || false;
        document.getElementById('editPayDate').value = person.nextPayDate ? new Date(person.nextPayDate).toISOString().split('T')[0] : '';
    } else {
        const rEl = document.getElementById('editTipoRemuneracion');
        if (rEl) rEl.value = person.tipoRemuneracion || 'comision';
        const sEl = document.getElementById('editSalarioPro');
        if (sEl) sEl.value = person.salarioFijo || '';
    }
    const fEl = document.getElementById('editFrecuenciaPago');
    if (fEl) fEl.value = person.frecuenciaPago || 'mensual';

    closeModal('modalPersonalDetail');
    openModal('modalEditPersonal');
}

async function guardarEdicion() {
    if (!currentPersonalToEdit) return;

    const nombre   = sanitize.str(document.getElementById('editNombre')?.value, 120);
    const password = document.getElementById('editPassword')?.value || '';

    if (!nombre) { showToast('⚠️ El nombre es obligatorio'); return; }

    currentPersonalToEdit.nombre = nombre;

    // Hash new password before saving — never store plaintext
    if (password) {
        if (password.length < 4) { showToast('⚠️ La contraseña debe tener al menos 4 caracteres'); return; }
        currentPersonalToEdit.password  = await hashPassword(password);
        currentPersonalToEdit._pwHashed = true;
        registrarAuditoria('seguridad', 'cambio_contrasena', `Contraseña actualizada para ${nombre}`);
    }

    if (currentPersonalToEdit.tipo === 'empleado') {
        const sueldo = sanitize.num(document.getElementById('editSueldo')?.value, 0);
        if (sueldo) currentPersonalToEdit.sueldo = sueldo;
        currentPersonalToEdit.tipoRemuneracion = 'salario';
        currentPersonalToEdit.frecuenciaPago = document.getElementById('editFrecuenciaPago')?.value || 'mensual';
        currentPersonalToEdit.canAccessReception = document.getElementById('editReceptionAccess')?.checked || false;
        const payDate = document.getElementById('editPayDate')?.value;
        if (payDate) currentPersonalToEdit.nextPayDate = new Date(payDate).toISOString();
    } else {
        const tipoRem = document.getElementById('editTipoRemuneracion')?.value || 'comision';
        currentPersonalToEdit.tipoRemuneracion = tipoRem;
        if (tipoRem === 'salario') {
            const salFijo = sanitize.num(document.getElementById('editSalarioPro')?.value, 0);
            if (salFijo > 0) currentPersonalToEdit.salarioFijo = salFijo;
            currentPersonalToEdit.frecuenciaPago = document.getElementById('editFrecuenciaPago')?.value || 'mensual';
        } else {
            currentPersonalToEdit.salarioFijo    = null;
            currentPersonalToEdit.frecuenciaPago = null;
        }
    }

    try {
        await saveData();
    } catch(e) {
        showError('Error al guardar los cambios. Intenta de nuevo.', e);
        return;
    }
    updatePersonalTab();
    updateProfessionalPicker();
    closeModal('modalEditPersonal');
    showToast('✓ Perfil actualizado');
}

function openAvance(personalId) {
    currentPersonalDetail = appData.personal.find(p => p.id === personalId);
    document.getElementById('avanceMonto').value = '';
    document.getElementById('avanceNotas').value = '';
    closeModal('modalPersonalDetail');
    openModal('modalAvance');
}

function registrarAvance() {
    const monto = parseFloat(document.getElementById('avanceMonto').value);
    const notas = document.getElementById('avanceNotas').value;

    if (!monto || monto <= 0) {
        showToast('⚠️ Ingresa un monto válido', 3000, '#e65100');
        return;
    }

    // Validar que el avance no supere el sueldo disponible
    if (currentPersonalDetail.tipo === 'empleado' && currentPersonalDetail.sueldo) {
        const avancesActuales = calcularTotalAvances(currentPersonalDetail.id);
        const disponible = currentPersonalDetail.sueldo - avancesActuales;

        if (monto > disponible) {
            showToast(`❌ Avance supera el sueldo disponible. Máximo: ${formatCurrency(disponible)}`, 5000, '#c0392b');
            console.error('[Avance] Monto:', monto, 'Disponible:', disponible);
            return;
        }
    }

    const avance = {
        id: generateId(),
        personalId: currentPersonalDetail.id,
        monto,
        notas,
        fecha: new Date().toISOString(),
        registradoPor: appData.currentUser
    };

    const backupAvances = appData.avances.length;
    appData.avances.push(avance);
    saveData().then(() => {
        closeModal('modalAvance');
        updatePersonalTab();
        showToast('✓ Avance registrado exitosamente');
    }).catch(e => {
        appData.avances.splice(backupAvances, 1); // rollback
        showError('Error al registrar el avance.', e);
    });
}

function togglePermiso(personId, key, valorActual) {
    const person = appData.personal.find(p => p.id === personId);
    if (!person) return;
    if (!person.permisos) person.permisos = {};

    const nuevoValor = !valorActual;
    person.permisos[key] = nuevoValor;

    // Animate toggle immediately
    const btn = document.getElementById(`permBtn_${personId}_${key}`);
    if (btn) {
        btn.style.background = nuevoValor ? 'var(--clinic-color, #C4856A)' : '#e0e0e0';
        const dot = btn.querySelector('div');
        if (dot) dot.style.left = nuevoValor ? '23px' : '3px';
        btn.setAttribute('onclick', `togglePermiso('${personId}', '${key}', ${nuevoValor})`);
    }

    saveData();
    registrarAuditoria('editar', 'permiso', `${key}: ${nuevoValor ? 'activado' : 'desactivado'} para ${person.nombre}`);
}

function guardarComisionPersonal(personId) {
    const person = appData.personal.find(p => p.id === personId);
    if (!person) return;

    const input = document.getElementById('inputComisionPersonal');
    if (!input) return;

    const val = parseFloat(input.value);
    if (isNaN(val) || val < 0 || val > 100) {
        showToast('⚠️ La comisión debe ser entre 0 y 100', 3000, '#e65100');
        return;
    }

    person.comisionPct = val;
    saveData();
    showToast(`✓ Comisión de ${person.nombre} actualizada a ${val}%`);

    // Refresh the modal to show the individual badge
    openPersonalDetail(personId);
}

function resetearComisionPersonal(personId) {
    const person = appData.personal.find(p => p.id === personId);
    if (!person) return;

    delete person.comisionPct;
    saveData();
    showToast('✓ Comisión reseteada a tasa global');
    openPersonalDetail(personId);
}

function eliminarPersonal(id) {
    const person = appData.personal.find(p => p.id === id);
    if (!person) return;

    // Prevenir auto-eliminación de admin
    if (person.isAdmin) {
        showToast('❌ No se puede eliminar la cuenta de administrador', 4000, '#c0392b');
        console.error('[Personal] Intento de eliminar admin bloqueado.');
        return;
    }

    // Verificar si tiene facturas asociadas
    const facturasAsociadas = appData.facturas.filter(f => f.profesional === person.nombre);
    const avancesAsociados = appData.avances.filter(a => a.personalId === id);
    const comisionesAcumuladas = calcularComisionesAcumuladas(person);

    let advertencias = '';
    if (facturasAsociadas.length > 0) {
        advertencias += `<div style="background: #fff3cd; padding: 10px; border-radius: 6px; margin-bottom: 10px; border-left: 3px solid #ffc107;">
            <div style="color: #856404; font-size: 13px;">
                ⚠️ Tiene <strong>${facturasAsociadas.length} factura(s)</strong> registrada(s).
                <br>Los registros históricos se conservarán.
            </div>
        </div>`;
    }
    if (avancesAsociados.length > 0) {
        const totalAvances = avancesAsociados.reduce((sum, a) => sum + a.monto, 0);
        advertencias += `<div style="background: #ffe6e6; padding: 10px; border-radius: 6px; margin-bottom: 10px; border-left: 3px solid #ff3b30;">
            <div style="color: #c41e3a; font-size: 13px;">
                ⚠️ Tiene <strong>${avancesAsociados.length} avance(s)</strong> pendiente(s) por ${formatCurrency(totalAvances)}.
                <br>Los avances serán eliminados.
            </div>
        </div>`;
    }
    if (comisionesAcumuladas > 0) {
        advertencias += `<div style="background: #fff3cd; padding: 10px; border-radius: 6px; margin-bottom: 10px; border-left: 3px solid #ffc107;">
            <div style="color: #856404; font-size: 13px;">
                ⚠️ Tiene comisiones acumuladas de <strong>${formatCurrency(comisionesAcumuladas)}</strong> sin pagar.
            </div>
        </div>`;
    }

    mostrarConfirmacion({
        titulo: `⚠️ Eliminar Personal`,
        mensaje: `
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <div style="font-size: 18px; font-weight: 600; color: var(--clinic-color, #C4856A); margin-bottom: 8px;">
                    ${person.nombre}
                </div>
                <div style="font-size: 14px; color: #666;">
                    <strong>Tipo:</strong> ${getTipoLabel(person.tipo)}
                </div>
            </div>
            ${advertencias}
            <div style="background: #f8f9fa; padding: 12px; border-radius: 6px; color: #666; font-size: 13px; text-align: center;">
                Esta acción no se puede deshacer
            </div>
        `,
        tipo: 'peligro',
        confirmText: 'Sí, Eliminar Personal',
        onConfirm: async () => {
            const backupPersonal = [...appData.personal];
            const backupAvances  = [...appData.avances];
            appData.personal = appData.personal.filter(p => p.id !== id);
            appData.avances  = appData.avances.filter(a => a.personalId !== id);
            try {
                await saveData();
                closeModal('modalPersonalDetail');
                closeModal('modalEditPersonal');
                updatePersonalTab();
                updateProfessionalPicker();
                showToast('✓ Personal eliminado');
            } catch(e) {
                appData.personal = backupPersonal; // rollback
                appData.avances  = backupAvances;
                showError('Error al eliminar. Intenta de nuevo.', e);
            }
        }
    });
}

// Perfil Tab
// ═══════════════════════════════════════════════
// CONFIGURACIÓN DE CLÍNICA (Panel de admin)
// ═══════════════════════════════════════════════

function poblarConfigClinica() {
    // IDENTIDAD
    const nombreInput = document.getElementById('configNombreClinica');
    if (nombreInput) nombreInput.value = clinicConfig.nombre || '';

    const colorInput = document.getElementById('configColorClinica');
    const colorHex   = document.getElementById('configColorHex');
    if (colorInput) {
        colorInput.value = clinicConfig.color || '#C4856A';
        if (colorHex) colorHex.textContent = clinicConfig.color || '#C4856A';
        colorInput.oninput = () => {
            if (colorHex) colorHex.textContent = colorInput.value;
        };
    }

    const logoInput = document.getElementById('configLogoUrl');
    if (logoInput) {
        logoInput.value = clinicConfig.logoPositivo || '';
        actualizarPreviewLogo(clinicConfig.logoPositivo || '');
        logoInput.oninput = () => actualizarPreviewLogo(logoInput.value);
    }

    // Moneda
    const monedaSelect = document.getElementById('configMoneda');
    if (monedaSelect) monedaSelect.value = clinicConfig.moneda || 'RD$';
    // Nómina defaults
    const cfgRem = document.getElementById('configDefaultRemuneracion');
    const cfgFrq = document.getElementById('configDefaultFrecuencia');
    if (cfgRem) cfgRem.value = clinicConfig.defaultRemuneracion || 'comision';
    if (cfgFrq) cfgFrq.value = clinicConfig.defaultFrecuenciaPago || 'mensual';

    // SEGURIDAD — no pre-llenar contraseña
    const pwdInput = document.getElementById('configNewPassword');
    const pwdConfirm = document.getElementById('configConfirmPassword');
    if (pwdInput)  pwdInput.value = '';
    if (pwdConfirm) pwdConfirm.value = '';

    // NÓMINA
    const settings = appData.settings || {};
    const comisionRegular      = document.getElementById('configComisionRegular');
    const comisionEspecialista = document.getElementById('configComisionEspecialista');
    if (comisionRegular)      comisionRegular.value      = settings.comisionRegular      ?? 60;
    if (comisionEspecialista) comisionEspecialista.value = settings.comisionEspecialista ?? 50;

    // AGENDA
    const apertura   = document.getElementById('configHoraApertura');
    const cierre     = document.getElementById('configHoraCierre');
    const duracion   = document.getElementById('configDuracionCita');
    if (apertura) apertura.value  = settings.horaApertura ?? 8;
    if (cierre)   cierre.value    = settings.horaCierre   ?? 20;
    if (duracion) duracion.value  = settings.duracionCita ?? 30;
}

function actualizarPreviewLogo(url) {
    const preview = document.getElementById('configLogoPreview');
    const img     = document.getElementById('configLogoImg');
    if (!preview || !img) return;
    if (url && url.startsWith('http')) {
        img.src = url;
        preview.style.display = 'block';
        img.onerror = () => { preview.style.display = 'none'; };
    } else {
        preview.style.display = 'none';
    }
}

async function guardarIdentidadClinica() {
    const nombre = document.getElementById('configNombreClinica').value.trim();
    const color  = document.getElementById('configColorClinica').value;
    const logo   = document.getElementById('configLogoUrl').value.trim();

    if (!nombre) { showToast('⚠️ El nombre de la clínica es obligatorio', 4000, '#e65100'); return; }
    if (!canWriteToFirebase('guardarIdentidadClinica')) return;

    try {
        const monedaVal = document.getElementById('configMoneda')?.value || clinicConfig.moneda || 'RD$';
        const LOCALES_MONEDA = {
            '$': 'es-MX', 'RD$': 'es-DO', 'R$': 'pt-BR', 'S/': 'es-PE',
            'Q': 'es-GT', 'L': 'es-HN', 'C$': 'es-NI', 'B/.': 'es-PA',
            '₡': 'es-CR', 'Bs': 'es-BO', '₲': 'es-PY', 'Bs.': 'es-VE',
            '€': 'es-ES', '£': 'en-GB',
        };
        const localeVal = LOCALES_MONEDA[monedaVal] || 'es-419';

        await db.collection('clinicas').doc(CLINIC_PATH)
            .collection('config').doc('settings')
            .set({
                nombre,
                color,
                logoPositivo: logo || null,
                logoNegativo: logo || null,
                moneda: monedaVal,
                locale: localeVal,
            }, { merge: true });

        // Update local state immediately
        clinicConfig.nombre       = nombre;
        clinicConfig.color        = color;
        clinicConfig.logoPositivo = logo || null;
        clinicConfig.logoNegativo = logo || null;
        clinicConfig._logoSrc     = logo || null;
        clinicConfig.moneda       = monedaVal;
        clinicConfig.locale       = localeVal;

        // Re-apply branding live without waiting for Firebase round-trip
        applyLogoEverywhere(logo || null, nombre);
        loadClinicBranding(); // also syncs color and other branding

        showToast('✓ Identidad guardada');
    } catch(e) {
        console.error(e);
        showToast('❌ Error al guardar. Verifica tu conexión.', 5000, '#c0392b');
        console.error('[Config] Error guardando identidad:', e);
    }
}

async function guardarContrasenaAdmin() {
    const nueva    = document.getElementById('configNewPassword').value;
    const confirma = document.getElementById('configConfirmPassword').value;

    if (!nueva || nueva.length < 6) {
        showToast('⚠️ La contraseña debe tener al menos 6 caracteres'); return;
    }
    if (nueva !== confirma) {
        showToast('⚠️ Las contraseñas no coinciden'); return;
    }

    const admin = appData.personal.find(p => p.isAdmin);
    if (!admin) {
        showToast('❌ No se encontró el administrador', 4000, '#c0392b'); return;
    }

    // Hash before saving — never store plaintext
    const pwAnterior    = admin.password;
    const pwHashedAntes = admin._pwHashed;
    admin.password  = await hashPassword(nueva);
    admin._pwHashed = true;

    try {
        await saveData();
        document.getElementById('configNewPassword').value  = '';
        document.getElementById('configConfirmPassword').value = '';
        showToast('✓ Contraseña actualizada');
        registrarAuditoria('seguridad', 'cambio_contrasena', 'Contraseña de administrador actualizada');
    } catch(e) {
        admin.password  = pwAnterior;    // rollback
        admin._pwHashed = pwHashedAntes;
        showError('Error al guardar la contraseña.', e);
    }
}

async function guardarTasasComision() {
    const regular      = parseInt(document.getElementById('configComisionRegular').value)      || 60;
    const especialista = parseInt(document.getElementById('configComisionEspecialista').value) || 50;

    if (regular < 0 || regular > 100 || especialista < 0 || especialista > 100) {
        showToast('⚠️ Las tasas deben estar entre 0% y 100%', 3000, '#e65100');
        return;
    }

    if (!appData.settings) appData.settings = {};
    appData.settings.comisionRegular      = regular;
    appData.settings.comisionEspecialista = especialista;

    try {
        await saveData();
        showToast('✓ Tasas de comisión guardadas');
    } catch(e) {
        console.error(e);
        showToast('❌ Error al guardar tasas.', 4000, '#c0392b');
        console.error('[Config] Error guardando comisiones:', e);
    }
}

async function guardarConfigNomina() {
    const defRem = document.getElementById('configDefaultRemuneracion')?.value || 'comision';
    const defFrq = document.getElementById('configDefaultFrecuencia')?.value || 'mensual';
    if (!canWriteToFirebase('guardarConfigNomina')) return;
    try {
        await db.collection('clinicas').doc(CLINIC_PATH)
            .collection('config').doc('settings')
            .set({ defaultRemuneracion: defRem, defaultFrecuenciaPago: defFrq }, { merge: true });
        clinicConfig.defaultRemuneracion   = defRem;
        clinicConfig.defaultFrecuenciaPago = defFrq;
        showToast('✓ Modelo de nómina guardado');
    } catch(e) { showToast('❌ Error al guardar', 4000, '#c0392b'); }
}

async function guardarConfigAgenda() {
    const apertura = parseInt(document.getElementById('configHoraApertura').value);
    const cierre   = parseInt(document.getElementById('configHoraCierre').value);
    const duracion = parseInt(document.getElementById('configDuracionCita').value);

    if (apertura >= cierre) {
        showToast('⚠️ La hora de apertura debe ser antes del cierre', 3000, '#e65100');
        return;
    }

    if (!appData.settings) appData.settings = {};
    appData.settings.horaApertura = apertura;
    appData.settings.horaCierre   = cierre;
    appData.settings.duracionCita = duracion;

    try {
        await saveData();
        showToast('✓ Configuración de agenda guardada');
    } catch(e) {
        console.error(e);
        showToast('❌ Error al guardar. Verifica tu conexión.', 4000, '#c0392b'); console.error('[Config Agenda] Error guardando:', e);
    }
}


function updatePerfilTab() {
    document.getElementById('perfilNombre').textContent = appData.currentUser;
    const roles = {
        'professional': 'Profesional',
        'reception': 'Recepción',
        'admin': 'Administrador'
    };
    document.getElementById('perfilRol').textContent = roles[appData.currentRole];

    // Clinic identity banner — always visible to all roles
    const banner       = document.getElementById('perfilClinicaBanner');
    const bannerLogo   = document.getElementById('perfilClinicaLogo');
    const bannerNombre = document.getElementById('perfilClinicaNombre');
    if (banner && clinicConfig.nombre) {
        banner.style.display = 'block';
        if (bannerNombre) bannerNombre.textContent = clinicConfig.nombre;
        if (bannerLogo && clinicConfig._logoSrc) {
            bannerLogo.src = clinicConfig._logoSrc;
            bannerLogo.style.display = 'block';
            bannerLogo.onerror = () => { bannerLogo.style.display = 'none'; };
        } else if (bannerLogo) {
            bannerLogo.style.display = 'none';
        }
    } else if (banner) {
        banner.style.display = 'none';
    }

    // Mostrar botón de auditoría solo para admin
    const btnAuditoria = document.getElementById('btnAuditoria');
    if (btnAuditoria) {
        btnAuditoria.style.display = appData.currentRole === 'admin' ? 'block' : 'none';
    }

    // Mostrar configuración de zona horaria solo para admin
    const timezoneCard = document.getElementById('timezoneCard');
    if (timezoneCard) {
        if (appData.currentRole === 'admin') {
            timezoneCard.style.display = 'block';

            // Establecer zona horaria actual
            const currentTimezone = getTimezone();
            const timezoneSelect = document.getElementById('timezoneSelect');
            if (timezoneSelect) {
                timezoneSelect.value = currentTimezone;
            }
        } else {
            timezoneCard.style.display = 'none';
        }
    }

    // Mostrar configuración de clínica solo para admin
    const clinicaConfigCard = document.getElementById('clinicaConfigCard');
    if (clinicaConfigCard) {
        if (appData.currentRole === 'admin') {
            clinicaConfigCard.style.display = 'block';
            poblarConfigClinica();
        } else {
            clinicaConfigCard.style.display = 'none';
        }
    }

    // Mostrar importar pacientes solo para admin
    const importarCard = document.getElementById('importarCard');
    if (importarCard) {
        importarCard.style.display = appData.currentRole === 'admin' ? 'block' : 'none';
    }
    const exportarCard = document.getElementById('exportarCard');
    if (exportarCard && appData.currentRole === 'admin') {
        exportarCard.style.display = 'block';
        const stats = document.getElementById('exportarPacientesStats');
        if (stats) {
            const total = (appData.pacientes || []).length;
            const conTel = appData.pacientes.filter(p => p.telefono).length;
            const conEmail = appData.pacientes.filter(p => p.email).length;
            stats.textContent = `${total} pacientes · ${conTel} con teléfono · ${conEmail} con email`;
        }
    }

    // Mostrar reversiones solo para admin
    const reversionesCard = document.getElementById('reversionesCard');
    if (appData.currentRole === 'admin') {
        reversionesCard.style.display = 'block';

        const list = document.getElementById('reversionesList');
        const reversiones = appData.reversiones || [];

        if (reversiones.length === 0) {
            list.innerHTML = '<li style="text-align: center; color: #8e8e93;">No hay reversiones registradas</li>';
        } else {
            // Mostrar más recientes primero
            list.innerHTML = reversiones.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).map(r => `
                <li>
                    <div class="item-header">
                        <div class="item-title">Factura ${r.facturaNumero} - ${r.paciente}</div>
                        <div style="color: #ff3b30; font-weight: 700;">${formatCurrency(r.montoReversado)}</div>
                    </div>
                    <div class="item-meta">
                        ${formatDateWithTimezone(r.fecha)} • ${r.metodoPago} • Por: ${r.reversadoPor}
                    </div>
                    <div style="margin-top: 8px; padding: 10px; background: #fff3cd; border-radius: 6px; font-size: 13px; color: #856404;">
                        <strong>Motivo:</strong> ${r.motivo}
                    </div>
                </li>
            `).join('');
        }
    } else {
        reversionesCard.style.display = 'none';
    }
}

// Modal
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Close modal on outside click
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            this.classList.remove('active');
        }
    });
});

// ========================================
// ELIMINAR FACTURA (SOLO ADMIN)
// ========================================

function eliminarFactura(facturaId) {
    const factura = appData.facturas.find(f => f.id === facturaId);
    if (!factura) return;

    if (appData.currentRole !== 'admin') {
        showToast('⛔ Solo el administrador puede eliminar facturas', 3000, '#c0392b');
        return;
    }

    const totalPagado = factura.pagos.reduce((sum, p) => sum + p.monto, 0);
    const estadoLabel = factura.estado === 'pagada' ? 'Pagada' :
                       factura.estado === 'partial' ? 'Con abono' : 'Pendiente';

    mostrarConfirmacion({
        titulo: '⚠️ Eliminar Factura',
        mensaje: `
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <div style="font-size: 18px; font-weight: 600; color: var(--clinic-color, #C4856A); margin-bottom: 10px;">
                    Factura ${factura.numero}
                </div>
                <div style="font-size: 14px; color: #666; margin-bottom: 5px;">
                    <strong>Paciente:</strong> ${factura.paciente}
                </div>
                <div style="font-size: 14px; color: #666; margin-bottom: 5px;">
                    <strong>Profesional:</strong> ${factura.profesional}
                </div>
                <div style="font-size: 14px; color: #666; margin-bottom: 5px;">
                    <strong>Total:</strong> ${formatCurrency(factura.total)}
                </div>
                <div style="font-size: 14px; color: #666; margin-bottom: 5px;">
                    <strong>Pagado:</strong> ${formatCurrency(totalPagado)}
                </div>
                <div style="font-size: 14px; color: #666;">
                    <strong>Estado:</strong> ${estadoLabel}
                </div>
            </div>
            <div style="background: #fff3cd; padding: 12px; border-radius: 6px; border-left: 3px solid #ffc107;">
                <strong style="color: #856404;">⚠️ Esta acción NO se puede deshacer.</strong>
            </div>
        `,
        tipo: 'peligro',
        confirmText: 'Sí, Eliminar Factura',
        onConfirm: async () => {
            // Registrar auditoría ANTES de eliminar
            registrarAuditoria(
                'eliminar',
                'factura',
                `Factura ${factura.numero} - Paciente: ${factura.paciente} - Total: ${formatCurrency(factura.total)}`
            );

            const backupFacturas = [...appData.facturas];
            appData.facturas = appData.facturas.filter(f => f.id !== facturaId);
            try {
                await saveData();
                updateCobrarTab();
                showToast('✓ Factura eliminada correctamente');
            } catch(saveErr) {
                appData.facturas = backupFacturas;
                showError('Error al eliminar la factura.', saveErr);
            }
        }
    });
}

// ========================================
// REVERSAR COBRO
// ========================================

function abrirReversarCobro(facturaId) {
    // Solo admin puede reversar cobros
    if (appData.currentRole !== 'admin') {
        showToast('⛔ Solo el administrador puede reversar cobros', 3000, '#c0392b');
        return;
    }

    const factura = appData.facturas.find(f => f.id === facturaId);
    if (!factura || factura.pagos.length === 0) {
        showToast('⚠️ No hay pagos para reversar', 3000, '#e65100');
        return;
    }

    currentFacturaToReverse = factura;
    // Always reverse the most recent payment — store its index so confirmarReversion
    // removes the exact payment we showed, even if the array changes between open and confirm.
    const ultimoPago = factura.pagos[factura.pagos.length - 1];
    currentFacturaToReverse._pagoAReversarId = ultimoPago.id || null;
    currentFacturaToReverse._pagoAReversarIdx = factura.pagos.length - 1;

    document.getElementById('reversarFacturaNum').textContent = factura.numero;
    document.getElementById('reversarPaciente').textContent = factura.paciente;
    document.getElementById('reversarMonto').textContent = formatCurrency(ultimoPago.monto);
    document.getElementById('reversarMotivo').value = '';

    openModal('modalReversarCobro');
}

async function confirmarReversion() {
    const motivo = document.getElementById('reversarMotivo').value.trim();

    if (!motivo) {
        showToast('⚠️ Ingresa el motivo de la reversión', 3000, '#e65100');
        return;
    }

    if (!currentFacturaToReverse) return;

    const factura = appData.facturas.find(f => f.id === currentFacturaToReverse.id);
    if (!factura || factura.pagos.length === 0) return;

    // Find the specific payment we showed the user — by ID if available, else by saved index
    let pagoIdx = -1;
    if (currentFacturaToReverse._pagoAReversarId) {
        pagoIdx = factura.pagos.findIndex(p => p.id === currentFacturaToReverse._pagoAReversarId);
    }
    if (pagoIdx === -1) {
        pagoIdx = currentFacturaToReverse._pagoAReversarIdx ?? (factura.pagos.length - 1);
    }
    if (pagoIdx < 0 || pagoIdx >= factura.pagos.length) return;

    const pagoReversado = factura.pagos[pagoIdx];
    factura.pagos.splice(pagoIdx, 1);

    // Recalcular estado de la factura
    const totalPagado = factura.pagos.reduce((sum, p) => sum + p.monto, 0);
    if (totalPagado === 0) {
        factura.estado = 'pendiente';
    } else if (totalPagado < factura.total) {
        factura.estado = 'parcial';
    } else {
        factura.estado = 'pagada';
    }

    // Registrar la reversión
    const reversion = {
        id: generateId(),
        facturaId: factura.id,
        facturaNumero: factura.numero,
        paciente: factura.paciente,
        montoReversado: pagoReversado.monto,
        metodoPago: pagoReversado.metodo,
        motivo: motivo,
        reversadoPor: appData.currentUser,
        fecha: new Date().toISOString(),
        pagoOriginal: pagoReversado
    };

    appData.reversiones.push(reversion);

    try {
        await saveData();
    } catch(saveErr) {
        // Rollback: restaurar el pago y recalcular estado
        factura.pagos.splice(pagoIdx, 0, pagoReversado);
        const totalRestaurado = factura.pagos.reduce((s, p) => s + p.monto, 0);
        factura.estado = totalRestaurado >= factura.total ? 'pagada' : totalRestaurado > 0 ? 'parcial' : 'pendiente';
        appData.reversiones.pop();
        showError('Error al reversar el cobro. Intenta de nuevo.', saveErr);
        return;
    }
    updateCobrarTab();
    closeModal('modalReversarCobro');
    showToast(`✓ Pago de ${formatCurrency(pagoReversado.monto)} reversado correctamente`);
}

// ========================================
// UTILIDADES
// ========================================

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString(getLocale(), {year: 'numeric', month: 'long', day: 'numeric'});
}

// Returns 'YYYY-MM-DD' in the clinic's configured timezone — stable key for cuadresDiarios
function getTodayKey() {
    const tz = getTimezone();
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now);
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value;
    const d = parts.find(p => p.type === 'day').value;
    return `${y}-${m}-${d}`;
}

// Returns the local-midnight timestamp for a YYYY-MM-DD key (for comparisons)
function keyToTimestamp(key) {
    return new Date(key + 'T00:00:00').getTime();
}

// Returns true if an ISO date string falls on a given YYYY-MM-DD key in clinic timezone.
// Replaces all new Date(x).setHours(0,0,0,0) === today comparisons throughout the codebase.
function isSameDayTZ(fechaISO, dayKey) {
    if (!fechaISO || !dayKey) return false;
    try {
        const tz = getTimezone();
        const key = new Intl.DateTimeFormat('en-CA', {
            timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date(fechaISO));
        return key === dayKey;
    } catch(e) {
        return new Date(fechaISO).toISOString().slice(0, 10) === dayKey;
    }
}

// Returns YYYY-MM-DD for yesterday in clinic timezone
function getYesterdayKey() {
    const tz = getTimezone();
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(d);
    return `${parts.find(p=>p.type==='year').value}-${parts.find(p=>p.type==='month').value}-${parts.find(p=>p.type==='day').value}`;
}

function generateId(prefix = '') {
    return prefix + Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

// ========================================
// MÓDULO DE PACIENTES
// ========================================

let currentPacienteId = null;

function updatePacientesTab() {
    const lista = document.getElementById('listaPacientes');
    if (!lista) return;

    if (appData.pacientes.length === 0) {
        lista.innerHTML = '<div style="text-align: center; padding: 60px; color: #999;"><div style="font-size: 48px; margin-bottom: 16px;">👥</div><div style="font-size: 16px;">No hay pacientes registrados</div></div>';
        return;
    }

    lista.innerHTML = appData.pacientes.map(p => {
        const balance = calcularBalancePaciente(p.nombre);
        const facturasPaciente = appData.facturas.filter(f => f.paciente === p.nombre);
        // data-search incluye nombre, cédula y teléfono para filtrado preciso
        const searchText = [p.nombre, p.cedula, p.telefono, p.email].filter(Boolean).join(' ').toLowerCase();

        return `
            <div class="list-item" onclick="verPaciente('${p.id}')" data-search="${searchText.replace(/"/g, '&quot;')}" style="cursor:pointer;padding:16px 20px;margin-bottom:12px;border-left:3px solid var(--clinic-color,#C4856A);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <div style="font-size: 17px; font-weight: 600; color: var(--dark, #1E1C1A); letter-spacing: -0.2px;">${p.nombre}</div>
                    <div>
                        ${balance > 0 ? `<span class="badge badge-warning">${formatCurrency(balance)}</span>` :
                          balance === 0 && facturasPaciente.length > 0 ? `<span class="badge badge-success">Al día</span>` : ''}
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px;">
                    ${p.telefono ? `<div style="font-size: 14px; color: #666;">📞 ${p.telefono}</div>` : ''}
                    ${p.cedula ? `<div style="font-size: 14px; color: #666;">🆔 ${p.cedula}</div>` : ''}
                    ${p.email ? `<div style="font-size: 14px; color: #666;">✉️ ${p.email}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function filterPacientes() {
    const search = document.getElementById('searchPacientes').value.toLowerCase().trim();
    const items = document.querySelectorAll('#listaPacientes .list-item');
    items.forEach(item => {
        // Usar data-search para evitar falsos positivos con montos y badges
        const text = (item.dataset.search || item.textContent).toLowerCase();
        item.style.display = text.includes(search) ? '' : 'none';
    });
}

function abrirModalNuevoPaciente() {
    document.getElementById('nuevoPacienteNombre').value = '';
    document.getElementById('nuevoPacienteCedula').value = '';
    document.getElementById('nuevoPacienteTelefono').value = '';
    document.getElementById('nuevoPacienteEmail').value = '';
    openModal('modalNuevoPaciente');
}

async function guardarPaciente() {
    try {
    const nombre   = sanitize.str(document.getElementById('nuevoPacienteNombre')?.value, 120);
    const telefono = sanitize.phone(document.getElementById('nuevoPacienteTelefono')?.value);

    if (!nombre)   { showToast('⚠️ El nombre del paciente es obligatorio'); return; }
    if (!telefono) { showToast('⚠️ El teléfono es obligatorio'); return; }

    const val = id => sanitize.str(document.getElementById(id)?.value, 300);
    const paciente = {
        id:              generateId('PAC-'),
        nombre,
        cedula:          sanitize.str(document.getElementById('nuevoPacienteCedula')?.value, 20),
        telefono,
        email:           sanitize.email(document.getElementById('nuevoPacienteEmail')?.value),
        fechaNacimiento: sanitize.str(document.getElementById('nuevoPacienteFechaNacimiento')?.value, 10),
        sexo:            document.getElementById('nuevoPacienteSexo')?.value || '',
        grupoSanguineo:  sanitize.str(document.getElementById('nuevoPacienteGrupoSanguineo')?.value, 5),
        direccion:       val('nuevoPacienteDireccion'),
        alergias:        val('nuevoPacienteAlergias'),
        seguroMedico:    sanitize.str(document.getElementById('nuevoPacienteSeguro')?.value, 100),
        contactoEmergencia: {
            nombre:   sanitize.str(document.getElementById('nuevoPacienteEmergenciaNombre')?.value, 120),
            telefono: sanitize.phone(document.getElementById('nuevoPacienteEmergenciaTelefono')?.value),
        },
        condiciones:  val('nuevoPacienteCondiciones'),
        fechaRegistro: new Date().toISOString()
    };

    const backupPacientes = appData.pacientes.length;
    appData.pacientes.push(paciente);
    try {
        await saveData();
    } catch(saveErr) {
        appData.pacientes.splice(backupPacientes, 1);
        showError('Error al guardar el paciente. Intenta de nuevo.', saveErr);
        return;
    }
    closeModal('modalNuevoPaciente');
    updatePacientesTab();

    // Limpiar formulario
    document.getElementById('nuevoPacienteNombre').value = '';
    document.getElementById('nuevoPacienteCedula').value = '';
    document.getElementById('nuevoPacienteTelefono').value = '';
    document.getElementById('nuevoPacienteEmail').value = '';
    document.getElementById('nuevoPacienteFechaNacimiento').value = '';
    document.getElementById('nuevoPacienteSexo').value = '';
    document.getElementById('nuevoPacienteGrupoSanguineo').value = '';
    document.getElementById('nuevoPacienteDireccion').value = '';
    document.getElementById('nuevoPacienteAlergias').value = '';
    document.getElementById('nuevoPacienteSeguro').value = '';
    document.getElementById('nuevoPacienteEmergenciaNombre').value = '';
    document.getElementById('nuevoPacienteEmergenciaTelefono').value = '';
    document.getElementById('nuevoPacienteCondiciones').value = '';
    } catch(e) {
        showError('Error al guardar el paciente.', e);
    }
}

function verPaciente(pacienteId) {
    currentPacienteId = pacienteId;
    const paciente = appData.pacientes.find(p => p.id === pacienteId);
    if (!paciente) return;

    document.getElementById('verPacienteNombre').textContent = paciente.nombre;

    // Subtítulo con info rápida
    let subtitulo = paciente.cedula || '';
    if (paciente.telefono) subtitulo += subtitulo ? ` • ${paciente.telefono}` : paciente.telefono;
    document.getElementById('verPacienteSubtitulo').textContent = subtitulo;

    // Solo ocultar/mostrar Balance por rol — renderizado lazy al cambiar tab
    // Ocultar tab Balance para profesionales (solo admin y recepción pueden cobrar)
    const tabBalanceBtn = document.getElementById('tabBalanceBtn');
    if (tabBalanceBtn) {
        if (appData.currentRole === 'professional') {
            tabBalanceBtn.style.display = 'none';
        } else {
            tabBalanceBtn.style.display = 'block';
        }
    }

    // Activar primer tab — cambiarTabPaciente renderizará solo ese tab
    cambiarTabPaciente('resumen');

    openModal('modalVerPaciente');
}

function cambiarTabPaciente(tabName) {
    // Actualizar botones
    document.querySelectorAll('.paciente-tab').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');
    // Renderizado lazy: solo renderizar el tab que se activa
    const paciente = appData.pacientes.find(p => p.id === currentPacienteId);
    if (!paciente) return;
    if (tabName === 'resumen')      renderTabResumen(paciente);
    else if (tabName === 'odontograma')  renderTabOdontograma(paciente);
    else if (tabName === 'historial')    renderTabHistorial(paciente);
    else if (tabName === 'recetas')      renderTabRecetas(paciente);
    else if (tabName === 'documentos')   renderTabDocumentos(paciente);
    else if (tabName === 'balance')      renderTabBalance(paciente);

    // Actualizar contenido
    document.querySelectorAll('.paciente-tab-content').forEach(content => {
        content.style.display = 'none';
    });

    const tabMap = {
        'resumen':      'tabResumen',
        'balance':      'tabBalance',
        'odontograma':  'tabOdontograma',
        'historial':    'tabHistorial',
        'recetas':      'tabRecetas',
        'documentos':   'tabDocumentos'
    };

    document.getElementById(tabMap[tabName]).style.display = 'block';
}

// ═══════════════════════════════════════════════
// ODONTOGRAMA INTERACTIVO
// ═══════════════════════════════════════════════

// FDI numbering: upper right → upper left → lower left → lower right
const DIENTES_SUPERIORES = [18,17,16,15,14,13,12,11, 21,22,23,24,25,26,27,28];
const DIENTES_INFERIORES = [48,47,46,45,44,43,42,41, 31,32,33,34,35,36,37,38];

// Estado visual config
const ODONTO_ESTADOS = {
    sano:       { label: 'Sano',       color: '#e8f5e9', border: '#66bb6a', text: '#2e7d32', symbol: '' },
    caries:     { label: 'Caries',     color: '#fff3e0', border: '#ffa726', text: '#e65100', symbol: '●' },
    extraccion: { label: 'Extracción', color: '#fce4ec', border: '#ef5350', text: '#b71c1c', symbol: '✕' },
    corona:     { label: 'Corona',     color: '#e3f2fd', border: '#42a5f5', text: '#0d47a1', symbol: '◆' },
    implante:   { label: 'Implante',   color: '#f3e5f5', border: '#ab47bc', text: '#4a148c', symbol: '⬡' },
    ausente:    { label: 'Ausente',    color: '#f5f5f5', border: '#bdbdbd', text: '#757575', symbol: '—' },
};
const ESTADOS_ORDEN = ['sano','caries','extraccion','corona','implante','ausente'];

let _dienteActual = null;  // { numero, paciente }
let _longPressTimer = null;

function renderTabOdontograma(paciente) {
    const canEdit = appData.currentRole === 'admin' || appData.currentRole === 'professional';
    const odonto  = paciente.odontograma || {};
    const tab = document.getElementById('tabOdontograma');
    if (!tab) return;

    const clinicColor = clinicConfig.color || '#C4856A';

    // Legend
    const legendHTML = Object.entries(ODONTO_ESTADOS).map(([key, cfg]) => `
        <div style="display:flex;align-items:center;gap:5px;">
            <div style="width:14px;height:14px;border-radius:3px;background:${cfg.color};border:1.5px solid ${cfg.border};flex-shrink:0;"></div>
            <span style="font-size:11px;color:#666;">${cfg.label}</span>
        </div>
    `).join('');

    tab.innerHTML = `
        <div style="padding:16px 16px 0;">
            <div style="font-size:13px;font-weight:500;color:#333;margin-bottom:4px;">Odontograma</div>
            <div style="font-size:11px;color:#999;margin-bottom:12px;">
                ${canEdit ? 'Toca un diente para cambiar su estado. Mantén presionado para agregar nota.' : 'Modo lectura.'}
            </div>

            <!-- Leyenda -->
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
                ${legendHTML}
            </div>

            <!-- ARCO SUPERIOR -->
            <div style="margin-bottom:4px;">
                <div style="font-size:9px;color:#bbb;text-align:center;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">Superior</div>
                <div style="display:flex;justify-content:center;gap:3px;">
                    ${_renderArco(DIENTES_SUPERIORES, odonto, canEdit, true)}
                </div>
            </div>

            <!-- Línea media -->
            <div style="display:flex;align-items:center;gap:8px;margin:6px 0;">
                <div style="flex:1;height:1px;background:linear-gradient(to right,transparent,#e0e0e0);"></div>
                <div style="font-size:9px;color:#ccc;letter-spacing:2px;">LÍNEA MEDIA</div>
                <div style="flex:1;height:1px;background:linear-gradient(to left,transparent,#e0e0e0);"></div>
            </div>

            <!-- ARCO INFERIOR -->
            <div style="margin-bottom:16px;">
                <div style="display:flex;justify-content:center;gap:3px;">
                    ${_renderArco(DIENTES_INFERIORES, odonto, canEdit, false)}
                </div>
                <div style="font-size:9px;color:#bbb;text-align:center;letter-spacing:1px;text-transform:uppercase;margin-top:4px;">Inferior</div>
            </div>

            <!-- Resumen de hallazgos -->
            ${_renderResumenOdonto(odonto)}
        </div>
    `;
}

function _renderArco(dientes, odonto, canEdit, esSuperior) {
    return dientes.map((num, i) => {
        const dato   = odonto[num] || { estado: 'sano' };
        const estado = dato.estado || 'sano';
        const cfg    = ODONTO_ESTADOS[estado] || ODONTO_ESTADOS.sano;

        // Cuadrante visual — dientes más grandes en centro (caninos/incisivos)
        const esCentral   = [11,12,21,22,31,32,41,42].includes(num);
        const esCanino    = [13,23,33,43].includes(num);
        const esMolar     = [16,17,18,26,27,28,36,37,38,46,47,48].includes(num);
        const size = esMolar ? 26 : esCanino ? 24 : esCentral ? 26 : 22;

        // Forma de raíz — triangulo pequeño arriba/abajo
        const rootDir = esSuperior ? 'top' : 'bottom';
        const rootTriangle = `
            <div style="width:6px;height:8px;margin:0 auto;
                background:linear-gradient(${esSuperior ? '180deg' : '0deg'},#d0d0d0,transparent);
                clip-path:${esSuperior ? 'polygon(50% 0%,0% 100%,100% 100%)' : 'polygon(0% 0%,100% 0%,50% 100%)'};
                opacity:0.5;">
            </div>`;

        const interactions = canEdit
            ? `ontouchstart="_odontoDienteDown(event,${num})" ontouchend="_odontoDienteUp(event)" ontouchcancel="_odontoDienteUp(event)"
               onmousedown="_odontoDienteDown(event,${num})" onmouseup="_odontoDienteUp(event)" onmouseleave="_odontoDienteUp(event)"
               onclick="_odontoDienteClick(${num})"`
            : `onclick="_odontoVerDiente(${num})"`;

        return `
            <div style="display:flex;flex-direction:column;align-items:center;gap:1px;cursor:${canEdit ? 'pointer' : 'default'};">
                ${esSuperior ? rootTriangle : ''}
                <div id="diente-${num}" ${interactions}
                    style="width:${size}px;height:${size}px;border-radius:${esMolar ? '5px' : '50%'};
                        background:${cfg.color};border:2px solid ${cfg.border};
                        display:flex;align-items:center;justify-content:center;
                        font-size:${cfg.symbol ? '10px' : '8px'};color:${cfg.text};font-weight:700;
                        transition:transform 0.12s,box-shadow 0.12s;
                        -webkit-tap-highlight-color:transparent;user-select:none;
                        box-shadow: ${dato.nota ? '0 0 0 2px #ffd700' : 'none'};"
                    title="Diente ${num}">
                    ${cfg.symbol || ''}
                </div>
                <div style="font-size:8px;color:#bbb;line-height:1;">${num}</div>
                ${!esSuperior ? rootTriangle : ''}
            </div>`;
    }).join('');
}

function _renderResumenOdonto(odonto) {
    const hallazgos = Object.entries(odonto)
        .filter(([, d]) => d.estado && d.estado !== 'sano')
        .sort(([a],[b]) => parseInt(a)-parseInt(b));

    if (hallazgos.length === 0) {
        return `<div style="text-align:center;padding:16px;color:#999;font-size:13px;">Sin hallazgos registrados</div>`;
    }

    const rows = hallazgos.map(([num, dato]) => {
        const cfg = ODONTO_ESTADOS[dato.estado] || ODONTO_ESTADOS.sano;
        return `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f5f5f5;">
                <div style="width:28px;height:28px;border-radius:6px;background:${cfg.color};border:1.5px solid ${cfg.border};
                    display:flex;align-items:center;justify-content:center;font-size:10px;color:${cfg.text};font-weight:700;flex-shrink:0;">
                    ${num}
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:13px;font-weight:500;color:${cfg.text};">${cfg.label}</div>
                    ${dato.nota ? `<div style="font-size:11px;color:#999;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${dato.nota}</div>` : ''}
                </div>
                <div style="font-size:10px;color:#bbb;text-align:right;flex-shrink:0;">
                    ${dato.fecha ? new Date(dato.fecha).toLocaleDateString(getLocale(),{day:'2-digit',month:'short'}) : ''}
                    ${dato.profesional ? `<br>${dato.profesional.split(' ')[0]}` : ''}
                </div>
            </div>`;
    }).join('');

    return `
        <div style="border-top:1px solid #f0f0f0;padding-top:12px;">
            <div style="font-size:11px;font-weight:500;color:#999;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">
                Hallazgos (${hallazgos.length})
            </div>
            ${rows}
        </div>`;
}

// ── Interacciones táctiles ──────────────────────

function _odontoDienteDown(e, num) {
    e.preventDefault();
    _longPressTimer = setTimeout(() => {
        _longPressTimer = null;
        _odontoAbrirModal(num);
    }, 500);
}

function _odontoDienteUp(e) {
    if (_longPressTimer) {
        clearTimeout(_longPressTimer);
        _longPressTimer = null;
    }
}

function _odontoDienteClick(num) {
    // Si el timer fue cancelado por un long press (_longPressTimer = null
    // tras disparar _odontoAbrirModal), el modal ya está abierto — no rotar.
    // Si el timer aún existe o fue cancelado por _odontoDienteUp (click corto),
    // entonces fue un tap/click normal → rotar estado.
    if (_dienteActual !== null) return; // modal de diente abierto — long press activo
    clearTimeout(_longPressTimer);
    _longPressTimer = null;
    _odontoRotarEstado(num);
}

function _odontoVerDiente(num) {
    _odontoAbrirModal(num, true); // readOnly
}

function _odontoRotarEstado(num) {
    const paciente = appData.pacientes.find(p => p.id === currentPacienteId);
    if (!paciente) return;
    if (!paciente.odontograma) paciente.odontograma = {};

    const actual  = (paciente.odontograma[num] || {}).estado || 'sano';
    const idx     = ESTADOS_ORDEN.indexOf(actual);
    const nuevo   = ESTADOS_ORDEN[(idx + 1) % ESTADOS_ORDEN.length];
    const cfg     = ODONTO_ESTADOS[nuevo];

    if (!paciente.odontograma[num]) paciente.odontograma[num] = {};
    paciente.odontograma[num].estado      = nuevo;
    paciente.odontograma[num].fecha       = new Date().toISOString();
    paciente.odontograma[num].profesional = appData.currentUser;

    // Animate the tooth visually right away
    const el = document.getElementById(`diente-${num}`);
    if (el) {
        el.style.background = cfg.color;
        el.style.borderColor = cfg.border;
        el.style.color = cfg.text;
        el.textContent = cfg.symbol || '';
        el.style.transform = 'scale(1.3)';
        setTimeout(() => { el.style.transform = 'scale(1)'; }, 150);
    }

    savePaciente(paciente);

    // Refresh the summary section without full re-render
    const tab = document.getElementById('tabOdontograma');
    if (tab) {
        const resumenEl = tab.querySelector('[data-odonto-resumen]');
        if (resumenEl) resumenEl.innerHTML = _renderResumenOdonto(paciente.odontograma);
    }
}

function _odontoAbrirModal(num, readOnly = false) {
    const paciente = appData.pacientes.find(p => p.id === currentPacienteId);
    if (!paciente) return;
    if (!paciente.odontograma) paciente.odontograma = {};
    const dato  = paciente.odontograma[num] || { estado: 'sano' };

    _dienteActual = num;

    // Title
    const cuadrante = Math.floor(num / 10);
    const labels = {1:'Superior Derecho',2:'Superior Izquierdo',3:'Inferior Izquierdo',4:'Inferior Derecho'};
    document.getElementById('modalDienteTitulo').textContent = `Diente ${num} — ${labels[cuadrante] || ''}`;

    // Estado buttons
    const estadosHTML = ESTADOS_ORDEN.map(key => {
        const cfg = ODONTO_ESTADOS[key];
        const active = (dato.estado || 'sano') === key;
        return `
            <button onclick="${readOnly ? '' : `_odontoSeleccionarEstado('${key}')`}"
                data-estado="${key}" data-active="${active ? '1' : '0'}"
                style="padding:10px 8px;border-radius:12px;border:2px solid ${active ? cfg.border : '#e0e0e0'};
                    background:${active ? cfg.color : 'white'};cursor:${readOnly ? 'default' : 'pointer'};
                    display:flex;flex-direction:column;align-items:center;gap:4px;transition:all 0.15s;
                    font-family:inherit;">
                <span style="font-size:16px;">${cfg.symbol || '·'}</span>
                <span style="font-size:11px;color:${active ? cfg.text : '#999'};font-weight:${active ? '600' : '400'};">${cfg.label}</span>
            </button>`;
    }).join('');
    document.getElementById('modalDienteEstados').innerHTML = estadosHTML;

    // Nota
    const notaEl = document.getElementById('modalDienteNota');
    if (notaEl) notaEl.value = dato.nota || '';

    // Nota section visibility
    const notaSection = document.getElementById('modalDienteNotaSection');
    if (notaSection) notaSection.style.display = readOnly && !dato.nota ? 'none' : 'block';
    if (notaEl) notaEl.readOnly = readOnly;

    // Historial
    const histEl = document.getElementById('modalDienteHistorial');
    if (histEl && dato.fecha) {
        histEl.innerHTML = `
            <div style="font-size:11px;font-weight:500;color:#999;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">Último registro</div>
            <div style="font-size:12px;color:#666;">
                ${new Date(dato.fecha).toLocaleDateString(getLocale(),{weekday:'short',day:'numeric',month:'short',year:'numeric'})}
                ${dato.profesional ? ` · ${dato.profesional}` : ''}
            </div>`;
    } else if (histEl) {
        histEl.innerHTML = '';
    }

    // Buttons
    const botonesEl = document.getElementById('modalDienteBotones');
    if (botonesEl) botonesEl.style.display = readOnly ? 'none' : 'flex';

    openModal('modalDiente');
}

function _odontoSeleccionarEstado(key) {
    document.querySelectorAll('#modalDienteEstados button').forEach(btn => {
        const k   = btn.dataset.estado;
        const cfg = ODONTO_ESTADOS[k];
        const active = k === key;
        btn.dataset.active        = active ? '1' : '0';
        btn.style.borderColor     = active ? cfg.border : '#e0e0e0';
        btn.style.background      = active ? cfg.color  : 'white';
        const labelEl = btn.querySelector('span:last-child');
        if (labelEl) {
            labelEl.style.color      = active ? cfg.text : '#999';
            labelEl.style.fontWeight = active ? '600' : '400';
        }
    });
}

async function guardarEstadoDiente() {
    try {
    const paciente = appData.pacientes.find(p => p.id === currentPacienteId);
    if (!paciente || !_dienteActual) return;
    if (!paciente.odontograma) paciente.odontograma = {};

    // Read active state from data attribute set by _odontoSeleccionarEstado
    const activeBtn = document.querySelector('#modalDienteEstados button[data-active="1"]');
    const estadoKey = activeBtn ? activeBtn.dataset.estado : 'sano';

    const nota = (document.getElementById('modalDienteNota').value || '').trim();

    paciente.odontograma[_dienteActual] = {
        estado:      estadoKey,
        nota:        nota || null,
        fecha:       new Date().toISOString(),
        profesional: appData.currentUser
    };

    await savePaciente(paciente);
    closeModal('modalDiente');
    _dienteActual = null;

    // Full re-render of odontogram
    renderTabOdontograma(paciente);
    } catch(e) {
        showError('Error al guardar el odontograma.', e);
    }
}

function renderTabResumen(paciente) {
    // Calcular edad
    let edad = '';
    if (paciente.fechaNacimiento) {
        const hoy = new Date();
        const nac = new Date(paciente.fechaNacimiento);
        let edadAnos = hoy.getFullYear() - nac.getFullYear();
        const mes = hoy.getMonth() - nac.getMonth();
        if (mes < 0 || (mes === 0 && hoy.getDate() < nac.getDate())) {
            edadAnos--;
        }
        edad = edadAnos + ' años';
    }

    // Calcular balance usando helper robusto
    const facturasPaciente = getFacturasDePaciente(paciente);
    const balance = calcularBalancePaciente(paciente.nombre);

    // Estadísticas usando helpers
    const totalCitas = getCitasDePaciente(paciente).length;
    const totalRecetas = (paciente.recetas || []).length;
    const totalPlacas = (paciente.placas || []).length;

    document.getElementById('tabResumen').innerHTML = `
        <!-- Tarjetas de estadísticas -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px;">
            <div style="background: var(--surface, #F5F2EE); padding: 18px; border-radius: 12px; border: 1.5px solid rgba(30,28,26,0.07);">
                <div style="font-size: 28px; font-weight: 300; margin-bottom: 4px; color: var(--dark, #1E1C1A);">${totalCitas}</div>
                <div style="font-size: 12px; color: var(--mid, #9C9189); letter-spacing: 0.5px;">Citas</div>
            </div>
            <div style="background: var(--surface, #F5F2EE); padding: 18px; border-radius: 12px; border: 1.5px solid rgba(30,28,26,0.07);">
                <div style="font-size: 28px; font-weight: 300; margin-bottom: 4px; color: var(--dark, #1E1C1A);">${totalRecetas}</div>
                <div style="font-size: 12px; color: var(--mid, #9C9189); letter-spacing: 0.5px;">Recetas</div>
            </div>
            <div style="background: var(--surface, #F5F2EE); padding: 18px; border-radius: 12px; border: 1.5px solid rgba(30,28,26,0.07);">
                <div style="font-size: 28px; font-weight: 300; margin-bottom: 4px; color: var(--dark, #1E1C1A);">${totalPlacas}</div>
                <div style="font-size: 12px; color: var(--mid, #9C9189); letter-spacing: 0.5px;">Placas</div>
            </div>
            <div style="background: ${balance > 0 ? 'rgba(196,133,106,0.1)' : 'rgba(107,143,113,0.1)'}; padding: 18px; border-radius: 12px;
                        border: 1.5px solid ${balance > 0 ? 'rgba(196,133,106,0.3)' : 'rgba(107,143,113,0.3)'};">
                <div style="font-size: 22px; font-weight: 500; margin-bottom: 4px; color: ${balance > 0 ? 'var(--terracota, #C4856A)' : '#3a7a4a'}; letter-spacing: -0.5px;">${formatCurrency(balance)}</div>
                <div style="font-size: 12px; color: var(--mid, #9C9189); letter-spacing: 0.5px;">Balance</div>
            </div>
        </div>

        ${(() => {
            const pendientes = getFacturasDePaciente(paciente).filter(f => {
                const e = (f.estado || '').toLowerCase();
                return e === 'pendiente' || e === 'pending' || e === 'parcial' || e === 'partial' || e === 'Pendiente';
            });
            if (balance <= 0 || pendientes.length === 0) return '';
            const primeraFactura = pendientes.sort((a,b) => new Date(a.fecha)-new Date(b.fecha))[0];
            const canCobrar = appData.currentRole === 'admin' || appData.currentRole === 'reception' || tienePermiso('cobrar');
            return `
            <div style="background: linear-gradient(135deg, #fff3cd, #ffe8a1); border: 1.5px solid #ffc107;
                        border-radius: 14px; padding: 16px 18px; margin-bottom: 20px;
                        display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                <div>
                    <div style="font-size: 13px; font-weight: 600; color: #856404; margin-bottom: 2px;">
                        ⚠️ Balance pendiente
                    </div>
                    <div style="font-size: 22px; font-weight: 700; color: #6d4c00; letter-spacing: -0.5px;">
                        ${formatCurrency(balance)}
                    </div>
                    <div style="font-size: 11px; color: #856404; margin-top: 2px;">
                        ${pendientes.length} factura${pendientes.length !== 1 ? 's' : ''} sin saldar
                    </div>
                </div>
                ${canCobrar ? `
                <button onclick="openPagarFactura('${primeraFactura.id}')"
                    style="flex-shrink:0; padding: 12px 18px; background: #856404; color: white; border: none;
                           border-radius: 100px; font-size: 13px; font-weight: 500; font-family: inherit;
                           cursor: pointer; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.15);">
                    💳 Cobrar ahora
                </button>` : ''}
            </div>`;
        })()}

        <!-- Información del paciente -->
        <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin-bottom: 24px;">
            <h3 style="font-size: 16px; color: var(--clinic-color, #C4856A); margin-bottom: 16px; font-weight: 700;">Información Personal</h3>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
                <div>
                    <div style="font-size: 11px; color: #666; margin-bottom: 4px; text-transform: uppercase; font-weight: 600;">Cédula</div>
                    <div style="font-size: 14px; font-weight: 500;">${paciente.cedula || 'No registrada'}</div>
                </div>
                <div>
                    <div style="font-size: 11px; color: #666; margin-bottom: 4px; text-transform: uppercase; font-weight: 600;">Teléfono</div>
                    <div style="font-size: 14px; font-weight: 500;">${paciente.telefono || 'No registrado'}</div>
                </div>
                <div>
                    <div style="font-size: 11px; color: #666; margin-bottom: 4px; text-transform: uppercase; font-weight: 600;">Email</div>
                    <div style="font-size: 14px; font-weight: 500;">${paciente.email || 'No registrado'}</div>
                </div>
                <div>
                    <div style="font-size: 11px; color: #666; margin-bottom: 4px; text-transform: uppercase; font-weight: 600;">Edad</div>
                    <div style="font-size: 14px; font-weight: 500;">${edad || 'No registrada'}</div>
                </div>
                <div>
                    <div style="font-size: 11px; color: #666; margin-bottom: 4px; text-transform: uppercase; font-weight: 600;">Sexo</div>
                    <div style="font-size: 14px; font-weight: 500;">${paciente.sexo || 'No registrado'}</div>
                </div>
                <div>
                    <div style="font-size: 11px; color: #666; margin-bottom: 4px; text-transform: uppercase; font-weight: 600;">Grupo Sanguíneo</div>
                    <div style="font-size: 14px; font-weight: 500;">${paciente.grupoSanguineo || 'Desconocido'}</div>
                </div>
                ${paciente.direccion ? `
                <div style="grid-column: span 3;">
                    <div style="font-size: 11px; color: #666; margin-bottom: 4px; text-transform: uppercase; font-weight: 600;">Dirección</div>
                    <div style="font-size: 14px; font-weight: 500;">${paciente.direccion}</div>
                </div>
                ` : ''}
                ${paciente.seguroMedico ? `
                <div style="grid-column: span 3;">
                    <div style="font-size: 11px; color: #666; margin-bottom: 4px; text-transform: uppercase; font-weight: 600;">Seguro Médico</div>
                    <div style="font-size: 14px; font-weight: 500;">${paciente.seguroMedico}</div>
                </div>
                ` : ''}
                ${paciente.contactoEmergencia && paciente.contactoEmergencia.nombre ? `
                <div style="grid-column: span 3;">
                    <div style="font-size: 11px; color: #666; margin-bottom: 4px; text-transform: uppercase; font-weight: 600;">Contacto de Emergencia</div>
                    <div style="font-size: 14px; font-weight: 500;">${paciente.contactoEmergencia.nombre} - ${paciente.contactoEmergencia.telefono}</div>
                </div>
                ` : ''}
            </div>

            ${paciente.alergias ? `
                <div style="background: #ffe5e5; padding: 12px; border-radius: 8px; margin-top: 16px; border-left: 3px solid #dc3545;">
                    <div style="font-size: 11px; color: #721c24; margin-bottom: 4px; text-transform: uppercase; font-weight: 600;">🚨 ALERGIAS</div>
                    <div style="font-size: 14px; font-weight: 500; color: #721c24;">${paciente.alergias}</div>
                </div>
            ` : ''}

            ${paciente.condiciones ? `
                <div style="background: #fff3cd; padding: 12px; border-radius: 8px; margin-top: 16px; border-left: 3px solid #ffc107;">
                    <div style="font-size: 11px; color: #856404; margin-bottom: 4px; text-transform: uppercase; font-weight: 600;">⚠️ Condiciones Médicas</div>
                    <div style="font-size: 14px; font-weight: 500; color: #1d1d1f;">${paciente.condiciones}</div>
                </div>
            ` : ''}
        </div>

        <!-- Próxima cita -->
        ${(() => {
            const citasFuturas = getCitasDePaciente(paciente)
                .filter(c => new Date(c.fecha) >= new Date())
                .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

            if (citasFuturas.length > 0) {
                const proxima = citasFuturas[0];
                return `
                    <div style="background: var(--surface, #F5F2EE); border-radius: 12px; padding: 20px; margin-bottom: 24px;
                                    border: 1.5px solid rgba(30,28,26,0.07); border-left: 4px solid var(--clinic-color, #C4856A);">
                        <div style="font-size: 11px; color: var(--mid,#9C9189); letter-spacing: 1px; text-transform:uppercase; margin-bottom: 8px;">📅 Próxima Cita</div>
                        <div style="font-size: 18px; font-weight: 400; margin-bottom: 4px; color: var(--dark, #1E1C1A);">${formatDate(proxima.fecha)} · ${proxima.hora}</div>
                        <div style="font-size: 13px; color: var(--mid,#9C9189);">${proxima.motivo} · Con ${proxima.profesional}</div>
                    </div>
                `;
            }
            return '';
        })()}

        <!-- Última receta -->
        ${(() => {
            const recetas = paciente.recetas || [];
            if (recetas.length > 0) {
                const ultima = recetas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
                return `
                    <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        <h3 style="font-size: 16px; color: var(--clinic-color, #C4856A); margin-bottom: 12px; font-weight: 700;">💊 Última Receta</h3>
                        <div style="font-size: 14px; color: #666; margin-bottom: 8px;">${formatDate(ultima.fecha)} - ${ultima.profesional}</div>
                        ${ultima.medicamentos.map(med => `
                            <div style="background: #e8f5e9; padding: 10px; border-radius: 6px; margin-bottom: 6px;">
                                <div style="font-weight: 600; font-size: 13px;">💊 ${med.nombre}</div>
                                <div style="font-size: 12px; color: #666;">${med.dosis} - ${med.frecuencia}</div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
            return '';
        })()}
    `;
}

function renderTabHistorial(paciente) {
    const facturasPaciente = getFacturasDePaciente(paciente)
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const citasPaciente = getCitasDePaciente(paciente)
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const ordenesPaciente = (appData.laboratorios || [])
        .filter(o => o.paciente === paciente.nombre)
        .sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));

    const canCobrar = appData.currentRole === 'admin' || appData.currentRole === 'reception' || tienePermiso('cobrar');

    // ── Balance header ──
    const balance = calcularBalancePaciente(paciente.nombre);
    const totalFacturado = facturasPaciente.reduce((s, f) => s + f.total, 0);
    const totalPagado    = facturasPaciente.reduce((s, f) =>
        s + (f.pagos || []).reduce((sp, p) => sp + p.monto, 0), 0);

    const balanceHeaderHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:20px;">
            <div style="background:white;border:1.5px solid #f0f0f0;border-radius:12px;padding:14px;text-align:center;">
                <div style="font-size:10px;color:#999;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">Facturado</div>
                <div style="font-size:17px;font-weight:600;color:#333;">${formatCurrency(totalFacturado)}</div>
            </div>
            <div style="background:white;border:1.5px solid #f0f0f0;border-radius:12px;padding:14px;text-align:center;">
                <div style="font-size:10px;color:#999;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">Pagado</div>
                <div style="font-size:17px;font-weight:600;color:#34c759;">${formatCurrency(totalPagado)}</div>
            </div>
            <div style="background:${balance > 0 ? '#fff3cd' : '#d4edda'};border:1.5px solid ${balance > 0 ? '#ffc107' : '#28a745'};border-radius:12px;padding:14px;text-align:center;">
                <div style="font-size:10px;color:#999;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">Balance</div>
                <div style="font-size:17px;font-weight:700;color:${balance > 0 ? '#856404' : '#155724'};">${formatCurrency(balance)}</div>
            </div>
        </div>`;

    // ── Facturas con desglose ──
    const facturasHTML = facturasPaciente.length === 0
        ? `<div style="text-align:center;padding:30px;color:#999;font-size:13px;">Sin procedimientos registrados</div>`
        : facturasPaciente.map(f => {
            const pagadoF   = (f.pagos || []).reduce((s, p) => s + p.monto, 0);
            const pendienteF = f.total - pagadoF;
            const pagada     = pendienteF <= 0;
            const estadoColor = pagada ? '#28a745' : pagadoF > 0 ? '#ff9500' : '#ff3b30';
            const estadoLabel = pagada ? '✅ Pagada' : pagadoF > 0 ? '⏳ Con abono' : '🔴 Pendiente';

            // Procedimientos desglosados
            const procsHTML = (f.procedimientos || []).map(p => `
                <div style="display:flex;justify-content:space-between;align-items:center;
                            padding:7px 0;border-bottom:1px solid #f5f5f5;">
                    <span style="font-size:13px;color:#444;">${p.descripcion}${p.cantidad > 1 ? ` ×${p.cantidad}` : ''}</span>
                    <span style="font-size:13px;font-weight:500;color:#333;flex-shrink:0;margin-left:8px;">
                        ${formatCurrency(p.precioUnitario * (p.cantidad || 1))}
                    </span>
                </div>`).join('');

            // Pagos / abonos desglosados
            const pagosHTML = (f.pagos || []).length === 0 ? '' : `
                <div style="margin-top:10px;padding-top:10px;border-top:1px dashed #e0e0e0;">
                    <div style="font-size:10px;color:#999;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">Pagos recibidos</div>
                    ${(f.pagos || []).map(p => `
                        <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;">
                            <div style="display:flex;align-items:center;gap:6px;">
                                <span style="font-size:11px;background:#e8f5e9;color:#2e7d32;padding:2px 8px;border-radius:100px;">
                                    ${p.metodo || 'Efectivo'}
                                </span>
                                <span style="font-size:11px;color:#999;">
                                    ${p.fecha ? new Date(p.fecha).toLocaleDateString(getLocale(),{day:'2-digit',month:'short',year:'2-digit'}) : ''}
                                </span>
                            </div>
                            <span style="font-size:13px;font-weight:600;color:#28a745;">+${formatCurrency(p.monto)}</span>
                        </div>`).join('')}
                </div>`;

            // Descuento si aplica
            const descuentoHTML = f.descuento > 0 ? `
                <div style="display:flex;justify-content:space-between;padding:5px 0;color:#999;">
                    <span style="font-size:12px;">Descuento ${f.descuento}%</span>
                    <span style="font-size:12px;">-${formatCurrency(f.total / (1 - f.descuento/100) * (f.descuento/100))}</span>
                </div>` : '';

            return `
            <div style="background:white;border-radius:14px;border:1.5px solid ${estadoColor}33;
                        margin-bottom:14px;overflow:hidden;">
                <!-- Header factura -->
                <div style="padding:14px 16px;border-bottom:1px solid #f5f5f5;
                            display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <div style="font-size:12px;color:#999;margin-bottom:2px;">${f.numero} · ${formatDate(f.fecha)}</div>
                        <div style="font-size:13px;color:#555;">${f.profesional}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:11px;font-weight:600;color:${estadoColor};background:${estadoColor}18;
                                    padding:3px 10px;border-radius:100px;margin-bottom:4px;">${estadoLabel}</div>
                        <div style="font-size:16px;font-weight:700;color:${estadoColor};">
                            ${pagada ? formatCurrency(f.total) : formatCurrency(pendienteF) + ' pendiente'}
                        </div>
                    </div>
                </div>
                <!-- Procedimientos + pagos -->
                <div style="padding:12px 16px;">
                    ${procsHTML}
                    ${descuentoHTML}
                    <div style="display:flex;justify-content:space-between;padding:8px 0 4px;font-weight:600;">
                        <span style="font-size:13px;color:#333;">Total</span>
                        <span style="font-size:14px;color:#333;">${formatCurrency(f.total)}</span>
                    </div>
                    ${pagosHTML}
                    ${!pagada && canCobrar ? `
                    <button onclick="openPagarFactura('${f.id}')"
                        style="width:100%;margin-top:12px;padding:11px;background:var(--clinic-color,#C4856A);
                               color:white;border:none;border-radius:100px;font-size:13px;font-weight:500;
                               font-family:inherit;cursor:pointer;">
                        💳 Cobrar esta factura
                    </button>` : ''}
                </div>
            </div>`;
        }).join('');

    // ── Órdenes de lab (compactas) ──
    const labHTML = ordenesPaciente.length === 0 ? '' : `
        <div style="margin-bottom:20px;">
            <div style="font-size:11px;font-weight:500;color:#999;letter-spacing:1px;
                        text-transform:uppercase;margin-bottom:10px;">Laboratorio</div>
            ${ordenesPaciente.map(o => `
                <div style="background:white;border-radius:12px;padding:12px 16px;
                            border:1.5px solid #f0f0f0;margin-bottom:8px;
                            display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <div style="font-size:13px;font-weight:500;color:#333;">${o.tipo}</div>
                        <div style="font-size:11px;color:#999;margin-top:2px;">${o.laboratorio} · ${formatDate(o.fechaCreacion)}</div>
                    </div>
                    <div style="text-align:right;flex-shrink:0;margin-left:8px;">
                        <div style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:100px;
                                    background:${getColorEstado(o.estadoActual)}22;
                                    color:${getColorEstado(o.estadoActual)};margin-bottom:3px;">
                            ${o.estadoActual}
                        </div>
                        <div style="font-size:13px;font-weight:600;color:#333;">${formatCurrency(o.precio)}</div>
                    </div>
                </div>`).join('')}
        </div>`;

    // ── Citas (compactas) ──
    const citasHTML = citasPaciente.length === 0 ? '' : `
        <div>
            <div style="font-size:11px;font-weight:500;color:#999;letter-spacing:1px;
                        text-transform:uppercase;margin-bottom:10px;">Citas</div>
            ${citasPaciente.map(c => `
                <div style="background:white;border-radius:12px;padding:12px 16px;
                            border:1.5px solid #f0f0f0;margin-bottom:8px;
                            display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <div style="font-size:13px;font-weight:500;color:#333;">
                            ${formatDate(c.fecha)} · ${c.hora}
                        </div>
                        <div style="font-size:11px;color:#999;margin-top:2px;">${c.motivo} · ${c.profesional}</div>
                    </div>
                    <div style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:100px;flex-shrink:0;
                                background:${getColorEstadoCita(c.estado||'Pendiente')}22;
                                color:${getColorEstadoCita(c.estado||'Pendiente')};">
                        ${c.estado || 'Pendiente'}
                    </div>
                </div>`).join('')}
        </div>`;

    document.getElementById('tabHistorial').innerHTML = `
        <div style="padding-bottom:8px;">
            ${balanceHeaderHTML}
            <div style="font-size:11px;font-weight:500;color:#999;letter-spacing:1px;
                        text-transform:uppercase;margin-bottom:10px;">Procedimientos y pagos</div>
            ${facturasHTML}
            ${labHTML}
            ${citasHTML}
        </div>`;
}

function renderTabRecetas(paciente) {
    const recetas = (paciente.recetas || []).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    document.getElementById('tabRecetas').innerHTML = `
        <button class="btn btn-submit" onclick="currentPacienteRecetas = appData.pacientes.find(p => p.id === '${paciente.id}'); abrirNuevaReceta();" style="width: 100%; margin-bottom: 20px; font-size: 16px; padding: 14px;">
            ➕ Nueva Receta Médica
        </button>

        ${recetas.length === 0 ? `
            <div style="text-align: center; padding: 80px 20px; color: #999;">
                <div style="font-size: 64px; margin-bottom: 20px;">💊</div>
                <div style="font-size: 18px; font-weight: 600; margin-bottom: 10px;">Sin recetas médicas</div>
                <div style="font-size: 14px;">Crea la primera receta usando el botón de arriba</div>
            </div>
        ` : recetas.map(receta => `
            <div style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-left: 4px solid #007AFF;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">
                    <div>
                        <div style="font-size: 18px; font-weight: 700; color: var(--clinic-color, #C4856A); margin-bottom: 4px;">${formatDate(receta.fecha)}</div>
                        <div style="font-size: 14px; color: #666;">${receta.profesional}</div>
                    </div>
                    <button class="btn btn-secondary" onclick="currentPacienteRecetas = appData.pacientes.find(p => p.id === '${paciente.id}'); descargarRecetaPDF('${receta.id}');" style="background: #28a745; color: white; font-size: 13px; padding: 8px 16px;">
                        📄 Descargar PDF
                    </button>
                </div>

                ${receta.diagnostico ? `
                    <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; margin-bottom: 12px;">
                        <div style="font-size: 11px; color: #666; font-weight: 600; margin-bottom: 6px; text-transform: uppercase;">Diagnóstico</div>
                        <div style="font-size: 14px; color: #333;">${receta.diagnostico}</div>
                    </div>
                ` : ''}

                <div style="background: #e8f5e9; padding: 14px; border-radius: 8px; margin-bottom: 12px;">
                    <div style="font-size: 11px; color: #2e7d32; font-weight: 600; margin-bottom: 10px; text-transform: uppercase;">💊 Medicamentos</div>
                    ${receta.medicamentos.map(med => `
                        <div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #c8e6c9;">
                            <div style="font-weight: 600; font-size: 14px; color: #1b5e20; margin-bottom: 4px;">💊 ${med.nombre}</div>
                            <div style="font-size: 13px; color: #666;">${med.dosis} - ${med.frecuencia}</div>
                            ${med.duracion ? `<div style="font-size: 12px; color: #666; margin-top: 2px;">Duración: ${med.duracion}</div>` : ''}
                        </div>
                    `).join('')}
                </div>

                ${receta.indicaciones ? `
                    <div style="background: #fff3e0; padding: 12px; border-radius: 8px;">
                        <div style="font-size: 11px; color: #e65100; font-weight: 600; margin-bottom: 6px; text-transform: uppercase;">Indicaciones</div>
                        <div style="font-size: 13px; color: #333; line-height: 1.6;">${receta.indicaciones}</div>
                    </div>
                ` : ''}
            </div>
        `).join('')}
    `;
}

function renderTabDocumentos(paciente) {
    const tieneConsentimiento = paciente.consentimiento && paciente.consentimiento.firmado;
    const totalPlacas = (paciente.placas || []).length;

    document.getElementById('tabDocumentos').innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
            <!-- Consentimiento -->
            <div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); text-align: center;">
                <div style="font-size: 48px; margin-bottom: 16px;">${tieneConsentimiento ? '✅' : '📋'}</div>
                <h3 style="font-size: 16px; color: var(--clinic-color, #C4856A); margin-bottom: 8px; font-weight: 700;">Consentimiento Informado</h3>
                ${tieneConsentimiento ? `
                    <div style="color: #28a745; font-size: 14px; margin-bottom: 16px;">Firmado el ${formatDate(paciente.consentimiento.fecha)}</div>
                    <button class="btn btn-secondary" onclick="verFirma('${paciente.id}')" style="width: 100%; background: #28a745; color: white;">
                        📄 Descargar PDF
                    </button>
                ` : `
                    <div style="color: #ffc107; font-size: 14px; margin-bottom: 16px;">Pendiente de firma</div>
                    <button class="btn btn-submit" onclick="abrirConsentimiento('${paciente.id}')" style="width: 100%;">
                        ✍️ Firmar Ahora
                    </button>
                `}
            </div>

            <!-- Placas -->
            <div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); text-align: center;">
                <div style="font-size: 48px; margin-bottom: 16px;">🦷</div>
                <h3 style="font-size: 16px; color: var(--clinic-color, #C4856A); margin-bottom: 8px; font-weight: 700;">Placas Radiográficas</h3>
                <div style="color: #666; font-size: 14px; margin-bottom: 16px;">${totalPlacas} ${totalPlacas === 1 ? 'placa' : 'placas'} ${totalPlacas === 0 ? 'registradas' : 'registrada'}</div>
                <button class="btn btn-submit" onclick="abrirGaleriaPlacas('${paciente.id}')" style="width: 100%;">
                    ${totalPlacas === 0 ? '📤 Subir Primera Placa' : '👁️ Ver Galería'}
                </button>
            </div>
        </div>
    `;
}

function renderTabBalance(paciente) {
    const balance = calcularBalancePaciente(paciente.nombre);
    const facturasPaciente = getFacturasDePaciente(paciente);
    
    // Filtro robusto para estados (soporta inglés y español)
    const facturasPendientes = facturasPaciente.filter(f => {
        const estado = (f.estado || '').toLowerCase().trim();
        return estado === 'pendiente' || estado === 'pending' ||
               estado === 'parcial' || estado === 'partial' || estado === 'Pendiente';
    });
    
    const facturasCompletadas = facturasPaciente.filter(f => {
        const estado = (f.estado || '').toLowerCase().trim();
        return estado === 'pagada' || estado === 'paid';
    });
    
    // Calcular totales
    const totalFacturado = facturasPaciente.reduce((sum, f) => sum + f.total, 0);
    const totalPagado = facturasPaciente.reduce((sum, f) => {
        const pagado = (f.pagos || []).reduce((s, p) => s + p.monto, 0);
        return sum + pagado;
    }, 0);
    
    document.getElementById('tabBalance').innerHTML = `
        <!-- Resumen de Balance -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px;">
            <div style="background: ${balance > 0 ? 'var(--terracota,#C4856A)' : '#3a7a4a'}; color: white; padding: 24px; border-radius: 12px;">
                <div style="font-size: 11px; opacity: 0.8; margin-bottom: 8px; letter-spacing: 1px; text-transform: uppercase;">Balance Actual</div>
                <div style="font-size: 32px; font-weight: 300;">${formatCurrency(balance)}</div>
            </div>
            <div style="background: white; border: 2px solid #e5e5e7; padding: 24px; border-radius: 12px;">
                <div style="font-size: 14px; color: #666; margin-bottom: 8px;">TOTAL FACTURADO</div>
                <div style="font-size: 28px; font-weight: 700; color: var(--clinic-color, #C4856A);">${formatCurrency(totalFacturado)}</div>
            </div>
            <div style="background: white; border: 2px solid #e5e5e7; padding: 24px; border-radius: 12px;">
                <div style="font-size: 14px; color: #666; margin-bottom: 8px;">TOTAL PAGADO</div>
                <div style="font-size: 28px; font-weight: 700; color: #28a745;">${formatCurrency(totalPagado)}</div>
            </div>
        </div>
        
        ${balance > 0 ? `
        <!-- Botón de Hacer Abono -->
        <div style="background: #fff3cd; border: 2px solid #ffc107; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-size: 16px; font-weight: 600; color: #856404; margin-bottom: 4px;">
                        💰 Realizar Abono al Balance
                    </div>
                    <div style="font-size: 14px; color: #856404;">
                        El paciente debe: ${formatCurrency(balance)}
                    </div>
                </div>
                <button class="btn btn-submit" onclick="abrirAbonoBalance('${paciente.id}')" style="font-size: 16px; padding: 12px 24px;">
                    💵 Hacer Abono
                </button>
            </div>
        </div>
        ` : balance < 0 ? `
        <div style="background: #d4edda; border: 2px solid #28a745; border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: center;">
            <div style="font-size: 18px; font-weight: 600; color: #155724;">
                ✅ El paciente tiene crédito a favor: ${formatCurrency(Math.abs(balance))}
            </div>
        </div>
        ` : `
        <div style="background: #d1ecf1; border: 2px solid #17a2b8; border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: center;">
            <div style="font-size: 18px; font-weight: 600; color: #0c5460;">
                ✅ El paciente no tiene balance pendiente
            </div>
        </div>
        `}
        
        <!-- Facturas Pendientes -->
        ${facturasPendientes.length > 0 ? `
        <div style="margin-bottom: 24px;">
            <h3 style="font-size: 18px; font-weight: 700; color: var(--clinic-color, #C4856A); margin-bottom: 16px;">
                📋 Facturas Pendientes (${facturasPendientes.length})
            </h3>
            <div style="display: grid; gap: 12px;">
                ${facturasPendientes.map(f => {
                    const pagado = (f.pagos || []).reduce((sum, p) => sum + p.monto, 0);
                    const pendiente = f.total - pagado;
                    return `
                    <div style="background: #fff; border: 2px solid #e5e5e7; border-radius: 8px; padding: 16px;">
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                            <div>
                                <div style="font-size: 16px; font-weight: 600; color: var(--clinic-color, #C4856A);">${f.numero}</div>
                                <div style="font-size: 13px; color: #666; margin-top: 4px;">${formatDate(f.fecha)} • ${f.profesional}</div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 18px; font-weight: 700; color: #ff3b30;">${formatCurrency(pendiente)}</div>
                                <div style="font-size: 12px; color: #666;">de ${formatCurrency(f.total)}</div>
                            </div>
                        </div>
                        ${pagado > 0 ? `<div style="font-size: 13px; color: #28a745; margin-bottom: 8px;">✓ Abonado: ${formatCurrency(pagado)}</div>` : ''}
                        <button class="btn btn-submit" onclick="abrirPagoFactura('${f.id}', '${paciente.id}')" style="width: 100%; font-size: 14px;">
                            💳 Pagar / Abonar
                        </button>
                    </div>
                    `;
                }).join('')}
            </div>
        </div>
        ` : ''}
        
        <!-- Facturas Completadas -->
        ${facturasCompletadas.length > 0 ? `
        <div>
            <h3 style="font-size: 18px; font-weight: 700; color: var(--clinic-color, #C4856A); margin-bottom: 16px;">
                ✅ Facturas Pagadas (${facturasCompletadas.length})
            </h3>
            <div style="display: grid; gap: 12px;">
                ${facturasCompletadas.map(f => `
                    <div style="background: #f8f9fa; border: 2px solid #28a745; border-radius: 8px; padding: 16px; opacity: 0.8;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <div style="font-size: 14px; font-weight: 600; color: var(--clinic-color, #C4856A);">${f.numero}</div>
                                <div style="font-size: 12px; color: #666;">${formatDate(f.fecha)}</div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 16px; font-weight: 700; color: #28a745;">${formatCurrency(f.total)}</div>
                                <div style="font-size: 11px; color: #28a745;">✓ PAGADA</div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        ` : ''}
    `;
}

// ========================================
// MÓDULO DE AGENDA - VISTA SEMANAL
// ========================================

let agendaSemanaInicio = new Date();
// Semana empieza en lunes (estándar en RD y Latinoamérica)
const _hoy = new Date();
const _diaHoy = _hoy.getDay(); // 0=Dom, 1=Lun, ..., 6=Sáb
const _offsetLunes = _diaHoy === 0 ? -6 : 1 - _diaHoy; // si es domingo, retroceder 6 días
agendaSemanaInicio.setDate(_hoy.getDate() + _offsetLunes);
let verAgendaPropia = false; // Toggle para ver agenda propia vs general

function cambiarSemana(delta) {
    agendaSemanaInicio.setDate(agendaSemanaInicio.getDate() + (delta * 7));
    updateAgendaTab();
}

function toggleAgenda() {
    verAgendaPropia = !verAgendaPropia;
    updateAgendaTab();
}

function updateAgendaTab() {
    // Inicializar filtro de profesionales
    inicializarFiltrosProfesionales();

    const inicio = new Date(agendaSemanaInicio);
    const fin = new Date(inicio);
    fin.setDate(fin.getDate() + 6); // Hasta sábado

    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    document.getElementById('agendaSemanaTexto').textContent =
        `${inicio.getDate()} ${meses[inicio.getMonth()]} - ${fin.getDate()} ${meses[fin.getMonth()]} ${fin.getFullYear()}`;

    // Filtrar citas de la semana (EXCLUIR CANCELADAS)
    const citasSemana = appData.citas.filter(c => {
        const citaDate = new Date(c.fecha);
        const enRango = citaDate >= inicio && citaDate <= fin;
        const noCancelada = c.estado !== 'Cancelada';
        return enRango && noCancelada;
    });

    // Filtrar por rol y toggle
    const role = appData.currentRole;
    let citasFiltradas = citasSemana;

    if (role === 'professional') {
        if (verAgendaPropia) {
            citasFiltradas = citasSemana.filter(c => c.profesional === appData.currentUser);
        }
        // Si no, ve todas (agenda general)
    }

    // Aplicar filtros adicionales
    citasFiltradas = aplicarFiltrosCitas(citasFiltradas);

    // Botón de toggle solo para profesionales
    const toggleBtn = role === 'professional' ?
        `<button class="btn" onclick="toggleAgenda()" style="margin-left: 10px;">${verAgendaPropia ? '👁️ Ver Agenda General' : '👤 Ver Mi Agenda'}</button>` : '';

    document.getElementById('agendaToggle').innerHTML = toggleBtn;

    // Renderizar vista semanal
    const dias = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const colores = {1: 'var(--azul, #7B8FA1)', 2: 'var(--green, #6B8F71)', 3: 'var(--terracota, #C4856A)', 4: '#8B7BA8'};

    let html = '<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px;">';

    for (let i = 0; i < 7; i++) {
        const dia = new Date(inicio);
        dia.setDate(dia.getDate() + i);

        // Usar isSameDayTZ para respetar la zona horaria configurada de la clínica
        const diaKey = `${dia.getFullYear()}-${String(dia.getMonth()+1).padStart(2,'0')}-${String(dia.getDate()).padStart(2,'0')}`;
        const citasDelDia = citasFiltradas.filter(c => isSameDayTZ(c.fecha, diaKey))
            .sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));

        const todayKey2 = getTodayKey();
        const esHoy = diaKey === todayKey2;

        html += `
            <div style="border: 1.5px solid ${esHoy ? 'var(--clinic-color, #C4856A)' : 'rgba(30,28,26,0.08)'}; border-radius: 10px; padding: 10px; min-height: 400px; background: ${esHoy ? 'rgba(196,133,106,0.05)' : 'var(--white, white)'};">
                <div style="text-align: center; margin-bottom: 12px;">
                    <div style="font-size: 12px; color: #666; font-weight: 600;">${dias[i]}</div>
                    <div style="font-size: 20px; font-weight: 700; color: ${esHoy ? 'var(--clinic-color, #C4856A)' : '#1d1d1f'};">${dia.getDate()}</div>
                </div>
                ${citasDelDia.map(c => {
                    const estadoCita = c.estado || 'Pendiente';
                    const colorEstado = getColorEstadoCita(estadoCita);
                    const iconoEstado = getIconoEstadoCita(estadoCita);

                    return `
                    <div onclick="verDetalleCita('${c.id}')" style="background: ${colores[c.consultorio]}; color: white; padding: 8px; border-radius: 6px; margin-bottom: 6px; cursor: pointer; transition: transform 0.2s; border-left: 4px solid ${colorEstado};" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                        <div style="font-size: 13px; font-weight: 600; margin-bottom: 4px;">${c.hora}</div>
                        <div style="font-size: 11px; opacity: 0.95; margin-bottom: 2px;">${c.paciente}</div>
                        <div style="font-size: 10px; opacity: 0.9;">${c.profesional}</div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                            <div style="font-size: 10px; opacity: 0.85;">C${c.consultorio}</div>
                            <div style="background: ${colorEstado}; padding: 2px 6px; border-radius: 10px; font-size: 9px; font-weight: 600;">
                                ${iconoEstado} ${estadoCita}
                            </div>
                        </div>
                    </div>
                `}).join('')}
            </div>
        `;
    }

    html += '</div>';
    document.getElementById('calendarioAgenda').innerHTML = html;
}

function verDetalleCita(citaId) {
    currentCitaIdDetalle = citaId; // Guardar para usar en botón cancelar
    const cita = appData.citas.find(c => c.id === citaId);
    if (!cita) return;

    const colores = {1: '#007AFF', 2: '#34C759', 3: '#FF9500', 4: '#AF52DE'};

    const html = `
        <div style="background: ${colores[cita.consultorio] || 'var(--azul,#7B8FA1)'}; color: white; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
            <div style="font-size: 28px; font-weight: 300; margin-bottom: 8px; letter-spacing:-1px">${cita.hora}</div>
            <div style="font-size: 14px; opacity: 0.85;">Consultorio ${cita.consultorio}</div>
        </div>

        <!-- ESTADO DE LA CITA -->
        <div style="background: ${getColorEstadoCita(cita.estado || 'Pendiente')}; color: white; padding: 14px; border-radius: 8px; margin-bottom: 16px; text-align: center;">
            <div style="font-size: 12px; opacity: 0.9; margin-bottom: 4px;">ESTADO ACTUAL</div>
            <div style="font-size: 20px; font-weight: 700;">${getIconoEstadoCita(cita.estado || 'Pendiente')} ${cita.estado || 'Pendiente'}</div>
        </div>

        <!-- CAMBIAR ESTADO -->
        <div style="background: var(--surface,#F5F2EE); padding: 14px; border-radius: 10px; margin-bottom: 16px;">
            <label style="font-size: 11px; color: var(--mid); margin-bottom: 8px; display: block; letter-spacing: 1px; text-transform: uppercase;">Cambiar estado</label>
            <select id="nuevoEstadoCita" style="width: 100%; padding: 12px; border: 1.5px solid rgba(30,28,26,0.1); border-radius: 8px; font-size: 14px; font-family: inherit; background: var(--white); color: var(--dark);">
                <option value="Pendiente" ${(cita.estado || 'Pendiente') === 'Pendiente' ? 'selected' : ''}>⏳ Pendiente</option>
                <option value="Confirmada" ${cita.estado === 'Confirmada' ? 'selected' : ''}>✅ Confirmada</option>
                <option value="En Sala de Espera" ${cita.estado === 'En Sala de Espera' ? 'selected' : ''}>🏥 En Sala de Espera</option>
                <option value="Completada" ${cita.estado === 'Completada' ? 'selected' : ''}>✔️ Completada</option>
                <option value="Cancelada" ${cita.estado === 'Cancelada' ? 'selected' : ''}>❌ Cancelada</option>
                <option value="Inasistencia" ${cita.estado === 'Inasistencia' ? 'selected' : ''}>⚠️ Inasistencia</option>
            </select>
            <textarea id="notasCambioEstado" placeholder="Notas del cambio (opcional)..."
                style="width:100%;margin-top:8px;padding:10px 12px;border:1.5px solid rgba(30,28,26,0.1);
                       border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;min-height:60px;
                       background:var(--white);color:var(--dark)"></textarea>
            <button class="btn btn-submit" style="margin-top: 8px; width: 100%;" onclick="cambiarEstadoCita('${cita.id}', document.getElementById('nuevoEstadoCita').value)">
                Actualizar estado
            </button>
        </div>

        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-bottom: 16px;">
            <div style="background: #f8f9fa; padding: 14px; border-radius: 8px;">
                <div style="font-size: 10px; color: #666; margin-bottom: 4px; text-transform: uppercase; font-weight: 600;">Paciente</div>
                <div style="font-size: 16px; font-weight: 600; color: #1d1d1f;">${cita.paciente}</div>
            </div>
            <div style="background: #f8f9fa; padding: 14px; border-radius: 8px;">
                <div style="font-size: 10px; color: #666; margin-bottom: 4px; text-transform: uppercase; font-weight: 600;">Profesional</div>
                <div style="font-size: 16px; font-weight: 600; color: #1d1d1f;">${cita.profesional}</div>
            </div>
        </div>

        <div style="background: #f8f9fa; padding: 14px; border-radius: 8px; margin-bottom: 16px;">
            <div style="font-size: 10px; color: #666; margin-bottom: 4px; text-transform: uppercase; font-weight: 600;">Fecha</div>
            <div style="font-size: 15px; font-weight: 500; color: #1d1d1f;">${formatDate(cita.fecha)}</div>
        </div>

        <div style="background: #e7f3ff; padding: 14px; border-radius: 8px;">
            <div style="font-size: 10px; color: #004085; margin-bottom: 4px; text-transform: uppercase; font-weight: 600;">Motivo</div>
            <div style="font-size: 15px; font-weight: 500; color: #1d1d1f;">${cita.motivo}</div>
        </div>

        ${cita.procedimientosRealizados ? `
        <div style="background: #d4edda; padding: 14px; border-radius: 8px; margin-top: 16px;">
            <div style="font-size: 10px; color: #155724; margin-bottom: 4px; text-transform: uppercase; font-weight: 600;">✅ Procedimientos Realizados</div>
            <div style="font-size: 14px; font-weight: 500; color: #155724;">${cita.procedimientosRealizados}</div>
        </div>
        ` : ''}

        ${cita.notasProcedimiento ? `
        <div style="background: #fff3cd; padding: 14px; border-radius: 8px; margin-top: 16px;">
            <div style="font-size: 10px; color: #856404; margin-bottom: 4px; text-transform: uppercase; font-weight: 600;">Notas del Procedimiento</div>
            <div style="font-size: 14px; font-weight: 500; color: #1d1d1f;">${cita.notasProcedimiento}</div>
        </div>
        ` : ''}
    `;

    document.getElementById('detalleCitaContent').innerHTML = html;
    openModal('modalDetalleCita');
}

function abrirModalNuevaCita() {
    // Autocomplete input en lugar de select
    document.getElementById('citaPacienteInput').value = '';
    document.getElementById('citaPacienteSuggestions').innerHTML = '';
    document.getElementById('citaPacienteSuggestions').style.display = 'none';

    const profesionales = appData.personal.filter(p => p.tipo !== 'empleado');

    const selectProf = document.getElementById('citaProfesional');
    selectProf.innerHTML = '<option value="">Seleccione profesional</option>' +
        profesionales.map(p => `<option value="${p.nombre}">${p.nombre}</option>`).join('');

    document.getElementById('citaFecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('citaHora').value = '09:00';
    document.getElementById('citaConsultorio').value = '1';
    document.getElementById('citaMotivo').value = '';

    openModal('modalNuevaCita');
}

// Autocomplete para pacientes
function buscarPaciente() {
    const input = document.getElementById('citaPacienteInput');
    const query = input.value.toLowerCase();
    const suggestions = document.getElementById('citaPacienteSuggestions');

    // Resetear flag de selección cuando el usuario escribe
    input.dataset.pacienteSeleccionado = 'false';

    if (query.length < 2) {
        suggestions.style.display = 'none';
        return;
    }

    const matches = appData.pacientes.filter(p =>
        p.nombre && p.nombre.toLowerCase().includes(query)
    ).slice(0, 5);

    if (matches.length === 0) {
        suggestions.style.display = 'none';
        return;
    }

    suggestions.innerHTML = matches.map(p => `
        <div onclick="seleccionarPaciente('${p.nombre}')"
             style="padding:14px 16px;cursor:pointer;border-bottom:1px solid rgba(30,28,26,0.06);
                    transition:background 0.15s;display:flex;flex-direction:column;gap:3px"
             onmouseover="this.style.background='var(--surface)'"
             onmouseout="this.style.background='transparent'">
            <div style="font-size:14px;font-weight:400;color:var(--dark)">${p.nombre}</div>
            <div style="font-size:12px;color:var(--mid)">${p.telefono || ''} ${p.cedula ? '· ' + p.cedula : ''}</div>
        </div>
    `).join('');

    suggestions.style.display = 'block';
}

function seleccionarPaciente(nombre) {
    const input = document.getElementById('citaPacienteInput');
    input.value = nombre;
    input.dataset.pacienteSeleccionado = 'true'; // Marcar que se seleccionó de la lista
    document.getElementById('citaPacienteSuggestions').style.display = 'none';

    // Guardar ID del paciente para vinculación correcta
    const pac = appData.pacientes.find(p => p.nombre === nombre);
    input.dataset.pacienteId = pac ? pac.id : '';
}

async function guardarCita() {
    try {
    const pacienteInput = document.getElementById('citaPacienteInput');
    const paciente = pacienteInput.value.trim();
    const profesional = document.getElementById('citaProfesional').value;
    const fecha = document.getElementById('citaFecha').value;
    const hora = document.getElementById('citaHora').value;
    const consultorio = parseInt(document.getElementById('citaConsultorio').value);
    const motivo = document.getElementById('citaMotivo').value.trim();

    if (!paciente || !profesional || !fecha || !hora || !consultorio || !motivo) {
        showToast('⚠️ Completa todos los campos', 3000, '#e65100');
        return;
    }

    // VALIDACIÓN ESTRICTA: El paciente debe haber sido seleccionado de la lista
    if (!pacienteInput.dataset.pacienteSeleccionado || pacienteInput.dataset.pacienteSeleccionado !== 'true') {
        showToast('⚠️ Selecciona el paciente de la lista — no escribas el nombre libre', 4000);
        return;
    }

    // VALIDACIÓN: La fecha no puede ser en el pasado
    const fechaSeleccionada = new Date(fecha);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    fechaSeleccionada.setHours(0, 0, 0, 0);

    if (fechaSeleccionada < hoy) {
        showToast('❌ No puedes crear una cita en el pasado', 4000, '#c0392b');
        return;
    }

    // VALIDACIÓN: Horario de citas según configuración de la clínica
    const horaApertura = (appData.settings && appData.settings.horaApertura) ?? 8;
    const horaCierre   = (appData.settings && appData.settings.horaCierre)   ?? 20;
    const [horaNum, minutos] = hora.split(':').map(Number);
    if (horaNum < horaApertura || horaNum >= horaCierre) {
        const fmt = h => h < 12 ? `${h}:00 AM` : h === 12 ? '12:00 PM' : `${h-12}:00 PM`;
        showToast(`❌ Horario fuera de rango: ${fmt(horaApertura)} – ${fmt(horaCierre)}`, 4000, '#c0392b');
        return;
    }

    // VALIDAR SOLAPAMIENTO
    const duracionMin = (appData.settings && appData.settings.duracionCita) || 30;
    const fechaHoraNueva = new Date(fecha + 'T' + hora);
    const finNueva = new Date(fechaHoraNueva.getTime() + duracionMin * 60000);

    // Buscar citas que se solapen en el mismo consultorio
    // Una cita se solapa si su inicio está antes del fin de la nueva, y su fin está después del inicio de la nueva
    const estadosIgnorar = ['Cancelada', 'Inasistencia', 'Completada'];
    const citasSolapadas = appData.citas.filter(c => {
        if (c.consultorio !== consultorio) return false;
        if (estadosIgnorar.includes(c.estado)) return false;

        const inicioCita = new Date(c.fecha);
        const durCita = (c.duracionMin) || duracionMin;
        const finCita = new Date(inicioCita.getTime() + durCita * 60000);

        // Solapamiento real: las dos se superponen en el tiempo
        return fechaHoraNueva < finCita && finNueva > inicioCita;
    });

    if (citasSolapadas.length > 0) {
        const citaSolapada = citasSolapadas[0];
        showToast(`⚠️ Consultorio ${consultorio} ocupado a las ${citaSolapada.hora} — elige otra hora`, 5000, '#e65100');
        return;
    }

    const cita = {
        id: generateId('CITA-'),
        paciente,
        pacienteId: document.getElementById('citaPacienteInput').dataset.pacienteId || null,
        profesional,
        duracionMin,
        fecha: fecha + 'T' + hora,
        hora,
        consultorio,
        motivo,
        estado: 'Pendiente',
        creadoPor: appData.currentUser,
        fechaCreacion: new Date().toISOString()
    };

    const backupCitas = appData.citas.length;
    appData.citas.push(cita);
    try {
        await saveData();
    } catch(saveErr) {
        appData.citas.splice(backupCitas, 1); // revertir
        throw saveErr;
    }
    closeModal('modalNuevaCita');
    updateAgendaTab();
    showToast('✅ Cita creada exitosamente');
    } catch(e) {
        showError('Error al guardar la cita.', e);
    }
}

// ========================================
// SISTEMA DE LABORATORIO COMPLETO
// ========================================

// Órdenes de laboratorio temporales (para agregar a factura)
let tempOrdenesLab = [];

function abrirModalOrdenLab() {
    document.getElementById('labTipo').value = 'Corona';
    document.getElementById('labDientes').value = '';
    document.getElementById('labDescripcion').value = '';
    document.getElementById('labLaboratorio').value = '';
    document.getElementById('labPrecio').value = '';
    document.getElementById('labCosto').value = '';
    calcularMargenLab();

    openModal('modalOrdenLab');
}

function calcularMargenLab() {
    const precio = parseFloat(document.getElementById('labPrecio').value) || 0;
    const costo = parseFloat(document.getElementById('labCosto').value) || 0;
    const margen = precio - costo;

    document.getElementById('labMargen').textContent = formatCurrency(margen);

    const margenEl = document.getElementById('labMargen');
    if (margen < 0) {
        margenEl.style.color = '#dc3545';
    } else if (margen > 0) {
        margenEl.style.color = '#28a745';
    } else {
        margenEl.style.color = '#666';
    }
}

function agregarOrdenLabAFactura() {
    const tipo        = sanitize.str(document.getElementById('labTipo')?.value, 100);
    const dientes     = sanitize.str(document.getElementById('labDientes')?.value, 100);
    const descripcion = sanitize.str(document.getElementById('labDescripcion')?.value, 300);
    const laboratorio = sanitize.str(document.getElementById('labLaboratorio')?.value, 120);
    const precio      = sanitize.num(document.getElementById('labPrecio')?.value, 0);
    const costo       = sanitize.num(document.getElementById('labCosto')?.value, 0);

    if (!descripcion)  { showToast('⚠️ Ingresa una descripción'); return; }
    if (!laboratorio)  { showToast('⚠️ Ingresa el nombre del laboratorio'); return; }
    if (precio <= 0)   { showToast('⚠️ El precio debe ser mayor a cero'); return; }

    const orden = {
        id: generateId('TEMP-LAB-'),
        tipo: tipo,
        dientes: dientes,
        descripcion: descripcion,
        laboratorio: laboratorio,
        precio: precio,
        costo: costo,
        margen: precio - costo
    };

    tempOrdenesLab.push(orden);
    updateListaOrdenesLabTemp();
    updateTotal();  // ← CORREGIDO: Actualizar total de la factura
    closeModal('modalOrdenLab');
}

function updateListaOrdenesLabTemp() {
    const lista = getFacturaEl('listaOrdenesLabTemp');

    if (!lista) return;

    if (tempOrdenesLab.length === 0) {
        lista.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No hay órdenes de laboratorio</p>';
        return;
    }

    lista.innerHTML = tempOrdenesLab.map((orden, index) => `
        <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; margin-bottom: 8px; border-left: 4px solid #007AFF;">
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div style="flex: 1;">
                    <div style="font-weight: 600; color: var(--clinic-color, #C4856A); margin-bottom: 4px;">
                        ${orden.tipo}${orden.dientes ? ` - Dientes: ${orden.dientes}` : ''}
                    </div>
                    <div style="font-size: 13px; color: #666; margin-bottom: 2px;">
                        ${orden.descripcion}
                    </div>
                    <div style="font-size: 12px; color: #666;">
                        Lab: ${orden.laboratorio}
                    </div>
                    <div style="font-size: 13px; margin-top: 4px;">
                        <span style="color: #28a745; font-weight: 600;">Precio: ${formatCurrency(orden.precio)}</span>
                        <span style="color: #666; margin-left: 10px;">Costo: ${formatCurrency(orden.costo)}</span>
                        <span style="color: ${orden.margen >= 0 ? '#28a745' : '#dc3545'}; margin-left: 10px; font-weight: 600;">
                            Margen: ${formatCurrency(orden.margen)}
                        </span>
                    </div>
                </div>
                <button class="btn btn-danger" style="margin-left: 10px;" onclick="eliminarOrdenLabTemp(${index})">
                    🗑️
                </button>
            </div>
        </div>
    `).join('');
}

function eliminarOrdenLabTemp(index) {
    tempOrdenesLab.splice(index, 1);
    updateListaOrdenesLabTemp();
    updateTotal();  // ← CORREGIDO: Actualizar total
}

async function crearOrdenesLabDesdeFactura(factura) {
    try {
    if (tempOrdenesLab.length === 0) return;

    const ordenesLab = tempOrdenesLab.map(temp => ({
        id: generateId('LAB-'),
        facturaId: factura.id,
        facturaNumero: factura.numero,
        paciente: factura.paciente,
        profesional: factura.profesional,
        tipo: temp.tipo,
        dientes: temp.dientes,
        descripcion: temp.descripcion,
        laboratorio: temp.laboratorio,
        precio: temp.precio,
        costo: temp.costo,
        margen: temp.margen,
        timeline: [
            {
                estado: 'Toma de impresión',
                fecha: new Date().toISOString(),
                usuario: appData.currentUser,
                notas: 'Impresión tomada'
            }
        ],
        estadoActual: 'Toma de impresión',
        fechaCreacion: new Date().toISOString(),
        creadoPor: appData.currentUser
    }));

    if (!appData.laboratorios) {
        appData.laboratorios = [];
    }
    appData.laboratorios.push(...ordenesLab);
    // No llamar saveData() aquí — generarFactura() lo hace después
    // para evitar doble escritura a Firebase.
    } catch(e) {
        showError('Error al crear las órdenes de laboratorio.', e);
    }
}

function updateLaboratorioTab() {
    if (!appData.laboratorios) {
        appData.laboratorios = [];
    }

    const filtroEstado = document.getElementById('filtroEstadoLab')?.value || 'todos';
    const filtroProfesional = document.getElementById('filtroProfesionalLab')?.value || 'todos';

    let ordenesFiltradas = appData.laboratorios;

    if (filtroEstado !== 'todos') {
        ordenesFiltradas = ordenesFiltradas.filter(o => o.estadoActual === filtroEstado);
    }

    if (appData.currentRole === 'professional') {
        ordenesFiltradas = ordenesFiltradas.filter(o => o.profesional === appData.currentUser);
    } else if (filtroProfesional !== 'todos') {
        ordenesFiltradas = ordenesFiltradas.filter(o => o.profesional === filtroProfesional);
    }

    ordenesFiltradas.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));

    const porEstado = {
        'Toma de impresión': appData.laboratorios.filter(o => o.estadoActual === 'Toma de impresión').length,
        'Enviado a laboratorio': appData.laboratorios.filter(o => o.estadoActual === 'Enviado a laboratorio').length,
        'Listo para prueba': appData.laboratorios.filter(o => o.estadoActual === 'Listo para prueba').length,
        'Entregado': appData.laboratorios.filter(o => o.estadoActual === 'Entregado').length
    };

    document.getElementById('statsLaboratorio').innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 20px;">
            <div style="background: rgba(196,133,106,0.1); padding: 15px; border-radius: 10px; text-align: center; border: 1.5px solid rgba(196,133,106,0.2);">
                <div style="font-size: 28px; font-weight: 300; color: var(--terracota,#C4856A);">${porEstado['Toma de impresión']}</div>
                <div style="font-size: 11px; color: var(--mid,#9C9189); margin-top: 4px; letter-spacing: 0.5px;">Impresión</div>
            </div>
            <div style="background: rgba(123,143,161,0.1); padding: 15px; border-radius: 10px; text-align: center; border: 1.5px solid rgba(123,143,161,0.2);">
                <div style="font-size: 28px; font-weight: 300; color: var(--azul,#7B8FA1);">${porEstado['Enviado a laboratorio']}</div>
                <div style="font-size: 11px; color: var(--mid,#9C9189); margin-top: 4px; letter-spacing: 0.5px;">En Lab</div>
            </div>
            <div style="background: rgba(196,133,106,0.07); padding: 15px; border-radius: 10px; text-align: center; border: 1.5px solid rgba(196,133,106,0.15);">
                <div style="font-size: 28px; font-weight: 300; color: var(--terracota,#C4856A);">${porEstado['Listo para prueba']}</div>
                <div style="font-size: 11px; color: var(--mid,#9C9189); margin-top: 4px; letter-spacing: 0.5px;">Para Prueba</div>
            </div>
            <div style="background: rgba(107,143,113,0.1); padding: 15px; border-radius: 10px; text-align: center; border: 1.5px solid rgba(107,143,113,0.2);">
                <div style="font-size: 28px; font-weight: 300; color: var(--green,#6B8F71);">${porEstado['Entregado']}</div>
                <div style="font-size: 11px; color: var(--mid,#9C9189); margin-top: 4px; letter-spacing: 0.5px;">Entregados</div>
            </div>
        </div>
    `;

    const lista = document.getElementById('listaLaboratorio');

    if (ordenesFiltradas.length === 0) {
        lista.innerHTML = '<p style="text-align: center; padding: 40px; color: #999;">No hay órdenes de laboratorio</p>';
        return;
    }

    lista.innerHTML = ordenesFiltradas.map(orden => {
        const timeline = orden.timeline || [];
        const ultimoEvento = timeline.length > 0 ? timeline[timeline.length - 1] : { fecha: orden.fechaCreacion || new Date().toISOString(), usuario: 'Sistema', notas: '' };
        const colorEstado = getColorEstado(orden.estadoActual);

        return `
            <div style="background: white; border: 1px solid #e0e0e0; border-left: 4px solid ${colorEstado}; border-radius: 8px; padding: 15px; margin-bottom: 12px; cursor: pointer;" onclick="verDetalleOrdenLab('${orden.id}')">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                    <div style="flex: 1;">
                        <div style="font-size: 16px; font-weight: 700; color: var(--clinic-color, #C4856A); margin-bottom: 4px;">
                            ${orden.tipo}${orden.dientes ? ` - ${orden.dientes}` : ''}
                        </div>
                        <div style="font-size: 14px; color: #666; margin-bottom: 2px;">
                            👤 ${orden.paciente}
                        </div>
                        <div style="font-size: 13px; color: #666;">
                            👨‍⚕️ ${orden.profesional} • 🏥 ${orden.laboratorio}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="background: ${colorEstado}; color: white; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-bottom: 8px;">
                            ${orden.estadoActual}
                        </div>
                        <div style="font-size: 14px; font-weight: 400; color: var(--green,#6B8F71);">
                            ${formatCurrency(orden.precio)}
                        </div>
                    </div>
                </div>
                <div style="font-size: 12px; color: #999;">
                    📅 ${formatDate(ultimoEvento.fecha)} • ${ultimoEvento.usuario}
                    ${ultimoEvento.notas ? ` • ${ultimoEvento.notas}` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function getColorEstado(estado) {
    const colores = {
        'Toma de impresión':      'var(--terracota, #C4856A)',
        'Enviado a laboratorio':  'var(--azul, #7B8FA1)',
        'Listo para prueba':      '#E8A838',
        'Reenviado a laboratorio':'var(--red, #C47070)',
        'Entregado':              'var(--green, #6B8F71)'
    };
    return colores[estado] || 'var(--mid, #9C9189)';
}

function verDetalleOrdenLab(ordenId) {
    const orden = appData.laboratorios.find(o => o.id === ordenId);
    if (!orden) return;

    document.getElementById('detalleLabInfo').innerHTML = `
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
            <div style="font-size: 18px; font-weight: 700; color: var(--clinic-color, #C4856A); margin-bottom: 10px;">
                ${orden.tipo}${orden.dientes ? ` - Dientes: ${orden.dientes}` : ''}
            </div>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 10px;">
                <div>
                    <div style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: 600;">Paciente</div>
                    <div style="font-size: 14px; font-weight: 500;">${orden.paciente}</div>
                </div>
                <div>
                    <div style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: 600;">Profesional</div>
                    <div style="font-size: 14px; font-weight: 500;">${orden.profesional}</div>
                </div>
                <div>
                    <div style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: 600;">Laboratorio</div>
                    <div style="font-size: 14px; font-weight: 500;">${orden.laboratorio}</div>
                </div>
                <div>
                    <div style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: 600;">Factura</div>
                    <div style="font-size: 14px; font-weight: 500;">${orden.facturaNumero}</div>
                </div>
            </div>
            <div style="margin-top: 10px;">
                <div style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: 600;">Descripción</div>
                <div style="font-size: 14px;">${orden.descripcion}</div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 15px; padding-top: 15px; border-top: 1px solid #dee2e6;">
                <div>
                    <div style="font-size: 11px; color: #666;">Precio</div>
                    <div style="font-size: 16px; font-weight: 400; color: var(--green,#6B8F71);">${formatCurrency(orden.precio)}</div>
                </div>
                <div>
                    <div style="font-size: 11px; color: #666;">Costo</div>
                    <div style="font-size: 16px; font-weight: 400; color: var(--red,#C47070);">${formatCurrency(orden.costo)}</div>
                </div>
                <div>
                    <div style="font-size: 11px; color: #666;">Margen</div>
                    <div style="font-size: 16px; font-weight: 400; color: ${orden.margen >= 0 ? 'var(--green,#6B8F71)' : 'var(--red,#C47070)'};">
                        ${formatCurrency(orden.margen)}
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('detalleLabTimeline').innerHTML = (orden.timeline || []).map((evento, index) => {
        const isLast = index === (orden.timeline || []).length - 1;
        const color = getColorEstado(evento.estado);

        return `
            <div style="display: flex; margin-bottom: ${isLast ? '0' : '20px'};">
                <div style="display: flex; flex-direction: column; align-items: center; margin-right: 15px;">
                    <div style="width: 12px; height: 12px; background: ${color}; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 0 2px ${color};"></div>
                    ${!isLast ? `<div style="width: 2px; flex: 1; background: #dee2e6; margin: 4px 0;"></div>` : ''}
                </div>
                <div style="flex: 1; padding-bottom: ${isLast ? '0' : '10px'};">
                    <div style="font-weight: 600; color: var(--clinic-color, #C4856A); margin-bottom: 4px;">${evento.estado}</div>
                    <div style="font-size: 12px; color: #666; margin-bottom: 2px;">
                        📅 ${formatDate(evento.fecha)} ${formatTime(evento.fecha)}
                    </div>
                    <div style="font-size: 12px; color: #666;">
                        👤 ${evento.usuario}
                        ${evento.notas ? ` • ${evento.notas}` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    window.currentOrdenLabId = ordenId;

    const botonesHTML = renderizarBotonesAvance(orden);
    document.getElementById('botonesAvanceLab').innerHTML = `
        ${orden.estadoActual !== 'Entregado' ? `
        <textarea id="notasAvanceLab" placeholder="Notas del cambio (opcional)..."
            style="width:100%;padding:10px 12px;border:1.5px solid rgba(30,28,26,0.1);
                   border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;
                   min-height:56px;background:var(--surface,#F5F2EE);color:var(--dark,#1E1C1A);
                   margin-bottom:10px"></textarea>` : ''}
        ${botonesHTML}
    `;

    openModal('modalDetalleOrdenLab');
}

function renderizarBotonesAvance(orden) {
    const estadoActual = orden.estadoActual;

    if (estadoActual === 'Entregado') {
        return '<p style="text-align: center; color: #28a745; font-weight: 600;">✅ Orden completada y entregada</p>';
    }

    let botones = [];

    if (estadoActual === 'Toma de impresión') {
        botones.push({
            text: '📤 Enviar a Laboratorio',
            color: '#007AFF',
            estado: 'Enviado a laboratorio'
        });
    }

    if (estadoActual === 'Enviado a laboratorio') {
        botones.push({
            text: '✅ Marcar Listo para Prueba',
            color: '#ff9500',
            estado: 'Listo para prueba'
        });
    }

    if (estadoActual === 'Listo para prueba') {
        botones.push({
            text: '🔄 Reenviar a Laboratorio',
            color: '#dc3545',
            estado: 'Reenviado a laboratorio'
        });
        botones.push({
            text: '🎉 Marcar como Entregado',
            color: '#28a745',
            estado: 'Entregado'
        });
    }

    if (estadoActual === 'Reenviado a laboratorio') {
        botones.push({
            text: '✅ Listo para Prueba (otra vez)',
            color: '#ff9500',
            estado: 'Listo para prueba'
        });
    }

    return botones.map((btn, index) => `
        <button
            class="btn"
            style="background: ${btn.color}; color: white; margin: 5px;"
            onclick="avanzarEstadoLab('${btn.estado}')"
            data-estado="${btn.estado}"
        >
            ${btn.text}
        </button>
    `).join('');
}

async function avanzarEstadoLab(nuevoEstado) {
    try {
    // Solo profesionales y admin pueden avanzar estados de laboratorio
    if (appData.currentRole === 'reception') {
        showToast('⛔ Sin permiso para actualizar el laboratorio', 3000, '#c0392b');
        return;
    }

    if (!window.currentOrdenLabId) {
        showToast('⚠️ No hay orden seleccionada', 3000, '#e65100');
        console.error('[Lab] actualizarEstadoLab llamado sin orden activa.');
        return;
    }

    const orden = appData.laboratorios.find(o => o.id === window.currentOrdenLabId);

    if (!orden) {
        showToast('⚠️ Orden no encontrada', 3000, '#e65100');
        console.error('[Lab] Orden no encontrada en appData.laboratorios.');
        return;
    }

    // Leer notas del textarea en el modal de detalle
    const notasEl = document.getElementById('notasAvanceLab');
    const notas = notasEl ? notasEl.value.trim() : '';

    const ejecutarAvance = async () => {
        if (!orden.timeline) orden.timeline = [];
        const estadoAnterior = orden.estadoActual;
        orden.timeline.push({
            estado: nuevoEstado,
            fecha: new Date().toISOString(),
            usuario: appData.currentUser,
            notas: notas || ''
        });
        orden.estadoActual = nuevoEstado;

        try {
            await saveData();
            verDetalleOrdenLab(orden.id);
            updateLaboratorioTab();
        } catch(e) {
            // Rollback
            orden.timeline.pop();
            orden.estadoActual = estadoAnterior;
            showError('Error al actualizar el laboratorio.', e);
        }
    };

    // Advertencia de balance pendiente al entregar — sin bloquear
    if (nuevoEstado === 'Entregado' && orden.paciente) {
        const facturasDelPaciente = appData.facturas.filter(f =>
            f.paciente === orden.paciente && f.estado !== 'pagada'
        );
        const balancePendiente = facturasDelPaciente.reduce((sum, f) => {
            const pagado = (f.pagos || []).reduce((s, p) => s + p.monto, 0);
            return sum + (f.total - pagado);
        }, 0);

        if (balancePendiente > 0) {
            mostrarConfirmacion({
                titulo: 'Balance pendiente',
                mensaje: `<strong>${orden.paciente}</strong> tiene ${formatCurrency(balancePendiente)} pendiente en ${facturasDelPaciente.length} factura${facturasDelPaciente.length !== 1 ? 's' : ''}.<br><br>¿Marcar la orden como entregada de todas formas?`,
                tipo: 'advertencia',
                confirmText: 'Sí, entregar',
                onConfirm: ejecutarAvance
            });
            return;
        }
    }

    await ejecutarAvance();
    } catch(e) {
        showError('Error al actualizar el estado del laboratorio.', e);
    }
}

function formatTime(isoDate) {
    const date = new Date(isoDate);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

// ========================================
// SISTEMA DE ESTADOS DE CITAS
// ========================================

function getColorEstadoCita(estado) {
    const colores = {
        'Pendiente': '#ffc107',
        'Confirmada': '#007AFF',
        'En Sala de Espera': '#ff9500',
        'Completada': '#28a745',
        'Cancelada': '#6c757d',
        'Inasistencia': '#dc3545'
    };
    return colores[estado] || '#999';
}

function getIconoEstadoCita(estado) {
    const iconos = {
        'Pendiente': '⏳',
        'Confirmada': '✅',
        'En Sala de Espera': '🏥',
        'Completada': '✔️',
        'Cancelada': '❌',
        'Inasistencia': '⚠️'
    };
    return iconos[estado] || '📅';
}

async function cambiarEstadoCita(citaId, nuevoEstado) {
    try {
    const cita = appData.citas.find(c => c.id === citaId);
    if (!cita) {
        showToast('⚠️ Cita no encontrada', 3000, '#e65100'); console.error('[Citas] cambiarEstadoCita: ID no encontrado:', citaId);
        return;
    }

    const estadoAnterior = cita.estado || 'Pendiente';

    // Advertencia sin bloquear si se completa sin factura
    const sinFactura = nuevoEstado === 'Completada' && !cita.facturaId;

    const ejecutarCambio = async (notas) => {
        // Inicializar historial si no existe
        if (!cita.historialEstados) {
            cita.historialEstados = [{
                estado: estadoAnterior,
                fecha: cita.fechaCreacion || cita.fecha,
                usuario: cita.creadoPor || 'Sistema',
                notas: 'Estado inicial'
            }];
        }
        cita.historialEstados.push({
            estado: nuevoEstado,
            fecha: new Date().toISOString(),
            usuario: appData.currentUser,
            notas: notas || ''
        });
        cita.estado = nuevoEstado;
        cita.ultimaModificacion = new Date().toISOString();
        cita.modificadoPor = appData.currentUser;
        if (notas) cita.notasProcedimiento = notas;

        await saveData();
        updateAgendaTab();
        closeModal('modalDetalleCita');
        showToast(`✓ Estado: ${nuevoEstado}`);
    };

    const notasEl = document.getElementById('notasCambioEstado');
    const notas = notasEl ? notasEl.value.trim() : '';

    // Si hay advertencia de sin factura, confirmar primero
    if (sinFactura) {
        mostrarConfirmacion({
            titulo: 'Sin factura asociada',
            mensaje: `Esta cita no tiene factura. ¿Marcar como <strong>Completada</strong> de todas formas?<br><br>
                     <span style="font-size:13px;color:var(--mid)">Recomendación: genera la factura antes para vincularla automáticamente.</span>`,
            tipo: 'advertencia',
            confirmText: 'Sí, completar',
            onConfirm: () => ejecutarCambio(notas)
        });
    } else {
        await ejecutarCambio(notas);
    }
    } catch(e) {
        showError('Error al cambiar el estado de la cita.', e);
    }
}

// Función para inicializar estados en citas existentes
function inicializarEstadosCitas() {
    let actualizadas = 0;
    appData.citas.forEach(cita => {
        if (!cita.estado) {
            cita.estado = 'Pendiente';
            actualizadas++;
        }
    });
    if (actualizadas > 0) {
        saveData();
    }
}

// ========================================
// AUTOCOMPLETE DE PACIENTES EN FACTURA
// ========================================

function buscarPacienteFactura() {
    // When cobros tab clones tab-factura HTML, there are two #pacienteNombre elements.
    // Always use the one inside #cobros-content if it exists (visible), else fallback to any.
    const contenedor = document.getElementById('cobros-content') || document;
    const input = contenedor.querySelector('#pacienteNombre') || document.getElementById('pacienteNombre');
    const suggestions = contenedor.querySelector('#pacienteNombreSuggestions') || document.getElementById('pacienteNombreSuggestions');
    if (!input || !suggestions) return;

    const query = input.value.toLowerCase();

    // Resetear flag de selección cuando el usuario escribe
    input.dataset.pacienteSeleccionado = 'false';

    if (query.length < 2) {
        suggestions.style.display = 'none';
        return;
    }

    const matches = appData.pacientes.filter(p =>
        p.nombre && (
            p.nombre.toLowerCase().includes(query) ||
            (p.cedula && p.cedula.includes(query)) ||
            (p.telefono && p.telefono.includes(query))
        )
    ).slice(0, 5);

    if (matches.length === 0) {
        suggestions.style.display = 'none';
        return;
    }

    suggestions.innerHTML = matches.map(p => `
        <div onclick="seleccionarPacienteFactura('${p.nombre.replace(/'/g, "\'")}')"
             style="padding:14px 16px;cursor:pointer;border-bottom:1px solid rgba(30,28,26,0.06);
                    transition:background 0.15s;display:flex;flex-direction:column;gap:3px"
             onmouseover="this.style.background='var(--surface)'"
             onmouseout="this.style.background='transparent'">
            <div style="font-size:14px;font-weight:400;color:var(--dark)">${p.nombre}</div>
            <div style="font-size:12px;color:var(--mid)">
                ${p.cedula ? `<span style="margin-right:10px">📋 ${p.cedula}</span>` : ''}${p.telefono ? `📱 ${p.telefono}` : ''}
            </div>
        </div>
    `).join('');

    suggestions.style.display = 'block';
}

function seleccionarPacienteFactura(nombre) {
    const contenedor = document.getElementById('cobros-content') || document;
    const input       = contenedor.querySelector('#pacienteNombre')       || document.getElementById('pacienteNombre');
    const suggestions = contenedor.querySelector('#pacienteNombreSuggestions') || document.getElementById('pacienteNombreSuggestions');
    if (!input) return;

    input.value = nombre;
    input.dataset.pacienteSeleccionado = 'true';
    if (suggestions) suggestions.style.display = 'none';

    // Guardar ID del paciente para vinculación correcta
    const pac = appData.pacientes.find(p => p.nombre === nombre);
    input.dataset.pacienteId = pac ? pac.id : '';
}

// ========================================
// SISTEMA DE CONSENTIMIENTO INFORMADO
// ========================================

let currentPacienteConsentimiento = null;
let signaturePad = null;

function abrirConsentimiento(pacienteId) {
    const paciente = appData.pacientes.find(p => p.id === pacienteId);
    if (!paciente) return;

    currentPacienteConsentimiento = paciente;

    document.getElementById('consentimientoNombre').textContent = paciente.nombre;
    document.getElementById('consentimientoCedula').textContent = paciente.cedula || 'No registrada';

    // Abrir modal primero
    openModal('modalConsentimiento');

    // Inicializar canvas — retry hasta que el modal esté visible y el canvas tenga dimensiones reales
    function initSignatureCanvas() {
        const canvas = document.getElementById('signatureCanvas');
        if (!canvas) return;
        if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) {
            setTimeout(initSignatureCanvas, 60);  // modal still rendering, retry
            return;
        }

        // Fijar dimensiones exactas al tamaño CSS del elemento
        canvas.width  = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#1E1C1A';
        ctx.lineWidth   = 2;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';

        let drawing = false, lx = 0, ly = 0;

        // Convierte coordenadas del evento al espacio interno del canvas
        // (importante si el canvas está escalado con CSS)
        const pos = (e, touch) => {
            const r = canvas.getBoundingClientRect();
            const s = touch || e;
            return {
                x: (s.clientX - r.left) * (canvas.width  / r.width),
                y: (s.clientY - r.top)  * (canvas.height / r.height)
            };
        };

        canvas.onmousedown  = e => { drawing = true; const p = pos(e); lx = p.x; ly = p.y; };
        canvas.onmousemove  = e => {
            if (!drawing) return;
            const p = pos(e);
            ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(p.x, p.y); ctx.stroke();
            lx = p.x; ly = p.y;
        };
        canvas.onmouseup    = () => drawing = false;
        canvas.onmouseleave = () => drawing = false;

        canvas.ontouchstart = e => {
            e.preventDefault(); drawing = true;
            const p = pos(null, e.touches[0]); lx = p.x; ly = p.y;
        };
        canvas.ontouchmove  = e => {
            e.preventDefault();
            if (!drawing) return;
            const p = pos(null, e.touches[0]);
            ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(p.x, p.y); ctx.stroke();
            lx = p.x; ly = p.y;
        };
        canvas.ontouchend = () => drawing = false;
    }
    setTimeout(initSignatureCanvas, 80);
}

function limpiarFirma() {
    const canvas = document.getElementById('signatureCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

async function guardarConsentimiento() {
    try {
    if (!currentPacienteConsentimiento) return;

    const canvas = document.getElementById('signatureCanvas');
    const ctx = canvas.getContext('2d');

    // Verificar que hay firma
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hasSignature = imageData.data.some(channel => channel !== 0);

    if (!hasSignature) {
        showToast('⚠️ Por favor firma el consentimiento', 3000, '#e65100');
        return;
    }

    // Guardar firma como base64
    const firmaBase64 = canvas.toDataURL('image/png');

    currentPacienteConsentimiento.consentimiento = {
        firmado: true,
        fecha: new Date().toISOString(),
        firmaBase64: firmaBase64
    };

    await savePaciente(currentPacienteConsentimiento);
    closeModal('modalConsentimiento');

    // Refresh the documentos tab live — no need to close and reopen the patient card
    const pac = currentPacienteConsentimiento;
    renderTabDocumentos(pac);

    // Also refresh the patient list badge in the background
    updatePacientesTab();
    } catch(e) {
        showError('Error al guardar el consentimiento.', e);
    }
}

function verFirma(pacienteId) {
    const paciente = appData.pacientes.find(p => p.id === pacienteId);
    if (!paciente || !paciente.consentimiento || !paciente.consentimiento.firmado) {
        showToast('⚠️ Este paciente no tiene consentimiento firmado', 4000, '#e65100');
        return;
    }

    generarPDFConsentimiento(paciente);
}

// ── PDF helpers — uses clinicConfig for branding ──────────────────
function _hexToRgb(hex) {
    const h = (hex || '#C4856A').replace('#', '');
    const n = parseInt(h.length === 3
        ? h.split('').map(c => c+c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function _pdfHeader(doc, pageWidth, pageHeight) {
    const [r, g, b] = _hexToRgb(clinicConfig.color);
    const logo = clinicConfig.logoNegativo || clinicConfig.logoPositivo;
    const nombre = getNombreClinica();
    const admin  = getNombreAdmin();

    // Header bar
    doc.setFillColor(r, g, b);
    doc.rect(0, 0, pageWidth, 38, 'F');

    // Logo — left side if available
    let textX = pageWidth / 2;
    if (logo) {
        try {
            doc.addImage(logo, 'PNG', 6, 4, 30, 30);
            textX = pageWidth / 2 + 15;
        } catch(e) {}
    }

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(logo ? 15 : 18);
    doc.text(nombre, textX, 16, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(admin, textX, 27, { align: 'center' });

    return 46; // y position after header
}

function _pdfFooter(doc, pageWidth, pageHeight) {
    const [r, g, b] = _hexToRgb(clinicConfig.color);
    doc.setDrawColor(r, g, b);
    doc.setLineWidth(0.3);
    doc.line(20, pageHeight - 18, pageWidth - 20, pageHeight - 18);
    doc.setTextColor(153, 153, 153);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text(
        `Generado por SMILE · ${getNombreClinica()} · ${new Date().toLocaleDateString(getLocale())}`,
        pageWidth / 2, pageHeight - 10, { align: 'center' }
    );
}
// ──────────────────────────────────────────────────────────────────

function generarPDFConsentimiento(paciente) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const pageWidth  = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 20;
    const [cr, cg, cb] = _hexToRgb(clinicConfig.color);

    // ── HEADER (clinic color + logo) ──
    let y = _pdfHeader(doc, pageWidth, pageHeight);

    // ── TÍTULO ──
    doc.setTextColor(cr, cg, cb);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('CONSENTIMIENTO INFORMADO', pageWidth / 2, y, { align: 'center' });

    y += 15;

    // ============================================
    // DATOS DEL PACIENTE
    // ============================================

    doc.setFillColor(248, 249, 250);
    doc.roundedRect(margin, y, pageWidth - 2 * margin, 35, 3, 3, 'F');

    doc.setTextColor(102, 102, 102);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('DATOS DEL PACIENTE', margin + 5, y + 8);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);

    doc.text(`Nombre completo: ${paciente.nombre}`, margin + 5, y + 16);
    doc.text(`Cédula: ${paciente.cedula || 'No registrada'}`, margin + 5, y + 23);
    doc.text(`Teléfono: ${paciente.telefono || 'No registrado'}`, margin + 5, y + 30);

    y += 45;

    // ============================================
    // TEXTO DEL CONSENTIMIENTO
    // ============================================

    doc.setDrawColor(cr, cg, cb);
    doc.setLineWidth(0.5);
    doc.rect(margin, y, pageWidth - 2 * margin, 80, 'S');

    doc.setTextColor(cr, cg, cb);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('DECLARACIÓN DE CONSENTIMIENTO', margin + 5, y + 8);

    doc.setTextColor(51, 51, 51);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const texto = `Por la presente, declaro que he sido informado de forma clara sobre el diagnóstico,
los riesgos, beneficios y alternativas del tratamiento dental propuesto. Autorizo
voluntariamente al personal de esta clínica a realizar los procedimientos necesarios,
incluyendo la administración de anestesia local si se requiere.

Comprendo que la medicina y odontología no son ciencias exactas y no se pueden
garantizar resultados específicos, asumiendo mi responsabilidad en el cumplimiento de
las indicaciones post-operatorias y asistencias a citas de control.

He tenido la oportunidad de hacer preguntas y todas mis dudas han sido resueltas
satisfactoriamente. Firmo este documento de forma libre y voluntaria.`;

    const lineas = doc.splitTextToSize(texto, pageWidth - 2 * margin - 10);
    doc.text(lineas, margin + 5, y + 16);

    y += 90;

    // ============================================
    // FIRMA DEL PACIENTE
    // ============================================

    doc.setDrawColor(221, 221, 221);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, pageWidth - 2 * margin, 50, 'S');

    doc.setTextColor(102, 102, 102);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('FIRMA DEL PACIENTE (O TUTOR LEGAL)', margin + 5, y + 8);

    // Agregar imagen de la firma
    const firmaImg = paciente.consentimiento.firmaBase64;
    doc.addImage(firmaImg, 'PNG', margin + 10, y + 12, 80, 30);

    // Línea para la firma
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(margin + 10, y + 43, margin + 90, y + 43);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(102, 102, 102);
    doc.text('Firma del paciente', margin + 35, y + 47);

    y += 60;

    // ============================================
    // FECHA Y HORA DE FIRMA
    // ============================================

    const fechaFirma = new Date(paciente.consentimiento.fecha);
    const fechaFormateada = fechaFirma.toLocaleDateString(getLocale(), {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const horaFormateada = fechaFirma.toLocaleTimeString(getLocale(), {
        hour: '2-digit',
        minute: '2-digit'
    });

    doc.setFillColor(212, 237, 218);
    doc.roundedRect(margin, y, pageWidth - 2 * margin, 20, 3, 3, 'F');

    doc.setTextColor(21, 87, 36);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('✓ DOCUMENTO FIRMADO DIGITALMENTE', margin + 5, y + 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Fecha: ${fechaFormateada}`, margin + 5, y + 14);
    doc.text(`Hora: ${horaFormateada}`, margin + 5, y + 18);

    // ── FOOTER ──
    _pdfFooter(doc, pageWidth, pageHeight);

    // Abrir en nueva pestaña para imprimir o descargar
    const nombreArchivo = `Consentimiento_${paciente.nombre.replace(/\s+/g, '_')}_${fechaFirma.toISOString().split('T')[0]}.pdf`;
    const pdfBlob = doc.output('blob');
    const url = URL.createObjectURL(pdfBlob);
    const win = window.open(url, '_blank');
    if (!win) doc.save(nombreArchivo);  // fallback si popup bloqueado
}

// ========================================
// FUNCIÓN DE MIGRACIÓN/LIMPIEZA DE DATOS
// ========================================

async function limpiarDatosAntiguos() {
    let cambios = 0;

    // Corregir tipos de personal antiguos
    appData.personal.forEach(p => {
        if (p.tipo === 'profesional') {
            p.tipo = 'regular';
            cambios++;
        }
    });

    // Normalizar estados de facturas legacy (inglés → español)
    appData.facturas.forEach(f => {
        if (f.estado === 'pending') { f.estado = 'pendiente'; cambios++; }
        if (f.estado === 'partial') { f.estado = 'parcial'; cambios++; }
        if (f.estado === 'paid')    { f.estado = 'pagada'; cambios++; }
    });

    // Inicializar estados en citas sin estado
    appData.citas.forEach(c => {
        if (!c.estado) {
            c.estado = 'Pendiente';
            cambios++;
        }
    });

    if (cambios > 0) {
        await saveData('saveData-init'); // contexto permitido sin usuario logueado
        updateProfessionalPicker();
        updateReceptionPicker();
    }

    // Actualizar pickers siempre
    updateProfessionalPicker();
    updateReceptionPicker();
}

// ========================================
// GALERÍA DE PLACAS RADIOGRÁFICAS
// ========================================

let currentPacienteGaleria = null;

function abrirGaleriaPlacas(pacienteId) {
    const paciente = appData.pacientes.find(p => p.id === pacienteId);
    if (!paciente) return;

    currentPacienteGaleria = paciente;

    // Inicializar galería si no existe
    if (!paciente.placas) {
        paciente.placas = [];
    }

    document.getElementById('galeriaPacienteNombre').textContent = paciente.nombre;
    renderizarGaleriaPlacas();

    closeModal('modalVerPaciente');
    openModal('modalGaleriaPlacas');
}

function renderizarGaleriaPlacas() {
    if (!currentPacienteGaleria) return;

    const placas = currentPacienteGaleria.placas || [];
    const galeriaContainer = document.getElementById('galeriaPlacasContainer');

    if (placas.length === 0) {
        galeriaContainer.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: #999;">
                <div style="font-size: 64px; margin-bottom: 20px;">🦷</div>
                <div style="font-size: 18px; font-weight: 600; margin-bottom: 10px;">Sin placas radiográficas</div>
                <div style="font-size: 14px;">Haz click en "Subir Nueva Placa" para agregar imágenes</div>
            </div>
        `;
        return;
    }

    // Ordenar por fecha (más reciente primero)
    const placasOrdenadas = [...placas].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    galeriaContainer.innerHTML = placasOrdenadas.map(placa => {
        // Soportar tanto base64 (legacy) como URL (nuevo)
        const imageSrc = placa.imageURL || placa.imagenBase64;

        return `
        <div class="placa-card" style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-4px)'" onmouseout="this.style.transform='translateY(0)'">
            <div style="position: relative; cursor: pointer;" onclick="verPlacaFullscreen('${placa.id}')">
                <img src="${imageSrc}" style="width: 100%; height: 200px; object-fit: cover; display: block;">
                <div style="position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.7); color: white; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600;">
                    ${formatDate(placa.fecha)}
                </div>
            </div>
            <div style="padding: 15px;">
                <div style="font-size: 14px; font-weight: 600; color: var(--clinic-color, #C4856A); margin-bottom: 8px;">${placa.tipo || 'Radiografía'}</div>
                ${placa.subidoPor ? `
                    <div style="font-size: 11px; color: #999; margin-bottom: 8px;">
                        👤 ${placa.subidoPor}
                    </div>
                ` : ''}
                ${placa.notas ? `
                    <div style="font-size: 13px; color: #666; margin-bottom: 10px; line-height: 1.4;">
                        ${placa.notas.length > 80 ? placa.notas.substring(0, 80) + '...' : placa.notas}
                    </div>
                ` : ''}
                <div style="display: flex; gap: 8px; margin-top: 12px;">
                    <button class="btn btn-secondary" onclick="editarPlaca('${placa.id}')" style="flex: 1; font-size: 12px; padding: 8px;">
                        ✏️ Editar
                    </button>
                    <button class="btn btn-cancel" onclick="eliminarPlaca('${placa.id}')" style="flex: 1; font-size: 12px; padding: 8px;">
                        🗑️ Eliminar
                    </button>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

function abrirSubirPlaca() {
    document.getElementById('placaTipo').value = 'Periapical';
    document.getElementById('placaNotas').value = '';
    document.getElementById('placaInput').value = '';
    document.getElementById('placaPreview').src = '';
    document.getElementById('placaPreview').classList.add('hidden');
    document.getElementById('placaNombreArchivo').textContent = '';

    openModal('modalSubirPlaca');
}

function previsualizarPlaca() {
    const input = document.getElementById('placaInput');
    const preview = document.getElementById('placaPreview');
    const nombreArchivo = document.getElementById('placaNombreArchivo');

    if (input.files && input.files[0]) {
        const file = input.files[0];

        // Mostrar nombre del archivo
        nombreArchivo.innerHTML = `
            <div style="background: #e8f5e9; padding: 10px; border-radius: 6px; border: 1px solid #4caf50;">
                <span style="color: #2e7d32; font-weight: 600;">✓</span>
                <span style="color: #2e7d32;">${file.name}</span>
                <span style="color: #666; font-size: 11px; margin-left: 8px;">(${(file.size / 1024).toFixed(0)} KB)</span>
            </div>
        `;

        // Mostrar preview de la imagen
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.src = e.target.result;
            preview.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    } else {
        nombreArchivo.textContent = '';
        preview.classList.add('hidden');
    }
}

async function guardarPlaca() {
    try {
    const tipo = document.getElementById('placaTipo').value;
    const notas = document.getElementById('placaNotas').value.trim();
    const input = document.getElementById('placaInput');

    if (!input.files || !input.files[0]) {
        showToast('⚠️ Selecciona una imagen', 3000, '#e65100');
        return;
    }

    const file = input.files[0];

    // Validar tamaño (máximo 5MB)
    if (file.size > 5 * 1024 * 1024) {
        showToast('❌ Imagen demasiado grande. Máximo 5MB', 4000, '#c0392b');
        return;
    }

    // Validar tipo
    if (!file.type.startsWith('image/')) {
        showToast('❌ Solo se permiten imágenes', 3000, '#c0392b');
        return;
    }

    try {
        // Mostrar loading
        const loadingMsg = document.createElement('div');
        loadingMsg.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.8); color: white; padding: 20px 40px; border-radius: 12px; z-index: 99999; font-size: 16px;';
        loadingMsg.textContent = '⏳ Subiendo imagen...';
        document.body.appendChild(loadingMsg);

        // Subir a Firebase Storage
        const placaId = generateId('PLACA-');
        const fileName = `placas/${currentPacienteGaleria.id}/${placaId}_${Date.now()}.${file.name.split('.').pop()}`;
        const storageRef = firebase.storage().ref(fileName);

        // Subir archivo
        await storageRef.put(file);

        // Obtener URL de descarga
        const downloadURL = await storageRef.getDownloadURL();

        // Crear objeto de placa
        const placa = {
            id: placaId,
            tipo,
            notas,
            imageURL: downloadURL,  // URL en lugar de base64
            storagePath: fileName,  // Guardar ruta para poder eliminar después
            fecha: new Date().toISOString(),
            subidoPor: appData.currentUser
        };

        if (!currentPacienteGaleria.placas) {
            currentPacienteGaleria.placas = [];
        }

        currentPacienteGaleria.placas.push(placa);

        await savePaciente(currentPacienteGaleria);

        // Quitar loading
        document.body.removeChild(loadingMsg);

        closeModal('modalSubirPlaca');
        renderizarGaleriaPlacas();

        showToast('✓ Placa radiográfica guardada');
    } catch (error) {
        console.error('❌ Error completo:', error);
        console.error('Código de error:', error.code);
        console.error('Mensaje:', error.message);

        // Quitar loading si existe
        const loadingMsg = document.querySelector('div[style*="Subiendo imagen"]');
        if (loadingMsg && loadingMsg.parentNode) {
            loadingMsg.parentNode.removeChild(loadingMsg);
        }

        // Mensaje de error específico
        let mensaje = '❌ Error al subir la imagen.\n\n';

        if (error.code === 'storage/unauthorized') {
            mensaje += '⚠️ FIREBASE STORAGE NO ESTÁ CONFIGURADO\n\n';
            mensaje += 'Necesitas habilitar Storage en Firebase:\n';
            mensaje += '1. Ve a console.firebase.google.com\n';
            mensaje += '2. Storage → Get Started\n';
            mensaje += '3. Configurar reglas de seguridad\n\n';
            mensaje += 'Por ahora, voy a guardar la placa en modo legacy (base64).';

            // Fallback: guardar como base64 (modo legacy)
            const reader = new FileReader();
            reader.onload = async function(e) {
                const placa = {
                    id: generateId('PLACA-'),
                    tipo,
                    notas,
                    imagenBase64: e.target.result,  // Base64 legacy
                    fecha: new Date().toISOString(),
                    subidoPor: appData.currentUser
                };

                if (!currentPacienteGaleria.placas) {
                    currentPacienteGaleria.placas = [];
                }

                currentPacienteGaleria.placas.push(placa);
                await saveData();

                closeModal('modalSubirPlaca');
                renderizarGaleriaPlacas();

                showToast('⚠️ Placa guardada en modo legacy. Configura Firebase Storage para mejores resultados.', 6000, '#e65100');
            };
            reader.readAsDataURL(input.files[0]);

        } else if (error.code === 'storage/unknown') {
            mensaje += 'Firebase Storage no está habilitado.\n';
            mensaje += 'Ve a Firebase Console y habilita Storage.';
        } else {
            mensaje += 'Detalles: ' + error.message;
        }

        showToast(mensaje);
    }
    } catch(e) {
        showError('Error al guardar la placa.', e);
    }
}

function verPlacaFullscreen(placaId) {
    if (!currentPacienteGaleria) return;

    const placa = currentPacienteGaleria.placas.find(p => p.id === placaId);
    if (!placa) return;

    // Soportar tanto base64 (legacy) como URL (nuevo)
    const imageSrc = placa.imageURL || placa.imagenBase64;

    document.getElementById('fullscreenPlacaImagen').src = imageSrc;
    document.getElementById('fullscreenPlacaTipo').textContent = placa.tipo || 'Radiografía';
    document.getElementById('fullscreenPlacaFecha').textContent = formatDate(placa.fecha);
    document.getElementById('fullscreenPlacaNotas').textContent = placa.notas || 'Sin notas';

    openModal('modalPlacaFullscreen');
}

function editarPlaca(placaId) {
    if (!currentPacienteGaleria) return;

    const placa = currentPacienteGaleria.placas.find(p => p.id === placaId);
    if (!placa) return;

    document.getElementById('editPlacaId').value = placaId;
    document.getElementById('editPlacaTipo').value = placa.tipo || 'Periapical';
    document.getElementById('editPlacaNotas').value = placa.notas || '';

    openModal('modalEditarPlaca');
}

async function guardarEdicionPlaca() {
    try {
    const placaId = document.getElementById('editPlacaId').value;
    const nuevoTipo = document.getElementById('editPlacaTipo').value;
    const nuevasNotas = document.getElementById('editPlacaNotas').value.trim();

    if (!currentPacienteGaleria) return;

    const placa = currentPacienteGaleria.placas.find(p => p.id === placaId);
    if (!placa) return;

    placa.tipo = nuevoTipo;
    placa.notas = nuevasNotas;
    placa.ultimaModificacion = new Date().toISOString();
    placa.modificadoPor = appData.currentUser;

    await savePaciente(currentPacienteGaleria);

    closeModal('modalEditarPlaca');
    renderizarGaleriaPlacas();

    showToast('✓ Placa actualizada');
    } catch(e) {
        showError('Error al guardar los cambios de la placa.', e);
    }
}

async function eliminarPlaca(placaId) {
    try {
    if (!currentPacienteGaleria) return;

    const placa = currentPacienteGaleria.placas.find(p => p.id === placaId);
    if (!placa) return;

    const confirmacion = confirm(`¿Estás seguro de eliminar esta placa?\n\nTipo: ${placa.tipo}\nFecha: ${formatDate(placa.fecha)}\n\nEsta acción no se puede deshacer.`);

    if (!confirmacion) return;

    try {
        // Si la placa está en Storage (tiene storagePath), eliminarla
        if (placa.storagePath) {
            const storageRef = firebase.storage().ref(placa.storagePath);
            await storageRef.delete().catch(err => {
                console.warn('No se pudo eliminar de Storage (puede que ya esté eliminada):', err);
            });
        }

        // Eliminar de Firestore
        currentPacienteGaleria.placas = currentPacienteGaleria.placas.filter(p => p.id !== placaId);

        await savePaciente(currentPacienteGaleria);
        renderizarGaleriaPlacas();

        showToast('✓ Placa eliminada');
    } catch (error) {
        console.error('Error al eliminar placa:', error);
        showToast('❌ Error al eliminar la placa. Intenta de nuevo.', 4000, '#c0392b');
        console.error('[Placas] Error eliminando placa.');
    }
    } catch(e) {
        showError('Error al eliminar la placa.', e);
    }
}

function descargarPlaca() {
    const imagen = document.getElementById('fullscreenPlacaImagen');
    const tipo = document.getElementById('fullscreenPlacaTipo').textContent;
    const fecha = document.getElementById('fullscreenPlacaFecha').textContent;

    const link = document.createElement('a');
    link.href = imagen.src;
    link.download = `Placa_${currentPacienteGaleria.nombre.replace(/\s+/g, '_')}_${tipo}_${fecha.replace(/\//g, '-')}.png`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('✓ Placa descargada');
}

// Asegurar que avanzarEstadoLab esté disponible globalmente
window.avanzarEstadoLab = avanzarEstadoLab;

// ========================================
// SISTEMA DE RECETAS MÉDICAS
// ========================================

let currentPacienteRecetas = null;

function abrirRecetasMedicas(pacienteId) {
    const paciente = appData.pacientes.find(p => p.id === pacienteId);
    if (!paciente) return;

    currentPacienteRecetas = paciente;

    // Inicializar recetas si no existe
    if (!paciente.recetas) {
        paciente.recetas = [];
    }

    document.getElementById('recetasPacienteNombre').textContent = paciente.nombre;
    renderizarRecetas();

    closeModal('modalVerPaciente');
    openModal('modalRecetasMedicas');
}

function renderizarRecetas() {
    if (!currentPacienteRecetas) return;

    const recetas = currentPacienteRecetas.recetas || [];
    const container = document.getElementById('listaRecetas');

    if (recetas.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: #999;">
                <div style="font-size: 64px; margin-bottom: 20px;">💊</div>
                <div style="font-size: 18px; font-weight: 600; margin-bottom: 10px;">Sin recetas médicas</div>
                <div style="font-size: 14px;">Haz click en "Nueva Receta" para crear una</div>
            </div>
        `;
        return;
    }

    // Ordenar por fecha (más reciente primero)
    const recetasOrdenadas = [...recetas].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    container.innerHTML = recetasOrdenadas.map(receta => `
        <div style="background: white; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-left: 4px solid #007AFF;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                <div>
                    <div style="font-size: 16px; font-weight: 700; color: var(--clinic-color, #C4856A); margin-bottom: 4px;">${formatDate(receta.fecha)}</div>
                    <div style="font-size: 13px; color: #666;">${receta.profesional}</div>
                </div>
                <button class="btn btn-secondary" onclick="descargarRecetaPDF('${receta.id}')" style="background: #28a745; color: white; font-size: 12px; padding: 6px 12px;">
                    📄 PDF
                </button>
            </div>

            ${receta.diagnostico ? `
                <div style="background: #f8f9fa; padding: 10px; border-radius: 6px; margin-bottom: 10px;">
                    <div style="font-size: 11px; color: #666; font-weight: 600; margin-bottom: 4px;">DIAGNÓSTICO</div>
                    <div style="font-size: 13px; color: #333;">${receta.diagnostico}</div>
                </div>
            ` : ''}

            <div style="background: #e8f5e9; padding: 10px; border-radius: 6px;">
                <div style="font-size: 11px; color: #2e7d32; font-weight: 600; margin-bottom: 8px;">MEDICAMENTOS</div>
                ${receta.medicamentos.map(med => `
                    <div style="margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid #c8e6c9;">
                        <div style="font-weight: 600; font-size: 13px; color: #1b5e20;">💊 ${med.nombre}</div>
                        <div style="font-size: 12px; color: #666; margin-top: 2px;">${med.dosis} - ${med.frecuencia}</div>
                        ${med.duracion ? `<div style="font-size: 12px; color: #666;">Duración: ${med.duracion}</div>` : ''}
                    </div>
                `).join('')}
            </div>

            ${receta.indicaciones ? `
                <div style="background: #fff3e0; padding: 10px; border-radius: 6px; margin-top: 10px;">
                    <div style="font-size: 11px; color: #e65100; font-weight: 600; margin-bottom: 4px;">INDICACIONES</div>
                    <div style="font-size: 12px; color: #333; line-height: 1.5;">${receta.indicaciones}</div>
                </div>
            ` : ''}
        </div>
    `).join('');
}

function abrirNuevaReceta() {
    // Admin siempre puede crear recetas
    // Recepción y empleados no pueden
    if (appData.currentRole === 'reception') {
        showToast('⛔ Solo profesionales o admin pueden crear recetas', 4000, '#c0392b');
        return;
    }
    if (appData.currentRole !== 'admin') {
        const usuarioActual = appData.personal.find(p => p.nombre === appData.currentUser);
        if (!usuarioActual || usuarioActual.tipo === 'empleado') {
            showToast('⛔ Solo médicos pueden crear recetas', 4000, '#c0392b');
            return;
        }
    }

    // Limpiar formulario
    document.getElementById('recetaDiagnostico').value = '';
    document.getElementById('recetaIndicaciones').value = '';
    medicamentosTemp = [];
    renderizarMedicamentosTemp();

    openModal('modalNuevaReceta');
}

let medicamentosTemp = [];

function agregarMedicamento() {
    const nombre = document.getElementById('medNombre').value.trim();
    const dosis = document.getElementById('medDosis').value.trim();
    const frecuencia = document.getElementById('medFrecuencia').value.trim();
    const duracion = document.getElementById('medDuracion').value.trim();

    if (!nombre || !dosis || !frecuencia) {
        showToast('⚠️ Completa nombre, dosis y frecuencia del medicamento', 3000, '#e65100');
        return;
    }

    medicamentosTemp.push({
        id: generateId('MED-'),
        nombre,
        dosis,
        frecuencia,
        duracion
    });

    // Limpiar campos
    document.getElementById('medNombre').value = '';
    document.getElementById('medDosis').value = '';
    document.getElementById('medFrecuencia').value = '';
    document.getElementById('medDuracion').value = '';

    renderizarMedicamentosTemp();
}

function renderizarMedicamentosTemp() {
    const container = document.getElementById('medicamentosListaTemp');

    if (medicamentosTemp.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #999; font-size: 13px;">No hay medicamentos agregados</div>';
        return;
    }

    container.innerHTML = medicamentosTemp.map(med => `
        <div style="background: #e8f5e9; padding: 10px; border-radius: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: start;">
            <div style="flex: 1;">
                <div style="font-weight: 600; font-size: 14px; color: #1b5e20; margin-bottom: 4px;">💊 ${med.nombre}</div>
                <div style="font-size: 12px; color: #666;">${med.dosis} - ${med.frecuencia}</div>
                ${med.duracion ? `<div style="font-size: 12px; color: #666;">Duración: ${med.duracion}</div>` : ''}
            </div>
            <button class="btn btn-cancel" onclick="eliminarMedicamentoTemp('${med.id}')" style="font-size: 11px; padding: 4px 8px;">
                ✕
            </button>
        </div>
    `).join('');
}

function eliminarMedicamentoTemp(medId) {
    medicamentosTemp = medicamentosTemp.filter(m => m.id !== medId);
    renderizarMedicamentosTemp();
}

async function guardarReceta() {
    try {
    const diagnostico = document.getElementById('recetaDiagnostico').value.trim();
    const indicaciones = document.getElementById('recetaIndicaciones').value.trim();

    if (medicamentosTemp.length === 0) {
        showToast('⚠️ Agrega al menos un medicamento', 3000, '#e65100');
        return;
    }

    const receta = {
        id: generateId('REC-'),
        fecha: new Date().toISOString(),
        profesional: appData.currentUser,
        diagnostico,
        medicamentos: [...medicamentosTemp],
        indicaciones
    };

    if (!currentPacienteRecetas.recetas) {
        currentPacienteRecetas.recetas = [];
    }

    currentPacienteRecetas.recetas.push(receta);

    await savePaciente(currentPacienteRecetas);

    // Re-sync from appData so renderizarRecetas reads the saved state
    const saved = appData.pacientes.find(p => p.id === currentPacienteRecetas.id);
    if (saved) currentPacienteRecetas = saved;

    closeModal('modalNuevaReceta');
    renderizarRecetas();   // list refreshes immediately — no need to close/reopen
    } catch(e) {
        showError('Error al guardar la receta.', e);
    }
}

function descargarRecetaPDF(recetaId) {
    if (!currentPacienteRecetas) return;
    const receta = currentPacienteRecetas.recetas.find(r => r.id === recetaId);
    if (!receta) return;

    const { jsPDF } = window.jspdf;
    // A5 landscape-friendly: A5 = 148 x 210 mm
    const doc = new jsPDF({ format: 'a5', unit: 'mm' });

    const pageWidth  = doc.internal.pageSize.width;   // 148mm
    const pageHeight = doc.internal.pageSize.height;  // 210mm
    const margin = 14;
    const [cr, cg, cb] = _hexToRgb(clinicConfig.color);

    // ── HEADER (clinic color + logo) ──
    let y = _pdfHeader(doc, pageWidth, pageHeight);

    // ── TÍTULO RECETA ──
    doc.setTextColor(cr, cg, cb);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('RECETA MÉDICA', pageWidth / 2, y, { align: 'center' });
    y += 10;

    // ── DATOS DEL PACIENTE ──
    doc.setFillColor(248, 249, 250);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 22, 2, 2, 'F');
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('PACIENTE', margin + 4, y + 7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 28, 26);
    doc.setFontSize(10);
    doc.text(currentPacienteRecetas.nombre, margin + 4, y + 14);
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(formatDate(receta.fecha), pageWidth - margin - 4, y + 14, { align: 'right' });
    y += 28;

    // ── DIAGNÓSTICO ──
    if (receta.diagnostico) {
        doc.setTextColor(cr, cg, cb);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('DIAGNÓSTICO', margin, y);
        y += 6;
        doc.setTextColor(51, 51, 51);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const dLines = doc.splitTextToSize(receta.diagnostico, pageWidth - margin * 2);
        doc.text(dLines, margin, y);
        y += dLines.length * 5 + 6;
    }

    // ── MEDICAMENTOS ──
    doc.setDrawColor(cr, cg, cb);
    doc.setLineWidth(0.4);
    const medBoxH = receta.medicamentos.reduce((h, m) => h + (m.duracion ? 22 : 18), 0) + 14;
    doc.rect(margin, y, pageWidth - margin * 2, medBoxH, 'S');

    doc.setTextColor(cr, cg, cb);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Rp/', margin + 4, y + 9);
    y += 14;

    receta.medicamentos.forEach((med, i) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(30, 28, 26);
        doc.text(`${i + 1}. ${med.nombre}`, margin + 4, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(80, 80, 80);
        doc.text(`   ${med.dosis}  ·  ${med.frecuencia}${med.duracion ? '  ·  ' + med.duracion : ''}`, margin + 4, y);
        y += 8;
    });
    y += 4;

    // ── INDICACIONES ──
    if (receta.indicaciones) {
        y += 4;
        doc.setTextColor(cr, cg, cb);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('INDICACIONES', margin, y);
        y += 6;
        doc.setTextColor(51, 51, 51);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const iLines = doc.splitTextToSize(receta.indicaciones, pageWidth - margin * 2);
        doc.text(iLines, margin, y);
        y += iLines.length * 5;
    }

    // ── FIRMA DEL PROFESIONAL ──
    const firmaY = pageHeight - 35;
    const prof = appData.personal.find(p => p.nombre === receta.profesional);
    const exequatur = prof?.exequatur || '';
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.line(pageWidth / 2 - 25, firmaY, pageWidth / 2 + 25, firmaY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 28, 26);
    doc.text(receta.profesional, pageWidth / 2, firmaY + 5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(exequatur ? `Exequatur: ${exequatur}` : 'Médico tratante', pageWidth / 2, firmaY + 10, { align: 'center' });

    // ── FOOTER ──
    _pdfFooter(doc, pageWidth, pageHeight);

    // Guardar + abrir preview para imprimir
    const nombre = `Receta_${currentPacienteRecetas.nombre.replace(/\s+/g,'_')}_${formatDate(receta.fecha).replace(/\//g,'-')}.pdf`;
    const pdfBlob = doc.output('blob');
    const url = URL.createObjectURL(pdfBlob);

    // Open in new tab for print/download
    const win = window.open(url, '_blank');
    if (win) {
        win.onload = () => win.print();   // trigger print dialog automatically
    } else {
        doc.save(nombre);  // fallback if popup blocked
    }
}

// ========================================
// FUNCIÓN CENTRALIZADA DE BALANCE
// ========================================

// Helper: buscar facturas de un paciente por ID o nombre (compatibilidad hacia atrás)
function getFacturasDePaciente(paciente) {
    const nombreLower = (paciente.nombre || '').toLowerCase();
    return appData.facturas.filter(f =>
        (f.pacienteId && f.pacienteId === paciente.id) ||
        (f.paciente || '').toLowerCase() === nombreLower
    );
}

// Helper: buscar citas de un paciente por ID o nombre
function getCitasDePaciente(paciente) {
    return appData.citas.filter(c =>
        (c.pacienteId && c.pacienteId === paciente.id) ||
        c.paciente === paciente.nombre
    );
}

function calcularBalancePaciente(nombrePaciente) {
    const paciente = appData.pacientes.find(p =>
        (p.nombre || '').toLowerCase() === (nombrePaciente || '').toLowerCase()
    );
    // Always use getFacturasDePaciente when we have the patient object (searches by ID + name)
    // Fallback (patient not in appData yet) uses case-insensitive name match
    const facturasPaciente = paciente
        ? getFacturasDePaciente(paciente)
        : appData.facturas.filter(f =>
            (f.paciente || '').toLowerCase() === (nombrePaciente || '').toLowerCase()
          );

    return facturasPaciente.reduce((sum, f) => {
        const totalPagado = (f.pagos || []).reduce((s, p) => s + p.monto, 0);
        return sum + (f.total - totalPagado);
    }, 0);
}

// ========================================
// SISTEMA DE AUDITORÍA
// ========================================

// Inicializar logs si no existen
if (!appData.auditLogs) {
    appData.auditLogs = [];
}

// Audit logs are queued in memory and flushed on the next natural saveData() call.
// This avoids one saveData() per user action (which is expensive and causes extra snapshots).
function registrarAuditoria(accion, tipo, detalles) {
    const log = {
        id: generateId('LOG-'),
        fecha: new Date().toISOString(),
        usuario: appData.currentUser,
        accion: accion, // 'eliminar', 'modificar', 'acceso'
        tipo: tipo,     // 'paciente', 'factura', 'personal', 'dato_sensible'
        detalles: detalles
    };

    if (!appData.auditLogs) {
        appData.auditLogs = [];
    }

    appData.auditLogs.push(log);
    // Limitar a 500 entradas — evita que el doc de Firebase crezca infinitamente
    if (appData.auditLogs.length > 500) appData.auditLogs = appData.auditLogs.slice(-500);
}

function verAuditoria() {
    if (appData.currentRole !== 'admin') {
        showToast('⛔ Solo administradores pueden ver la auditoría', 3000, '#c0392b');
        return;
    }

    renderizarAuditoria();
    openModal('modalAuditoria');
}

function renderizarAuditoria() {
    const logs = appData.auditLogs || [];
    const container = document.getElementById('listaAuditoria');

    if (logs.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: #999;">
                <div style="font-size: 64px; margin-bottom: 20px;">📋</div>
                <div style="font-size: 18px; font-weight: 600; margin-bottom: 10px;">Sin registros de auditoría</div>
                <div style="font-size: 14px;">Las acciones importantes quedarán registradas aquí</div>
            </div>
        `;
        return;
    }

    // Ordenar por fecha (más reciente primero)
    const logsOrdenados = [...logs].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    // Agrupar por día
    const logsPorDia = {};
    logsOrdenados.forEach(log => {
        const dia = new Date(log.fecha).toLocaleDateString(getLocale(), {year: 'numeric', month: 'long', day: 'numeric'});
        if (!logsPorDia[dia]) {
            logsPorDia[dia] = [];
        }
        logsPorDia[dia].push(log);
    });

    container.innerHTML = Object.entries(logsPorDia).map(([dia, logsDelDia]) => `
        <div style="margin-bottom: 30px;">
            <h3 style="font-size: 16px; color: var(--clinic-color, #C4856A); margin-bottom: 12px; font-weight: 700; border-bottom: 2px solid #e5e5e7; padding-bottom: 8px;">
                ${dia}
            </h3>
            ${logsDelDia.map(log => {
                const icono = {
                    'eliminar': '🗑️',
                    'modificar': '✏️',
                    'acceso': '👁️'
                }[log.accion] || '📝';

                const color = {
                    'eliminar': '#ff3b30',
                    'modificar': '#ff9500',
                    'acceso': '#007AFF'
                }[log.accion] || '#666';

                return `
                    <div style="background: white; border-radius: 8px; padding: 14px; margin-bottom: 10px; box-shadow: 0 1px 4px rgba(0,0,0,0.1); border-left: 4px solid ${color};">
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                            <div style="font-weight: 600; font-size: 14px; color: var(--clinic-color, #C4856A);">
                                ${icono} ${log.accion.toUpperCase()} ${log.tipo}
                            </div>
                            <div style="font-size: 12px; color: #999;">
                                ${new Date(log.fecha).toLocaleTimeString(getLocale(), {hour: '2-digit', minute: '2-digit'})}
                            </div>
                        </div>
                        <div style="font-size: 13px; color: #666; margin-bottom: 6px;">
                            <strong>Usuario:</strong> ${log.usuario}
                        </div>
                        <div style="font-size: 13px; color: #666; background: #f8f9fa; padding: 8px; border-radius: 4px;">
                            ${log.detalles}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `).join('');
}

// ========================================
// FILTROS AVANZADOS
// ========================================

function aplicarFiltrosFacturas() {
    const fechaDesde = document.getElementById('filtroFechaDesde').value;
    const fechaHasta = document.getElementById('filtroFechaHasta').value;
    const estado = document.getElementById('filtroEstadoFactura').value;
    const pacienteBusqueda = document.getElementById('filtroPacienteFactura').value.toLowerCase();

    let facturasFiltradas = appData.facturas;

    // Filtro por fecha
    if (fechaDesde) {
        const desde = new Date(fechaDesde);
        desde.setHours(0, 0, 0, 0);
        facturasFiltradas = facturasFiltradas.filter(f => new Date(f.fecha) >= desde);
    }

    if (fechaHasta) {
        const hasta = new Date(fechaHasta);
        hasta.setHours(23, 59, 59, 999);
        facturasFiltradas = facturasFiltradas.filter(f => new Date(f.fecha) <= hasta);
    }

    // Filtro por estado
    if (estado !== 'todos') {
        facturasFiltradas = facturasFiltradas.filter(f => f.estado === estado);
    }

    // Filtro por paciente
    if (pacienteBusqueda) {
        facturasFiltradas = facturasFiltradas.filter(f =>
            f.paciente.toLowerCase().includes(pacienteBusqueda) ||
            f.numero.toLowerCase().includes(pacienteBusqueda)
        );
    }

    // Renderizar facturas filtradas
    const list = document.getElementById('facturasPendientes');
    if (facturasFiltradas.length === 0) {
        list.innerHTML = '<li style="text-align: center; color: #999;">No hay facturas que coincidan con los filtros</li>';
    } else {
        list.innerHTML = facturasFiltradas.map(f => {
            const balance = f.total - (f.pagos || []).reduce((sum, p) => sum + p.monto, 0);
            const hasComprobante = (f.pagos || []).some(p => p.comprobanteData);
            const hasPagos = (f.pagos || []).length > 0;

            return `
                <li style="cursor: default;">
                    <div class="item-header">
                        <div>
                            <div style="font-size: 12px; color: #8e8e93;">${f.numero} - ${formatDate(f.fecha)}</div>
                            <div class="item-title">${f.paciente}</div>
                            <div style="font-size: 14px; color: ${f.estado === 'pagada' ? '#34c759' : (f.estado === 'parcial' || f.estado === 'partial') ? '#007aff' : '#ff3b30'}; font-weight: 600;">
                                ${f.estado === 'pagada' ? '✅ Pagada' : (f.estado === 'parcial' || f.estado === 'partial') ? `💰 Con Abono: ${formatCurrency(balance)} pendiente` : `Balance: ${formatCurrency(balance)}`}
                            </div>
                            <div style="font-size: 13px; color: #666; margin-top: 4px;">Total: ${formatCurrency(f.total)}</div>
                            ${hasComprobante ? '<div style="font-size: 12px; color: #007aff; margin-top: 4px;">📎 Tiene comprobante</div>' : ''}
                        </div>
                    </div>
                    ${f.estado !== 'pagada' ? `
                        <div style="margin-top: 10px; display: flex; gap: 10px; flex-wrap: wrap;">
                            <button class="btn btn-submit" style="flex: 1; padding: 10px; font-size: 14px; min-width: 120px;" onclick="event.stopPropagation(); openPagarFactura('${f.id}')">
                                💳 Cobrar
                            </button>
                            ${hasComprobante ? `
                                <button class="btn btn-secondary" style="padding: 10px; font-size: 14px;" onclick="event.stopPropagation(); verComprobantesFactura('${f.id}')">
                                    📎 Ver
                                </button>
                            ` : ''}
                            ${hasPagos ? `
                                <button class="btn" style="padding: 10px; font-size: 14px; background: #ff9500; color: white;" onclick="event.stopPropagation(); abrirReversarCobro('${f.id}')">
                                    🔄 Reversar
                                </button>
                            ` : ''}
                            ${appData.currentRole === 'admin' ? `
                                <button class="btn btn-danger" style="padding: 10px; font-size: 14px;" onclick="event.stopPropagation(); eliminarFactura('${f.id}')">
                                    🗑️ Eliminar
                                </button>
                            ` : ''}
                        </div>
                    ` : ''}
                </li>
            `;
        }).join('');
    }

    // Actualizar contador
    const pendientes = facturasFiltradas.filter(f => f.estado !== 'pagada');
    document.getElementById('pendientesCount').textContent = pendientes.length;
}

function limpiarFiltrosFacturas() {
    document.getElementById('filtroFechaDesde').value = '';
    document.getElementById('filtroFechaHasta').value = '';
    document.getElementById('filtroEstadoFactura').value = 'pendiente';
    document.getElementById('filtroPacienteFactura').value = '';
    updateCobrarTab();
}

function aplicarFiltrosCitas(citas) {
    const filtroEstado = document.getElementById('filtroEstadoCita')?.value || 'todos';
    const filtroProfesional = document.getElementById('filtroProfesionalCita')?.value || 'todos';
    const filtroPaciente = document.getElementById('filtroPacienteCita')?.value.toLowerCase() || '';

    let citasFiltradas = citas;

    // Filtro por estado
    if (filtroEstado !== 'todos') {
        citasFiltradas = citasFiltradas.filter(c => (c.estado || 'Pendiente') === filtroEstado);
    }

    // Filtro por profesional
    if (filtroProfesional !== 'todos') {
        citasFiltradas = citasFiltradas.filter(c => c.profesional === filtroProfesional);
    }

    // Filtro por paciente
    if (filtroPaciente) {
        citasFiltradas = citasFiltradas.filter(c => c.paciente.toLowerCase().includes(filtroPaciente));
    }

    return citasFiltradas;
}

function inicializarFiltrosProfesionales() {
    const select = document.getElementById('filtroProfesionalCita');
    if (!select) return;

    const profesionales = appData.personal.filter(p => p.tipo !== 'empleado');

    select.innerHTML = '<option value="todos">Todos</option>';
    profesionales.forEach(p => {
        select.innerHTML += `<option value="${p.nombre}">${p.nombre}</option>`;
    });
}

// ========================================
// EXPORTAR A EXCEL
// ========================================

function exportarFacturasExcel() {
    // Usar librería SheetJS que ya está disponible
    const XLSX = window.XLSX;
    if (!XLSX) {
        showToast('❌ Librería de Excel no disponible', 3000, '#c0392b'); console.error('[Export] XLSX no cargado.');
        return;
    }

    // Obtener facturas filtradas
    const fechaDesde = document.getElementById('filtroFechaDesde').value;
    const fechaHasta = document.getElementById('filtroFechaHasta').value;
    const estado = document.getElementById('filtroEstadoFactura').value;
    const pacienteBusqueda = document.getElementById('filtroPacienteFactura')?.value.toLowerCase() || '';

    let facturas = appData.facturas;

    if (fechaDesde) {
        const desde = new Date(fechaDesde);
        facturas = facturas.filter(f => new Date(f.fecha) >= desde);
    }
    if (fechaHasta) {
        const hasta = new Date(fechaHasta);
        facturas = facturas.filter(f => new Date(f.fecha) <= hasta);
    }
    if (estado !== 'todos') {
        facturas = facturas.filter(f => f.estado === estado);
    }
    if (pacienteBusqueda) {
        facturas = facturas.filter(f =>
            (f.paciente || '').toLowerCase().includes(pacienteBusqueda) ||
            (f.numero || '').toLowerCase().includes(pacienteBusqueda)
        );
    }

    // Preparar datos para Excel
    const datos = facturas.map(f => {
        const totalPagado = (f.pagos || []).reduce((sum, p) => sum + p.monto, 0);
        const balance = f.total - totalPagado;

        return {
            'Número': f.numero,
            'Fecha': formatDateWithTimezone(f.fecha),
            'Paciente': f.paciente,
            'Profesional': f.profesional,
            'Procedimientos': (f.procedimientos || []).map(p => p.descripcion).join(', '),
            'Subtotal': f.subtotal,
            'Descuento %': (f.descuento || 0).toFixed(0),
            'Total': f.total,
            'Pagado': totalPagado,
            'Balance': balance,
            'Estado': f.estado === 'pagada' ? 'Pagada' : (f.estado === 'parcial' || f.estado === 'partial') ? 'Con Abono' : 'Pendiente'
        };
    });

    // Crear hoja de cálculo
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Facturas");

    // Generar archivo
    const nombreArchivo = `Facturas_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, nombreArchivo);

    showToast('✓ Archivo Excel generado');
}

function exportarPacientesCSV() {
    const pacientes = appData.pacientes || [];
    if (pacientes.length === 0) { showToast('⚠️ No hay pacientes para exportar', 3000, '#e65100'); return; }

    const campos = [
        'nombre','cedula','telefono','email','fechaNacimiento','sexo',
        'grupoSanguineo','direccion','alergias','condiciones','seguro',
        'emergenciaNombre','emergenciaTelefono'
    ];
    const encabezado = campos.join(',');

    const filas = pacientes.map(p => campos.map(c => {
        const val = p[c] || '';
        // Escape commas and quotes
        const str = String(val).replace(/"/g, '""');
        return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
    }).join(','));

    const csv = [encabezado, ...filas].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Pacientes_${getNombreClinica()}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    registrarAuditoria('exportar', 'pacientes', `Exportó ${pacientes.length} pacientes en CSV`);
}

function exportarPacientesExcel() {
    const XLSX = window.XLSX;
    if (!XLSX) { showToast('❌ Librería de Excel no disponible', 3000, '#c0392b'); console.error('[Export] XLSX no cargado.'); return; }

    const pacientes = appData.pacientes || [];
    if (pacientes.length === 0) { showToast('⚠️ No hay pacientes para exportar', 3000, '#e65100'); return; }

    const datos = pacientes.map(p => ({
        'Nombre':                p.nombre          || '',
        'Cédula':                p.cedula          || '',
        'Teléfono':              p.telefono        || '',
        'Email':                 p.email           || '',
        'Fecha Nacimiento':      p.fechaNacimiento || '',
        'Sexo':                  p.sexo            || '',
        'Grupo Sanguíneo':       p.grupoSanguineo  || '',
        'Dirección':             p.direccion       || '',
        'Alergias':              p.alergias        || '',
        'Condiciones':           p.condiciones     || '',
        'Seguro':                p.seguro          || '',
        'Contacto Emergencia':   p.emergenciaNombre    || '',
        'Tel. Emergencia':       p.emergenciaTelefono  || '',
        'Fecha Registro':        p.fechaCreacion
            ? new Date(p.fechaCreacion).toLocaleDateString(getLocale()) : '',
    }));

    const ws = XLSX.utils.json_to_sheet(datos);

    // Column widths
    ws['!cols'] = [
        {wch:28},{wch:14},{wch:14},{wch:26},{wch:14},{wch:10},
        {wch:12},{wch:30},{wch:20},{wch:20},{wch:16},{wch:22},{wch:14},{wch:14}
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pacientes');
    XLSX.writeFile(wb, `Pacientes_${getNombreClinica()}_${new Date().toISOString().split('T')[0]}.xlsx`);

    registrarAuditoria('exportar', 'pacientes', `Exportó ${pacientes.length} pacientes en Excel`);
}

function exportarCitasExcel() {
    const XLSX = window.XLSX;
    if (!XLSX) {
        showToast('❌ Librería de Excel no disponible', 3000, '#c0392b'); console.error('[Export] XLSX no cargado.');
        return;
    }

    // Preparar datos
    const datos = appData.citas.map(c => ({
        'Fecha': formatDateWithTimezone(c.fecha),
        'Hora': c.hora,
        'Paciente': c.paciente,
        'Profesional': c.profesional,
        'Consultorio': c.consultorio,
        'Motivo': c.motivo,
        'Estado': c.estado || 'Pendiente',
        'Creado Por': c.creadoPor || '',
        'Tiene Factura': c.facturaId ? 'Sí' : 'No'
    }));

    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Citas");

    const nombreArchivo = `Citas_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, nombreArchivo);

    showToast('✓ Archivo Excel generado');
}

function exportarComisionesExcel() {
    const XLSX = window.XLSX;
    if (!XLSX) {
        showToast('❌ Librería de Excel no disponible', 3000, '#c0392b'); console.error('[Export] XLSX no cargado.');
        return;
    }

    const profesionales = appData.personal.filter(p => p.tipo !== 'empleado');

    const datos = profesionales.map(p => {
        const comisionRate = getComisionRate(p.tipo, p);
        const comisionesAcum = calcularComisionesAcumuladas(p);

        return {
            'Nombre': p.nombre,
            'Tipo': getTipoLabel(p.tipo),
            'Tasa Comisión %': comisionRate,
            'Comisiones Acumuladas': comisionesAcum,
            'Último Pago': p.lastPaymentDate ? formatDateWithTimezone(p.lastPaymentDate) : 'Nunca'
        };
    });

    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Comisiones");

    const nombreArchivo = `Comisiones_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, nombreArchivo);

    showToast('✓ Archivo Excel generado');
}

function exportarCuadreExcel() {
    const XLSX = window.XLSX;
    if (!XLSX) {
        showToast('❌ Librería de Excel no disponible', 3000, '#c0392b'); console.error('[Export] XLSX no cargado.');
        return;
    }

    const cuadres = Object.entries(appData.cuadresDiarios || {}).map(([timestamp, cuadre]) => ({
        'Fecha': formatDateWithTimezone(cuadre.fecha),
        'Efectivo Inicial': cuadre.efectivoInicial || 0,
        'Efectivo': cuadre.efectivo,
        'Tarjeta': cuadre.tarjeta,
        'Transferencia': cuadre.transferencia,
        'Total Ingresos': cuadre.totalIngresos,
        'Gastos': cuadre.gastos,
        'Gastos en Efectivo': cuadre.gastosEfectivo,
        'Balance': cuadre.balance,
        'Efectivo en Caja': cuadre.efectivoCaja
    })).sort((a, b) => new Date(b.Fecha) - new Date(a.Fecha));

    const ws = XLSX.utils.json_to_sheet(cuadres);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cuadre de Caja");

    const nombreArchivo = `Cuadre_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, nombreArchivo);

    showToast('✓ Archivo Excel generado');
}

// ========================================
// ZONA HORARIA
// ========================================

async function guardarZonaHoraria() {
    const timezone = document.getElementById('timezoneSelect').value;
    if (!appData.settings) appData.settings = {};
    const tzAnterior = appData.settings.timezone;
    appData.settings.timezone = timezone;
    try {
        await saveData();
        showToast('✓ Zona horaria actualizada');
    } catch(e) {
        appData.settings.timezone = tzAnterior; // rollback
        showError('Error al guardar la zona horaria.', e);
    }
}

function getTimezone() {
    return (appData.settings && appData.settings.timezone) || 'America/Santo_Domingo';
}

function getNombreClinica() {
    // clinicConfig.nombre is set by onboarding and loadClinicBranding — the authoritative source
    return clinicConfig.nombre || (appData.settings && appData.settings.nombreClinica) || 'Clínica Dental';
}

function getNombreAdmin() {
    // Buscar el admin real en personal
    const admin = appData.personal.find(p => p.isAdmin);
    return admin ? admin.nombre : (appData.settings && appData.settings.nombreAdmin) || 'Administrador';
}

// Formatear fecha con zona horaria configurada
function formatDateWithTimezone(dateString) {
    if (!dateString) return '';

    try {
        const date = new Date(dateString);
        const timezone = getTimezone();

        return date.toLocaleDateString(getLocale(), {
            timeZone: timezone,
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch (e) {
        return formatDate(dateString); // Fallback
    }
}

function formatDateTimeWithTimezone(dateString) {
    if (!dateString) return '';

    try {
        const date = new Date(dateString);
        const timezone = getTimezone();

        return date.toLocaleString(getLocale(), {
            timeZone: timezone,
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return formatDate(dateString); // Fallback
    }
}

// ========================================
// DASHBOARD
// ========================================


// ═══════════════════════════════════════════════
// FRASES MOTIVACIONALES
// ═══════════════════════════════════════════════
const FRASES = [
    "Hoy tiene todo para ser un buen día.",
    "Un paso a la vez. Siempre hacia adelante.",
    "Lo que haces importa más de lo que crees.",
    "Hoy es tuyo.",
    "Las cosas buenas toman tiempo. Tú lo sabes.",
    "Presencia total. Hoy aquí.",
    "Cada día es una oportunidad disfrazada.",
    "Confía en el proceso.",
    "Despacio y con buena letra.",
    "Lo difícil de hoy, mañana ya es historia.",
    "Tú eliges cómo empieza este día.",
    "Pequeños gestos, grandes impactos.",
    "Hay belleza en lo ordinario. Búscala.",
    "Haz bien lo de hoy. El resto se acomoda.",
    "El esfuerzo de hoy es el orgullo de mañana.",
    "No hay atajos para los lugares que valen la pena.",
    "Respira. Lo estás haciendo bien.",
    "Las mejores historias las escriben quienes no se rinden.",
    "Cada mañana es una página en blanco. Escribe algo bueno.",
    "Lo ordinario, hecho con amor, se vuelve extraordinario.",
    "El secreto es empezar.",
    "Sé la energía que quieres recibir.",
    "Hoy puede pasar algo bueno. Déjalo.",
    "Mente clara, día despejado.",
    "No tienes que ser perfecto para ser suficiente.",
    "Las personas que cambian el mundo empiezan por su entorno más cercano.",
    "Hoy también cuenta.",
    "La constancia es silenciosa pero poderosa.",
    "Date el crédito que mereces.",
    "Cada detalle que cuidas, suma.",
    "Hoy es un buen día para ser amable contigo mismo.",
    "Lo que siembras hoy, lo recoges después.",
    "Tranquilidad no es ausencia de caos, es saber manejarlo.",
    "El mejor momento para empezar fue ayer. El segundo mejor es ahora.",
    "Un día bien vivido trae buen sueño.",
    "La gratitud convierte lo que tenemos en suficiente.",
    "Hoy puedes hacer que alguien se sienta bien.",
    "No todo tiene que ser urgente. Algunas cosas solo necesitan tiempo.",
    "Eres más resiliente de lo que piensas.",
    "Las raíces fuertes aguantan los vientos más duros.",
    "Confía en tu instinto. Ha llegado hasta aquí.",
    "Pequeñas victorias también son victorias.",
    "Lo mejor está por venir, y llega cuando menos lo esperas.",
    "Estar presente es el regalo más raro que puedes dar.",
    "Hoy, un poco mejor que ayer. Eso es suficiente.",
    "La paciencia no es esperar, es mantener una buena actitud mientras esperas.",
    "Cada persona que sonríe por ti hoy, es porque te lo ganaste.",
    "Tienes más energía de la que crees. Solo empieza.",
    "El caos de hoy es la historia divertida de mañana.",
    "Haz lo que puedas, con lo que tienes, donde estás.",
];

function getFrase() {
    const today = new Date();
    const seed = today.getFullYear() * 10000 + (today.getMonth()+1) * 100 + today.getDate();
    return FRASES[seed % FRASES.length];
}

function getSaludo() {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
}

function updateDashboardTab() {
    const todayKey     = getTodayKey();
    const yesterdayKey = getYesterdayKey();

    // Fecha + saludo + frase motivacional
    const fechaStr = new Date().toLocaleDateString(getLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
    const nombre = appData.currentUser === 'admin' ? getNombreAdmin() : appData.currentUser;
    const nombreCorto = nombre ? nombre.split(' ')[0] : '';
    const fraseDia = getFrase();
    const saludoDia = getSaludo();
    const fechaEl = document.getElementById('dashboardFecha');
    if (fechaEl) {
        const logoWatermark = clinicConfig._logoSrc
            ? `<img src="${clinicConfig._logoSrc}" alt="" style="
                position:absolute;right:0;top:50%;transform:translateY(-50%);
                height:56px;width:auto;object-fit:contain;
                opacity:0.08;pointer-events:none;filter:grayscale(1);"
                onerror="this.style.display='none'">`
            : '';
        fechaEl.style.position = 'relative';
        fechaEl.style.overflow = 'hidden';
        fechaEl.innerHTML = `
            ${logoWatermark}
            <div style="font-size:22px;font-weight:200;color:var(--dark);letter-spacing:-0.5px;margin-bottom:2px">
                ${saludoDia}${nombreCorto ? `, ${nombreCorto}` : ''}.
            </div>
            <div style="font-size:12px;color:var(--light);margin-bottom:8px;text-transform:capitalize">${fechaStr}</div>
            <div style="font-size:14px;color:var(--mid);font-style:italic;font-weight:300;line-height:1.5">"${fraseDia}"</div>
        `;
    }

    // Quick action shortcuts (admin + profesional)
    const dashRole = appData.currentRole;

    // Adapt the 3rd stat card label/color for professional vs admin
    const porCobrarCard = document.querySelector('#tab-dashboard .dash-stat:nth-child(3)');
    if (porCobrarCard) {
        const labelEl = porCobrarCard.querySelector('div:first-child');
        if (labelEl) labelEl.textContent = dashRole === 'professional' ? 'Mis Comisiones' : 'Por Cobrar';
        porCobrarCard.style.background = dashRole === 'professional'
            ? 'linear-gradient(135deg, #7B8FA1 0%, #5A7080 100%)'
            : 'linear-gradient(135deg, #C4856A 0%, #A06448 100%)';
    }

    if (dashRole === 'admin' || dashRole === 'professional') {
        let shortEl = document.getElementById('dashShortcuts');
        if (!shortEl) {
            shortEl = document.createElement('div');
            shortEl.id = 'dashShortcuts';
            shortEl.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;margin-top:16px';
            const statsGrid = document.querySelector('#tab-dashboard > div:nth-child(2)');
            if (statsGrid) statsGrid.insertAdjacentElement('beforebegin', shortEl);
        }
        shortEl.innerHTML = `
            <button onclick="showTab('cobros');setTimeout(()=>setCobrosSubtab('nueva'),50)" style="
                padding:14px 16px;background:var(--clinic-color);color:white;border:none;
                border-radius:var(--radius-md);font-size:12px;letter-spacing:1px;text-transform:uppercase;
                font-family:inherit;cursor:pointer;display:flex;align-items:center;gap:8px;justify-content:center;
                box-shadow:0 4px 12px rgba(0,0,0,0.12);transition:opacity 0.2s"
                onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
                <span style="font-size:18px;line-height:1">+</span> Nueva factura
            </button>
            <button onclick="showTab('cobros');setTimeout(()=>setCobrosSubtab('cobrar'),50)" style="
                padding:14px 16px;background:var(--white);color:var(--dark);
                border:1.5px solid rgba(30,28,26,0.1);border-radius:var(--radius-md);
                font-size:12px;letter-spacing:1px;text-transform:uppercase;
                font-family:inherit;cursor:pointer;display:flex;align-items:center;gap:8px;justify-content:center;
                transition:opacity 0.2s"
                onmouseover="this.style.opacity='.7'" onmouseout="this.style.opacity='1'">
                💳 Cobrar
            </button>
        `;
    }

    // Hacer stat cards clicables → navegan a su módulo
    const statCards = document.querySelectorAll('#tab-dashboard .dash-stat');
    const statNavs = ['cobros', 'agenda', 'cobros', 'laboratorio'];
    statCards.forEach((card, i) => {
        card.style.cursor = 'pointer';
        card.style.transition = (card.style.transition || '') + ', transform 0.15s, box-shadow 0.15s';
        card.onclick = () => showTab(statNavs[i]);
        card.onmouseenter = () => { card.style.transform = 'translateY(-2px)'; card.style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)'; };
        card.onmouseleave = () => { card.style.transform = ''; card.style.boxShadow = ''; };
    });

    // INGRESOS HOY
    const pagosHoy = appData.facturas
        .flatMap(f => f.pagos || [])
        .filter(p => p && isSameDayTZ(p.fecha, todayKey));
    const ingresosHoy = pagosHoy.reduce((sum, p) => sum + p.monto, 0);

    // Comparación con ayer
    const pagosAyer = appData.facturas
        .flatMap(f => f.pagos || [])
        .filter(p => p && isSameDayTZ(p.fecha, yesterdayKey));
    const ingresosAyer = pagosAyer.reduce((sum, p) => sum + p.monto, 0);

    document.getElementById('dashIngresosHoy').textContent = formatCurrency(ingresosHoy);
    if (ingresosAyer > 0) {
        const cambio = ((ingresosHoy - ingresosAyer) / ingresosAyer * 100).toFixed(0);
        const icono = cambio >= 0 ? '↑' : '↓';
        const color = cambio >= 0 ? '#fff' : '#ffcccc';
        document.getElementById('dashIngresosComparacion').innerHTML =
            `<span style="color: ${color}">${icono} ${Math.abs(cambio)}% vs ayer</span>`;
    } else {
        document.getElementById('dashIngresosComparacion').textContent = 'Primer día con ingresos';
    }

    // CITAS HOY
    const citasHoy = appData.citas.filter(c => isSameDayTZ(c.fecha, todayKey));
    const citasPendientes = citasHoy.filter(c =>
        c.estado === 'Pendiente' || c.estado === 'Confirmada'
    ).length;

    document.getElementById('dashCitasHoy').textContent = citasHoy.length;
    document.getElementById('dashCitasPendientes').textContent =
        citasPendientes > 0 ? `${citasPendientes} pendientes` : 'Todas completadas';

    // facturasPendientes siempre disponible — se usa también en el bloque de alertas
    const facturasPendientes = appData.facturas.filter(f => f.estado !== 'pagada');

    // POR COBRAR (admin/recepción) / MIS COMISIONES (profesional)
    if (dashRole === 'professional') {
        const person = appData.personal.find(p => p.nombre === appData.currentUser);
        if (person) {
            const comisionRate   = getComisionRate(person.tipo, person);
            const comisionesAcum = calcularComisionesAcumuladas(person);
            const avances        = calcularTotalAvances(person.id);
            const neto           = Math.max(0, comisionesAcum - avances);

            document.getElementById('dashPorCobrar').textContent = formatCurrency(comisionesAcum);
            document.getElementById('dashFacturasPendientes').textContent =
                avances > 0
                    ? `Neto ${formatCurrency(neto)} · ${comisionRate}%`
                    : `${comisionRate}% comisión`;
        }
    } else {
        const porCobrar = facturasPendientes.reduce((sum, f) => {
            const pagado = (f.pagos || []).reduce((s, p) => s + p.monto, 0);
            return sum + (f.total - pagado);
        }, 0);

        document.getElementById('dashPorCobrar').textContent = formatCurrency(porCobrar);
        document.getElementById('dashFacturasPendientes').textContent =
            `${facturasPendientes.length} factura${facturasPendientes.length !== 1 ? 's' : ''}`;
    }

    // LABORATORIO ACTIVO
    const labActivo = (appData.laboratorios || []).filter(o =>
        o.estadoActual !== 'Entregado'
    );
    const labPendiente = labActivo.filter(o =>
        o.estadoActual === 'Toma de impresión' || o.estadoActual === 'Enviado a laboratorio'
    ).length;

    // Mostrar u ocultar stat card de lab según módulo activo
    const labCard = document.querySelector('#tab-dashboard .dash-stat:nth-child(4)');
    if (labCard) labCard.style.display = hasModule('laboratorio') ? '' : 'none';
    document.getElementById('dashLabActivo').textContent = labActivo.length;
    document.getElementById('dashLabPendiente').textContent =
        labPendiente > 0 ? `${labPendiente} pendientes` : 'Todos en proceso';

    // ALERTAS
    const alertas = [];

    // Facturas viejas
    const hace30Dias = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const facturasViejas = facturasPendientes.filter(f =>
        new Date(f.fecha).getTime() < hace30Dias
    );
    if (facturasViejas.length > 0) {
        alertas.push(`${facturasViejas.length} factura${facturasViejas.length !== 1 ? 's' : ''} pendiente${facturasViejas.length !== 1 ? 's' : ''} de más de 30 días`);
    }

    // Pacientes sin consentimiento (solo admin — es quien puede gestionarlo globalmente)
    if (dashRole === 'admin') {
        const pacientesSinConsentimiento = appData.pacientes.filter(p =>
            !p.consentimiento || !p.consentimiento.firmado
        );
        if (pacientesSinConsentimiento.length > 0 && pacientesSinConsentimiento.length <= 10) {
            alertas.push(`${pacientesSinConsentimiento.length} paciente${pacientesSinConsentimiento.length !== 1 ? 's' : ''} sin consentimiento firmado`);
        }
    }

    // Próxima cita (en 1 hora)
    const enUnaHora = Date.now() + (60 * 60 * 1000);
    const citaProxima = appData.citas.find(c => {
        const fechaCita = new Date(c.fecha).getTime();
        return fechaCita > Date.now() && fechaCita <= enUnaHora &&
               (c.estado === 'Pendiente' || c.estado === 'Confirmada');
    });
    if (citaProxima) {
        const hora = new Date(citaProxima.fecha).toLocaleTimeString(getLocale(), {hour: '2-digit', minute: '2-digit'});
        alertas.push(`Próxima cita ${hora}: ${citaProxima.paciente} (${citaProxima.estado})`);
    }

    // Mostrar alertas
    const alertasContainer = document.getElementById('dashboardAlertas');
    if (alertas.length > 0) {
        alertasContainer.style.display = 'block';
        document.getElementById('dashAlertasList').innerHTML = alertas.map(a => `<li>${a}</li>`).join('');
    } else {
        alertasContainer.style.display = 'none';
    }

    // AGENDA HOY
    const agendaHoy = citasHoy
        .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
        .slice(0, 5); // Mostrar solo primeras 5

    if (agendaHoy.length === 0) {
        document.getElementById('dashAgendaHoy').innerHTML =
            '<div style="text-align: center; padding: 40px; color: #999;">No hay citas programadas para hoy</div>';
    } else {
        document.getElementById('dashAgendaHoy').innerHTML = agendaHoy.map(c => {
            const hora = new Date(c.fecha).toLocaleTimeString(getLocale(), {hour: '2-digit', minute: '2-digit'});
            const color = getColorEstadoCita(c.estado);
            const icono = getIconoEstadoCita(c.estado);

            return `
                <div onclick="verDetalleCita('${c.id}')" style="display:flex;align-items:center;padding:12px;margin-bottom:8px;
                    background:var(--surface);border-radius:10px;border-left:4px solid ${color};
                    cursor:pointer;transition:background 0.15s"
                    onmouseenter="this.style.background='var(--bg)'"
                    onmouseleave="this.style.background='var(--surface)'">
                    <div style="flex:1;">
                        <div style="font-weight:500;font-size:14px;color:var(--dark)">${hora} · ${c.paciente}</div>
                        <div style="font-size:12px;color:var(--mid);margin-top:3px">${c.motivo || 'Sin motivo'} · ${c.profesional}</div>
                    </div>
                    <div style="background:${color};color:white;padding:5px 11px;border-radius:100px;font-size:11px;font-weight:600;flex-shrink:0">
                        ${icono} ${c.estado}
                    </div>
                </div>
            `;
        }).join('');

        if (citasHoy.length > 5) {
            document.getElementById('dashAgendaHoy').innerHTML +=
                `<div style="text-align: center; padding: 10px; color: #666;">
                    Y ${citasHoy.length - 5} cita${citasHoy.length - 5 !== 1 ? 's' : ''} más...
                </div>`;
        }
    }
}

// ========================================
// CONFIRMACIONES INTELIGENTES
// ========================================

let accionConfirmacion = null;

// ── Modal genérico dinámico ──────────────────────────────
// Usado por módulos como Inventario y Sedes para formularios.
// Crea el modal en el DOM, lo muestra, y lo destruye al cerrar.
let _modalOnConfirm = null;

function mostrarModal({ titulo, body, confirmText = 'Confirmar', onConfirm, hideConfirm = false }) {
    // Eliminar modal previo si existe
    const prev = document.getElementById('genericModal');
    if (prev) prev.remove();

    _modalOnConfirm = onConfirm || null;

    const overlay = document.createElement('div');
    overlay.id = 'genericModal';
    overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:3000;
        display:flex;align-items:flex-end;justify-content:center;
        animation:fadeIn 0.2s ease;
    `;
    overlay.innerHTML = `
        <div id="genericModalSheet" style="
            background:var(--white,#FDFCFB);border-radius:24px 24px 0 0;
            width:100%;max-width:560px;max-height:92vh;overflow-y:auto;
            padding:0 0 calc(env(safe-area-inset-bottom) + 16px);
            animation:slideUp 0.3s cubic-bezier(0.34,1.1,0.64,1);
        ">
            <div style="position:sticky;top:0;background:var(--white,#FDFCFB);z-index:1;
                        padding:20px 24px 16px;border-bottom:1px solid rgba(30,28,26,0.07)">
                <div style="width:36px;height:4px;background:rgba(30,28,26,0.12);
                            border-radius:100px;margin:0 auto 16px"></div>
                <div style="font-size:17px;font-weight:400;color:var(--dark,#1E1C1A)">${titulo}</div>
            </div>
            <div style="padding:20px 24px" id="genericModalBody">
                ${body}
            </div>
            ${!hideConfirm ? `
            <div style="padding:0 24px;display:flex;gap:10px">
                <button onclick="cerrarModal()" style="
                    flex:1;padding:14px;background:none;
                    border:1.5px solid rgba(30,28,26,0.12);border-radius:100px;
                    font-size:14px;font-family:inherit;color:var(--mid,#9C9189);cursor:pointer">
                    Cancelar
                </button>
                <button id="genericModalConfirmBtn" onclick="_ejecutarModal()" style="
                    flex:2;padding:14px;background:var(--dark,#1E1C1A);color:white;
                    border:none;border-radius:100px;
                    font-size:14px;font-family:inherit;cursor:pointer">
                    ${confirmText}
                </button>
            </div>` : ''}
        </div>
    `;

    // Cerrar al tocar el overlay (fuera del sheet)
    overlay.addEventListener('click', e => {
        if (e.target === overlay) cerrarModal();
    });

    document.body.appendChild(overlay);
}

function cerrarModal() {
    const el = document.getElementById('genericModal');
    if (el) {
        el.style.animation = 'fadeOut 0.15s ease forwards';
        setTimeout(() => el.remove(), 150);
    }
    _modalOnConfirm = null;
}

function _ejecutarModal() {
    if (_modalOnConfirm) {
        _modalOnConfirm();
    }
}

function mostrarConfirmacion(opciones) {
    const {
        titulo,
        mensaje,
        tipo = 'normal', // 'peligro', 'advertencia', 'normal'
        confirmText = 'Confirmar',
        onConfirm
    } = opciones;

    // Configurar modal
    document.getElementById('confirmacionTitulo').textContent = titulo;
    document.getElementById('confirmacionMensaje').innerHTML = mensaje;

    const btn = document.getElementById('confirmacionBtnConfirmar');
    btn.textContent = confirmText;

    // Estilos según tipo
    const header = document.getElementById('confirmacionHeader');
    if (tipo === 'peligro') {
        btn.className = 'btn btn-danger';
        header.style.background = 'linear-gradient(135deg, #ff3b30 0%, #dc143c 100%)';
    } else if (tipo === 'advertencia') {
        btn.className = 'btn' ;
        btn.style.background = '#ff9500';
        btn.style.color = 'white';
        header.style.background = 'linear-gradient(135deg, #ff9500 0%, #ff6b00 100%)';
    } else {
        btn.className = 'btn btn-submit';
        header.style.background = 'linear-gradient(135deg, #007aff 0%, #0051d5 100%)';
    }

    // Guardar acción
    accionConfirmacion = onConfirm;

    openModal('modalConfirmacion');
}

function ejecutarConfirmacion() {
    if (accionConfirmacion) {
        accionConfirmacion();
    }
    cerrarConfirmacion();
}

function cerrarConfirmacion() {
    closeModal('modalConfirmacion');
    accionConfirmacion = null;
}

// ========================================
// BÚSQUEDA GLOBAL
// ========================================

function buscarGlobal() {
    const input = document.getElementById('busquedaGlobal');
    const query = input.value.toLowerCase().trim();
    const resultados = document.getElementById('resultadosBusqueda');

    if (query.length < 2) {
        resultados.style.display = 'none';
        return;
    }

    let html = '';
    let totalResultados = 0;

    // BUSCAR PACIENTES
    const pacientes = appData.pacientes.filter(p =>
        p.nombre.toLowerCase().includes(query) ||
        (p.cedula && p.cedula.includes(query)) ||
        (p.telefono && p.telefono.includes(query))
    ).slice(0, 5);

    if (pacientes.length > 0) {
        html += `
            <div style="padding: 12px 16px; background: #f8f9fa; border-bottom: 1px solid #e5e5e7; font-weight: 600; font-size: 13px; color: #666;">
                PACIENTES (${pacientes.length})
            </div>
        `;
        pacientes.forEach(p => {
            html += `
                <div onclick="irAPaciente('${p.id}')" style="padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f0f0f0; transition: background 0.2s;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='white'">
                    <div style="font-weight: 600; font-size: 14px; color: var(--clinic-color, #C4856A); margin-bottom: 4px;">
                        ${p.nombre}
                    </div>
                    <div style="font-size: 12px; color: #666;">
                        ${p.cedula ? `📋 ${p.cedula}` : ''} ${p.telefono ? `📱 ${p.telefono}` : ''}
                    </div>
                </div>
            `;
        });
        totalResultados += pacientes.length;
    }

    // BUSCAR FACTURAS
    const facturas = appData.facturas.filter(f =>
        f.numero.toLowerCase().includes(query) ||
        f.paciente.toLowerCase().includes(query)
    ).slice(0, 5);

    if (facturas.length > 0) {
        html += `
            <div style="padding: 12px 16px; background: #f8f9fa; border-bottom: 1px solid #e5e5e7; font-weight: 600; font-size: 13px; color: #666;">
                FACTURAS (${facturas.length})
            </div>
        `;
        facturas.forEach(f => {
            const color = f.estado === 'pagada' ? '#34c759' : f.estado === 'partial' ? '#007aff' : '#ff9500';
            const estadoLabel = f.estado === 'pagada' ? 'Pagada' : f.estado === 'partial' ? 'Con Abono' : 'Pendiente';

            html += `
                <div onclick="irAFactura('${f.id}')" style="padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f0f0f0; transition: background 0.2s;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='white'">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <div style="font-weight: 600; font-size: 14px; color: var(--clinic-color, #C4856A);">
                            ${f.numero} • ${f.paciente}
                        </div>
                        <div style="background: ${color}; color: white; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">
                            ${estadoLabel}
                        </div>
                    </div>
                    <div style="font-size: 12px; color: #666;">
                        ${formatCurrency(f.total)} • ${new Date(f.fecha).toLocaleDateString(getLocale())}
                    </div>
                </div>
            `;
        });
        totalResultados += facturas.length;
    }

    // BUSCAR CITAS
    const citas = appData.citas.filter(c =>
        c.paciente.toLowerCase().includes(query) ||
        c.profesional.toLowerCase().includes(query)
    ).slice(0, 5);

    if (citas.length > 0) {
        html += `
            <div style="padding: 12px 16px; background: #f8f9fa; border-bottom: 1px solid #e5e5e7; font-weight: 600; font-size: 13px; color: #666;">
                CITAS (${citas.length})
            </div>
        `;
        citas.forEach(c => {
            const todayKeySearch = getTodayKey();
            const citaKey = new Intl.DateTimeFormat('en-CA', {
                timeZone: getTimezone(), year: 'numeric', month: '2-digit', day: '2-digit'
            }).format(new Date(c.fecha));
            const esPasada = citaKey < todayKeySearch;
            const color = getColorEstadoCita(c.estado);
            const fechaCita = new Date(c.fecha);

            html += `
                <div onclick="irACita('${c.id}')" style="padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f0f0f0; transition: background 0.2s; ${esPasada ? 'opacity: 0.6;' : ''}" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='white'">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <div style="font-weight: 600; font-size: 14px; color: var(--clinic-color, #C4856A);">
                            ${fechaCita.toLocaleDateString(getLocale())} ${fechaCita.toLocaleTimeString(getLocale(), {hour: '2-digit', minute: '2-digit'})}
                        </div>
                        <div style="background: ${color}; color: white; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">
                            ${c.estado}
                        </div>
                    </div>
                    <div style="font-size: 12px; color: #666;">
                        ${c.paciente} • ${c.motivo}
                    </div>
                </div>
            `;
        });
        totalResultados += citas.length;
    }

    // SIN RESULTADOS
    if (totalResultados === 0) {
        html = `
            <div style="padding: 40px; text-align: center; color: #999;">
                <div style="font-size: 48px; margin-bottom: 12px;">🔍</div>
                <div style="font-size: 14px;">No se encontraron resultados para "${query}"</div>
            </div>
        `;
    }

    resultados.innerHTML = html;
    resultados.style.display = 'block';
}

// Navegación desde búsqueda
function irAPaciente(id) {
    document.getElementById('busquedaGlobal').value = '';
    document.getElementById('resultadosBusqueda').style.display = 'none';
    showTab('pacientes');
    setTimeout(() => verPaciente(id), 100);
}

function irAFactura(id) {
    document.getElementById('busquedaGlobal').value = '';
    document.getElementById('resultadosBusqueda').style.display = 'none';
    const factura = appData.facturas.find(f => f.id === id);
    if (factura && factura.estado !== 'pagada') {
        showTab('cobros');
        setTimeout(() => openPagarFactura(id), 100);
    } else {
        showTab('ingresos');
        showToast(`Factura ${factura.numero} ya está pagada`, 4000, '#e65100');
    }
}

function irACita(id) {
    document.getElementById('busquedaGlobal').value = '';
    document.getElementById('resultadosBusqueda').style.display = 'none';
    showTab('agenda');
    setTimeout(() => {
        const cita = appData.citas.find(c => c.id === id);
        if (cita) verDetalleCita(cita.id);
    }, 100);
}

// Cerrar búsqueda al hacer click fuera
document.addEventListener('click', function(e) {
    const busqueda = document.getElementById('busquedaGlobal');
    const resultados = document.getElementById('resultadosBusqueda');
    if (busqueda && resultados && !busqueda.contains(e.target) && !resultados.contains(e.target)) {
        resultados.style.display = 'none';
    }
});

// ========================================
// IMPORTAR PACIENTES DESDE CSV
// ========================================

let csvData = null;
let csvHeaders = [];

function procesarCSV() {
    const fileInput = document.getElementById('csvFileInput');
    const file = fileInput.files[0];

    if (!file) {
        showToast('⚠️ Selecciona un archivo CSV primero', 3000, '#e65100');
        return;
    }

    if (!file.name.endsWith('.csv')) {
        showToast('⚠️ El archivo debe ser un CSV (.csv)', 3000, '#e65100');
        return;
    }

    // Mostrar nombre del archivo seleccionado
    const archivoDiv = document.getElementById('archivoSeleccionado');
    const nombreSpan = document.getElementById('nombreArchivo');
    if (archivoDiv && nombreSpan) {
        nombreSpan.textContent = file.name;
        archivoDiv.style.display = 'block';
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        parsearCSV(text);
    };
    reader.onerror = function() {
        showToast('❌ Error al leer el archivo', 4000, '#c0392b');
        console.error('[CSV] Error en FileReader.');
    };
    reader.readAsText(file);
}

function parsearCSV(text) {
    // Parsear CSV simple (maneja comas y saltos de línea)
    const lines = text.split('\n').filter(line => line.trim());

    if (lines.length < 1) {
        showToast('⚠️ El archivo CSV está vacío', 3000, '#e65100');
        return;
    }

    // Detectar si tiene headers (primera línea contiene texto descriptivo en minúsculas)
    const primeraLinea = lines[0].toLowerCase();
    const tieneHeaders = primeraLinea.includes('nombre') ||
                        primeraLinea.includes('apellido') ||
                        primeraLinea.includes('paciente') ||
                        primeraLinea.includes('telefono') ||
                        primeraLinea.includes('cedula');

    let startIndex = 0;

    if (tieneHeaders) {
        // CSV normal con headers
        csvHeaders = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        startIndex = 1;
    } else {
        // CSV sin headers (como el de Hessy)
        // Detectar formato automáticamente
        const primeraFila = lines[0].split(',').map(v => v.trim().replace(/"/g, ''));

        if (primeraFila.length >= 10) {
            // Formato Hessy: Apellido, Nombre, Sexo, ?, Fecha1, Fecha2, Dirección, ?, Tel1, Tel2
            csvHeaders = ['Apellido', 'Nombre', 'Sexo', 'Col4', 'Fecha1', 'Fecha2', 'Dirección', 'Col8', 'Teléfono1', 'Teléfono2'];
        } else {
            // Asignar headers genéricos
            csvHeaders = primeraFila.map((_, i) => `Columna${i + 1}`);
        }
        startIndex = 0;
    }

    // Parsear datos
    csvData = [];
    for (let i = startIndex; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const row = {};
        csvHeaders.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        csvData.push(row);
    }

    // Mostrar advertencia si es formato Hessy
    if (!tieneHeaders && csvData.length > 100) {
        showToast(`✓ CSV detectado: ${csvData.length} filas cargadas`);
    /* REMOVIDO: alert con detalles — ver consola si se necesita info */
    void (
              `ℹ️ Formato detectado: Apellido + Nombre separados\n` +
              `Se combinarán automáticamente como "Nombre Apellido"`);
    }

    mostrarMapeoColumnas();
}

function mostrarMapeoColumnas() {
    document.getElementById('paso2-mapeo').style.display = 'block';

    const camposApp = [
        { key: 'nombre', label: 'Nombre *', required: true },
        { key: 'telefono', label: 'Teléfono *', required: true },
        { key: 'cedula', label: 'Cédula' },
        { key: 'email', label: 'Email' },
        { key: 'fechaNacimiento', label: 'Fecha de Nacimiento' },
        { key: 'sexo', label: 'Sexo (M/F)' },
        { key: 'grupoSanguineo', label: 'Grupo Sanguíneo' },
        { key: 'direccion', label: 'Dirección' },
        { key: 'alergias', label: 'Alergias' },
        { key: 'condicionesMedicas', label: 'Condiciones Médicas' },
        { key: 'seguroMedico', label: 'Seguro Médico' },
        { key: 'contactoEmergenciaNombre', label: 'Contacto Emergencia - Nombre' },
        { key: 'contactoEmergenciaTelefono', label: 'Contacto Emergencia - Teléfono' }
    ];

    let html = '';

    // Banner explicativo si hay Apellido y Nombre separados
    if (csvHeaders.includes('Apellido') && csvHeaders.includes('Nombre')) {
        html += `
            <div style="background: linear-gradient(135deg, #34c759 0%, #30d158 100%); padding: 15px; border-radius: 8px; margin-bottom: 20px; color: white;">
                <div style="font-size: 16px; font-weight: 600; margin-bottom: 5px;">✓ Formato Detectado Automáticamente</div>
                <div style="font-size: 13px; opacity: 0.95;">
                    Tu CSV tiene Apellido y Nombre en columnas separadas. Se combinarán como <strong>"Nombre Apellido"</strong> automáticamente.
                </div>
            </div>
        `;
    }

    html += '<div style="display: grid; gap: 15px;">';

    camposApp.forEach(campo => {
        html += `
            <div style="display: grid; grid-template-columns: 200px 1fr; gap: 15px; align-items: center; padding: 12px; background: white; border: 1px solid #e5e5e7; border-radius: 8px;">
                <div style="font-weight: 600; color: var(--clinic-color, #C4856A);">
                    ${campo.label}
                </div>
                <select id="map-${campo.key}" style="padding: 8px; border: 1px solid #e5e5e7; border-radius: 6px;">
                    <option value="">-- No importar --</option>
                    ${csvHeaders.map(h => `<option value="${h}">${h}</option>`).join('')}
                </select>
            </div>
        `;
    });

    html += '</div>';
    html += `
        <button class="btn btn-submit" onclick="generarVistaPrevia()" style="margin-top: 20px; width: 100%;">
            Ver Vista Previa →
        </button>
    `;

    document.getElementById('mapeoColumnas').innerHTML = html;

    // Auto-mapear columnas similares
    autoMapearColumnas(camposApp);
}

function autoMapearColumnas(camposApp) {
    camposApp.forEach(campo => {
        const select = document.getElementById(`map-${campo.key}`);
        if (!select) return;

        // CASO ESPECIAL: Nombre completo desde Apellido + Nombre separados
        if (campo.key === 'nombre') {
            if (csvHeaders.includes('Apellido') && csvHeaders.includes('Nombre')) {
                // Usar APELLIDO como señal para combinar (se manejará especialmente en generarVistaPrevia)
                select.value = 'Apellido';
                // Agregar nota explicativa
                setTimeout(() => {
                    const selectParent = select.parentElement;
                    if (selectParent && !document.getElementById('notaNombreCompleto')) {
                        const nota = document.createElement('div');
                        nota.id = 'notaNombreCompleto';
                        nota.style.cssText = 'background: #e3f2fd; padding: 8px 12px; border-radius: 6px; margin-top: 8px; font-size: 12px; color: #0d47a1;';
                        nota.innerHTML = '✓ Se combinarán automáticamente <strong>Nombre + Apellido</strong> en un solo campo';
                        selectParent.appendChild(nota);
                    }
                }, 100);
                return;
            }
        }

        // CASO ESPECIAL: Teléfono (tomar el primero disponible)
        if (campo.key === 'telefono') {
            if (csvHeaders.includes('Teléfono1')) {
                select.value = 'Teléfono1';
                return;
            }
        }

        // CASO ESPECIAL: Sexo
        if (campo.key === 'sexo' && csvHeaders.includes('Sexo')) {
            select.value = 'Sexo';
            return;
        }

        // CASO ESPECIAL: Dirección
        if (campo.key === 'direccion' && csvHeaders.includes('Dirección')) {
            select.value = 'Dirección';
            return;
        }

        // Buscar coincidencia general en headers
        const coincidencia = csvHeaders.find(h =>
            h.toLowerCase().includes(campo.key.toLowerCase()) ||
            campo.key.toLowerCase().includes(h.toLowerCase())
        );

        if (coincidencia) {
            select.value = coincidencia;
        }
    });
}

function generarVistaPrevia() {
    // Obtener mapeo
    const mapeo = {
        nombre: document.getElementById('map-nombre').value,
        telefono: document.getElementById('map-telefono').value,
        cedula: document.getElementById('map-cedula').value,
        email: document.getElementById('map-email').value,
        fechaNacimiento: document.getElementById('map-fechaNacimiento').value,
        sexo: document.getElementById('map-sexo').value,
        grupoSanguineo: document.getElementById('map-grupoSanguineo').value,
        direccion: document.getElementById('map-direccion').value,
        alergias: document.getElementById('map-alergias').value,
        condicionesMedicas: document.getElementById('map-condicionesMedicas').value,
        seguroMedico: document.getElementById('map-seguroMedico').value,
        contactoEmergenciaNombre: document.getElementById('map-contactoEmergenciaNombre').value,
        contactoEmergenciaTelefono: document.getElementById('map-contactoEmergenciaTelefono').value
    };

    // Validar campos requeridos
    if (!mapeo.nombre || !mapeo.telefono) {
        showToast('⚠️ Mapea al menos Nombre y Teléfono', 3000, '#e65100');
        return;
    }

    // Transformar datos
    const pacientes = csvData.map(row => {
        // Combinar Apellido + Nombre si están separados
        let nombreCompleto = '';
        if (mapeo.nombre === 'Apellido' && csvHeaders.includes('Nombre')) {
            // Formato Hessy: Apellido, Nombre → Nombre Apellido
            const nombre = row['Nombre'] || '';
            const apellido = row['Apellido'] || '';
            nombreCompleto = `${nombre} ${apellido}`.trim();
        } else {
            nombreCompleto = row[mapeo.nombre] || '';
        }

        // Combinar teléfonos si hay 2
        let telefono = row[mapeo.telefono] || '';
        if (!telefono && csvHeaders.includes('Teléfono2')) {
            telefono = row['Teléfono2'] || '';
        }

        const paciente = {
            id: generateId('PAC-'),
            nombre: nombreCompleto,
            telefono: telefono,
            cedula: row[mapeo.cedula] || '',
            email: row[mapeo.email] || '',
            fechaNacimiento: row[mapeo.fechaNacimiento] || '',
            sexo: row[mapeo.sexo] || '',
            grupoSanguineo: row[mapeo.grupoSanguineo] || '',
            direccion: row[mapeo.direccion] || '',
            alergias: row[mapeo.alergias] || '',
            condicionesMedicas: row[mapeo.condicionesMedicas] || '',
            seguroMedico: row[mapeo.seguroMedico] || '',
            contactoEmergencia: {
                nombre: row[mapeo.contactoEmergenciaNombre] || '',
                telefono: row[mapeo.contactoEmergenciaTelefono] || ''
            },
            consentimiento: {
                firmado: false
            },
            fechaRegistro: new Date().toISOString()
        };
        return paciente;
    });

    // Filtrar solo pacientes con nombre y teléfono
    const totalAntesFiltro = pacientes.length;
    window.pacientesAImportar = pacientes.filter(p => p.nombre && p.telefono);
    const totalDespuesFiltro = window.pacientesAImportar.length;
    const filtrados = totalAntesFiltro - totalDespuesFiltro;

    console.log(`📊 Procesamiento CSV:
    - Total filas: ${csvData.length}
    - Pacientes creados: ${totalAntesFiltro}
    - Con nombre y teléfono: ${totalDespuesFiltro}
    - Filtrados (sin datos): ${filtrados}`);

    // Mostrar vista previa
    document.getElementById('paso3-preview').style.display = 'block';
    document.getElementById('paso4-importar').style.display = 'block';

    let html = `
        <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
            <div style="font-weight: 600; color: #0d47a1; margin-bottom: 8px;">
                ✅ Se importarán ${window.pacientesAImportar.length} pacientes
            </div>
            <div style="font-size: 13px; color: #1565c0;">
                Los primeros 5 se muestran a continuación para revisión
            </div>
            ${filtrados > 0 ? `<div style="font-size: 12px; color: #ff9500; margin-top: 5px;">⚠️ ${filtrados} filas fueron excluidas por no tener nombre o teléfono</div>` : ''}
        </div>
        <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                    <tr style="background: #f8f9fa;">
                        <th style="padding: 10px; text-align: left; border: 1px solid #e5e5e7;">Nombre</th>
                        <th style="padding: 10px; text-align: left; border: 1px solid #e5e5e7;">Teléfono</th>
                        <th style="padding: 10px; text-align: left; border: 1px solid #e5e5e7;">Cédula</th>
                        <th style="padding: 10px; text-align: left; border: 1px solid #e5e5e7;">Email</th>
                    </tr>
                </thead>
                <tbody>
    `;

    window.pacientesAImportar.slice(0, 5).forEach(p => {
        html += `
            <tr>
                <td style="padding: 10px; border: 1px solid #e5e5e7;">${p.nombre}</td>
                <td style="padding: 10px; border: 1px solid #e5e5e7;">${p.telefono}</td>
                <td style="padding: 10px; border: 1px solid #e5e5e7;">${p.cedula || '-'}</td>
                <td style="padding: 10px; border: 1px solid #e5e5e7;">${p.email || '-'}</td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';

    if (window.pacientesAImportar.length > 5) {
        html += `<div style="text-align: center; padding: 10px; color: #666; font-size: 13px;">... y ${window.pacientesAImportar.length - 5} más</div>`;
    }

    document.getElementById('vistaPrevia').innerHTML = html;
}

function ejecutarImportacion() {
    if (!window.pacientesAImportar || window.pacientesAImportar.length === 0) {
        showToast('⚠️ No hay pacientes para importar', 3000, '#e65100');
        return;
    }

    mostrarConfirmacion({
        titulo: '📥 Importar Pacientes',
        mensaje: `
            <div style="text-align: center; padding: 20px;">
                <div style="font-size: 48px; margin-bottom: 15px;">📥</div>
                <div style="font-size: 18px; font-weight: 600; color: var(--clinic-color, #C4856A); margin-bottom: 10px;">
                    ¿Confirmar importación de ${window.pacientesAImportar.length} pacientes?
                </div>
                <div style="font-size: 14px; color: #666;">
                    Los pacientes se agregarán a la base de datos actual
                </div>
            </div>
        `,
        tipo: 'normal',
        confirmText: 'Sí, Importar Ahora',
        onConfirm: async () => {
            console.log(`🚀 Iniciando importación de ${window.pacientesAImportar.length} pacientes...`);

            // Agregar pacientes
            const cantidadAntes = appData.pacientes.length;
            appData.pacientes.push(...window.pacientesAImportar);
            const cantidadDespues = appData.pacientes.length;

            console.log(`📥 Importación: ${cantidadAntes} → ${cantidadDespues} pacientes`);
            console.log(`💾 Llamando a saveData()...`);

            await saveData();
            console.log(`🔄 Actualizando tab de pacientes...`);

            // Actualizar tab de pacientes para reflejar los nuevos
            updatePacientesTab();

            // Mostrar resultado
            document.getElementById('resultadoImportacion').style.display = 'block';
            document.getElementById('resultadoImportacion').innerHTML = `
                <div style="background: #d4edda; border: 1px solid #c3e6cb; padding: 20px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 15px;">✅</div>
                    <div style="font-size: 20px; font-weight: 600; color: #155724; margin-bottom: 10px;">
                        ¡Importación Exitosa!
                    </div>
                    <div style="font-size: 16px; color: #155724; margin-bottom: 15px;">
                        ${window.pacientesAImportar.length} pacientes importados correctamente
                    </div>
                    <div style="font-size: 14px; color: #155724; margin-bottom: 15px;">
                        Total de pacientes en sistema: ${cantidadDespues}
                    </div>
                    <button class="btn btn-submit" onclick="showTab('pacientes')" style="margin-top: 10px; width: 100%;">
                        Ver Pacientes →
                    </button>
                </div>
            `;

            // Limpiar
            document.getElementById('csvFileInput').value = '';
            document.getElementById('paso2-mapeo').style.display = 'none';
            document.getElementById('paso3-preview').style.display = 'none';
            document.getElementById('paso4-importar').style.display = 'none';
            window.pacientesAImportar = null;

            updatePacientesTab();
        }
    });
}

// Editar paciente desde ficha
function editarPacienteActual() {
    if (!currentPacienteId) return;

    const paciente = appData.pacientes.find(p => p.id === currentPacienteId);
    if (!paciente) return;

    // Prellenar formulario
    document.getElementById('editPacienteNombre').value = paciente.nombre || '';
    document.getElementById('editPacienteTelefono').value = paciente.telefono || '';
    document.getElementById('editPacienteCedula').value = paciente.cedula || '';
    document.getElementById('editPacienteEmail').value = paciente.email || '';
    document.getElementById('editPacienteFechaNac').value = paciente.fechaNacimiento || '';
    document.getElementById('editPacienteSexo').value = paciente.sexo || '';
    document.getElementById('editPacienteGrupoSang').value = paciente.grupoSanguineo || '';
    document.getElementById('editPacienteDireccion').value = paciente.direccion || '';
    document.getElementById('editPacienteAlergias').value = paciente.alergias || '';
    document.getElementById('editPacienteCondiciones').value = paciente.condicionesMedicas || '';
    document.getElementById('editPacienteSeguro').value = paciente.seguroMedico || '';
    document.getElementById('editPacienteContactoNombre').value = (paciente.contactoEmergencia && paciente.contactoEmergencia.nombre) || '';
    document.getElementById('editPacienteContactoTel').value = (paciente.contactoEmergencia && paciente.contactoEmergencia.telefono) || '';

    // Cambiar de modal
    closeModal('modalVerPaciente');
    openModal('modalEditarPaciente');
}

function guardarEdicionPaciente() {
    if (!currentPacienteId) return;

    const paciente = appData.pacientes.find(p => p.id === currentPacienteId);
    if (!paciente) return;

    // Actualizar datos
    paciente.nombre = document.getElementById('editPacienteNombre').value.trim();
    paciente.telefono = document.getElementById('editPacienteTelefono').value.trim();
    paciente.cedula = document.getElementById('editPacienteCedula').value.trim();
    paciente.email = document.getElementById('editPacienteEmail').value.trim();
    paciente.fechaNacimiento = document.getElementById('editPacienteFechaNac').value;
    paciente.sexo = document.getElementById('editPacienteSexo').value;
    paciente.grupoSanguineo = document.getElementById('editPacienteGrupoSang').value.trim();
    paciente.direccion = document.getElementById('editPacienteDireccion').value.trim();
    paciente.alergias = document.getElementById('editPacienteAlergias').value.trim();
    paciente.condicionesMedicas = document.getElementById('editPacienteCondiciones').value.trim();
    paciente.seguroMedico = document.getElementById('editPacienteSeguro').value.trim();

    if (!paciente.contactoEmergencia) paciente.contactoEmergencia = {};
    paciente.contactoEmergencia.nombre = document.getElementById('editPacienteContactoNombre').value.trim();
    paciente.contactoEmergencia.telefono = document.getElementById('editPacienteContactoTel').value.trim();

    // Validar campos requeridos
    if (!paciente.nombre || !paciente.telefono) {
        showToast('⚠️ Nombre y teléfono son obligatorios', 3000, '#e65100');
        return;
    }

    savePaciente(paciente);
    updatePacientesTab();
    closeModal('modalEditarPaciente');

    showToast('✓ Paciente actualizado correctamente');

    // Volver a abrir ficha actualizada
    verPaciente(currentPacienteId);
}

// Variable global para guardar cita actual en detalle
let currentCitaIdDetalle = null;


// Cancelar cita desde modal detalle
function cancelarCita() {
    if (!currentCitaIdDetalle) {
        showToast('⚠️ No se puede identificar la cita', 3000, '#e65100');
        return;
    }
    
    const cita = appData.citas.find(c => c.id === currentCitaIdDetalle);
    if (!cita) {
        showToast('⚠️ Cita no encontrada', 3000, '#e65100');
        return;
    }
    
    mostrarConfirmacion({
        titulo: '❌ Cancelar Cita',
        mensaje: `
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <div style="font-size: 16px; font-weight: 600; color: var(--clinic-color, #C4856A); margin-bottom: 8px;">
                    ${cita.paciente}
                </div>
                <div style="font-size: 14px; color: #666; margin-bottom: 4px;">
                    <strong>Fecha:</strong> ${formatDate(cita.fecha)} ${cita.hora}
                </div>
                <div style="font-size: 14px; color: #666; margin-bottom: 4px;">
                    <strong>Profesional:</strong> ${cita.profesional}
                </div>
                <div style="font-size: 14px; color: #666;">
                    <strong>Motivo:</strong> ${cita.motivo}
                </div>
            </div>
            <div style="background: #fff3cd; padding: 12px; border-radius: 6px; border-left: 3px solid #ffc107;">
                <div style="color: #856404; font-size: 13px;">
                    ⚠️ La cita se marcará como <strong>Cancelada</strong>
                </div>
            </div>
        `,
        tipo: 'advertencia',
        confirmText: 'Sí, Cancelar Cita',
        onConfirm: async () => {
            const estadoOriginal = cita.estado;
            cita.estado = 'Cancelada';
            cita.ultimaModificacion = new Date().toISOString();
            cita.modificadoPor = appData.currentUser;
            try {
                await saveData();
                closeModal('modalDetalleCita');
                updateAgendaTab();
                showToast('✓ Cita cancelada');
            } catch(e) {
                cita.estado = estadoOriginal; // rollback
                showError('Error al cancelar la cita.', e);
            }
        }
    });
}


// Abrir modal de abono desde ficha del paciente
function abrirAbonoBalance(pacienteId) {
    // VALIDAR PERMISO: Solo admin y recepción pueden cobrar
    if (appData.currentRole === 'professional') {
        showToast('⛔ Sin permiso para realizar cobros', 4000, '#c0392b');
        return;
    }
    
    const paciente = appData.pacientes.find(p => p.id === pacienteId);
    if (!paciente) {
        console.error('Paciente no encontrado:', pacienteId);
        return;
    }
    
    console.log('📊 Debug abrirAbonoBalance:');
    console.log('Paciente:', paciente.nombre);
    
    const todasFacturas = getFacturasDePaciente(paciente);
    console.log('Total facturas del paciente:', todasFacturas.length);
    console.log('Estados de facturas:', todasFacturas.map(f => ({ numero: f.numero, estado: f.estado })));
    
    // Encontrar factura más antigua pendiente (filtro robusto - ambos idiomas)
    const facturasPendientes = todasFacturas
        .filter(f => {
            const estado = (f.estado || '').toLowerCase().trim();
            return estado === 'pendiente' || 
                   estado === 'parcial' || 
                   estado === 'pending' || 
                   estado === 'partial';
        })
        .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    
    console.log('Facturas pendientes encontradas:', facturasPendientes.length);
    
    if (facturasPendientes.length === 0) {
        showToast('⚠️ No hay facturas pendientes para este paciente', 4000, '#e65100');
        console.warn('[Cobros] No hay facturas pendientes para paciente de cita:', currentCitaIdDetalle);
        return;
    }
    
    console.log('Abriendo pago de factura:', facturasPendientes[0].numero);
    
    // Abrir pago de la factura más antigua
    closeModal('modalVerPaciente');
    abrirPagoFactura(facturasPendientes[0].id, pacienteId);
}

// Abrir pago de factura desde ficha del paciente
function abrirPagoFactura(facturaId, pacienteId) {
    // VALIDAR PERMISO: Solo admin y recepción pueden cobrar
    if (appData.currentRole === 'professional') {
        showToast('⛔ Sin permiso para realizar cobros', 4000, '#c0392b');
        return;
    }
    
    closeModal('modalVerPaciente');
    openPagarFactura(facturaId);
    
    // Guardar pacienteId para volver a la ficha después
    window.tempPacienteIdRetorno = pacienteId;
}


// ════════════════════════════════════════════════════
// CATÁLOGO DE PROCEDIMIENTOS
// ════════════════════════════════════════════════════


// ═══════════════════════════════════════════════
// MI PLAN TAB
// ═══════════════════════════════════════════════

const MODULOS_DISPONIBLES = [
    { key: 'laboratorio',   nombre: 'Laboratorio',         precio: 300,  soloPlans: ['clinica','solo'], desc: 'Gestión de órdenes y seguimiento de lab.' },
    { key: 'nomina',        nombre: 'Nómina',              precio: 300,  soloPlans: ['clinica'],        desc: 'Comisiones y avances de profesionales.' },
    { key: 'inventario',    nombre: 'Inventario',          precio: 300,  soloPlans: ['clinica','solo'], desc: 'Control de materiales con alertas de stock.' },
    { key: 'reportes',      nombre: 'Reportes avanzados',  precio: 300,  soloPlans: ['clinica','solo'], desc: 'Rentabilidad, tendencias, exportación a Excel.' },
    { key: 'multisucursal', nombre: 'Sucursal adicional',  precio: 800,  soloPlans: ['clinica'],        desc: 'Gestión independiente por sede.' },
];
const BASE_PRECIOS = { clinica: 1200, solo: 990 };

function renderMiPlanTab() {
    // Deactivate other tabs, activate miplan
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    // Get or create the tab container
    let tab = document.getElementById('tab-miplan');
    if (!tab) {
        tab = document.createElement('div');
        tab.id = 'tab-miplan';
        tab.className = 'tab-content';
        document.querySelector('.content-area').appendChild(tab);
    }
    tab.classList.add('active');

    // Highlight nav button
    document.querySelectorAll('.nav-item').forEach(btn => {
        if (btn.getAttribute('onclick') === "showTab('miplan')") btn.classList.add('active');
    });

    const plan = clinicConfig.plan || 'clinica';
    const basePrice = BASE_PRECIOS[plan] || 1200;
    const activosActuales = [...(clinicConfig.modulos || [])];
    const hasta = clinicConfig.trialHasta ? new Date(clinicConfig.trialHasta) : null;
    const diasTrial = hasta ? Math.max(0, Math.ceil((hasta - new Date()) / (1000*60*60*24))) : 0;

    // Build toggles state — starts at current contracted modules
    let pendientes = [...activosActuales];

    function calcTotal() {
        const extraModulos = pendientes.reduce((s, k) => {
            const m = MODULOS_DISPONIBLES.find(x => x.key === k);
            return s + (m ? m.precio : 0);
        }, 0);
        return basePrice + extraModulos;
    }

    function renderToggle(modulo) {
        const activo = pendientes.includes(modulo.key);
        return `
        <div class="miplan-modulo" id="mpmod-${modulo.key}" style="
            display:flex; align-items:center; justify-content:space-between;
            padding:16px 20px; background:var(--white); border-radius:var(--radius-md);
            margin-bottom:10px; border:1.5px solid ${activo ? 'var(--clinic-color)' : 'rgba(30,28,26,0.07)'};
            transition:border-color 0.2s; cursor:pointer;
        " onclick="togglePlanModulo('${modulo.key}')">
            <div>
                <div style="font-size:14px;font-weight:400;color:var(--dark);margin-bottom:2px">${modulo.nombre}</div>
                <div style="font-size:12px;color:var(--light)">${modulo.desc}</div>
            </div>
            <div style="display:flex;align-items:center;gap:14px;flex-shrink:0">
                <div style="font-size:13px;color:var(--mid)">${formatCurrency(modulo.precio).replace(' ', '')}<span style="font-size:10px;color:var(--light)">/mes</span></div>
                <div style="
                    width:44px;height:24px;border-radius:100px;
                    background:${activo ? 'var(--clinic-color)' : 'rgba(30,28,26,0.15)'};
                    transition:background 0.2s;position:relative;
                ">
                    <div style="
                        width:18px;height:18px;border-radius:50%;background:white;
                        position:absolute;top:3px;
                        left:${activo ? '23px' : '3px'};
                        transition:left 0.2s;
                        box-shadow:0 1px 4px rgba(0,0,0,0.2);
                    "></div>
                </div>
            </div>
        </div>`;
    }

    tab.innerHTML = `
        <div class="section-title" style="margin-bottom:4px">Mi plan</div>
        <div class="section-sub">${clinicConfig.enTrial
            ? `Período de prueba · <strong style="color:var(--terracota)">${diasTrial} día${diasTrial!==1?'s':''} restante${diasTrial!==1?'s':''}</strong>`
            : 'Plan activo · Solo módulos contratados'
        }</div>
        ${clinicConfig.enTrial ? `<div style="margin-top:6px;padding:10px 14px;background:rgba(196,133,106,0.08);border-radius:8px;font-size:12px;color:var(--mid);border-left:3px solid var(--terracota)">💡 Durante el trial puedes agregar módulos y explorar SMILE. Solo pagas los módulos activos al finalizar.</div>` : ''}

        <!-- Plan base -->
        <div class="card" style="margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;align-items:center">
                <div>
                    <div style="font-size:13px;color:var(--light);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">Plan base</div>
                    <div style="font-size:18px;font-weight:300;color:var(--dark)">${plan === 'solo' ? 'Plan Solo' : 'Plan Clínica'}</div>
                    <div style="font-size:12px;color:var(--light);margin-top:2px">Agenda · Pacientes · Facturación · Expediente clínico</div>
                </div>
                <div style="text-align:right">
                    <div style="font-size:22px;font-weight:200;color:var(--dark);letter-spacing:-0.5px">${clinicConfig.moneda || "RD$"}${basePrice.toLocaleString()}</div>
                    <div style="font-size:10px;color:var(--light)">/mes</div>
                </div>
            </div>
        </div>

        <!-- Módulos -->
        <div style="font-size:11px;color:var(--light);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px;padding:0 2px">
            Módulos adicionales
        </div>
        <div id="miplan-modulos">
            ${MODULOS_DISPONIBLES.filter(m => m.soloPlans.includes(plan)).map(renderToggle).join('')}
        </div>

        <!-- Total y guardar -->
        <div class="card" style="margin-top:20px;background:var(--surface);border:1.5px solid rgba(30,28,26,0.07)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                <div style="font-size:11px;color:var(--light);letter-spacing:1.5px;text-transform:uppercase">Total mensual</div>
                <div style="font-size:28px;font-weight:200;color:var(--dark);letter-spacing:-1px" id="miplan-total">${clinicConfig.moneda || "RD$"}${calcTotal().toLocaleString()}</div>
            </div>
            <button onclick="guardarCambiosPlan()" style="
                width:100%;padding:14px;background:var(--clinic-color);color:white;
                border:none;border-radius:var(--radius-sm);font-size:12px;
                letter-spacing:1.5px;text-transform:uppercase;font-family:inherit;
                cursor:pointer;transition:background 0.2s;
            " onmouseover="this.style.background='var(--terracota)'"
               onmouseout="this.style.background='var(--clinic-color)'">
                Guardar cambios
            </button>
            <div style="font-size:11px;color:var(--light);text-align:center;margin-top:10px;line-height:1.6">
                Los módulos nuevos se activan al instante.<br>El ajuste de precio aplica a partir del próximo ciclo de cobro.<br>Contacta a SMILE por WhatsApp para coordinar el pago.
            </div>
        </div>
    `;

    // Store pendientes reference for toggles
    tab._pendientes = pendientes;
    tab._calcTotal = calcTotal;
    tab._renderToggle = renderToggle;
}

function togglePlanModulo(key) {
    const tab = document.getElementById('tab-miplan');
    if (!tab) return;

    const idx = tab._pendientes.indexOf(key);
    if (idx >= 0) {
        tab._pendientes.splice(idx, 1);
    } else {
        tab._pendientes.push(key);
    }

    // Re-render just the toggles and total
    document.getElementById('miplan-modulos').innerHTML =
        MODULOS_DISPONIBLES.filter(m => m.soloPlans.includes(clinicConfig.plan || 'clinica')).map(m => tab._renderToggle(m)).join('');
    document.getElementById('miplan-total').textContent =
        (clinicConfig.moneda || 'RD$') + tab._calcTotal().toLocaleString();
}

async function guardarCambiosPlan() {
    try {
    const tab = document.getElementById('tab-miplan');
    if (!tab) return;

    const btn = tab.querySelector('button[onclick="guardarCambiosPlan()"]');
    btn.textContent = 'Guardando...';
    btn.disabled = true;

    try {
        const nuevosModulos = [...tab._pendientes];
        const plan = clinicConfig.plan || 'clinica';
        const basePrice = BASE_PRECIOS[plan] || 1200;
        const nuevoMRR = nuevosModulos.reduce((s, k) => {
            const m = MODULOS_DISPONIBLES.find(x => x.key === k);
            return s + (m ? m.precio : 0);
        }, basePrice);

        // Guardia antes de escribir
        if (!canWriteToFirebase('guardarModulosPlan')) return;

        // Update Firebase config
        await db.collection('clinicas').doc(CLINIC_PATH)
            .collection('config').doc('settings').set({
                modulos: nuevosModulos,
                mrr: nuevoMRR,
                planModificadoEn: new Date().toISOString(),
            }, { merge: true });

        // Update local state
        clinicConfig.modulos = nuevosModulos;

        btn.textContent = '✓ Cambios guardados';
        btn.style.background = 'var(--green, #6B8F71)';
        setTimeout(() => {
            btn.textContent = 'Guardar cambios';
            btn.style.background = '';
            btn.disabled = false;
        }, 2500);

        // Rebuild navigation to reflect new modules
        buildNavigation();

    } catch(e) {
        console.error(e);
        btn.textContent = 'Error — intenta de nuevo';
        btn.style.background = '#c0392b';
        setTimeout(() => {
            btn.textContent = 'Guardar cambios';
            btn.style.background = '';
            btn.disabled = false;
        }, 2500);
    }
    } catch(e) {
        showError('Error al guardar los cambios del plan.', e);
    }
}


// ═══════════════════════════════════════════════
// COBROS TAB — unifies factura, pendientes, ingresos, cuadre, gastos
// ═══════════════════════════════════════════════
function renderCobrosTab(subtab) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    // Get or create container
    let tab = document.getElementById('tab-cobros');
    if (!tab) {
        tab = document.createElement('div');
        tab.id = 'tab-cobros';
        tab.className = 'tab-content';
        document.querySelector('.content-area').appendChild(tab);
    }
    tab.classList.add('active');
    // Pick requested subtab, or remembered one, or first one the user can access
    const _requested = subtab || tab._activeSubtab || 'cobrar';
    const active = tienePermiso({ cobrar:'cobrar', nueva:'facturar', ingresos:'verIngresos', cuadre:'cuadre', gastos:'gastos' }[_requested] || _requested)
        ? _requested
        : (['cobrar','nueva','ingresos','cuadre','gastos'].find(k => tienePermiso({cobrar:'cobrar',nueva:'facturar',ingresos:'verIngresos',cuadre:'cuadre',gastos:'gastos'}[k])) || 'cobrar');
    tab._activeSubtab = active;

    // Highlight nav
    document.querySelectorAll('.nav-item').forEach(btn => {
        if (btn.getAttribute('onclick') === "showTab('cobros')") btn.classList.add('active');
    });

    const subtabs = [
        { key: 'cobrar',   label: '💳 Cobrar',   permiso: 'cobrar'     },
        { key: 'nueva',    label: '+ Nueva',     permiso: 'facturar'   },
        { key: 'ingresos', label: 'Ingresos',    permiso: 'verIngresos'},
        { key: 'cuadre',   label: 'Cuadre',      permiso: 'cuadre'     },
        { key: 'gastos',   label: 'Gastos',      permiso: 'gastos'     },
    ].filter(s => tienePermiso(s.permiso));

    const subtabsHtml = subtabs.map(s => `
        <button onclick="setCobrosSubtab('${s.key}')" style="
            padding:8px 16px;border:none;background:${active===s.key ? 'var(--dark)' : 'transparent'};
            color:${active===s.key ? 'white' : 'var(--mid)'};
            border-radius:100px;font-size:12px;font-family:inherit;cursor:pointer;
            white-space:nowrap;letter-spacing:0.3px;transition:all 0.2s;
            ${active===s.key ? 'box-shadow:0 2px 8px rgba(30,28,26,0.15)' : ''}
        ">${s.label}</button>
    `).join('');

    tab.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <div class="section-title" style="margin-bottom:0">Cobros</div>
        </div>
        <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;margin-bottom:20px;
                    scrollbar-width:none;-webkit-overflow-scrolling:touch">
            ${subtabsHtml}
        </div>
        <div id="cobros-content"></div>
    `;

    renderCobrosContent(active);
}

function setCobrosSubtab(key) {
    const tab = document.getElementById('tab-cobros');
    if (tab) {
        tab._activeSubtab = key;
        renderCobrosTab(key);
    } else {
        renderCobrosTab(key);
    }
}

function renderCobrosContent(key) {
    const el = document.getElementById('cobros-content');
    if (!el) return;

    if (key === 'cobrar') {
        const src = document.getElementById('tab-cobrar');
        el.innerHTML = src ? src.innerHTML : '<p>Cargando...</p>';
        if (typeof updateCobrarTab === 'function') updateCobrarTab();
    } else if (key === 'nueva') {
        // Copy factura tab content into cobros
        const src = document.getElementById('tab-factura');
        el.innerHTML = src ? src.innerHTML : '<p>Cargando...</p>';

        // Populate professional selector for admin (can't use showTab logic since we cloned)
        if (appData.currentRole === 'admin') {
            const container = el.querySelector('#selectorProfesionalFactura');
            const select    = el.querySelector('#profesionalQueAtendio');
            if (container) container.style.display = 'block';
            if (select) {
                const profesionales = appData.personal.filter(p => p.tipo !== 'empleado');
                select.innerHTML = '<option value="">Seleccione el profesional...</option>' +
                    profesionales.map(p => `<option value="${p.nombre}">${p.nombre}</option>`).join('');
            }
        }

        // Re-init factura state
        if (typeof initFacturaForm === 'function') initFacturaForm();
        if (typeof updateTempProcedimientos === 'function') updateTempProcedimientos();
        updateProcedimientosList();
        updateListaOrdenesLabTemp();
        updateTotal();
    } else if (key === 'ingresos') {
        const src = document.getElementById('tab-ingresos');
        el.innerHTML = src ? src.innerHTML : '<p>Cargando...</p>';
        if (typeof updateIngresosTab === 'function') updateIngresosTab();
    } else if (key === 'cuadre') {
        const src = document.getElementById('tab-cuadre');
        el.innerHTML = src ? src.innerHTML : '<p>Cargando...</p>';
        if (typeof updateCuadreTab === 'function') updateCuadreTab();
    } else if (key === 'gastos') {
        const src = document.getElementById('tab-gastos');
        el.innerHTML = src ? src.innerHTML : '<p>Cargando...</p>';
        if (typeof updateGastosTab === 'function') updateGastosTab();
    }
}

// ═══════════════════════════════════════════════
// MÁS — bottom sheet menu
// ═══════════════════════════════════════════════
function abrirMas() {
    // Remove existing
    const existing = document.getElementById('masSheet');
    if (existing) { cerrarMas(); return; }

    // Mark nav
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(btn => {
        if (btn.getAttribute('onclick') === 'abrirMas()') btn.classList.add('active');
    });

    const role = appData.currentRole;
    const overlay = document.createElement('div');
    overlay.id = 'masOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.3);z-index:999;backdrop-filter:blur(4px);animation:fadeIn 0.2s ease';
    overlay.onclick = cerrarMas;
    document.body.appendChild(overlay);

    const sheet = document.createElement('div');
    sheet.id = 'masSheet';
    sheet.style.cssText = `
        position:fixed;bottom:0;left:0;right:0;z-index:1000;
        background:var(--white);border-radius:24px 24px 0 0;
        padding:12px 0 calc(env(safe-area-inset-bottom)+20px);
        animation:slideUp 0.35s cubic-bezier(0.34,1.1,0.64,1);
        max-height:85vh;overflow-y:auto;
    `;

    const items = [];

    if (role === 'admin' || role === 'professional') {
        items.push({ icon: '💰', label: 'Cobros',      action: `cerrarMas();showTab('cobros')` });
    }
    if (role === 'admin' && hasModule('nomina')) {
        items.push({ icon: '👥', label: 'Personal',    action: `cerrarMas();irTab('personal')` });
    }
    if (hasModule('inventario') && (role === 'admin' || role === 'reception')) {
        items.push({ icon: '📦', label: 'Inventario',  action: `cerrarMas();irTab('inventario')` });
    }
    if (hasModule('multisucursal') && role === 'admin') {
        items.push({ icon: '🏢', label: 'Sedes',       action: `cerrarMas();irTab('sedes')` });
    }
    if (hasModule('reportes') && role === 'admin') {
        items.push({ icon: '📊', label: 'Reportes',    action: `cerrarMas();irTab('reportes')` });
    }
    if (clinicConfig.procMode === 'lista' && role === 'admin') {
        items.push({ icon: '📋', label: 'Catálogo',    action: `cerrarMas();showTab('catalogo')` });
    }
    if (role === 'admin') {
        items.push({ icon: '💳', label: 'Mi Plan',     action: `cerrarMas();showTab('miplan')` });
    }
    items.push({ icon: '👤', label: 'Perfil',          action: `cerrarMas();irTab('perfil')` });
    items.push({ icon: '🚪', label: 'Cerrar sesión',   action: `cerrarMas();logout()`, danger: true });

    const itemsHtml = items.map(item => `
        <button onclick="${item.action}" style="
            width:100%;padding:16px 24px;background:none;border:none;
            display:flex;align-items:center;gap:16px;
            font-size:16px;font-family:inherit;font-weight:300;
            color:${item.danger ? '#c0392b' : 'var(--dark)'};
            cursor:pointer;text-align:left;transition:background 0.15s;
        " onmouseover="this.style.background='var(--surface)'"
           onmouseout="this.style.background='none'">
            <span style="font-size:20px;width:28px;text-align:center">${item.icon}</span>
            ${item.label}
        </button>
    `).join('');

    sheet.innerHTML = `
        <div style="width:36px;height:4px;background:rgba(30,28,26,0.15);border-radius:100px;margin:0 auto 16px"></div>
        <div style="padding:0 24px;margin-bottom:12px">
            <div style="font-size:11px;color:var(--light);letter-spacing:2px;text-transform:uppercase">Menú</div>
        </div>
        ${itemsHtml}
    `;

    document.body.appendChild(sheet);
}

function cerrarMas() {
    const overlay = document.getElementById('masOverlay');
    const sheet = document.getElementById('masSheet');
    if (overlay) overlay.remove();
    if (sheet) sheet.remove();
}

function irTab(tabName) {
    // For tabs that still live as direct tab-content elements
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const tab = document.getElementById('tab-' + tabName);
    if (tab) tab.classList.add('active');
    if (tabName === 'perfil') updatePerfilTab();
    if (tabName === 'reportes'   && typeof updateReportesTab   === 'function') updateReportesTab();
    if (tabName === 'personal'   && typeof updatePersonalTab   === 'function') updatePersonalTab();
    if (tabName === 'inventario' && typeof updateInventarioTab === 'function') updateInventarioTab();
    if (tabName === 'sedes'      && typeof updateSedesTab      === 'function') updateSedesTab();
}


function renderCatalogoTab() {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(b => {
        if (b.textContent.trim().includes('Catálogo')) b.classList.add('active');
    });

    const items = clinicConfig.procItems || [];
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));

    let catTab = document.getElementById('tab-catalogo');
    if (!catTab) {
        catTab = document.createElement('div');
        catTab.id = 'tab-catalogo';
        catTab.className = 'tab-content';
        const parent = document.querySelector('.tab-content')?.parentElement;
        if (parent) parent.appendChild(catTab);
    }
    catTab.classList.add('active');

    catTab.innerHTML = `
        <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;flex-wrap:wrap;gap:12px">
                <div>
                    <h2 style="margin:0 0 4px 0">Catálogo de procedimientos</h2>
                    <div style="font-size:13px;color:#666">Precios base que aparecen al crear una factura</div>
                </div>
                <button class="btn-primary" onclick="abrirModalProcedimiento(null)">+ Agregar</button>
            </div>
            <div id="catalogo-list">
                ${items.length === 0 ? `
                    <div style="text-align:center;padding:48px 24px;color:#999">
                        <div style="font-size:32px;margin-bottom:12px">📋</div>
                        <div style="font-size:15px;margin-bottom:8px">Sin procedimientos aún</div>
                        <div style="font-size:13px">Agrega los procedimientos que ofrece tu clínica</div>
                    </div>
                ` : items.map((item, i) => `
                    <div style="display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid #f0f0f0">
                        <div style="flex:1;font-size:14px;color:#1d1d1f;font-weight:500">${item.nombre}</div>
                        <div style="font-size:15px;font-weight:500;color:var(--clinic-color)">${formatCurrency(item.precio||0)}</div>
                        <button onclick="abrirModalProcedimiento(${i})" style="padding:6px 14px;background:none;border:1px solid #ddd;border-radius:8px;font-size:12px;color:#666;cursor:pointer" onmouseover="this.style.borderColor='var(--clinic-color)';this.style.color='var(--clinic-color)'" onmouseout="this.style.borderColor='#ddd';this.style.color='#666'">Editar</button>
                        <button onclick="eliminarProcedimiento(${i})" style="padding:6px 10px;background:none;border:1px solid #ddd;border-radius:8px;font-size:12px;color:#999;cursor:pointer" onmouseover="this.style.borderColor='#ff3b30';this.style.color='#ff3b30'" onmouseout="this.style.borderColor='#ddd';this.style.color='#999'">✕</button>
                    </div>
                `).join('')}
            </div>
        </div>
        <div class="card" style="margin-top:16px;background:rgba(0,0,0,0.02)">
            <div style="font-size:12px;color:#999;line-height:1.7">
                💡 Estos precios son la referencia al crear facturas. El médico puede ajustar el precio en cada factura si lo necesita.
            </div>
        </div>
    `;
}

function abrirModalProcedimiento(idx) {
    const item = idx !== null && idx !== 'null' ? (clinicConfig.procItems || [])[idx] : null;
    let overlay = document.getElementById('modalOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'modalOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px';
        overlay.onclick = e => { if (e.target === overlay) cerrarModalProcedimiento(); };
        document.body.appendChild(overlay);
    }
    let modal = document.getElementById('modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal';
        modal.style.cssText = 'background:white;border-radius:20px;width:100%;max-width:440px;box-shadow:0 20px 60px rgba(0,0,0,0.15);overflow:hidden';
        overlay.appendChild(modal);
    }
    overlay.style.display = 'flex';

    modal.innerHTML = `
        <div class="modal-header">
            <h3 class="modal-title">${item ? 'Editar procedimiento' : 'Nuevo procedimiento'}</h3>
            <button onclick="cerrarModalProcedimiento()" style="background:none;border:none;font-size:22px;cursor:pointer;color:#999;line-height:1">✕</button>
        </div>
        <div style="padding:24px">
            <div style="margin-bottom:16px">
                <label style="font-size:11px;font-weight:500;color:#999;letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:8px">Nombre</label>
                <input type="text" id="proc-modal-nombre" value="${item ? item.nombre : ''}" placeholder="Ej: Limpieza dental"
                    style="width:100%;padding:12px 16px;border:1.5px solid #e0e0e0;border-radius:12px;font-size:15px;font-family:inherit;outline:none;box-sizing:border-box"
                    onfocus="this.style.borderColor='var(--clinic-color)'" onblur="this.style.borderColor='#e0e0e0'">
            </div>
            <div style="margin-bottom:28px">
                <label style="font-size:11px;font-weight:500;color:#999;letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:8px">Precio base</label>
                <input type="number" id="proc-modal-precio" value="${item ? item.precio : ''}" placeholder="0"
                    style="width:100%;padding:12px 16px;border:1.5px solid #e0e0e0;border-radius:12px;font-size:15px;font-family:inherit;outline:none;box-sizing:border-box"
                    onfocus="this.style.borderColor='var(--clinic-color)'" onblur="this.style.borderColor='#e0e0e0'"
                    onkeydown="if(event.key==='Enter') guardarProcedimiento(${idx})">
            </div>
            <div style="display:flex;gap:10px;justify-content:flex-end">
                <button onclick="cerrarModalProcedimiento()" style="padding:12px 24px;background:none;border:1.5px solid #e0e0e0;border-radius:100px;font-size:14px;font-family:inherit;cursor:pointer">Cancelar</button>
                <button onclick="guardarProcedimiento(${idx})" class="btn-primary" style="padding:12px 28px;border-radius:100px;font-size:14px;border:none;cursor:pointer">Guardar</button>
            </div>
        </div>
    `;
    setTimeout(() => document.getElementById('proc-modal-nombre')?.focus(), 50);
}

function cerrarModalProcedimiento() {
    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.style.display = 'none';
}

async function guardarProcedimiento(idx) {
    try {
    const nombre = document.getElementById('proc-modal-nombre').value.trim();
    const precio = parseInt(document.getElementById('proc-modal-precio').value) || 0;
    if (!nombre) { showToast('⚠️ El nombre es obligatorio', 3000, '#e65100'); return; }

    if (!clinicConfig.procItems) clinicConfig.procItems = [];
    const backupItems = [...clinicConfig.procItems];

    if (idx === null || idx === 'null') {
        clinicConfig.procItems.push({ nombre, precio });
    } else {
        clinicConfig.procItems[parseInt(idx)] = { nombre, precio };
    }

    try {
        if (!canWriteToFirebase('guardarProcedimiento')) return;
        await db.collection('clinicas').doc(CLINIC_PATH)
            .collection('config').doc('settings')
            .set({ procItems: clinicConfig.procItems }, { merge: true });
        cerrarModalProcedimiento();
        renderCatalogoTab();
        showToast('✓ Guardado');
    } catch(e) {
        clinicConfig.procItems = backupItems; // rollback
        console.error(e);
        showToast('❌ Error al guardar. Intenta de nuevo.', 4000, '#c0392b');
        console.error('[Catálogo] Error guardando procedimiento:', e);
    }
    } catch(e) {
        showError('Error al guardar el procedimiento.', e);
    }
}

async function eliminarProcedimiento(idx) {
    if (!confirm('¿Eliminar este procedimiento?')) return;
    clinicConfig.procItems.splice(idx, 1);
    try {
        if (!canWriteToFirebase('eliminarProcedimiento')) return;
        await db.collection('clinicas').doc(CLINIC_PATH)
            .collection('config').doc('settings')
            .set({ procItems: clinicConfig.procItems }, { merge: true });
        renderCatalogoTab();
        showToast('✓ Eliminado');
    } catch(e) { console.error(e); }
}


// ═══════════════════════════════════════════════════════════
// MÓDULO DE REPORTES AVANZADOS
// ═══════════════════════════════════════════════════════════

let _reportePeriodo = null; // { desde: 'YYYY-MM-DD', hasta: 'YYYY-MM-DD', label: '' }

function setReportePeriodo(tipo) {
    const tz = getTimezone();
    const ahora = new Date();

    function keyEnTZ(d) {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(d);
    }

    const hoy = keyEnTZ(ahora);

    if (tipo === 'hoy') {
        _reportePeriodo = { desde: hoy, hasta: hoy, label: 'Hoy' };
    } else if (tipo === 'ayer') {
        const ayer = new Date(ahora);
        ayer.setDate(ayer.getDate() - 1);
        const k = keyEnTZ(ayer);
        _reportePeriodo = { desde: k, hasta: k, label: 'Ayer' };
    } else if (tipo === 'semana') {
        // Lunes de la semana actual
        const dia = ahora.getDay();
        const offsetLun = (dia === 0) ? -6 : 1 - dia;
        const lunes = new Date(ahora);
        lunes.setDate(ahora.getDate() + offsetLun);
        _reportePeriodo = { desde: keyEnTZ(lunes), hasta: hoy, label: 'Esta semana' };
    } else if (tipo === 'mes') {
        const primeroDeMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
        _reportePeriodo = { desde: keyEnTZ(primeroDeMes), hasta: hoy, label: 'Este mes' };
    } else if (tipo === 'mes_anterior') {
        const primeroDeMesAnt = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
        const ultimoDeMesAnt  = new Date(ahora.getFullYear(), ahora.getMonth(), 0);
        _reportePeriodo = { desde: keyEnTZ(primeroDeMesAnt), hasta: keyEnTZ(ultimoDeMesAnt), label: 'Mes anterior' };
    } else if (tipo === 'año') {
        const primeroDeAño = new Date(ahora.getFullYear(), 0, 1);
        _reportePeriodo = { desde: keyEnTZ(primeroDeAño), hasta: hoy, label: 'Este año' };
    }

    // Actualizar inputs de fecha
    const desdeEl = document.getElementById('reporteFechaInicio');
    const hastaEl = document.getElementById('reporteFechaFin');
    if (desdeEl) desdeEl.value = _reportePeriodo.desde;
    if (hastaEl) hastaEl.value = _reportePeriodo.hasta;

    // Resaltar botón activo
    document.querySelectorAll('.reporte-periodo-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.periodo === tipo);
    });

    generarReporte();
}

function _fechaEnRango(fechaISO, desde, hasta) {
    if (!fechaISO) return false;
    try {
        const tz = getTimezone();
        const key = new Intl.DateTimeFormat('en-CA', {
            timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date(fechaISO));
        return key >= desde && key <= hasta;
    } catch(e) {
        const k = new Date(fechaISO).toISOString().slice(0, 10);
        return k >= desde && k <= hasta;
    }
}

function generarReporte() {
    const desdeEl = document.getElementById('reporteFechaInicio');
    const hastaEl = document.getElementById('reporteFechaFin');
    if (!desdeEl || !hastaEl) return;

    const desde = desdeEl.value;
    const hasta  = hastaEl.value;
    if (!desde || !hasta) {
        showToast('⚠️ Selecciona el período', 3000, '#e65100');
        return;
    }
    if (desde > hasta) {
        showToast('⚠️ La fecha de inicio debe ser antes del fin', 3000, '#e65100');
        return;
    }

    // ── Calcular métricas ────────────────────────────────
    const facturasDelPeriodo = appData.facturas.filter(f => _fechaEnRango(f.fecha, desde, hasta));
    const gastosDelPeriodo   = appData.gastos.filter(g => _fechaEnRango(g.fecha, desde, hasta));
    const citasDelPeriodo    = appData.citas.filter(c => _fechaEnRango(c.fecha, desde, hasta));
    const labDelPeriodo      = (appData.laboratorios || []).filter(o => _fechaEnRango(o.fechaCreacion, desde, hasta));

    // Ingresos: suma de pagos cuya fecha cae en el período (no la fecha de factura)
    const pagosDelPeriodo = appData.facturas
        .flatMap(f => (f.pagos || []).map(p => ({ ...p, facturaId: f.id, paciente: f.paciente, profesional: f.profesional })))
        .filter(p => _fechaEnRango(p.fecha, desde, hasta));

    const totalCobrado    = pagosDelPeriodo.reduce((s, p) => s + p.monto, 0);
    const totalGastos     = gastosDelPeriodo.reduce((s, g) => s + g.monto, 0);
    const balanceNeto     = totalCobrado - totalGastos;
    const pendienteCobro  = facturasDelPeriodo.reduce((s, f) => {
        const pagado = (f.pagos || []).reduce((a, p) => a + p.monto, 0);
        return s + Math.max(0, f.total - pagado);
    }, 0);
    const totalFacturado  = facturasDelPeriodo.reduce((s, f) => s + f.total, 0);

    // Desglose por método de pago
    const efectivo      = pagosDelPeriodo.filter(p => p.metodo === 'efectivo').reduce((s, p) => s + p.monto, 0);
    const tarjeta       = pagosDelPeriodo.filter(p => p.metodo === 'tarjeta').reduce((s, p) => s + p.monto, 0);
    const transferencia = pagosDelPeriodo.filter(p => p.metodo === 'transferencia').reduce((s, p) => s + p.monto, 0);

    // Por profesional
    const porProfesional = {};
    facturasDelPeriodo.forEach(f => {
        const p = f.profesional || 'Sin asignar';
        if (!porProfesional[p]) porProfesional[p] = { facturado: 0, cobrado: 0, facturas: 0, pacientesSet: new Set() };
        porProfesional[p].facturado += f.total;
        porProfesional[p].cobrado   += (f.pagos || []).reduce((s, pg) => s + pg.monto, 0);
        porProfesional[p].facturas  += 1;
        if (f.paciente) porProfesional[p].pacientesSet.add(f.paciente);
    });

    // Top procedimientos
    const procCount = {};
    facturasDelPeriodo.forEach(f => {
        (f.procedimientos || []).forEach(p => {
            const desc = p.descripcion || 'Sin nombre';
            if (!procCount[desc]) procCount[desc] = { cantidad: 0, ingresos: 0 };
            procCount[desc].cantidad += (p.cantidad || 1);
            procCount[desc].ingresos += (p.cantidad || 1) * (p.precioUnitario || 0);
        });
    });
    const topProc = Object.entries(procCount)
        .sort((a, b) => b[1].cantidad - a[1].cantidad)
        .slice(0, 8);

    // Citas por estado
    const citasEstados = {};
    citasDelPeriodo.forEach(c => {
        const e = c.estado || 'Pendiente';
        citasEstados[e] = (citasEstados[e] || 0) + 1;
    });

    // Laboratorio
    const labEstados = {};
    labDelPeriodo.forEach(o => {
        const e = o.estadoActual || 'Desconocido';
        labEstados[e] = (labEstados[e] || 0) + 1;
    });
    const costoLab    = labDelPeriodo.reduce((s, o) => s + (o.costo  || 0), 0);
    const ingresoLab  = labDelPeriodo.reduce((s, o) => s + (o.precio || 0), 0);
    const margenLab   = ingresoLab - costoLab;

    // Pacientes nuevos (registrados en el período)
    const pacientesNuevos = (appData.pacientes || []).filter(p => _fechaEnRango(p.fechaCreacion, desde, hasta)).length;

    // ── Renderizar ────────────────────────────────────────
    _renderReporteResumen({ totalCobrado, totalGastos, balanceNeto, pendienteCobro, totalFacturado, efectivo, tarjeta, transferencia, pagosDelPeriodo, desde, hasta });
    _renderReporteProfesional(porProfesional);
    _renderReporteTopProc(topProc);
    _renderReporteCitas(citasEstados, citasDelPeriodo.length, pacientesNuevos);
    if (hasModule('laboratorio')) _renderReporteLab(labEstados, labDelPeriodo.length, costoLab, ingresoLab, margenLab);
}

function _pct(parte, total) {
    if (!total) return 0;
    return Math.round((parte / total) * 100);
}

function _barraMetodo(label, monto, total, color) {
    const pct = _pct(monto, total);
    return `
        <div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <span style="font-size:13px;color:var(--mid)">${label}</span>
                <span style="font-size:13px;font-weight:500;color:var(--dark)">${formatCurrency(monto)} <span style="color:var(--mid);font-weight:400">${pct}%</span></span>
            </div>
            <div style="height:5px;background:rgba(30,28,26,0.07);border-radius:100px;overflow:hidden">
                <div style="height:100%;width:${pct}%;background:${color};border-radius:100px;transition:width 0.4s ease"></div>
            </div>
        </div>`;
}

function _renderReporteResumen({ totalCobrado, totalGastos, balanceNeto, pendienteCobro, totalFacturado, efectivo, tarjeta, transferencia, pagosDelPeriodo, desde, hasta }) {
    const el = document.getElementById('reporteResumenFinanciero');
    if (!el) return;

    const margenPct = totalFacturado > 0 ? _pct(totalCobrado, totalFacturado) : 0;
    const gastosPct = totalCobrado > 0 ? _pct(totalGastos, totalCobrado) : 0;

    el.innerHTML = `
        <!-- KPIs principales -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">
            <div style="background:rgba(107,143,113,0.08);border:1.5px solid rgba(107,143,113,0.2);border-radius:14px;padding:16px">
                <div style="font-size:11px;color:var(--mid);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">Cobrado</div>
                <div style="font-size:26px;font-weight:300;color:var(--green,#6B8F71);line-height:1">${formatCurrency(totalCobrado)}</div>
                <div style="font-size:11px;color:var(--mid);margin-top:4px">${pagosDelPeriodo.length} pago${pagosDelPeriodo.length !== 1 ? 's' : ''}</div>
            </div>
            <div style="background:rgba(196,133,106,0.08);border:1.5px solid rgba(196,133,106,0.2);border-radius:14px;padding:16px">
                <div style="font-size:11px;color:var(--mid);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">Pendiente</div>
                <div style="font-size:26px;font-weight:300;color:var(--terracota,#C4856A);line-height:1">${formatCurrency(pendienteCobro)}</div>
                <div style="font-size:11px;color:var(--mid);margin-top:4px">${margenPct}% de recuperación</div>
            </div>
            <div style="background:rgba(196,133,106,0.05);border:1.5px solid rgba(30,28,26,0.07);border-radius:14px;padding:16px">
                <div style="font-size:11px;color:var(--mid);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">Gastos</div>
                <div style="font-size:26px;font-weight:300;color:var(--red,#C47070);line-height:1">${formatCurrency(totalGastos)}</div>
                <div style="font-size:11px;color:var(--mid);margin-top:4px">${gastosPct}% del cobrado</div>
            </div>
            <div style="background:${balanceNeto >= 0 ? 'rgba(107,143,113,0.05)' : 'rgba(196,113,113,0.05)'};border:1.5px solid ${balanceNeto >= 0 ? 'rgba(107,143,113,0.15)' : 'rgba(196,113,113,0.15)'};border-radius:14px;padding:16px">
                <div style="font-size:11px;color:var(--mid);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">Balance neto</div>
                <div style="font-size:26px;font-weight:300;color:${balanceNeto >= 0 ? 'var(--green,#6B8F71)' : 'var(--red,#C47070)'};line-height:1">${formatCurrency(balanceNeto)}</div>
                <div style="font-size:11px;color:var(--mid);margin-top:4px">Cobrado − gastos</div>
            </div>
        </div>

        <!-- Métodos de pago -->
        ${totalCobrado > 0 ? `
        <div style="border-top:1px solid rgba(30,28,26,0.07);padding-top:16px;margin-bottom:4px">
            <div style="font-size:11px;color:var(--mid);letter-spacing:1px;text-transform:uppercase;margin-bottom:12px">Métodos de cobro</div>
            ${_barraMetodo('💵 Efectivo',       efectivo,      totalCobrado, 'var(--green,#6B8F71)')}
            ${_barraMetodo('💳 Tarjeta',        tarjeta,       totalCobrado, 'var(--azul,#7B8FA1)')}
            ${_barraMetodo('🔄 Transferencia',  transferencia, totalCobrado, 'var(--terracota,#C4856A)')}
        </div>` : ''}
    `;
}

function _renderReporteProfesional(porProfesional) {
    const el = document.getElementById('reportePorProfesional');
    if (!el) return;
    const entries = Object.entries(porProfesional).sort((a, b) => b[1].cobrado - a[1].cobrado);
    if (entries.length === 0) {
        el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--mid);font-size:13px">Sin facturas en este período</div>';
        return;
    }
    const maxCobrado = Math.max(...entries.map(e => e[1].cobrado), 1);
    el.innerHTML = entries.map(([nombre, d]) => {
        const cobradoPct = _pct(d.cobrado, maxCobrado);
        const recuperacion = d.facturado > 0 ? _pct(d.cobrado, d.facturado) : 0;
        const colorRecup = recuperacion >= 80 ? 'var(--green,#6B8F71)' : recuperacion >= 50 ? '#E8A838' : 'var(--red,#C47070)';
        return `
            <div style="padding:14px 0;border-bottom:1px solid rgba(30,28,26,0.06)">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                    <div>
                        <div style="font-size:14px;font-weight:400;color:var(--dark)">${nombre}</div>
                        <div style="font-size:12px;color:var(--mid);margin-top:2px">${d.facturas} factura${d.facturas!==1?'s':''} · ${d.pacientesSet.size} paciente${d.pacientesSet.size!==1?'s':''}</div>
                    </div>
                    <div style="text-align:right">
                        <div style="font-size:15px;font-weight:500;color:var(--dark)">${formatCurrency(d.cobrado)}</div>
                        <div style="font-size:11px;color:${colorRecup};margin-top:2px">${recuperacion}% recuperado</div>
                    </div>
                </div>
                <div style="height:4px;background:rgba(30,28,26,0.07);border-radius:100px;overflow:hidden">
                    <div style="height:100%;width:${cobradoPct}%;background:var(--clinic-color,#C4856A);border-radius:100px;transition:width 0.5s ease"></div>
                </div>
            </div>`;
    }).join('');
}

function _renderReporteTopProc(topProc) {
    const el = document.getElementById('reporteTopProcedimientos');
    if (!el) return;
    if (topProc.length === 0) {
        el.innerHTML = '<li style="text-align:center;padding:24px;color:var(--mid);font-size:13px">Sin procedimientos en este período</li>';
        return;
    }
    const maxCantidad = topProc[0][1].cantidad;
    el.innerHTML = topProc.map(([desc, d], i) => {
        const pct = _pct(d.cantidad, maxCantidad);
        return `
            <li style="padding:12px 0;border-bottom:1px solid rgba(30,28,26,0.06)">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                    <div style="display:flex;align-items:center;gap:10px">
                        <span style="font-size:11px;font-weight:600;color:var(--mid);width:18px;text-align:right">${i+1}</span>
                        <span style="font-size:14px;color:var(--dark)">${desc}</span>
                    </div>
                    <div style="text-align:right">
                        <span style="font-size:13px;font-weight:500;color:var(--dark)">${d.cantidad}×</span>
                        <span style="font-size:12px;color:var(--mid);margin-left:6px">${formatCurrency(d.ingresos)}</span>
                    </div>
                </div>
                <div style="height:3px;background:rgba(30,28,26,0.07);border-radius:100px;overflow:hidden;margin-left:28px">
                    <div style="height:100%;width:${pct}%;background:var(--clinic-color,#C4856A);opacity:${1 - i*0.1};border-radius:100px;transition:width 0.5s ease"></div>
                </div>
            </li>`;
    }).join('');
}

function _renderReporteCitas(citasEstados, totalCitas, pacientesNuevos) {
    const el = document.getElementById('reporteEstadoCitas');
    if (!el) return;

    const ordenEstados = ['Completada', 'Confirmada', 'Pendiente', 'En Sala de Espera', 'Cancelada', 'Inasistencia'];
    const coloresEstados = {
        'Completada':        'var(--green,#6B8F71)',
        'Confirmada':        'var(--azul,#7B8FA1)',
        'Pendiente':         '#E8A838',
        'En Sala de Espera': 'var(--terracota,#C4856A)',
        'Cancelada':         'var(--mid,#9C9189)',
        'Inasistencia':      'var(--red,#C47070)',
    };

    el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <div>
                <span style="font-size:28px;font-weight:300;color:var(--dark)">${totalCitas}</span>
                <span style="font-size:13px;color:var(--mid);margin-left:6px">citas</span>
            </div>
            ${pacientesNuevos > 0 ? `
            <div style="background:rgba(107,143,113,0.08);border:1px solid rgba(107,143,113,0.2);border-radius:100px;padding:6px 14px">
                <span style="font-size:12px;color:var(--green,#6B8F71);font-weight:500">+${pacientesNuevos} paciente${pacientesNuevos!==1?'s':''} nuevos</span>
            </div>` : ''}
        </div>
        ${totalCitas === 0 ? '<div style="text-align:center;padding:16px;color:var(--mid);font-size:13px">Sin citas en este período</div>' :
        ordenEstados.filter(e => citasEstados[e]).map(estado => {
            const n = citasEstados[estado] || 0;
            const pct = _pct(n, totalCitas);
            return `
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
                    <div style="width:8px;height:8px;border-radius:50%;background:${coloresEstados[estado]};flex-shrink:0"></div>
                    <span style="font-size:13px;color:var(--mid);flex:1">${estado}</span>
                    <span style="font-size:13px;font-weight:500;color:var(--dark)">${n}</span>
                    <span style="font-size:11px;color:var(--mid);width:32px;text-align:right">${pct}%</span>
                </div>`;
        }).join('')}
    `;
}

function _renderReporteLab(labEstados, totalOrdenes, costoLab, ingresoLab, margenLab) {
    const el = document.getElementById('reporteLaboratorio');
    if (!el) return;
    if (totalOrdenes === 0) {
        el.innerHTML = '<div style="text-align:center;padding:16px;color:var(--mid);font-size:13px">Sin órdenes de laboratorio en este período</div>';
        return;
    }
    const margenPct = ingresoLab > 0 ? _pct(margenLab, ingresoLab) : 0;
    const ordenEstados = ['Toma de impresión','Enviado a laboratorio','Listo para prueba','Reenviado a laboratorio','Entregado'];
    el.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">
            <div style="text-align:center">
                <div style="font-size:22px;font-weight:300;color:var(--dark)">${totalOrdenes}</div>
                <div style="font-size:11px;color:var(--mid);margin-top:2px">Órdenes</div>
            </div>
            <div style="text-align:center">
                <div style="font-size:22px;font-weight:300;color:var(--green,#6B8F71)">${formatCurrency(margenLab)}</div>
                <div style="font-size:11px;color:var(--mid);margin-top:2px">Margen</div>
            </div>
            <div style="text-align:center">
                <div style="font-size:22px;font-weight:300;color:${margenPct >= 30 ? 'var(--green,#6B8F71)' : 'var(--terracota,#C4856A)'}">${margenPct}%</div>
                <div style="font-size:11px;color:var(--mid);margin-top:2px">Rentabilidad</div>
            </div>
        </div>
        ${ordenEstados.filter(e => labEstados[e]).map(e => `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <div style="width:7px;height:7px;border-radius:50%;background:${getColorEstado(e)};flex-shrink:0"></div>
                <span style="font-size:13px;color:var(--mid);flex:1">${e}</span>
                <span style="font-size:13px;font-weight:500;color:var(--dark)">${labEstados[e]}</span>
            </div>`).join('')}
    `;
}

function updateReportesTab() {
    // Mostrar/ocultar card de laboratorio según módulo
    const labCard = document.getElementById('reporteCardLab');
    if (labCard) labCard.style.display = hasModule('laboratorio') ? '' : 'none';

    // Establecer período por defecto: este mes
    const desdeEl = document.getElementById('reporteFechaInicio');
    const hastaEl = document.getElementById('reporteFechaFin');
    if (desdeEl && !desdeEl.value) {
        setReportePeriodo('mes');
    } else if (desdeEl && desdeEl.value) {
        generarReporte();
    }
}


// ═══════════════════════════════════════════════════════════
// MÓDULO DE INVENTARIO
// ═══════════════════════════════════════════════════════════

const INV_CATEGORIAS = [
    'Materiales dentales', 'Anestesia', 'Instrumental', 'Equipos',
    'Higiene y desinfección', 'Papelería', 'Medicamentos', 'Otros'
];

const INV_UNIDADES = ['unidad', 'caja', 'frasco', 'sobre', 'rollo', 'par', 'kit', 'ml', 'g'];

// ── Estado UI local ──────────────────────────────────────
let _invFiltroCategoria = 'todos';
let _invFiltroAlerta    = false;
let _invBusqueda        = '';

// ── Helpers ──────────────────────────────────────────────
function _invItemsActivos() {
    return (appData.inventario || []).filter(i => i.activo !== false);
}

function _invItemsBajoStock() {
    return _invItemsActivos().filter(i => i.stock <= i.stockMinimo);
}

function _invStatsResumen() {
    const items   = _invItemsActivos();
    const bajoStock = _invItemsBajoStock();
    const valorTotal = items.reduce((s, i) => s + (i.stock * i.costo), 0);
    return { total: items.length, bajoStock: bajoStock.length, valorTotal };
}

// ── Tab principal ─────────────────────────────────────────
function updateInventarioTab() {
    const tab = document.getElementById('tab-inventario');
    if (!tab) return;

    const stats  = _invStatsResumen();
    const items  = _invItemsActivos();

    // Categorías únicas para filtro
    const cats = ['todos', ...new Set(items.map(i => i.categoria).filter(Boolean))].sort((a, b) =>
        a === 'todos' ? -1 : a.localeCompare(b));

    // Filtrar
    let lista = items;
    if (_invFiltroCategoria !== 'todos') lista = lista.filter(i => i.categoria === _invFiltroCategoria);
    if (_invFiltroAlerta)                lista = lista.filter(i => i.stock <= i.stockMinimo);
    if (_invBusqueda) {
        const q = _invBusqueda.toLowerCase();
        lista = lista.filter(i =>
            (i.nombre || '').toLowerCase().includes(q) ||
            (i.categoria || '').toLowerCase().includes(q) ||
            (i.proveedor || '').toLowerCase().includes(q)
        );
    }
    lista.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

    tab.innerHTML = `
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:12px;flex-wrap:wrap">
            <div>
                <div class="section-title" style="margin:0">Inventario</div>
                <div class="section-sub" style="margin-top:2px">${stats.total} producto${stats.total!==1?'s':''} · ${formatCurrency(stats.valorTotal)} en stock</div>
            </div>
            <button onclick="abrirModalItem(null)" style="
                padding:10px 20px;background:var(--dark,#1E1C1A);color:white;
                border:none;border-radius:100px;font-size:12px;font-family:inherit;
                letter-spacing:1px;text-transform:uppercase;cursor:pointer;white-space:nowrap">
                + Producto
            </button>
        </div>

        <!-- Stats rápidas -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
            <div style="background:var(--white);border-radius:14px;padding:14px;border:1.5px solid rgba(30,28,26,0.07);text-align:center">
                <div style="font-size:24px;font-weight:300;color:var(--dark)">${stats.total}</div>
                <div style="font-size:11px;color:var(--mid);letter-spacing:0.5px;margin-top:2px">Productos</div>
            </div>
            <div style="background:var(--white);border-radius:14px;padding:14px;border:1.5px solid ${stats.bajoStock > 0 ? 'rgba(196,113,113,0.3)' : 'rgba(30,28,26,0.07)'};text-align:center;cursor:${stats.bajoStock > 0 ? 'pointer' : 'default'}"
                 onclick="${stats.bajoStock > 0 ? '_invToggleAlerta()' : ''}">
                <div style="font-size:24px;font-weight:300;color:${stats.bajoStock > 0 ? 'var(--red,#C47070)' : 'var(--green,#6B8F71)'}">${stats.bajoStock}</div>
                <div style="font-size:11px;color:var(--mid);letter-spacing:0.5px;margin-top:2px">Bajo stock</div>
            </div>
            <div style="background:var(--white);border-radius:14px;padding:14px;border:1.5px solid rgba(30,28,26,0.07);text-align:center">
                <div style="font-size:24px;font-weight:300;color:var(--dark)">${cats.length - 1}</div>
                <div style="font-size:11px;color:var(--mid);letter-spacing:0.5px;margin-top:2px">Categorías</div>
            </div>
        </div>

        <!-- Búsqueda -->
        <div style="position:relative;margin-bottom:12px">
            <input type="text" id="invBusqueda" placeholder="Buscar producto, categoría, proveedor…"
                value="${_invBusqueda}"
                oninput="_invBusqueda=this.value;updateInventarioTab()"
                style="width:100%;padding:11px 16px 11px 40px;border:1.5px solid rgba(30,28,26,0.12);
                       border-radius:100px;font-size:14px;font-family:inherit;outline:none;
                       background:var(--white);box-sizing:border-box;color:var(--dark)"
                onfocus="this.style.borderColor='var(--clinic-color)'"
                onblur="this.style.borderColor='rgba(30,28,26,0.12)'">
            <span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:16px;pointer-events:none">🔍</span>
            ${_invBusqueda ? `<button onclick="_invBusqueda='';updateInventarioTab()" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);background:none;border:none;font-size:18px;color:var(--mid);cursor:pointer;line-height:1">✕</button>` : ''}
        </div>

        <!-- Filtros de categoría -->
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">
            ${cats.map(c => `
                <button onclick="_invFiltroCategoria='${c}';updateInventarioTab()"
                    style="padding:6px 14px;border:1.5px solid ${_invFiltroCategoria===c ? 'var(--clinic-color)' : 'rgba(30,28,26,0.12)'};
                           border-radius:100px;font-size:12px;font-family:inherit;cursor:pointer;transition:all 0.15s;
                           background:${_invFiltroCategoria===c ? 'var(--clinic-color)' : 'none'};
                           color:${_invFiltroCategoria===c ? 'white' : 'var(--mid)'}">
                    ${c === 'todos' ? 'Todos' : c}
                </button>`).join('')}
            ${stats.bajoStock > 0 ? `
            <button onclick="_invToggleAlerta()"
                style="padding:6px 14px;border:1.5px solid ${_invFiltroAlerta ? 'var(--red,#C47070)' : 'rgba(196,113,113,0.3)'};
                       border-radius:100px;font-size:12px;font-family:inherit;cursor:pointer;transition:all 0.15s;
                       background:${_invFiltroAlerta ? 'var(--red,#C47070)' : 'none'};
                       color:${_invFiltroAlerta ? 'white' : 'var(--red,#C47070)'}">
                ⚠️ Stock bajo (${stats.bajoStock})
            </button>` : ''}
        </div>

        <!-- Lista de productos -->
        <div id="invLista">
            ${lista.length === 0 ? `
                <div style="text-align:center;padding:60px 24px">
                    <div style="font-size:40px;margin-bottom:12px">📦</div>
                    <div style="font-size:16px;font-weight:300;color:var(--dark);margin-bottom:6px">
                        ${items.length === 0 ? 'Sin productos aún' : 'Sin resultados'}
                    </div>
                    <div style="font-size:13px;color:var(--mid)">
                        ${items.length === 0 ? 'Agrega los materiales y productos de tu clínica' : 'Prueba con otro filtro o búsqueda'}
                    </div>
                </div>
            ` : lista.map(item => _invRenderItem(item)).join('')}
        </div>
    `;
}

function _invToggleAlerta() {
    _invFiltroAlerta = !_invFiltroAlerta;
    updateInventarioTab();
}

function _invRenderItem(item) {
    const bajoStock   = item.stock <= item.stockMinimo;
    const sinStock    = item.stock === 0;
    const stockColor  = sinStock ? 'var(--red,#C47070)' : bajoStock ? '#E8A838' : 'var(--green,#6B8F71)';
    const stockBg     = sinStock ? 'rgba(196,113,113,0.08)' : bajoStock ? 'rgba(232,168,56,0.08)' : 'rgba(107,143,113,0.08)';
    const stockBorder = sinStock ? 'rgba(196,113,113,0.25)' : bajoStock ? 'rgba(232,168,56,0.25)' : 'rgba(107,143,113,0.2)';

    return `
    <div style="background:var(--white);border-radius:14px;padding:16px;margin-bottom:8px;
                border:1.5px solid ${bajoStock ? (sinStock ? 'rgba(196,113,113,0.2)' : 'rgba(232,168,56,0.2)') : 'rgba(30,28,26,0.07)'};
                transition:border-color 0.2s">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
            <!-- Info -->
            <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
                    <span style="font-size:15px;font-weight:400;color:var(--dark)">${item.nombre}</span>
                    ${item.categoria ? `<span style="font-size:10px;color:var(--mid);background:rgba(30,28,26,0.05);padding:2px 8px;border-radius:100px;letter-spacing:0.5px">${item.categoria}</span>` : ''}
                </div>
                <div style="font-size:12px;color:var(--mid)">
                    ${item.proveedor ? `${item.proveedor} · ` : ''}${formatCurrency(item.costo)} / ${item.unidad || 'unidad'}
                </div>
            </div>

            <!-- Stock badge -->
            <div style="background:${stockBg};border:1.5px solid ${stockBorder};border-radius:10px;padding:8px 12px;text-align:center;flex-shrink:0">
                <div style="font-size:20px;font-weight:300;color:${stockColor};line-height:1">${item.stock}</div>
                <div style="font-size:10px;color:var(--mid);letter-spacing:0.3px;margin-top:1px">${item.unidad || 'uds'}</div>
            </div>
        </div>

        <!-- Barra de stock -->
        <div style="margin-top:10px;margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                <span style="font-size:11px;color:var(--mid)">Stock actual</span>
                <span style="font-size:11px;color:var(--mid)">Mínimo: ${item.stockMinimo}</span>
            </div>
            <div style="height:4px;background:rgba(30,28,26,0.07);border-radius:100px;overflow:hidden">
                <div style="height:100%;border-radius:100px;background:${stockColor};
                            width:${item.stockMinimo > 0 ? Math.min(100, Math.round((item.stock / (item.stockMinimo * 3)) * 100)) : (item.stock > 0 ? 100 : 0)}%;
                            transition:width 0.4s ease"></div>
            </div>
            ${bajoStock ? `<div style="font-size:11px;color:${stockColor};margin-top:4px">
                ${sinStock ? '⚠️ Sin stock' : '⚠️ Bajo el mínimo — considera reponer'}
            </div>` : ''}
        </div>

        <!-- Acciones -->
        <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button onclick="abrirModalMovimiento('${item.id}', 'entrada')"
                style="padding:7px 14px;background:rgba(107,143,113,0.1);border:1.5px solid rgba(107,143,113,0.25);
                       border-radius:100px;font-size:12px;font-family:inherit;color:var(--green,#6B8F71);cursor:pointer">
                + Entrada
            </button>
            <button onclick="abrirModalMovimiento('${item.id}', 'salida')"
                style="padding:7px 14px;background:rgba(196,113,113,0.08);border:1.5px solid rgba(196,113,113,0.2);
                       border-radius:100px;font-size:12px;font-family:inherit;color:var(--red,#C47070);cursor:pointer">
                − Salida
            </button>
            <button onclick="abrirModalMovimiento('${item.id}', 'ajuste')"
                style="padding:7px 14px;background:rgba(123,143,161,0.08);border:1.5px solid rgba(123,143,161,0.2);
                       border-radius:100px;font-size:12px;font-family:inherit;color:var(--azul,#7B8FA1);cursor:pointer">
                ⟳ Ajuste
            </button>
            <button onclick="abrirModalItem('${item.id}')"
                style="padding:7px 14px;background:none;border:1.5px solid rgba(30,28,26,0.12);
                       border-radius:100px;font-size:12px;font-family:inherit;color:var(--mid);cursor:pointer;margin-left:auto">
                Editar
            </button>
        </div>
    </div>`;
}

// ── Modal: Crear / Editar producto ───────────────────────
function abrirModalItem(idONull) {
    const item = idONull ? (appData.inventario || []).find(i => i.id === idONull) : null;
    const esNuevo = !item;

    const categoriaOptions = INV_CATEGORIAS.map(c =>
        `<option value="${c}" ${item?.categoria === c ? 'selected' : ''}>${c}</option>`
    ).join('');
    const unidadOptions = INV_UNIDADES.map(u =>
        `<option value="${u}" ${(item?.unidad || 'unidad') === u ? 'selected' : ''}>${u}</option>`
    ).join('');

    mostrarModal({
        titulo: esNuevo ? 'Nuevo producto' : 'Editar producto',
        body: `
            <div style="display:flex;flex-direction:column;gap:14px">
                <div>
                    <label style="font-size:11px;font-weight:500;color:var(--mid);letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:6px">Nombre *</label>
                    <input type="text" id="invNombre" value="${item?.nombre || ''}" placeholder="Ej: Guantes de látex"
                        style="width:100%;padding:11px 14px;border:1.5px solid rgba(30,28,26,0.12);border-radius:10px;font-size:15px;font-family:inherit;outline:none;box-sizing:border-box"
                        onfocus="this.style.borderColor='var(--clinic-color)'" onblur="this.style.borderColor='rgba(30,28,26,0.12)'">
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                    <div>
                        <label style="font-size:11px;font-weight:500;color:var(--mid);letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:6px">Categoría</label>
                        <select id="invCategoria"
                            style="width:100%;padding:11px 14px;border:1.5px solid rgba(30,28,26,0.12);border-radius:10px;font-size:14px;font-family:inherit;outline:none;background:white;box-sizing:border-box">
                            <option value="">Sin categoría</option>
                            ${categoriaOptions}
                        </select>
                    </div>
                    <div>
                        <label style="font-size:11px;font-weight:500;color:var(--mid);letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:6px">Unidad</label>
                        <select id="invUnidad"
                            style="width:100%;padding:11px 14px;border:1.5px solid rgba(30,28,26,0.12);border-radius:10px;font-size:14px;font-family:inherit;outline:none;background:white;box-sizing:border-box">
                            ${unidadOptions}
                        </select>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
                    <div>
                        <label style="font-size:11px;font-weight:500;color:var(--mid);letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:6px">Stock ${esNuevo ? 'inicial' : 'actual'}</label>
                        <input type="number" id="invStock" value="${item?.stock ?? 0}" min="0"
                            style="width:100%;padding:11px 14px;border:1.5px solid rgba(30,28,26,0.12);border-radius:10px;font-size:15px;font-family:inherit;outline:none;box-sizing:border-box"
                            onfocus="this.style.borderColor='var(--clinic-color)'" onblur="this.style.borderColor='rgba(30,28,26,0.12)'">
                    </div>
                    <div>
                        <label style="font-size:11px;font-weight:500;color:var(--mid);letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:6px">Mínimo</label>
                        <input type="number" id="invStockMinimo" value="${item?.stockMinimo ?? 5}" min="0"
                            style="width:100%;padding:11px 14px;border:1.5px solid rgba(30,28,26,0.12);border-radius:10px;font-size:15px;font-family:inherit;outline:none;box-sizing:border-box"
                            onfocus="this.style.borderColor='var(--clinic-color)'" onblur="this.style.borderColor='rgba(30,28,26,0.12)'">
                    </div>
                    <div>
                        <label style="font-size:11px;font-weight:500;color:var(--mid);letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:6px">Costo</label>
                        <input type="number" id="invCosto" value="${item?.costo ?? 0}" min="0"
                            style="width:100%;padding:11px 14px;border:1.5px solid rgba(30,28,26,0.12);border-radius:10px;font-size:15px;font-family:inherit;outline:none;box-sizing:border-box"
                            onfocus="this.style.borderColor='var(--clinic-color)'" onblur="this.style.borderColor='rgba(30,28,26,0.12)'">
                    </div>
                </div>
                <div>
                    <label style="font-size:11px;font-weight:500;color:var(--mid);letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:6px">Proveedor</label>
                    <input type="text" id="invProveedor" value="${item?.proveedor || ''}" placeholder="Nombre del proveedor"
                        style="width:100%;padding:11px 14px;border:1.5px solid rgba(30,28,26,0.12);border-radius:10px;font-size:15px;font-family:inherit;outline:none;box-sizing:border-box"
                        onfocus="this.style.borderColor='var(--clinic-color)'" onblur="this.style.borderColor='rgba(30,28,26,0.12)'">
                </div>
                <div>
                    <label style="font-size:11px;font-weight:500;color:var(--mid);letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:6px">Notas</label>
                    <textarea id="invNotas" placeholder="Observaciones, código de referencia, etc." rows="2"
                        style="width:100%;padding:11px 14px;border:1.5px solid rgba(30,28,26,0.12);border-radius:10px;font-size:14px;font-family:inherit;outline:none;resize:vertical;box-sizing:border-box"
                        onfocus="this.style.borderColor='var(--clinic-color)'" onblur="this.style.borderColor='rgba(30,28,26,0.12)'">${item?.notas || ''}</textarea>
                </div>
                ${!esNuevo ? `
                <div style="padding-top:8px;border-top:1px solid rgba(30,28,26,0.07)">
                    <button onclick="confirmarEliminarItem('${item.id}')"
                        style="background:none;border:none;color:var(--red,#C47070);font-size:13px;font-family:inherit;cursor:pointer;padding:0">
                        Eliminar producto →
                    </button>
                </div>` : ''}
            </div>
        `,
        confirmText: esNuevo ? 'Agregar' : 'Guardar',
        onConfirm: () => guardarItem(idONull)
    });
    setTimeout(() => document.getElementById('invNombre')?.focus(), 80);
}

async function guardarItem(idONull) {
    const nombre     = document.getElementById('invNombre')?.value.trim();
    const categoria  = document.getElementById('invCategoria')?.value;
    const unidad     = document.getElementById('invUnidad')?.value;
    const stock      = parseFloat(document.getElementById('invStock')?.value) || 0;
    const stockMin   = parseFloat(document.getElementById('invStockMinimo')?.value) || 0;
    const costo      = parseFloat(document.getElementById('invCosto')?.value) || 0;
    const proveedor  = document.getElementById('invProveedor')?.value.trim();
    const notas      = document.getElementById('invNotas')?.value.trim();

    if (!nombre) { showToast('⚠️ El nombre es obligatorio', 3000, '#e65100'); return; }
    if (!appData.inventario) appData.inventario = [];

    if (idONull) {
        // Editar existente
        const idx = appData.inventario.findIndex(i => i.id === idONull);
        if (idx < 0) return;
        const backup = { ...appData.inventario[idx] };
        appData.inventario[idx] = { ...appData.inventario[idx], nombre, categoria, unidad, stockMinimo: stockMin, costo, proveedor, notas };
        try {
            await saveData('editarItem');
            cerrarModal();
            updateInventarioTab();
            showToast('✓ Producto actualizado');
        } catch(e) {
            appData.inventario[idx] = backup;
            showError('Error al guardar el producto.', e);
        }
    } else {
        // Crear nuevo
        const nuevoItem = {
            id: generateId('INV-'), nombre, categoria, unidad,
            stock, stockMinimo: stockMin, costo, proveedor, notas,
            activo: true,
            movimientos: stock > 0 ? [{
                tipo: 'entrada', cantidad: stock, motivo: 'Stock inicial',
                usuario: appData.currentUser, fecha: new Date().toISOString()
            }] : []
        };
        appData.inventario.push(nuevoItem);
        try {
            await saveData('crearItem');
            cerrarModal();
            updateInventarioTab();
            showToast('✓ Producto agregado');
        } catch(e) {
            appData.inventario.pop();
            showError('Error al guardar el producto.', e);
        }
    }
}

// ── Modal: Movimiento de stock ───────────────────────────
function abrirModalMovimiento(itemId, tipoInicial) {
    const item = (appData.inventario || []).find(i => i.id === itemId);
    if (!item) return;

    mostrarModal({
        titulo: `${item.nombre}`,
        body: `
            <div style="background:rgba(30,28,26,0.03);border-radius:10px;padding:12px 14px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:13px;color:var(--mid)">Stock actual</span>
                <span style="font-size:22px;font-weight:300;color:var(--dark)">${item.stock} <span style="font-size:13px;color:var(--mid)">${item.unidad || 'uds'}</span></span>
            </div>
            <div style="display:flex;flex-direction:column;gap:14px">
                <div>
                    <label style="font-size:11px;font-weight:500;color:var(--mid);letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:6px">Tipo</label>
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px" id="movTipoSelector">
                        ${['entrada','salida','ajuste'].map(t => `
                        <button id="movBtn_${t}" onclick="invSeleccionarTipo('${t}')"
                            style="padding:10px;border-radius:10px;font-size:13px;font-family:inherit;cursor:pointer;transition:all 0.15s;
                                   border:1.5px solid ${tipoInicial===t ? (_tipoColor(t)+';background:'+_tipoBg(t)) : 'rgba(30,28,26,0.12);background:none'};
                                   color:${tipoInicial===t ? _tipoColor(t) : 'var(--mid)'}">
                            ${t === 'entrada' ? '+ Entrada' : t === 'salida' ? '− Salida' : '⟳ Ajuste'}
                        </button>`).join('')}
                    </div>
                    <input type="hidden" id="movTipo" value="${tipoInicial}">
                </div>
                <div>
                    <label style="font-size:11px;font-weight:500;color:var(--mid);letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:6px" id="movCantidadLabel">
                        ${tipoInicial === 'ajuste' ? 'Stock nuevo total' : 'Cantidad'}
                    </label>
                    <input type="number" id="movCantidad" value="" min="0" placeholder="0"
                        style="width:100%;padding:12px 14px;border:1.5px solid rgba(30,28,26,0.12);border-radius:10px;font-size:18px;font-family:inherit;outline:none;box-sizing:border-box;text-align:center"
                        onfocus="this.style.borderColor='var(--clinic-color)'" onblur="this.style.borderColor='rgba(30,28,26,0.12)'"
                        onkeydown="if(event.key==='Enter')registrarMovimiento('${itemId}')">
                </div>
                <div>
                    <label style="font-size:11px;font-weight:500;color:var(--mid);letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:6px">Motivo</label>
                    <input type="text" id="movMotivo" placeholder="${tipoInicial==='entrada' ? 'Ej: Compra a proveedor' : tipoInicial==='salida' ? 'Ej: Uso en procedimientos' : 'Ej: Conteo físico'}"
                        style="width:100%;padding:11px 14px;border:1.5px solid rgba(30,28,26,0.12);border-radius:10px;font-size:14px;font-family:inherit;outline:none;box-sizing:border-box"
                        onfocus="this.style.borderColor='var(--clinic-color)'" onblur="this.style.borderColor='rgba(30,28,26,0.12)'">
                </div>
                <!-- Historial últimos movimientos -->
                ${_renderUltimosMovimientos(item)}
            </div>
        `,
        confirmText: 'Registrar',
        onConfirm: () => registrarMovimiento(itemId)
    });
    setTimeout(() => document.getElementById('movCantidad')?.focus(), 80);
}

function _tipoColor(tipo) {
    return tipo === 'entrada' ? 'var(--green,#6B8F71)' : tipo === 'salida' ? 'var(--red,#C47070)' : 'var(--azul,#7B8FA1)';
}
function _tipoBg(tipo) {
    return tipo === 'entrada' ? 'rgba(107,143,113,0.08)' : tipo === 'salida' ? 'rgba(196,113,113,0.08)' : 'rgba(123,143,161,0.08)';
}

function invSeleccionarTipo(tipo) {
    document.getElementById('movTipo').value = tipo;
    ['entrada','salida','ajuste'].forEach(t => {
        const btn = document.getElementById('movBtn_' + t);
        if (!btn) return;
        if (t === tipo) {
            btn.style.border = `1.5px solid ${_tipoColor(tipo)}`;
            btn.style.background = _tipoBg(tipo);
            btn.style.color = _tipoColor(tipo);
        } else {
            btn.style.border = '1.5px solid rgba(30,28,26,0.12)';
            btn.style.background = 'none';
            btn.style.color = 'var(--mid)';
        }
    });
    const label = document.getElementById('movCantidadLabel');
    if (label) label.textContent = tipo === 'ajuste' ? 'Stock nuevo total' : 'Cantidad';
    const motivo = document.getElementById('movMotivo');
    if (motivo) motivo.placeholder = tipo === 'entrada' ? 'Ej: Compra a proveedor' : tipo === 'salida' ? 'Ej: Uso en procedimientos' : 'Ej: Conteo físico';
}

function _renderUltimosMovimientos(item) {
    const movs = (item.movimientos || []).slice(-5).reverse();
    if (movs.length === 0) return '';
    return `
        <div style="border-top:1px solid rgba(30,28,26,0.07);padding-top:12px">
            <div style="font-size:11px;color:var(--mid);letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">Últimos movimientos</div>
            ${movs.map(m => {
                const esEntrada = m.tipo === 'entrada';
                const esAjuste  = m.tipo === 'ajuste';
                const color = esAjuste ? 'var(--azul,#7B8FA1)' : esEntrada ? 'var(--green,#6B8F71)' : 'var(--red,#C47070)';
                const signo = esAjuste ? '⟳' : esEntrada ? '+' : '−';
                const fecha = m.fecha ? new Date(m.fecha).toLocaleDateString(getLocale(), {day:'numeric',month:'short'}) : '';
                return `
                    <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid rgba(30,28,26,0.05)">
                        <span style="font-size:13px;font-weight:600;color:${color};width:28px;flex-shrink:0">${signo}${m.cantidad}</span>
                        <span style="font-size:12px;color:var(--mid);flex:1">${m.motivo || '—'}</span>
                        <span style="font-size:11px;color:var(--light)">${fecha}</span>
                    </div>`;
            }).join('')}
        </div>`;
}

async function registrarMovimiento(itemId) {
    const idx = (appData.inventario || []).findIndex(i => i.id === itemId);
    if (idx < 0) return;

    const tipo     = document.getElementById('movTipo')?.value || 'entrada';
    const cantidad = parseFloat(document.getElementById('movCantidad')?.value);
    const motivo   = document.getElementById('movMotivo')?.value.trim() || '';

    if (isNaN(cantidad) || cantidad < 0) {
        showToast('⚠️ Ingresa una cantidad válida', 3000, '#e65100'); return;
    }

    const item       = appData.inventario[idx];
    const stockAntes = item.stock;

    if (tipo === 'ajuste') {
        item.stock = cantidad;
    } else if (tipo === 'entrada') {
        item.stock = stockAntes + cantidad;
    } else { // salida
        if (cantidad > stockAntes) {
            showToast('⚠️ No hay suficiente stock', 3000, '#e65100'); return;
        }
        item.stock = stockAntes - cantidad;
    }

    if (!item.movimientos) item.movimientos = [];
    item.movimientos.push({
        tipo, cantidad, motivo,
        stockAntes, stockDespues: item.stock,
        usuario: appData.currentUser,
        fecha:   new Date().toISOString()
    });

    try {
        await saveData('movimientoInventario');
        cerrarModal();
        updateInventarioTab();
        const etiqueta = tipo === 'entrada' ? 'Entrada registrada' : tipo === 'salida' ? 'Salida registrada' : 'Stock ajustado';
        showToast(`✓ ${etiqueta} — ${item.nombre}: ${item.stock} ${item.unidad || 'uds'}`);
        // Alerta automática si queda bajo mínimo
        if (item.stock <= item.stockMinimo && item.stock >= 0) {
            setTimeout(() => showToast(`⚠️ ${item.nombre} está bajo el mínimo (${item.stockMinimo})`, 4000, '#e65100'), 1500);
        }
    } catch(e) {
        // Rollback
        item.stock = stockAntes;
        item.movimientos.pop();
        showError('Error al registrar el movimiento.', e);
    }
}

// ── Eliminar producto ────────────────────────────────────
function confirmarEliminarItem(itemId) {
    const item = (appData.inventario || []).find(i => i.id === itemId);
    if (!item) return;
    cerrarModal();
    mostrarConfirmacion({
        titulo: 'Eliminar producto',
        mensaje: `<strong>${item.nombre}</strong> y su historial de movimientos serán eliminados permanentemente.`,
        tipo: 'peligro',
        confirmText: 'Eliminar',
        onConfirm: async () => {
            const backup = [...appData.inventario];
            appData.inventario = appData.inventario.filter(i => i.id !== itemId);
            try {
                await saveData('eliminarItem');
                updateInventarioTab();
                showToast('✓ Producto eliminado');
            } catch(e) {
                appData.inventario = backup;
                showError('Error al eliminar el producto.', e);
            }
        }
    });
}


// ═══════════════════════════════════════════════════════════
// MÓDULO MULTISUCURSAL
// ═══════════════════════════════════════════════════════════
// Arquitectura Opción A: cada sede es una clínica independiente
// en Firebase (su propio CLINIC_PATH). Las sedes comparten:
//   - El módulo multisucursal contratado en la sede principal
//   - Branding (color + logo) heredado del padre si no tienen propio
//   - Visibilidad en el switcher de sedes del header
//
// Campos en config/settings:
//   clinicaPadre: 'id-sede-principal'   (solo en sedes hijas)
//   esSedePrincipal: true                (solo en la sede principal)
//   nombreSede: 'Sede Norte'             (etiqueta corta para el switcher)
// ═══════════════════════════════════════════════════════════

// Cache de sedes del grupo cargadas en esta sesión
let _sedesGrupo = []; // [{ id, nombre, nombreSede, activa, esCurrent }]

async function _cargarSedesGrupo() {
    _sedesGrupo = [];
    if (!hasModule('multisucursal')) return;
    if (!CLINIC_PATH) return;

    try {
        // La sede actual siempre está en el grupo
        _sedesGrupo.push({
            id:         CLINIC_PATH,
            nombre:     clinicConfig.nombre     || CLINIC_PATH,
            nombreSede: clinicConfig.nombreSede || (clinicConfig.esSede ? clinicConfig.nombre : 'Sede principal'),
            activa:     true,
            esCurrent:  true,
        });

        // Las sedes hermanas están registradas como array en el config de la sede padre.
        // Si somos una sede hija, usamos clinicaPadre para leer ese array.
        // Solo se hacen lecturas a rutas explícitas — nunca a toda la colección.
        const padreId = clinicConfig.clinicaPadre || CLINIC_PATH;

        const padreDoc = await db.collection('clinicas').doc(padreId)
            .collection('config').doc('settings').get();
        if (!padreDoc.exists) return;

        const padreData = padreDoc.data();

        // Si somos la sede hija, agregar la sede principal primero (al inicio)
        if (clinicConfig.esSede) {
            _sedesGrupo.unshift({
                id:         padreId,
                nombre:     padreData.nombre     || padreId,
                nombreSede: padreData.nombreSede || 'Sede principal',
                activa:     padreData.activa !== false,
                esCurrent:  false,
            });
        }

        // Leer el registro de sedes hijas desde el config del padre
        const sedesRegistradas = padreData.sedesHijas || []; // [{ id, nombre, nombreSede, activa }]
        for (const s of sedesRegistradas) {
            if (s.id === CLINIC_PATH) continue; // ya está como current
            _sedesGrupo.push({
                id:         s.id,
                nombre:     s.nombre     || s.id,
                nombreSede: s.nombreSede || s.nombre || s.id,
                activa:     s.activa !== false,
                esCurrent:  false,
            });
        }
    } catch(e) {
        // No logear como error crítico — puede ser que la clínica aún no tiene sedes
        console.warn('[Multisucursal] No se pudieron cargar las sedes:', e.message);
    }
}

function _renderSwitcherSedes() {
    // Eliminar switcher previo
    const previo = document.getElementById('sedesSwitcher');
    if (previo) previo.remove();

    if (!hasModule('multisucursal') || _sedesGrupo.length < 2) return;

    const actual = _sedesGrupo.find(s => s.esCurrent);
    if (!actual) return;

    const switcher = document.createElement('div');
    switcher.id = 'sedesSwitcher';
    switcher.style.cssText = `
        display:flex;align-items:center;gap:6px;
        background:rgba(255,255,255,0.12);
        border:1px solid rgba(255,255,255,0.2);
        border-radius:100px;padding:5px 12px 5px 8px;
        cursor:pointer;transition:background 0.15s;flex-shrink:0;
        position:relative;
    `;
    switcher.innerHTML = `
        <span style="font-size:14px">🏢</span>
        <span style="font-size:12px;color:rgba(255,255,255,0.9);font-weight:300;letter-spacing:0.3px;white-space:nowrap">${actual.nombreSede}</span>
        <span style="font-size:10px;color:rgba(255,255,255,0.6);margin-left:2px">▾</span>
    `;
    switcher.onclick = _toggleDropdownSedes;
    switcher.onmouseover = () => switcher.style.background = 'rgba(255,255,255,0.18)';
    switcher.onmouseout  = () => { if (!document.getElementById('sedesDropdown')) switcher.style.background = 'rgba(255,255,255,0.12)'; };

    // Insertar en el header, entre el brand y la búsqueda
    const header = document.querySelector('.app-header');
    const brand  = document.getElementById('appBrand');
    if (header && brand) {
        brand.after(switcher);
    }
}

function _toggleDropdownSedes() {
    const existing = document.getElementById('sedesDropdown');
    if (existing) { existing.remove(); return; }

    const switcher = document.getElementById('sedesSwitcher');
    if (!switcher) return;

    const dropdown = document.createElement('div');
    dropdown.id = 'sedesDropdown';
    dropdown.style.cssText = `
        position:fixed;z-index:2000;
        background:white;border-radius:16px;
        box-shadow:0 8px 32px rgba(0,0,0,0.15),0 2px 8px rgba(0,0,0,0.08);
        border:1px solid rgba(30,28,26,0.08);
        min-width:220px;overflow:hidden;
        animation:fadeIn 0.15s ease;
    `;

    // Posicionar debajo del switcher
    const rect = switcher.getBoundingClientRect();
    dropdown.style.top  = (rect.bottom + 8) + 'px';
    dropdown.style.left = rect.left + 'px';

    const sedesActivas = _sedesGrupo.filter(s => s.activa);

    dropdown.innerHTML = `
        <div style="padding:10px 14px 6px;border-bottom:1px solid rgba(30,28,26,0.06)">
            <div style="font-size:10px;color:#9C9189;letter-spacing:1.5px;text-transform:uppercase">Sedes</div>
        </div>
        ${sedesActivas.map(s => `
            <button onclick="_cambiarSede('${s.id}')" style="
                width:100%;padding:12px 16px;background:none;border:none;
                display:flex;align-items:center;gap:12px;
                font-family:inherit;font-size:14px;font-weight:300;
                color:${s.esCurrent ? 'var(--clinic-color,#C4856A)' : '#1E1C1A'};
                cursor:${s.esCurrent ? 'default' : 'pointer'};text-align:left;
                background:${s.esCurrent ? 'rgba(196,133,106,0.06)' : 'none'};
                transition:background 0.15s;
            "
            onmouseover="if(!${s.esCurrent})this.style.background='rgba(30,28,26,0.04)'"
            onmouseout="this.style.background='${s.esCurrent ? 'rgba(196,133,106,0.06)' : 'none'}'">
                <span style="font-size:16px">${s.esCurrent ? '●' : '○'}</span>
                <div>
                    <div>${s.nombreSede}</div>
                    <div style="font-size:11px;color:#9C9189;margin-top:1px">${s.nombre}</div>
                </div>
                ${s.esCurrent ? '<span style="font-size:11px;color:var(--clinic-color,#C4856A);margin-left:auto">Actual</span>' : ''}
            </button>
        `).join('')}
        ${appData.currentRole === 'admin' ? `
        <div style="border-top:1px solid rgba(30,28,26,0.06);padding:8px 0">
            <button onclick="document.getElementById('sedesDropdown')?.remove();irTab('sedes')" style="
                width:100%;padding:10px 16px;background:none;border:none;
                display:flex;align-items:center;gap:10px;
                font-family:inherit;font-size:13px;color:#9C9189;
                cursor:pointer;text-align:left;transition:background 0.15s;
            "
            onmouseover="this.style.background='rgba(30,28,26,0.04)'"
            onmouseout="this.style.background='none'">
                <span>⚙️</span> Gestionar sedes
            </button>
        </div>` : ''}
    `;

    document.body.appendChild(dropdown);

    // Cerrar al hacer click fuera
    setTimeout(() => {
        document.addEventListener('click', function _cerrarDropdown(e) {
            if (!dropdown.contains(e.target) && !switcher.contains(e.target)) {
                dropdown.remove();
                document.removeEventListener('click', _cerrarDropdown);
            }
        });
    }, 50);
}

function _cambiarSede(sedeId) {
    if (sedeId === CLINIC_PATH) {
        document.getElementById('sedesDropdown')?.remove();
        return;
    }
    // Navegar a la URL de la sede destino — misma ventana, nuevo CLINIC_PATH
    const base = window.location.origin + window.location.pathname;
    window.location.href = `${base}?clinica=${sedeId}`;
}

// ── Tab de gestión de sedes (solo admin, dentro de la app) ──

function updateSedesTab() {
    const tab = document.getElementById('tab-sedes');
    if (!tab) return;

    const esPadre = !clinicConfig.esSede;
    const sedes   = _sedesGrupo.filter(s => !s.esCurrent); // las otras sedes

    tab.innerHTML = `
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:12px;flex-wrap:wrap">
            <div>
                <div class="section-title" style="margin:0">Sedes</div>
                <div class="section-sub" style="margin-top:2px">
                    ${clinicConfig.esSede
                        ? `Eres una sede de <strong>${clinicConfig.clinicaPadre}</strong>`
                        : `Sede principal · ${_sedesGrupo.length - 1} sede${_sedesGrupo.length - 1 !== 1 ? 's' : ''} adicional${_sedesGrupo.length - 1 !== 1 ? 'es' : ''}`}
                </div>
            </div>
            ${esPadre ? `
            <button onclick="abrirModalCrearSede()" style="
                padding:10px 20px;background:var(--dark,#1E1C1A);color:white;
                border:none;border-radius:100px;font-size:12px;font-family:inherit;
                letter-spacing:1px;text-transform:uppercase;cursor:pointer;white-space:nowrap">
                + Nueva sede
            </button>` : ''}
        </div>

        <!-- Sede actual -->
        <div style="background:rgba(196,133,106,0.06);border:1.5px solid rgba(196,133,106,0.2);
                    border-radius:14px;padding:16px;margin-bottom:16px">
            <div style="font-size:11px;color:var(--mid);letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">Esta sede</div>
            <div style="font-size:16px;font-weight:400;color:var(--dark)">${clinicConfig.nombreSede || clinicConfig.nombre}</div>
            <div style="font-size:12px;color:var(--mid);margin-top:3px">${CLINIC_PATH}</div>
        </div>

        <!-- Otras sedes -->
        ${sedes.length === 0 ? `
            <div style="text-align:center;padding:48px 24px">
                <div style="font-size:36px;margin-bottom:12px">🏢</div>
                <div style="font-size:15px;font-weight:300;color:var(--dark);margin-bottom:6px">Sin sedes adicionales</div>
                <div style="font-size:13px;color:var(--mid)">
                    ${esPadre ? 'Crea una nueva sede para empezar a gestionarlas desde aquí' : 'El administrador de la sede principal puede gestionar las sedes'}
                </div>
            </div>
        ` : `
            <div style="font-size:11px;color:var(--mid);letter-spacing:1px;text-transform:uppercase;margin-bottom:12px">
                Otras sedes del grupo
            </div>
            ${sedes.map(s => `
                <div style="background:var(--white);border-radius:14px;padding:16px;margin-bottom:8px;
                            border:1.5px solid rgba(30,28,26,0.07);display:flex;align-items:center;justify-content:space-between;gap:12px">
                    <div style="flex:1;min-width:0">
                        <div style="font-size:15px;font-weight:400;color:var(--dark)">${s.nombreSede}</div>
                        <div style="font-size:12px;color:var(--mid);margin-top:2px">${s.nombre} · <code style="font-size:11px">${s.id}</code></div>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px">
                        <div style="width:8px;height:8px;border-radius:50%;background:${s.activa ? 'var(--green,#6B8F71)' : 'var(--mid)'}"></div>
                        <button onclick="_cambiarSede('${s.id}')"
                            style="padding:7px 16px;background:var(--dark,#1E1C1A);color:white;
                                   border:none;border-radius:100px;font-size:12px;font-family:inherit;cursor:pointer">
                            Ir →
                        </button>
                    </div>
                </div>
            `).join('')}
        `}

        <!-- Info del módulo -->
        <div style="background:rgba(30,28,26,0.02);border-radius:12px;padding:14px 16px;margin-top:16px">
            <div style="font-size:12px;color:var(--mid);line-height:1.7">
                💡 Cada sede tiene su propia agenda, pacientes, facturación e inventario.
                Cambia de sede usando el selector en la barra superior.
                ${esPadre ? '<br>Como sede principal, puedes crear nuevas sedes desde aquí.' : ''}
            </div>
        </div>
    `;
}

// ── Modal: Crear nueva sede ──────────────────────────────
function abrirModalCrearSede() {
    const nombrePadre = clinicConfig.nombre || CLINIC_PATH;

    mostrarModal({
        titulo: 'Nueva sede',
        body: `
            <div style="display:flex;flex-direction:column;gap:14px">
                <div>
                    <label style="font-size:11px;font-weight:500;color:var(--mid);letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:6px">Nombre de la sede *</label>
                    <input type="text" id="sedeNombre" placeholder="Ej: Clínica ${nombrePadre} — Sede Norte"
                        style="width:100%;padding:11px 14px;border:1.5px solid rgba(30,28,26,0.12);border-radius:10px;font-size:15px;font-family:inherit;outline:none;box-sizing:border-box"
                        onfocus="this.style.borderColor='var(--clinic-color)'" onblur="this.style.borderColor='rgba(30,28,26,0.12)'"
                        oninput="document.getElementById('sedeIdPreview').value=this.value.toLowerCase().replace(/[áàä]/g,'a').replace(/[éèë]/g,'e').replace(/[íìï]/g,'i').replace(/[óòö]/g,'o').replace(/[úùü]/g,'u').replace(/ñ/g,'n').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')">
                </div>
                <div>
                    <label style="font-size:11px;font-weight:500;color:var(--mid);letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:6px">Nombre corto (para el switcher) *</label>
                    <input type="text" id="sedeNombreCorto" placeholder="Ej: Sede Norte"
                        style="width:100%;padding:11px 14px;border:1.5px solid rgba(30,28,26,0.12);border-radius:10px;font-size:15px;font-family:inherit;outline:none;box-sizing:border-box"
                        onfocus="this.style.borderColor='var(--clinic-color)'" onblur="this.style.borderColor='rgba(30,28,26,0.12)'">
                </div>
                <div>
                    <label style="font-size:11px;font-weight:500;color:var(--mid);letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:6px">ID de la sede</label>
                    <input type="text" id="sedeIdPreview"
                        style="width:100%;padding:11px 14px;border:1.5px solid rgba(30,28,26,0.12);border-radius:10px;font-size:13px;font-family:monospace;outline:none;box-sizing:border-box;background:rgba(30,28,26,0.02)"
                        onfocus="this.style.borderColor='var(--clinic-color)'" onblur="this.style.borderColor='rgba(30,28,26,0.12)'">
                    <div style="font-size:11px;color:var(--mid);margin-top:5px">El ID será el identificador en la URL. Puedes editarlo.</div>
                </div>
                <div>
                    <label style="font-size:11px;font-weight:500;color:var(--mid);letter-spacing:1px;text-transform:uppercase;display:block;margin-bottom:6px">Ciudad</label>
                    <input type="text" id="sedeCiudad" placeholder="Ej: Santiago"
                        style="width:100%;padding:11px 14px;border:1.5px solid rgba(30,28,26,0.12);border-radius:10px;font-size:15px;font-family:inherit;outline:none;box-sizing:border-box"
                        onfocus="this.style.borderColor='var(--clinic-color)'" onblur="this.style.borderColor='rgba(30,28,26,0.12)'">
                </div>
                <div style="background:rgba(196,133,106,0.06);border-radius:10px;padding:12px 14px">
                    <div style="font-size:12px;color:var(--mid);line-height:1.7">
                        ✦ La nueva sede hereda el branding (color y logo) de esta sede.<br>
                        ✦ Tendrá su propia agenda, pacientes y facturación.<br>
                        ✦ El administrador de la sede principal puede cambiar entre sedes usando el selector del header.
                    </div>
                </div>
            </div>
        `,
        confirmText: 'Crear sede',
        onConfirm: () => crearSede()
    });
    setTimeout(() => document.getElementById('sedeNombre')?.focus(), 80);
}

async function crearSede() {
    const nombre      = document.getElementById('sedeNombre')?.value.trim();
    const nombreCorto = document.getElementById('sedeNombreCorto')?.value.trim();
    const idRaw       = document.getElementById('sedeIdPreview')?.value.trim();
    const ciudad      = document.getElementById('sedeCiudad')?.value.trim() || '';

    if (!nombre)      { showToast('⚠️ El nombre es obligatorio', 3000, '#e65100'); return; }
    if (!nombreCorto) { showToast('⚠️ El nombre corto es obligatorio', 3000, '#e65100'); return; }

    const sedeId = idRaw.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-|-$/g, '');
    if (!sedeId) { showToast('⚠️ El ID generado no es válido', 3000, '#e65100'); return; }

    // Verificar que el ID no existe
    try {
        const existing = await db.collection('clinicas').doc(sedeId).get();
        if (existing.exists) {
            showToast('⚠️ Ya existe una clínica con ese ID — elige otro', 4000, '#e65100');
            return;
        }
    } catch(e) { /* sin acceso — asumimos que no existe */ }

    try {
        const defaultPersonal = [
            { id: '1', nombre: 'Administrador', tipo: 'regular',
              password: 'admin123', isAdmin: true, canAccessReception: true }
        ];

        // Crear documento principal de la sede
        await db.collection('clinicas').doc(sedeId).set({
            facturas: [], personal: defaultPersonal,
            gastos: [], avances: [], cuadresDiarios: {},
            citas: [], laboratorios: [], reversiones: [],
            auditLogs: [], pacientes: [],
            inventario: [],
            usaSubcollectionPacientes: true,
            lastUpdated: new Date().toISOString(),
        });

        // Crear config heredando del padre
        await db.collection('clinicas').doc(sedeId)
            .collection('config').doc('settings').set({
                nombre,
                nombreSede:    nombreCorto,
                clinicaId:     sedeId,
                clinicaPadre:  CLINIC_PATH,
                ciudad,
                plan:          clinicConfig.plan,
                modulos:       clinicConfig.modulos,
                color:         clinicConfig.color,
                logoPositivo:  clinicConfig.logoPositivo || null,
                logoNegativo:  clinicConfig.logoNegativo || null,
                activa:        true,
                trial:         false,
                trialHasta:    null,
                creadaEn:      new Date().toISOString(),
            });

        // Registrar la nueva sede en el array sedesHijas del padre
        const sedesHijasActuales = (
            (await db.collection('clinicas').doc(CLINIC_PATH)
                .collection('config').doc('settings').get())
            .data()?.sedesHijas || []
        );
        sedesHijasActuales.push({
            id:         sedeId,
            nombre,
            nombreSede: nombreCorto,
            activa:     true,
        });
        await db.collection('clinicas').doc(CLINIC_PATH)
            .collection('config').doc('settings').set({
                esSedePrincipal: true,
                nombreSede: clinicConfig.nombreSede || 'Sede principal',
                sedesHijas: sedesHijasActuales,
            }, { merge: true });

        cerrarModal();
        showToast(`✓ Sede "${nombreCorto}" creada`);

        // Recargar las sedes del grupo y actualizar el switcher
        await _cargarSedesGrupo();
        _renderSwitcherSedes();
        updateSedesTab();

    } catch(e) {
        showError('Error al crear la sede.', e);
    }
}


// ═══════════════════════════════════════════════════════════
// FUNCIONES FALTANTES — referenciadas en HTML pero no definidas
// ═══════════════════════════════════════════════════════════

// ── 1. Cancelar Factura ──────────────────────────────────
// El modal #modalCancelarFactura tiene un textarea #razonCancelacion
// y un botón que llama confirmarCancelacionFactura().
// Necesita saber qué factura cancelar — se guarda en _facturaACancelarId.

let _facturaACancelarId = null;

function abrirCancelarFactura(facturaId) {
    if (appData.currentRole !== 'admin') {
        showToast('⛔ Solo el administrador puede cancelar facturas', 3000, '#c0392b');
        return;
    }
    const factura = appData.facturas.find(f => f.id === facturaId);
    if (!factura) return;
    _facturaACancelarId = facturaId;
    const razon = document.getElementById('razonCancelacion');
    if (razon) razon.value = '';
    openModal('modalCancelarFactura');
}

async function confirmarCancelacionFactura() {
    const razon = document.getElementById('razonCancelacion')?.value.trim();
    if (!razon) {
        showToast('⚠️ Ingresa la razón de cancelación', 3000, '#e65100');
        return;
    }
    if (!_facturaACancelarId) return;

    const factura = appData.facturas.find(f => f.id === _facturaACancelarId);
    if (!factura) return;

    const backup = [...appData.facturas];
    factura.estado         = 'cancelada';
    factura.razonCancelacion = razon;
    factura.canceladaEn    = new Date().toISOString();
    factura.canceladaPor   = appData.currentUser;

    registrarAuditoria('cancelar', 'factura',
        `Factura ${factura.numero} — ${factura.paciente} — Razón: ${razon}`);

    try {
        await saveData('confirmarCancelacionFactura');
        closeModal('modalCancelarFactura');
        _facturaACancelarId = null;
        updateCobrarTab();
        showToast('✓ Factura cancelada');
    } catch(e) {
        appData.facturas = backup;
        showError('Error al cancelar la factura.', e);
    }
}

// ── 2. Eliminar Paciente (desde modal de detalle) ────────
// El botón #btnEliminarPaciente llama eliminarPacienteActual().
// La variable global _pacienteDetalleId guarda el ID del paciente abierto.

async function eliminarPacienteActual() {
    if (appData.currentRole !== 'admin') {
        showToast('⛔ Solo el administrador puede eliminar pacientes', 3000, '#c0392b');
        return;
    }
    // Buscar qué paciente está abierto actualmente
    const idEl = document.getElementById('detallePacienteId') ||
                 document.getElementById('pacienteDetalleId');
    const pacienteId = idEl?.value || window._pacienteDetalleId;
    if (!pacienteId) {
        showToast('⚠️ No se identificó el paciente', 3000, '#e65100');
        return;
    }

    const paciente = appData.pacientes.find(p => p.id === pacienteId);
    if (!paciente) return;

    mostrarConfirmacion({
        titulo: '⚠️ Eliminar Paciente',
        mensaje: `
            <div style="background:#f8f9fa;padding:14px;border-radius:8px;margin-bottom:12px">
                <div style="font-weight:500;font-size:16px;margin-bottom:6px">${paciente.nombre}</div>
                ${paciente.cedula ? `<div style="font-size:13px;color:#666">Cédula: ${paciente.cedula}</div>` : ''}
            </div>
            <div style="background:#fff3cd;padding:10px;border-radius:6px;font-size:13px">
                ⚠️ Se eliminarán el expediente y todos sus datos. Esta acción no se puede deshacer.
            </div>`,
        tipo: 'peligro',
        confirmText: 'Sí, Eliminar Paciente',
        onConfirm: async () => {
            const backupPacientes = [...appData.pacientes];
            appData.pacientes = appData.pacientes.filter(p => p.id !== pacienteId);
            registrarAuditoria('eliminar', 'paciente',
                `${paciente.nombre}${paciente.cedula ? ' · Cédula: ' + paciente.cedula : ''}`);
            try {
                // Eliminar de subcollección
                await db.collection('clinicas').doc(CLINIC_PATH)
                    .collection('pacientes').doc(pacienteId).delete().catch(() => {});
                await saveData('eliminarPacienteActual');
                // Cerrar cualquier modal de detalle abierto
                ['modalDetallePaciente','modalPacienteDetalle','modalVerPaciente'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el && el.classList.contains('active')) closeModal(id);
                });
                updatePacientesTab();
                showToast('✓ Paciente eliminado');
            } catch(e) {
                appData.pacientes = backupPacientes;
                showError('Error al eliminar el paciente.', e);
            }
        }
    });
}

// ── 3. Editar Orden de Laboratorio ───────────────────────
// El modal #modalEditarOrden tiene campos: descripcion, laboratorio, precio.
// window.currentOrdenLabId guarda la orden actualmente abierta en el detalle.

function abrirEditarOrden(ordenId) {
    const id = ordenId || window.currentOrdenLabId;
    if (!id) return;
    const orden = appData.laboratorios?.find(o => o.id === id);
    if (!orden) return;

    window._ordenEditandoId = id;
    const descEl  = document.getElementById('editOrdenDescripcion');
    const labEl   = document.getElementById('editOrdenLaboratorio');
    const precioEl = document.getElementById('editOrdenPrecio');
    if (descEl)   descEl.value   = orden.descripcion || '';
    if (labEl)    labEl.value    = orden.laboratorio  || '';
    if (precioEl) precioEl.value = orden.precio       || '';
    openModal('modalEditarOrden');
}

async function guardarEdicionOrden() {
    const id = window._ordenEditandoId || window.currentOrdenLabId;
    if (!id) return;

    const descripcion = document.getElementById('editOrdenDescripcion')?.value.trim();
    const laboratorio = document.getElementById('editOrdenLaboratorio')?.value.trim();
    const precio      = parseFloat(document.getElementById('editOrdenPrecio')?.value) || 0;

    if (!descripcion) { showToast('⚠️ La descripción es obligatoria', 3000, '#e65100'); return; }
    if (!laboratorio) { showToast('⚠️ El laboratorio es obligatorio', 3000, '#e65100'); return; }

    const idx = appData.laboratorios?.findIndex(o => o.id === id);
    if (idx === undefined || idx < 0) return;

    const backup = { ...appData.laboratorios[idx] };
    appData.laboratorios[idx].descripcion = descripcion;
    appData.laboratorios[idx].laboratorio = laboratorio;
    appData.laboratorios[idx].precio      = precio;
    appData.laboratorios[idx].margen      = precio - (appData.laboratorios[idx].costo || 0);

    try {
        await saveData('guardarEdicionOrden');
        closeModal('modalEditarOrden');
        updateLaboratorioTab();
        showToast('✓ Orden actualizada');
    } catch(e) {
        appData.laboratorios[idx] = backup;
        showError('Error al guardar la edición.', e);
    }
}

// ── 4. Abono a Orden de Laboratorio ─────────────────────
// El modal #modalAbonoLab muestra info de la orden y permite registrar un abono.
// Los campos: abonoMonto, abonoFecha, abonoNotas.

function abrirAbonoLab(ordenId) {
    const id = ordenId || window.currentOrdenLabId;
    if (!id) return;
    const orden = appData.laboratorios?.find(o => o.id === id);
    if (!orden) return;

    window._ordenAbonoId = id;

    const infoEl   = document.getElementById('abonoOrdenInfo');
    const saldoEl  = document.getElementById('abonoSaldoActual');
    const montoEl  = document.getElementById('abonoMonto');
    const fechaEl  = document.getElementById('abonoFecha');
    const notasEl  = document.getElementById('abonoNotas');

    const totalAbonado = (orden.abonos || []).reduce((s, a) => s + (a.monto || 0), 0);
    const saldoPendiente = Math.max(0, (orden.costo || 0) - totalAbonado);

    if (infoEl)  infoEl.textContent  = `${orden.tipo || 'Orden'} — ${orden.laboratorio}`;
    if (saldoEl) saldoEl.textContent = `Costo: ${formatCurrency(orden.costo || 0)} · Abonado: ${formatCurrency(totalAbonado)} · Pendiente: ${formatCurrency(saldoPendiente)}`;
    if (montoEl) montoEl.value = '';
    if (fechaEl) fechaEl.value = new Date().toISOString().split('T')[0];
    if (notasEl) notasEl.value = '';

    openModal('modalAbonoLab');
}

async function guardarAbonoLab() {
    const id = window._ordenAbonoId;
    if (!id) return;

    const monto = parseFloat(document.getElementById('abonoMonto')?.value) || 0;
    const fecha = document.getElementById('abonoFecha')?.value || new Date().toISOString().split('T')[0];
    const notas = document.getElementById('abonoNotas')?.value.trim() || '';

    if (!monto || monto <= 0) {
        showToast('⚠️ Ingresa un monto válido', 3000, '#e65100');
        return;
    }

    const idx = appData.laboratorios?.findIndex(o => o.id === id);
    if (idx === undefined || idx < 0) return;

    const abono = {
        id:     generateId('ABONO-'),
        monto,
        fecha,
        notas,
        registradoPor: appData.currentUser,
        fechaRegistro: new Date().toISOString(),
    };

    if (!appData.laboratorios[idx].abonos) {
        appData.laboratorios[idx].abonos = [];
    }
    const backupAbonos = [...appData.laboratorios[idx].abonos];
    appData.laboratorios[idx].abonos.push(abono);

    try {
        await saveData('guardarAbonoLab');
        closeModal('modalAbonoLab');
        updateLaboratorioTab();
        showToast(`✓ Abono de ${formatCurrency(monto)} registrado`);
    } catch(e) {
        appData.laboratorios[idx].abonos = backupAbonos;
        showError('Error al registrar el abono.', e);
    }
}

