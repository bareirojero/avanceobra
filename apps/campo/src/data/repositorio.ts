import {
  idParte,
  rutaFoto,
  rutaFotoPedido,
  rutaMiniatura,
  type Anotacion,
  type Foto,
  type Item,
  type MaterialCampo,
  type Obra,
  type AnotacionPedido,
  type FotoPedido,
  type ParteDiario,
  type PartePedido,
  type PedidoMaterial,
  type PedidoMaterialPedido,
  type RolObra,
} from '@registro-obra/contrato';
import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Marca } from '@/domain/marcas';

import { encolarArchivo, encolarUpsert } from './cola-local';
import { db, enTransaccion } from './db';

export const nuevoId = () => Crypto.randomUUID();
const ahoraIso = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Referencia: obras e ítems
// ---------------------------------------------------------------------------

export interface ObraMia extends Pick<Obra, 'id' | 'nombre' | 'codigo' | 'direccion'> {
  rol: RolObra;
  cargo: string | null;
}

export async function misObras(usuarioId: string): Promise<ObraMia[]> {
  return (await db()).getAllAsync<ObraMia>(
    `SELECT o.id, o.nombre, o.codigo, o.direccion, m.rol, m.cargo
       FROM obras o JOIN obra_miembros m ON m.obra_id = o.id
      WHERE m.usuario_id = ? AND m.rol IN ('campo', 'editor')
        AND o.eliminado_en IS NULL AND m.eliminado_en IS NULL
        AND COALESCE(o.estado, 'activa') IN ('activa', 'pausada')
      ORDER BY o.nombre`,
    usuarioId,
  );
}

export async function itemsDeObra(obraId: string): Promise<Item[]> {
  const filas = await (await db()).getAllAsync<Item & { es_titulo: number | boolean }>(
    'SELECT * FROM items WHERE obra_id = ? AND eliminado_en IS NULL ORDER BY orden',
    obraId,
  );
  return filas.map((f) => ({ ...f, es_titulo: !!f.es_titulo }));
}

/** Últimos ítems que usó esta persona en la obra, del más reciente al más viejo. */
export async function itemsRecientes(obraId: string, autorId: string, limite = 5): Promise<string[]> {
  const filas = await (await db()).getAllAsync<{ item_id: string }>(
    `SELECT item_id, MAX(creado_en) AS en FROM fotos
      WHERE obra_id = ? AND autor_id = ? AND item_id IS NOT NULL AND eliminado_en IS NULL
      GROUP BY item_id ORDER BY en DESC LIMIT ?`,
    obraId, autorId, limite,
  );
  return filas.map((f) => f.item_id);
}

// ---------------------------------------------------------------------------
// Parte diario
// ---------------------------------------------------------------------------

/**
 * Lo que se manda al servidor (PUT /api/partes/:id). El parte solo agrupa las fotos de la
 * persona en el día; la app de campo no carga notas.
 */
const parteParaSubir = (p: ParteDiario): PartePedido => ({ obra_id: p.obra_id, fecha: p.fecha, notas: p.notas });

/**
 * Busca el parte del día o lo crea (y encola su subida). Va dentro de una transacción.
 * El id es determinístico (idParte): si la misma persona carga el mismo día desde dos
 * teléfonos, los dos generan el mismo parte y el upsert los combina.
 */
