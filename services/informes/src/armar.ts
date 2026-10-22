import { calcularItemsSinRegistro, fechaCorta } from "./generar.ts";
import { ContenidoInforme, type Alerta, type Avance, type DatosDelDia, type Foto } from "./tipos.ts";

/**
 * Arma el informe sin IA (costo cero): un avance por ítem, en el orden del
 * itemizado, con sus fotos y el comentario de cada una al pie, tal como lo
 * escribieron. El editor redacta el resumen y, si quiere, un texto por ítem.
 */
export function armarInforme(datos: DatosDelDia): ContenidoInforme {
  const orden = new Map(datos.items.map((i, n) => [i.id, n]));
  const usuario = (id: string) => datos.usuarios.find((u) => u.id === id)?.nombre ?? id;
  const marcasDe = (f: Foto) => datos.anotaciones.filter((a) => a.foto_id === f.id).sort((a, b) => a.numero - b.numero);

  const porItem = new Map<string, Foto[]>();
  const ordenadas = [...datos.fotos].sort(
    (a, b) => (orden.get(a.item_id) ?? 1e9) - (orden.get(b.item_id) ?? 1e9) || a.tomada_en.localeCompare(b.tomada_en),
  );
  for (const f of ordenadas) porItem.set(f.item_id, [...(porItem.get(f.item_id) ?? []), f]);

  const alertas: Alerta[] = [];
  const avances: Avance[] = [...porItem].map(([item_id, fotos]) => {
    const id = `av-${item_id}`;
    const item = datos.items.find((i) => i.id === item_id);

    for (const f of fotos) {
      const marcas = marcasDe(f);
      if (!f.comentario?.trim() && !marcas.some((a) => a.comentario?.trim())) {
        alertas.push({ tipo: "falta_info", texto: `Foto de ${usuario(f.autor_id)} sin comentario.`, foto_ids: [f.id], avance_id: id });
      }
      for (const a of marcas.filter((a) => !a.comentario?.trim())) {
        alertas.push({ tipo: "falta_info", texto: `La marca ${a.numero} no tiene comentario.`, foto_ids: [f.id], avance_id: id });
      }
    }

    return {
      id,
      item_id,
      titulo: item?.descripcion ?? item_id,
      texto: "", // los comentarios van al pie de cada foto; el editor puede sumar un texto
      sector_ids: [...new Set(fotos.map((f) => f.sector_id).filter((s): s is string => !!s))],
      fotos: fotos.map((f) => ({
        foto_id: f.id,
        epigrafe: f.comentario?.trim() ? capital(f.comentario.trim()) : "",
        anotaciones: marcasDe(f).map((a) => a.numero),
      })),
      autores: [...new Set(fotos.map((f) => f.autor_id))],
      fuentes: { foto_ids: fotos.map((f) => f.id), anotacion_ids: fotos.flatMap((f) => marcasDe(f).map((a) => a.id)) },
    };
  });

  const itemsSinRegistro = calcularItemsSinRegistro(datos);
  return ContenidoInforme.parse({
    version_esquema: 3,
    titulo: `Informe diario · ${datos.obra.codigo} – ${datos.obra.nombre} · ${fechaCorta(datos.fecha)}`,
    resumen: "", // lo escribe el editor
    clima: datos.clima ?? null,
    personal: datos.personal ?? [],
    avances,
    incidentes: [],
    pendientes: [],
    observaciones: null,
    autores: [...new Set(datos.fotos.map((f) => f.autor_id))],
    alertas,
    items_sin_registro: itemsSinRegistro,
  });
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
