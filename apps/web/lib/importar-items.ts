// Lectura del itemizado de obra (exportación de SAP). Las filas van crudas a la API
// (la base arma la jerarquía por el código); `interpretar` es solo para la vista previa.
import type { FilaItemizado } from "@registro-obra/contrato";

export type Celda = string | number | boolean | Date | null;
export type Campo = "codigo" | "descripcion" | "unidad" | "cantidad" | "version";
export type Mapeo = Partial<Record<Campo, number>>;

/** Fila de la vista previa. `numero` es el número de ítem que SAP pone delante de la descripción ("15-CERRAMIENTO…"). */
export interface FilaItem {
  ref: string;
  ref_padre: string | null;
  codigo: string | null;
  numero: string | null;
  descripcion: string;
  unidad: string | null;
  cantidad: number | null;
  es_titulo: boolean;
}

export interface Interpretacion {
  filas: FilaItem[];
  /** Fila raíz que nombra la obra (ej. "OC.0054 ESTADIO ODD - FUNDACIONES"); no se importa como ítem. */
  obra: { codigo: string; descripcion: string } | null;
  versiones: string[];
}

const PISTAS: Record<Campo, RegExp> = {
  codigo: /^(item|ítem|n[º°o]?\.?|cod\.?|código|codigo|nro\.?)$|pep/i,
  descripcion: /descrip|designaci|concepto|detalle|tarea/i,
  unidad: /^(unid|unidad|und|u\.?|um)\b/i,
  cantidad: /^cant|cómputo|computo/i,
  version: /^versi[oó]n$/i,
};

const texto = (c: Celda) => (c == null ? "" : c instanceof Date ? c.toISOString() : String(c).trim());

/** Busca en las primeras filas la que parece encabezado y propone qué columna es cada campo. */
export function detectarEncabezado(filas: Celda[][]): { fila: number; mapeo: Mapeo } {
  let mejor = { fila: 0, mapeo: {} as Mapeo, puntos: -1 };
  filas.slice(0, 25).forEach((fila, i) => {
    const mapeo: Mapeo = {};
    fila.forEach((c, col) => {
      const t = texto(c);
      for (const campo of Object.keys(PISTAS) as Campo[]) {
        if (mapeo[campo] === undefined && PISTAS[campo].test(t)) {
          mapeo[campo] = col;
          break;
        }
      }
    });
    const puntos = Object.keys(mapeo).length + (mapeo.descripcion !== undefined ? 2 : 0);
    if (puntos > mejor.puntos) mejor = { fila: i, mapeo, puntos };
  });
  return { fila: mejor.fila, mapeo: mejor.mapeo };
}

function aNumero(c: Celda) {
  if (typeof c === "number") return c;
  const t = texto(c);
  if (!t) return NaN;
  // 1.234,5 (es-PY) o 1234.5
  const n = Number(/,\d+$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Convierte las filas debajo del encabezado. Una fila sin cantidad es un título (rubro).
 * Si los códigos son jerárquicos (el de cada fila empieza con el de su padre, como los
 * elementos PEP de SAP), el padre es el código previo más largo que lo contiene; si no,
 * es el último título.
 */
export function interpretar(filas: Celda[][], encabezado: number, mapeo: Mapeo): Interpretacion {
  const vacia: Interpretacion = { filas: [], obra: null, versiones: [] };
  if (mapeo.descripcion === undefined) return vacia;

  const crudas = filas
    .slice(encabezado + 1)
    .map((fila, n) => {
      let descripcion = texto(fila[mapeo.descripcion!]);
      const m = descripcion.match(/^(\d+)\s*-\s*(.+)$/);
      const numero = m ? m[1] : null;
      if (m) descripcion = m[2];
      return {
        ref: `f${encabezado + n + 2}`,
        codigo: mapeo.codigo !== undefined ? texto(fila[mapeo.codigo]) : "",
        descripcion,
        numero,
        unidad: mapeo.unidad !== undefined ? texto(fila[mapeo.unidad]) : "",
        cantidad: mapeo.cantidad !== undefined ? aNumero(fila[mapeo.cantidad]) : NaN,
        version: mapeo.version !== undefined ? texto(fila[mapeo.version]) : "",
      };
    })
    .filter((f) => f.descripcion && !/^(sub)?total/i.test(f.descripcion));
  if (!crudas.length) return vacia;

  // La primera fila puede ser la obra misma: un título cuyo código contiene a todos los demás.
  let obra: Interpretacion["obra"] = null;
  const [primera, ...resto] = crudas;
  if (primera.codigo && !Number.isFinite(primera.cantidad) && resto.length && resto.every((f) => f.codigo.startsWith(primera.codigo))) {
    obra = { codigo: primera.codigo, descripcion: primera.descripcion };
    crudas.shift();
  }

  const jerarquicos = crudas.filter((f) => f.codigo).length > crudas.length * 0.9;
  const salida: FilaItem[] = [];
  const titulos: { codigo: string; ref: string }[] = [];
  let ultimoTitulo: string | null = null;

  for (const f of crudas) {
    const esTitulo = !Number.isFinite(f.cantidad);
    let padre: string | null = ultimoTitulo;
    if (jerarquicos) {
      padre = null;
      for (let k = titulos.length - 1; k >= 0; k--) {
        if (f.codigo.startsWith(titulos[k].codigo) && f.codigo !== titulos[k].codigo) {
          padre = titulos[k].ref;
          break;
        }
      }
    }
    salida.push({
      ref: f.ref,
      ref_padre: padre,
      codigo: f.codigo || null,
      numero: f.numero,
      descripcion: f.descripcion,
      unidad: esTitulo ? null : f.unidad || null,
      cantidad: esTitulo ? null : f.cantidad,
      es_titulo: esTitulo,
    });
    if (esTitulo) {
      titulos.push({ codigo: f.codigo, ref: f.ref });
      ultimoTitulo = f.ref;
    }
  }

  return { filas: salida, obra, versiones: [...new Set(crudas.map((f) => f.version).filter(Boolean))] };
}

/** Filas del Excel tal cual, para POST /obras/:id/items/importar. Sin código no se importan. */
export function filasParaImportar(filas: Celda[][], encabezado: number, mapeo: Mapeo): FilaItemizado[] {
  if (mapeo.descripcion === undefined || mapeo.codigo === undefined) return [];
  return filas
    .slice(encabezado + 1)
    .map((fila) => {
      const cantidad = mapeo.cantidad !== undefined ? aNumero(fila[mapeo.cantidad]) : NaN;
      return {
        codigo: texto(fila[mapeo.codigo!]),
        descripcion: texto(fila[mapeo.descripcion!]),
        version: mapeo.version !== undefined ? texto(fila[mapeo.version]) || null : null,
        cantidad: Number.isFinite(cantidad) ? cantidad : null,
        unidad: mapeo.unidad !== undefined ? texto(fila[mapeo.unidad]).slice(0, 20) || null : null,
      };
    })
    .filter((f) => f.codigo && f.descripcion);
}