async function asegurarParte(tx: SQLiteDatabase, obraId: string, autorId: string, fecha: string): Promise<ParteDiario> {
  const fila = await tx.getFirstAsync<ParteDiario>(
    'SELECT id, obra_id, autor_id, fecha, notas, creado_en, actualizado_en, eliminado_en FROM partes_diarios WHERE obra_id = ? AND autor_id = ? AND fecha = ?',
    obraId, autorId, fecha,
  );
  if (fila) return fila;
  const ahora = ahoraIso();
  const parte: ParteDiario = {
    id: idParte(obraId, autorId, fecha), obra_id: obraId, autor_id: autorId, fecha, notas: null,
    creado_en: ahora, actualizado_en: ahora, eliminado_en: null,
  };
  await tx.runAsync(
    `INSERT INTO partes_diarios (id, obra_id, autor_id, fecha, notas, creado_en, actualizado_en, eliminado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    parte.id, parte.obra_id, parte.autor_id, parte.fecha, parte.notas, parte.creado_en, parte.actualizado_en, parte.eliminado_en,
  );
  await encolarUpsert(tx, 'partes', parte.id, parteParaSubir(parte), [parte.id]);
  return parte;
}

// ---------------------------------------------------------------------------
// Fotos y marcas
// ---------------------------------------------------------------------------

export type EstadoEnvio = 'pendiente' | 'error' | 'subida';

export interface FotoLocal extends Foto {
  archivo_local: string | null;
  miniatura_local: string | null;
  marcas: number;
  estado: EstadoEnvio;
  error: string | null;
}

export const COLUMNAS_FOTO = `f.*,
    (SELECT COUNT(*) FROM anotaciones a WHERE a.foto_id = f.id AND a.eliminado_en IS NULL) AS marcas,
    (SELECT c.error FROM cola_salida c WHERE c.grupos LIKE '%"' || f.id || '"%' AND c.error IS NOT NULL LIMIT 1) AS error,
    EXISTS (SELECT 1 FROM cola_salida c WHERE c.grupos LIKE '%"' || f.id || '"%') AS en_cola`;
const SELECT_FOTO = `SELECT ${COLUMNAS_FOTO} FROM fotos f`;

export type FilaFoto = Omit<FotoLocal, 'estado'> & { en_cola: number };

export const fotoDeFila = ({ en_cola, ...f }: FilaFoto): FotoLocal => ({
  ...f,
  estado: f.error ? 'error' : en_cola ? 'pendiente' : 'subida',
});

export async function fotosDelDia(obraId: string, autorId: string, fecha: string): Promise<FotoLocal[]> {
  const filas = await (await db()).getAllAsync<FilaFoto>(
    `${SELECT_FOTO} JOIN partes_diarios p ON p.id = f.parte_id
      WHERE p.obra_id = ? AND p.autor_id = ? AND p.fecha = ? AND f.eliminado_en IS NULL
      ORDER BY f.tomada_en DESC`,
    obraId, autorId, fecha,
  );
  return filas.map(fotoDeFila);
}

export async function leerFoto(id: string): Promise<{ foto: FotoLocal; marcas: Marca[] } | null> {
  const base = await db();
  const fila = await base.getFirstAsync<FilaFoto>(`${SELECT_FOTO} WHERE f.id = ?`, id);
  if (!fila) return null;
  const anotaciones = await base.getAllAsync<Omit<Anotacion, 'geometria'> & { geometria: string }>(
    'SELECT * FROM anotaciones WHERE foto_id = ? ORDER BY numero',
    id,
  );
  return {
    foto: fotoDeFila(fila),
    marcas: anotaciones.map((a) => ({
      id: a.id,
      numero: a.numero,
      tipo: a.tipo,
      geometria: JSON.parse(a.geometria),
      comentario: a.comentario ?? '',
      eliminada: a.eliminado_en !== null,
    })),
  };
}

export interface FotoAGuardar {
  id: string;
  obraId: string;
  autorId: string;
  fecha: string;
  tomadaEn: string;
  archivoLocal: string;
  miniaturaLocal: string;
  ancho: number;
  alto: number;
  latitud: number | null;
  longitud: number | null;
  comentario: string;
  /** Obligatorio: cada foto va a un ítem del itemizado. */
  itemId: string;
  marcas: Marca[];
  /** Color de las marcas en el PDF y la web (el acento de la organización). */
  colorMarcas: string;
}

/**
 * Guarda (o vuelve a guardar) una foto con sus marcas, todo en una transacción, y
 * encola la subida en el orden que pide el contrato: parte, archivo, miniatura, fila de
 * la foto, filas de las marcas.
 */
export async function guardarFoto(d: FotoAGuardar): Promise<void> {
  await enTransaccion(async (tx) => {
    const parte = await asegurarParte(tx, d.obraId, d.autorId, d.fecha);
    const grupos = [parte.id, d.id];
    const previa = await tx.getFirstAsync<Foto>('SELECT * FROM fotos WHERE id = ?', d.id);
    const ahora = ahoraIso();

    const foto: Foto = {
      id: d.id,
      parte_id: previa?.parte_id ?? parte.id,
      obra_id: d.obraId,
      autor_id: d.autorId,
      item_id: d.itemId,
      sector_id: previa?.sector_id ?? null,
      origen: 'app',
      tomada_en: d.tomadaEn,
      latitud: d.latitud,
      longitud: d.longitud,
      archivo_path: rutaFoto(d.obraId, d.autorId, d.id),
      miniatura_path: rutaMiniatura(d.obraId, d.autorId, d.id),
      ancho: d.ancho,
      alto: d.alto,
      comentario: d.comentario.trim() || null,
      orden: previa?.orden ?? (await siguienteOrden(tx, parte.id)),
      descripcion_ia: previa?.descripcion_ia ?? null,
      creado_en: previa?.creado_en ?? ahora,
      actualizado_en: ahora,
      eliminado_en: null,
    };

    await tx.runAsync(
      `INSERT INTO fotos (id, parte_id, obra_id, autor_id, item_id, sector_id, origen, tomada_en, latitud, longitud,
         archivo_path, miniatura_path, ancho, alto, comentario, orden, descripcion_ia,
         creado_en, actualizado_en, eliminado_en, archivo_local, miniatura_local)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET item_id = excluded.item_id, comentario = excluded.comentario,
         actualizado_en = excluded.actualizado_en`,
      foto.id, foto.parte_id, foto.obra_id, foto.autor_id, foto.item_id, foto.sector_id, foto.origen, foto.tomada_en,
      foto.latitud, foto.longitud, foto.archivo_path, foto.miniatura_path, foto.ancho, foto.alto,
      foto.comentario, foto.orden, foto.descripcion_ia, foto.creado_en, foto.actualizado_en,
      foto.eliminado_en, d.archivoLocal, d.miniaturaLocal,
    );

    if (!previa) {
      // La foto no cambia después de sacada: los archivos se suben una sola vez.
      await encolarArchivo(tx, {
        tipo: 'subir_archivo', id: d.id, ruta: foto.archivo_path,
        uriLocal: d.archivoLocal, contentType: 'image/jpeg',
      }, grupos);
      await encolarArchivo(tx, {
        tipo: 'subir_archivo', id: `${d.id}_mini`, ruta: foto.miniatura_path,
        uriLocal: d.miniaturaLocal, contentType: 'image/jpeg',
      }, grupos);
    }
    await encolarUpsert(tx, 'fotos', foto.id, fotoParaSubir(foto), grupos);

    for (const m of d.marcas) {
      const previaMarca = await tx.getFirstAsync<Anotacion & { geometria: string }>(
        'SELECT * FROM anotaciones WHERE id = ?',
        m.id,
      );
      const anotacion: Anotacion = {
        id: m.id,
        foto_id: d.id,
        obra_id: d.obraId,
        autor_id: d.autorId,
        numero: m.numero,
        tipo: m.tipo,
        geometria: m.geometria,
        color: previaMarca?.color ?? d.colorMarcas,
        comentario: m.comentario.trim() || null,
        creado_en: previaMarca?.creado_en ?? ahora,
        actualizado_en: ahora,
        eliminado_en: m.eliminada ? (previaMarca?.eliminado_en ?? ahora) : null,
      };
      const sinCambios =
        previaMarca &&
        previaMarca.geometria === JSON.stringify(anotacion.geometria) &&
        previaMarca.comentario === anotacion.comentario &&
        previaMarca.eliminado_en === anotacion.eliminado_en;
      if (sinCambios) continue;

      await tx.runAsync(
        `INSERT INTO anotaciones (id, foto_id, obra_id, autor_id, numero, tipo, geometria, color, comentario,
           creado_en, actualizado_en, eliminado_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET geometria = excluded.geometria, comentario = excluded.comentario,
           actualizado_en = excluded.actualizado_en, eliminado_en = excluded.eliminado_en`,
        anotacion.id, anotacion.foto_id, anotacion.obra_id, anotacion.autor_id, anotacion.numero, anotacion.tipo,
        JSON.stringify(anotacion.geometria), anotacion.color, anotacion.comentario, anotacion.creado_en, anotacion.actualizado_en, anotacion.eliminado_en,
      );
      await encolarUpsert(tx, 'anotaciones', anotacion.id, anotacionParaSubir(anotacion), grupos);
    }
  });
}

/**
 * Lo que sube el teléfono (PUT /api/fotos/:id). Quedan afuera el id y el autor (van en la
 * ruta y en la sesión), las fechas (las pone el servidor), descripcion_ia (la escribe el
 * servidor) y las columnas que solo existen en el teléfono.
 */
const fotoParaSubir = (f: Foto): FotoPedido => ({
  parte_id: f.parte_id, obra_id: f.obra_id, item_id: f.item_id, sector_id: f.sector_id, origen: f.origen,
  tomada_en: f.tomada_en, latitud: f.latitud, longitud: f.longitud,
  archivo_path: f.archivo_path, miniatura_path: f.miniatura_path, ancho: f.ancho, alto: f.alto,
  comentario: f.comentario, orden: f.orden, eliminado_en: f.eliminado_en,
});

/** PUT /api/anotaciones/:id: la marca lleva su forma y su comentario; el ítem es el de la foto. */
const anotacionParaSubir = (a: Anotacion): AnotacionPedido => ({
  foto_id: a.foto_id, obra_id: a.obra_id, numero: a.numero, tipo: a.tipo, geometria: a.geometria,
  color: a.color, comentario: a.comentario, eliminado_en: a.eliminado_en,
});

async function siguienteOrden(tx: SQLiteDatabase, parteId: string): Promise<number> {
  const fila = await tx.getFirstAsync<{ n: number }>('SELECT COALESCE(MAX(orden), 0) + 1 AS n FROM fotos WHERE parte_id = ?', parteId);
  return fila?.n ?? 1;
}

/** Borrado lógico de una foto y sus marcas. Si todavía no se había subido, se sube igual marcada como eliminada. */
export async function eliminarFoto(id: string): Promise<void> {
  await enTransaccion(async (tx) => {
    const foto = await tx.getFirstAsync<Foto>('SELECT * FROM fotos WHERE id = ?', id);
    if (!foto) return;
    const ahora = ahoraIso();
    await tx.runAsync('UPDATE fotos SET eliminado_en = ?, actualizado_en = ? WHERE id = ?', ahora, ahora, id);
    await encolarUpsert(tx, 'fotos', id, fotoParaSubir({ ...foto, eliminado_en: ahora }), [foto.parte_id, id]);
  });
}

// ---------------------------------------------------------------------------
// Materiales
// ---------------------------------------------------------------------------

/** Catálogo de la organización, como lo bajó la sincronización (sin códigos). */
export async function materiales(): Promise<MaterialCampo[]> {
  return (await db()).getAllAsync<MaterialCampo>('SELECT * FROM materiales WHERE eliminado_en IS NULL ORDER BY orden');
}

export interface PedidoLocal extends Omit<PedidoMaterial, 'fotos'> {
  material: string;
  unidad: string | null;
  fotos: number;
  estado: EstadoEnvio;
  error: string | null;
}

/** Pedidos de esta persona en la obra (los hechos desde este teléfono), del más nuevo al más viejo. */
export async function misPedidos(obraId: string, autorId: string): Promise<PedidoLocal[]> {
  const filas = await (await db()).getAllAsync<Omit<PedidoLocal, 'estado' | 'fotos'> & { en_cola: number; fotos: string }>(
    `SELECT p.*, COALESCE(m.descripcion, p.material_texto, 'Material') AS material, COALESCE(m.unidad, p.unidad_texto) AS unidad,
       (SELECT c.error FROM cola_salida c WHERE c.grupos LIKE '%"' || p.id || '"%' AND c.error IS NOT NULL LIMIT 1) AS error,
       EXISTS (SELECT 1 FROM cola_salida c WHERE c.grupos LIKE '%"' || p.id || '"%') AS en_cola
     FROM pedidos_materiales p LEFT JOIN materiales m ON m.id = p.material_id
     WHERE p.obra_id = ? AND p.autor_id = ? AND p.eliminado_en IS NULL
     ORDER BY p.pedido_en DESC LIMIT 200`,
    obraId, autorId,
  );
  return filas.map(({ en_cola, fotos, ...p }) => ({
    ...p,
    fotos: (JSON.parse(fotos || '[]') as unknown[]).length,
    estado: p.error ? 'error' : en_cola ? 'pendiente' : 'subida',
  }));
}

export interface PedidoAGuardar {
  obraId: string;
  autorId: string;
  /** Del catálogo; null si el material se escribió a mano. */
  materialId: string | null;
  materialTexto: string | null;
  unidadTexto: string | null;
  itemId: string;
  cantidad: number;
  necesarioPara: string | null;
  /** Fotos de referencia ya comprimidas en el teléfono: id y archivo. */
  fotos: { id: string; archivoLocal: string }[];
}

/**
 * Guarda el pedido en el teléfono y encola su envío: primero las fotos de referencia,
 * después la fila (PUT /api/pedidos/:id).
 */
export async function guardarPedido(d: PedidoAGuardar): Promise<void> {
  const ahora = ahoraIso();
  const id = nuevoId();
  const fotos = d.fotos.map((f) => ({ ...f, ruta: rutaFotoPedido(d.obraId, d.autorId, f.id) }));
  const p: PedidoMaterial = {
    id, obra_id: d.obraId, autor_id: d.autorId, material_id: d.materialId,
    material_texto: d.materialId ? null : d.materialTexto, unidad_texto: d.materialId ? null : d.unidadTexto,
    item_id: d.itemId, cantidad: d.cantidad, necesario_para: d.necesarioPara, pedido_en: ahora,
    fotos: fotos.map((f) => f.ruta), creado_en: ahora, actualizado_en: ahora, eliminado_en: null,
  };
  const fila: PedidoMaterialPedido = {
    obra_id: p.obra_id, material_id: p.material_id, material_texto: p.material_texto, unidad_texto: p.unidad_texto,
    item_id: p.item_id, cantidad: p.cantidad, necesario_para: p.necesario_para, pedido_en: p.pedido_en, fotos: p.fotos,
  };
  await enTransaccion(async (tx) => {
    await tx.runAsync(
      `INSERT INTO pedidos_materiales (id, obra_id, autor_id, material_id, material_texto, unidad_texto, item_id, cantidad,
         necesario_para, pedido_en, fotos, creado_en, actualizado_en, eliminado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      p.id, p.obra_id, p.autor_id, p.material_id, p.material_texto, p.unidad_texto, p.item_id, p.cantidad,
      p.necesario_para, p.pedido_en, JSON.stringify(p.fotos), p.creado_en, p.actualizado_en, p.eliminado_en,
    );
    for (const f of fotos) {
      await encolarArchivo(tx, { tipo: 'subir_archivo', id: f.id, ruta: f.ruta, uriLocal: f.archivoLocal, contentType: 'image/jpeg' }, [id]);
    }
    await encolarUpsert(tx, 'pedidos', p.id, fila, [p.id]);
  });
}

