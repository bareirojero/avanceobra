// Itemizado para elegir el ítem de una foto o el sector de un pedido desde el celular.
// Misma lógica que apps/campo/src/domain/itemizado.ts.
import { CATEGORIAS_ESPECIALES, type Item } from "@registro-obra/contrato";

const normal = (t: string) => t.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

/** Incidente de obra, vuelo de dron o pluviómetro: entradas fijas que no vienen del Excel. */
export const esEspecial = (i: Pick<Item, "categoria">) => (i.categoria ?? "obra") !== "obra";

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

/** "Zapata corrida y muros › Zapata corrida". */
export const rubro = (items: Item[], id: string | null) =>
  camino(items, id)
    .map((t) => t.descripcion)
    .join(" › ");

export function cantidadDeHojas(items: Item[], padreId: string): number {
  return hijos(items, padreId).reduce((n, h) => n + (h.es_titulo ? cantidadDeHojas(items, h.id) : 1), 0);
}

/** Busca ítems elegibles por número o por palabras, también en el nombre de su rubro. */
export function buscarItems(items: Item[], consulta: string, limite = 60): Item[] {
  const palabras = normal(consulta).split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];
  const salida: Item[] = [];
  for (const i of [...items].sort((a, b) => a.orden - b.orden)) {
    if (i.es_titulo) continue;
    const texto = normal([i.numero, i.descripcion, ...camino(items, i.id).map((t) => t.descripcion)].filter(Boolean).join(" "));
    if (palabras.length === 1 && i.numero === palabras[0]) salida.unshift(i);
    else if (palabras.every((p) => texto.includes(p))) salida.push(i);
    if (salida.length >= limite) break;
  }
  return salida;
}

/** Busca materiales por palabras sueltas, sin importar tildes ni mayúsculas. */
export function buscarMateriales<M extends { descripcion: string; unidad: string | null }>(materiales: M[], consulta: string, limite = 60): M[] {
  const palabras = normal(consulta).split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];
  const salida: M[] = [];
  for (const m of materiales) {
    if (palabras.every((p) => normal(`${m.descripcion} ${m.unidad ?? ""}`).includes(p))) salida.push(m);
    if (salida.length >= limite) break;
  }
  return salida;
}

/** "12,5" o "12.5" → 12.5. Null si no es un número mayor a cero. */
export function leerCantidad(texto: string): number | null {
  const limpio = texto.trim().replace(/\s/g, "");
  if (!/^\d+([.,]\d+)?$/.test(limpio)) return null;
  const n = Number(limpio.replace(",", "."));
  return n > 0 ? n : null;
}

/** 12.5 → "12,5", como se escribe en Paraguay. */
export const cantidadTexto = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");

/** Ítems usados hace poco en esta obra (en este celular), el último primero. */
export function recientes(obraId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(`recientes:${obraId}`) ?? "[]");
  } catch {
    return [];
  }
}

export function usarItem(obraId: string, itemId: string) {
  try {
    localStorage.setItem(`recientes:${obraId}`, JSON.stringify([itemId, ...recientes(obraId).filter((i) => i !== itemId)].slice(0, 6)));
  } catch {}
}
