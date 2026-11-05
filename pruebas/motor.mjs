// Pruebas del motor local de palabras clave.
// Uso: node pruebas/motor.mjs
// Toma el código del motor directamente de app.js (desde "function normalizar" hasta
// "function tarjetaPrograma") y los programas de programas.js, así las pruebas siempre usan
// la versión real.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const PROGRAMAS = createRequire(import.meta.url)('../programas.js');
const html = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const ini = html.indexOf('function normalizar');
const fin = html.indexOf('function tarjetaPrograma');
if (ini < 0 || fin < 0) throw new Error('No encontré el motor dentro de app.js');
const { recomendar, coincide, normalizar } =
  new Function('PROGRAMAS', html.slice(ini, fin) + '\nreturn { recomendar, coincide, normalizar };')(PROGRAMAS);

// [texto del usuario, programa esperado en primer lugar]
const casos = [
  // Falsos positivos del diagnóstico (antes daban otro programa)
  ['sábanas planas', 'algodon'],          // antes: Lana ("planas" contiene "lana")
  ['títulos bordados de la polera', 'mixto'], // antes: Delicado ("títulos" contiene "tul")
  ['camisa con un hueco', 'mixto'],       // antes: ECO ("hueco" contiene "eco")
  ['tejido de algodón, sábanas', 'algodon'], // antes: Lana ("tejido")
  // Ejemplos de la pantalla
  ['Ropa deportiva de poliéster', '20c'],
  ['Sábanas y toallas', 'algodon'],
  ['Un suéter de lana', 'lana'],
  ['Jeans y poleras', 'mixto'],
  ['Ropa de bebé (higiene)', 'vapor'],
  ['Lavar y secar de una vez', 'lavadosecado'],
  ['Solo secar la ropa', 'autosecado'],
  ['Ropa delicada de seda', 'delicado'],
  // Plurales y variantes
  ['calcetines y pantalones', 'mixto'],
  ['dos toallas', 'algodon'],
  ['vestido de tul', 'delicado'],
  ['limpiar el tambor', 'limpieza'],
  ['quiero ahorrar energía', 'eco'],
  ['algo rápido, 15 minutos', 'rapido15'],
  ['solo centrifugar', 'centrifugado'],
];

// [texto, palabra clave, ¿debe coincidir?]
const palabras = [
  ['sabanas planas', 'lana', false],
  ['titulos', 'tul', false],
  ['hueco', 'eco', false],
  ['rellena', 'llena', false],
  ['la lavadora queda llena', 'llena', true],
  ['sabanas', 'sábana', true],
  ['calcetines', 'calcetín', true],
  ['quiero secarla', 'secar', true],
  ['limpiar bien el tambor', 'limpiar tambor', true],
  ['sanitizado', 'sanitizado', true],
];

let fallas = 0;
for (const [texto, esperado] of casos) {
  const top = recomendar(texto)[0];
  const obtenido = top && top.score > 0 ? top.p.id : '(nada)';
  const ok = obtenido === esperado;
  if (!ok) fallas++;
  console.log(`${ok ? 'OK ' : 'MAL'}  "${texto}" → ${obtenido}${ok ? '' : ` (esperaba ${esperado}; detectó: ${top.matched.join(', ')})`}`);
}
for (const [texto, kw, debe] of palabras) {
  const ok = coincide(normalizar(texto), kw) === debe;
  if (!ok) fallas++;
  console.log(`${ok ? 'OK ' : 'MAL'}  "${kw}" ${debe ? 'calza' : 'no calza'} con "${texto}"`);
}
console.log(fallas ? `\n${fallas} prueba(s) fallaron.` : '\nTodas las pruebas pasaron.');
process.exit(fallas ? 1 : 0);
