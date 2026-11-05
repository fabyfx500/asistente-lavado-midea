// Vercel Serverless Function: recomienda el mejor programa de la Midea MLSF-095B usando OpenRouter.
// Requiere la variable de entorno OPENROUTER_API_KEY (Vercel > Settings > Environment Variables).
// La clave NUNCA va en el HTML: se queda en el servidor.

// Modelo principal (de pago, muy barato: ~US$0,0002 por consulta). Requiere créditos en OpenRouter.
// Se puede cambiar con la variable OPENROUTER_MODEL. Si falla (sin créditos, caído, lento),
// se usan los modelos gratuitos como respaldo.
const MODELO_PRINCIPAL = process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-5.5';

// Modelos gratuitos de respaldo: se DESCUBREN dinámicamente desde OpenRouter (los IDs cambian seguido).
// Orden preferido (se usa si el modelo existe en la lista real).
const PREFERIDOS = [
  'z-ai/glm-5.2:free',
  'qwen/qwen3.8-27b:free',
  'google/gemma-4-31b-it:free',
  'nex-agi/nex-n2.5-pro:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'thinkingmachines/inkling:free'
].filter(Boolean);

// Modelos que no sirven para esta tarea (código, visión, moderación, finanzas, salud).
const EXCLUIR = ['code', 'vision', 'vl', 'embed', 'guard', 'safety', 'moderation', 'finance', 'health'];

// Tiempos (el front corta a los 8 s, así que la función debe contestar antes).
const LIMITE_TOTAL_MS = 7000;     // presupuesto total de la función
const LIMITE_LISTA_MS = 1500;     // máximo para bajar la lista de modelos gratis (solo en frío)
const TTL_LISTA_MS = 60 * 60 * 1000; // la lista de gratis se renueva cada 1 h
const MAX_MODELOS = 3;            // principal + 2 gratuitos de respaldo, en UNA sola llamada

// Caché de la lista de modelos gratis (vive mientras la función siga "tibia" en Vercel).
let CACHE_GRATIS = null;   // { ids: [...], hora: ms }
let ACTUALIZANDO = null;   // promesa de la descarga en curso (para no pedirla dos veces)

function bajarListaGratis() {
  if (ACTUALIZANDO) return ACTUALIZANDO;
  ACTUALIZANDO = (async () => {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(5000) });
      if (!r.ok) return CACHE_GRATIS;
      const data = await r.json();
      const ids = (data.data || [])
        .map(m => m && m.id)
        .filter(id => typeof id === 'string' && id.endsWith(':free'))
        .filter(id => !EXCLUIR.some(x => id.toLowerCase().includes(x)));
      CACHE_GRATIS = { ids, hora: Date.now() };
      return CACHE_GRATIS;
    } catch (e) {
      return CACHE_GRATIS;
    } finally {
      ACTUALIZANDO = null;
    }
  })();
  return ACTUALIZANDO;
}

// Devuelve la lista de gratis sin hacer esperar al usuario:
// - Si hay caché vigente, la usa.
// - Si está vencida, la usa igual y la renueva por detrás.
// - Si no hay nada (arranque en frío), espera la descarga como máximo LIMITE_LISTA_MS.
async function listarGratis() {
  if (CACHE_GRATIS) {
    if (Date.now() - CACHE_GRATIS.hora > TTL_LISTA_MS) bajarListaGratis();
    return CACHE_GRATIS.ids;
  }
  const espera = new Promise(resolve => setTimeout(resolve, LIMITE_LISTA_MS, null));
  const res = await Promise.race([bajarListaGratis(), espera]);
  return res ? res.ids : [];
}

