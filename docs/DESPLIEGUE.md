# Despliegue en producción

Opción elegida: fotos y PDF en SharePoint de la organización; base de datos en Neon y API en Render, ambos en el plan gratuito y en la costa este de EE. UU. (Virginia). En GitHub no hay ninguna clave ni dato de obra.

| Pieza | Servicio | Costo |
|---|---|---|
| Fotos e informes PDF | SharePoint (Microsoft 365 de la organización) | incluido |
| Base de datos | Neon, plan Free (0,5 GB: alcanza para años de textos) | 0 USD |
| API | Render, plan Free (se duerme sin uso; el primer pedido tarda unos 30 a 60 s) | 0 USD; 7 USD/mes para que no se duerma |
| Panel web | Lo define el módulo web (Vercel o Render, plan gratuito) | 0 USD |

## 1. SharePoint (lo hace quien administra Microsoft 365)

1. Crear en SharePoint la carpeta `Avance de Obra` en el sitio que se quiera usar (por ejemplo `https://empresa.sharepoint.com/sites/Obras`).
2. En [Entra ID](https://entra.microsoft.com) > Registros de aplicaciones > Nuevo registro: nombre "Avance de Obra", una sola organización.
3. En Permisos de API > Microsoft Graph > Permisos de aplicación: `Sites.Selected`. Conceder consentimiento de administrador.
4. En Certificados y secretos: crear un secreto de cliente (24 meses). Copiarlo directo a Render (paso 3), no por chat ni correo.
5. Darle a la app permiso de escritura **solo en ese sitio** (Graph Explorer o PowerShell):
   ```
   POST https://graph.microsoft.com/v1.0/sites/{id-del-sitio}/permissions
   { "roles": ["write"],
     "grantedToIdentities": [{ "application": { "id": "<id de cliente>", "displayName": "Avance de Obra" } }] }
   ```
   (`{id-del-sitio}` se obtiene con `GET https://graph.microsoft.com/v1.0/sites/empresa.sharepoint.com:/sites/Obras`).

Datos que salen de acá: id de inquilino (tenant), id de cliente, secreto (solo en Render) y el sitio en la forma `empresa.sharepoint.com:/sites/Obras`.

## 2. Neon (base de datos)

1. Crear cuenta en [neon.tech](https://neon.tech) y un proyecto `avance-obra`, región AWS US East (N. Virginia), Postgres 16.
2. Copiar la cadena de conexión del usuario dueño y guardarla en GitHub > Settings > Secrets and variables > Actions, environment `produccion`:
   - `DATABASE_ADMIN_URL`: la cadena de Neon (termina en `?sslmode=require`).
   - `AVANCE_API_CLAVE`: una contraseña larga inventada, para el usuario con el que entra la API.
   - `EDITOR_CLAVE`: tu contraseña inicial de editor (después la cambiás desde la app).
3. En GitHub > Actions > "Base de datos" > Run workflow, con "Carga inicial" marcado. Crea las tablas, tu usuario editor y la obra ODD - Fundaciones.

## 3. Render (API)

1. Crear cuenta en [render.com](https://render.com) entrando con GitHub, y New > Blueprint > repositorio `avanceobra`. Toma `render.yaml`.
2. Cargar las variables que pide:
   - `DATABASE_URL`: la misma cadena de Neon pero con el usuario `avance_api` y la contraseña `AVANCE_API_CLAVE`.
   - `API_URL_PUBLICA`: la URL que Render le da al servicio (por ejemplo `https://avance-obra-api.onrender.com`).
   - `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `SHAREPOINT_SITIO`: los del paso 1.
3. Cada push a `main` despliega solo. `https://…/salud` responde `{"ok":true}` cuando está andando.

## 4. Primer uso

Entrar al panel web con tu usuario, importar el Excel del itemizado (Itemizado > Importar) y crear los usuarios de campo.
