# Avance de Obra: arquitectura

## Piezas

```
 App de campo (Expo, Android, APK)        Panel web (Next.js)
   SQLite local + cola de salida            /api en el mismo origen (rewrite)
            │  HTTPS, Bearer JWT                     │  cookie httpOnly
            ▼                                        ▼
 ┌──────────────────── services/api (Node, Fastify) ────────────────────┐
 │ login y sesiones · permisos (RLS) · sincronización · URLs firmadas    │
 │ importación del itemizado · usuarios · informes con IA · PDF (Chromium)│
 └───────────┬───────────────────────────┬───────────────────────┬──────┘
             ▼                           ▼                       ▼
   PostgreSQL 16 (Azure)       Blob Storage (Azure)       API de Claude
   datos y permisos            fotos e informes PDF       (redacción del informe)
```

Producción en la nube Microsoft de la organización (Azure, región Brazil South): Azure Database for PostgreSQL (servidor flexible), Azure Blob Storage (contenedor privado), Azure Container Apps para la API y la web, y Azure Key Vault para los secretos. GitHub guarda solo código: ningún dato de obra, clave ni contraseña.

Desarrollo local: `docker compose up -d` levanta Postgres 16 y Azurite (emulador de Blob Storage).

## Repositorio

```
apps/campo         App de campo (Expo / React Native, Android)
apps/web           Panel web del editor (Next.js)
services/api       API: autenticación, datos, archivos, informes y PDF
packages/contrato  Tipos compartidos y contrato de la API
packages/ui-tokens Colores, tipografía, espaciado y logos (docs/DISENO.md)
db/                Migraciones SQL, datos de prueba y script de migración
infra/             Infraestructura de Azure (Bicep) y despliegue
docs/              Esta documentación
```

## Modelo de datos

| Tabla | Qué es |
|---|---|
| `organizaciones` | La empresa |
| `usuarios` | Usuario y contraseña (bcrypt). `es_admin`: puede crear usuarios y obras (rol Editor) |
| `sesiones` | Sesiones de larga duración; solo se guarda el hash del token de renovación |
| `obras` | Obra, con código PEP SAP raíz, sigla para numerar informes y ubicación para el clima |
| `obra_miembros` | Rol de cada usuario en cada obra: `editor`, `campo`, `lector`, y su cargo |
| `sectores` | Sectores físicos jerárquicos, opcionales |
| `importaciones_items` | Cada carga del Excel del itemizado: archivo, versión SAP, filas, quién |
| `items` | Itemizado jerárquico por código PEP. Sin cantidad = título (no recibe fotos). `numero` = el "15" de "15-CERRAMIENTO…" |
| `partes_diarios` | Agrupa lo que cargó una persona en una obra en un día. Id determinístico `id_parte(obra, autor, fecha)` |
| `fotos` | Foto con ítem obligatorio, sector opcional, comentario libre, GPS y origen (app o web) |
| `anotaciones` | Marcas numeradas opcionales sobre la foto, cada una con su comentario |
| `registros_dia` | Clima y personal de cada día de obra, cargados a mano por el editor |
| `informes` | Diario, semanal o mensual: `contenido_ia` (original), `contenido` (corregido), número correlativo (ODD-001-001), PDF |
| `informe_fotos` | Qué fotos alimentaron cada informe, base para los resúmenes semanales y mensuales |

No hay porcentajes de avance: el avance se describe en palabras.

## Permisos

| | Editor | Campo | Solo lectura |
|---|---|---|---|
| Crear usuarios (usuario y contraseña), obras, sectores; importar itemizado | sí | — | — |
| Subir fotos | sí (web) | sí (app) | — |
| Corregir o borrar fotos y anotaciones | todas | las propias, solo el día en que las cargó | — |
| Ver la carga del día | sí | sí | — |
| Generar, corregir y publicar informes | sí | — | — |
| Ver y descargar informes publicados (PDF) | sí | sí | sí |

Las reglas viven en la base (RLS). La API se conecta con el rol `avance_api`, que no es dueño de las tablas, y en cada transacción declara el usuario con `set_config('app.usuario_id', …, true)`. Las funciones `mi_rol_en`, `puedo_ver`, `puedo_cargar`, `soy_editor` y `puedo_corregir` concentran la lógica. `avance_api` no puede leer `clave_hash` ni la tabla de sesiones: login, sesiones y altas de usuarios pasan por funciones `security definer`.

## Autenticación

- Usuario y contraseña, nada más. Los crea el editor desde el panel.
- Login → token de acceso (JWT, 1 hora) + token de renovación (opaco, rotado en cada uso; 180 días en la app, 30 en la web).
- La app guarda los tokens en el almacenamiento seguro del teléfono e inicia sesión una sola vez. La web usa cookies httpOnly en el mismo origen.
- Cambiar la contraseña o desactivar un usuario sube `version_sesion` y corta todas sus sesiones al instante.

## Fotos y archivos

- Contenedor privado de Blob Storage. Rutas: `fotos/{obra}/{autor}/{foto}.jpg`, `…_mini.jpg` y `informes/{obra}/{informe}.pdf`.
- La API entrega URLs firmadas de corta duración: de escritura (15 min) solo para la carpeta propia y de lectura (1 h) solo si el usuario puede ver esa obra. Las fotos no pasan por la API.
- El teléfono comprime antes de subir (lado mayor 2048 px, JPEG 0,8) y genera la miniatura de 400 px.

## Sincronización offline

- Todo se guarda primero en SQLite y se encola. La pantalla nunca espera a la red.
- Subida en orden: archivo primero, fila después (`PUT /api/fotos/:id`, idempotente). Error 4xx: queda marcado y no bloquea lo demás; 5xx o sin red: reintento con espera creciente.
- Bajada: `GET /api/obras/:id/sync?desde=` devuelve lo cambiado desde el cursor, con borrados lógicos. La app resta un margen de 2 minutos al cursor.

## Informes

- `POST /api/informes/generar` crea el informe en `generando`, junta las fotos, anotaciones y comentarios del período, el clima y el personal que cargó el editor, llama a Claude y deja el informe en `borrador`.
- El editor corrige `contenido` en el panel y publica. El PDF se arma con Chromium desde el mismo HTML de la vista previa y se guarda en Blob Storage. Solo PDF.
- Semanales y mensuales (más adelante): resumen de los diarios publicados del período, usando `informe_fotos`.

## Cambios al esquema

Cada cambio es una migración nueva en `db/migrations/` (`0002_…sql`) aplicada con `pnpm db:migrate`. Si cambia una forma compartida, se refleja en `packages/contrato`.
