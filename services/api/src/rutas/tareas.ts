// Tareas programadas. No las llama un usuario sino el workflow
// .github/workflows/informe-automatico.yml, con la clave TAREAS_SECRETO.

import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../config.ts';
import { conUsuario, pool } from '../db.ts';
import { ErrorApi, noEncontrado } from '../errores.ts';
import { almacenPara, informes } from './informes.ts';

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function verificarClave(pedido: FastifyRequest) {
  if (!config.tareasSecreto) throw noEncontrado('Tarea'); // apagadas si no hay clave
  const dada = Buffer.from(pedido.headers.authorization?.replace(/^Bearer /i, '') ?? '');
  const esperada = Buffer.from(config.tareasSecreto);
  if (dada.length !== esperada.length || !timingSafeEqual(dada, esperada)) {
    throw new ErrorApi(401, 'no_autenticado', 'Clave de tareas inválida');
  }
}

interface Resultado {
  obra_id: string;
  fecha: string;
  informe_id?: string;
  estado: 'borrador' | 'error' | 'omitido';
  detalle?: string;
}

export async function rutasTareas(app: FastifyInstance) {
  /**
   * Genera el informe diario de cada obra activa que tiene fotos del día y no
   * tiene informe (o el que tiene falló). Queda como borrador, marcado automático,
   * para que el editor lo revise y lo publique.
   *
   * Sin fecha, toma "el día que termina": hasta el mediodía de Paraguay es ayer,
   * así sirve aunque GitHub dispare el workflow pasada la medianoche. Repasa
   * también el día anterior por si una noche la tarea no corrió.
   */
  app.post('/tareas/informes-diarios', async (pedido) => {
    verificarClave(pedido);
    const p = z.object({ fecha: fecha.optional() }).parse(pedido.body ?? {});
    const { rows } = await pool.query(
      `select d::date::text as dia from generate_series(
         coalesce($1::date, (now() at time zone 'America/Asuncion' - interval '12 hours')::date) - 1,
         coalesce($1::date, (now() at time zone 'America/Asuncion' - interval '12 hours')::date), '1 day') d`,
      [p.fecha ?? null],
    );
    const dias: string[] = rows.map((r) => r.dia);
    const m = await informes();
    const resultados: Resultado[] = [];

    for (const dia of dias) {
      const pendientes = (await pool.query(`select * from informes_pendientes($1)`, [dia])).rows as {
        obra_id: string;
        editor_id: string | null;
        informe_id: string | null;
      }[];
      // De a una obra: cada informe tarda (IA + fotos) y así no se pisan.
      for (const { obra_id, editor_id, informe_id } of pendientes) {
        if (!editor_id) {
          resultados.push({ obra_id, fecha: dia, estado: 'omitido', detalle: 'La obra no tiene editor activo' });
          continue;
        }
        try {
          const id = await conUsuario(editor_id, async (q) => {
            if (informe_id) {
              await q(
                `update informes set estado = 'generando', error = null, generado_por = usuario_actual(), automatico = true
                  where id = $1 and estado = 'error'`,
                [informe_id],
              );
              return informe_id;
            }
            const [nuevo] = await q(
              `insert into informes (obra_id, tipo, fecha_desde, fecha_hasta, estado, generado_por, automatico)
               values ($1, 'diario', $2, $2, 'generando', usuario_actual(), true) returning id`,
              [obra_id, dia],
            );
            return nuevo.id as string;
          });
          await m.generar(almacenPara(editor_id), id); // guarda el error en el informe si falla
          const [inf] = await conUsuario(editor_id, (q) => q(`select estado, error from informes where id = $1`, [id]));
          resultados.push({ obra_id, fecha: dia, informe_id: id, estado: inf.estado, detalle: inf.error ?? undefined });
        } catch (e) {
          // Por ejemplo, alguien lo armó a mano justo ahora (índice único).
          resultados.push({ obra_id, fecha: dia, estado: 'omitido', detalle: e instanceof Error ? e.message : String(e) });
        }
      }
    }
    app.log.info({ dias, resultados }, 'informes automáticos');
    return { dias, resultados };
  });
}
