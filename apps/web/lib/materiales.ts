// Planillas de materiales: lectura del catálogo (Excel con código, descripción y unidad)
// y armado del Excel de pedidos para editor y solo lectura.
import { type EstadoPedido, type FilaMaterial, NOMBRE_ESTADO_PEDIDO, type PedidoMaterialDetalle } from "@registro-obra/contrato";
import writeXlsxFile, { type Cell, type SheetData } from "write-excel-file/browser";
import type { Celda } from "./importar-items";

export type CampoMaterial = "codigo" | "descripcion" | "unidad";
export type MapeoMaterial = Partial<Record<CampoMaterial, number>>;

// Pensado para la exportación de materiales de SAP: "Material" (el código), "Centro",
// "Texto breve de material" y "UMB". El orden importa: "Material" solo es el código.
const PISTAS: Record<CampoMaterial, RegExp> = {
  codigo: /^(material|c[oó]d(igo)?(\s+(de\s+)?material)?\.?|item|ítem|nro\.?|n[º°o]\.?)$/i,
  descripcion: /texto|descrip|detalle|nombre|art[ií]culo|material/i,
  unidad: /^(umb|um|u|u\.\s?m\.?|und|unid\.?|unidad)$|unidad de medida|medida/i,
};

const texto = (c: Celda) => (c == null ? "" : c instanceof Date ? c.toISOString() : String(c).trim());

/** Busca en las primeras filas la que parece encabezado y propone qué columna es cada campo. */
export function detectarColumnas(filas: Celda[][]): { fila: number; mapeo: MapeoMaterial } {
  let mejor = { fila: 0, mapeo: {} as MapeoMaterial, puntos: -1 };
  filas.slice(0, 25).forEach((fila, i) => {
    const mapeo: MapeoMaterial = {};
    fila.forEach((c, col) => {
      const t = texto(c);
      for (const campo of Object.keys(PISTAS) as CampoMaterial[]) {
        if (mapeo[campo] === undefined && PISTAS[campo].test(t)) {
          mapeo[campo] = col;
          break;
        }
      }
    });
    const puntos = Object.keys(mapeo).length;
    if (puntos > mejor.puntos) mejor = { fila: i, mapeo, puntos };
  });
  return { fila: mejor.fila, mapeo: mejor.mapeo };
}

/**
 * Filas debajo del encabezado con código y descripción, para POST /materiales/importar.
 * SAP repite cada material una vez por centro: se carga una sola vez por código.
 */
export function filasDeMateriales(filas: Celda[][], encabezado: number, mapeo: MapeoMaterial): FilaMaterial[] {
  if (mapeo.codigo === undefined || mapeo.descripcion === undefined) return [];
  const vistos = new Set<string>();
  return filas
    .slice(encabezado + 1)
    .map((fila) => ({
      codigo: texto(fila[mapeo.codigo!]).slice(0, 60),
      descripcion: texto(fila[mapeo.descripcion!]).slice(0, 500),
      unidad: mapeo.unidad !== undefined ? texto(fila[mapeo.unidad]).slice(0, 20) || null : null,
    }))
    .filter((f) => f.codigo && f.descripcion && !vistos.has(f.codigo) && !!vistos.add(f.codigo));
}

/** Fecha y hora de Paraguay como un Date "de pared" (Excel no guarda zona horaria). */
function enParaguay(instante: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Asuncion",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(instante))
      .map((x) => [x.type, Number(x.value)]),
  );
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute));
}

const fechaCalendario = (f: string) => new Date(`${f}T00:00:00Z`);
const negrita = (value: string): Cell => ({ value, fontWeight: "bold" });

/** Descarga la planilla con todos los pedidos de la obra. */
export async function descargarPedidos(pedidos: PedidoMaterialDetalle[], obra: string) {
  const columnas: { titulo: string; ancho: number; celda: (p: PedidoMaterialDetalle) => Cell }[] = [
    { titulo: "Fecha y hora del pedido", ancho: 20, celda: (p) => ({ value: enParaguay(p.pedido_en), type: Date, format: "dd/mm/yyyy hh:mm" }) },
    { titulo: "Solicitado por", ancho: 24, celda: (p) => ({ value: p.autor_nombre, type: String }) },
    { titulo: "Código", ancho: 14, celda: (p) => ({ value: p.material_codigo, type: String }) },
    { titulo: "Material", ancho: 40, celda: (p) => ({ value: p.material_descripcion, type: String }) },
    { titulo: "Unidad", ancho: 10, celda: (p) => ({ value: p.material_unidad ?? "", type: String }) },
    { titulo: "Cantidad", ancho: 11, celda: (p) => ({ value: Number(p.cantidad), type: Number }) },
    {
      titulo: "Sector (ítem)",
      ancho: 40,
      celda: (p) => ({ value: p.item_numero ? `${p.item_numero} · ${p.item_descripcion}` : p.item_descripcion, type: String }),
    },
    { titulo: "Código PEP del sector", ancho: 20, celda: (p) => ({ value: p.item_codigo, type: String }) },
    {
      titulo: "Necesario en obra",
      ancho: 16,
      celda: (p) => (p.necesario_para ? { value: fechaCalendario(p.necesario_para), type: Date, format: "dd/mm/yyyy" } : { value: "", type: String }),
    },
    { titulo: "Fotos de referencia", ancho: 12, celda: (p) => ({ value: (p.fotos ?? []).length, type: Number }) },
    { titulo: "Estado", ancho: 18, celda: (p) => ({ value: NOMBRE_ESTADO_PEDIDO[p.estado ?? "enviado"], type: String }) },
  ];
  const datos: SheetData = [columnas.map((c) => negrita(c.titulo)), ...pedidos.map((p) => columnas.map((c) => c.celda(p)))];
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Asuncion" });
  await writeXlsxFile(datos, { columns: columnas.map((c) => ({ width: c.ancho })), stickyRowsCount: 1, sheet: "Pedidos" }).toFile(
    `Pedidos de materiales - ${obra.replace(/[\\/:*?"<>|]/g, "")} - ${hoy}.xlsx`,
  );
}