// El modelo principal va SIEMPRE primero (aunque no sea gratuito); después, los gratuitos de respaldo.
// Solo se usan gratuitos que existan en la lista real: un id inexistente haría fallar toda la llamada.
async function obtenerCandidatos(max) {
  const gratis = await listarGratis();
  const pref = PREFERIDOS.filter(m => gratis.includes(m));
  const resto = gratis.filter(m => !pref.includes(m));
  const respaldo = pref.concat(resto);
  return [MODELO_PRINCIPAL].concat(respaldo.filter(m => m !== MODELO_PRINCIPAL)).slice(0, max || MAX_MODELOS);
}

// Los 14 programas vienen del archivo compartido con la página (campo "ia" = resumen para el
// prompt; "ajustes" = lo que se puede sugerir en cada uno).
const PROGRAMAS = require('../programas.js');

const IDS = PROGRAMAS.map(p => p.id);

// Valores que la IA puede sugerir (pasos del panel según el manual). "No aplica" = el programa
// no deja elegirlo; el servidor lo convierte en null.
const NO_APLICA = 'No aplica';
const TEMPS_IA = ['Frío', '20°C', '30°C', '40°C', '60°C', '90°C'];
const RPMS_PASOS = [600, 800, 1000, 1200, 1400];
const RPMS_IA = ['Sin centrifugado'].concat(RPMS_PASOS.map(r => r + ' RPM'));
const SECADOS_IA = ['Sin secado', 'Menos seco', 'Seco normal', 'Extra seco', 'Por tiempo'];
const STAIN_IA = [...new Set(PROGRAMAS.flatMap(p => (p.ajustes && p.ajustes.stain) || []))];
const FUNCIONES_IA = ['Prelavado', 'Enjuague adicional'].concat(STAIN_IA.map(s => 'Stain Master: ' + s));
const MAX_CONSEJO = 200;

// Lo que admite cada programa (sale de "ajustes" en programas.js).
function permitidos(p) {
  const a = (p && p.ajustes) || {};
  return {
    temps: (a.temps || []).filter(t => TEMPS_IA.includes(t)),
    rpms: a.rpmMax ? ['Sin centrifugado'].concat(RPMS_PASOS.filter(r => r <= a.rpmMax).map(r => r + ' RPM')) : [],
    secados: (a.secados || []).filter(s => SECADOS_IA.includes(s)),
    funciones: (a.funciones ? ['Prelavado', 'Enjuague adicional'] : []).concat((a.stain || []).map(s => 'Stain Master: ' + s))
  };
}

// Deja solo lo que ese programa admite. Stain Master: un escenario a la vez. Máx. 2 funciones.
// Devuelve null si no queda nada que sugerir.
function limpiarAjuste(p, a) {
  if (!a || typeof a !== 'object') return null;
  const ok = permitidos(p);
  const elegir = (v, lista) => (typeof v === 'string' && lista.includes(v) ? v : null);
  let conStain = false;
  const funciones = [];
  for (const f of Array.isArray(a.funciones) ? a.funciones : []) {
    if (!ok.funciones.includes(f) || funciones.includes(f)) continue;
    if (f.startsWith('Stain Master')) { if (conStain) continue; conStain = true; }
    funciones.push(f);
  }
  const r = {
    temperatura: elegir(a.temperatura, ok.temps),
    centrifugado: elegir(a.centrifugado, ok.rpms),
    secado: elegir(a.secado, ok.secados),
    funciones: funciones.slice(0, 2)
  };
  return r.temperatura || r.centrifugado || r.secado || r.funciones.length ? r : null;
}

const ESQUEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'recomendacion',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', enum: IDS },
        motivo: { type: 'string' },
        alternativas: { type: 'array', items: { type: 'string', enum: IDS } },
        ajuste: {
          type: 'object',
          properties: {
            temperatura: { type: 'string', enum: TEMPS_IA.concat(NO_APLICA) },
            centrifugado: { type: 'string', enum: RPMS_IA.concat(NO_APLICA) },
            secado: { type: 'string', enum: SECADOS_IA.concat(NO_APLICA) },
            funciones: { type: 'array', items: { type: 'string', enum: FUNCIONES_IA } }
          },
          required: ['temperatura', 'centrifugado', 'secado', 'funciones'],
          additionalProperties: false
        },
        consejo: { type: 'string' }
      },
      required: ['id', 'motivo', 'alternativas', 'ajuste', 'consejo'],
      additionalProperties: false
    }
  }
};

