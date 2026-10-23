import type { OperacionPendiente } from '@registro-obra/contrato';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { AlmacenCola, EntradaCola } from '@/domain/cola';

import { db, enTransaccion } from './db';

interface FilaCola {
  seq: number;
  op: string;
  grupos: string;
  intentos: number;
  proximo_intento: number;
  rev: number;
  error: string | null;
}

/** Encola subir un archivo. Se llama dentro de la misma transacción que guarda la fila. */
export async function encolarArchivo(tx: SQLiteDatabase, op: Extract<OperacionPendiente, { tipo: 'subir_archivo' }>, grupos: string[]) {
  await tx.runAsync(
    'INSERT INTO cola_salida (op, tipo, tabla, fila_id, grupos) VALUES (?, ?, NULL, ?, ?)',
    JSON.stringify(op),
    op.tipo,
    op.id,
    JSON.stringify(grupos),
  );
}

export type Recurso = Extract<OperacionPendiente, { tipo: 'upsert' }>['recurso'];

/** Tabla local de cada recurso de la API. */
export const TABLA_DE: Record<Recurso, string> = {
  partes: 'partes_diarios', fotos: 'fotos', anotaciones: 'anotaciones', pedidos: 'pedidos_materiales',
};

/**
 * Encola el upsert de una fila. Si ya hay uno esperando para la misma fila, le cambia
 * los datos en su lugar (y sube `rev`) en vez de agregar otro al final: así se sube una
 * sola vez y no pierde su posición respecto de lo que depende de ella.
 */
export async function encolarUpsert(
  tx: SQLiteDatabase,
  recurso: Recurso,
  id: string,
  fila: Record<string, unknown>,
  grupos: string[],
) {
  const tabla = TABLA_DE[recurso];
  const op: OperacionPendiente = { tipo: 'upsert', id, recurso, fila };
  const existente = await tx.getFirstAsync<{ seq: number }>(
    "SELECT seq FROM cola_salida WHERE tipo = 'upsert' AND tabla = ? AND fila_id = ? AND error IS NULL",
    tabla,
    id,
  );
  if (existente) {
    await tx.runAsync('UPDATE cola_salida SET op = ?, rev = rev + 1 WHERE seq = ?', JSON.stringify(op), existente.seq);
  } else {
    await tx.runAsync(
      'INSERT INTO cola_salida (op, tipo, tabla, fila_id, grupos) VALUES (?, ?, ?, ?, ?)',
      JSON.stringify(op),
      op.tipo,
      tabla,
      id,
      JSON.stringify(grupos),
    );
  }
  await tx.runAsync(`UPDATE ${tabla} SET _pendiente = 1 WHERE id = ?`, id);
}

export const almacenCola: AlmacenCola = {
  async listar(): Promise<EntradaCola[]> {
    const filas = await (await db()).getAllAsync<FilaCola>(
      'SELECT seq, op, grupos, intentos, proximo_intento, rev, error FROM cola_salida ORDER BY seq',
    );
    return filas.map((f) => ({
      seq: f.seq,
      op: JSON.parse(f.op),
      grupos: JSON.parse(f.grupos),
      intentos: f.intentos,
      proximoIntento: f.proximo_intento,
      rev: f.rev,
      error: f.error,
    }));
  },

  async quitar(seq, rev) {
    await enTransaccion(async (tx) => {
      const fila = await tx.getFirstAsync<{ tabla: string | null; fila_id: string }>(
        'SELECT tabla, fila_id FROM cola_salida WHERE seq = ? AND rev = ?',
        seq,
        rev,
      );
      if (!fila) return; // Cambió mientras se subía: queda para la próxima pasada.
      await tx.runAsync('DELETE FROM cola_salida WHERE seq = ?', seq);
      if (fila.tabla) {
        const quedan = await tx.getFirstAsync<{ n: number }>(
          'SELECT COUNT(*) AS n FROM cola_salida WHERE tabla = ? AND fila_id = ?',
          fila.tabla,
          fila.fila_id,
        );
        if (!quedan?.n) await tx.runAsync(`UPDATE ${fila.tabla} SET _pendiente = 0 WHERE id = ?`, fila.fila_id);
      }
    });
  },

  async reprogramar(seq, intentos, proximoIntento, error) {
    await (await db()).runAsync(
      'UPDATE cola_salida SET intentos = ?, proximo_intento = ?, ultimo_error = ? WHERE seq = ?',
      intentos,
      proximoIntento,
      error,
      seq,
    );
  },

  async marcarError(seq, error) {
    await (await db()).runAsync('UPDATE cola_salida SET error = ?, ultimo_error = ? WHERE seq = ?', error, error, seq);
  },
};

/** "Tocá para reintentar": vuelve a poner en la cola lo que había fallado de estos grupos. */
export async function reintentarGrupo(grupo: string) {
  await (await db()).runAsync(
    `UPDATE cola_salida SET error = NULL, intentos = 0, proximo_intento = 0
      WHERE grupos LIKE ? AND error IS NOT NULL`,
    `%"${grupo}"%`,
  );
}

/** Además del reintento manual, cualquier pasada nueva arranca sin esperar el backoff. */
export async function adelantarReintentos() {
  await (await db()).runAsync('UPDATE cola_salida SET proximo_intento = 0 WHERE error IS NULL');
}
