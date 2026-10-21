# services/informes · Informe diario con IA

Arma el informe diario de una obra a partir de las fotos del día (cada una vinculada a un ítem del itemizado, con su comentario y, si las hay, marcas numeradas) y lo exporta a PDF. El editor lo revisa y corrige en el panel antes de publicarlo y descargarlo.

## Cómo funciona

1. **Fotos con marcas dibujadas** (`src/anotar.ts`): la IA ve cada foto con los círculos, flechas y rectángulos numerados que hizo el residente. Las fotos sin marcas (lo habitual del capataz) van con su comentario general, que pesa lo mismo.
2. **Un avance por ítem, con visión** (`src/generar.ts`): grupos de hasta 30 fotos (ítems enteros, en el orden del itemizado), en paralelo. Claude redacta el avance de cada ítem en palabras (sin porcentajes), junta lo que dicen distintas personas y marca alertas para el editor: contradicciones, información faltante, seguridad, calidad.
3. **Síntesis, solo texto**: resumen del día, alertas que surgen de cruzar ítems, incidentes y pendientes.
4. **Sin IA**: orden por itemizado, autores e ítems previstos sin registro.
5. **Salida**: `ContenidoInforme` v3 (`src/tipos.ts`), validado con zod. Se guarda en `informes.contenido_ia` (lo de la IA) y `informes.contenido` (lo corregido).
6. **PDF** (`src/render/`): HTML A4 con el formato aprobado → Chromium. Las alertas no se imprimen.

`src/servicio.ts` expone `generar`, `regenerar` (un avance, con una indicación del editor) y `exportar`. La base y el almacenamiento entran por la interfaz `Almacen`, que implementa `services/api`.

Modelo: `claude-opus-5-5`, salida estructurada, esfuerzo medio, con respaldo automático del servidor si el modelo rechaza un pedido. La clave va en la variable `ANTHROPIC_API_KEY` del entorno de la nube; nunca en este repositorio.

## Probar

```
npm install
CHROMIUM_PATH=/ruta/a/chrome node scripts/ejemplo.ts                 # renderiza ejemplo/informe.json
ANTHROPIC_API_KEY=... CHROMIUM_PATH=... node scripts/ejemplo.ts --generar   # lo genera con Claude
```

`ejemplo/` usa una obra y fotos de relleno; `ejemplo/informe.json` está redactado a mano con el formato de salida.

## Costo estimado

Opus 5.5 cobra US$4 por millón de tokens de entrada y US$20 por millón de salida. Un día de 40 fotos cuesta unos US$0,60, o unos US$15 por obra al mes con 25 días hábiles. Las fotos se mandan a 1.092 px de lado mayor (~1.600 tokens cada una).
