// Interfaz y motor local del Asistente de Lavado Midea.
// Se carga después de programas.js, al final del <body>.
// PROGRAMAS viene de /programas.js (compartido con api/recomendar.js).

function normalizar(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
}

// Escapa texto antes de meterlo en HTML (el texto de la IA no es de confianza).
function escaparHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function escaparRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Patrón de una palabra: acepta plural simple ("sábana" → "sábanas", "calcetín" → "calcetines")
// y, en verbos terminados en r, un pronombre pegado ("secar" → "secarla").
function patronPalabra(w) {
  const fin = w.endsWith('r') ? '(?:s|es|l[oa]s?)?' : '(?:s|es)?';
  return escaparRegex(w) + fin;
}

// Coincidencia por palabra completa: "tul" ya no calza con "títulos" ni "eco" con "hueco".
// Las frases permiten hasta 2 palabras intermedias (ej: "limpiar tambor" == "limpiar el tambor").
const cacheRegex = new Map();
function coincide(norm, kw) {
  let re = cacheRegex.get(kw);
  if (!re) {
    const partes = normalizar(kw).trim().split(' ').filter(Boolean).map(patronPalabra);
    re = new RegExp('(?:^|[^a-z0-9])' + partes.join('(?:\\s+\\S+){0,2}\\s+') + '(?![a-z0-9])');
    cacheRegex.set(kw, re);
  }
  return re.test(norm);
}

function recomendar(texto) {
  const norm = normalizar(texto);
  return PROGRAMAS.map(p => {
    let score = 0;
    const matched = [];
    for (const [kw, peso] of p.kw) {
      if (coincide(norm, kw)) { score += peso; matched.push(kw); }
    }
    return { p, score, matched };
  }).sort((a, b) => b.score - a.score);
}

// Inicializar al cargar
function tarjetaPrograma(p, extra) {
  return `
    <div class="card">
      <div class="program-head">
        <div class="program-emoji">${p.emoji}</div>
        <div>
          <div class="program-cat">${p.cat}</div>
          <div class="program-title">${p.nombre}</div>
        </div>
      </div>
      <p class="desc">${p.desc}</p>
      <div class="grid">
        <div class="stat-box"><div class="stat-label">Temperatura</div><div class="stat-value">${p.temp}</div></div>
        <div class="stat-box"><div class="stat-label">Centrifugado</div><div class="stat-value">${p.rpm}</div></div>
        <div class="stat-box"><div class="stat-label">Secado</div><div class="stat-value">${p.secado}</div></div>
        <div class="stat-box"><div class="stat-label">Duración</div><div class="stat-value">${p.duracion}</div></div>
      </div>
      <div class="tips"><strong>Recomendaciones:</strong><ul>${p.tips.map(t => `<li>${t}</li>`).join('')}</ul></div>
      ${p.warning ? `<div class="warning">⚠️ ${p.warning}</div>` : ''}
      ${extra || ''}
    </div>`;
}

// Respuesta instantánea: primero se muestra el motor local y, si la IA responde antes de
// LIMITE_IA_MS, se reemplaza por su recomendación. Si no, queda el resultado local.
const LIMITE_IA_MS = 8000;
let consulta = 0;       // sube con cada consulta o vista manual: descarta respuestas viejas
let controlIA = null;   // AbortController de la consulta a la IA en curso

function cancelarIA() {
  consulta++;
  if (controlIA) { controlIA.abort(); controlIA = null; }
}

// Indicador de estado de la IA (se actualiza con cada consulta, sin GET al cargar).
function estadoIA(clase, texto) {
  const el = document.getElementById('iaStatus');
  if (!el) return;
  el.className = 'ia-status ' + clase;
  el.textContent = texto;
}

// Nombre legible del modelo que respondió: "anthropic/claude-haiku-5.5" → "Claude Haiku 5.5".
// Los modelos gratuitos de respaldo se muestran solo como "IA".
function nombreModelo(id) {
  const m = /^anthropic\/(claude-[a-z0-9.-]+)$/.exec(String(id || ''));
  if (!m) return 'IA';
  return m[1].split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

function estadoInicialIA() {
  if (location.protocol === 'file:') estadoIA('ia-off', '💡 Modo local (abierta sin servidor)');
  else if (navigator.onLine === false) estadoIA('ia-offline', '📴 Sin conexión · uso el motor local');
  else estadoIA('ia-off', '🤖 Asistente IA · responde al consultar');
}

function recomendacionLocal(texto) {
  const res = recomendar(texto);
  const top = res[0];
  if (!top || top.score === 0) return null;
  const alternativas = res.slice(1).filter(r => r.score > 0).slice(0, 2).map(r => r.p);
  return { principal: top.p, alternativas, origen: 'local', motivo: 'Detecté: ' + top.matched.slice(0, 4).join(', ') };
}

// Pide la recomendación al asistente IA (/api/recomendar). Lanza error si no hay respuesta útil.
async function recomendacionIA(texto, signal) {
  const r = await fetch('/api/recomendar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texto }),
    signal
  });
  if (!r.ok) throw new Error(r.status === 503 ? 'sin-clave' : 'http-' + r.status);
  const data = await r.json();
  const principal = PROGRAMAS.find(p => p.id === data.id);
  if (!principal) throw new Error('respuesta-invalida');
  const alternativas = (data.alternativas || [])
    .map(id => PROGRAMAS.find(p => p.id === id))
    .filter(p => p && p !== principal);
  return { principal, alternativas, origen: 'IA', modelo: data.modelo || '', motivo: data.motivo || 'Recomendación del asistente IA.' };
}

