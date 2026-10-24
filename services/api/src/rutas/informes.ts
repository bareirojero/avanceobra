// Informes: la API guarda y da permisos; la redacción con IA y el PDF los hace
// el módulo services/informes (@registro-obra/informes), que recibe un Almacen.

import { codigoRevision, numeroInforme, rutaBorradorInforme, rutaRevision } from '@registro-obra/contrato';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { guardar, leer, urlLectura } from '../archivos.ts';
import { autenticar } from '../auth.ts';
import { conUsuario } from '../db.ts';
import { ErrorApi, noEncontrado, sinPermiso } from '../errores.ts';

const uuid = z.string().uuid();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const IdParam = z.object({ id: uuid });

// Interfaz del módulo de informes (services/informes/src/servicio.ts).
interface ModuloInformes {
  generar(almacen: unknown, informe_id: string): Promise<void>;
  regenerar(almacen: unknown, informe_id: string, avance_id: string, indicacion?: string): Promise<unknown>;
  exportar(almacen: unknown, informe_id: string): Promise<string>;
  armarPdf(leerFoto: unknown, contenido: unknown, datos: unknown, opciones: { numero: string; revisadoPor?: string }): Promise<Buffer>;
}
const NOMBRE_MODULO = '@registro-obra/informes';
let modulo: Promise<ModuloInformes> | undefined;
export const informes = () => (modulo ??= import(NOMBRE_MODULO) as Promise<ModuloInformes>);

