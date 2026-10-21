// Prueba de punta a punta contra Postgres y Azurite locales con los datos de
// db/seed/desarrollo.sql. Requiere las variables de .env.example.

import { idParte, rutaFoto, rutaMiniatura } from '@registro-obra/contrato';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { prepararAlmacen } from '../src/archivos.ts';
import { pool } from '../src/db.ts';
import { crearServidor } from '../src/servidor.ts';

const OBRA = 'c0000000-0000-4000-8000-000000000001';
let app: Awaited<ReturnType<typeof crearServidor>>;

before(async () => {
  await prepararAlmacen();
  app = await crearServidor();
});
after(async () => {
  await app.close();
  await pool.end();
});

async function pedir(metodo: string, url: string, token?: string, body?: unknown) {
  const r = await app.inject({
    method: metodo as 'GET',
    url: `/api${url}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload: body as object,
  });
  return { estado: r.statusCode, json: r.body ? r.json() : null, r };
}

async function entrar(usuario: string, clave = 'obra1234') {
  const { estado, json } = await pedir('POST', '/auth/login', undefined, { usuario, clave, dispositivo: 'app' });
  assert.equal(estado, 200, JSON.stringify(json));
  return json as { acceso: string; renovacion: string; yo: { usuario: { id: string } } };
}

// Las URLs firmadas pueden apuntar a la propia API (SharePoint) o al almacenamiento.
async function abrir(url: string, init: { method?: string; headers?: Record<string, string>; body?: Buffer } = {}) {
  const local = url.match(/^http:\/\/localhost:\d+(\/api\/.*)$/);
  if (!local) {
    const r = await fetch(url, init);
    return { status: r.status, texto: () => r.text() };
  }
  const r = await app.inject({ method: (init.method ?? 'GET') as 'GET', url: local[1], headers: init.headers, payload: init.body });
  if (r.statusCode === 302) return abrir(r.headers.location as string);
  return { status: r.statusCode, texto: async () => r.body };
}

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Asuncion' });

test('login, permisos, fotos y sesiones', async () => {
  const mal = await pedir('POST', '/auth/login', undefined, { usuario: 'editor', clave: 'x', dispositivo: 'app' });
  assert.equal(mal.estado, 401);
  assert.equal(mal.json.error.codigo, 'credenciales_invalidas');

  const editor = await entrar('editor');
  const yo = await pedir('GET', '/yo', editor.acceso);
  assert.equal(yo.json.obras[0].rol, 'editor');

  // El editor crea un usuario de campo.
  const usuario = `cap${Date.now() % 100000}`;
  const creado = await pedir('POST', '/usuarios', editor.acceso, {
    usuario, nombre: 'Capataz Prueba', clave: 'campo123', rol: 'campo', obra_id: OBRA, cargo: 'capataz',
  });
  assert.equal(creado.estado, 200, JSON.stringify(creado.json));
  const campo = await entrar(usuario, 'campo123');
  const yoCampo = campo.yo.usuario.id;

  // Campo no administra.
  const intento = await pedir('POST', '/usuarios', campo.acceso, {
    usuario: 'otro123', nombre: 'x', clave: 'xxxxxx', rol: 'campo', obra_id: OBRA,
  });
  assert.equal(intento.estado, 403);

  // Sincronización.
  const sync = await pedir('GET', `/obras/${OBRA}/sync`, campo.acceso);
  assert.equal(sync.estado, 200);
  const item = sync.json.items.find((i: { es_titulo: boolean }) => !i.es_titulo);
  const titulo = sync.json.items.find((i: { es_titulo: boolean }) => i.es_titulo);
  assert.ok(item && titulo);

  // Parte, archivo y foto.
  const parteId = idParte(OBRA, yoCampo, hoy());
  const parte = await pedir('PUT', `/partes/${parteId}`, campo.acceso, { obra_id: OBRA, fecha: hoy(), notas: null });
  assert.equal(parte.estado, 200, JSON.stringify(parte.json));
  assert.equal((await pedir('PUT', `/partes/${parteId}`, campo.acceso, { obra_id: OBRA, fecha: hoy() })).estado, 200);

  const fotoId = randomUUID();
  const ruta = rutaFoto(OBRA, yoCampo, fotoId);
  const ajena = await pedir('POST', '/archivos/subida', campo.acceso, {
    ruta: rutaFoto(OBRA, editor.yo.usuario.id, fotoId), content_type: 'image/jpeg',
  });
  assert.equal(ajena.estado, 403);
  const subida = await pedir('POST', '/archivos/subida', campo.acceso, { ruta, content_type: 'image/jpeg' });
  assert.equal(subida.estado, 200);
  const put = await abrir(subida.json.url, { method: 'PUT', headers: subida.json.encabezados, body: Buffer.from('jpg') });
  assert.equal(put.status, 201, await put.texto());

  const foto = {
    parte_id: parteId, obra_id: OBRA, item_id: item.id, tomada_en: new Date().toISOString(),
    archivo_path: ruta, miniatura_path: rutaMiniatura(OBRA, yoCampo, fotoId), comentario: 'Excavación',
  };
  assert.equal((await pedir('PUT', `/fotos/${randomUUID()}`, campo.acceso, { ...foto, item_id: titulo.id })).estado, 403);
  const f1 = await pedir('PUT', `/fotos/${fotoId}`, campo.acceso, foto);
  assert.equal(f1.estado, 200, JSON.stringify(f1.json));
  const f2 = await pedir('PUT', `/fotos/${fotoId}`, campo.acceso, { ...foto, comentario: 'Corregido' });
  assert.equal(f2.json.comentario, 'Corregido');

  const anot = await pedir('PUT', `/anotaciones/${randomUUID()}`, campo.acceso, {
    foto_id: fotoId, obra_id: OBRA, numero: 1, tipo: 'circulo', geometria: { cx: 0.4, cy: 0.3, r: 0.1 }, comentario: 'Fisura',
  });
  assert.equal(anot.estado, 200, JSON.stringify(anot.json));

  const ver = await pedir('POST', '/archivos/ver', campo.acceso, { rutas: [ruta, 'fotos/otra/cosa.jpg'] });
  assert.deepEqual(Object.keys(ver.json.urls), [ruta]);
  assert.equal(await (await abrir(ver.json.urls[ruta])).texto(), 'jpg');

  // El lector no ve la carga cruda.
  const lector = await entrar('fiscal');
  assert.equal((await pedir('POST', '/archivos/ver', lector.acceso, { rutas: [ruta] })).json.urls[ruta], undefined);

  // Revisión del día y registro de clima y personal (solo editor).
  const reg = { clima: 'Soleado, 31 °C', hubo_lluvia: false, personal: [{ oficio: 'oficial', cantidad: 2 }] };
  assert.equal((await pedir('PUT', `/obras/${OBRA}/dia/${hoy()}/registro`, campo.acceso, reg)).estado, 403);
  assert.equal((await pedir('PUT', `/obras/${OBRA}/dia/${hoy()}/registro`, editor.acceso, reg)).estado, 200);
  const dia = await pedir('GET', `/obras/${OBRA}/dia/${hoy()}`, editor.acceso);
  assert.ok(dia.json.fotos.some((f: { id: string }) => f.id === fotoId));
  assert.equal(dia.json.registro.clima, 'Soleado, 31 °C');

  // Renovación rotativa.
  const ren = await pedir('POST', '/auth/renovar', undefined, { renovacion: campo.renovacion });
  assert.equal(ren.estado, 200);
  assert.equal((await pedir('POST', '/auth/renovar', undefined, { renovacion: campo.renovacion })).estado, 401);

  // Cambiar la contraseña corta las sesiones abiertas.
  await pedir('PATCH', `/usuarios/${yoCampo}`, editor.acceso, { clave: 'nueva123' });
  assert.equal((await pedir('GET', '/yo', ren.json.acceso)).estado, 401);
  assert.equal((await pedir('POST', '/auth/renovar', undefined, { renovacion: ren.json.renovacion })).estado, 401);
});

test('importación del itemizado SAP', async () => {
  const editor = await entrar('editor');
  const filas = [
    { codigo: 'OC.9999', descripcion: 'OBRA DE PRUEBA - FUNDACIONES' },
    { codigo: 'OC.9999D001', descripcion: 'TRABAJOS PRELIMINARES', version: 'V02', unidad: 'UN' },
    { codigo: 'OC.9999D00100101', descripcion: '1-CERRAMIENTO PERIMETRAL', version: 'V02', cantidad: 1, unidad: 'GLB' },
    { codigo: 'OC.9999D00100103', descripcion: '8-ITEM NUEVO', version: 'V02', cantidad: 5, unidad: 'M2' },
  ];
  const r = await pedir('POST', `/obras/${OBRA}/items/importar`, editor.acceso, { archivo_nombre: 'v2.xlsx', filas });
  assert.equal(r.estado, 200, JSON.stringify(r.json));
  assert.equal(r.json.version, 'V02');
  const items = (await pedir('GET', `/obras/${OBRA}/items`, editor.acceso)).json;
  const nuevo = items.find((i: { codigo: string }) => i.codigo === 'OC.9999D00100103');
  assert.equal(nuevo.numero, '8');
  assert.equal(nuevo.descripcion, 'ITEM NUEVO');
  assert.equal(nuevo.nivel, 2);
  assert.equal(items.length, 4);
});
