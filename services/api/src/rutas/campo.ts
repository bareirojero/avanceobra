// Lo que usa la app de campo: perfil, sincronización, subidas y archivos.
// El panel usa los mismos endpoints para fotos subidas desde la web.

import { DIAS_HISTORIA_EN_TELEFONO, type Yo } from '@registro-obra/contrato';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { urlLectura, urlSubida } from '../archivos.ts';
import { autenticar } from '../auth.ts';
import { conUsuario, type Consulta } from '../db.ts';
import { noEncontrado, sinPermiso } from '../errores.ts';

const uuid = z.string().uuid();
const instante = z.string().datetime({ offset: true });
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const IdParam = z.object({ id: uuid });

export async function yo(usuarioId: string): Promise<Yo> {
  return conUsuario(usuarioId, async (q) => {
    const [usuario] = await q(
      `select id, organizacion_id, usuario, nombre, es_admin, activo, ultimo_ingreso, creado_en, actualizado_en
         from usuarios where id = usuario_actual()`,
    );
    const obras = await q(
      `select to_jsonb(o) as obra, mi_rol_en(o.id) as rol,
              (select cargo from obra_miembros m where m.obra_id = o.id and m.usuario_id = usuario_actual()
                 and m.eliminado_en is null) as cargo
         from obras o where o.eliminado_en is null order by o.nombre`,
    );
    return { usuario, obras };
  });
}

/** Ejecuta un upsert respetando RLS: update si existe y se puede; si no, insert. */
async function upsert(q: Consulta, actualizar: [string, unknown[]], insertar: [string, unknown[]]) {
  const [act] = await q(...actualizar);
  if (act) return act;
  const [nueva] = await q(...insertar);
  if (nueva) return nueva;
  throw sinPermiso('No podés modificar esto (solo el mismo día en que lo cargaste)');
}

const Parte = z.object({ obra_id: uuid, fecha, notas: z.string().max(4000).nullable().optional() });

const Foto = z.object({
  parte_id: uuid,
  obra_id: uuid,
  item_id: uuid,
  sector_id: uuid.nullable().optional(),
  origen: z.enum(['app', 'web']).default('app'),
  tomada_en: instante,
  latitud: z.number().nullable().optional(),
  longitud: z.number().nullable().optional(),
  archivo_path: z.string(),
  miniatura_path: z.string(),
  ancho: z.number().int().nullable().optional(),
  alto: z.number().int().nullable().optional(),
  comentario: z.string().max(4000).nullable().optional(),
  orden: z.number().int().default(0),
  eliminado_en: instante.nullable().optional(),
});

const Anotacion = z.object({
  foto_id: uuid,
  obra_id: uuid,
  numero: z.number().int().min(1),
  tipo: z.enum(['punto', 'circulo', 'rectangulo', 'flecha', 'trazo']),
  geometria: z.record(z.unknown()),
  color: z.string().max(20).default('#FFC20E'),
  comentario: z.string().max(2000).nullable().optional(),
  eliminado_en: instante.nullable().optional(),
});

const RUTA_FOTO = /^fotos\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/[0-9a-f-]{36}(_mini)?\.jpg$/;