// Una sola petición para todos los candidatos: OpenRouter prueba "models" en orden y pasa al
// siguiente si uno falla (sin créditos, caído, límite de uso). Los parámetros son los mismos para
// todos: sin "temperature" (Claude 5.x no la acepta); OpenRouter ignora en cada modelo lo que no
// soporte (salida JSON, razonamiento), y la respuesta se lee igual aunque venga como texto.
function cuerpoPara(modelos, texto) {
  return {
    model: modelos[0],
    models: modelos,
    messages: [
      { role: 'system', content: SISTEMA },
      { role: 'user', content: texto }
    ],
    max_tokens: 1024,
    reasoning: { effort: 'low' },
    response_format: ESQUEMA
  };
}

// Qué se puede ajustar en cada programa, en palabras (va en el prompt junto al resumen "ia").
function textoAjustes(p) {
  const ok = permitidos(p);
  const a = p.ajustes || {};
  return [
    'temperatura ' + (ok.temps.length ? ok.temps.join('/') : NO_APLICA),
    'centrifugado ' + (a.rpmMax ? 'hasta ' + a.rpmMax + ' RPM' : NO_APLICA),
    'secado ' + (ok.secados.length ? ok.secados.join('/') : NO_APLICA),
    'funciones ' + (ok.funciones.length ? ok.funciones.join(', ') : 'ninguna')
  ].join('; ');
}

// Ejemplos resueltos: muestran el formato y los casos que más confunden.
const EJEMPLOS = [
  ['Sábanas blancas con una mancha de vino tinto',
    { id: 'algodon', motivo: 'Las sábanas de algodón aguantan agua caliente y centrifugado alto.', alternativas: ['eco'],
      ajuste: { temperatura: '60°C', centrifugado: '1400 RPM', secado: 'Sin secado', funciones: ['Stain Master: Bebidas'] },
      consejo: 'Si la mancha de vino ya se secó, humedécela con agua fría antes de meterla.' }],
  ['Ropa deportiva sudada, de poliéster',
    { id: '20c', motivo: 'El agua fría cuida el poliéster y la elasticidad de la ropa deportiva.', alternativas: ['mixto'],
      ajuste: { temperatura: '20°C', centrifugado: '1000 RPM', secado: 'Sin secado', funciones: ['Enjuague adicional'] },
      consejo: 'Lávala al revés y sin suavizante, que tapa la tela y guarda el olor a sudor.' }],
  ['Dos chalecos de lana y quiero que queden secos',
    { id: 'lana', motivo: 'La lana necesita un ciclo suave y centrifugado bajo para no encogerse.', alternativas: ['delicado'],
      ajuste: { temperatura: '30°C', centrifugado: '600 RPM', secado: 'Sin secado', funciones: [] },
      consejo: 'La lana no va a la secadora: sécalos estirados sobre una toalla.' }],
  ['Una camisa que necesito seca para esta noche',
    { id: 'rapido15', motivo: 'Es una sola prenda poco sucia y tienes apuro.', alternativas: ['mixto'],
      ajuste: { temperatura: 'Frío', centrifugado: '800 RPM', secado: 'Seco normal', funciones: [] },
      consejo: 'Presiona "Secado" para pasar a 1h WD: lava y seca hasta 1 kg en una hora.' }],
  ['El plumón de la cama',
    { id: 'algodon', motivo: 'El plumón es una pieza grande que necesita un ciclo largo y espacio para girar.', alternativas: ['mixto'],
      ajuste: { temperatura: '40°C', centrifugado: '800 RPM', secado: 'Sin secado', funciones: ['Enjuague adicional'] },
      consejo: 'El manual pide no secar plumones a máquina: tiéndelo al aire y sacúdelo seguido.' }],
  ['El tambor quedó casi lleno de jeans y poleras',
    { id: 'mixto', motivo: 'Jeans y poleras son ropa del día a día con mezcla de telas.', alternativas: ['algodon'],
      ajuste: { temperatura: '30°C', centrifugado: '1000 RPM', secado: 'Sin secado', funciones: [] },
      consejo: 'Deja un palmo libre arriba para que la ropa gire, y lava los jeans al revés.' }]
];