const SIN_PRENDA = '<div class="card empty">🤔 No detecté una prenda clara. Describe mejor la ropa (ej: "ropa deportiva de poliéster", "sábanas y toallas", "un suéter de lana") o toca un ejemplo de arriba.</div>';

function pintarRecomendacion(rec, sobrecarga, pendiente) {
  const area = document.getElementById('resultArea');
  const emoji = rec.origen === 'IA' ? '🤖' : '💡';
  const nota = pendiente ? '<span class="ia-pendiente"> · ⏳ consultando a la IA…</span>' : '';
  const porQue = `<div class="why">${emoji} ${escaparHtml(rec.motivo)}${nota}</div>`
    + (sobrecarga ? '<div class="warning">⚠️ Mencionaste que el tambor queda casi lleno: retira algunas prendas para que la ropa gire, se enjuague y se centrifugue bien (máx. ~9,5 kg en lavado y ~7 kg en secado).</div>' : '');
  let html = tarjetaPrograma(rec.principal, porQue);

  if (rec.alternativas.length) {
    html += '<div class="alt-title">También podría servirte</div><div class="alt-list">';
    for (const p of rec.alternativas) {
      html += `<button class="alt-item" type="button" data-id="${p.id}">${p.emoji} <span><strong>${p.nombre}</strong> — ${p.desc}</span></button>`;
    }
    html += '</div>';
  }
  area.innerHTML = html;
  area.setAttribute('aria-busy', String(!!pendiente));

  area.querySelectorAll('.alt-item').forEach(btn => {
    btn.addEventListener('click', () => {
      cancelarIA();
      const p = PROGRAMAS.find(x => x.id === btn.dataset.id);
      area.setAttribute('aria-busy', 'false');
      area.innerHTML = tarjetaPrograma(p, '<div class="why">👆 Mostrando el programa que elegiste.</div>');
    });
  });
}

async function renderResultado(texto) {
  cancelarIA();
  const miConsulta = consulta;
  const area = document.getElementById('resultArea');
  area.setAttribute('aria-busy', 'false');
  if (!texto.trim()) {
    area.innerHTML = '<div class="card empty">✍️ Escribe qué vas a lavar para que te recomiende un programa.</div>';
    return;
  }
  const norm = normalizar(texto);
  const sobrecarga = ['casi todo', 'casi llena', 'lleno', 'llena', 'sobrecarga', 'mucha ropa', 'mucha carga', 'no cabe', 'ocupa todo', 'demasiada ropa', 'hasta el tope'].some(t => coincide(norm, t));
  const local = recomendacionLocal(texto);

  // Sin servidor o sin conexión: solo motor local.
  const sinConexion = navigator.onLine === false;
  if (location.protocol === 'file:' || sinConexion) {
    estadoInicialIA();
    if (!local) { area.innerHTML = SIN_PRENDA; return; }
    if (sinConexion) local.motivo = 'Sin conexión, usé el motor local. ' + local.motivo;
    pintarRecomendacion(local, sobrecarga, false);
    return;
  }

  // 1) Resultado local al instante (o aviso de espera si el motor local no reconoce nada).
  if (local) pintarRecomendacion(local, sobrecarga, true);
  else {
    area.innerHTML = '<div class="card empty">⏳ Analizando tu descripción…</div>';
    area.setAttribute('aria-busy', 'true');
  }

  // 2) Consulta a la IA con corte a los 8 s.
  const ctrl = new AbortController();
  controlIA = ctrl;
  let porTiempo = false;
  const corte = setTimeout(() => { porTiempo = true; ctrl.abort(); }, LIMITE_IA_MS);
  let ia = null, fallo = '';
  try {
    ia = await recomendacionIA(texto, ctrl.signal);
  } catch (e) {
    fallo = porTiempo ? 'tiempo' : (e && e.message) || 'error';
  } finally {
    clearTimeout(corte);
  }
  if (miConsulta !== consulta) return; // hubo otra consulta o el usuario eligió un programa
  controlIA = null;

  // 3) Reemplazar con la IA o quedarse con el local.
  if (ia) {
    estadoIA('ia-on', '🤖 IA activa · ' + nombreModelo(ia.modelo));
    pintarRecomendacion(ia, sobrecarga, false);
    return;
  }
  if (fallo === 'sin-clave') estadoIA('ia-off', '💡 Modo local (IA no configurada)');
  else if (fallo === 'tiempo') estadoIA('ia-off', '💡 Modo local (la IA tardó demasiado)');
  else estadoIA('ia-off', '💡 Modo local (sin conexión a la IA)');
  if (!local) { area.setAttribute('aria-busy', 'false'); area.innerHTML = SIN_PRENDA; return; }
  pintarRecomendacion(local, sobrecarga, false);
}

