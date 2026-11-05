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

// Tarjeta de un programa. El programa Favorito se muestra con la combinación anotada en este
// teléfono (si hay una); todas las tarjetas llevan el botón para guardar/cambiar el Favorito.
function tarjetaPrograma(prog, extra) {
  const p = prog.id === 'favorito' ? programaFavorito(prog) : prog;
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
      ${botonFavorito(prog)}
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
  if (!r.ok) throw new Error(r.status === 503 ? 'sin-clave' : r.status === 429 ? 'limite' : 'http-' + r.status);
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
  const guardada = rec.guardada ? `🕘 Del historial (${escaparHtml(fechaCorta(rec.guardada))}) · ` : '';
  const porQue = `<div class="why">${guardada}${emoji} ${escaparHtml(rec.motivo)}${nota}</div>`
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
  const sobrecarga = haySobrecarga(texto);
  const local = recomendacionLocal(texto);

  // Sin servidor o sin conexión: solo motor local.
  const sinConexion = navigator.onLine === false;
  if (location.protocol === 'file:' || sinConexion) {
    estadoInicialIA();
    if (!local) { area.innerHTML = SIN_PRENDA; return; }
    if (sinConexion) local.motivo = 'Sin conexión, usé el motor local. ' + local.motivo;
    pintarRecomendacion(local, sobrecarga, false);
    guardarEnHistorial(texto, local);
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
    guardarEnHistorial(texto, ia);
    return;
  }
  if (fallo === 'sin-clave') estadoIA('ia-off', '💡 Modo local (IA no configurada)');
  else if (fallo === 'tiempo') estadoIA('ia-off', '💡 Modo local (la IA tardó demasiado)');
  else if (fallo === 'limite') estadoIA('ia-off', '💡 Modo local (muchas consultas, la IA vuelve en un rato)');
  else estadoIA('ia-off', '💡 Modo local (sin conexión a la IA)');
  if (!local) { area.setAttribute('aria-busy', 'false'); area.innerHTML = SIN_PRENDA; return; }
  pintarRecomendacion(local, sobrecarga, false);
  guardarEnHistorial(texto, local);
}

function haySobrecarga(texto) {
  const norm = normalizar(texto);
  return ['casi todo', 'casi llena', 'lleno', 'llena', 'sobrecarga', 'mucha ropa', 'mucha carga', 'no cabe', 'ocupa todo', 'demasiada ropa', 'hasta el tope'].some(t => coincide(norm, t));
}

// Historial: las últimas recomendaciones quedan guardadas solo en este teléfono (localStorage).
// Se guarda la recomendación final (la de la IA, o la local si la IA no respondió); elegir un
// programa a mano no se guarda. Al tocar una, se muestra al instante sin volver a consultar.
const CLAVE_HISTORIAL = 'historial';
const MAX_HISTORIAL = 5;

function leerHistorial() {
  try {
    const datos = JSON.parse(localStorage.getItem(CLAVE_HISTORIAL) || '[]');
    if (!Array.isArray(datos)) return [];
    return datos.filter(h => h && typeof h.texto === 'string' && typeof h.fecha === 'number'
      && PROGRAMAS.some(p => p.id === h.id)).slice(0, MAX_HISTORIAL);
  } catch (e) { return []; }
}

function guardarEnHistorial(texto, rec) {
  const entrada = {
    texto: texto.trim().slice(0, 200),
    id: rec.principal.id,
    alt: rec.alternativas.map(p => p.id),
    motivo: String(rec.motivo || '').slice(0, 300),
    origen: rec.origen,
    fecha: Date.now()
  };
  // La misma consulta no se repite: queda solo la más reciente, arriba.
  const clave = normalizar(entrada.texto).trim();
  const lista = [entrada, ...leerHistorial().filter(h => normalizar(h.texto).trim() !== clave)].slice(0, MAX_HISTORIAL);
  try { localStorage.setItem(CLAVE_HISTORIAL, JSON.stringify(lista)); } catch (e) {}
  pintarHistorial();
}

// "hoy, 14:32", "ayer, 09:10" o "3 nov".
function fechaCorta(ms) {
  const d = new Date(ms);
  const dia = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((dia(new Date()) - dia(d)) / 86400000);
  const hora = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  if (dias === 0) return 'hoy, ' + hora;
  if (dias === 1) return 'ayer, ' + hora;
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
}

