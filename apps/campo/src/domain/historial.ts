import type { Anotacion } from '@registro-obra/contrato';

/**
 * Envíos de días anteriores: se juntan las fotos guardadas en el teléfono (que pueden no
 * haberse enviado todavía) con las que devuelve el servidor (todas las de la persona,
 * aunque se hayan sacado en otro teléfono o antes de reinstalar la app).
 */

export interface FotoAnterior {
  id: string;
  fecha: string;
  item_id: string;
  tomada_en: string;
  comentario: string | null;
  ancho: number | null;
  alto: number | null;
  /** Archivo en el teléfono o URL firmada del servidor. */
  miniatura: string | null;
  archivo: string | null;
  /** Clave de caché de la imagen remota: la URL firmada cambia en cada pedido. */
  claveMiniatura: string | null;
  claveArchivo: string | null;
  marcas: number;
  /** null: viene solo del servidor, o sea que ya está enviada. */
  estado: 'pendiente' | 'error' | 'subida' | null;
  error: string | null;
  /** Las marcas, cuando la foto viene del servidor. */
  anotaciones: Anotacion[];
}

export interface DiaAnterior {
  fecha: string;
  fotos: FotoAnterior[];
}

/**
 * Une las dos fuentes por id. De lo local manda el estado de envío y el archivo en el
 * teléfono (si existe); del servidor, las URLs y las marcas cuando falta el archivo local.
 * Días del más nuevo al más viejo y, dentro de cada día, fotos de la más nueva a la más vieja.
 */
export function unirDias(locales: FotoAnterior[], remotas: FotoAnterior[], hoy: string): DiaAnterior[] {
  const porId = new Map<string, FotoAnterior>();
  for (const r of remotas) porId.set(r.id, r);
  for (const l of locales) {
    const r = porId.get(l.id);
    porId.set(
      l.id,
      r
        ? {
            ...r,
            ...l,
            miniatura: l.miniatura ?? r.miniatura,
            claveMiniatura: l.miniatura ? null : r.claveMiniatura,
            archivo: l.archivo ?? r.archivo,
            claveArchivo: l.archivo ? null : r.claveArchivo,
            anotaciones: r.anotaciones,
          }
        : l,
    );
  }
  const dias = new Map<string, FotoAnterior[]>();
  for (const f of porId.values()) {
    if (f.fecha >= hoy) continue; // Lo de hoy se muestra aparte y se puede editar.
    const lista = dias.get(f.fecha) ?? [];
    lista.push(f);
    dias.set(f.fecha, lista);
  }
  return [...dias]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([fecha, fotos]) => ({ fecha, fotos: fotos.sort((a, b) => (a.tomada_en < b.tomada_en ? 1 : -1)) }));
}
