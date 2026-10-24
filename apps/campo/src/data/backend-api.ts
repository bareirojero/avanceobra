import type {
  ErrorApi,
  LoginPedido,
  LoginRespuesta,
  MisFotosRespuesta,
  OperacionPendiente,
  RenovarRespuesta,
  SubidaPedido,
  SubidaRespuesta,
  SyncRespuesta,
  Yo,
} from '@registro-obra/contrato';
import { File, UploadType } from 'expo-file-system';

import { ErrorPermanente, ErrorSinConexion } from '@/domain/cola';

import { ErrorDeIngreso, ErrorSesionVencida, type Backend, type Sesion } from './backend';
import { almacenSeguro } from './sesion-segura';

/** Cliente de services/api (docs/API.md). Los tokens viven en el almacén cifrado del teléfono. */

const CLAVE_ACCESO = 'ao.acceso';
const CLAVE_RENOVACION = 'ao.renovacion';
const CLAVE_SESION = 'ao.sesion';
// Generoso: el servidor gratuito se duerme y el primer pedido del día puede tardar un minuto.
const ESPERA_MS = 90_000;

let oyenteVencida: (() => void) | null = null;

/** La sincronización se entera de que hay que volver a escribir la contraseña. */
export function alVencerSesion(oyente: () => void) {
  oyenteVencida = oyente;
}

/**
 * Traduce una respuesta con error a lo que entiende la cola: permanente (permisos, datos
 * inválidos, conflicto) o pasajero (servidor caído, demasiados pedidos).
 */
export function clasificar(status: number, cuerpo: Partial<ErrorApi> | null): Error {
  const mensaje = cuerpo?.error?.mensaje ?? `Error ${status}`;
  const codigo = cuerpo?.error?.codigo;
  if (codigo === 'sin_permiso' || status === 403) {
    return new ErrorPermanente('No tenés permiso para esta carga. Las fotos solo se corrigen el mismo día.');
  }
  if (status >= 400 && status < 500 && ![401, 408, 425, 429].includes(status)) {
    return new ErrorPermanente(`El servidor rechazó el dato: ${mensaje}`);
  }
  return new Error(`${status} ${mensaje}`);
}

async function conEspera(url: string, init: RequestInit): Promise<Response> {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), ESPERA_MS);
  try {
    return await fetch(url, { ...init, signal: control.signal });
  } catch (e) {
    throw new ErrorSinConexion(e instanceof Error ? e.message : 'Sin conexión');
  } finally {
    clearTimeout(reloj);
  }
}

const leerJson = async (r: Response) => {
  try {
    return await r.json();
  } catch {
    return null;
  }
};

