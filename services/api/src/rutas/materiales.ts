// Materiales: catálogo de la organización (Excel) y pedidos de obra.
// Campo pide desde la app; editor y solo lectura bajan los pedidos en Excel.

import { CODIGO_MATERIAL_NUEVO } from '@registro-obra/contrato';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { autenticar } from '../auth.ts';
import { conUsuario } from '../db.ts';
import { sinPermiso } from '../errores.ts';

const uuid = z.string().uuid();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// Fotos de referencia del pedido: pedidos/{obra}/{autor}/{foto}.jpg
export const RUTA_FOTO_PEDIDO = /^pedidos\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/[0-9a-f-]{36}\.jpg$/;

const Pedido = z.object({
  obra_id: uuid,
  material_id: uuid.nullable().optional(),
  material_texto: z.string().trim().max(300).nullable().optional(),
  unidad_texto: z.string().trim().max(20).nullable().optional(),
  item_id: uuid,
  cantidad: z.number().positive().max(1e12),
  necesario_para: fecha.nullable().optional(),
  pedido_en: z.string().datetime({ offset: true }),
  fotos: z.array(z.string().regex(RUTA_FOTO_PEDIDO)).max(5).default([]),
});

export async function rutasMateriales(app: FastifyInstance) {
  app.addHook('preHandler', autenticar);
  const como = <T>(pedido: { sesion: { usuarioId: string } }, fn: Parameters<typeof conUsuario<T>>[1]) =>
    conUsuario(pedido.sesion.usuarioId, fn);

  app.get('/materiales', async (pedido) =>
    como(pedido, (q) => q(`select * from materiales where eliminado_en is null order by orden`)),
  );

  app.post('/materiales/importar', { bodyLimit: 25 * 1024 * 1024 }, async (pedido) => {
    const { archivo_nombre, filas } = z
      .object({
        archivo_nombre: z.string().min(1).max(300),
        filas: z
          .array(
            z.object({
              codigo: z.string().min(1).max(60),
              descripcion: z.string().min(1).max(500),
              unidad: z.string().max(20).nullable().optional(),
            }),
          )
          .min(1)
          .max(100_000),
      })
      .parse(pedido.body);
    return como(pedido, async (q) => {
      const [{ id }] = await q(`select importar_materiales($1, $2::jsonb) as id`, [archivo_nombre, JSON.stringify(filas)]);
      const [imp] = await q(`select * from importaciones_materiales where id = $1`, [id]);
      return imp;
    });
  });

  // Upsert idempotente desde la cola del teléfono: el pedido no se edita, si ya llegó se devuelve.
  app.put('/pedidos/:id', async (pedido) => {
    const { id } = z.object({ id: uuid }).parse(pedido.params);
    const p = Pedido.parse(pedido.body);
    for (const ruta of p.fotos) {
      const [, obra, autor] = RUTA_FOTO_PEDIDO.exec(ruta)!;
      if (obra !== p.obra_id || autor !== pedido.sesion.usuarioId) throw sinPermiso('Foto de otra carpeta');
    }
    return como(pedido, async (q) => {
      const [nuevo] = await q(
        `insert into pedidos_materiales (id, obra_id, autor_id, material_id, material_texto, unidad_texto, item_id, cantidad,
                                         necesario_para, pedido_en, fotos)
         values ($1, $2, usuario_actual(), $3, $4, $5, $6, $7, $8, $9, $10) on conflict (id) do nothing returning *`,
        [
          id, p.obra_id, p.material_id ?? null, p.material_id ? null : (p.material_texto ?? null),
          p.material_id ? null : (p.unidad_texto || null), p.item_id, p.cantidad, p.necesario_para ?? null, p.pedido_en, p.fotos,
        ],
      );
      if (nuevo) return nuevo;
      const [existente] = await q(`select * from pedidos_materiales where id = $1`, [id]);
      if (!existente) throw sinPermiso();
      return existente;
    });
  });

  // Todos los pedidos de la obra con el código del material, para la planilla.
  app.get('/obras/:obraId/pedidos', async (pedido) => {
    const { obraId } = z.object({ obraId: uuid }).parse(pedido.params);
    return como(pedido, (q) =>
      q(
        `select p.*, u.nombre as autor_nombre,
                coalesce(m.codigo, $2) as material_codigo, coalesce(m.descripcion, p.material_texto) as material_descripcion,
                case when m.id is null then p.unidad_texto else m.unidad end as material_unidad,
                i.codigo as item_codigo, i.numero as item_numero, i.descripcion as item_descripcion
           from pedidos_materiales p
           join usuarios u on u.id = p.autor_id
           left join materiales m on m.id = p.material_id
           join items i on i.id = p.item_id
          where p.obra_id = $1 and p.eliminado_en is null
          order by p.pedido_en desc`,
        [obraId, CODIGO_MATERIAL_NUEVO],
      ),
    );
  });
}
