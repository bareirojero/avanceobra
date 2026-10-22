# Despliegue en producción

Opción elegida: fotos y PDF en Cloudflare R2; base de datos en Neon y API en Render, todo en planes gratuitos y en la costa este de EE. UU. (Virginia). No toca el Microsoft 365 de la empresa. En GitHub no hay ninguna clave ni dato de obra.

| Pieza | Servicio | Costo |
|---|---|---|
| Fotos e informes PDF | Cloudflare R2 (10 GB gratis, sin cargo por descarga; unas 25.000 fotos) | 0 USD; después 0,015 USD por GB al mes |
| Base de datos | Neon, plan Free (0,5 GB: alcanza para años de textos) | 0 USD |
| API | Render, plan Free (se duerme sin uso; el primer pedido tarda unos 30 a 60 s) | 0 USD; 7 USD/mes para que no se duerma |
| Panel web | Render, plan Free (mismo blueprint) | 0 USD |

## 1. Cloudflare R2 (fotos e informes)

1. Crear cuenta en [dash.cloudflare.com](https://dash.cloudflare.com) y entrar a R2. Para activar R2, Cloudflare pide un medio de pago aunque no se pase del plan gratuito.
2. Create bucket: nombre `avance-obra`, ubicación automática. Dejarlo **privado** (sin dominio público ni r2.dev).
3. En el bucket > Settings > CORS policy, para que el panel web pueda subir fotos (cambiar la URL por la del panel cuando Render la dé):
   ```json
   [{ "AllowedOrigins": ["https://avance-obra-web.onrender.com"],
      "AllowedMethods": ["GET", "PUT"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3600 }]
   ```
4. R2 > Manage API tokens > Create API token: permiso **Object Read & Write**, aplicado **solo al bucket `avance-obra`**, sin vencimiento. Copiar el Access Key ID y el Secret Access Key directo a Render (paso 3), no por chat ni correo. El secreto se muestra una sola vez.

Datos que salen de acá: el endpoint (`https://<id de cuenta>.r2.cloudflarestorage.com`, aparece en la pantalla del token), el nombre del bucket y las dos claves (solo en Render).

La API también sabe guardar en SharePoint (`ALMACEN=sharepoint`, con un registro de aplicación con `Sites.Selected`) si más adelante informática lo aprueba.

## 2. Neon (base de datos)

1. Crear cuenta en [neon.tech](https://neon.tech) y un proyecto `avance-obra`, región AWS US East (N. Virginia), Postgres 16.
2. Copiar la cadena de conexión del usuario dueño y guardarla en GitHub > Settings > Secrets and variables > Actions, environment `produccion`:
   - `DATABASE_ADMIN_URL`: la cadena de Neon (termina en `?sslmode=require`).
   - `AVANCE_API_CLAVE`: una contraseña larga inventada, para el usuario con el que entra la API.
   - `EDITOR_CLAVE`: tu contraseña inicial de editor (después la cambiás desde la app).
3. En GitHub > Actions > "Base de datos" > Run workflow, con "Carga inicial" marcado. Crea las tablas, tu usuario editor y la obra ODD - Fundaciones.

## 3. Render (API y panel web)

1. Crear cuenta en [render.com](https://render.com) entrando con GitHub, y New > Blueprint > repositorio `avanceobra`. Toma `render.yaml`.
2. Cargar las variables que pide:
   - `DATABASE_URL`: la misma cadena de Neon pero con el usuario `avance_api` y la contraseña `AVANCE_API_CLAVE`.
   - `API_URL_PUBLICA`: la URL que Render le da al servicio (por ejemplo `https://avance-obra-api.onrender.com`).
   - `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`: los del paso 1.
   - En `avance-obra-web`, `API_URL_INTERNA`: la misma URL de la API. La dirección del panel es la que Render le da a `avance-obra-web`.
3. Cada push a `main` despliega solo. `https://…/salud` responde `{"ok":true}` cuando está andando.

## 4. Primer uso

Entrar al panel web con tu usuario, importar el Excel del itemizado (Itemizado > Importar) y crear los usuarios de campo.
