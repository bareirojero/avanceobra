# Despliegue en producción

Opción elegida: fotos y PDF en una carpeta del Google Drive de Jerónimo; base de datos en Neon y API en Render, todo gratis y sin tarjeta de crédito. No toca el Microsoft 365 de la empresa. En GitHub no hay ninguna clave ni dato de obra.

| Pieza | Servicio | Costo |
|---|---|---|
| Fotos e informes PDF | Google Drive personal (15 GB compartidos con Gmail y Fotos; unas 25.000 fotos) | 0 USD; Google One 100 GB si hiciera falta |
| Base de datos | Neon, plan Free (0,5 GB: alcanza para años de textos) | 0 USD |
| API | Render, plan Free (se duerme sin uso; el primer pedido tarda unos 30 a 60 s) | 0 USD; 7 USD/mes para que no se duerma |
| Panel web | Render, plan Free (mismo blueprint) | 0 USD |

## 1. Fotos e informes

### Google Drive (opción elegida)

La API entra a tu Drive con un permiso que **solo le deja ver lo que ella misma crea** (`drive.file`): no puede leer el resto de tu Drive. Guarda todo en la carpeta `Avance de Obra`, que aparece sola en "Mi unidad". No borres ni muevas lo que hay adentro.

**A. Proyecto en Google Cloud** (gratis, sin tarjeta), en [console.cloud.google.com](https://console.cloud.google.com) con tu cuenta de Google:

1. Arriba, selector de proyectos > Nuevo proyecto: `Avance de Obra`.
2. APIs y servicios > Biblioteca > **Google Drive API** > Habilitar.
3. APIs y servicios > Pantalla de consentimiento de OAuth (o "Google Auth Platform"): tipo **Externo**, nombre `Avance de Obra`, tu correo como soporte y contacto. En Acceso a los datos (Scopes) agregar `.../auth/drive.file`. Guardar.
4. En Público (Audience) > **Publicar app** (pasar a "En producción"). Es importante: en modo "Prueba" la autorización vence a los 7 días. Con solo `drive.file` Google no pide verificación.
5. APIs y servicios > Credenciales > Crear credenciales > **ID de cliente de OAuth**, tipo **Aplicación web**, nombre `Avance de Obra API`. En URIs de redireccionamiento autorizados: `https://developers.google.com/oauthplayground`. Crear y dejar abierta la ventana con el **ID de cliente** y el **Secreto**.

**B. Autorizar una sola vez** en [OAuth Playground](https://developers.google.com/oauthplayground):

1. Engranaje (arriba a la derecha) > marcar **Use your own OAuth credentials** > pegar el ID de cliente y el secreto del paso A.5.
2. A la izquierda, en "Input your own scopes", escribir `https://www.googleapis.com/auth/drive.file` > **Authorize APIs** > elegir tu cuenta > Permitir. Si aparece "Google no verificó esta app", es la tuya: Configuración avanzada > Ir a Avance de Obra.
3. **Exchange authorization code for tokens**. Copiar el **Refresh token**.

Los tres valores (ID de cliente, secreto y refresh token) van directo a Render (paso 3), no por chat ni correo. Si alguna vez cambiás la contraseña de Google o quitás el acceso en [myaccount.google.com/permissions](https://myaccount.google.com/permissions), hay que repetir el paso B y actualizar `GOOGLE_REFRESH_TOKEN` en Render.

### Alternativas compatibles con S3 (`ALMACEN=s3`)

Si el Drive se queda corto o se prefiere un almacenamiento aparte, la API también funciona con Backblaze B2 (sin tarjeta) o Cloudflare R2 (pide tarjeta). Las fotos se pueden pasar de uno a otro copiando la carpeta.

#### Backblaze B2 (sin tarjeta)

1. Crear cuenta en [backblaze.com](https://www.backblaze.com/sign-up/cloud-storage) con correo y contraseña.
2. B2 > Buckets > Create a Bucket: un nombre único (por ejemplo `avance-obra-odd`), **Private**, sin cifrado ni bloqueo de objetos. En la tarjeta del bucket queda el **Endpoint** (por ejemplo `s3.us-east-005.backblazeb2.com`); la región es la parte del medio (`us-east-005`).
3. En el bucket > CORS Rules: "Share everything in this bucket with one origin", con la URL del panel (por ejemplo `https://avance-obra-web.onrender.com`), para **ambas** APIs (B2 Native y S3 Compatible).
4. Application Keys > Add a New Application Key: acceso solo a ese bucket, **Read and Write**. Copiar el `keyID` y el `applicationKey` directo a Render (paso 3), no por chat ni correo. La clave se muestra una sola vez.

Variables para Render: `S3_ENDPOINT` = `https://` + endpoint, `S3_REGION` = la región, `S3_BUCKET` = el nombre, `S3_ACCESS_KEY_ID` = keyID, `S3_SECRET_ACCESS_KEY` = applicationKey.

#### Cloudflare R2 (pide tarjeta para activarse)

1. En [dash.cloudflare.com](https://dash.cloudflare.com) > R2, crear el bucket `avance-obra`, privado (sin dominio público ni r2.dev).
2. Settings > CORS policy:
   ```json
   [{ "AllowedOrigins": ["https://avance-obra-web.onrender.com"],
      "AllowedMethods": ["GET", "PUT"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3600 }]
   ```
3. Manage API tokens > Create API token: **Object Read & Write**, solo ese bucket.

Variables para Render: `S3_ENDPOINT` = `https://<id de cuenta>.r2.cloudflarestorage.com`, `S3_REGION` = `auto`, y bucket y claves como arriba.

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
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`: los del paso 1.
   - En `avance-obra-web`, `API_URL_INTERNA`: la misma URL de la API. La dirección del panel es la que Render le da a `avance-obra-web`.
   - `TAREAS_SECRETO`: una clave larga inventada para el informe automático (ver abajo).
3. Cada push a `main` despliega solo. `https://…/salud` responde `{"ok":true}` cuando está andando.

### Informe automático de las 23:55

Si a las 23:55 una obra activa tiene fotos del día y nadie armó el informe, el workflow
"Informe automático" despierta la API y lo genera como borrador, marcado "Automático" en el
panel para que el editor lo revise y lo publique. Lo firma el primer editor de la obra.
Repasa también el día anterior, por si una noche no corrió.

1. Inventar una clave larga y cargarla igual en los dos lados:
   - Render > `avance-obra-api` > Environment: `TAREAS_SECRETO`.
   - GitHub > Settings > Secrets and variables > Actions > New repository secret: `TAREAS_SECRETO`.
2. Para probarlo o recuperar un día: Actions > "Informe automático" > Run workflow (con fecha o vacío).

## 4. Primer uso

Entrar al panel web con tu usuario, importar el Excel del itemizado (Itemizado > Importar) y crear los usuarios de campo.
