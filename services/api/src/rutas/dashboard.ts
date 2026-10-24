// Dashboard de la obra: lo ve cualquier miembro, y es lo único que ve el gerente.

import type { DashboardRespuesta } from '@registro-obra/contrato';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { urlLectura } from '../archivos.ts';
import { autenticar } from '../auth.ts';
import { conUsuario } from '../db.ts';

export async function rutasDashboard(app: FastifyInstance) {
  app.addHook('preHandler', autenticar);

  // Fotos del último día con fotos, para la galería. El permiso lo decide dashboard_fotos().
  app.get('/obras/:obraId/dashboard', async (pedido): Promise<DashboardRespuesta> => {
    const { obraId } = z.object({ obraId: z.string().uuid() }).parse(pedido.params);
    const filas = await conUsuario(pedido.sesion.usuarioId, (q) =>
      q(`select * from dashboard_fotos($1)`, [obraId]),
    );
    const fotos = await Promise.all(
      filas.map(async (f) => ({
        id: f.id,
        archivo_url: (await urlLectura(f.archivo_path)).url,
        miniatura_url: (await urlLectura(f.miniatura_path)).url,
        ancho: f.ancho,
        alto: f.alto,
        tomada_en: f.tomada_en,
        comentario: f.comentario,
        autor: f.autor,
        item: f.item_descripcion ? (f.item_numero ? `${f.item_numero} · ${f.item_descripcion}` : f.item_descripcion) : null,
      })),
    );
    return { fecha: filas[0]?.fecha ?? null, fotos };
  });
}