// ---------------------------------------------------------------------------
// Estados y filtros de la planilla de pedidos
// ---------------------------------------------------------------------------

/** Colores de cada estado (los mismos de packages/ui-tokens, pedidoState). */
export const COLOR_ESTADO: Record<EstadoPedido, { bg: string; fg: string; dot: string }> = {
  enviado: { bg: "#FFF4CC", fg: "#6B4F00", dot: "#FEC502" },
  rechazado: { bg: "#FBE3E1", fg: "#8E1C13", dot: "#B42318" },
  planificando: { bg: "#FFEAD5", fg: "#8A4500", dot: "#F28C28" },
  en_compra: { bg: "#F9DCC8", fg: "#6E2A05", dot: "#C2410C" },
  disponible: { bg: "#E1F5EA", fg: "#146A3D", dot: "#1B8A50" },
};

const diaParaguay = (instante: string) => new Date(instante).toLocaleDateString("en-CA", { timeZone: "America/Asuncion" });
const dma = (f: string) => f.split("-").reverse().join("/");

export type ColumnaPedido = "fecha" | "autor" | "material" | "cantidad" | "sector" | "para" | "estado";

/** Lo que se ve en cada columna (y por lo que se filtra), y cómo se ordenan sus valores en el filtro. */
export const COLUMNAS_PEDIDO: Record<ColumnaPedido, { valor: (p: PedidoMaterialDetalle) => string; orden?: (p: PedidoMaterialDetalle) => string | number }> = {
  fecha: { valor: (p) => dma(diaParaguay(p.pedido_en)), orden: (p) => -new Date(p.pedido_en).getTime() },
  autor: { valor: (p) => p.autor_nombre },
  material: { valor: (p) => p.material_descripcion },
  cantidad: { valor: (p) => `${Number(p.cantidad).toLocaleString("es-PY")} ${p.material_unidad ?? ""}`.trim(), orden: (p) => Number(p.cantidad) },
  sector: { valor: (p) => (p.item_numero ? `${p.item_numero} · ${p.item_descripcion}` : p.item_descripcion) },
  para: { valor: (p) => (p.necesario_para ? dma(p.necesario_para) : "Sin fecha"), orden: (p) => p.necesario_para ?? "9999" },
  estado: { valor: (p) => NOMBRE_ESTADO_PEDIDO[p.estado ?? "enviado"], orden: (p) => ESTADOS_ORDEN.indexOf(p.estado ?? "enviado") },
};
const ESTADOS_ORDEN: EstadoPedido[] = ["enviado", "rechazado", "planificando", "en_compra", "disponible"];

/** Por columna, los valores que se dejan ver. Sin la columna: todos. */
export type FiltrosPedido = Partial<Record<ColumnaPedido, string[]>>;

export function filtrarPedidos(pedidos: PedidoMaterialDetalle[], filtros: FiltrosPedido, salvo?: ColumnaPedido) {
  const activos = (Object.entries(filtros) as [ColumnaPedido, string[]][]).filter(([c]) => c !== salvo);
  if (!activos.length) return pedidos;
  const conjuntos = activos.map(([c, v]) => [COLUMNAS_PEDIDO[c].valor, new Set(v)] as const);
  return pedidos.filter((p) => conjuntos.every(([valor, vale]) => vale.has(valor(p))));
}

/** Valores distintos de una columna con cuántos pedidos tiene cada uno, en el orden de la columna. */
export function valoresDeColumna(pedidos: PedidoMaterialDetalle[], columna: ColumnaPedido) {
  const { valor, orden = valor } = COLUMNAS_PEDIDO[columna];
  const cuenta = new Map<string, { n: number; orden: string | number }>();
  for (const p of pedidos) {
    const v = valor(p);
    const c = cuenta.get(v);
    if (c) c.n++;
    else cuenta.set(v, { n: 1, orden: orden(p) });
  }
  return [...cuenta.entries()]
    .sort(([a, x], [b, y]) => (typeof x.orden === "number" && typeof y.orden === "number" ? x.orden - y.orden : String(x.orden).localeCompare(String(y.orden), "es")) || a.localeCompare(b, "es"))
    .map(([v, { n }]) => ({ valor: v, n }));
}
