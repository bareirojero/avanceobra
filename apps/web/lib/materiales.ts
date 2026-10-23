// Planillas de materiales: lectura del catálogo (Excel con código, descripción y unidad)
// y armado del Excel de pedidos para editor y solo lectura.
import type { FilaMaterial, PedidoMaterialDetalle } from "@registro-obra/contrato";
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
  ];
  const datos: SheetData = [columnas.map((c) => negrita(c.titulo)), ...pedidos.map((p) => columnas.map((c) => c.celda(p)))];
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Asuncion" });
  await writeXlsxFile(datos, { columns: columnas.map((c) => ({ width: c.ancho })), stickyRowsCount: 1, sheet: "Pedidos" }).toFile(
    `Pedidos de materiales - ${obra.replace(/[\\/:*?"<>|]/g, "")} - ${hoy}.xlsx`,
  );
}
