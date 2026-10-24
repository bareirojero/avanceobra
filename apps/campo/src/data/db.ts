import * as SQLite from 'expo-sqlite';

/**
 * Base local. Mismas columnas que la API (packages/contrato) para lo que se baja y se
 * sube, más:
 * - `_pendiente`: la fila tiene cambios que todavía no llegaron al servidor; la bajada
 *   no la pisa.
 * - `archivo_local` / `miniatura_local` en fotos: dónde está la imagen en el teléfono.
 * - `cola_salida` y `ajustes`, que solo existen en el teléfono.
 * Los campos jsonb se guardan como texto JSON. Los sectores no se bajan: la app de campo
 * no los usa.
 */
const MIGRACIONES: string[] = [
  `
  CREATE TABLE perfiles (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, usuario TEXT);
  CREATE TABLE obras (
    id TEXT PRIMARY KEY, organizacion_id TEXT, nombre TEXT NOT NULL, codigo TEXT, sigla TEXT, cliente TEXT,
    direccion TEXT, latitud REAL, longitud REAL, fecha_inicio TEXT, fecha_fin_prevista TEXT,
    estado TEXT, notas_para_informe TEXT,
    creado_en TEXT, actualizado_en TEXT, eliminado_en TEXT
  );
  CREATE TABLE obra_miembros (
    obra_id TEXT NOT NULL, usuario_id TEXT NOT NULL, rol TEXT NOT NULL, cargo TEXT,
    creado_en TEXT, actualizado_en TEXT, eliminado_en TEXT,
    PRIMARY KEY (obra_id, usuario_id)
  );
  CREATE TABLE items (
    id TEXT PRIMARY KEY, obra_id TEXT NOT NULL, padre_id TEXT, codigo TEXT NOT NULL, numero TEXT,
    descripcion TEXT NOT NULL, unidad TEXT, cantidad REAL, es_titulo INTEGER NOT NULL DEFAULT 0,
    nivel INTEGER NOT NULL DEFAULT 0, orden INTEGER NOT NULL DEFAULT 0,
    inicio_previsto TEXT, fin_previsto TEXT, importacion_id TEXT,
    creado_en TEXT, actualizado_en TEXT, eliminado_en TEXT
  );
  CREATE INDEX items_obra ON items (obra_id);
  CREATE TABLE partes_diarios (
    id TEXT PRIMARY KEY, obra_id TEXT NOT NULL, autor_id TEXT NOT NULL, fecha TEXT NOT NULL, notas TEXT,
    creado_en TEXT, actualizado_en TEXT, eliminado_en TEXT,
    _pendiente INTEGER NOT NULL DEFAULT 0
  );
  CREATE UNIQUE INDEX partes_dia ON partes_diarios (obra_id, autor_id, fecha);
  CREATE TABLE fotos (
    id TEXT PRIMARY KEY, parte_id TEXT NOT NULL, obra_id TEXT NOT NULL, autor_id TEXT NOT NULL,
    item_id TEXT NOT NULL, sector_id TEXT, origen TEXT NOT NULL DEFAULT 'app',
    tomada_en TEXT NOT NULL, latitud REAL, longitud REAL,
    archivo_path TEXT NOT NULL, miniatura_path TEXT NOT NULL, ancho INTEGER, alto INTEGER,
    comentario TEXT, orden INTEGER NOT NULL DEFAULT 0, descripcion_ia TEXT,
    creado_en TEXT, actualizado_en TEXT, eliminado_en TEXT,
    archivo_local TEXT, miniatura_local TEXT,
    _pendiente INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX fotos_parte ON fotos (parte_id);
  CREATE TABLE anotaciones (
    id TEXT PRIMARY KEY, foto_id TEXT NOT NULL, obra_id TEXT NOT NULL, autor_id TEXT NOT NULL,
    numero INTEGER NOT NULL, tipo TEXT NOT NULL, geometria TEXT NOT NULL, color TEXT NOT NULL, comentario TEXT,
    creado_en TEXT, actualizado_en TEXT, eliminado_en TEXT,
    _pendiente INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX anotaciones_foto ON anotaciones (foto_id);
  CREATE TABLE cola_salida (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    op TEXT NOT NULL,
    tipo TEXT NOT NULL,
    tabla TEXT,
    fila_id TEXT NOT NULL,
    grupos TEXT NOT NULL,
    intentos INTEGER NOT NULL DEFAULT 0,
    proximo_intento INTEGER NOT NULL DEFAULT 0,
    rev INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    ultimo_error TEXT
  );
  CREATE INDEX cola_fila ON cola_salida (tabla, fila_id);
  CREATE TABLE ajustes (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);
  `,
  // Materiales: catálogo de la organización (sin código) y pedidos hechos desde el teléfono.
  `
  CREATE TABLE materiales (
    id TEXT PRIMARY KEY, descripcion TEXT NOT NULL, unidad TEXT, orden INTEGER NOT NULL DEFAULT 0,
    creado_en TEXT, actualizado_en TEXT, eliminado_en TEXT
  );
  CREATE TABLE pedidos_materiales (
    id TEXT PRIMARY KEY, obra_id TEXT NOT NULL, autor_id TEXT NOT NULL, material_id TEXT NOT NULL,
    item_id TEXT NOT NULL, cantidad REAL NOT NULL, necesario_para TEXT, pedido_en TEXT NOT NULL,
    creado_en TEXT, actualizado_en TEXT, eliminado_en TEXT,
    _pendiente INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX pedidos_obra ON pedidos_materiales (obra_id, pedido_en);
  `,
  // Pedidos con material escrito a mano (sin material_id) y fotos de referencia (JSON).
  `
  CREATE TABLE pedidos_nueva (
    id TEXT PRIMARY KEY, obra_id TEXT NOT NULL, autor_id TEXT NOT NULL, material_id TEXT,
    material_texto TEXT, unidad_texto TEXT,
    item_id TEXT NOT NULL, cantidad REAL NOT NULL, necesario_para TEXT, pedido_en TEXT NOT NULL,
    fotos TEXT NOT NULL DEFAULT '[]',
    creado_en TEXT, actualizado_en TEXT, eliminado_en TEXT,
    _pendiente INTEGER NOT NULL DEFAULT 0
  );
  INSERT INTO pedidos_nueva (id, obra_id, autor_id, material_id, item_id, cantidad, necesario_para, pedido_en,
    creado_en, actualizado_en, eliminado_en, _pendiente)
  SELECT id, obra_id, autor_id, material_id, item_id, cantidad, necesario_para, pedido_en,
    creado_en, actualizado_en, eliminado_en, _pendiente FROM pedidos_materiales;
  DROP TABLE pedidos_materiales;
  ALTER TABLE pedidos_nueva RENAME TO pedidos_materiales;
  CREATE INDEX pedidos_obra ON pedidos_materiales (obra_id, pedido_en);
  `,
  // Categoría del ítem: 'obra' (del Excel) o las entradas fijas incidente, dron y pluviometro.
  `ALTER TABLE items ADD COLUMN categoria TEXT NOT NULL DEFAULT 'obra';`,
  // Estado del pedido (lo marca el editor en la web). Los que ya estaban quedan como enviados.
  `
  ALTER TABLE pedidos_materiales ADD COLUMN estado TEXT NOT NULL DEFAULT 'enviado';
  ALTER TABLE pedidos_materiales ADD COLUMN estado_cambiado_en TEXT;
  `,
];

