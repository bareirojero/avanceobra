import type { MisFotosRespuesta } from '@registro-obra/contrato';

import type { FotoAnterior } from '@/domain/historial';

import { backend } from './backend';
import { db } from './db';
import { COLUMNAS_FOTO, fotoDeFila, type FilaFoto } from './repositorio';

/** Mis fotos de días anteriores guardadas en el teléfono (las haya enviado o no). */
export async function misFotosAnterioresLocales(obraId: string, autorId: string, hoy: string): Promise<FotoAnterior[]> {
  const filas = await (await db()).getAllAsync<FilaFoto & { fecha: string }>(
    `SELECT ${COLUMNAS_FOTO}, p.fecha FROM fotos f JOIN partes_diarios p ON p.id = f.parte_id
      WHERE p.obra_id = ? AND p.autor_id = ? AND p.fecha < ? AND f.eliminado_en IS NULL
      ORDER BY f.tomada_en DESC`,
    obraId, autorId, hoy,
  );
  return filas.map((fila) => {
    const f = fotoDeFila(fila);
    return {
      id: f.id, fecha: fila.fecha, item_id: f.item_id, tomada_en: f.tomada_en, comentario: f.comentario,
      ancho: f.ancho, alto: f.alto, miniatura: f.miniatura_local ?? f.archivo_local, archivo: f.archivo_local,
      claveMiniatura: null, claveArchivo: null, marcas: f.marcas, estado: f.estado, error: f.error, anotaciones: [],
    };
  });
}

export interface PaginaRemota {
  fotos: FotoAnterior[];
  siguiente: string | null;
}

/** Una página de días del servidor (lanza si no hay señal). */
export async function misFotosRemotas(obraId: string, antes: string): Promise<PaginaRemota> {
  const r: MisFotosRespuesta = await backend().misFotos(obraId, antes);
  return {
    siguiente: r.siguiente,
    fotos: r.dias.flatMap(({ fecha, fotos }) =>
      fotos.map((f) => ({
        id: f.id, fecha, item_id: f.item_id, tomada_en: f.tomada_en, comentario: f.comentario,
        ancho: f.ancho, alto: f.alto, miniatura: f.miniatura_url, archivo: f.archivo_url,
        claveMiniatura: f.miniatura_path, claveArchivo: f.archivo_path,
        marcas: f.anotaciones.length, estado: null, error: null, anotaciones: f.anotaciones,
      })),
    ),
  };
}
