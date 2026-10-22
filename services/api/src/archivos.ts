// Almacenamiento de fotos e informes. Destinos, elegidos con ALMACEN:
//   s3:         Cloudflare R2 o cualquier almacenamiento compatible con S3
//   sharepoint: una carpeta de SharePoint/OneDrive vía Microsoft Graph
//   azure:      Azure Blob Storage (Azurite en desarrollo)
// Los clientes siempre reciben URLs firmadas de corta duración. Con S3 y Azure
// apuntan directo al almacenamiento; con SharePoint apuntan a la API
// (/api/archivos/datos/:token), que pasa los bytes a Graph.

import {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';
import { GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SignJWT, jwtVerify } from 'jose';
import { config } from './config.ts';

export interface UrlFirmada {
  url: string;
  vence: Date;
  /** Encabezados que el cliente debe mandar con el PUT (solo en subidas). */
  encabezados?: Record<string, string>;
}

interface Destino {
  preparar(): Promise<void>;
  leer(ruta: string): Promise<Buffer>;
  guardar(ruta: string, datos: Buffer, contentType: string): Promise<void>;
  /** URL directa de lectura (Graph o SAS). */
  urlLecturaDirecta(ruta: string, minutos: number): Promise<string>;
  /** URL directa de subida, o null si la subida pasa por la API. */
  urlSubidaDirecta(ruta: string, minutos: number): Promise<string | null>;
}

// --- S3 (Cloudflare R2) ---

function destinoS3(): Destino {
  const c = config.s3!;
  const cliente = new S3Client({
    region: c.region,
    endpoint: c.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
  });
  return {
    preparar: async () => {
      await cliente.send(new HeadBucketCommand({ Bucket: c.bucket }));
    },
    leer: async (ruta) => {
      const r = await cliente.send(new GetObjectCommand({ Bucket: c.bucket, Key: ruta }));
      return Buffer.from(await r.Body!.transformToByteArray());
    },
    guardar: async (ruta, datos, contentType) => {
      await cliente.send(new PutObjectCommand({ Bucket: c.bucket, Key: ruta, Body: datos, ContentType: contentType }));
    },
    urlLecturaDirecta: (ruta, minutos) =>
      getSignedUrl(cliente, new GetObjectCommand({ Bucket: c.bucket, Key: ruta }), { expiresIn: minutos * 60 }),
    urlSubidaDirecta: (ruta, minutos) =>
      getSignedUrl(cliente, new PutObjectCommand({ Bucket: c.bucket, Key: ruta, ContentType: 'image/jpeg' }), {
        expiresIn: minutos * 60,
      }),
  };
}

// --- Azure Blob Storage ---

function destinoAzure(): Destino {
  const servicio = BlobServiceClient.fromConnectionString(config.storageConexion!);
  const contenedor = servicio.getContainerClient(config.storageContenedor);
  const credencial = servicio.credential as StorageSharedKeyCredential;
  const firmar = (ruta: string, permisos: string, minutos: number) => {
    const sas = generateBlobSASQueryParameters(
      {
        containerName: config.storageContenedor,
        blobName: ruta,
        permissions: BlobSASPermissions.parse(permisos),
        startsOn: new Date(Date.now() - 5 * 60_000),
        expiresOn: new Date(Date.now() + minutos * 60_000),
      },
      credencial,
    ).toString();
    return `${contenedor.getBlockBlobClient(ruta).url}?${sas}`;
  };
  return {
    preparar: async () => {
      await contenedor.createIfNotExists();
    },
    leer: (ruta) => contenedor.getBlockBlobClient(ruta).downloadToBuffer(),
    guardar: async (ruta, datos, contentType) => {
      await contenedor.getBlockBlobClient(ruta).uploadData(datos, { blobHTTPHeaders: { blobContentType: contentType } });
    },
    urlLecturaDirecta: async (ruta, minutos) => firmar(ruta, 'r', minutos),
    urlSubidaDirecta: async (ruta, minutos) => firmar(ruta, 'cw', minutos),
  };
}

// --- SharePoint / OneDrive (Microsoft Graph, permiso Sites.Selected) ---

function destinoSharePoint(): Destino {
  const sp = config.sharepoint!;
  let token: { valor: string; vence: number } | undefined;
  let driveId: string | undefined;

  async function acceso() {
    if (token && token.vence > Date.now() + 60_000) return token.valor;
    const r = await fetch(`https://login.microsoftonline.com/${sp.tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      body: new URLSearchParams({
        client_id: sp.clientId,
        client_secret: sp.clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    });
    if (!r.ok) throw new Error(`Microsoft Graph: no se pudo obtener el token (${r.status})`);
    const j = (await r.json()) as { access_token: string; expires_in: number };
    token = { valor: j.access_token, vence: Date.now() + j.expires_in * 1000 };
    return token.valor;
  }

  async function graph(ruta: string, init: RequestInit = {}) {
    const r = await fetch(`https://graph.microsoft.com/v1.0${ruta}`, {
      ...init,
      headers: { authorization: `Bearer ${await acceso()}`, ...init.headers },
    });
    if (!r.ok) throw new Error(`Microsoft Graph ${init.method ?? 'GET'} ${ruta}: ${r.status} ${await r.text()}`);
    return r;
  }

  // sitio: "empresa.sharepoint.com:/sites/Obras"; carpeta: "Avance de Obra/datos"
  async function drive() {
    if (!driveId) {
      const j = (await (await graph(`/sites/${sp.sitio}:/drive?$select=id`)).json()) as { id: string };
      driveId = j.id;
    }
    return driveId;
  }
  const item = async (ruta: string) =>
    `/drives/${await drive()}/root:/${encodeURI(`${sp.carpeta}/${ruta}`)}:`;

  return {
    preparar: async () => {
      await drive();
    },
    leer: async (ruta) => Buffer.from(await (await graph(`${await item(ruta)}/content`)).arrayBuffer()),
    guardar: async (ruta, datos, contentType) => {
      // Subida simple (hasta 250 MB con permisos de aplicación); crea las carpetas que falten.
      await graph(`${await item(ruta)}/content`, {
        method: 'PUT',
        headers: { 'content-type': contentType },
        body: new Uint8Array(datos),
      });
    },
    urlLecturaDirecta: async (ruta) => {
      const j = (await (await graph(`${await item(ruta)}?$select=@microsoft.graph.downloadUrl`)).json()) as Record<string, string>;
      return j['@microsoft.graph.downloadUrl'];
    },
    urlSubidaDirecta: async () => null,
  };
}

