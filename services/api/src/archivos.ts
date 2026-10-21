// Almacenamiento de fotos e informes en Azure Blob Storage (Azurite en local).
// Las fotos no pasan por la API: el cliente sube y baja con URLs firmadas.

import {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';
import { config } from './config.ts';

const servicio = BlobServiceClient.fromConnectionString(config.storageConexion);
const contenedor = servicio.getContainerClient(config.storageContenedor);
const credencial = servicio.credential as StorageSharedKeyCredential;

export async function prepararContenedor() {
  await contenedor.createIfNotExists(); // privado
}

function firmar(ruta: string, permisos: string, minutos: number) {
  const vence = new Date(Date.now() + minutos * 60_000);
  const sas = generateBlobSASQueryParameters(
    {
      containerName: config.storageContenedor,
      blobName: ruta,
      permissions: BlobSASPermissions.parse(permisos),
      startsOn: new Date(Date.now() - 5 * 60_000),
      expiresOn: vence,
    },
    credencial,
  ).toString();
  return { url: `${contenedor.getBlockBlobClient(ruta).url}?${sas}`, vence };
}

export const urlSubida = (ruta: string) => firmar(ruta, 'cw', 15);
export const urlLectura = (ruta: string) => firmar(ruta, 'r', 60);

export async function leer(ruta: string): Promise<Buffer> {
  return contenedor.getBlockBlobClient(ruta).downloadToBuffer();
}

export async function guardar(ruta: string, datos: Buffer, contentType: string) {
  await contenedor.getBlockBlobClient(ruta).uploadData(datos, { blobHTTPHeaders: { blobContentType: contentType } });
}
