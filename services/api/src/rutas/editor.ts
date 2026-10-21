// Panel del editor: obras, itemizado, sectores, usuarios, revisión del día.
// Los permisos los decide la base (RLS y funciones); acá solo se valida forma.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { autenticar } from '../auth.ts';
import { conUsuario } from '../db.ts';
import { noEncontrado } from '../errores.ts';

const uuid = z.string().uuid();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ObraParam = z.object({ obraId: uuid });
const IdParam = z.object({ id: uuid });
const rol = z.enum(['editor', 'campo', 'lector']);
const cargo = z.enum(['capataz', 'residente', 'jefe_obra', 'fiscal', 'cliente', 'otro']);

const ObraCampos = z
  .object({
    nombre: z.string().min(1).max(200),
    codigo: z.string().max(60).nullable(),
    sigla: z.string().max(10).nullable(),
    cliente: z.string().max(200).nullable(),
    direccion: z.string().max(300).nullable(),
    latitud: z.number().nullable(),
    longitud: z.number().nullable(),
    fecha_inicio: fecha.nullable(),
    fecha_fin_prevista: fecha.nullable(),
    estado: z.enum(['activa', 'pausada', 'terminada', 'archivada']),
    notas_para_informe: z.string().max(4000).nullable(),
  })
  .partial();

/** update dinámico con columnas de una lista blanca (las claves vienen de zod). */
function sets(campos: Record<string, unknown>, desde = 2) {
  const claves = Object.keys(campos).filter((k) => campos[k] !== undefined);
  return {
    sql: claves.map((k, i) => `${k} = $${i + desde}`).join(', '),
    valores: claves.map((k) => campos[k]),
    vacio: claves.length === 0,
  };
}

