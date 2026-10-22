// Almacenamiento de fotos e informes. Destinos, elegidos con ALMACEN:
//   s3:         Cloudflare R2 o cualquier almacenamiento compatible con S3
//   drive:      una carpeta del Google Drive del dueño (OAuth, permiso drive.file)
//   sharepoint: una carpeta de SharePoint/OneDrive vía Microsoft Graph
//   azure:      Azure Blob Storage (Azurite en desarrollo)
// Los clientes siempre reciben URLs firmadas de corta duración. Con S3 y Azure
// apuntan directo al almacenamiento; con Drive y SharePoint apuntan a la API
// (/api/archivos/datos/:token), que pasa los bytes.

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
  /** URL directa de lectura (Graph, SAS o S3), o null si los bytes pasan por la API. */
  urlLecturaDirecta(ruta: string, minutos: number): Promise<string | null>;
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

// --- Google Drive (OAuth del dueño de la cuenta, permiso drive.file) ---
// drive.file: la API solo ve los archivos y carpetas que creó ella misma.
// Las rutas se arman como carpetas dentro de DRIVE_CARPETA ("Avance de Obra").

function destinoDrive(): Destino {
  const g = config.drive!;
  const CARPETA = 'application/vnd.google-apps.folder';
  let token: { valor: string; vence: number } | undefined;
  const ids = new Map<string, Promise<string | null>>();

  async function acceso() {
    if (token && token.vence > Date.now() + 60_000) return token.valor;
    const r = await fetch(g.tokenUrl, {
      method: 'POST',
      body: new URLSearchParams({
        client_id: g.clientId,
        client_secret: g.clientSecret,
        refresh_token: g.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!r.ok) throw new Error(`Google Drive: no se pudo obtener el token (${r.status} ${await r.text()})`);
    const j = (await r.json()) as { access_token: string; expires_in: number };
    token = { valor: j.access_token, vence: Date.now() + j.expires_in * 1000 };
    return token.valor;
  }

  async function api(ruta: string, init: RequestInit = {}) {
    const r = await fetch(`${g.apiBase}${ruta}`, {
      ...init,
      headers: { authorization: `Bearer ${await acceso()}`, ...init.headers },
    });
    if (!r.ok) throw new Error(`Google Drive ${init.method ?? 'GET'} ${ruta}: ${r.status} ${await r.text()}`);
    return r;
  }

  async function buscar(nombre: string, padre: string, tipo?: string) {
    const q = [`name = '${nombre.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`, `'${padre}' in parents`, 'trashed = false'];
    if (tipo) q.push(`mimeType = '${tipo}'`);
    const p = new URLSearchParams({ q: q.join(' and '), fields: 'files(id)', pageSize: '1', spaces: 'drive' });
    const j = (await (await api(`/drive/v3/files?${p}`)).json()) as { files: { id: string }[] };
    return j.files[0]?.id ?? null;
  }

  /** Id de la carpeta de una ruta ('' = la carpeta raíz de la app); la crea si falta. */
  function carpeta(ruta: string): Promise<string> {
    const clave = `d:${ruta}`;
    if (!ids.has(clave)) {
      const promesa = (async () => {
        const i = ruta.lastIndexOf('/');
        const padre = ruta === '' ? 'root' : await carpeta(i < 0 ? '' : ruta.slice(0, i));
        const nombre = ruta === '' ? g.carpeta : ruta.slice(i + 1);
        const existente = await buscar(nombre, padre, CARPETA);
        if (existente) return existente;
        const r = await api('/drive/v3/files?fields=id', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: nombre, mimeType: CARPETA, parents: [padre] }),
        });
        return ((await r.json()) as { id: string }).id;
      })();
      promesa.catch(() => ids.delete(clave)); // reintentar en el próximo pedido
      ids.set(clave, promesa);
    }
    return ids.get(clave) as Promise<string>;
  }

  const partes = (ruta: string) => {
    const i = ruta.lastIndexOf('/');
    return { dir: i < 0 ? '' : ruta.slice(0, i), nombre: ruta.slice(i + 1) };
  };

  async function archivo(ruta: string) {
    const clave = `f:${ruta}`;
    const enCache = await ids.get(clave);
    if (enCache) return enCache;
    const { dir, nombre } = partes(ruta);
    const id = await buscar(nombre, await carpeta(dir));
    if (id) ids.set(clave, Promise.resolve(id));
    return id;
  }

  let cola: Promise<unknown> = Promise.resolve();
  return {
    preparar: async () => {
      await carpeta('');
    },
    leer: async (ruta) => {
      const id = await archivo(ruta);
      if (!id) throw new Error(`Google Drive: no existe ${ruta}`);
      return Buffer.from(await (await api(`/drive/v3/files/${id}?alt=media`)).arrayBuffer());
    },
    // En fila, para que dos subidas de la misma ruta no creen dos archivos.
    guardar: (ruta, datos, contentType) => {
      const tarea = cola.then(async () => {
        const id = await archivo(ruta);
        if (id) {
          await api(`/upload/drive/v3/files/${id}?uploadType=media`, {
            method: 'PATCH',
            headers: { 'content-type': contentType },
            body: new Uint8Array(datos),
          });
          return;
        }
        const { dir, nombre } = partes(ruta);
        const limite = `avance${crypto.randomUUID()}`;
        const cuerpo = Buffer.concat([
          Buffer.from(
            `--${limite}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n` +
              JSON.stringify({ name: nombre, parents: [await carpeta(dir)] }) +
              `\r\n--${limite}\r\ncontent-type: ${contentType}\r\n\r\n`,
          ),
          datos,
          Buffer.from(`\r\n--${limite}--`),
        ]);
        const r = await api('/upload/drive/v3/files?uploadType=multipart&fields=id', {
          method: 'POST',
          headers: { 'content-type': `multipart/related; boundary=${limite}` },
          body: new Uint8Array(cuerpo),
        });
        ids.set(`f:${ruta}`, Promise.resolve(((await r.json()) as { id: string }).id));
      });
      cola = tarea.catch(() => {});
      return tarea;
    },
    urlLecturaDirecta: async () => null,
    urlSubidaDirecta: async () => null,
  };
}

const destino =
  config.almacen === 's3'
    ? destinoS3()
    : config.almacen === 'drive'
      ? destinoDrive()
      : config.almacen === 'sharepoint'
        ? destinoSharePoint()
        : destinoAzure();

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
  const directa = config.viaApi ? null : await destino.urlLecturaDirecta(ruta, minutos);
  if (directa) return { url: directa, vence };
  return { url: viaApi(await tokenArchivo(ruta, 'r', minutos)), vence };
}

/** Para GET /api/archivos/datos/:token: descarga directa del destino, o null si la API pasa los bytes. */
export const urlDescarga = (ruta: string) => destino.urlLecturaDirecta(ruta, 5);

export const prepararAlmacen = () => destino.preparar();
export const leer = (ruta: string) => destino.leer(ruta);
export const guardar = (ruta: string, datos: Buffer, contentType: string) => destino.guardar(ruta, datos, contentType);
