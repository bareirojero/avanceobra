import { SOLAPE_CURSOR_MS, type PedidoMaterial, type SyncRespuesta } from '@registro-obra/contrato';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import type { SQLiteDatabase } from 'expo-sqlite';
import { AppState } from 'react-native';

import { procesarCola } from '@/domain/cola';

import { alVencerSesion } from './backend-api';
import { backend, type Fila } from './backend';
import { almacenCola } from './cola-local';
import { enTransaccion, guardarAjuste, leerAjuste } from './db';
import { resumenEnvios, type ResumenEnvios } from './repositorio';

/**
 * Motor de sincronización (ARQUITECTURA §6). Corre solo: al abrir la app, al volver a
 * primer plano, cuando vuelve la señal, unos segundos después de guardar algo, cada pocos
 * minutos con la app abierta y en segundo plano. Nunca bloquea la pantalla.
 */

export interface EstadoSync {
  enviando: boolean;
  /** No hay red, o hay solo datos móviles con "Enviar solo con Wi-Fi". */
  sinSenal: boolean;
  soloWifi: boolean;
  /** Hay que volver a escribir la contraseña para seguir enviando (lo cargado no se pierde). */
  sesionVencida: boolean;
  resumen: ResumenEnvios;
  ultimaVez: number | null;
}

let estado: EstadoSync = {
  enviando: false,
  sinSenal: false,
  soloWifi: false,
  sesionVencida: false,
  resumen: { fotosEsperando: 0, fotosConError: 0, operaciones: 0 },
  ultimaVez: null,
};
const oyentes = new Set<(e: EstadoSync) => void>();

function publicar(cambios: Partial<EstadoSync>) {
  estado = { ...estado, ...cambios };
  oyentes.forEach((o) => o(estado));
}

export function estadoSync() {
  return estado;
}

export function escucharSync(oyente: (e: EstadoSync) => void) {
  oyentes.add(oyente);
  return () => void oyentes.delete(oyente);
}

/** Actualiza contadores sin ir a la red (después de guardar, por ejemplo). */
alVencerSesion(() => publicar({ sesionVencida: true }));

/** Después de volver a ingresar con la contraseña. */
export function sesionRenovada() {
  publicar({ sesionVencida: false });
  sincronizarPronto(200);
}

export async function refrescarResumen() {
  publicar({ resumen: await resumenEnvios() });
}

function redUsable(red: NetInfoState, soloWifi: boolean) {
  if (red.isConnected === false || red.isInternetReachable === false) return false;
  return !soloWifi || red.type === 'wifi' || red.type === 'ethernet';
}

let enCurso: Promise<void> | null = null;

/** Sube la cola y baja novedades. Si ya está corriendo, devuelve la misma corrida. */
export function sincronizar(): Promise<void> {
  enCurso ??= correr().finally(() => {
    enCurso = null;
  });
  return enCurso;
}

async function correr() {
  const red = await NetInfo.fetch();
  if (!redUsable(red, estado.soloWifi)) {
    publicar({ sinSenal: true, resumen: await resumenEnvios() });
    return;
  }
  publicar({ enviando: true, sinSenal: false });
  try {
    const r = await procesarCola(almacenCola, backend().transporte, {
      alAvanzar: () => void refrescarResumen(),
    });
    publicar({ sinSenal: r.sinConexion });
    if (!r.sinConexion) await bajarNovedades();
    publicar({ ultimaVez: Date.now() });
  } catch (e) {
    // Un error de bajada no es grave: se reintenta en la próxima pasada.
    console.warn('Sincronización', e);
  } finally {
    publicar({ enviando: false, resumen: await resumenEnvios() });
  }
}

// ---------------------------------------------------------------------------
// Bajada: obras del usuario (GET /yo) y novedades de cada obra por cursor (GET /sync)
// ---------------------------------------------------------------------------

/** Cómo se guarda cada tabla que llega en la respuesta de /sync. */
interface Destino {
  tabla: string;
  clave: string[];
  /**
   * Referencia (obras, ítems...): lo borrado en el servidor se borra del teléfono. En la
   * carga de campo lo borrado se conserva marcado, porque el número de una marca borrada
   * no se puede volver a usar en esa foto.
   */
  referencia: boolean;
}
const ID = ['id'];
const DESTINOS = {
  obras: { tabla: 'obras', clave: ID, referencia: true },
  miembros: { tabla: 'obra_miembros', clave: ['obra_id', 'usuario_id'], referencia: true },
  perfiles: { tabla: 'perfiles', clave: ID, referencia: true },
  items: { tabla: 'items', clave: ID, referencia: true },
  partes: { tabla: 'partes_diarios', clave: ID, referencia: false },
  fotos: { tabla: 'fotos', clave: ID, referencia: false },
  anotaciones: { tabla: 'anotaciones', clave: ID, referencia: false },
} satisfies Record<string, Destino>;

