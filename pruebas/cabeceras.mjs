// Revisa que las cabeceras de seguridad de vercel.json calcen con el front.
// Uso: node pruebas/cabeceras.mjs
// Si cambias el <script> en línea de index.html (el del tema), esta prueba falla y te da
// el hash nuevo para pegarlo en la CSP de vercel.json.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const raiz = new URL('../', import.meta.url);
const leer = f => readFileSync(new URL(f, raiz), 'utf8');

const vercel = JSON.parse(leer('vercel.json'));
const todas = vercel.headers.find(h => h.source === '/(.*)');
const cab = Object.fromEntries((todas?.headers || []).map(h => [h.key.toLowerCase(), h.value]));
const csp = cab['content-security-policy'] || '';
const directiva = n => (csp.split(';').map(s => s.trim()).find(s => s.startsWith(n + ' ')) || '');

let fallos = 0;
function caso(nombre, ok, detalle = '') {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${nombre}${!ok && detalle ? '\n      ' + detalle : ''}`);
  if (!ok) fallos++;
}

caso('hay CSP para todas las rutas', !!csp);
caso('Referrer-Policy definida', !!cab['referrer-policy']);
// Con "no-referrer" Chrome manda "Origin: null" en el POST y la API lo rechazaría (403).
caso('Referrer-Policy no rompe la verificación de origen de la API',
  !['no-referrer', ''].includes(cab['referrer-policy'] || ''));
caso('X-Content-Type-Options: nosniff', cab['x-content-type-options'] === 'nosniff');

const html = leer('index.html');
const enLinea = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
caso('index.html tiene el script del tema en línea', enLinea.length === 1);
for (const s of enLinea) {
  const hash = `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;
  caso('el hash del script en línea está en script-src', directiva('script-src').includes(hash),
    `pega esto en script-src de vercel.json: ${hash}`);
}
caso('script-src no permite unsafe-inline / unsafe-eval', !/unsafe-(inline|eval)/.test(directiva('script-src')));
caso('style-src no permite unsafe-inline', !/unsafe-inline/.test(directiva('style-src')));

// La CSP bloquea estilos y eventos escritos dentro del HTML (style="", onclick="").
const front = ['index.html', 'app.js', 'programas.js'];
for (const f of front) {
  const t = leer(f);
  caso(`${f}: sin atributos style="..."`, !/\sstyle\s*=/.test(t));
  caso(`${f}: sin eventos en línea (onclick="...")`, !/<[^>]*\son[a-z]+\s*=/i.test(t));
}
// Todo lo que carga la página tiene que venir del mismo sitio.
caso('index.html no carga nada de otros dominios', !/(src|href)\s*=\s*["']https?:/i.test(html));

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK');
process.exit(fallos ? 1 : 0);
