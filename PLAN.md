# Plan de mejora — Asistente de Lavado Midea

> Archivo de seguimiento entre sesiones. **Al iniciar una sesión:** leer esto y trabajar
> solo en la siguiente fase pendiente. **Al cerrar:** marcar lo hecho, anotar la sesión en la
> bitácora y dejar escrito el "Próximo paso".

## Estado actual

- **Fase en curso:** Fase 1 (sin empezar)
- **Próximo paso:** el usuario carga créditos en OpenRouter y se publica el cambio a Haiku 5.5;
  verificar en producción (`modelo` en la respuesta del POST). Luego empezar la Fase 1.

## Diagnóstico (revisión del 2026-11-04)

- No es PWA: falta `manifest.webmanifest` (404 en producción), service worker e íconos.
- Motor local con falsos positivos por buscar subcadenas: "sábanas planas" → Lana,
  "títulos" → Delicado (tul), "hueco" → ECO, "tejido" → Lana.
- `rec.motivo` (texto de la IA) se inserta con `innerHTML` sin escapar (XSS).
- El front no tiene tiempo límite: hasta 5 modelos × 15 s en serie. Medido: 9 s por consulta.
- Cada carga de la página hace `GET /api/recomendar` solo para el indicador de estado.
- Caché de modelos gratis sin vencimiento; endpoint sin límite de uso.
- Los 14 programas están duplicados en `index.html` y `api/recomendar.js`.
- ~~Bug: `OPENROUTER_MODEL` con un modelo de pago se descartaba~~ (corregido 2026-11-04).
- Errata: "se centrifuga bien" → "se centrifugue bien".

## Decisiones

- [x] **Modelo de IA (2026-11-04):** Claude Haiku 5.5 vía OpenRouter (`anthropic/claude-haiku-5.5`,
      US$0,10 / 0,50 por millón de tokens). Gratuitos quedan como respaldo. Haiku 5.5 no acepta
      `temperature`; se usa `reasoning.effort: low` + `response_format` json_schema.
- [ ] Mejorar el prompt con datos del manual, ejemplos y sugerencia de temperatura/rpm (Fase 2).

## Fase 1 — PWA instalable

- [ ] `manifest.webmanifest` (nombre, `display: standalone`, colores, accesos rápidos)
- [ ] Íconos desde SVG propio: 192, 512, maskable 512, apple-touch 180
- [ ] `sw.js`: red primero para HTML, caché para estáticos, nunca cachear `/api`
- [ ] Modo sin conexión: motor local directo + aviso "Sin conexión"
- [ ] Botón "Instalar app" (`beforeinstallprompt`) y aviso de nueva versión
- [ ] `viewport-fit=cover`, safe areas, `theme-color`, `meta description`, `enterkeyhint`
- [ ] `vercel.json`: `sw.js` sin caché, tipo correcto del manifest
- [ ] Probar instalación en el Samsung S21 FE (Chrome → ⋮ → Instalar aplicación)

## Fase 2 — Errores y velocidad

- [ ] Motor local por palabra completa (+ plurales simples) y pruebas con los casos del diagnóstico
- [ ] Escapar todo texto de la IA antes de mostrarlo
- [ ] Mostrar resultado local al instante y reemplazar con la IA; corte a los 8 s
- [ ] Servidor: fallback con `models: [...]` en una sola llamada, `max_tokens`, JSON, caché con TTL
- [ ] Quitar el GET de estado al cargar; el indicador se actualiza con la primera consulta
- [x] Arreglar bug de `OPENROUTER_MODEL` (Haiku 5.5 primero, gratuitos de respaldo)
- [ ] Corregir la errata "se centrifuga bien"

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

| Fecha | Qué se hizo | Commit |
|---|---|---|
| 2026-11-04 | Revisión completa del proyecto, diagnóstico y plan. Se crean `PLAN.md` y `CLAUDE.md`. | — |
| 2026-11-04 | Cambio a Claude Haiku 5.5 como modelo principal con respaldo gratuito; indicador "IA activa · Claude Haiku". Probado con simulación, falta probar en producción. | — |
