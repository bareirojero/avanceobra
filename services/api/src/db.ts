import pg from 'pg';
import { config } from './config.ts';

// Fechas y números como texto/número JS predecibles.
pg.types.setTypeParser(1082, (v) => v); // date → "AAAA-MM-DD"
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // numeric → number

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

export type Consulta = <T extends pg.QueryResultRow = any>(sql: string, params?: unknown[]) => Promise<T[]>;

/**
 * Corre fn en una transacción con el usuario declarado para RLS. Todo acceso
 * a datos de un usuario pasa por acá.
 */
export async function conUsuario<T>(usuarioId: string | null, fn: (q: Consulta) => Promise<T>): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query('begin');
    await cliente.query("select set_config('app.usuario_id', $1, true)", [usuarioId ?? '']);
    const q: Consulta = async (sql, params) => (await cliente.query(sql, params as any[])).rows;
    const resultado = await fn(q);
    await cliente.query('commit');
    return resultado;
  } catch (e) {
    await cliente.query('rollback').catch(() => {});
    throw e;
  } finally {
    cliente.release();
  }
}
