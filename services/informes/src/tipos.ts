import { z } from "zod";

// ─── Entrada: lo que cargaron los usuarios de campo en el día ────────────────
// Subconjunto del contrato de Arquitectura (packages/contrato). El servicio de
// informes lo arma con consultas a fotos, anotaciones e ítems. Cuando el
// contrato esté en el monorepo, estos tipos se importan de ahí.

export type TipoAnotacion = "punto" | "circulo" | "rectangulo" | "flecha" | "trazo";

/** Coordenadas normalizadas 0..1; x a la derecha, y hacia abajo. */
export type Geometria =
  | { x: number; y: number }
  | { cx: number; cy: number; r: number }
  | { x: number; y: number; w: number; h: number }
  | { x1: number; y1: number; x2: number; y2: number }
  | { puntos: [number, number][] };

/** Marca numerada sobre la foto (opcional: el residente marca, el capataz suele solo escribir). */
export interface Anotacion {
  id: string;
  foto_id: string;
  numero: number;
  tipo: TipoAnotacion;
  geometria: Geometria;
  color?: string; // el que eligió el usuario al marcar
  comentario: string | null;
}

export interface Foto {
  id: string;
  autor_id: string;
  item_id: string; // obligatorio
  sector_id: string | null;
  tomada_en: string;
  archivo_path: string;
  comentario: string | null; // texto general debajo de la foto
}

/** Ítem del itemizado SAP. Las filas sin cantidad son títulos (rubros). */
export interface Item {
  id: string;
  padre_id: string | null;
  codigo: string; // elemento PEP: OC.0054D00200102
  numero: string | null; // prefijo del itemizado: "21"
  descripcion: string;
  unidad: string | null;
  es_titulo: boolean;
  previsto_en_fecha?: boolean; // según cronograma, si existe
}

export interface DatosDelDia {
  obra: {
    id: string;
    codigo: string; // OC.0054
    nombre: string; // ODD FUNDACIONES
    ubicacion?: string | null;
    notas_para_informe?: string | null;
  };
  fecha: string; // YYYY-MM-DD
  usuarios: { id: string; nombre: string; cargo: string | null }[];
  sectores: { id: string; nombre: string }[];
  items: Item[];
  fotos: Foto[];
  anotaciones: Anotacion[];
  /** Opcionales: no los carga el usuario de campo. */
  clima?: { descripcion: string; hubo_lluvia: boolean | null } | null;
  personal?: { oficio: string; cantidad: number; empresa?: string }[];
  resumen_dia_anterior?: string | null;
}

// ─── Salida: ContenidoInforme v3 (jsonb en informes.contenido_ia / contenido) ─
// v3 (respuestas de Jerónimo): un avance por ítem del itemizado, sin porcentajes.
// Se quitan avance_pct y nota_avance; item_id pasa a obligatorio.

export const FotoEnInforme = z.object({
  foto_id: z.string(),
  epigrafe: z.string().describe("Pie de foto de una línea, describe lo que se ve"),
  anotaciones: z.array(z.number()).describe("Números de las marcas que se dibujan sobre la foto; vacío si la foto no tiene marcas"),
});

export const Avance = z.object({
  id: z.string().describe("Estable: 'av-<item_id>'"),
  item_id: z.string(),
  titulo: z.string().describe("Descripción del ítem, con mayúscula inicial y el resto en minúsculas"),
  texto: z
    .string()
    .describe("Uno a tres párrafos. Une lo que dijeron distintas personas sobre el ítem y lo que se ve en las fotos. El avance va en palabras."),
  sector_ids: z.array(z.string()),
  fotos: z.array(FotoEnInforme),
  autores: z.array(z.string()).describe("ids de usuario que aportaron"),
  fuentes: z.object({ foto_ids: z.array(z.string()), anotacion_ids: z.array(z.string()) }),
});

export const Alerta = z.object({
  tipo: z.enum(["contradiccion", "falta_info", "seguridad", "calidad"]),
  texto: z.string(),
  foto_ids: z.array(z.string()),
  avance_id: z.string().nullable(),
});

export const Incidente = z.object({
  tipo: z.enum(["accidente", "demora", "faltante", "visita", "otro"]),
  texto: z.string(),
  fotos: z.array(FotoEnInforme),
});

/** Pasada 1, con visión: un grupo de ítems. */
export const BorradorGrupo = z.object({
  avances: z.array(Avance),
  alertas: z.array(Alerta),
});

/** Pasada 2, solo texto: cierre del día. */
export const Sintesis = z.object({
  resumen: z.string().describe("Tres a seis oraciones: qué se hizo hoy, qué preocupa, qué sigue."),
  alertas_generales: z.array(Alerta),
  incidentes: z.array(Incidente),
  pendientes: z.array(z.string()),
  observaciones: z.string().nullable(),
});

export const ContenidoInforme = z.object({
  version_esquema: z.literal(3),
  titulo: z.string(),
  resumen: z.string(),
  clima: z.object({ descripcion: z.string(), hubo_lluvia: z.boolean().nullable() }).nullable(),
  personal: z.array(z.object({ oficio: z.string(), cantidad: z.number(), empresa: z.string().optional() })),
  avances: z.array(Avance),
  incidentes: z.array(Incidente),
  pendientes: z.array(z.string()),
  observaciones: z.string().nullable(),
  autores: z.array(z.string()).describe("ids de usuario que cargaron fotos ese día"),
  alertas: z.array(Alerta),
  items_sin_registro: z.array(z.string()),
});

export type ContenidoInforme = z.infer<typeof ContenidoInforme>;
export type Avance = z.infer<typeof Avance>;
export type Alerta = z.infer<typeof Alerta>;
