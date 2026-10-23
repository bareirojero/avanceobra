// Informes: la API guarda y da permisos; la redacción con IA y el PDF los hace
// el módulo services/informes (@registro-obra/informes), que recibe un Almacen.

import { numeroInforme, rutaInforme } from '@registro-obra/contrato';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { guardar, leer, urlLectura } from '../archivos.ts';
import { autenticar } from '../auth.ts';
import { conUsuario } from '../db.ts';
import { ErrorApi, noEncontrado } from '../errores.ts';

const uuid = z.string().uuid();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const IdParam = z.object({ id: uuid });

// Interfaz del módulo de informes (services/informes/src/servicio.ts).
interface ModuloInformes {
  generar(almacen: unknown, informe_id: string): Promise<void>;
  regenerar(almacen: unknown, informe_id: string, avance_id: string, indicacion?: string): Promise<unknown>;
  exportar(almacen: unknown, informe_id: string): Promise<string>;
}
const NOMBRE_MODULO = '@registro-obra/informes';
let modulo: Promise<ModuloInformes> | undefined;
export const informes = () => (modulo ??= import(NOMBRE_MODULO) as Promise<ModuloInformes>);

/** Almacen para el módulo de informes, actuando como el usuario indicado (RLS). */
export function almacenPara(usuarioId: string) {
  const q = <T = any>(sql: string, params?: unknown[]) => conUsuario(usuarioId, (c) => c<T & object>(sql, params));
  return {
    async datosDelDia(obra_id: string, dia: string) {
      return conUsuario(usuarioId, async (c) => {
        const [obra] = await c(`select id, codigo, nombre, direccion as ubicacion, notas_para_informe from obras where id = $1`, [obra_id]);
        if (!obra) throw noEncontrado('Obra');
        const usuarios = await c(
          `select u.id, u.nombre, m.cargo from obra_miembros m join usuarios u on u.id = m.usuario_id where m.obra_id = $1`,
          [obra_id],
        );
        const sectores = await c(`select id, nombre from sectores where obra_id = $1 and eliminado_en is null order by orden`, [obra_id]);
        const items = await c(
          `select id, padre_id, codigo, numero, descripcion, unidad, es_titulo, categoria,
                  case when inicio_previsto is null then null else $2::date between inicio_previsto and coalesce(fin_previsto, $2::date) end
                    as previsto_en_fecha
             from items where obra_id = $1 and eliminado_en is null order by orden`,
          [obra_id, dia],
        );
        const fotos = await c(
          `select f.id, f.autor_id, f.item_id, f.sector_id, f.tomada_en, f.archivo_path, f.comentario
             from fotos f join partes_diarios p on p.id = f.parte_id
            where f.obra_id = $1 and p.fecha = $2 and f.eliminado_en is null order by f.tomada_en`,
          [obra_id, dia],
        );
        const anotaciones = await c(
          `select id, foto_id, numero, tipo, geometria, color, comentario from anotaciones
            where foto_id = any($1) and eliminado_en is null order by foto_id, numero`,
          [fotos.map((f) => f.id)],
        );
        const [registro] = await c(`select * from registros_dia where obra_id = $1 and fecha = $2 and eliminado_en is null`, [obra_id, dia]);
        const [anterior] = await c(
          `select contenido->>'resumen' as resumen from informes
            where obra_id = $1 and tipo = 'diario' and fecha_desde < $2 and estado = 'publicado' and eliminado_en is null
            order by fecha_desde desc limit 1`,
          [obra_id, dia],
        );
        return {
          obra,
          fecha: dia,
          usuarios,
          sectores,
          items: items.map((i) => ({ ...i, previsto_en_fecha: i.previsto_en_fecha ?? undefined })),
          fotos: fotos.map((f) => ({ ...f, tomada_en: new Date(f.tomada_en).toISOString() })),
          anotaciones,
          clima: registro?.clima ? { descripcion: registro.clima, hubo_lluvia: registro.hubo_lluvia } : null,
          personal: registro?.personal ?? [],
          resumen_dia_anterior: anterior?.resumen ?? null,
        };
      });
    },
    leerFoto: (archivo_path: string) => leer(archivo_path),
    async informe(informe_id: string) {
      const [i] = await q(
        `select i.obra_id, i.fecha_desde as fecha, i.numero, o.sigla, i.contenido, u.nombre as revisado_por
           from informes i join obras o on o.id = i.obra_id left join usuarios u on u.id = i.publicado_por
          where i.id = $1`,
        [informe_id],
      );
      if (!i) throw noEncontrado('Informe');
      return { obra_id: i.obra_id, fecha: i.fecha, numero: numeroInforme(i.sigla, i.numero), contenido: i.contenido, revisado_por: i.revisado_por };
    },
    async guardarBorrador(informe_id: string, contenido: unknown, modelo: string | null) {
      await q(
        `update informes set contenido_ia = $2, contenido = $2, modelo_ia = $3, estado = 'borrador', error = null, pdf_path = null
          where id = $1`,
        [informe_id, JSON.stringify(contenido), modelo],
      );
      // Trazabilidad: qué fotos se usaron.
      await q(
        `insert into informe_fotos (informe_id, foto_id, incluida)
         select $1, f.id, f.id::text in (select jsonb_array_elements_text(a->'fuentes'->'foto_ids')
                                           from jsonb_array_elements($2::jsonb->'avances') a)
           from fotos f join partes_diarios p on p.id = f.parte_id join informes i on i.id = $1
          where f.obra_id = i.obra_id and p.fecha between i.fecha_desde and i.fecha_hasta and f.eliminado_en is null
         on conflict (informe_id, foto_id) do update set incluida = excluded.incluida`,
        [informe_id, JSON.stringify(contenido)],
      );
    },
    async guardarError(informe_id: string, mensaje: string) {
      await q(`update informes set estado = 'error', error = $2 where id = $1`, [informe_id, mensaje]);
    },
    async guardarContenido(informe_id: string, contenido: unknown) {
      await q(`update informes set contenido = $2, pdf_path = null where id = $1`, [informe_id, JSON.stringify(contenido)]);
    },
    async guardarPdf(informe_id: string, pdf: Buffer) {
      const [i] = await q(`select obra_id from informes where id = $1`, [informe_id]);
      const ruta = rutaInforme(i.obra_id, informe_id);
      await guardar(ruta, pdf, 'application/pdf');
      await q(`update informes set pdf_path = $2 where id = $1`, [informe_id, ruta]);
      return ruta;
    },
  };
}