const SISTEMA = [
  'Eres un asistente experto en la lavadora-secadora Midea MLSF-095B (carga frontal, 9,5 kg lavado / 7 kg secado, 1400 rpm, motor Inverter, funciones Stain Master y Vapor Hygiene).',
  'Tu tarea: elegir EL MEJOR de sus 14 programas para lo que el usuario describe, y sugerir cómo ajustarlo.',
  '',
  'Programas (usa EXACTAMENTE el id indicado). Tras "|" va lo que se puede ajustar en cada uno:',
  PROGRAMAS.map(p => '- ' + p.id + ' (' + p.nombre + '): ' + p.ia + ' | ' + textoAjustes(p)).join('\n'),
  '',
  'Datos del manual:',
  '- Pasos del panel: temperatura Frío-20-30-40-60-90°C; centrifugado 0-600-800-1000-1200-1400 RPM; secado Menos seco (D-1), Seco normal (D-2), Extra seco (D-3) o Por tiempo.',
  '- NO secar a máquina: lana, seda, cortinas sintéticas, medias de nailon, ropa con piezas metálicas, plumones, edredones, colchas, sacos de dormir, prendas con gomaespuma y ropa con restos de laca, quitaesmalte o solventes.',
  '- Stain Master (solo Algodón y Mixto; Delicado solo Alimentos y Bebidas): Alimentos (verduras, jugos, salsas), Bebidas (vino tinto, bebidas, refrescos), Deportes y fitness (pasto, polvo, sudor), Exteriores y trabajadores (grasa, barro, carbón), Salud y belleza (cosméticos, sangre).',
  '- Prelavado: ropa muy sucia o con barro. Enjuague adicional: ropa de bebé, piel sensible o alergias, o mucho detergente.',
  '',
  'Reglas:',
  '- Responde ÚNICAMENTE con un objeto JSON válido, sin texto extra ni markdown.',
  '- Formato: {"id":"<id>","motivo":"<una frase>","alternativas":["<id>"],"ajuste":{"temperatura":"...","centrifugado":"...","secado":"...","funciones":[]},"consejo":"<una frase>"}',
  '- "id" DEBE ser uno de los ids de la lista. "alternativas" son 0 a 2 ids secundarios, distintos de "id".',
  '- "ajuste": usa solo valores que ese programa admite; si algo no se puede elegir en ese programa, pon "No aplica". Máximo 2 funciones, y solo si ayudan (Stain Master solo si hay una mancha concreta).',
  '- "motivo": por qué ese programa, en una frase breve. "consejo": un consejo práctico para ESA carga, en una frase de máximo 150 caracteres, sin repetir el motivo (manchas, cómo cargar, cómo secar, carga máxima si se pasa).',
  '- Escribe en español de Chile, tuteando, claro y sin tecnicismos.',
  '- IMPORTANTE: elige "limpieza" SOLO si el usuario quiere limpiar o desinfectar la máquina o el tambor. Si menciona el tambor como CAPACIDAD (lleno, casi todo, cuánto cabe), NO uses "limpieza": recomienda un programa de lavado.',
  '- Poca ropa y urgente -> rapido15. Quiere lavar Y secar en un ciclo -> lavadosecado. Solo secar -> autosecado. Solo escurrir o centrifugar -> centrifugado.',
  '- Si pide secar algo que no se debe secar a máquina, recomienda lavarlo bien, pon "Sin secado" y avísalo en el consejo.',
  '- Si no está claro el tipo de prenda, usa "mixto".',
  '',
  'Ejemplos:',
  EJEMPLOS.map(([pregunta, respuesta]) => 'Usuario: ' + pregunta + '\nRespuesta: ' + JSON.stringify(respuesta)).join('\n')
].join('\n');

