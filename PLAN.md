# Plan de mejora — Asistente de Lavado Midea

> Archivo de seguimiento entre sesiones. **Al iniciar una sesión:** leer esto y trabajar
> solo en la siguiente fase pendiente. **Al cerrar:** marcar lo hecho, anotar la sesión en la
> bitácora y dejar escrito el "Próximo paso".

## Estado actual

- **Fase en curso:** Fase 3 (1 de 4 tareas hecha).
- **Próximo paso:** (Fabián) abrir la app en el S21 FE y tocar "Actualizar" cuando aparezca
  "Hay una versión nueva" (v4). Después, Fase 3: separar `styles.css` y `app.js` (sumarlos a
  `PRECACHE`; los `.js` ya van "red primero" en `sw.js`). Ojo: `pruebas/motor.mjs` toma el motor de
  `index.html` entre `function normalizar` y `function tarjetaPrograma`: si pasa a `app.js`, ajustar.
  `VERSION` de `sw.js` va en `v4`.
- **Próxima sesión:** `7. Fase 3 – Separar CSS y JS`

## Diagnóstico (revisión del 2026-11-04)

- No es PWA: falta `manifest.webmanifest` (404 en producción), service worker e íconos.
- ~~Motor local con falsos positivos por buscar subcadenas: "sábanas planas" → Lana,
  "títulos" → Delicado (tul), "hueco" → ECO, "tejido" → Lana.~~ (corregido 2026-11-04)
- ~~`rec.motivo` (texto de la IA) se inserta con `innerHTML` sin escapar (XSS).~~ (corregido 2026-11-04)
- ~~El front no tiene tiempo límite~~ (corte a los 8 s, 2026-11-04). ~~El servidor prueba hasta
  5 modelos × 15 s en serie.~~ (una sola llamada con tope de 7 s, 2026-11-04)
- ~~Cada carga de la página hace `GET /api/recomendar` solo para el indicador de estado.~~ (quitado 2026-11-04)
- ~~Caché de modelos gratis sin vencimiento~~ (1 h, 2026-11-04); endpoint sin límite de uso.
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
- [ ] Separar `styles.css` y `app.js`
- [ ] Límite de uso por IP y verificación de origen en `/api/recomendar`
- [ ] Cabeceras de seguridad: CSP, `Referrer-Policy`

## Fase 4 — Extras (opcional)

- [ ] Historial de últimas recomendaciones
- [ ] Guardar configuración "Favorito"
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