function pintarHistorial() {
  const cont = document.getElementById('historial');
  const lista = document.getElementById('historialLista');
  if (!cont || !lista) return;
  const items = leerHistorial();
  cont.hidden = items.length === 0;
  lista.innerHTML = items.map((h, i) => {
    const p = PROGRAMAS.find(x => x.id === h.id);
    return `<button class="hist-item" type="button" data-i="${i}">`
      + `<span class="hist-prog">${p.emoji} ${p.nombre}</span>`
      + `<span class="hist-fecha">${h.origen === 'IA' ? '🤖' : '💡'} ${escaparHtml(fechaCorta(h.fecha))}</span>`
      + `<span class="hist-texto">${escaparHtml(h.texto)}</span>`
      + '</button>';
  }).join('');
}

function mostrarDelHistorial(h) {
  cancelarIA();
  const principal = PROGRAMAS.find(p => p.id === h.id);
  const alternativas = (Array.isArray(h.alt) ? h.alt : [])
    .map(id => PROGRAMAS.find(p => p.id === id))
    .filter(p => p && p !== principal);
  document.getElementById('loadInput').value = h.texto;
  const rec = { principal, alternativas, origen: h.origen === 'IA' ? 'IA' : 'local', motivo: h.motivo || '', guardada: h.fecha };
  pintarRecomendacion(rec, haySobrecarga(h.texto), false);
  document.getElementById('resultArea').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function initHistorial() {
  const lista = document.getElementById('historialLista');
  const borrar = document.getElementById('btnBorrarHistorial');
  if (!lista || !borrar) return;
  lista.addEventListener('click', (e) => {
    const btn = e.target.closest('.hist-item');
    if (!btn) return;
    const h = leerHistorial()[Number(btn.dataset.i)];
    if (h) mostrarDelHistorial(h);
    else pintarHistorial();
  });
  borrar.addEventListener('click', () => {
    if (!confirm('¿Borrar las últimas consultas guardadas en este teléfono?')) return;
    try { localStorage.removeItem(CLAVE_HISTORIAL); } catch (e) {}
    pintarHistorial();
  });
  pintarHistorial();
}

// Favorito: la lavadora tiene un botón "Favorito" que memoriza una combinación. Aquí se anota
// cuál quedó guardada (programa base, temperatura, centrifugado, secado y un nombre), solo en
// este teléfono (localStorage), para que la tarjeta del Favorito muestre los valores reales.
const CLAVE_FAVORITO = 'favorito';
const FAV_TEMPS = ['Frío', '20°C', '30°C', '40°C', '60°C', '90°C'];
const FAV_RPMS = ['Sin centrifugado', '400 RPM', '600 RPM', '800 RPM', '1000 RPM', '1200 RPM', '1400 RPM'];
const FAV_SECADOS = ['Sin secado', 'Auto Secado', 'Secado por tiempo'];
const MAX_NOTA_FAV = 40;

function programasBase() {
  return PROGRAMAS.filter(p => p.id !== 'favorito');
}

// Devuelve el Favorito guardado o null si no hay / está dañado (solo valores de las listas).
function leerFavorito() {
  try {
    const f = JSON.parse(localStorage.getItem(CLAVE_FAVORITO) || 'null');
    if (!f || typeof f !== 'object') return null;
    if (!programasBase().some(p => p.id === f.base)) return null;
    if (!FAV_TEMPS.includes(f.temp) || !FAV_RPMS.includes(f.rpm) || !FAV_SECADOS.includes(f.secado)) return null;
    return {
      base: f.base, temp: f.temp, rpm: f.rpm, secado: f.secado,
      nota: typeof f.nota === 'string' ? f.nota.slice(0, MAX_NOTA_FAV) : '',
      fecha: typeof f.fecha === 'number' ? f.fecha : 0
    };
  } catch (e) { return null; }
}

// Valores iniciales del formulario a partir de un programa ("40°C (Frío–90°C)" → 40°C, etc.).
function favoritoDesde(p) {
  let temp = '40°C';
  if (/^fr[ií]o/i.test(p.temp)) temp = 'Frío';
  else {
    const m = /(\d+)/.exec(p.temp);
    if (m && FAV_TEMPS.includes(m[1] + '°C')) temp = m[1] + '°C';
  }
  const r = /(\d{3,4})/.exec(p.rpm);
  let rpm = r && FAV_RPMS.includes(r[1] + ' RPM') ? r[1] + ' RPM' : '1000 RPM';
  if (p.cat === 'Solo secado') rpm = 'Sin centrifugado';
  const secado = p.id === 'tiemposecado' ? 'Secado por tiempo'
    : (p.id === 'autosecado' || p.id === 'lavadosecado') ? 'Auto Secado' : 'Sin secado';
  return { base: p.id, temp, rpm, secado, nota: '' };
}

// El programa Favorito con la combinación anotada (o tal cual, si no hay nada anotado).
function programaFavorito(p) {
  const f = leerFavorito();
  if (!f) {
    return { ...p, tips: [...p.tips, 'Toca “Anotar mi Favorito” para recordar aquí qué combinación guardaste en la lavadora.'] };
  }
  const base = PROGRAMAS.find(x => x.id === f.base);
  const nombre = f.nota ? `«${escaparHtml(f.nota)}» · ` : '';
  return {
    ...p,
    cat: 'Personalizado · tu combinación',
    temp: f.temp, rpm: f.rpm, secado: f.secado, duracion: base.duracion,
    desc: `${nombre}Basado en ${base.emoji} ${base.nombre}: ${base.desc}`,
    tips: [
      'En la lavadora, elige Favorito para usar esta combinación.',
      'Si cambias el Favorito en la lavadora, actualízalo también aquí.',
      ...base.tips
    ],
    warning: base.warning
  };
}

function botonFavorito(p) {
  const texto = p.id !== 'favorito' ? '⭐ Guardar como mi Favorito'
    : leerFavorito() ? '✏️ Cambiar mi Favorito' : '⭐ Anotar mi Favorito';
  return `<div class="fav-acciones"><button type="button" class="btn-fav" data-fav="${p.id}">${texto}</button></div>`;
}

function mostrarFavorito(mensaje) {
  cancelarIA();
  const area = document.getElementById('resultArea');
  area.setAttribute('aria-busy', 'false');
  area.innerHTML = tarjetaPrograma(PROGRAMAS.find(p => p.id === 'favorito'), `<div class="why">${mensaje}</div>`);
  area.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function initFavorito() {
  const dialogo = document.getElementById('favDialogo');
  const area = document.getElementById('resultArea');
  if (!dialogo || !area || typeof dialogo.showModal !== 'function') return;
  const campo = id => document.getElementById(id);
  const opciones = lista => lista.map(v => `<option value="${v}">${v}</option>`).join('');
  campo('favBase').innerHTML = programasBase().map(p => `<option value="${p.id}">${p.emoji} ${p.nombre}</option>`).join('');
  campo('favTemp').innerHTML = opciones(FAV_TEMPS);
  campo('favRpm').innerHTML = opciones(FAV_RPMS);
  campo('favSecado').innerHTML = opciones(FAV_SECADOS);

  function abrir(desdeId) {
    const guardado = leerFavorito();
    const p = PROGRAMAS.find(x => x.id === desdeId);
    // Desde la tarjeta del Favorito se edita lo guardado; desde otro programa se parte de ese.
    const f = (desdeId === 'favorito' || !p) ? (guardado || favoritoDesde(programasBase()[0])) : favoritoDesde(p);
    campo('favBase').value = f.base;
    campo('favTemp').value = f.temp;
    campo('favRpm').value = f.rpm;
    campo('favSecado').value = f.secado;
    campo('favNota').value = f.nota || '';
    campo('favQuitar').hidden = !guardado;
    dialogo.showModal();
  }

  // Al cambiar el programa base se proponen sus valores (la nota no se toca).
  campo('favBase').addEventListener('change', () => {
    const f = favoritoDesde(PROGRAMAS.find(x => x.id === campo('favBase').value));
    campo('favTemp').value = f.temp;
    campo('favRpm').value = f.rpm;
    campo('favSecado').value = f.secado;
  });

  area.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-fav');
    if (btn) abrir(btn.dataset.fav);
  });

  campo('favCancelar').addEventListener('click', () => dialogo.close());
  campo('favGuardar').addEventListener('click', () => {
    const fav = {
      base: campo('favBase').value, temp: campo('favTemp').value, rpm: campo('favRpm').value,
      secado: campo('favSecado').value, nota: campo('favNota').value.trim().slice(0, MAX_NOTA_FAV), fecha: Date.now()
    };
    try { localStorage.setItem(CLAVE_FAVORITO, JSON.stringify(fav)); } catch (e) {}
    dialogo.close();
    mostrarFavorito(leerFavorito()
      ? '⭐ Guardé tu Favorito en este teléfono. Recuerda guardar la misma combinación en la lavadora.'
      : '⚠️ No pude guardar el Favorito en este teléfono (¿navegación privada?).');
  });
  campo('favQuitar').addEventListener('click', () => {
    if (!confirm('¿Quitar el Favorito anotado en este teléfono? (La lavadora no cambia.)')) return;
    try { localStorage.removeItem(CLAVE_FAVORITO); } catch (e) {}
    dialogo.close();
    mostrarFavorito('🗑️ Quité el Favorito anotado en este teléfono.');
  });
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
  initHistorial();
  initFavorito();
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