export async function rutasCampo(app: FastifyInstance) {
  app.addHook('preHandler', autenticar);

  app.get('/yo', async (pedido) => yo(pedido.sesion.usuarioId));

  app.get('/obras/:obraId/sync', async (pedido) => {
    const { obraId } = z.object({ obraId: uuid }).parse(pedido.params);
    const { desde } = z.object({ desde: instante.optional() }).parse(pedido.query);
    const d = desde ?? '1970-01-01T00:00:00Z';
    return conUsuario(pedido.sesion.usuarioId, async (q) => {
      const [{ hasta }] = await q(`select now() as hasta`);
      const [obra] = await q(`select * from obras where id = $1`, [obraId]);
      if (!obra) throw noEncontrado('Obra');
      const desdeCarga = `hoy_py() - ${DIAS_HISTORIA_EN_TELEFONO}`;
      const [miembros, sectores, items, partes, fotos, anotaciones, registros_dia, materiales] = await Promise.all([
        q(
          `select m.*, u.nombre, u.usuario from obra_miembros m join usuarios u on u.id = m.usuario_id
            where m.obra_id = $1 and (m.actualizado_en > $2 or u.actualizado_en > $2)`,
          [obraId, d],
        ),
        q(`select * from sectores where obra_id = $1 and actualizado_en > $2 order by orden`, [obraId, d]),
        q(`select * from items where obra_id = $1 and actualizado_en > $2 order by orden`, [obraId, d]),
        q(
          `select * from partes_diarios where obra_id = $1 and actualizado_en > $2 and fecha >= ${desdeCarga}`,
          [obraId, d],
        ),
        q(
          `select f.* from fotos f join partes_diarios p on p.id = f.parte_id
            where f.obra_id = $1 and f.actualizado_en > $2 and p.fecha >= ${desdeCarga}`,
          [obraId, d],
        ),
        q(
          `select a.* from anotaciones a join fotos f on f.id = a.foto_id join partes_diarios p on p.id = f.parte_id
            where a.obra_id = $1 and a.actualizado_en > $2 and p.fecha >= ${desdeCarga}`,
          [obraId, d],
        ),
        q(`select * from registros_dia where obra_id = $1 and actualizado_en > $2 and fecha >= ${desdeCarga}`, [
          obraId,
          d,
        ]),
        // Catálogo de la organización, sin el código (campo no lo ve).
        q(
          `select id, descripcion, unidad, orden, creado_en, actualizado_en, eliminado_en from materiales
            where organizacion_id = $1 and actualizado_en > $2 order by orden`,
          [obra.organizacion_id, d],
        ),
      ]);
      return { hasta, obra, miembros, sectores, items, partes, fotos, anotaciones, registros_dia, materiales };
    });
  });

  app.put('/partes/:id', async (pedido) => {
    const { id } = IdParam.parse(pedido.params);
    const p = Parte.parse(pedido.body);
    return conUsuario(pedido.sesion.usuarioId, (q) =>
      upsert(
        q,
        [`update partes_diarios set notas = $2 where id = $1 returning *`, [id, p.notas ?? null]],
        [
          `insert into partes_diarios (id, obra_id, autor_id, fecha, notas)
           values ($1, $2, usuario_actual(), $3, $4) on conflict (id) do nothing returning *`,
          [id, p.obra_id, p.fecha, p.notas ?? null],
        ],
      ),
    );
  });

  app.put('/fotos/:id', async (pedido) => {
    const { id } = IdParam.parse(pedido.params);
    const f = Foto.parse(pedido.body);
    return conUsuario(pedido.sesion.usuarioId, (q) =>
      upsert(
        q,
        [
          `update fotos set item_id = $2, sector_id = $3, comentario = $4, orden = $5, eliminado_en = $6
            where id = $1 returning *`,
          [id, f.item_id, f.sector_id ?? null, f.comentario ?? null, f.orden, f.eliminado_en ?? null],
        ],
        [
          `insert into fotos (id, parte_id, obra_id, autor_id, item_id, sector_id, origen, tomada_en, latitud,
                              longitud, archivo_path, miniatura_path, ancho, alto, comentario, orden, eliminado_en)
           values ($1, $2, $3, usuario_actual(), $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           on conflict (id) do nothing returning *`,
          [
            id, f.parte_id, f.obra_id, f.item_id, f.sector_id ?? null, f.origen, f.tomada_en, f.latitud ?? null,
            f.longitud ?? null, f.archivo_path, f.miniatura_path, f.ancho ?? null, f.alto ?? null,
            f.comentario ?? null, f.orden, f.eliminado_en ?? null,
          ],
        ],
      ),
    );
  });

  app.put('/anotaciones/:id', async (pedido) => {
    const { id } = IdParam.parse(pedido.params);
    const a = Anotacion.parse(pedido.body);
    return conUsuario(pedido.sesion.usuarioId, (q) =>
      upsert(
        q,
        [
          `update anotaciones set tipo = $2, geometria = $3, color = $4, comentario = $5, eliminado_en = $6
            where id = $1 returning *`,
          [id, a.tipo, a.geometria, a.color, a.comentario ?? null, a.eliminado_en ?? null],
        ],
        [
          `insert into anotaciones (id, foto_id, obra_id, autor_id, numero, tipo, geometria, color, comentario,
                                    eliminado_en)
           values ($1, $2, $3, usuario_actual(), $4, $5, $6, $7, $8, $9) on conflict (id) do nothing returning *`,
          [id, a.foto_id, a.obra_id, a.numero, a.tipo, a.geometria, a.color, a.comentario ?? null,
            a.eliminado_en ?? null],
        ],
      ),
    );
  });

  // URL firmada para subir una foto o su miniatura a la carpeta propia.
  app.post('/archivos/subida', async (pedido) => {
    const { ruta } = z.object({ ruta: z.string(), content_type: z.literal('image/jpeg') }).parse(pedido.body);
    const m = RUTA_FOTO.exec(ruta);
    if (!m || m[2] !== pedido.sesion.usuarioId) throw sinPermiso('Solo podés subir a tu carpeta');
    const [{ ok }] = await conUsuario(pedido.sesion.usuarioId, (q) =>
      q(`select puedo_cargar($1) as ok`, [m[1]]),
    );
    if (!ok) throw sinPermiso();
    const { url, vence, encabezados } = await urlSubida(ruta);
    return {
      url,
      metodo: 'PUT',
      encabezados,
      vence_en: vence.toISOString(),
    };
  });

  // URLs firmadas de lectura: fotos para quien carga en la obra; PDFs según el informe.
  app.post('/archivos/ver', async (pedido) => {
    const { rutas } = z.object({ rutas: z.array(z.string()).max(500) }).parse(pedido.body);
    const permitidas = await conUsuario(pedido.sesion.usuarioId, async (q) => {
      const [fotos, informes] = await Promise.all([
        q<{ ruta: string }>(
          `select r as ruta from unnest($1::text[]) r
            where exists (select 1 from fotos f where f.archivo_path = r or f.miniatura_path = r)`,
          [rutas],
        ),
        q<{ ruta: string }>(`select pdf_path as ruta from informes where pdf_path = any($1)`, [rutas]),
      ]);
      return new Set([...fotos, ...informes].map((r) => r.ruta));
    });
    const urls: Record<string, string> = {};
    for (const r of rutas) if (permitidas.has(r)) urls[r] = (await urlLectura(r)).url;
    return { urls };
  });
}