// ---------------------------------------------------------------------------
// Envíos
// ---------------------------------------------------------------------------

export interface ResumenEnvios {
  fotosEsperando: number;
  fotosConError: number;
  /** Operaciones de cualquier tipo en la cola (parte, marcas...). */
  operaciones: number;
}

export async function resumenEnvios(): Promise<ResumenEnvios> {
  const base = await db();
  const r = await base.getFirstAsync<{ esperando: number; con_error: number; operaciones: number }>(
    `SELECT
       (SELECT COUNT(*) FROM fotos f WHERE f.eliminado_en IS NULL
          AND EXISTS (SELECT 1 FROM cola_salida c WHERE c.grupos LIKE '%"' || f.id || '"%')
          AND NOT EXISTS (SELECT 1 FROM cola_salida c WHERE c.grupos LIKE '%"' || f.id || '"%' AND c.error IS NOT NULL)
       ) AS esperando,
       (SELECT COUNT(*) FROM fotos f WHERE f.eliminado_en IS NULL
          AND EXISTS (SELECT 1 FROM cola_salida c WHERE c.grupos LIKE '%"' || f.id || '"%' AND c.error IS NOT NULL)
       ) AS con_error,
       (SELECT COUNT(*) FROM cola_salida) AS operaciones`,
  );
  return { fotosEsperando: r?.esperando ?? 0, fotosConError: r?.con_error ?? 0, operaciones: r?.operaciones ?? 0 };
}
