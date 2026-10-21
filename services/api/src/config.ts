// Configuración por variables de entorno. En producción vienen de Azure Key Vault.

function requerida(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor;
}

export const config = {
  puerto: Number(process.env.PUERTO ?? 8080),
  databaseUrl: requerida('DATABASE_URL'),
  jwtSecreto: new TextEncoder().encode(requerida('JWT_SECRETO')),
  storageConexion: requerida('AZURE_STORAGE_CONNECTION_STRING'),
  storageContenedor: process.env.AZURE_STORAGE_CONTAINER ?? 'avance-obra',
  /** true detrás de HTTPS (producción): cookies Secure. */
  produccion: process.env.NODE_ENV === 'production',
  accesoMinutos: 60,
  renovacionDias: { app: 180, web: 30 },
};