const CLAVE_TEMA = 'tema';
const MEDIA_OSCURO = window.matchMedia('(prefers-color-scheme: dark)');

function leerTema() {
  try { return localStorage.getItem(CLAVE_TEMA) || 'sistema'; } catch (e) { return 'sistema'; }
}

function aplicarTema(pref) {
  const oscuro = pref === 'oscuro' || (pref === 'sistema' && MEDIA_OSCURO.matches);
  document.documentElement.setAttribute('data-theme', oscuro ? 'dark' : 'light');
  const meta = document.getElementById('metaThemeColor');
  if (meta) meta.setAttribute('content', oscuro ? '#111d33' : '#e0f2fe');
  document.querySelectorAll('#themeSwitch button').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.tema === pref));
  });
}

function initTema() {
  const cont = document.getElementById('themeSwitch');
  if (!cont) return;
  cont.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      const pref = b.dataset.tema;
      try { localStorage.setItem(CLAVE_TEMA, pref); } catch (e) {}
      aplicarTema(pref);
    });
  });
  MEDIA_OSCURO.addEventListener('change', () => {
    if (leerTema() === 'sistema') aplicarTema('sistema');
  });
  aplicarTema(leerTema());
}

function init() {
  initTema();
  const input = document.getElementById('loadInput');
  const btn = document.getElementById('btnRecomendar');
  const chips = document.getElementById('chips');
  const allList = document.getElementById('allList');

  const ejemplos = ['Ropa deportiva de poliéster','Sábanas y toallas','Un suéter de lana','Jeans y poleras','Ropa de bebé (higiene)','Lavar y secar de una vez','Solo secar la ropa','Ropa delicada de seda'];
  chips.innerHTML = ejemplos.map(e => `<button class="chip" type="button">${e}</button>`).join('');
  chips.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
    input.value = c.textContent;
    renderResultado(input.value);
    input.focus();
  }));

  allList.innerHTML = PROGRAMAS.map(p => `<button class="all-item" type="button" data-id="${p.id}">${p.emoji} ${p.nombre}</button>`).join('');
  allList.querySelectorAll('.all-item').forEach(b => b.addEventListener('click', () => {
    cancelarIA();
    const p = PROGRAMAS.find(x => x.id === b.dataset.id);
    const area = document.getElementById('resultArea');
    area.setAttribute('aria-busy', 'false');
    area.innerHTML = tarjetaPrograma(p, '<div class="why">👆 Mostrando el programa que elegiste de la lista.</div>');
    area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }));

  function run() { renderResultado(input.value); }
  btn.addEventListener('click', run);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); }
  });

  // Sin GET al cargar: el indicador se confirma con la primera consulta.
  estadoInicialIA();
  window.addEventListener('offline', estadoInicialIA);
  window.addEventListener('online', estadoInicialIA);

  // Accesos rápidos del ícono instalado (y enlaces compartidos): /?q=texto
  const q = new URLSearchParams(location.search).get('q');
  if (q) {
    input.value = q;
    renderResultado(q);
  } else {
    renderResultado('');
  }
}

// Botón "Instalar app": Chrome/Android avisa con beforeinstallprompt cuando se puede instalar.
function initInstalar() {
  const btn = document.getElementById('btnInstalar');
  let aviso = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    aviso = e;
    btn.hidden = false;
  });
  btn.addEventListener('click', async () => {
    if (!aviso) return;
    btn.hidden = true;
    aviso.prompt();
    try { await aviso.userChoice; } catch (e) {}
    aviso = null;
  });
  window.addEventListener('appinstalled', () => { btn.hidden = true; aviso = null; });
}

// Service worker: funciona sin conexión y avisa cuando hay una versión nueva.
function initServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const aviso = document.getElementById('avisoVersion');
  let recargar = false;

  function mostrarAviso(reg) {
    if (!reg.waiting || !navigator.serviceWorker.controller) return;
    aviso.hidden = false;
    document.getElementById('btnActualizar').onclick = () => {
      recargar = true;
      reg.waiting.postMessage('ACTIVAR');
    };
    document.getElementById('btnLuego').onclick = () => { aviso.hidden = true; };
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recargar) location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      mostrarAviso(reg);
      reg.addEventListener('updatefound', () => {
        const nuevo = reg.installing;
        if (!nuevo) return;
        nuevo.addEventListener('statechange', () => {
          if (nuevo.state === 'installed') mostrarAviso(reg);
        });
      });
      // La app instalada puede quedar abierta días: busca versión nueva al volver a ella.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    } catch (e) { /* sin service worker la app sigue funcionando normal */ }
  });
}

init();
initInstalar();
initServiceWorker();
