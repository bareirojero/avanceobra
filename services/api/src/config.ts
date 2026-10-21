// Configuración por variables de entorno. En producción las carga el servicio
// de hosting desde sus secretos; nunca están en el repositorio.

function requerida(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor;
}

const almacen = (process.env.ALMACEN ?? 'azure') as 'azure' | 'sharepoint';

export const config = {
  puerto: Number(process.env.PORT ?? process.env.PUERTO ?? 8080),
  databaseUrl: requerida('DATABASE_URL'),
  jwtSecreto: new TextEncoder().encode(requerida('JWT_SECRETO')),
  /** URL pública de la API, para las URLs firmadas que pasan por ella. */
  urlPublica: (process.env.API_URL_PUBLICA ?? `http://localhost:${process.env.PORT ?? process.env.PUERTO ?? 8080}`).replace(/\/$/, ''),
  almacen,
  /** Las URLs firmadas pasan por la API (siempre con SharePoint; con Azure, solo para probar). */
  viaApi: almacen === 'sharepoint' || process.env.ALMACEN_VIA_API === '1',
  storageConexion: almacen === 'azure' ? requerida('AZURE_STORAGE_CONNECTION_STRING') : undefined,
  storageContenedor: process.env.AZURE_STORAGE_CONTAINER ?? 'avance-obra',
  sharepoint:
    almacen === 'sharepoint'
      ? {
          tenantId: requerida('MS_TENANT_ID'),
          clientId: requerida('MS_CLIENT_ID'),
          clientSecret: requerida('MS_CLIENT_SECRET'),
          sitio: requerida('SHAREPOINT_SITIO'), // "empresa.sharepoint.com:/sites/Obras"
          carpeta: process.env.SHAREPOINT_CARPETA ?? 'Avance de Obra/datos',
        }
      : undefined,
  /** true detrás de HTTPS (producción): cookies Secure. */
  produccion: process.env.NODE_ENV === 'production',
  accesoMinutos: 60,
  renovacionDias: { app: 180, web: 30 },
};
