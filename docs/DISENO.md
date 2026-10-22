# Diseño y experiencia: Avance de Obra v0.2

Lienzo con todas las pantallas: https://claude.ai/artifact/THKn7oub519mpGNuTfFtz8
Tokens: `packages/ui-tokens/src/index.ts`. Logos e íconos: `packages/ui-tokens/assets/marca/`.

Decisiones de Jerónimo que cambian el diseño: una sola obra por ahora (ODD Fundaciones), sin porcentaje de avance, sin notas de voz, foto vinculada a un ítem del itemizado, marcas sobre la foto opcionales y comentario libre sin marcar, informe solo en PDF con el formato del Word modelo, Android con APK y web.

## Reglas

1. **El pulgar manda.** En campo la acción principal va abajo, a lo ancho, 76 px de alto, amarillo con texto azul marino.
2. **Escribir lo justo.** Foto, ítem y sector se eligen con toques. El texto es libre y corto: un comentario de la foto y, si quiere, uno por marca. Nunca hay un campo obligatorio de texto.
3. **Nunca se pierde nada.** Guardar es local e instantáneo y sube solo. El estado de envío se dice en palabras. Aunque hoy hay buena señal, la app funciona igual sin ella.
4. **Se lee al sol.** Texto de 17 px o más, contraste 4.5:1 como mínimo, azul marino sobre fondo claro.
5. Íconos Lucide con una palabra al lado, salvo cerrar y volver (con `aria-label`).
6. Textos en voseo, cortos. Fecha 21/10, hora 24 h. Ítems como `24 · Encofrado lateral de la zapata`, con el rubro encima.

## Roles

- **Editor** (web): crea usuarios con usuario y contraseña, carga el itemizado desde el Excel, sube fotos propias, revisa el informe de la IA y lo descarga en PDF. Es el único que edita.
- **Campo** (app): capataz o residente. Saca fotos, comenta, elige ítem y sector, completa el parte del día. No ve configuración.
- **Solo lectura** (web): ve el día de obra y los informes publicados.

## App de campo

Hoy → Sacar foto → Comentar y marcar → Elegir ítem → Guardar (vuelve a Hoy con "Foto guardada").
Meta: una foto con un comentario y su ítem en menos de 30 segundos.

**1. Hoy.** Encabezado azul marino con la marca en negativo, la obra, la fecha y el rol, y el chip de envío. Parte de hoy: clima en 3 botones, oficiales y ayudantes con −/+ de 52 px, botón "Incidente o novedad". Tira de mis fotos de hoy. Abajo "Sacar foto". Barra inferior: Hoy y Envíos.

**2. Comentar y marcar.** La foto arriba. Barra de tipos de marca (punto, círculo, flecha, recuadro, trazo) sobre la foto; tocar la foto agrega una marca numerada. Debajo: "Comentario de la foto" (texto libre, el que usa el capataz sin marcar), una fila por marca con su número y un campo corto, y el sector en chips (últimos usados primero, "Más…" abre el árbol). Marcar es opcional y se dice en pantalla.

**3. Elegir ítem.** Buscador por nombre o número, "Usados hoy" arriba, y el itemizado navegable por rubro y subrubro (la jerarquía del Excel: `OC.0054D002` › `OC.0054D002001` › ítem). Un solo ítem por foto. Sin porcentaje.

**4. Envíos.** Aviso "Foto guardada en el teléfono". Si no hay señal, tarjeta naranja con "Enviar solo con Wi-Fi". Lista del día con miniatura, ítem, hora y estado (`syncState`).

## Panel web del editor

Menú lateral azul marino con el logotipo en negativo: Día de obra, Informes, Itemizado, Usuarios, Obra.

**Día de obra.** Fecha con flechas, "Subir fotos" (solo editor) y "Armar informe del día". Números: fotos, quiénes informaron, personal (oficiales + ayudantes), novedades. Lo que llegó de campo agrupado por ítem, persona o sector; cada foto con sus marcas numeradas y los comentarios con el mismo número. A la derecha: ítems con fotos hoy y estado del equipo.

**Informe.** Barra con estado (`informeState`), "Descargar PDF" y "Aprobar y publicar". El informe se ve como sale en el PDF, igual al Word modelo: encabezado con empresa y obra, recuadro con el ícono, número de informe y fecha; franja con clima, personal e informaron; resumen del día resaltado; una sección por ítem con su código en etiqueta amarilla, sector, texto, fotos con sus marcas, pie en negrita, notas numeradas y autor con hora; incidentes y novedades; pie "Borrador redactado con asistencia de IA…" y número de página. Cada párrafo se edita en el lugar. A la derecha: "Para revisar" (cuando dos personas dicen cosas distintas, o faltan fotos por llegar), fuentes del párrafo y "Pedile un cambio a la IA".

Faltan dibujar, con las mismas reglas: login, Usuarios (alta con usuario y contraseña), importación del itemizado con vista previa, lista de informes y la vista de solo lectura.

## Componentes base

| Componente | Campo | Web |
|---|---|---|
| Botón principal | 76 px, radio 18, Archivo 800 22–24 px, amarillo | 44 px, radio 10, Archivo 700 15 px, amarillo |
| Botón secundario | azul marino con texto blanco, o borde 2 px `line` | borde 1 px `lineStrong` |
| Campo de texto | 48 px (una línea) o 2 líneas, borde 2 px `lineStrong`, 17–18 px | 40 px, borde 1 px |
| Chip de sector | 44 px, píldora; elegido azul marino, libre con borde | 36 px |
| Marca numerada | 40 px, borde 3 px azul marino; activa amarilla, otras blancas | 30 px; en el PDF, etiqueta cuadrada amarilla |
| Chip de estado | 34 px, fondo suave + texto oscuro del estado + ícono | igual |
| Fila de ítem | rubro en 13 px, número · nombre en 17 px | 14 px |
