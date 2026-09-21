# 🧺 Asistente de Lavado — Midea MLSF-095B

Web app que recomienda **el mejor de los 14 programas** de la lavadora-secadora
Midea MLSF-095B (Quattro Inverter, 9,5 kg lavado / 7 kg secado) a partir de una
descripción en lenguaje natural de lo que vas a lavar.

## Cómo funciona

1. Escribes qué vas a lavar (ej: *"Voy a lavar polerones gruesos talla XL, son 4 y ocupan casi todo el tambor"*).
2. El front llama a `/api/recomendar` (función serverless en Vercel).
3. Esa función consulta la IA de **OpenRouter** con un *system prompt* que contiene
   los 14 programas (temperaturas, rpm y consejos) y devuelve el programa idóneo + el motivo.
4. Si la API no está disponible o no hay clave, se usa el **motor local de palabras clave** como respaldo.

## Configurar OpenRouter (gratis)

1. Crea una cuenta en <https://openrouter.ai> y genera una clave API (hay modelos `:free`).
2. En Vercel: **Project → Settings → Environment Variables** y agrega:
   - `OPENROUTER_API_KEY` = tu clave (obligatoria).
   - `OPENROUTER_MODEL` = (opcional) fija un modelo, ej. `qwen/qwen2.5-72b-instruct:free`.
   - `PUBLIC_SITE_URL` = (opcional) tu dominio para las cabeceras de OpenRouter.
3. Redeploy. Listo.

> ⚠️ **Seguridad:** la clave vive solo en el servidor (variable de entorno). No la pongas
> nunca en `index.html`, porque quedaría pública. El archivo `.env` está en `.gitignore`.

## Estructura

```
index.html            # Front (UI + motor local de respaldo)
api/recomendar.js     # Vercel Serverless Function (OpenRouter)
```

## Desarrollo local

- Abre `index.html` directamente (funciona con el motor local, sin IA).
- Para probar la IA localmente: `vercel dev` y define `OPENROUTER_API_KEY` en un `.env`.

## Los 14 programas

Algodón · Mixto · Delicado · Lana · ECO 40-60 · 20°C · Vapor Hygiene · Rápido 15′ ·
Lavado y Secado · Auto Secado · Tiempo Secado · Sólo Centrifugado · Limpieza Tambor · Favorito
