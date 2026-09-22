// Vercel Serverless Function: recomienda el mejor programa de la Midea MLSF-095B usando OpenRouter.
// Requiere la variable de entorno OPENROUTER_API_KEY (Vercel > Settings > Environment Variables).
// La clave NUNCA va en el HTML: se queda en el servidor.

// Modelos gratuitos: se DESCUBREN dinámicamente desde OpenRouter (los IDs cambian seguido).
// Orden preferido (se usa si el modelo existe en la lista real). Puedes forzar uno con OPENROUTER_MODEL.
const PREFERIDOS = [
  process.env.OPENROUTER_MODEL,
  'z-ai/glm-5.2:free',
  'qwen/qwen3.8-27b:free',
  'google/gemma-4-31b-it:free',
  'nex-agi/nex-n2.5-pro:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'thinkingmachines/inkling:free'
].filter(Boolean);

// Modelos que no sirven para esta tarea (código, visión, moderación, finanzas, salud).
const EXCLUIR = ['code', 'vision', 'vl', 'embed', 'guard', 'safety', 'moderation', 'finance', 'health'];

let CACHE_GRATIS = null;

async function listarGratis() {
  if (CACHE_GRATIS) return CACHE_GRATIS;
  try {
    const r = await fetch('https://openrouter.ai/api/v1/models');
    if (!r.ok) return [];
    const data = await r.json();
    CACHE_GRATIS = (data.data || [])
      .map(m => m && m.id)
      .filter(id => typeof id === 'string' && id.endsWith(':free'))
      .filter(id => !EXCLUIR.some(x => id.toLowerCase().includes(x)));
    return CACHE_GRATIS;
  } catch (e) { return []; }
}

async function obtenerCandidatos(max) {
  const gratis = await listarGratis();
  let lista;
  if (gratis.length) {
    const pref = PREFERIDOS.filter(m => gratis.includes(m));
    const resto = gratis.filter(m => !pref.includes(m));
    lista = pref.concat(resto);
  } else {
    lista = PREFERIDOS;
  }
  return lista.slice(0, max || 5);
}

const PROGRAMAS = [
  { id: 'algodon', nombre: 'Algodón', uso: 'Sábanas, toallas, ropa de cama, manteles, algodón y lino resistente. 40°C (hasta 90°C), 1400 rpm.' },
  { id: 'mixto', nombre: 'Mixto', uso: 'Ropa cotidiana con mezcla de telas y colores: poleras, jeans, camisas, pijamas. 40°C, 1000 rpm. Opción segura por defecto.' },
  { id: 'delicado', nombre: 'Delicado', uso: 'Seda, encaje, lencería y telas frágiles. 30°C, 800 rpm, sin secadora.' },
  { id: 'lana', nombre: 'Lana', uso: 'Lana, tejidos, suéteres, bufandas, cashmere. Máximo 40°C, 600 rpm, sin secadora.' },
  { id: 'eco', nombre: 'ECO 40-60', uso: 'Ahorro de agua y energía con algodón de suciedad normal. 40-60°C, 1400 rpm.' },
  { id: '20c', nombre: '20°C', uso: 'Agua fría: ropa deportiva, poliéster, sintéticos, lycra, prendas que destiñen. 20°C, 1000 rpm.' },
  { id: 'vapor', nombre: 'Vapor Hygiene', uso: 'Higiene y sanitización: ropa de bebé, ropa interior, toallas, personas alérgicas. 60-90°C, 1400 rpm.' },
  { id: 'rapido15', nombre: "Rápido 15'", uso: 'Poca ropa con suciedad leve y urgencia. Frío-30°C, 800 rpm, 15 min.' },
  { id: 'lavadosecado', nombre: 'Lavado y Secado', uso: 'Lavar y secar en un solo ciclo continuo, sin intervención. 3-4 h.' },
  { id: 'autosecado', nombre: 'Auto Secado', uso: 'Solo secar, con sensor de humedad que corta al estar seca.' },
  { id: 'tiemposecado', nombre: 'Tiempo Secado', uso: 'Solo secar por tiempo fijo (30-180 min).' },
  { id: 'centrifugado', nombre: 'Sólo Centrifugado', uso: 'Solo escurrir/centrifugar para sacar el exceso de agua. 1400 rpm.' },
  { id: 'limpieza', nombre: 'Limpieza Tambor', uso: 'SOLO para limpiar/desinfectar el tambor de la máquina, EN VACÍO y sin ropa (mantenimiento). 90°C.' },
  { id: 'favorito', nombre: 'Favorito', uso: 'Programa personalizado guardado por el usuario.' }
];