const CON_PENDIENTE = new Set(['partes_diarios', 'fotos', 'anotaciones']);
const JSON_COLUMNAS = new Set(['geometria']);
const columnasLocales = new Map<string, Set<string>>();

async function columnas(tx: SQLiteDatabase, tabla: string) {
  let c = columnasLocales.get(tabla);
  if (!c) {
    const info = await tx.getAllAsync<{ name: string }>(`PRAGMA table_info(${tabla})`);
    c = new Set(info.map((i) => i.name).filter((n) => !n.startsWith('_') && !n.endsWith('_local')));
    columnasLocales.set(tabla, c);
  }
  return c;
}

/** Upsert de filas del servidor en su tabla local, sin pisar lo que el teléfono no subió todavía. */
async function guardarFilas(tx: SQLiteDatabase, { tabla, clave, referencia }: Destino, filas: readonly object[]) {
  const cols = await columnas(tx, tabla);
  for (const fila of filas as Fila[]) {
    const donde = clave.map((k) => `${k} = ?`).join(' AND ');
    const valoresClave = clave.map((k) => fila[k] as string);

    if (fila.eliminado_en && referencia) {
      await tx.runAsync(`DELETE FROM ${tabla} WHERE ${donde}`, ...valoresClave);
      continue;
    }
    if (CON_PENDIENTE.has(tabla)) {
      const local = await tx.getFirstAsync<{ _pendiente: number }>(`SELECT _pendiente FROM ${tabla} WHERE ${donde}`, ...valoresClave);
      if (local?._pendiente) continue;
    }
    const nombres = Object.keys(fila).filter((k) => cols.has(k));
    const valores = nombres.map((k) => {
      const v = fila[k];
      if (JSON_COLUMNAS.has(k)) return JSON.stringify(v);
      if (typeof v === 'boolean') return v ? 1 : 0;
      return (v ?? null) as string | number | null;
    });
    const actualizar = nombres.filter((n) => !clave.includes(n)).map((n) => `${n} = excluded.${n}`);
    await tx.runAsync(
      `INSERT INTO ${tabla} (${nombres.join(', ')}) VALUES (${nombres.map(() => '?').join(', ')})
       ON CONFLICT (${clave.join(', ')}) DO ${actualizar.length ? `UPDATE SET ${actualizar.join(', ')}` : 'NOTHING'}`,
      ...valores,
    );
  }
}

/**
 * El catálogo de materiales puede tener miles de filas: se guarda de a 100 por sentencia
 * para no tener la base bloqueada mucho tiempo (mientras tanto no se puede guardar nada).
 */
async function guardarMateriales(tx: SQLiteDatabase, filas: SyncRespuesta['materiales']) {
  const borrados = filas.filter((m) => m.eliminado_en).map((m) => m.id);
  const vigentes = filas.filter((m) => !m.eliminado_en);
  for (let i = 0; i < borrados.length; i += 500) {
    const parte = borrados.slice(i, i + 500);
    await tx.runAsync(`DELETE FROM materiales WHERE id IN (${parte.map(() => '?').join(', ')})`, ...parte);
  }
  for (let i = 0; i < vigentes.length; i += 100) {
    const parte = vigentes.slice(i, i + 100);
    await tx.runAsync(
      `INSERT OR REPLACE INTO materiales (id, descripcion, unidad, orden, creado_en, actualizado_en, eliminado_en)
       VALUES ${parte.map(() => '(?, ?, ?, ?, ?, ?, NULL)').join(', ')}`,
      ...parte.flatMap((m) => [m.id, m.descripcion, m.unidad, m.orden, m.creado_en, m.actualizado_en]),
    );
  }
}

export async function bajarNovedades() {
  const yo = await backend().yo();
  const ids = yo.obras.map((o) => o.obra.id);

  // Obras y rol del usuario. Si lo sacaron de una obra, la obra desaparece del teléfono.
  await enTransaccion(async (tx) => {
    await guardarFilas(tx, DESTINOS.perfiles, [{ id: yo.usuario.id, nombre: yo.usuario.nombre, usuario: yo.usuario.usuario }]);
    await guardarFilas(tx, DESTINOS.obras, yo.obras.map((o) => o.obra));
    await guardarFilas(tx, DESTINOS.miembros, yo.obras.map((o) => ({
      obra_id: o.obra.id, usuario_id: yo.usuario.id, rol: o.rol, cargo: o.cargo, eliminado_en: null,
    })));
    await tx.runAsync(
      `DELETE FROM obra_miembros WHERE usuario_id = ? AND obra_id NOT IN (${ids.map(() => '?').join(', ') || "''"})`,
      yo.usuario.id, ...ids,
    );
  });

  for (const { obra, rol } of yo.obras) {
    if (rol === 'lector') continue; // Solo lectura no usa la app de campo.
    const cursor = await leerAjuste(`cursor.${obra.id}`);
    const desde = cursor ? new Date(new Date(cursor).getTime() - SOLAPE_CURSOR_MS).toISOString() : null;
    const r = await backend().novedades(obra.id, desde);
    await enTransaccion(async (tx) => {
      await guardarFilas(tx, DESTINOS.obras, [r.obra]);
      await guardarFilas(tx, DESTINOS.perfiles, r.miembros.map((m) => ({ id: m.usuario_id, nombre: m.nombre, usuario: m.usuario })));
      await guardarFilas(tx, DESTINOS.miembros, r.miembros);
      await guardarFilas(tx, DESTINOS.items, r.items);
      await guardarFilas(tx, DESTINOS.partes, r.partes);
      await guardarFilas(tx, DESTINOS.fotos, r.fotos);
      await guardarFilas(tx, DESTINOS.anotaciones, r.anotaciones);
      // Una API anterior al módulo de materiales no los manda.
      await guardarMateriales(tx, r.materiales ?? []);
    });
    await guardarAjuste(`cursor.${obra.id}`, r.hasta);
    await bajarMisPedidos(obra.id);
  }
}

