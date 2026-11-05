# 🧺 Asistente de Lavado — Midea MLSF-095B

Web app que recomienda **el mejor de los 14 programas** de la lavadora-secadora
Midea MLSF-095B (Quattro Inverter, 9,5 kg lavado / 7 kg secado) a partir de una
descripción en lenguaje natural de lo que vas a lavar.

## Cómo funciona

1. Escribes qué vas a lavar (ej: *"Voy a lavar polerones gruesos talla XL, son 4 y ocupan casi todo el tambor"*).
2. El front llama a `/api/recomendar` (función serverless en Vercel).
3. Esa función consulta la IA de **OpenRouter** con un *system prompt* que contiene
   los 14 programas (tomados de `programas.js`, con cargas y tiempos del manual oficial), qué se puede
   ajustar en cada uno y ejemplos resueltos. Devuelve el programa idóneo + el motivo, un **ajuste
   sugerido** (temperatura, centrifugado, secado, Prelavado/Enjuague adicional/Stain Master) y un
   **consejo** para esa carga. El servidor descarta cualquier ajuste que ese programa no admita.
4. Si la API no está disponible o no hay clave, se usa el **motor local de palabras clave** como respaldo.
5. Las últimas 5 recomendaciones quedan en **"Tus últimas consultas"**, guardadas solo en ese
   teléfono (`localStorage`). Al tocar una se muestra al instante, sin volver a consultar a la IA.
6. **Mi Favorito:** la lavadora memoriza una combinación en su botón Favorito. Con
   "⭐ Guardar como mi Favorito" (en cualquier tarjeta) se anota en la app cuál es: programa base,
   temperatura, centrifugado, secado y un nombre. Queda solo en ese teléfono (`localStorage`,
   clave `favorito`) y la tarjeta del programa Favorito muestra esos valores.
7. **Compartir a la app:** con la app instalada en Android, desde otra app (una tienda, WhatsApp, una
   nota) se toca "Compartir" → "Lavado Midea" y se recomienda un programa con ese texto. Llega como
   `/?titulo=…&texto=…&enlace=…` (`share_target` del manifest); los enlaces se descartan y, si solo
   llegó un enlace, la app pide describir la prenda.

## Configurar OpenRouter

El modelo principal es **Claude Haiku 5.5** (`anthropic/claude-haiku-5.5`, ~US$0,0002 por consulta).
Si no hay créditos o falla, se usan automáticamente los modelos gratuitos (`:free`).

1. Crea una cuenta en <https://openrouter.ai>, genera una clave API y carga algunos créditos.
2. En Vercel: **Project → Settings → Environment Variables** y agrega:
   - `OPENROUTER_API_KEY` = tu clave (obligatoria).
   - `OPENROUTER_MODEL` = (opcional) cambia el modelo principal, ej. `anthropic/claude-sonnet-5.5`.
   - `PUBLIC_SITE_URL` = (opcional) tu dominio propio: se usa en las cabeceras de OpenRouter y
     queda autorizado para llamar a la API.
3. Redeploy. Listo.

> ⚠️ **Seguridad:** la clave vive solo en el servidor (variable de entorno). No la pongas
> nunca en el front (`index.html`, `app.js`), porque quedaría pública. El archivo `.env` está en `.gitignore`.
>
> La API solo acepta consultas desde la propia página (cabecera `Origin`: el mismo dominio,
> producción o `localhost`) y tiene un límite holgado por IP: 15 por minuto y 150 al día (más 600
> al día en total). Ese límite vive en la memoria de cada instancia de Vercel, así que **pon también
> un tope de gasto a la clave en OpenRouter** (Settings → API Keys → Credit limit): es lo que de
> verdad protege el saldo.

## Estructura

```
index.html            # Página (estructura HTML)
styles.css            # Estilos (tema claro y oscuro)
app.js                # Lógica de la página + motor local de respaldo
programas.js          # Los 14 programas: datos únicos para la página y la API
api/recomendar.js     # Vercel Serverless Function (OpenRouter)
manifest.webmanifest  # PWA: nombre, colores, íconos y accesos rápidos
sw.js                 # Service worker: funciona sin conexión (sube VERSION al cambiar el front)
icons/                # Íconos de la app (SVG fuente + PNG)
vercel.json           # Cabeceras: seguridad (CSP, Referrer-Policy…), sw.js sin caché, tipo del manifest
```

## Instalar en el celular

En Chrome (Android) abre la página y toca **📲 Instalar app** (o ⋮ → *Instalar aplicación*).
Queda como app con ícono propio y funciona sin conexión usando el motor local.

## Desarrollo local

- Abre `index.html` directamente (funciona con el motor local, sin IA).
- Pruebas: `node pruebas/motor.mjs` (motor local), `node pruebas/servidor.mjs` (API con OpenRouter simulado),
  `node pruebas/cabeceras.mjs` (la CSP de `vercel.json` calza con `index.html`) y
  `node pruebas/compartir.mjs` (texto compartido desde otra app).
- La CSP solo deja correr scripts y estilos de archivos propios. El único `<script>` en línea (el tema)
  está permitido por su hash: si lo cambias, `node pruebas/cabeceras.mjs` te da el hash nuevo para
  `vercel.json`. No uses `style="…"` ni `onclick="…"` en el HTML: la CSP los bloquea.
- Para probar la IA localmente: `vercel dev` y define `OPENROUTER_API_KEY` en un `.env`.

## Los 14 programas

Algodón · Mixto · Delicado · Lana · ECO 40-60 · 20°C · Vapor Hygiene · Rápido 15′ ·
Lavado y Secado · Auto Secado · Tiempo Secado · Sólo Centrifugado · Limpieza Tambor · Favorito