const IDS = PROGRAMAS.map(p => p.id);

const SISTEMA = [
  'Eres un asistente experto en la lavadora-secadora Midea MLSF-095B (carga frontal, 9,5 kg lavado / 7 kg secado, 1400 rpm, motor Inverter Quattro, Display Lunar, funciones Stain Master y HealthGuard).',
  'Tu tarea: elegir EL MEJOR de sus 14 programas para lo que el usuario describe que va a lavar.',
  '',
  'Programas disponibles (usa EXACTAMENTE el id indicado):',
  PROGRAMAS.map(p => '- ' + p.id + ' (' + p.nombre + '): ' + p.uso).join('\n'),
  '',
  'Reglas:',
  '- Responde UNICAMENTE con un objeto JSON valido, sin texto extra ni markdown.',
  '- Formato exacto: {"id":"<id>","motivo":"<una frase breve en espanol>","alternativas":["<id>","<id>"]}',
  '- "id" DEBE ser uno de los ids de la lista. "alternativas" son 0 a 2 ids secundarios.',
  '- IMPORTANTE: elige "limpieza" SOLO si el usuario quiere limpiar o desinfectar la maquina o el tambor. Si menciona el tambor como CAPACIDAD (lleno, casi todo, cuanto cabe), NO uses "limpieza": recomienda un programa de lavado.',
  '- Poca ropa y urgente -> rapido15. Quiere lavar Y secar en un ciclo -> lavadosecado. Solo secar -> autosecado. Solo escurrir o centrifugar -> centrifugado.',
  '- Si no esta claro el tipo de prenda, usa "mixto".'
].join('\n');

function extraerJSON(txt) {
  if (!txt) return null;
  const i = txt.indexOf('{');
  const j = txt.lastIndexOf('}');
  if (i === -1 || j === -1 || j <= i) return null;
  try { return JSON.parse(txt.slice(i, j + 1)); } catch (e) { return null; }
}

module.exports = async function handler(req, res) {
  // GET: diagnóstico rápido (no gasta cuota). POST: recomendación.
  if (req.method === 'GET') {
    const gratis = await listarGratis();
    res.status(200).json({
      ok: true,
      claveConfigurada: !!process.env.OPENROUTER_API_KEY,
      modelosGratisDisponibles: gratis.length,
      candidatos: await obtenerCandidatos(5)
    });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Metodo no permitido' });
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

  const candidatos = await obtenerCandidatos(5);
  const errores = [];
  for (const modelo of candidatos) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.PUBLIC_SITE_URL || 'https://asistente-lavado-midea.vercel.app',
          'X-Title': 'Asistente Lavado Midea'
        },
        body: JSON.stringify({
          model: modelo,
          temperature: 0.2,
          messages: [
            { role: 'system', content: SISTEMA },
            { role: 'user', content: texto }
          ]
        }),
        signal: AbortSignal.timeout(15000)
      });

      if (!r.ok) { errores.push(modelo + ' HTTP ' + r.status); continue; }

      const data = await r.json();
      const contenido = data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content : '';
      const parsed = extraerJSON(contenido);
      if (!parsed || !IDS.includes(parsed.id)) { errores.push(modelo + ' JSON invalido'); continue; }

      const alternativas = (Array.isArray(parsed.alternativas) ? parsed.alternativas : [])
        .filter(id => IDS.includes(id) && id !== parsed.id)
        .slice(0, 2);

      res.status(200).json({
        id: parsed.id,
        motivo: String(parsed.motivo || '').slice(0, 300),
        alternativas,
        modelo
      });
      return;
    } catch (e) {
      errores.push(modelo + ' ' + (e && e.message ? e.message : 'error'));
    }
  }

  res.status(502).json({ error: 'No se pudo obtener recomendacion de la IA.', intentos: candidatos.length, detalle: errores.join(' | ') });
};