const SIN_CONTENIDO = `id, obra_id, tipo, numero, fecha_desde, fecha_hasta, estado, version_esquema, modelo_ia, error, pdf_path,
  automatico, generado_por, publicado_por, publicado_en, creado_en, actualizado_en, eliminado_en`;

export async function rutasInformes(app: FastifyInstance) {
  app.addHook('preHandler', autenticar);

  app.get('/obras/:obraId/informes', async (pedido) => {
    const { obraId } = z.object({ obraId: uuid }).parse(pedido.params);
    return conUsuario(pedido.sesion.usuarioId, (q) =>
      q(`select ${SIN_CONTENIDO} from informes where obra_id = $1 and eliminado_en is null order by fecha_desde desc`, [obraId]),
    );
  });

  app.get('/informes/:id', async (pedido) => {
    const { id } = IdParam.parse(pedido.params);
    const [inf] = await conUsuario(pedido.sesion.usuarioId, (q) => q(`select * from informes where id = $1`, [id]));
    if (!inf) throw noEncontrado('Informe');
    return inf;
  });

  app.post('/informes/generar', async (pedido, respuesta) => {
    const p = z
      .object({
        obra_id: uuid,
        tipo: z.enum(['diario', 'semanal', 'mensual']).default('diario'),
        fecha_desde: fecha,
        fecha_hasta: fecha.optional(),
        forzar: z.boolean().default(false),
        avance_id: z.string().optional(),
        indicacion: z.string().max(2000).optional(),
      })
      .parse(pedido.body);
    if (p.tipo !== 'diario') throw new ErrorApi(422, 'datos_invalidos', 'Por ahora solo hay informes diarios');
    const hasta = p.fecha_hasta ?? p.fecha_desde;
    const usuarioId = pedido.sesion.usuarioId;

    const { id, existia } = await conUsuario(usuarioId, async (q) => {
      const [actual] = await q(
        `select id, estado from informes where obra_id = $1 and tipo = $2 and fecha_desde = $3 and fecha_hasta = $4
            and eliminado_en is null`,
        [p.obra_id, p.tipo, p.fecha_desde, hasta],
      );
      if (actual && (p.avance_id || !p.forzar)) return { id: actual.id as string, existia: true };
      if (actual) {
        await q(`update informes set estado = 'generando', error = null, generado_por = usuario_actual(), automatico = false,
                   publicado_por = null, publicado_en = null where id = $1`, [actual.id]);
        return { id: actual.id as string, existia: false };
      }
      const [nuevo] = await q(
        `insert into informes (obra_id, tipo, fecha_desde, fecha_hasta, estado, generado_por)
         values ($1, $2, $3, $4, 'generando', usuario_actual()) returning id`,
        [p.obra_id, p.tipo, p.fecha_desde, hasta],
      );
      return { id: nuevo.id as string, existia: false };
    });

    const m = await informes();
    if (p.avance_id) {
      await m.regenerar(almacenPara(usuarioId), id, p.avance_id, p.indicacion);
      return { informe_id: id };
    }
    if (existia) {
      return respuesta.status(409).send({
        error: { codigo: 'conflicto', mensaje: 'Ya existe un informe para ese día; usá forzar para regenerarlo' },
        informe_id: id,
      });
    }
    // En segundo plano: el panel consulta GET /informes/:id hasta que deja de estar "generando".
    m.generar(almacenPara(usuarioId), id).catch((e) => app.log.error(e));
    return respuesta.status(202).send({ informe_id: id });
  });

  app.patch('/informes/:id', async (pedido) => {
    const { id } = IdParam.parse(pedido.params);
    const { contenido } = z.object({ contenido: z.record(z.unknown()) }).parse(pedido.body);
    const [inf] = await conUsuario(pedido.sesion.usuarioId, (q) =>
      q(
        `update informes set contenido = $2, pdf_path = null,
                estado = case when estado = 'publicado' then 'borrador'::estado_informe else estado end,
                publicado_por = null, publicado_en = null
          where id = $1 and estado in ('borrador', 'publicado') returning *`,
        [id, JSON.stringify(contenido)],
      ),
    );
    if (!inf) throw new ErrorApi(409, 'conflicto', 'El informe no está listo para editar');
    return inf;
  });

  app.post('/informes/:id/publicar', async (pedido) => {
    const { id } = IdParam.parse(pedido.params);
    const usuarioId = pedido.sesion.usuarioId;
    const [inf] = await conUsuario(usuarioId, (q) =>
      q(
        `update informes set estado = 'publicado', publicado_por = usuario_actual(), publicado_en = now(), pdf_path = null
          where id = $1 and estado in ('borrador', 'publicado') and contenido is not null returning *`,
        [id],
      ),
    );
    if (!inf) throw new ErrorApi(409, 'conflicto', 'El informe no está listo para publicar');
    const m = await informes();
    m.exportar(almacenPara(usuarioId), id).catch((e) => app.log.error(e)); // PDF listo para descargar
    return inf;
  });

  app.get('/informes/:id/pdf', async (pedido, respuesta) => {
    const { id } = IdParam.parse(pedido.params);
    const usuarioId = pedido.sesion.usuarioId;
    const [inf] = await conUsuario(usuarioId, (q) =>
      q(
        `select id, pdf_path, contenido is not null as tiene, soy_editor(obra_id) as editor, estado, publicado_por
           from informes where id = $1`,
        [id],
      ),
    );
    if (!inf) throw noEncontrado('Informe');
    let ruta: string | null = inf.pdf_path;
    if (!ruta) {
      // Un lector solo ve informes publicados: su PDF se arma como quien lo publicó,
      // que puede guardarlo, así queda hecho para los demás.
      const actor = inf.editor ? usuarioId : inf.estado === 'publicado' ? inf.publicado_por : null;
      if (!inf.tiene || !actor) throw new ErrorApi(409, 'conflicto', 'El PDF todavía no está listo');
      ruta = await (await informes()).exportar(almacenPara(actor), id);
    }
    return respuesta.redirect((await urlLectura(ruta!)).url);
  });
}
