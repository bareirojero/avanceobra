import type { OperacionPendiente } from '@registro-obra/contrato';

/**
 * Cola de salida (ARQUITECTURA.md §6). Todo lo que se carga en el teléfono se escribe
 * en SQLite y deja operaciones en esta cola; la pantalla nunca espera a la red.
 *
 * Reglas:
 * - FIFO: archivo primero, fila después; parte antes que sus fotos, foto antes que sus
 *   anotaciones. Un error pasajero (sin señal, 5xx) frena la cola entera hasta el
 *   próximo intento, así nunca se adelanta una fila a lo que necesita.
 * - Un error permanente (4xx de permisos o validación) deja la operación marcada y
 *   bloquea solo las que comparten alguno de sus `grupos` (la misma foto, el mismo
 *   parte). Las fotos de otros partes siguen subiendo.
 */
export interface EntradaCola {
  seq: number;
  op: OperacionPendiente;
  /** Claves de lo que esta operación necesita (id del parte, id de la foto). */
  grupos: string[];
  intentos: number;
  /** Momento (ms epoch) desde el cual se puede intentar. */
  proximoIntento: number;
  /** Cambia cada vez que se reemplaza la fila a subir (ver `AlmacenCola.quitar`). */
  rev: number;
  error: string | null;
}

export interface Transporte {
  ejecutar(op: OperacionPendiente): Promise<void>;
}

export interface AlmacenCola {
  /** Toda la cola, en orden. */
  listar(): Promise<EntradaCola[]>;
  /**
   * Saca la operación confirmada. Si mientras se subía el usuario editó la fila (otra
   * `rev`), no la saca: vuelve a subir con los datos nuevos en la próxima pasada.
   */
  quitar(seq: number, rev: number): Promise<void>;
  reprogramar(seq: number, intentos: number, proximoIntento: number, error: string): Promise<void>;
  marcarError(seq: number, error: string): Promise<void>;
}

/** No hay conexión. */
export class ErrorSinConexion extends Error {
  constructor(mensaje = 'Sin conexión') {
    super(mensaje);
    this.name = 'ErrorSinConexion';
  }
}

/** El servidor rechazó la operación y reintentar no la va a arreglar. */
export class ErrorPermanente extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorPermanente';
  }
}

export const ESPERA_BASE_MS = 15_000;
export const ESPERA_MAXIMA_MS = 15 * 60_000;

/** Espera exponencial con ±20% de variación para que no reintenten todos los teléfonos juntos. */
export function esperaReintento(intentos: number, azar: () => number = Math.random): number {
  const base = Math.min(ESPERA_MAXIMA_MS, ESPERA_BASE_MS * 2 ** Math.max(0, intentos - 1));
  return Math.round(base * (1 + (azar() * 0.4 - 0.2)));
}

export interface ResultadoCola {
  subidas: number;
  conError: number;
  /** Quedó frenada por un error pasajero o porque todavía no tocaba reintentar. */
  frenada: boolean;
  sinConexion: boolean;
}

export interface OpcionesCola {
  ahora?: () => number;
  azar?: () => number;
  /** Para avisar a la pantalla a medida que sube. */
  alAvanzar?: (entrada: EntradaCola) => void;
}

export async function procesarCola(
  almacen: AlmacenCola,
  transporte: Transporte,
  { ahora = Date.now, azar = Math.random, alAvanzar }: OpcionesCola = {},
): Promise<ResultadoCola> {
  const resultado: ResultadoCola = { subidas: 0, conError: 0, frenada: false, sinConexion: false };
  const bloqueados = new Set<string>();

  for (const e of await almacen.listar()) {
    if (e.error !== null || e.grupos.some((g) => bloqueados.has(g))) {
      e.grupos.forEach((g) => bloqueados.add(g));
      continue;
    }
    if (e.proximoIntento > ahora()) {
      resultado.frenada = true;
      break;
    }
    try {
      await transporte.ejecutar(e.op);
      await almacen.quitar(e.seq, e.rev);
      resultado.subidas++;
      alAvanzar?.(e);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err);
      if (err instanceof ErrorPermanente) {
        await almacen.marcarError(e.seq, mensaje);
        e.grupos.forEach((g) => bloqueados.add(g));
        resultado.conError++;
        continue;
      }
      const intentos = e.intentos + 1;
      await almacen.reprogramar(e.seq, intentos, ahora() + esperaReintento(intentos, azar), mensaje);
      resultado.frenada = true;
      resultado.sinConexion = err instanceof ErrorSinConexion;
      break;
    }
  }
  return resultado;
}
