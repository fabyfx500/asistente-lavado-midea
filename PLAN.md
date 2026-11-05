# Plan de mejora — Asistente de Lavado Midea

> Archivo de seguimiento entre sesiones. **Al iniciar una sesión:** leer esto y trabajar
> solo en la siguiente fase pendiente. **Al cerrar:** marcar lo hecho, anotar la sesión en la
> bitácora y dejar escrito el "Próximo paso".

## Estado actual

- **Fase en curso:** Fase 4 (opcional): "Favorito" publicado. Sigue Web Share Target.
- **Tope de gasto:** la "Default key (f55)" tiene un límite de **US$2** (lo bajó Fabián desde $100
  el 2026-11-05; se cambia en OpenRouter → Workspaces → Keys → ⋮ de la clave → editar). Si se
  alcanza, la IA deja de responder y la app queda en modo local.
- **⚠️ La clave de OpenRouter vence el 2027-03-20** ("Default key (f55)", la que está en Vercel como
  `OPENROUTER_API_KEY`). Ese día la IA deja de responder y la app queda en modo local. Antes de esa
  fecha: quitarle el vencimiento al editarla, o crear una clave nueva, ponerla en Vercel y redeploy.
  Recordárselo a Fabián en cualquier sesión desde febrero de 2027.
- **Próximo paso:** Fase 4: Web Share Target (el S21 FE ya está en v10). Para confirmar que el
  teléfono se actualizó, ver el pie de página ("Versión de la app: vN"). Recordar: hay CSP, así que nada de `style=""`
  ni `onclick=""`, y si se toca el script del tema hay que actualizar su hash
  (`node pruebas/cabeceras.mjs`). `VERSION` de `sw.js` va en `v10`.
- **Próxima sesión:** `12. Fase 4 – Web Share Target`
- **Usuarios:** solo 3 personas del mismo departamento (Fabián, su pareja y su cuñada), sin cuentas
  ni login. Límite de la API: 15/min y 150/día por IP, 600/día en total (por instancia de Vercel).

## Diagnóstico (revisión del 2026-11-04)

- No es PWA: falta `manifest.webmanifest` (404 en producción), service worker e íconos.
- ~~Motor local con falsos positivos por buscar subcadenas: "sábanas planas" → Lana,
  "títulos" → Delicado (tul), "hueco" → ECO, "tejido" → Lana.~~ (corregido 2026-11-04)
- ~~`rec.motivo` (texto de la IA) se inserta con `innerHTML` sin escapar (XSS).~~ (corregido 2026-11-04)
- ~~El front no tiene tiempo límite~~ (corte a los 8 s, 2026-11-04). ~~El servidor prueba hasta
  5 modelos × 15 s en serie.~~ (una sola llamada con tope de 7 s, 2026-11-04)
- ~~Cada carga de la página hace `GET /api/recomendar` solo para el indicador de estado.~~ (quitado 2026-11-04)
- ~~Caché de modelos gratis sin vencimiento~~ (1 h, 2026-11-04); ~~endpoint sin límite de uso~~ (2026-11-05).
- ~~Los 14 programas están duplicados en `index.html` y `api/recomendar.js`.~~ (unificados en `programas.js`, 2026-11-05)
- ~~Bug: `OPENROUTER_MODEL` con un modelo de pago se descartaba~~ (corregido 2026-11-04).
- ~~Errata: "se centrifuga bien" → "se centrifugue bien".~~ (corregida 2026-11-04)

## Decisiones

- [x] **Modelo de IA (2026-11-04):** Claude Haiku 5.5 vía OpenRouter (`anthropic/claude-haiku-5.5`,
      US$0,10 / 0,50 por millón de tokens). Gratuitos quedan como respaldo. Haiku 5.5 no acepta
      `temperature`; se usa `reasoning.effort: low` + `response_format` json_schema.
- [ ] Mejorar el prompt con datos del manual, ejemplos y sugerencia de temperatura/rpm (Fase 2).

## Fase 1 — PWA instalable

- [x] `manifest.webmanifest` (nombre, `display: standalone`, colores, accesos rápidos)
- [x] Íconos desde SVG propio: 192, 512, maskable 512, apple-touch 180
      (fuentes en `icons/icon.svg` e `icons/icon-maskable.svg`; PNG generados con `sharp`)
