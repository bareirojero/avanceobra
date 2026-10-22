# services/informes · Informe diario

Arma el informe diario de una obra a partir de las fotos del día y lo exporta a PDF con el formato aprobado. Cada foto está vinculada a un ítem del itemizado, tiene su comentario y, si las hay, marcas numeradas. El editor revisa y corrige el informe en el panel antes de publicarlo y descargarlo.

## Sin IA (por defecto, costo cero)

`src/armar.ts` arma un avance por ítem, en el orden del itemizado SAP, con la ruta del rubro y el código PEP. Cada avance lleva sus fotos con las marcas dibujadas y el comentario de cada una al pie, tal como lo escribieron. Clima y personal vienen de lo que carga el editor (`registros_dia`). El editor redacta el resumen del día y, si quiere, un texto por ítem. Para el editor se generan alertas que no salen en el PDF: fotos sin comentario, marcas sin comentario e ítems previstos para el día sin registros.

## Con IA (opcional, apagado)

Si el entorno tiene `ANTHROPIC_API_KEY`, `generar` usa `src/generar.ts`. Ahí Claude mira las fotos, redacta el texto de cada ítem uniendo lo que dicen distintas personas, y agrega alertas de contradicción, seguridad y calidad, más un resumen, incidentes y pendientes. Cuesta unos US$0,60 por día con 40 fotos. Hoy está apagado por decisión de Jerónimo (21/10/2026).

## Uso

`src/servicio.ts` expone `generar`, `regenerar` (solo con IA) y `exportar`. La base y el almacenamiento entran por la interfaz `Almacen`, que implementa `services/api`. El PDF sale de `src/render/html.ts` (HTML A4) con Chromium (`CHROMIUM_PATH`), y ese mismo HTML sirve de vista previa en el panel.

```
pnpm --filter @registro-obra/informes typecheck
CHROMIUM_PATH=/ruta/a/chrome pnpm --filter @registro-obra/informes ejemplo    # PDF de ejemplo/ (obra y fotos de relleno)
```
