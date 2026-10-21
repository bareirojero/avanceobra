// Aplica las migraciones de db/migrations en orden, una sola vez cada una.
// Uso: node db/migrar.mjs [--seed]   (usa DATABASE_ADMIN_URL)
// Con --seed carga además db/seed/desarrollo.sql (solo entornos de prueba).
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const dir = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_ADMIN_URL;
if (!url) throw new Error('Falta DATABASE_ADMIN_URL');

const cliente = new pg.Client({ connectionString: url });
await cliente.connect();
try {
  await cliente.query(`create table if not exists schema_migraciones (
    nombre text primary key, aplicada_en timestamptz not null default now())`);
  const hechas = new Set((await cliente.query('select nombre from schema_migraciones')).rows.map((r) => r.nombre));
  const archivos = (await readdir(join(dir, 'migrations'))).filter((f) => f.endsWith('.sql')).sort();
  for (const f of archivos) {
    if (hechas.has(f)) continue;
    const sql = await readFile(join(dir, 'migrations', f), 'utf8');
    await cliente.query('begin');
    try {
      await cliente.query(sql);
      await cliente.query('insert into schema_migraciones (nombre) values ($1)', [f]);
      await cliente.query('commit');
      console.log(`aplicada ${f}`);
    } catch (e) {
      await cliente.query('rollback');
      throw new Error(`${f}: ${e.message}`);
    }
  }
  if (process.argv.includes('--seed')) {
    await cliente.query(await readFile(join(dir, 'seed', 'desarrollo.sql'), 'utf8'));
    console.log('datos de desarrollo cargados');
  }
} finally {
  await cliente.end();
}
