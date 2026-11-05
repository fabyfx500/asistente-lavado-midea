// Pruebas de api/recomendar.js con OpenRouter simulado (no gasta créditos ni necesita clave).
// Uso: node pruebas/servidor.mjs   (tarda ~8 s por el caso "la IA no contesta")
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RUTA = require.resolve('../api/recomendar.js');
const esperar = ms => new Promise(r => setTimeout(r, ms));

const LISTA = {
  data: [
    { id: 'anthropic/claude-haiku-5.5' },
    { id: 'z-ai/glm-5.2:free' },
    { id: 'otro/modelo-chat:free' },
    { id: 'otro/coder-vision:free' },   // excluido por nombre
    { id: 'qwen/qwen3.8-27b:free' }
  ]
};

// Carga una copia nueva de la función (caché vacía) con un fetch simulado.
function cargar(fetchFalso) {
  delete require.cache[RUTA];
  globalThis.fetch = fetchFalso;
  process.env.OPENROUTER_API_KEY = 'clave-de-prueba';
  return require(RUTA);
}

// Por defecto simula la página publicada pidiendo desde una IP fija.
const CABECERAS = {
  origin: 'https://asistente-lavado-midea.vercel.app',
  host: 'asistente-lavado-midea.vercel.app',
  'x-forwarded-for': '200.1.2.3'
};

