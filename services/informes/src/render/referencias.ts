import { readFile } from "node:fs/promises";
import { fotoAnotada } from "../anotar.ts";
import { fechaCorta, fechaLarga, rubro, type LeerFoto } from "../generar.ts";
import type { ContenidoInforme, DatosDelDia } from "../tipos.ts";

/** Colores del sistema de diseño (packages/ui-tokens) y datos fijos del encabezado. */
export interface Marca {
  empresa: string; // "TECNOEDIL S.A. CONSTRUCTORA"
  acento: string;
  acentoSuave: string;
  tinta: string;
  tenue: string; // texto secundario (pasa 4.5:1 sobre blanco)
  linea: string;
  fondo: string;
  logo: string; // data URI del ícono de Avance de Obra
}

/** Todo lo que el PDF necesita resolver a partir de ids. */
export interface Referencias {
  obra: DatosDelDia["obra"];
  marca: Marca;
  numero: string; // correlativo del informe: ODD-001-001
  fechaLarga: string;
  fechaCorta: string;
  pie: string;
  usuario(id: string): string | undefined;
  sector(id: string): string | undefined;
  item(id: string): { numero: string | null; codigo: string; descripcion: string; rubro: string } | undefined;
  anotacion(foto_id: string, numero: number): { comentario: string | null } | undefined;
  foto(id: string): { autor: string; hora: string; comentario: string | null } | undefined;
  imagen(id: string): string; // data URI de la foto con sus marcas
}

const LOGO = new URL("../../activos/logo.png", import.meta.url);

export async function marcaPorDefecto(): Promise<Marca> {
  return {
    empresa: "TECNOEDIL S.A. CONSTRUCTORA",
    acento: "#FFC20E",
    acentoSuave: "#FFF6D6",
    tinta: "#15181C",
    tenue: "#4A4E55",
    linea: "#D9D7D0",
    fondo: "#F3F2EE",
    logo: `data:image/png;base64,${(await readFile(LOGO)).toString("base64")}`,
  };
}

export async function armarReferencias(
  contenido: ContenidoInforme,
  datos: DatosDelDia,
  leerFoto: LeerFoto,
  opciones: { numero: string; marca?: Marca; revisadoPor?: string },
): Promise<Referencias> {
  // Solo se dibujan las marcas que el informe cita en cada foto.
  const imagenes = new Map<string, Buffer>();
  const usadas = [...contenido.avances.flatMap((a) => a.fotos), ...contenido.incidentes.flatMap((i) => i.fotos)];
  for (const f of usadas) {
    if (imagenes.has(f.foto_id)) continue;
    const foto = datos.fotos.find((x) => x.id === f.foto_id);
    if (!foto) continue;
    const marcas = datos.anotaciones.filter((a) => a.foto_id === f.foto_id && f.anotaciones.includes(a.numero));
    imagenes.set(f.foto_id, await fotoAnotada(await leerFoto(foto.archivo_path), marcas, 1400));
  }

  const usuarios = new Map(datos.usuarios.map((u) => [u.id, u.nombre]));
  return {
    obra: datos.obra,
    marca: opciones.marca ?? (await marcaPorDefecto()),
    numero: opciones.numero,
    fechaLarga: fechaLarga(datos.fecha),
    fechaCorta: fechaCorta(datos.fecha),
    pie: opciones.revisadoPor
      ? `Avance de Obra · Redactado con asistencia de IA a partir de los registros de campo. Revisado por ${opciones.revisadoPor}.`
      : "Avance de Obra · Borrador redactado con asistencia de IA a partir de los registros de campo. Pendiente de revisión.",
    usuario: (id) => usuarios.get(id),
    sector: (id) => datos.sectores.find((s) => s.id === id)?.nombre,
    item: (id) => {
      const i = datos.items.find((x) => x.id === id);
      return i && { numero: i.numero, codigo: i.codigo, descripcion: i.descripcion, rubro: rubro(datos.items, i) };
    },
    anotacion: (foto_id, numero) => datos.anotaciones.find((x) => x.foto_id === foto_id && x.numero === numero),
    foto: (id) => {
      const f = datos.fotos.find((x) => x.id === id);
      if (!f) return undefined;
      const hora = new Date(f.tomada_en).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", timeZone: "America/Asuncion" });
      return { autor: usuarios.get(f.autor_id) ?? "", hora, comentario: f.comentario };
    },
    imagen: (id) => {
      const b = imagenes.get(id);
      return b ? `data:image/jpeg;base64,${b.toString("base64")}` : "";
    },
  };
}
