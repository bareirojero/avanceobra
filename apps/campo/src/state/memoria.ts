import type { FotoAnterior } from '@/domain/historial';

/**
 * Datos que pasan de una pantalla a otra sin ir por la URL: la foto recién sacada (ya
 * comprimida en disco, todavía sin guardar en la base) y los avisos cortos.
 */

export interface FotoNueva {
  id: string;
  archivoLocal: string;
  miniaturaLocal: string;
  ancho: number;
  alto: number;
  tomadaEn: string;
  latitud: number | null;
  longitud: number | null;
}

const nuevas = new Map<string, FotoNueva>();

export const fotosNuevas = {
  poner: (f: FotoNueva) => void nuevas.set(f.id, f),
  leer: (id: string) => nuevas.get(id) ?? null,
  quitar: (id: string) => void nuevas.delete(id),
};

/** La foto de un día anterior que se abrió desde Envíos (puede venir solo del servidor). */
const anteriores = new Map<string, FotoAnterior>();

export const fotosAnteriores = {
  poner: (f: FotoAnterior) => void anteriores.set(f.id, f),
  leer: (id: string) => anteriores.get(id) ?? null,
};

type OyenteAviso = (texto: string) => void;
const oyentesAviso = new Set<OyenteAviso>();

export function mostrarAviso(texto: string) {
  oyentesAviso.forEach((o) => o(texto));
}

export function escucharAvisos(oyente: OyenteAviso) {
  oyentesAviso.add(oyente);
  return () => void oyentesAviso.delete(oyente);
}