/** Espera de hasta 20 s si otra conexión está escribiendo (la sincronización) en vez de fallar. */
const ESPERA_BLOQUEO = 'PRAGMA busy_timeout = 20000';

let abierta: Promise<SQLite.SQLiteDatabase> | null = null;

export function db(): Promise<SQLite.SQLiteDatabase> {
  abierta ??= (async () => {
    const base = await SQLite.openDatabaseAsync('avance-obra.db');
    await base.execAsync(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF; ${ESPERA_BLOQUEO};`);
    await migrar(base);
    return base;
  })();
  return abierta;
}

async function migrar(base: SQLite.SQLiteDatabase) {
  const fila = await base.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const actual = fila?.user_version ?? 0;
  for (let v = actual; v < MIGRACIONES.length; v++) {
    await base.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(MIGRACIONES[v]);
      await tx.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

/**
 * Transacción exclusiva (una conexión aparte). La conexión nueva no trae la espera por
 * bloqueo: sin ella, guardar mientras la sincronización escribe falla con "database is
 * locked". Si igual choca (lectura que pasa a escritura), reintenta.
 */
export async function enTransaccion(tarea: (tx: SQLite.SQLiteDatabase) => Promise<void>): Promise<void> {
  const base = await db();
  for (let intento = 1; ; intento++) {
    try {
      await base.withExclusiveTransactionAsync(async (tx) => {
        await tx.execAsync(ESPERA_BLOQUEO);
        await tarea(tx);
      });
      return;
    } catch (e) {
      if (intento >= 4 || !/locked|busy/i.test(String(e))) throw e;
      await new Promise((r) => setTimeout(r, 500 * intento));
    }
  }
}

/** Borra todo lo local (al cerrar sesión). Las fotos en disco las borra quien llama. */
export async function vaciarBase() {
  const base = await db();
  await base.execAsync(`
    DELETE FROM perfiles; DELETE FROM obras; DELETE FROM obra_miembros; DELETE FROM items;
    DELETE FROM partes_diarios; DELETE FROM fotos; DELETE FROM anotaciones;
    DELETE FROM materiales; DELETE FROM pedidos_materiales;
    DELETE FROM cola_salida; DELETE FROM ajustes;
  `);
}

export async function leerAjuste(clave: string): Promise<string | null> {
  const fila = await (await db()).getFirstAsync<{ valor: string }>('SELECT valor FROM ajustes WHERE clave = ?', clave);
  return fila?.valor ?? null;
}

export async function guardarAjuste(clave: string, valor: string) {
  await (await db()).runAsync(
    'INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor',
    clave,
    valor,
  );
}
