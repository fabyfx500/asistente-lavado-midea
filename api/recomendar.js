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

const ESQUEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'recomendacion',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        motivo: { type: 'string' },
        alternativas: { type: 'array', items: { type: 'string' } }
      },
      required: ['id', 'motivo', 'alternativas'],
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

// Los 14 programas vienen del archivo compartido con la página (campo "ia" = resumen para el prompt).
const PROGRAMAS = require('../programas.js');

const IDS = PROGRAMAS.map(p => p.id);

const SISTEMA = [
  'Eres un asistente experto en la lavadora-secadora Midea MLSF-095B (carga frontal, 9,5 kg lavado / 7 kg secado, 1400 rpm, motor Inverter Quattro, Display Lunar, funciones Stain Master y HealthGuard).',
  'Tu tarea: elegir EL MEJOR de sus 14 programas para lo que el usuario describe que va a lavar.',
  '',
  'Programas disponibles (usa EXACTAMENTE el id indicado):',
  PROGRAMAS.map(p => '- ' + p.id + ' (' + p.nombre + '): ' + p.ia).join('\n'),
  '',
  'Reglas:',
  '- Responde UNICAMENTE con un objeto JSON valido, sin texto extra ni markdown.',
  '- Formato exacto: {"id":"<id>","motivo":"<una frase breve en espanol>","alternativas":["<id>","<id>"]}',
  '- "id" DEBE ser uno de los ids de la lista. "alternativas" son 0 a 2 ids secundarios.',
  '- IMPORTANTE: elige "limpieza" SOLO si el usuario quiere limpiar o desinfectar la maquina o el tambor. Si menciona el tambor como CAPACIDAD (lleno, casi todo, cuanto cabe), NO uses "limpieza": recomienda un programa de lavado.',
  '- Poca ropa y urgente -> rapido15. Quiere lavar Y secar en un ciclo -> lavadosecado. Solo secar -> autosecado. Solo escurrir o centrifugar -> centrifugado.',
  '- Si no esta claro el tipo de prenda, usa "mixto".'
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

  res.status(200).json({
    id: parsed.id,
    motivo: String(parsed.motivo || '').slice(0, 300),
    alternativas,
    modelo,
    ms: Date.now() - inicio
  });
};
