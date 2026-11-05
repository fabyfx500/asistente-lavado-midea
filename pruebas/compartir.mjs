// Pruebas de "compartir a la app" (Web Share Target).
// Uso: node pruebas/compartir.mjs
// Toma textoCompartido() directamente de app.js (y normalizar(), que usa) y revisa que el
// manifest declare el share_target con los mismos nombres de parámetros.
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
function trozo(desde, hasta) {
  const i = app.indexOf(desde), j = app.indexOf(hasta, i);
  if (i < 0 || j < 0) throw new Error('No encontré "' + desde + '" en app.js');
  return app.slice(i, j);
}
const codigo = trozo('function normalizar', 'function escaparHtml') +
  trozo('const MAX_COMPARTIDO', 'const CLAVE_TEMA');
const { textoCompartido, MAX_COMPARTIDO } =
  new Function(codigo + '\nreturn { textoCompartido, MAX_COMPARTIDO };')();

let ok = 0, mal = 0;
function prueba(nombre, real, esperado) {
  if (real === esperado) { ok++; return; }
  mal++;
  console.log('✗ ' + nombre + '\n   esperado: ' + JSON.stringify(esperado) + '\n   obtenido: ' + JSON.stringify(real));
}
const p = (q) => textoCompartido(new URLSearchParams(q));

// Sin nada compartido: null (se sigue con ?q= o la pantalla normal)
prueba('sin parámetros', p(''), null);
prueba('solo ?q=', p('q=Sábanas'), null);
prueba('solo ?origen=app', p('origen=app'), null);
// Texto simple
prueba('solo texto', p('texto=Su%C3%A9ter%20de%20lana'), 'Suéter de lana');
prueba('solo título', p('titulo=Poler%C3%B3n%20de%20algod%C3%B3n'), 'Polerón de algodón');
prueba('título y texto distintos', p('titulo=Poler%C3%B3n%20Nike&texto=100%25%20poli%C3%A9ster'), 'Polerón Nike. 100% poliéster');
prueba('título con punto final', p('titulo=Chaqueta.&texto=Lavar%20a%2030'), 'Chaqueta. Lavar a 30');
prueba('texto contiene el título', p('titulo=Jeans&texto=Jeans%20azules%20elasticados'), 'Jeans azules elasticados');
prueba('título contiene el texto', p('titulo=Toallas%20de%20ba%C3%B1o%20grandes&texto=toallas'), 'Toallas de baño grandes');
prueba('iguales sin tildes', p('titulo=Sueter&texto=su%C3%A9ter'), 'suéter');
// Enlaces: se quitan
prueba('texto con enlace', p('texto=Mira%20esta%20polera%20https%3A%2F%2Ftienda.cl%2Fp%2F123'), 'Mira esta polera');
prueba('enlace www', p('texto=www.tienda.cl%2Fx%20s%C3%A1banas'), 'sábanas');
prueba('enlace aparte', p('titulo=S%C3%A1banas&enlace=https%3A%2F%2Ftienda.cl'), 'Sábanas');
prueba('solo enlace → vacío', p('enlace=https%3A%2F%2Ftienda.cl%2Fp%2F1'), '');
prueba('enlace dentro del texto → vacío', p('texto=https%3A%2F%2Ftienda.cl%2Fp%2F1'), '');
prueba('parámetros vacíos → vacío', p('titulo=&texto=&enlace='), '');
// Espacios y saltos de línea
prueba('espacios y saltos', p('texto=%20%20ropa%0A%0Ade%20%20beb%C3%A9%20'), 'ropa de bebé');
// Largo máximo, cortando en un espacio
const largo = p('texto=' + encodeURIComponent('lana '.repeat(100)));
prueba('largo máximo', largo.length <= MAX_COMPARTIDO && !largo.endsWith(' ') && largo.endsWith('lana'), true);
const sinEspacios = p('texto=' + 'a'.repeat(500));
prueba('largo sin espacios', sinEspacios.length, MAX_COMPARTIDO);

// El manifest debe usar los mismos nombres que lee app.js
const manifest = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
const st = manifest.share_target || {};
prueba('manifest: action', st.action, '/');
prueba('manifest: método GET', st.method, 'GET');
prueba('manifest: parámetros', JSON.stringify(st.params), JSON.stringify({ title: 'titulo', text: 'texto', url: 'enlace' }));
prueba('manifest: action dentro del scope', String(st.action).startsWith(manifest.scope), true);

console.log(`${ok} OK, ${mal} con error`);
process.exit(mal ? 1 : 0);