export async function rutasEditor(app: FastifyInstance) {
  app.addHook('preHandler', autenticar);
  const como = <T>(pedido: { sesion: { usuarioId: string } }, fn: Parameters<typeof conUsuario<T>>[1]) =>
    conUsuario(pedido.sesion.usuarioId, fn);

  // --- Obras ---

  app.post('/obras', async (pedido) => {
    const o = ObraCampos.extend({ nombre: z.string().min(1).max(200) }).parse(pedido.body);
    return como(pedido, async (q) => {
      const { sql, valores } = sets(o, 1);
      const cols = sql.split(', ').map((s) => s.split(' = ')[0]);
      const [obra] = await q(
        `insert into obras (organizacion_id, creado_por, ${cols.join(', ')})
         values (mi_organizacion(), usuario_actual(), ${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning *`,
        valores,
      );
      await q(`insert into obra_miembros (obra_id, usuario_id, rol, cargo) values ($1, usuario_actual(), 'editor', 'jefe_obra')`, [
        obra.id,
      ]);
      return obra;
    });
  });

  app.patch('/obras/:id', async (pedido) => {
    const { id } = IdParam.parse(pedido.params);
    const { sql, valores, vacio } = sets(ObraCampos.parse(pedido.body));
    return como(pedido, async (q) => {
      const [obra] = vacio
        ? await q(`select * from obras where id = $1`, [id])
        : await q(`update obras set ${sql} where id = $1 returning *`, [id, ...valores]);
      if (!obra) throw noEncontrado('Obra');
      return obra;
    });
  });

  // --- Itemizado ---

  app.get('/obras/:obraId/items', async (pedido) => {
    const { obraId } = ObraParam.parse(pedido.params);
    return como(pedido, (q) => q(`select * from items where obra_id = $1 and eliminado_en is null order by orden`, [obraId]));
  });

  app.post('/obras/:obraId/items/importar', { bodyLimit: 10 * 1024 * 1024 }, async (pedido) => {
    const { obraId } = ObraParam.parse(pedido.params);
    const { archivo_nombre, filas } = z
      .object({
        archivo_nombre: z.string().min(1).max(300),
        filas: z
          .array(
            z.object({
              codigo: z.string().min(1).max(60),
              descripcion: z.string().max(500),
              version: z.string().max(20).nullable().optional(),
              cantidad: z.number().nullable().optional(),
              unidad: z.string().max(20).nullable().optional(),
              inicio_previsto: fecha.nullable().optional(),
              fin_previsto: fecha.nullable().optional(),
            }),
          )
          .min(1)
          .max(20_000),
      })
      .parse(pedido.body);
    return como(pedido, async (q) => {
      const [{ id }] = await q(`select importar_items($1, $2, $3::jsonb) as id`, [obraId, archivo_nombre, JSON.stringify(filas)]);
      const [imp] = await q(`select * from importaciones_items where id = $1`, [id]);
      return imp;
    });
  });

  app.patch('/items/:id', async (pedido) => {
    const { id } = IdParam.parse(pedido.params);
    const c = z
      .object({ descripcion: z.string().min(1).max(500), inicio_previsto: fecha.nullable(), fin_previsto: fecha.nullable() })
      .partial()
      .parse(pedido.body);
    const { sql, valores, vacio } = sets(c);
    return como(pedido, async (q) => {
      const [item] = vacio
        ? await q(`select * from items where id = $1`, [id])
        : await q(`update items set ${sql} where id = $1 returning *`, [id, ...valores]);
      if (!item) throw noEncontrado('Ítem');
      return item;
    });
  });

  // --- Sectores ---

  const Sector = z.object({ nombre: z.string().min(1).max(120), padre_id: uuid.nullable().default(null), orden: z.number().int().default(0) });

  app.get('/obras/:obraId/sectores', async (pedido) => {
    const { obraId } = ObraParam.parse(pedido.params);
    return como(pedido, (q) => q(`select * from sectores where obra_id = $1 and eliminado_en is null order by orden, nombre`, [obraId]));
  });

  app.post('/obras/:obraId/sectores', async (pedido) => {
    const { obraId } = ObraParam.parse(pedido.params);
    const s = Sector.parse(pedido.body);
    return como(pedido, async (q) =>
      (await q(`insert into sectores (obra_id, nombre, padre_id, orden) values ($1, $2, $3, $4) returning *`, [obraId, s.nombre, s.padre_id, s.orden]))[0],
    );
  });

  app.patch('/sectores/:id', async (pedido) => {
    const { id } = IdParam.parse(pedido.params);
    const s = Sector.partial().extend({ eliminado: z.boolean().optional() }).parse(pedido.body);
    return como(pedido, async (q) => {
      const [sector] = await q(
        `update sectores set nombre = coalesce($2, nombre), padre_id = case when $5 then $3 else padre_id end,
                orden = coalesce($4, orden), eliminado_en = case when $6 then now() else eliminado_en end
          where id = $1 returning *`,
        [id, s.nombre ?? null, s.padre_id ?? null, s.orden ?? null, 'padre_id' in (pedido.body as object), s.eliminado === true],
      );
      if (!sector) throw noEncontrado('Sector');
      return sector;
    });
  });

  // --- Usuarios y miembros ---

  app.get('/usuarios', async (pedido) =>
    como(pedido, (q) =>
      q(`select u.id, u.organizacion_id, u.usuario, u.nombre, u.es_admin, u.activo, u.ultimo_ingreso, u.creado_en,
                u.actualizado_en,
                coalesce((select jsonb_agg(jsonb_build_object('obra_id', m.obra_id, 'rol', m.rol, 'cargo', m.cargo))
                            from obra_miembros m where m.usuario_id = u.id and m.eliminado_en is null), '[]') as obras
           from usuarios u order by u.nombre`),
    ),
  );

  app.post('/usuarios', async (pedido) => {
    const u = z
      .object({
        usuario: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/, 'Usá de 3 a 40 letras, números, punto, guion o guion bajo'),
        nombre: z.string().trim().min(1).max(120),
        clave: z.string().min(6).max(200),
        rol,
        obra_id: uuid,
        cargo: cargo.nullable().optional(),
      })
      .parse(pedido.body);
    return como(pedido, async (q) => {
      const [{ id }] = await q(`select crear_usuario($1, $2, $3, $4, $5, $6) as id`, [u.usuario, u.nombre, u.clave, u.rol, u.obra_id, u.cargo ?? null]);
      const [usuario] = await q(`select id, organizacion_id, usuario, nombre, es_admin, activo, ultimo_ingreso, creado_en, actualizado_en from usuarios where id = $1`, [id]);
      return usuario;
    });
  });

  app.patch('/usuarios/:id', async (pedido) => {
    const { id } = IdParam.parse(pedido.params);
    const c = z
      .object({ nombre: z.string().trim().min(1).max(120), activo: z.boolean(), clave: z.string().min(6).max(200) })
      .partial()
      .parse(pedido.body);
    return como(pedido, async (q) => {
      await q(`select actualizar_usuario($1, $2, $3, $4)`, [id, c.nombre ?? null, c.activo ?? null, c.clave ?? null]);
      const [usuario] = await q(`select id, organizacion_id, usuario, nombre, es_admin, activo, ultimo_ingreso, creado_en, actualizado_en from usuarios where id = $1`, [id]);
      return usuario;
    });
  });

  app.put('/obras/:obraId/miembros/:usuarioId', async (pedido) => {
    const { obraId, usuarioId } = z.object({ obraId: uuid, usuarioId: uuid }).parse(pedido.params);
    const m = z.object({ rol, cargo: cargo.nullable().default(null) }).parse(pedido.body);
    return como(pedido, async (q) => {
      const [miembro] = await q(
        `insert into obra_miembros (obra_id, usuario_id, rol, cargo) values ($1, $2, $3, $4)
         on conflict (obra_id, usuario_id) do update set rol = excluded.rol, cargo = excluded.cargo, eliminado_en = null
         returning *`,
        [obraId, usuarioId, m.rol, m.cargo],
      );
      // El rol Editor puede administrar usuarios (Rp 2).
      if (m.rol === 'editor') await q(`select actualizar_usuario($1, p_es_admin => true)`, [usuarioId]);
      return miembro;
    });
  });

  app.delete('/obras/:obraId/miembros/:usuarioId', async (pedido) => {
    const { obraId, usuarioId } = z.object({ obraId: uuid, usuarioId: uuid }).parse(pedido.params);
    return como(pedido, async (q) => {
      const [m] = await q(`update obra_miembros set eliminado_en = now() where obra_id = $1 and usuario_id = $2 returning *`, [obraId, usuarioId]);
      if (!m) throw noEncontrado('Miembro');
      return m;
    });
  });

  // --- Revisión del día ---

  app.get('/obras/:obraId/dia/:fecha', async (pedido) => {
    const p = z.object({ obraId: uuid, fecha }).parse(pedido.params);
    return como(pedido, async (q) => {
      const partes = await q(`select * from partes_diarios where obra_id = $1 and fecha = $2 and eliminado_en is null`, [p.obraId, p.fecha]);
      const fotos = await q(
        `select f.* from fotos f join partes_diarios p on p.id = f.parte_id
          where f.obra_id = $1 and p.fecha = $2 and f.eliminado_en is null order by f.tomada_en`,
        [p.obraId, p.fecha],
      );
      const anotaciones = await q(
        `select * from anotaciones where foto_id = any($1) and eliminado_en is null order by foto_id, numero`,
        [fotos.map((f) => f.id)],
      );
      const [registro] = await q(`select * from registros_dia where obra_id = $1 and fecha = $2`, [p.obraId, p.fecha]);
      const [informe] = await q(
        `select * from informes where obra_id = $1 and tipo = 'diario' and fecha_desde = $2 and eliminado_en is null`,
        [p.obraId, p.fecha],
      );
      return { fecha: p.fecha, partes, fotos, anotaciones, registro: registro ?? null, informe: informe ?? null };
    });
  });

  app.put('/obras/:obraId/dia/:fecha/registro', async (pedido) => {
    const p = z.object({ obraId: uuid, fecha }).parse(pedido.params);
    const r = z
      .object({
        clima: z.string().max(200).nullable().default(null),
        hubo_lluvia: z.boolean().nullable().default(null),
        personal: z.array(z.object({ oficio: z.string().min(1).max(60), cantidad: z.number().int().min(0), empresa: z.string().max(120).optional() })).default([]),
        observaciones: z.string().max(4000).nullable().default(null),
      })
      .parse(pedido.body);
    return como(pedido, async (q) =>
      (
        await q(
          `insert into registros_dia (obra_id, fecha, clima, hubo_lluvia, personal, observaciones, actualizado_por)
           values ($1, $2, $3, $4, $5, $6, usuario_actual())
           on conflict (obra_id, fecha) do update set clima = excluded.clima, hubo_lluvia = excluded.hubo_lluvia,
             personal = excluded.personal, observaciones = excluded.observaciones,
             actualizado_por = excluded.actualizado_por, eliminado_en = null
           returning *`,
          [p.obraId, p.fecha, r.clima, r.hubo_lluvia, JSON.stringify(r.personal), r.observaciones],
        )
      )[0],
    );
  });
}
