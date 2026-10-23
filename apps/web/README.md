# Panel web (Next.js)

Panel del editor y vista de solo lectura de ReporTE.

- **Editor:** día de obra (fotos agrupadas por ítem, persona o sector, con sus marcas y comentarios), subir fotos desde la computadora, itemizado desde el Excel de SAP, sectores, usuarios con usuario y contraseña, datos de la obra, y el informe diario: se arma con las fotos ordenadas por ítem, el editor escribe el resumen y los textos, carga clima y personal a mano, lo publica y lo descarga en PDF.
- **Campo y solo lectura:** ven el día de obra y los informes publicados, sin editar nada.

Llama a la API por `/api` en el mismo origen: `next.config.ts` reescribe `/api/*` a `API_URL_INTERNA`. Así las cookies de sesión (httpOnly) quedan en el dominio del panel y no hace falta CORS. Las subidas a SharePoint, cuyas URLs firmadas apuntan a la API, también pasan por ese mismo origen.

## Desarrollo

Con la base y la API andando (ver `services/api/README.md`):

```
pnpm --filter @registro-obra/web dev      # http://localhost:3000
```

Usuarios de la carga de prueba: `editor`, `capataz`, `residente`, `fiscal` (contraseña `obra1234`, solo en desarrollo).

## Producción (Render, plan gratuito)

`API_URL_INTERNA` se lee al compilar (los rewrites quedan fijos en el build), así que tiene que estar cargada antes del build. Servicio sugerido para `render.yaml`:

```yaml
  - type: web
    name: avance-obra-web
    runtime: node
    plan: free
    region: virginia
    buildCommand: corepack enable && pnpm install --frozen-lockfile && pnpm --filter @registro-obra/web build
    startCommand: pnpm --filter @registro-obra/web start
    autoDeploy: true
    envVars:
      - key: API_URL_INTERNA
        value: https://avance-obra-api.onrender.com
```

El panel no guarda claves ni datos: todo vive en la base y en SharePoint, detrás de la API.