/**
 * Mis pedidos de materiales con su estado, de todas las fechas (también los hechos desde
 * otro teléfono). Va con su propio cursor, aparte de la bajada de fotos: si falla (o la
 * API todavía no tiene la ruta) no frena nada y se reintenta en la próxima pasada.
 */
async function bajarMisPedidos(obraId: string) {
  try {
    const clave = `cursor_pedidos.${obraId}`;
    const cursor = await leerAjuste(clave);
    const desde = cursor ? new Date(new Date(cursor).getTime() - SOLAPE_CURSOR_MS).toISOString() : null;
    const r = await backend().misPedidos(obraId, desde);
    if (r.pedidos.length) await enTransaccion((tx) => guardarPedidos(tx, r.pedidos));
    await guardarAjuste(clave, r.hasta);
  } catch (e) {
    console.warn('Pedidos de materiales', e);
  }
}

/** El pedido no se edita en el teléfono: lo del servidor (con el estado) manda. */
async function guardarPedidos(tx: SQLiteDatabase, pedidos: PedidoMaterial[]) {
  for (const p of pedidos) {
    await tx.runAsync(
      `INSERT INTO pedidos_materiales (id, obra_id, autor_id, material_id, material_texto, unidad_texto, item_id, cantidad,
         necesario_para, pedido_en, fotos, estado, estado_cambiado_en, creado_en, actualizado_en, eliminado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET estado = excluded.estado, estado_cambiado_en = excluded.estado_cambiado_en,
         actualizado_en = excluded.actualizado_en, eliminado_en = excluded.eliminado_en`,
      p.id, p.obra_id, p.autor_id, p.material_id, p.material_texto, p.unidad_texto, p.item_id, Number(p.cantidad),
      p.necesario_para, p.pedido_en, JSON.stringify(p.fotos ?? []), p.estado ?? 'enviado', p.estado_cambiado_en,
      p.creado_en, p.actualizado_en, p.eliminado_en,
    );
  }
}

// ---------------------------------------------------------------------------
// Disparadores
// ---------------------------------------------------------------------------

const TAREA_FONDO = 'avance-obra-sincronizar';
const CADA_MS = 3 * 60_000;

TaskManager.defineTask(TAREA_FONDO, async () => {
  try {
    await sincronizar();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

let iniciado = false;
let pronto: ReturnType<typeof setTimeout> | null = null;

/** Pide una pasada en unos segundos (agrupa varios guardados seguidos). */
export function sincronizarPronto(ms = 1500) {
  if (pronto) clearTimeout(pronto);
  pronto = setTimeout(() => {
    pronto = null;
    void sincronizar();
  }, ms);
}

export async function iniciarSincronizacion() {
  if (iniciado) return;
  iniciado = true;
  publicar({ soloWifi: (await leerAjuste('solo_wifi')) === '1', resumen: await resumenEnvios() });

  let estabaSinRed = false;
  NetInfo.addEventListener((red) => {
    const usable = redUsable(red, estado.soloWifi);
    if (usable && estabaSinRed) sincronizarPronto(500);
    estabaSinRed = !usable;
    publicar({ sinSenal: !usable });
  });
  AppState.addEventListener('change', (s) => {
    if (s === 'active') sincronizarPronto(300);
  });
  setInterval(() => {
    if (AppState.currentState === 'active') void sincronizar();
  }, CADA_MS);

  try {
    await BackgroundTask.registerTaskAsync(TAREA_FONDO, { minimumInterval: 15 });
  } catch (e) {
    console.warn('No se pudo registrar la sincronización en segundo plano', e);
  }
  void sincronizar();
}

export async function cambiarSoloWifi(valor: boolean) {
  await guardarAjuste('solo_wifi', valor ? '1' : '0');
  publicar({ soloWifi: valor });
  sincronizarPronto(200);
}
