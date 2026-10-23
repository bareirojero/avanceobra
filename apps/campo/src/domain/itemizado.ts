import { CATEGORIAS_ESPECIALES, type Item } from '@registro-obra/contrato';

/**
 * Itemizado de la obra: árbol de títulos (rubros) e ítems. Los ítems hoja son los que se
 * eligen para una foto; los títulos solo agrupan.
 */

/** Fila de la exportación de SAP: [elemento PEP, descripción, unidad, cantidad]. */
export type FilaPep = [string, string, string | null, number | null];

/**
 * Arma el árbol desde los elementos PEP de SAP, como lo hace la API al importar el Excel
 * (acá solo se usa para el modo demo). El padre de cada fila es la fila anterior más larga
 * cuyo código es prefijo del suyo (OC.0054 › D001 › 001 › 01). La fila raíz es la obra
 * misma y no se carga. Las filas sin cantidad son títulos. El prefijo "15-" de la
 * descripción es el número de ítem.
 */
export function itemsDesdePep(filas: FilaPep[], obraId: string, idDe: (indice: number) => string, fecha: string): Item[] {
  const raiz = filas.find(([pep]) => filas.every(([otro]) => otro.startsWith(pep)))?.[0];
  const vistos: { pep: string; id: string; nivel: number }[] = [];
  const items: Item[] = [];
  filas.forEach(([pep, texto, unidad, cantidad], i) => {
    if (pep === raiz) return;
    let padre: { pep: string; id: string; nivel: number } | undefined;
    for (const v of vistos) if (pep.startsWith(v.pep) && (!padre || v.pep.length > padre.pep.length)) padre = v;
    const numero = /^(\d+)\s*-\s*(.*)$/.exec(texto);
    const id = idDe(i);
    const nivel = padre ? padre.nivel + 1 : 1;
    vistos.push({ pep, id, nivel });
    items.push({
      id, obra_id: obraId, padre_id: padre?.id ?? null,
      codigo: pep, numero: numero ? numero[1] : null, descripcion: (numero ? numero[2] : texto).trim(),
      unidad, cantidad, es_titulo: cantidad == null, categoria: 'obra', nivel, orden: i,
      inicio_previsto: null, fin_previsto: null, importacion_id: null,
      creado_en: fecha, actualizado_en: fecha, eliminado_en: null,
    });
  });
  return items;
}

const normal = (t: string) => t.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

/** "15 · CERRAMIENTO PERIMETRAL": el número de ítem, no el código PEP, que no dice nada en obra. */
export const tituloItem = (i: Pick<Item, 'numero' | 'descripcion'>) => (i.numero ? `${i.numero} · ${i.descripcion}` : i.descripcion);

/** Incidente de obra, vuelo de dron o pluviómetro: entradas fijas de cada obra que no vienen del Excel. */
export const esEspecial = (i: Pick<Item, 'categoria'>) => (i.categoria ?? 'obra') !== 'obra';

/** Las entradas fijas de la obra, en el orden en que se ofrecen (incidente primero). */
export function especiales(items: Item[]): Item[] {
  return CATEGORIAS_ESPECIALES.flatMap(({ categoria }) => items.filter((i) => i.categoria === categoria));
}

/** Hijos directos, en el orden del itemizado. Con padre null, el primer nivel. Sin las entradas fijas. */
export function hijos(items: Item[], padreId: string | null): Item[] {
  const existe = new Set(items.map((i) => i.id));
  return items
    .filter((i) => !esEspecial(i) && (i.padre_id && existe.has(i.padre_id) ? i.padre_id : null) === padreId)
    .sort((a, b) => a.orden - b.orden);
}

/** Títulos desde la raíz hasta el padre del ítem (sin incluirlo). */
export function camino(items: Item[], id: string | null): Item[] {
  const porId = new Map(items.map((i) => [i.id, i]));
  const salida: Item[] = [];
  let actual = id ? porId.get(id) : undefined;
  while (actual?.padre_id && porId.has(actual.padre_id) && salida.length < 20) {
    actual = porId.get(actual.padre_id)!;
    salida.unshift(actual);
  }
  return salida;
}

/** Rubro del ítem para mostrar debajo de su nombre: "Zapata corrida y muros › Zapata corrida". */
export const rubro = (items: Item[], id: string | null) => camino(items, id).map((t) => t.descripcion).join(' › ');

/** Cantidad de ítems elegibles debajo de un título. */
export function cantidadDeHojas(items: Item[], padreId: string): number {
  return hijos(items, padreId).reduce((n, h) => n + (h.es_titulo ? cantidadDeHojas(items, h.id) : 1), 0);
}

/**
 * Busca ítems elegibles por número o por palabras, también en el nombre de su rubro: "zapata
 * hormigon" encuentra el hormigón de la zapata corrida. Todas las palabras tienen que aparecer.
 */
export function buscarItems(items: Item[], consulta: string, limite = 60): Item[] {
  const palabras = normal(consulta).split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];
  const salida: Item[] = [];
  for (const i of [...items].sort((a, b) => a.orden - b.orden)) {
    if (i.es_titulo) continue;
    const texto = normal([i.numero, i.descripcion, ...camino(items, i.id).map((t) => t.descripcion)].filter(Boolean).join(' '));
    const numeroExacto = palabras.length === 1 && i.numero === palabras[0];
    if (numeroExacto) salida.unshift(i);
    else if (palabras.every((p) => texto.includes(p))) salida.push(i);
    if (salida.length >= limite) break;
  }
  return salida;
}
