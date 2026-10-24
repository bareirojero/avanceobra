"use client";
// Cola de envíos de la versión web de campo (iPhone). Cada foto o pedido se guarda primero
// en el celular (IndexedDB) y se envía solo; si no hay señal queda esperando y se reintenta
// al volver la conexión, al abrir la página y cada minuto. Los ids se generan acá y la API
// es idempotente, así que reintentar nunca duplica nada.
import { useSyncExternalStore } from "react";
import { idParte, rutaFoto, rutaFotoPedido, rutaMiniatura, type PedidoMaterialPedido } from "@registro-obra/contrato";
import { api, ErrorDeApi } from "./api";
import { subirArchivo } from "./imagen";

interface Base {
  id: string;
  obraId: string;
  autorId: string;
  creado: number;
  /** Lo rechazó el servidor: no se reintenta solo. */
  error?: string;
}

export interface EnvioFoto extends Base {
  tipo: "foto";
  fecha: string;
  itemId: string;
  comentario: string | null;
  tomadaEn: string;
  latitud: number | null;
  longitud: number | null;
  ancho: number;
  alto: number;
  grande: Blob;
  mini: Blob;
}

export interface EnvioPedido extends Base {
  tipo: "pedido";
  pedido: Omit<PedidoMaterialPedido, "fotos">;
  /** Para mostrarlo mientras espera. */
  material: string;
  unidad: string | null;
  fotos: { id: string; blob: Blob }[];
}

export type Envio = EnvioFoto | EnvioPedido;

// --- IndexedDB (con respaldo en memoria si el navegador no lo deja usar) ---

let memoria: Map<string, Envio> | null = null;
let base: Promise<IDBDatabase> | null = null;