// --- Protección del saldo ---------------------------------------------------------------
// La app la usan pocas personas, a veces desde el mismo wifi (misma IP): los límites son holgados.
// OJO: esto vive en la memoria de cada instancia de Vercel (si hay varias, cada una cuenta aparte).
// Lo que de verdad protege el saldo es el tope de gasto de la clave en OpenRouter.
const LIMITE_MINUTO = 15;          // consultas por IP en 1 minuto
const LIMITE_DIA = 150;            // consultas por IP en 24 h
const LIMITE_DIA_TOTAL = 600;      // consultas de todas las IP en 24 h (por instancia)
const MINUTO_MS = 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;
const MAX_IPS = 5000;              // tope de IPs recordadas (para no llenar la memoria)

const USO = new Map();             // ip -> { minuto: [horas], dia: n, diaDesde: ms }
let USO_TOTAL = { n: 0, desde: 0 };

// Sitios que pueden usar la API desde el navegador (además del propio dominio del despliegue).
const ORIGENES = ['https://asistente-lavado-midea.vercel.app', process.env.PUBLIC_SITE_URL].filter(Boolean);

function cabecera(req, nombre) {
  const v = req.headers && req.headers[nombre];
  return Array.isArray(v) ? v[0] : (v || '');
}

// Solo la propia página (mismo dominio), producción o localhost. Los navegadores siempre mandan
// "Origin" en un POST con fetch; sin él (curl, scripts) se rechaza.
function origenPermitido(req) {
  const origen = cabecera(req, 'origin');
  if (!origen) return false;
  let url;
  try { url = new URL(origen); } catch (e) { return false; }
  if (ORIGENES.includes(url.origin)) return true;
  const propio = cabecera(req, 'x-forwarded-host') || cabecera(req, 'host');
  if (propio && url.host === propio) return true;
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
}

// En Vercel, "x-forwarded-for" la pone la plataforma: la primera IP es la del usuario.
function ipDe(req) {
  const xff = cabecera(req, 'x-forwarded-for').split(',')[0].trim();
  return xff || cabecera(req, 'x-real-ip') || (req.socket && req.socket.remoteAddress) || 'desconocida';
}

// Anota la consulta y devuelve null si está permitida, o los segundos que hay que esperar.
function revisarLimite(ip) {
  const ahora = Date.now();

  if (ahora - USO_TOTAL.desde > DIA_MS) USO_TOTAL = { n: 0, desde: ahora };
  if (USO_TOTAL.n >= LIMITE_DIA_TOTAL) return Math.ceil((USO_TOTAL.desde + DIA_MS - ahora) / 1000);

  if (!USO.has(ip) && USO.size >= MAX_IPS) {
    for (const [k, u] of USO) if (ahora - u.diaDesde > DIA_MS) USO.delete(k);
    if (USO.size >= MAX_IPS) USO.clear();
  }
  let u = USO.get(ip);
  if (!u || ahora - u.diaDesde > DIA_MS) { u = { minuto: [], dia: 0, diaDesde: ahora }; USO.set(ip, u); }
  u.minuto = u.minuto.filter(t => ahora - t < MINUTO_MS);

  if (u.dia >= LIMITE_DIA) return Math.ceil((u.diaDesde + DIA_MS - ahora) / 1000);
  if (u.minuto.length >= LIMITE_MINUTO) return Math.ceil((u.minuto[0] + MINUTO_MS - ahora) / 1000);

  u.minuto.push(ahora);
  u.dia++;
  USO_TOTAL.n++;
  return null;
}