async function llamar(handler, metodo = 'POST', body = { texto: 'sábanas planas' }, cabeceras = CABECERAS) {
  const out = { status: 0, json: null, headers: {} };
  const res = {
    status(c) { out.status = c; return this; },
    json(j) { out.json = j; return this; },
    setHeader(k, v) { out.headers[k.toLowerCase()] = v; }
  };
  const t = Date.now();
  await handler({ method: metodo, body, headers: cabeceras }, res);
  out.ms = Date.now() - t;
  return out;
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
const respuestaIA = (contenido, model = 'anthropic/claude-haiku-5.5') =>
  json({ model, choices: [{ message: { content: contenido } }] });

let fallas = 0;
function ok(cond, nombre, extra) {
  console.log((cond ? '  OK   ' : '  FALLA') + ' ' + nombre + (cond || extra === undefined ? '' : ' → ' + JSON.stringify(extra)));
  if (!cond) fallas++;
}

// 1. Caso normal: una sola llamada con models [Haiku, gratis preferido, otro gratis]
{
  const pedidas = [];
  const h = cargar(async (url, opt) => {
    if (url.endsWith('/models')) return json(LISTA);
    pedidas.push(JSON.parse(opt.body));
    return respuestaIA('{"id":"algodon","motivo":"Sábanas resistentes.","alternativas":["eco","algodon","xx"]}');
  });
  const r = await llamar(h);
  console.log('1. Respuesta normal');
  ok(r.status === 200 && r.json.id === 'algodon', 'recomienda Algodón', r);
  ok(pedidas.length === 1, 'hace UNA sola llamada al chat', pedidas.length);
  const b = pedidas[0];
  ok(JSON.stringify(b.models) === JSON.stringify(['anthropic/claude-haiku-5.5', 'z-ai/glm-5.2:free', 'qwen/qwen3.8-27b:free']),
    'models = Haiku + 2 gratis preferidos (existentes)', b.models);
  ok(b.max_tokens === 1024 && !('temperature' in b) && b.response_format, 'max_tokens, JSON y sin temperature', b);
  ok(JSON.stringify(r.json.alternativas) === '["eco"]', 'alternativas filtradas (sin repetidos ni ids inválidos)', r.json.alternativas);
  ok(r.json.modelo === 'anthropic/claude-haiku-5.5', 'informa el modelo que respondió', r.json.modelo);
}

// 2. Respondió un modelo de respaldo con texto alrededor del JSON
{
  const h = cargar(async url => url.endsWith('/models') ? json(LISTA)
    : respuestaIA('Claro: {"id":"20c","motivo":"Deportiva.","alternativas":[]} listo', 'z-ai/glm-5.2:free'));
  const r = await llamar(h);
  console.log('2. Respaldo gratuito');
  ok(r.status === 200 && r.json.id === '20c' && r.json.modelo === 'z-ai/glm-5.2:free', 'usa la respuesta y el modelo real', r);
}

// 3. Arranque en frío con la lista de modelos lenta: no espera más de ~1,5 s y usa solo Haiku
{
  let models;
  const h = cargar(async (url, opt) => {
    if (url.endsWith('/models')) { await esperar(4000); return json(LISTA); }
    models = JSON.parse(opt.body).models;
    return respuestaIA('{"id":"mixto","motivo":"x","alternativas":[]}');
  });
  const r = await llamar(h);
  console.log('3. Lista de modelos lenta');
  ok(r.status === 200 && r.ms < 2200, 'responde sin esperar la lista (' + r.ms + ' ms)', r);
  ok(JSON.stringify(models) === '["anthropic/claude-haiku-5.5"]', 'sin lista, solo el modelo principal', models);
}

// 4. Caché: la segunda consulta no vuelve a pedir la lista; vencida, la renueva por detrás
{
  let listas = 0;
  const h = cargar(async url => {
    if (url.endsWith('/models')) { listas++; return json(LISTA); }
    return respuestaIA('{"id":"mixto","motivo":"x","alternativas":[]}');
  });
  await llamar(h); await llamar(h);
  console.log('4. Caché de la lista');
  ok(listas === 1, 'la lista se pide una sola vez', listas);
  const realNow = Date.now;
  Date.now = () => realNow() + 2 * 60 * 60 * 1000; // 2 h después
  await llamar(h);
  Date.now = realNow;
  await esperar(50);
  ok(listas === 2, 'vencida (1 h), se renueva', listas);
}

// 5. La IA no contesta: corta antes de 8 s con 504
{
  const h = cargar(async (url, opt) => {
    if (url.endsWith('/models')) return json(LISTA);
    return new Promise((_, rej) => opt.signal.addEventListener('abort', () => rej(opt.signal.reason)));
  });
  // Un fetch real mantiene vivo el proceso con la conexión abierta; aquí lo simula un temporizador.
  const vivo = setTimeout(() => {}, 10000);
  const r = await llamar(h);
  clearTimeout(vivo);
  console.log('5. IA colgada');
  ok(r.status === 504 && r.ms < 7600, 'devuelve 504 en ' + r.ms + ' ms (< 8 s del front)', r);
}

// 6. Error de OpenRouter (todos los modelos fallaron) y JSON inválido
{
  let h = cargar(async url => url.endsWith('/models') ? json(LISTA) : json({ error: { message: 'Insufficient credits' } }, 402));
  let r = await llamar(h);
  console.log('6. Errores');
  ok(r.status === 502 && r.json.detalle.includes('402'), 'HTTP de error → 502 con detalle', r);
  h = cargar(async url => url.endsWith('/models') ? json(LISTA) : respuestaIA('{"id":"lavar-todo","motivo":"x"}'));
  r = await llamar(h);
  ok(r.status === 502, 'id inexistente → 502', r);
}

// 7. Validaciones de entrada
{
  const h = cargar(async () => json(LISTA));
  console.log('7. Entrada');
  ok((await llamar(h, 'POST', { texto: '  ' })).status === 400, 'texto vacío → 400');
  ok((await llamar(h, 'PUT')).status === 405, 'otro método → 405');
  const g = await llamar(h, 'GET');
  ok(g.status === 200 && g.json.claveConfigurada === true && g.json.candidatos.length === 3, 'GET de diagnóstico', g.json);
  delete process.env.OPENROUTER_API_KEY;
  ok((await llamar(h)).status === 503, 'sin clave → 503');
}

// 8. Verificación de origen
{
  let chats = 0;
  const h = cargar(async url => {
    if (url.endsWith('/models')) return json(LISTA);
    chats++;
    return respuestaIA('{"id":"mixto","motivo":"x","alternativas":[]}');
  });
  const con = extra => ({ ...CABECERAS, ...extra });
  console.log('8. Origen');
  const sinOrigen = { ...CABECERAS }; delete sinOrigen.origin;
  ok((await llamar(h, 'POST', undefined, sinOrigen)).status === 403, 'sin Origin (curl, scripts) → 403');
  ok((await llamar(h, 'POST', undefined, con({ origin: 'https://otro-sitio.com' }))).status === 403, 'otro sitio → 403');
  ok((await llamar(h, 'POST', undefined, con({ origin: 'https://asistente-lavado-midea.vercel.app.malo.com' }))).status === 403,
    'dominio que solo empieza igual → 403');
  ok((await llamar(h, 'POST', undefined, con({ origin: 'null' }))).status === 403, 'Origin "null" → 403');
  ok(chats === 0, 'los rechazados no llegan a la IA', chats);
  ok((await llamar(h)).status === 200, 'producción → 200');
  ok((await llamar(h, 'POST', undefined, con({ origin: 'https://asistente-lavado-midea-abc123.vercel.app', host: 'asistente-lavado-midea-abc123.vercel.app' }))).status === 200,
    'vista previa de Vercel (mismo dominio que la función) → 200');
  ok((await llamar(h, 'POST', undefined, con({ origin: 'http://localhost:3000', host: 'localhost:3000' }))).status === 200, 'localhost → 200');
  ok((await llamar(h, 'GET', undefined, {})).status === 200, 'el GET de diagnóstico no exige Origin');
}

// 9. Límite de uso por IP
{
  let chats = 0;
  const h = cargar(async url => {
    if (url.endsWith('/models')) return json(LISTA);
    chats++;
    return respuestaIA('{"id":"mixto","motivo":"x","alternativas":[]}');
  });
  const ip = n => ({ ...CABECERAS, 'x-forwarded-for': n + ', 10.0.0.1' });
  console.log('9. Límite por IP');
  const estados = [];
  for (let i = 0; i < 16; i++) estados.push((await llamar(h, 'POST', undefined, ip('1.1.1.1'))).status);
  ok(estados.slice(0, 15).every(s => s === 200) && estados[15] === 429, '15 por minuto pasan, la 16.ª → 429', estados);
  const r = await llamar(h, 'POST', undefined, ip('1.1.1.1'));
  ok(r.status === 429 && Number(r.headers['retry-after']) > 0 && Number(r.headers['retry-after']) <= 60,
    'avisa cuánto esperar (Retry-After ' + r.headers['retry-after'] + ' s)', r);
  ok(chats === 15, 'las bloqueadas no llegan a la IA', chats);
  ok((await llamar(h, 'POST', undefined, ip('2.2.2.2'))).status === 200, 'otra IP no se ve afectada');

  const realNow = Date.now;
  let reloj = realNow();
  Date.now = () => reloj;
  reloj += 61 * 1000;
  ok((await llamar(h, 'POST', undefined, ip('1.1.1.1'))).status === 200, 'al minuto siguiente vuelve a responder');

  // Tope diario por IP: 150 (repartidas para no chocar con el de 15/minuto)
  let ultimo;
  for (let i = 0; i < 160; i++) {
    if (i % 15 === 0) reloj += 61 * 1000;
    ultimo = (await llamar(h, 'POST', undefined, ip('3.3.3.3'))).status;
    if (ultimo === 429) { ok(i === 150, 'tope diario: la consulta 151 del día → 429', i + 1); break; }
  }
  ok(ultimo === 429, 'se alcanzó el tope diario');
  reloj += 24 * 60 * 60 * 1000;
  ok((await llamar(h, 'POST', undefined, ip('3.3.3.3'))).status === 200, 'al día siguiente vuelve a responder');
  Date.now = realNow;
}

// 10. Tope total por instancia (600 al día entre todas las IP)
{
  const h = cargar(async url => url.endsWith('/models') ? json(LISTA) : respuestaIA('{"id":"mixto","motivo":"x","alternativas":[]}'));
  console.log('10. Tope total');
  let n = 0, s;
  do { s = (await llamar(h, 'POST', undefined, { ...CABECERAS, 'x-forwarded-for': '9.9.' + Math.floor(n / 10) + '.' + (n % 10) })).status; n++; }
  while (s === 200 && n < 700);
  ok(s === 429 && n === 601, 'la consulta 601 del día (de IPs distintas) → 429', n);
}

console.log(fallas ? `\n${fallas} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(fallas ? 1 : 0);