- [x] `sw.js`: red primero para HTML, caché para estáticos, nunca cachear `/api`
- [x] Modo sin conexión: motor local directo + aviso "Sin conexión"
- [x] Botón "Instalar app" (`beforeinstallprompt`) y aviso de nueva versión
- [x] `viewport-fit=cover`, safe areas, `theme-color`, `meta description`, `enterkeyhint`
- [x] `vercel.json`: `sw.js` sin caché, tipo correcto del manifest
- [x] Instalar en el Samsung S21 FE (hecho por Fabián, 2026-11-04)
- [x] Probar en el S21 FE (todo OK según Fabián, 2026-11-04): abre como app (sin barra de Chrome), ícono bien recortado, accesos
      rápidos al mantener presionado, recomienda con IA, y en modo avión abre y usa el motor local

> Accesos rápidos del ícono (mantener presionado): Deportiva, Sábanas, Secar, Limpieza.
> Usan `/?q=texto`, que también sirve para compartir un enlace con la consulta escrita.

## Fase 2 — Errores y velocidad

- [x] Motor local por palabra completa (+ plurales simples) y pruebas con los casos del diagnóstico
      (`node pruebas/motor.mjs`; la carpeta `pruebas/` no se publica)
- [x] Escapar todo texto de la IA antes de mostrarlo (adelantado en la sesión 2 por el `?q=`)
- [x] Mostrar resultado local al instante y reemplazar con la IA; corte a los 8 s
- [x] Servidor: fallback con `models: [...]` en una sola llamada, `max_tokens`, JSON, caché con TTL
      (pruebas con OpenRouter simulado: `node pruebas/servidor.mjs`)
- [x] Quitar el GET de estado al cargar; el indicador se actualiza con la primera consulta
- [x] Arreglar bug de `OPENROUTER_MODEL` (Haiku 5.5 primero, gratuitos de respaldo)
- [x] Corregir la errata "se centrifuga bien"

## Fase 3 — Orden y seguridad

- [x] `programas.js` único compartido por front y API
- [x] Separar `styles.css` y `app.js`
- [x] Límite de uso por IP y verificación de origen en `/api/recomendar`
- [x] Cabeceras de seguridad: CSP, `Referrer-Policy`

## Fase 4 — Extras (opcional)

- [x] Historial de últimas recomendaciones (publicado 2026-11-05)
- [x] Guardar configuración "Favorito" (publicado 2026-11-05)
- [ ] Web Share Target (compartir texto a la app desde Android)

## Bitácora de sesiones