const destino =
  config.almacen === 's3' ? destinoS3() : config.almacen === 'sharepoint' ? destinoSharePoint() : destinoAzure();

// --- URLs que ven los clientes ---

const PROPOSITO = 'archivo';

async function tokenArchivo(ruta: string, permiso: 'r' | 'w', minutos: number) {
  return new SignJWT({ r: ruta, p: permiso, t: PROPOSITO })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(Math.floor(Date.now() / 1000) + minutos * 60)
    .sign(config.jwtSecreto);
}

/** Verifica un token de /api/archivos/datos/:token y devuelve ruta y permiso. */
export async function leerTokenArchivo(token: string) {
  const { payload } = await jwtVerify(token, config.jwtSecreto, { algorithms: ['HS256'] });
  if (payload.t !== PROPOSITO) throw new Error('token de otro tipo');
  return { ruta: payload.r as string, permiso: payload.p as 'r' | 'w' };
}

const viaApi = (token: string) => `${config.urlPublica}/api/archivos/datos/${token}`;

export async function urlSubida(ruta: string): Promise<UrlFirmada> {
  const minutos = 15;
  const vence = new Date(Date.now() + minutos * 60_000);
  const directa = config.viaApi ? null : await destino.urlSubidaDirecta(ruta, minutos);
  const encabezados: Record<string, string> = { 'content-type': 'image/jpeg' };
  if (directa && config.almacen === 'azure') encabezados['x-ms-blob-type'] = 'BlockBlob';
  return { url: directa ?? viaApi(await tokenArchivo(ruta, 'w', minutos)), vence, encabezados };
}

export async function urlLectura(ruta: string): Promise<UrlFirmada> {
  const minutos = 60;
  const vence = new Date(Date.now() + minutos * 60_000);
  if (!config.viaApi) return { url: await destino.urlLecturaDirecta(ruta, minutos), vence };
  return { url: viaApi(await tokenArchivo(ruta, 'r', minutos)), vence };
}

/** Para GET /api/archivos/datos/:token: redirige a la descarga directa del destino. */
export const urlDescarga = (ruta: string) => destino.urlLecturaDirecta(ruta, 5);

export const prepararAlmacen = () => destino.preparar();
export const leer = (ruta: string) => destino.leer(ruta);
export const guardar = (ruta: string, datos: Buffer, contentType: string) => destino.guardar(ruta, datos, contentType);
