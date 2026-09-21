// Vercel Serverless Function: recomienda el mejor programa de la Midea MLSF-095B usando OpenRouter.
// Requiere la variable de entorno OPENROUTER_API_KEY (Vercel > Settings > Environment Variables).
// La clave NUNCA va en el HTML: se queda en el servidor.

// Modelos gratuitos de OpenRouter (se prueban en orden). Puedes fijar uno con OPENROUTER_MODEL.
const MODELOS = [
  process.env.OPENROUTER_MODEL,
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen-2.5-72b-instruct:free',
  'deepseek/deepseek-chat-v3-0324:free',
  'google/gemma-2-9b-it:free',
  'mistralai/mistral-7b-instruct:free'
].filter(Boolean);

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

  let detalle = '';
  for (const modelo of MODELOS) {
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
        })
      });

      if (!r.ok) { detalle = modelo + ' HTTP ' + r.status; continue; }

      const data = await r.json();
      const contenido = data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content : '';
      const parsed = extraerJSON(contenido);
      if (!parsed || !IDS.includes(parsed.id)) { detalle = modelo + ' respuesta invalida'; continue; }

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
      detalle = modelo + ' ' + (e && e.message ? e.message : 'error');
    }
  }

  res.status(502).json({ error: 'No se pudo obtener recomendacion de la IA.', detalle });
};