| Sesión | Fecha | Qué se hizo | Commit |
|---|---|---|---|
| 1. Setup inicial (optimización) | 2026-11-04 | Revisión completa del proyecto, diagnóstico y plan. Se crean `PLAN.md` y `CLAUDE.md`. | — |
| 1. Setup inicial (optimización) | 2026-11-04 | Cambio a Claude Haiku 5.5 como modelo principal con respaldo gratuito; indicador "IA activa · Claude Haiku". Verificado en producción: responde Haiku en 1,7–2,5 s (antes 9 s); "sábanas planas" → Algodón. La clave de Vercel es la "Default key" de OpenRouter. `PLAN.md` no es público (404). | `9477ec8` |
| 2. Fase 1 – PWA instalable | 2026-11-04 | PWA: manifest con 4 accesos rápidos, íconos (SVG + PNG), `sw.js` (red primero / caché / sin `/api`), modo sin conexión, botón "Instalar app", aviso de versión nueva, safe areas y `theme-color` según tema, `vercel.json`, `/?q=texto`. Se adelantó el escape del texto de la IA. Probado en Chrome (localhost): registro, caché, carga sin servidor y actualización v1→v2. El navegador integrado de la app no soporta service workers. Publicado y verificado en producción: manifest, `sw.js` (sin caché) e íconos responden 200; el service worker se activa, aparece "Instalar app" y la IA responde (Haiku). Falta probar en el S21 FE. | `1a6c495` |
| 3. Fase 2 – Errores y velocidad | 2026-11-04 | Motor local por palabra completa con plurales simples (y "secarla"); se quitan "tejido" y "sanitiz" como palabras clave; el aviso de tambor lleno también usa palabra completa ("rellena" ya no cuenta). Pruebas en `pruebas/motor.mjs` (29 casos, todos OK; 7 fallaban con la versión anterior), excluidas del deploy. Errata corregida. `VERSION` de `sw.js` → v2. Probado en la página local. Publicado y verificado en producción: `sw.js` en v2, las 29 pruebas pasan con el `index.html` publicado, `/pruebas/` da 404 y la IA responde (Haiku). En el S21 FE apareció "Hay una versión nueva" y se actualizó bien. | `c435205` |
| 4. Fase 2 – Respuesta instantánea | 2026-11-04 | El resultado del motor local aparece al instante con "⏳ consultando a la IA…" y se reemplaza cuando llega la IA; corte a los 8 s (queda el local). Una consulta nueva o elegir un programa a mano cancela la anterior. Se quita el GET de estado al cargar: el indicador se confirma con la primera consulta ("IA activa", "IA no configurada", "la IA tardó demasiado"). `VERSION` de `sw.js` → v3. Probado en local con la API simulada (rápida, lenta y sin clave); 29 pruebas del motor OK. Publicado y verificado en producción: `sw.js` en v3, sin llamadas a `/api` al cargar, el resultado local aparece al instante y Haiku lo reemplaza en 2,4 s ("sábanas planas y fundas" → Algodón). En el S21 FE apareció "Hay una versión nueva" y se actualizó bien. | `ea7710b` |
| 5. Fase 2 – Servidor | 2026-11-04 | `api/recomendar.js`: una sola llamada a OpenRouter con `models: [Haiku, 2 gratis]` (OpenRouter salta al siguiente si uno falla), mismos parámetros para todos (`max_tokens` 1024, `reasoning` low, salida JSON, sin `temperature`), tope total de 7 s (504 si la IA no contesta) y `modelo` real tomado de la respuesta. Lista de gratis con caché de 1 h que se renueva por detrás; en frío espera máx. 1,5 s y, sin lista, usa solo Haiku (un id inexistente haría fallar la llamada). Pruebas nuevas en `pruebas/servidor.mjs` (18 casos OK, OpenRouter simulado); 29 del motor OK. GET probado con la lista real. Publicado y verificado en producción: Haiku acepta la llamada única y responde en 0,8–3 s dentro de la función (1,2–3,7 s en total); "sábanas planas y fundas" → Algodón, "ropa deportiva de poliéster" → 20°C, "quiero limpiar el tambor" → Limpieza, "tambor lleno de jeans y poleras" → Mixto. | `2ad8935` |
| 6. Fase 3 – Programas en un solo archivo | 2026-11-05 | Nuevo `programas.js` con los 14 programas (datos de la tarjeta + `ia`, el resumen para el prompt, + `kw` del motor local), generado desde los datos anteriores y verificado idéntico; el prompt de la IA queda exactamente igual. `index.html` lo carga con `<script src="programas.js">` (ruta relativa: sigue funcionando al abrir el archivo directo) y `api/recomendar.js` con `require`. `sw.js` → v4: precachea `programas.js`, los `.js` van "red primero" (página y datos siempre de la misma versión) y `/sw.js` nunca se guarda. Pruebas adaptadas: 29 del motor y 18 del servidor OK. Probado en Chrome (localhost, IA simulada): 14 programas en la lista, resultado local al instante y reemplazo por la IA, y sin servidor carga desde caché y recomienda ("suéter de lana" → Lana). Publicado y verificado en producción: `/programas.js` 200 con los 14 programas, `sw.js` en v4, `/pruebas/` y `PLAN.md` dan 404, la función de Vercel incluye `programas.js` y Haiku responde en 1,1–1,9 s ("sábanas planas y fundas" → Algodón, "ropa deportiva de poliéster" → 20°C, "quiero limpiar el tambor" → Limpieza, "un suéter de lana" → Lana). En Chrome con la v1 vieja apareció el aviso, "Actualizar" activó la v4 y borró la caché anterior. Falta actualizar en el S21 FE. | `1a945fa` |
| 6. Fase 3 – Programas en un solo archivo | 2026-11-05 | A pedido de Fabián, el indicador muestra el modelo con su versión ("IA activa · Claude Haiku 5.5"): el nombre se arma desde el `modelo` que devuelve el servidor (los gratuitos siguen como "IA"). `VERSION` de `sw.js` → v5. Publicado y verificado en producción: "sábanas y toallas" → Algodón con "Claude Haiku 5.5" en el indicador; apareció el aviso de versión nueva (v4→v5). Fabián actualizó el S21 FE a v5 sin problemas. | `9979c3c` |
| 7. Fase 3 – Separar CSS y JS | 2026-11-05 | `index.html` queda solo con la estructura (77 líneas): los estilos pasan a `styles.css` y la lógica + motor local a `app.js`, copiados tal cual (verificado idéntico línea por línea). Rutas relativas, así abrir el archivo directo sigue funcionando. El script del tema sigue en línea en el `<head>` para que no parpadee. `sw.js` → v6: precachea `styles.css` y `app.js`, y el `.css` también va "red primero" (página, estilos y scripts siempre de la misma versión). `pruebas/motor.mjs` ahora lee el motor de `app.js`; 29 del motor y 18 del servidor OK. README y CLAUDE.md actualizados. Probado en Chrome (localhost, IA simulada): v6 activa con los 10 archivos en caché, 14 programas, local al instante ("Sábanas y toallas" → Algodón) y reemplazo por la IA con "Claude Haiku 5.5"; sin servidor carga con estilos desde la caché y recomienda ("un suéter de lana" → Lana). Falta publicar y probar en el S21 FE. | `6211c9a` |
| 7. Fase 3 – Separar CSS y JS | 2026-11-05 | Publicado y verificado en producción: `/styles.css` y `/app.js` dan 200 con su tipo correcto e iguales al repo, `index.html` de 77 líneas, `sw.js` en v6, `/pruebas/` y `PLAN.md` dan 404. Haiku responde ("sábanas planas y fundas" → Algodón, "ropa deportiva de poliéster" → 20°C, "quiero limpiar el tambor" → Limpieza). En Chrome con la v5 apareció el aviso; "Actualizar" activó la v6 (10 archivos en caché, la v5 borrada) y "Sábanas y toallas" → Algodón con "Claude Haiku 5.5" en 1,6 s. Fabián actualizó el S21 FE a v6 sin problemas. | — |
| 8. Fase 3 – Límite de uso de la API | 2026-11-05 | `api/recomendar.js`: el POST exige cabecera `Origin` del mismo dominio de la función (cubre producción y vistas previas de Vercel), de `PUBLIC_SITE_URL` o de `localhost`; si no, 403 sin llamar a la IA. Límite en memoria: 15/min y 150/día por IP (primera IP de `x-forwarded-for`), 600/día en total por instancia; al pasarlo, 429 con `Retry-After`. El GET de diagnóstico no cambia. La página muestra "Modo local (muchas consultas, la IA vuelve en un rato)" y deja el resultado local. `VERSION` de `sw.js` → v7. README: explica el límite y recomienda el tope de gasto en OpenRouter. `pruebas/servidor.mjs`: 37 casos OK (19 nuevos de origen y límites); 29 del motor OK. Probado en el navegador con servidor local (función real, IA simulada): Chrome manda `Origin` en el POST, la consulta pasa (200, "Claude Haiku 5.5") y la 16.ª del minuto da 429 con el aviso y "un suéter de lana" → Lana del motor local. Falta publicar y verificar en producción. | `583ec21` |
| 8. Fase 3 – Límite de uso de la API | 2026-11-05 | Publicado y verificado en producción: `sw.js` en v7; POST sin `Origin` o desde otro sitio → 403 "Origen no permitido"; con el `Origin` propio Haiku responde ("sábanas planas y fundas" → Algodón, 1,2 s en la función). El límite funciona con la IP que entrega Vercel: con consultas vacías (cuentan pero no llaman a la IA) la 16.ª del minuto da 429 con `Retry-After`. El GET de diagnóstico sigue OK; `PLAN.md` y `/pruebas/` dan 404. En Chrome con la v6 apareció el aviso; "Actualizar" dejó solo la caché v7; dentro del minuto bloqueado se vio "Modo local (muchas consultas…)" y, pasado el minuto, "Sábanas y toallas" → Algodón con "Claude Haiku 5.5". Falta el S21 FE y el tope de gasto en OpenRouter. Después, Fabián bajó el tope de la "Default key" de $100 a US$2 y actualizó el S21 FE a v7 sin problemas. Se anotó que la clave vence el 2027-03-20. | — |
| 9. Fase 3 – Cabeceras de seguridad | 2026-11-05 | `vercel.json`: CSP para todas las rutas (`default-src 'self'`, scripts y estilos solo de archivos propios, el script del tema en línea permitido por su hash, sin `unsafe-inline`/`unsafe-eval`, `frame-ancestors 'none'`, `form-action`/`base-uri`/`object-src` cerrados), `Referrer-Policy: strict-origin-when-cross-origin` (con `no-referrer` Chrome mandaría `Origin: null` y la API daría 403), `X-Content-Type-Options`, `X-Frame-Options` y `Permissions-Policy`. Nuevo `pruebas/cabeceras.mjs` (15 casos OK): revisa el hash contra `index.html` y que no haya `style=""` ni `onclick=""`; si el script del tema cambia, da el hash nuevo. `.gitattributes` deja los `.html` en LF (con CRLF cambiaría el hash). README y CLAUDE.md actualizados. 29 del motor y 37 del servidor OK. Probado en Chrome con un servidor local que aplica las cabeceras de `vercel.json` (función real, IA simulada): sin errores de CSP, el tema oscuro se aplica antes de pintar, estilos y 14 programas OK, "sábanas y toallas" → Algodón con "Claude Haiku 5.5", y un script inyectado y un `onerror` en línea quedan bloqueados. Falta publicar y verificar en producción. | `000341c` |
| 9. Fase 3 – Cabeceras de seguridad | 2026-11-05 | Publicado y verificado en producción: llegan la CSP (el hash calza con el `index.html` publicado), `Referrer-Policy`, `X-Content-Type-Options`, `X-Frame-Options` y `Permissions-Policy`; Vercel ya agrega HSTS. `sw.js` sigue en v7 sin caché; `PLAN.md` y `/pruebas/` dan 404; el POST sin `Origin` sigue en 403. En Chrome la página carga sin errores de CSP, con estilos y 14 programas, y "Sábanas y toallas" → Algodón con "Claude Haiku 5.5" (la consulta sigue pasando el control de origen). `.gitattributes` se agregó a `.vercelignore` (se publicaba). | — |
| 10. Fase 4 – Historial | 2026-11-05 | Nueva sección "Tus últimas consultas" (entre el resultado y la lista de programas): guarda en `localStorage` (clave `historial`) las 5 recomendaciones finales más recientes (la de la IA, o la local si la IA no respondió), con programa, alternativas, motivo, origen y fecha; la misma consulta no se repite (queda la más nueva arriba). Elegir un programa a mano o una consulta sin prenda clara no se guardan. Al tocar una se muestra al instante con "🕘 Del historial (hoy, 14:32)" y su texto vuelve al cuadro, sin llamar a la IA. Botón "🗑️ Borrar" con confirmación. Se ignoran datos dañados. Sin `style=""`/`onclick=""` (CSP); el script del tema no cambió. `VERSION` de `sw.js` → v8. README actualizado. 29 del motor, 37 del servidor y 15 de cabeceras OK. Probado en el navegador de la app con un servidor local con las cabeceras de `vercel.json` (IA simulada): guarda, no repite, máx. 5, se mantiene al recargar, texto con HTML queda escapado, fallo de IA guarda el local, "ayer"/"2 nov", Borrar, tema oscuro y 375 px sin scroll lateral; sin errores de CSP. Falta publicar y probar en el S21 FE. | `99563ea` |
| 10. Fase 4 – Historial | 2026-11-05 | Publicado y verificado en producción: `sw.js` en v8; `app.js` y `styles.css` iguales al repo; `index.html` trae la sección del historial; CSP presente; `PLAN.md` y `/pruebas/` dan 404; POST sin `Origin` → 403; Haiku responde ("sábanas planas y fundas" → Algodón, 1,8 s en la función). En Chrome con la v7 apareció el aviso; "Actualizar" dejó solo la caché v8. "Sábanas y toallas" → Algodón y "un suéter de lana" → Lana con "Claude Haiku 5.5" (1,5 y 3,1 s); ambas quedaron en "Tus últimas consultas", se mantuvieron al recargar y al tocar una se mostró al instante sin llamar a la API. Sin errores en la consola. Se borraron las consultas de prueba. Después, Fabián actualizó el S21 FE a v8 sin problemas. | — |
| 11. Fase 4 – Favorito | 2026-11-05 | "Mi Favorito": la lavadora memoriza una combinación en su botón Favorito y ahora se anota en la app. Toda tarjeta trae "⭐ Guardar como mi Favorito" (en la del Favorito: "Anotar" o "Cambiar mi Favorito"), que abre un `<dialog>` con programa base, temperatura (Frío–90°C), centrifugado (sin–1400 RPM), secado (sin / Auto / por tiempo) y nombre opcional (40 caracteres), prellenado desde ese programa; al cambiar el programa base se proponen sus valores. Se guarda en `localStorage` (clave `favorito`), se valida contra las listas al leer (datos dañados = sin Favorito) y el nombre se escapa. La tarjeta del Favorito muestra la combinación, "Basado en …", la duración, consejos y advertencia del programa base; sirve igual desde la lista, la IA, el motor local y el historial. "🗑️ Quitar" con confirmación. Sin `<form>` (la CSP tiene `form-action 'none'`), sin `style=""`/`onclick=""`; el script del tema no cambió. `VERSION` de `sw.js` → v9. README actualizado. 29 del motor, 37 del servidor y 15 de cabeceras OK. Probado en el navegador de la app con un servidor local con las cabeceras de `vercel.json` (IA simulada): prellenado (Algodón → 40°C/1400; Lana → 30°C/600), guardar, recargar, editar, historial, Quitar, datos dañados, texto con HTML escapado, tema oscuro y 375 px sin scroll lateral; sin errores de CSP. Falta publicar y probar en el S21 FE. | `98f41f5` |
| 11. Fase 4 – Favorito | 2026-11-05 | Publicado y verificado en producción: `sw.js` en v9; `app.js`, `styles.css` y `programas.js` iguales al repo; `index.html` trae el formulario del Favorito; CSP y `Referrer-Policy` presentes; `PLAN.md` y `/pruebas/` dan 404; POST sin `Origin` → 403; Haiku responde ("mi programa favorito guardado" → Favorito, "sábanas planas y fundas" → Algodón). En Chrome con la v8 apareció el aviso; "Actualizar" dejó solo la caché v9. "Sábanas y toallas" → Algodón con "Claude Haiku 5.5" (1,5 s); "Guardar como mi Favorito" abrió el formulario prellenado (Algodón, 40°C, 1400 RPM, sin secado), se guardó con 60°C y la tarjeta del Favorito lo mostró; se mantuvo al recargar. Sin errores en la consola. Se borraron los datos de prueba. Falta actualizar el S21 FE a v9. | — |
| 11. Fase 4 – Favorito | 2026-11-05 | A pedido de Fabián, el pie de página muestra "Versión de la app: vN" para confirmar que la app se actualizó. Sale de la `VERSION` de `sw.js`: la página se la pide al service worker activo (mensaje `VERSION` con `MessageChannel`, máx. 1,5 s); si no contesta (los anteriores a v10 no sabían), la deduce del nombre de la caché cuando hay una sola; si no, no muestra nada. En la primera visita se muestra cuando el service worker toma el control. `sw.js` → v10. CLAUDE.md actualizado. 29 + 37 + 15 pruebas OK. Probado en Chrome con servidor local: primera visita → v10; con una v11 de prueba esperando sigue diciendo v10 y al tocar "Actualizar" pasa a v11. Publicado y verificado en producción: `sw.js` en v10 con el mensaje nuevo, `app.js` y `styles.css` iguales al repo, `CLAUDE.md` da 404. En Chrome con la v9 se veía "v9" y el aviso; "Actualizar" dejó solo la caché v10 y el pie en "v10". Después, Fabián actualizó el S21 FE a v10 y el pie dice "Versión de la app: v10". | `63053cf` |
