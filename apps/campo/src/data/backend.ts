import type { MisFotosRespuesta, SyncRespuesta, Yo } from '@registro-obra/contrato';

import type { Transporte } from '@/domain/cola';

import { crearBackendApi } from './backend-api';
import { crearBackendDemo } from './backend-demo';

export interface Sesion {
  usuarioId: string;
  nombre: string;
  usuario: string;
}

/** Una fila tal como llega de la API, antes de guardarla en SQLite. */
export type Fila = Record<string, unknown>;

export interface Backend {
  modo: 'api' | 'demo';
  iniciarSesion(usuario: string, clave: string): Promise<Sesion>;
  /** La sesión guardada en el teléfono, sin pedir red. */
  sesionGuardada(): Promise<Sesion | null>;
  cerrarSesion(): Promise<void>;
  transporte: Transporte;
  /** GET /api/yo: el usuario y sus obras con el rol en cada una. */
  yo(): Promise<Yo>;
  /** GET /api/obras/:id/sync: lo cambiado en la obra después de `desde` (null = todo). */
  novedades(obraId: string, desde: string | null): Promise<SyncRespuesta>;
  /** GET /api/obras/:id/mis-fotos: mis fotos de días anteriores a `antes`, de a páginas de días. */
  misFotos(obraId: string, antes: string): Promise<MisFotosRespuesta>;
}

/** Usuario o contraseña incorrectos (se muestra tal cual). */
export class ErrorDeIngreso extends Error {
  constructor(mensaje = 'Usuario o contraseña incorrectos') {
    super(mensaje);
    this.name = 'ErrorDeIngreso';
  }
}

/**
 * La sesión del teléfono ya no sirve (contraseña cambiada, usuario desactivado o 180 días
 * sin usar la app). Lo cargado no se pierde: queda esperando a que la persona vuelva a
 * escribir su contraseña.
 */
export class ErrorSesionVencida extends Error {
  constructor() {
    super('La sesión venció. Volvé a escribir tu contraseña para enviar.');
    this.name = 'ErrorSesionVencida';
  }
}

let actual: Backend | null = null;

/**
 * La API propia si la app se compiló con EXPO_PUBLIC_API_URL (ej. https://…/api); si no,
 * el modo demo, que funciona sin servidor para probar la app en campo.
 */
export function backend(): Backend {
  if (!actual) {
    const url = process.env.EXPO_PUBLIC_API_URL;
    actual = url ? crearBackendApi(url.replace(/\/+$/, '')) : crearBackendDemo();
  }
  return actual;
}
