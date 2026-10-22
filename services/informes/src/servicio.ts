import { armarInforme } from "./armar.ts";
import { MODELO, generarInforme, regenerarAvance, type LeerFoto } from "./generar.ts";
import { informePdf } from "./render/pdf.ts";
import { armarReferencias } from "./render/referencias.ts";
import type { ContenidoInforme, DatosDelDia } from "./tipos.ts";

/**
 * Lo que el módulo necesita de la base y del almacenamiento. Lo implementa
 * services/api (Postgres + Blob, o Supabase): así el informe no depende de
 * dónde viven los datos.
 */
export interface Almacen {
  datosDelDia(obra_id: string, fecha: string): Promise<DatosDelDia>;
  leerFoto: LeerFoto;
  informe(informe_id: string): Promise<{
    obra_id: string;
    fecha: string;
    numero: string; // correlativo, lo asigna la base al crear el informe
    contenido: ContenidoInforme | null;
    revisado_por: string | null; // nombre del editor que lo publicó
  }>;
  guardarBorrador(informe_id: string, contenido: ContenidoInforme, modelo: string | null): Promise<void>; // contenido_ia y contenido, estado borrador
  guardarError(informe_id: string, mensaje: string): Promise<void>;
  guardarContenido(informe_id: string, contenido: ContenidoInforme): Promise<void>; // solo contenido
  guardarPdf(informe_id: string, pdf: Buffer): Promise<string>; // devuelve la ruta
}

/** Con clave de la API de Claude en el entorno, redacta la IA; sin clave, se arma sin IA (costo cero). */
export const conIA = () => !!process.env.ANTHROPIC_API_KEY;

/** Genera el borrador. La API crea la fila en "generando" y llama esto sin esperar. */
export async function generar(almacen: Almacen, informe_id: string) {
  try {
    const inf = await almacen.informe(informe_id);
    const datos = await almacen.datosDelDia(inf.obra_id, inf.fecha);
    if (!datos.fotos.length) throw new Error("No hay fotos cargadas para ese día.");
    const contenido = conIA() ? await generarInforme(datos, almacen.leerFoto) : armarInforme(datos);
    await almacen.guardarBorrador(informe_id, contenido, conIA() ? MODELO : null);
  } catch (e) {
    await almacen.guardarError(informe_id, e instanceof Error ? e.message : String(e));
  }
}

/** Reescribe un avance con la indicación del editor y lo reemplaza en el contenido editado. */
export async function regenerar(almacen: Almacen, informe_id: string, avance_id: string, indicacion?: string) {
  if (!conIA()) throw new Error("Reescribir con IA no está disponible: el sistema funciona sin IA.");
  const inf = await almacen.informe(informe_id);
  const avance = inf.contenido?.avances.find((a) => a.id === avance_id);
  if (!inf.contenido || !avance) throw new Error("No existe ese avance en el informe.");
  const datos = await almacen.datosDelDia(inf.obra_id, inf.fecha);
  const nuevo = await regenerarAvance(datos, avance, almacen.leerFoto, indicacion);
  const contenido = { ...inf.contenido, avances: inf.contenido.avances.map((a) => (a.id === avance_id ? nuevo : a)) };
  await almacen.guardarContenido(informe_id, contenido);
  return nuevo;
}

/** PDF desde el contenido revisado. Solo PDF (Rp 9). */
export async function exportar(almacen: Almacen, informe_id: string) {
  const inf = await almacen.informe(informe_id);
  if (!inf.contenido) throw new Error("El informe todavía no tiene contenido.");
  const datos = await almacen.datosDelDia(inf.obra_id, inf.fecha);
  const ref = await armarReferencias(inf.contenido, datos, almacen.leerFoto, {
    numero: inf.numero,
    revisadoPor: inf.revisado_por ?? undefined,
  });
  return almacen.guardarPdf(informe_id, await informePdf(inf.contenido, ref));
}

export { armarInforme } from "./armar.ts";
export type { ContenidoInforme, DatosDelDia } from "./tipos.ts";
