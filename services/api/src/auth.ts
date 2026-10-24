// Login con usuario y contraseña, token de acceso JWT corto y token de
// renovación opaco (solo su hash queda en la base, se rota en cada uso).

import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SignJWT, jwtVerify } from 'jose';
import { config } from './config.ts';
import { conUsuario } from './db.ts';
import { ErrorApi } from './errores.ts';

export interface Sesion {
  usuarioId: string;
}

// Lo único que puede pedir un usuario que solo es gerente (rol de solo Dashboard).
const RUTAS_GERENTE = new Set(['/api/yo', '/api/auth/clave', '/api/obras/:obraId/dashboard']);

declare module 'fastify' {
  interface FastifyRequest {
    sesion: Sesion;
  }
}

const COOKIE_ACCESO = 'ao_acceso';
const COOKIE_RENOVACION = 'ao_renovacion';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const tokenNuevo = () => randomBytes(32).toString('base64url');

export async function firmarAcceso(usuarioId: string, version: number) {
  const vence = new Date(Date.now() + config.accesoMinutos * 60_000);
  const jwt = await new SignJWT({ v: version })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(usuarioId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(vence.getTime() / 1000))
    .sign(config.jwtSecreto);
  return { jwt, vence };
}

/** Hook: exige token válido y que la versión de sesión siga vigente. */
export async function autenticar(pedido: FastifyRequest) {
  const encabezado = pedido.headers.authorization;
  const token = encabezado?.startsWith('Bearer ') ? encabezado.slice(7) : pedido.cookies[COOKIE_ACCESO];
  if (!token) throw new ErrorApi(401, 'no_autenticado', 'Iniciá sesión');
  let usuarioId: string;
  let version: number;
  try {
    const { payload } = await jwtVerify(token, config.jwtSecreto, { algorithms: ['HS256'] });
    usuarioId = payload.sub!;
    version = payload.v as number;
  } catch {
    throw new ErrorApi(401, 'no_autenticado', 'La sesión venció');
  }
  const [fila] = await conUsuario(null, (q) =>
    q<{ v: number | null; gerente: boolean | null }>(
      'select version_sesion_vigente($1) as v, solo_gerente($1) as gerente',
      [usuarioId],
    ),
  );
  if (fila?.v !== version) throw new ErrorApi(401, 'no_autenticado', 'La sesión ya no es válida');
  if (fila.gerente && !RUTAS_GERENTE.has(pedido.routeOptions.url ?? '')) {
    throw new ErrorApi(403, 'sin_permiso', 'Tu usuario solo tiene acceso al Dashboard');
  }
  pedido.sesion = { usuarioId };
}

type Dispositivo = 'app' | 'web';

/** Emite acceso + renovación. En la web van en cookies httpOnly. */
export async function emitirTokens(
  respuesta: FastifyReply,
  usuarioId: string,
  version: number,
  dispositivo: Dispositivo,
  renovacion: string,
) {
  const { jwt, vence } = await firmarAcceso(usuarioId, version);
  if (dispositivo === 'web') {
    const base = { httpOnly: true, secure: config.produccion, sameSite: 'lax' as const, path: '/api' };
    respuesta.setCookie(COOKIE_ACCESO, jwt, { ...base, expires: vence });
    respuesta.setCookie(COOKIE_RENOVACION, renovacion, {
      ...base,
      path: '/api/auth',
      maxAge: config.renovacionDias.web * 86_400,
    });
    return { acceso_vence_en: vence.toISOString() };
  }
  return { acceso: jwt, renovacion, acceso_vence_en: vence.toISOString() };
}

export async function login(usuario: string, clave: string, dispositivo: Dispositivo) {
  return conUsuario(null, async (q) => {
    const [u] = await q<{ id: string; version_sesion: number }>('select * from verificar_credenciales($1, $2)', [
      usuario,
      clave,
    ]);
    if (!u) throw new ErrorApi(401, 'credenciales_invalidas', 'Usuario o contraseña incorrectos');
    const renovacion = tokenNuevo();
    await q('select abrir_sesion($1, $2, $3, $4)', [
      u.id,
      hash(renovacion),
      dispositivo,
      config.renovacionDias[dispositivo],
    ]);
    return { usuarioId: u.id, version: u.version_sesion, renovacion };
  });
}

export function tokenRenovacionDe(pedido: FastifyRequest, cuerpo?: { renovacion?: string }) {
  return cuerpo?.renovacion ?? pedido.cookies[COOKIE_RENOVACION];
}

export async function renovar(token: string, dispositivo: Dispositivo) {
  const nuevo = tokenNuevo();
  const [fila] = await conUsuario(null, (q) =>
    q<{ usuario_id: string; version_sesion: number }>('select * from renovar_sesion($1, $2, $3)', [
      hash(token),
      hash(nuevo),
      config.renovacionDias[dispositivo],
    ]),
  );
  if (!fila) throw new ErrorApi(401, 'no_autenticado', 'Iniciá sesión de nuevo');
  return { usuarioId: fila.usuario_id, version: fila.version_sesion, renovacion: nuevo };
}

export async function salir(respuesta: FastifyReply, token: string | undefined) {
  if (token) await conUsuario(null, (q) => q('select cerrar_sesion($1)', [hash(token)]));
  respuesta.clearCookie(COOKIE_ACCESO, { path: '/api' });
  respuesta.clearCookie(COOKIE_RENOVACION, { path: '/api/auth' });
}