/** Almacen para el módulo de informes, actuando como el usuario indicado (RLS). */
export function almacenPara(usuarioId: string) {
  const q = <T = any>(sql: string, params?: unknown[]) => conUsuario(usuarioId, (c) => c<T & object>(sql, params));
  return {
    // Filas completas: además de alimentar el informe, quedan congeladas en la revisión
    // al publicar y el panel muestra el informe publicado con ellas.
    async datosDelDia(obra_id: string, dia: string) {
      return conUsuario(usuarioId, async (c) => {
        const [obra] = await c(`select id, codigo, nombre, direccion as ubicacion, notas_para_informe from obras where id = $1`, [obra_id]);
        if (!obra) throw noEncontrado('Obra');
        const usuarios = await c(
          `select u.id, u.nombre, m.cargo from obra_miembros m join usuarios u on u.id = m.usuario_id where m.obra_id = $1`,
          [obra_id],
        );
        const sectores = await c(`select * from sectores where obra_id = $1 and eliminado_en is null order by orden`, [obra_id]);
        const items = await c(
          `select *,
                  case when inicio_previsto is null then null else $2::date between inicio_previsto and coalesce(fin_previsto, $2::date) end
                    as previsto_en_fecha
             from items where obra_id = $1 and eliminado_en is null order by orden`,
          [obra_id, dia],
        );
        const fotos = await c(
          `select f.* from fotos f join partes_diarios p on p.id = f.parte_id
            where f.obra_id = $1 and p.fecha = $2 and f.eliminado_en is null order by f.tomada_en`,
          [obra_id, dia],
        );
        const anotaciones = await c(
          `select * from anotaciones
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
      // Como en PATCH: cambiar un publicado lo vuelve a borrador (lo publicado queda en su revisión).
      await q(
        `update informes set contenido = $2, pdf_path = null,
                estado = case when estado = 'publicado' then 'borrador'::estado_informe else estado end,
                publicado_por = null, publicado_en = null
          where id = $1`,
        [informe_id, JSON.stringify(contenido)],
      );
    },
    // Vista previa del borrador: va a su propia ruta y no se guarda en el informe,
    // así nunca pisa el PDF de una revisión publicada.
    async guardarPdf(informe_id: string, pdf: Buffer) {
      const [i] = await q(`select obra_id from informes where id = $1`, [informe_id]);
      const ruta = rutaBorradorInforme(i.obra_id, informe_id);
      await guardar(ruta, pdf, 'application/pdf');
      return ruta;
    },
  };
}

const REVISION = `r.id, r.informe_id, r.obra_id, r.revision, r.codigo, r.publicado_por, r.publicado_en, r.pdf_path is not null as tiene_pdf`;

/**
 * PDF de una revisión publicada, armado solo con sus datos congelados. Si la revisión
 * viene de antes de las revisiones y no tenía PDF, sus datos se congelan ahora, una vez.
 * Lo hace quien la publicó (o un editor): puede escribir la revisión.
 */
async function pdfDeRevision(usuarioId: string, revisionId: string): Promise<string> {
  const leer = () =>
    conUsuario(usuarioId, async (q) => {
      const [r] = await q(
        `select r.*, u.nombre as revisado_por from informe_revisiones r left join usuarios u on u.id = r.publicado_por
          where r.id = $1`,
        [revisionId],
      );
      if (!r) throw noEncontrado('Revisión');
      return r;
    });
  let r = await leer();
  if (r.pdf_path) return r.pdf_path;
  const almacen = almacenPara(usuarioId);
  if (!r.datos) {
    const [inf] = await conUsuario(usuarioId, (q) => q(`select fecha_desde from informes where id = $1`, [r.informe_id]));
    const datos = await almacen.datosDelDia(r.obra_id, inf.fecha_desde);
    await conUsuario(usuarioId, (q) => q(`update informe_revisiones set datos = $2 where id = $1 and datos is null`, [revisionId, JSON.stringify(datos)]));
    r = await leer(); // si otro pedido lo congeló antes, valen sus datos
  }
  const pdf = await (await informes()).armarPdf(almacen.leerFoto, r.contenido, r.datos, {
    numero: r.codigo,
    revisadoPor: r.revisado_por ?? undefined,
  });
  const ruta = rutaRevision(r.obra_id, r.informe_id, r.revision);
  await guardar(ruta, pdf, 'application/pdf');
  const [hecho] = await conUsuario(usuarioId, (q) =>
    q<{ pdf_path: string }>(
      `update informe_revisiones set pdf_path = coalesce(pdf_path, $2) where id = $1 returning pdf_path`,
      [revisionId, ruta],
    ),
  );
  await conUsuario(usuarioId, (q) =>
    q(`update informes set pdf_path = $3 where id = $1 and revision = $2 and estado = 'publicado'`, [r.informe_id, r.revision, hecho.pdf_path]),
  );
  return hecho.pdf_path;
}

const SIN_CONTENIDO = `id, obra_id, tipo, numero, fecha_desde, fecha_hasta, estado, version_esquema, modelo_ia, error, pdf_path,
  automatico, generado_por, publicado_por, publicado_en, revision, creado_en, actualizado_en, eliminado_en`;

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
    return conUsuario(pedido.sesion.usuarioId, async (q) => {
      const [inf] = await q(`select * from informes where id = $1`, [id]);
      if (!inf) throw noEncontrado('Informe');
      // Publicado, el panel lo muestra con los datos congelados de su revisión.
      const [rev] =
        inf.revision === null
          ? []
          : await q(
              `select ${REVISION}, case when $3 then r.datos end as datos
                 from informe_revisiones r where r.informe_id = $1 and r.revision = $2`,
              [id, inf.revision, inf.estado === 'publicado'],
            );
      return { ...inf, revision_vigente: rev ?? null };
    });
  });

  app.get('/informes/:id/revisiones', async (pedido) => {
    const { id } = IdParam.parse(pedido.params);
    return conUsuario(pedido.sesion.usuarioId, (q) =>
      q(`select ${REVISION} from informe_revisiones r where r.informe_id = $1 order by r.revision desc`, [id]),
    );
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

  // Publicar congela: guarda la revisión siguiente con el contenido y los datos del día
  // como están ahora. Lo que cambie después en la base no toca esa revisión ni su PDF.
  app.post('/informes/:id/publicar', async (pedido) => {
    const { id } = IdParam.parse(pedido.params);
    const usuarioId = pedido.sesion.usuarioId;
    const [actual] = await conUsuario(usuarioId, (q) =>
      q(`select i.*, soy_editor(i.obra_id) as editor from informes i where i.id = $1`, [id]),
    );
    if (!actual) throw noEncontrado('Informe');
    if (!actual.editor) throw sinPermiso('Solo un editor publica informes');
    if (actual.estado === 'publicado') return actual; // ya publicado: no hay revisión nueva
    if (actual.estado !== 'borrador' || !actual.contenido) throw new ErrorApi(409, 'conflicto', 'El informe no está listo para publicar');
    const datos = await almacenPara(usuarioId).datosDelDia(actual.obra_id, actual.fecha_desde);
    const { inf, revisionId } = await conUsuario(usuarioId, async (q) => {
      const [inf] = await q(
        `update informes set estado = 'publicado', publicado_por = usuario_actual(), publicado_en = now(), pdf_path = null,
                revision = (select coalesce(max(revision) + 1, 0) from informe_revisiones where informe_id = $1)
          where id = $1 and estado = 'borrador' and contenido is not null returning *`,
        [id],
      );
      if (!inf) throw new ErrorApi(409, 'conflicto', 'El informe no está listo para publicar');
      const [{ sigla }] = await q(`select sigla from obras where id = $1`, [inf.obra_id]);
      const [rev] = await q(
        `insert into informe_revisiones (informe_id, obra_id, revision, codigo, contenido, datos, publicado_por, publicado_en)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [id, inf.obra_id, inf.revision, codigoRevision(sigla, inf.numero, inf.revision), JSON.stringify(inf.contenido),
          JSON.stringify(datos), inf.publicado_por, inf.publicado_en],
      );
      return { inf, revisionId: rev.id as string };
    });
    pdfDeRevision(usuarioId, revisionId).catch((e) => app.log.error(e)); // PDF listo para descargar
    return inf;
  });

  // Publicado: el PDF congelado de la revisión vigente (o de la pedida con ?revision=n).
  // Borrador: vista previa con los datos de ahora, solo para el editor.
  app.get('/informes/:id/pdf', async (pedido, respuesta) => {
    const { id } = IdParam.parse(pedido.params);
    const { revision } = z.object({ revision: z.coerce.number().int().min(0).optional() }).parse(pedido.query);
    const usuarioId = pedido.sesion.usuarioId;
    const [inf] = await conUsuario(usuarioId, (q) =>
      q(
        `select i.id, i.estado, i.revision, i.contenido is not null as tiene, soy_editor(i.obra_id) as editor,
                r.id as revision_id, r.publicado_por
           from informes i
           left join informe_revisiones r on r.informe_id = i.id
                and r.revision = coalesce($2, case when i.estado = 'publicado' then i.revision end)
          where i.id = $1`,
        [id, revision ?? null],
      ),
    );
    if (!inf) throw noEncontrado('Informe');
    let ruta: string;
    if (inf.revision_id) {
      // Un lector arma el PDF como quien publicó la revisión, que puede guardarlo.
      const actor = inf.editor ? usuarioId : inf.publicado_por;
      if (!actor) throw new ErrorApi(409, 'conflicto', 'El PDF todavía no está listo');
      ruta = await pdfDeRevision(actor, inf.revision_id);
    } else {
      if (revision !== undefined) throw noEncontrado('Revisión');
      if (!inf.editor || !inf.tiene) throw new ErrorApi(409, 'conflicto', 'El PDF todavía no está listo');
      ruta = await (await informes()).exportar(almacenPara(usuarioId), id);
    }
    return respuesta.redirect((await urlLectura(ruta)).url);
  });
}
