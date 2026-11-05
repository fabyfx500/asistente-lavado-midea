# Plan de mejora — Asistente de Lavado Midea

> Archivo de seguimiento entre sesiones. **Al iniciar una sesión:** leer esto y trabajar
> solo en la siguiente fase pendiente. **Al cerrar:** marcar lo hecho, anotar la sesión en la
> bitácora y dejar escrito el "Próximo paso".

## Estado actual

- **Fase en curso:** Fase 2 (falta solo la parte del servidor).
- **Próximo paso:** Fase 2, servidor (`api/recomendar.js`): fallback con `models: [...]` en una
  sola llamada a OpenRouter, `max_tokens`, salida JSON y caché de modelos gratis con vencimiento.
  Que la función responda antes de 8 s (el front corta ahí). `VERSION` de `sw.js` va en `v3`.
- **Próxima sesión:** `5. Fase 2 – Servidor`

## Diagnóstico (revisión del 2026-11-04)

- No es PWA: falta `manifest.webmanifest` (404 en producción), service worker e íconos.
- ~~Motor local con falsos positivos por buscar subcadenas: "sábanas planas" → Lana,
  "títulos" → Delicado (tul), "hueco" → ECO, "tejido" → Lana.~~ (corregido 2026-11-04)
- ~~`rec.motivo` (texto de la IA) se inserta con `innerHTML` sin escapar (XSS).~~ (corregido 2026-11-04)
- ~~El front no tiene tiempo límite~~ (corte a los 8 s, 2026-11-04). El servidor aún prueba hasta
  5 modelos × 15 s en serie.
- ~~Cada carga de la página hace `GET /api/recomendar` solo para el indicador de estado.~~ (quitado 2026-11-04)
- Caché de modelos gratis sin vencimiento; endpoint sin límite de uso.
- Los 14 programas están duplicados en `index.html` y `api/recomendar.js`.
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
- [ ] Servidor: fallback con `models: [...]` en una sola llamada, `max_tokens`, JSON, caché con TTL
- [x] Quitar el GET de estado al cargar; el indicador se actualiza con la primera consulta
- [x] Arreglar bug de `OPENROUTER_MODEL` (Haiku 5.5 primero, gratuitos de respaldo)
- [x] Corregir la errata "se centrifuga bien"

## Fase 3 — Orden y seguridad

- [ ] `programas.js` único compartido por front y API
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
| 4. Fase 2 – Respuesta instantánea | 2026-11-04 | El resultado del motor local aparece al instante con "⏳ consultando a la IA…" y se reemplaza cuando llega la IA; corte a los 8 s (queda el local). Una consulta nueva o elegir un programa a mano cancela la anterior. Se quita el GET de estado al cargar: el indicador se confirma con la primera consulta ("IA activa", "IA no configurada", "la IA tardó demasiado"). `VERSION` de `sw.js` → v3. Probado en local con la API simulada (rápida, lenta y sin clave); 29 pruebas del motor OK. Publicado y verificado en producción: `sw.js` en v3, sin llamadas a `/api` al cargar, el resultado local aparece al instante y Haiku lo reemplaza en 2,4 s ("sábanas planas y fundas" → Algodón). Falta ver el aviso de versión nueva en el S21 FE. | `ea7710b` |
