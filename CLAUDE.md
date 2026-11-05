# Asistente de Lavado Midea

Web app (Vercel) que recomienda uno de los 14 programas de la lavadora-secadora Midea MLSF-095B.
`index.html` = UI + motor local de palabras clave. `api/recomendar.js` = función serverless que
consulta OpenRouter. Producción: https://asistente-lavado-midea.vercel.app

## Trabajo por sesiones

El trabajo se divide en varias sesiones cortas para no llenar el contexto. `PLAN.md` es la fuente
de verdad del avance.

- **Al iniciar:** leer `PLAN.md` y continuar con el "Próximo paso" / la primera tarea sin marcar.
  No volver a analizar todo el proyecto: el diagnóstico ya está en `PLAN.md`.
- **Nombre de la sesión:** renombrar la sesión actual (herramienta `set_session_title` con
  `session_id: "self"`) como `N. <fase o paso>`, donde N = número de la última sesión en la
  bitácora + 1. Ej.: `2. Fase 1 – PWA instalable`.
- **Durante:** abarcar una fase (o parte de ella) por sesión.
- **Al cerrar:** marcar las casillas hechas, agregar una fila a la bitácora (n.º de sesión, fecha,
  qué se hizo, commit) y actualizar "Estado actual" con el próximo paso concreto.

## Convenciones

- Textos de la interfaz, commits y documentación en español.
- La clave de OpenRouter vive solo en variables de entorno de Vercel; nunca en el front.
- Mantener el motor local funcionando como respaldo sin conexión.