function extraerJSON(txt) {
  if (!txt) return null;
  const i = txt.indexOf('{');
  const j = txt.lastIndexOf('}');
  if (i === -1 || j === -1 || j <= i) return null;
  try { return JSON.parse(txt.slice(i, j + 1)); } catch (e) { return null; }
}

module.exports = async function handler(req, res) {
  const inicio = Date.now();

  // GET: diagnóstico rápido (no gasta cuota). POST: recomendación.
  if (req.method === 'GET') {
    const gratis = await listarGratis();
    res.status(200).json({
      ok: true,
      claveConfigurada: !!process.env.OPENROUTER_API_KEY,
      modeloPrincipal: MODELO_PRINCIPAL,
      modelosGratisDisponibles: gratis.length,
      listaGratisMinutos: CACHE_GRATIS ? Math.round((Date.now() - CACHE_GRATIS.hora) / 60000) : null,
      candidatos: await obtenerCandidatos()
    });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Metodo no permitido' });
    return;
  }

  if (!origenPermitido(req)) {
    res.status(403).json({ error: 'Origen no permitido.' });
    return;
  }

  const espera = revisarLimite(ipDe(req));
  if (espera !== null) {
    if (res.setHeader) res.setHeader('Retry-After', String(Math.max(1, espera)));
    res.status(429).json({ error: 'Demasiadas consultas. Prueba de nuevo en un rato.', esperaSegundos: espera });
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'Falta la variable OPENROUTER_API_KEY en Vercel.' });
    return;
  }

  let texto = '';
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    texto = String(body.texto || '').slice(0, 600).trim();
  } catch (e) { /* ignore */ }
  if (!texto) {
    res.status(400).json({ error: 'Falta el texto a analizar.' });
    return;
  }

  const candidatos = await obtenerCandidatos();
  const restante = Math.max(1000, LIMITE_TOTAL_MS - (Date.now() - inicio));

  let r;
  try {
    r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.PUBLIC_SITE_URL || 'https://asistente-lavado-midea.vercel.app',
        'X-Title': 'Asistente Lavado Midea'
      },
      body: JSON.stringify(cuerpoPara(candidatos, texto)),
      signal: AbortSignal.timeout(restante)
    });
  } catch (e) {
    const tiempo = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    res.status(tiempo ? 504 : 502).json({
      error: tiempo ? 'La IA tardo demasiado.' : 'No se pudo conectar con la IA.',
      candidatos,
      ms: Date.now() - inicio
    });
    return;
  }

  let data = null;
  try { data = await r.json(); } catch (e) { /* respuesta no JSON */ }

  if (!r.ok) {
    const msg = data && data.error && data.error.message ? String(data.error.message).slice(0, 200) : '';
    res.status(502).json({ error: 'No se pudo obtener recomendacion de la IA.', detalle: 'HTTP ' + r.status + (msg ? ' ' + msg : ''), candidatos });
    return;
  }

  const modelo = (data && data.model) || candidatos[0];
  const contenido = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content : '';
  const parsed = extraerJSON(contenido);
  if (!parsed || !IDS.includes(parsed.id)) {
    res.status(502).json({ error: 'La IA respondio en un formato invalido.', modelo, candidatos });
    return;
  }

  const alternativas = (Array.isArray(parsed.alternativas) ? parsed.alternativas : [])
    .filter(id => IDS.includes(id) && id !== parsed.id)
    .slice(0, 2);

  const programa = PROGRAMAS.find(p => p.id === parsed.id);
  res.status(200).json({
    id: parsed.id,
    motivo: String(parsed.motivo || '').slice(0, 300),
    alternativas,
    ajuste: limpiarAjuste(programa, parsed.ajuste),
    consejo: typeof parsed.consejo === 'string' ? parsed.consejo.trim().slice(0, MAX_CONSEJO) : '',
    modelo,
    ms: Date.now() - inicio
  });
};