function abrir() {
  base ??= new Promise((ok, mal) => {
    const r = indexedDB.open("reporte-campo", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("envios", { keyPath: "id" });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
  return base;
}

async function tienda<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir();
  return new Promise((ok, mal) => {
    const tx = db.transaction("envios", modo);
    const r = fn(tx.objectStore("envios"));
    tx.oncomplete = () => ok(r.result);
    tx.onerror = () => mal(tx.error);
  });
}

async function leerTodo(): Promise<Envio[]> {
  if (!memoria) {
    try {
      return await tienda("readonly", (s) => s.getAll() as IDBRequest<Envio[]>);
    } catch {
      memoria = new Map();
    }
  }
  return [...memoria.values()];
}

async function escribir(e: Envio) {
  if (!memoria) {
    try {
      await tienda("readwrite", (s) => s.put(e));
      return;
    } catch {
      memoria = new Map();
    }
  }
  memoria.set(e.id, e);
}

async function borrar(id: string) {
  if (memoria) memoria.delete(id);
  else await tienda("readwrite", (s) => s.delete(id)).catch(() => {});
}

// --- Estado para las pantallas ---

export interface EstadoCola {
  envios: Envio[];
  enviando: boolean;
  sinSenal: boolean;
  /** La sesión venció: hay que volver a ingresar (lo guardado no se pierde). */
  sinSesion: boolean;
}

let estado: EstadoCola = { envios: [], enviando: false, sinSenal: false, sinSesion: false };
const oyentes = new Set<() => void>();

function publicar(cambios: Partial<EstadoCola>) {
  estado = { ...estado, ...cambios };
  oyentes.forEach((o) => o());
}

/** Solo se muestra y se envía lo de quien tiene la sesión (el celular puede cambiar de manos). */
let usuario: string | null = null;
const delUsuario = async () => (await leerTodo()).filter((e) => e.autorId === usuario).sort((a, b) => a.creado - b.creado);

async function refrescar() {
  publicar({ envios: await delUsuario() });
}

/** Con la sesión (re)cargada: el usuario es otro o volvió a ingresar. */
export function fijarUsuario(id: string) {
  usuario = id;
  publicar({ sinSesion: false });
  void refrescar().then(() => enviar());
}

let iniciada = false;
function iniciar() {
  if (iniciada || typeof window === "undefined") return;
  iniciada = true;
  window.addEventListener("online", () => void enviar());
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void enviar());
  setInterval(() => void enviar(), 60_000);
}

export function useCola(): EstadoCola {
  return useSyncExternalStore(
    (o) => {
      iniciar();
      oyentes.add(o);
      return () => void oyentes.delete(o);
    },
    () => estado,
    () => estado,
  );
}

// --- Operaciones ---

export async function guardarEnvio(e: Envio) {
  await escribir(e);
  await refrescar();
  void enviar();
}

export async function cambiarEnvio(id: string, cambios: Partial<Pick<EnvioFoto, "itemId" | "comentario">>) {
  const e = (await leerTodo()).find((x) => x.id === id);
  if (e?.tipo !== "foto") return;
  await escribir({ ...e, ...cambios, error: undefined });
  await refrescar();
  void enviar();
}

export async function descartarEnvio(id: string) {
  await borrar(id);
  await refrescar();
}

export async function reintentar(id: string) {
  const e = (await leerTodo()).find((x) => x.id === id);
  if (e) await escribir({ ...e, error: undefined });
  publicar({ sinSesion: false });
  await refrescar();
  void enviar();
}

/** Se llama al terminar de enviar cada cosa (para refrescar las listas del servidor). */
const alEnviar = new Set<(e: Envio) => void>();
export function escucharEnviados(fn: (e: Envio) => void) {
  alEnviar.add(fn);
  return () => void alEnviar.delete(fn);
}

let enCurso: Promise<void> | null = null;

export function enviar(): Promise<void> {
  enCurso ??= correr().finally(() => (enCurso = null));
  return enCurso;
}

async function correr() {
  publicar({ enviando: true });
  try {
    // Lo que se guarda mientras se envía entra en la misma pasada.
    for (;;) {
      if (estado.sinSesion || !usuario) return;
      const e = (await delUsuario()).find((x) => !x.error);
      if (!e) return publicar({ sinSenal: false });
      try {
        await (e.tipo === "foto" ? subirFoto(e) : subirPedido(e));
        await borrar(e.id);
        alEnviar.forEach((fn) => fn(e));
        publicar({ sinSenal: false });
      } catch (err) {
        if (err instanceof ErrorDeApi && err.estado === 401) return publicar({ sinSesion: true });
        if (err instanceof ErrorDeApi && err.estado >= 400 && err.estado < 500) {
          await escribir({ ...e, error: err.message || `Error ${err.estado}` });
          continue;
        }
        // Sin señal o el servidor despertando: se reintenta más tarde, en orden.
        return publicar({ sinSenal: true });
      } finally {
        await refrescar();
      }
    }
  } finally {
    publicar({ enviando: false });
  }
}

async function subirFoto(f: EnvioFoto) {
  const parte = idParte(f.obraId, f.autorId, f.fecha);
  await api.guardarParte(parte, { obra_id: f.obraId, fecha: f.fecha, notas: null });
  await subirArchivo(rutaFoto(f.obraId, f.autorId, f.id), f.grande);
  await subirArchivo(rutaMiniatura(f.obraId, f.autorId, f.id), f.mini);
  await api.guardarFoto(f.id, {
    parte_id: parte,
    obra_id: f.obraId,
    item_id: f.itemId,
    sector_id: null,
    origen: "web",
    tomada_en: f.tomadaEn,
    latitud: f.latitud,
    longitud: f.longitud,
    archivo_path: rutaFoto(f.obraId, f.autorId, f.id),
    miniatura_path: rutaMiniatura(f.obraId, f.autorId, f.id),
    ancho: f.ancho,
    alto: f.alto,
    comentario: f.comentario,
    orden: 0,
    eliminado_en: null,
  });
  // Si la corrigieron en el celular mientras se subía, se manda la corrección.
  const ahora = (await leerTodo()).find((x) => x.id === f.id);
  if (ahora?.tipo === "foto" && (ahora.itemId !== f.itemId || ahora.comentario !== f.comentario)) {
    await api.cambiarFoto(f.id, { item_id: ahora.itemId, comentario: ahora.comentario });
  }
}

async function subirPedido(p: EnvioPedido) {
  const rutas = p.fotos.map((f) => rutaFotoPedido(p.obraId, p.autorId, f.id));
  for (const [i, f] of p.fotos.entries()) await subirArchivo(rutas[i], f.blob);
  await api.guardarPedido(p.id, { ...p.pedido, fotos: rutas });
}