export function crearBackendApi(base: string): Backend {
  let acceso: string | null = null;
  let renovando: Promise<void> | null = null;

  async function guardarTokens(r: RenovarRespuesta) {
    acceso = r.acceso ?? null;
    if (r.acceso) await almacenSeguro.setItem(CLAVE_ACCESO, r.acceso);
    if (r.renovacion) await almacenSeguro.setItem(CLAVE_RENOVACION, r.renovacion);
  }

  /** Un solo pedido de renovación aunque fallen varios a la vez (el token se rota en cada uso). */
  function renovar(): Promise<void> {
    renovando ??= (async () => {
      const renovacion = await almacenSeguro.getItem(CLAVE_RENOVACION);
      if (!renovacion) throw new ErrorSesionVencida();
      const r = await conEspera(`${base}/auth/renovar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renovacion }),
      });
      if (r.status === 401 || r.status === 403) {
        oyenteVencida?.();
        throw new ErrorSesionVencida();
      }
      if (!r.ok) throw clasificar(r.status, await leerJson(r));
      await guardarTokens(await r.json());
    })().finally(() => {
      renovando = null;
    });
    return renovando;
  }

  async function pedir<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
    acceso ??= await almacenSeguro.getItem(CLAVE_ACCESO);
    for (let intento = 0; ; intento++) {
      const r = await conEspera(`${base}${ruta}`, {
        method: metodo,
        headers: {
          Accept: 'application/json',
          ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(acceso ? { Authorization: `Bearer ${acceso}` } : {}),
        },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      });
      if (r.status === 401 && intento === 0) {
        await renovar();
        continue;
      }
      if (r.status === 401) throw new ErrorSesionVencida();
      if (!r.ok) throw clasificar(r.status, await leerJson(r));
      return (r.status === 204 ? null : await leerJson(r)) as T;
    }
  }

  async function ejecutar(op: OperacionPendiente): Promise<void> {
    if (op.tipo === 'upsert') {
      await pedir('PUT', `/${op.recurso}/${op.id}`, op.fila);
      return;
    }
    const archivo = new File(op.uriLocal);
    if (!archivo.exists) throw new ErrorPermanente('La foto ya no está en el teléfono.');
    const pedido: SubidaPedido = { ruta: op.ruta, content_type: op.contentType };
    const destino = await pedir<SubidaRespuesta>('POST', '/archivos/subida', pedido);
    let r;
    try {
      // Subida nativa directo al almacenamiento, sin pasar el archivo por JavaScript.
      r = await archivo.upload(destino.url, {
        httpMethod: destino.metodo,
        uploadType: UploadType.BINARY_CONTENT,
        headers: Object.keys(destino.encabezados).some((k) => k.toLowerCase() === 'content-type')
          ? destino.encabezados
          : { ...destino.encabezados, 'Content-Type': op.contentType },
      });
    } catch (e) {
      throw new ErrorSinConexion(e instanceof Error ? e.message : 'Sin conexión');
    }
    // 403 del almacenamiento suele ser la URL firmada vencida: se pide otra en el reintento.
    if (r.status === 403) throw new Error('URL de subida vencida');
    if (r.status < 200 || r.status >= 300) throw clasificar(r.status, null);
  }

  return {
    modo: 'api',

    async iniciarSesion(usuario, clave) {
      const pedido: LoginPedido = { usuario: usuario.trim().toLowerCase(), clave, dispositivo: 'app' };
      const r = await conEspera(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pedido),
      });
      if (r.status === 401 || r.status === 403) throw new ErrorDeIngreso();
      if (r.status === 429) throw new ErrorDeIngreso('Demasiados intentos. Esperá unos minutos.');
      if (!r.ok) throw new ErrorSinConexion(`Error ${r.status}`);
      const datos: LoginRespuesta = await r.json();
      await guardarTokens(datos);
      const sesion: Sesion = { usuarioId: datos.yo.usuario.id, nombre: datos.yo.usuario.nombre, usuario: datos.yo.usuario.usuario };
      await almacenSeguro.setItem(CLAVE_SESION, JSON.stringify(sesion));
      return sesion;
    },

    async sesionGuardada() {
      const [sesion, renovacion] = await Promise.all([almacenSeguro.getItem(CLAVE_SESION), almacenSeguro.getItem(CLAVE_RENOVACION)]);
      return sesion && renovacion ? (JSON.parse(sesion) as Sesion) : null;
    },

    async cerrarSesion() {
      const renovacion = await almacenSeguro.getItem(CLAVE_RENOVACION);
      // Avisar al servidor es cortesía: si no hay señal, la sesión igual se borra del teléfono.
      void conEspera(`${base}/auth/salir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(acceso ? { Authorization: `Bearer ${acceso}` } : {}) },
        body: JSON.stringify({ renovacion }),
      }).catch(() => undefined);
      acceso = null;
      await Promise.all([CLAVE_ACCESO, CLAVE_RENOVACION, CLAVE_SESION].map((k) => almacenSeguro.removeItem(k)));
    },

    transporte: { ejecutar },

    yo: () => pedir<Yo>('GET', '/yo'),

    novedades: (obraId, desde) =>
      pedir<SyncRespuesta>('GET', `/obras/${obraId}/sync${desde ? `?desde=${encodeURIComponent(desde)}` : ''}`),

    misFotos: (obraId, antes) => pedir<MisFotosRespuesta>('GET', `/obras/${obraId}/mis-fotos?antes=${antes}`),
  };
}

