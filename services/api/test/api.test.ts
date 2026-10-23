// Prueba de punta a punta contra Postgres y Azurite locales con los datos de
// db/seed/desarrollo.sql. Requiere las variables de .env.example.

import { idParte, rutaFoto, rutaFotoPedido, rutaMiniatura } from '@registro-obra/contrato';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { prepararAlmacen } from '../src/archivos.ts';
import { pool } from '../src/db.ts';
import { crearServidor } from '../src/servidor.ts';

const OBRA = 'c0000000-0000-4000-8000-000000000001';
const JPG = await readFile(new URL('../../informes/ejemplo/fotos/f1.jpg', import.meta.url));
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
  const put = await abrir(subida.json.url, { method: 'PUT', headers: subida.json.encabezados, body: JPG });
  assert.ok(put.status >= 200 && put.status < 300, await put.texto()); // Azure 201, S3/R2 200

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
  assert.equal((await abrir(ver.json.urls[ruta])).status, 200);

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

test('informe del día: generar, publicar y PDF', async () => {
  const editor = await entrar('editor');
  const yoEditor = editor.yo.usuario.id;
  const items = (await pedir('GET', `/obras/${OBRA}/items`, editor.acceso)).json;
  const item = items.find((i: { es_titulo: boolean }) => !i.es_titulo);

  // El editor también puede subir fotos (desde la web).
  const parteId = idParte(OBRA, yoEditor, hoy());
  await pedir('PUT', `/partes/${parteId}`, editor.acceso, { obra_id: OBRA, fecha: hoy() });
  const fotoId = randomUUID();
  for (const ruta of [rutaFoto(OBRA, yoEditor, fotoId), rutaMiniatura(OBRA, yoEditor, fotoId)]) {
    const s = await pedir('POST', '/archivos/subida', editor.acceso, { ruta, content_type: 'image/jpeg' });
    const { status } = await abrir(s.json.url, { method: 'PUT', headers: s.json.encabezados, body: JPG });
    assert.ok(status >= 200 && status < 300);
  }
  const f = await pedir('PUT', `/fotos/${fotoId}`, editor.acceso, {
    parte_id: parteId, obra_id: OBRA, item_id: item.id, origen: 'web', tomada_en: new Date().toISOString(),
    archivo_path: rutaFoto(OBRA, yoEditor, fotoId), miniatura_path: rutaMiniatura(OBRA, yoEditor, fotoId),
    comentario: 'Hormigonado de zapata en el eje 3',
  });
  assert.equal(f.estado, 200, JSON.stringify(f.json));

  const gen = await pedir('POST', '/informes/generar', editor.acceso, { obra_id: OBRA, tipo: 'diario', fecha_desde: hoy(), forzar: true });
  assert.equal(gen.estado, 202, JSON.stringify(gen.json));
  const id = gen.json.informe_id;
  let inf;
  for (let i = 0; i < 50; i++) {
    inf = (await pedir('GET', `/informes/${id}`, editor.acceso)).json;
    if (inf.estado !== 'generando') break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal(inf.estado, 'borrador', inf.error);
  assert.ok(inf.contenido.avances.length > 0);

  const pub = await pedir('POST', `/informes/${id}/publicar`, editor.acceso);
  assert.equal(pub.estado, 200);
  const lector = await entrar('fiscal');
  assert.equal((await pedir('GET', `/informes/${id}`, lector.acceso)).estado, 200);

  if (process.env.CHROMIUM_PATH) {
    const pdf = await pedir('GET', `/informes/${id}/pdf`, editor.acceso);
    assert.equal(pdf.estado, 302);
    assert.match(await (await abrir(pdf.r.headers.location as string)).texto(), /^%PDF/);
  }
});

test('materiales: catálogo, pedido desde campo y planilla', async () => {
  const editor = await entrar('editor');
  const campo = await entrar('capataz');
  const lector = await entrar('fiscal');
  const filas = [
    { codigo: 'MAT-001', descripcion: 'Cemento CPII', unidad: 'BOLSA' },
    { codigo: 'MAT-002', descripcion: 'Arena lavada', unidad: 'M3' },
    { codigo: 'MAT-002', descripcion: 'Arena lavada (otro centro)', unidad: 'M3' }, // SAP repite por centro
  ];
  const archivo = { archivo_nombre: 'materiales.xlsx', filas };
  assert.equal((await pedir('POST', '/materiales/importar', campo.acceso, archivo)).estado, 403);
  const imp = await pedir('POST', '/materiales/importar', editor.acceso, archivo);
  assert.equal(imp.estado, 200, JSON.stringify(imp.json));
  assert.equal((await pedir('GET', '/materiales', editor.acceso)).json.length, 2);

  // Campo baja el catálogo sin el código.
  const sync = (await pedir('GET', `/obras/${OBRA}/sync`, campo.acceso)).json;
  const cemento = sync.materiales.find((m: { descripcion: string }) => m.descripcion === 'Cemento CPII');
  assert.ok(cemento);
  assert.equal(cemento.codigo, undefined);
  assert.equal(cemento.unidad, 'BOLSA');
  const item = sync.items.find((i: { es_titulo: boolean }) => !i.es_titulo);
  const titulo = sync.items.find((i: { es_titulo: boolean }) => i.es_titulo);

  const id = randomUUID();
  const p = { obra_id: OBRA, material_id: cemento.id, item_id: item.id, cantidad: 25, necesario_para: hoy(), pedido_en: new Date().toISOString() };
  assert.equal((await pedir('PUT', `/pedidos/${randomUUID()}`, campo.acceso, { ...p, item_id: titulo.id })).estado, 403);
  assert.equal((await pedir('PUT', `/pedidos/${randomUUID()}`, lector.acceso, p)).estado, 403);
  const r1 = await pedir('PUT', `/pedidos/${id}`, campo.acceso, p);
  assert.equal(r1.estado, 200, JSON.stringify(r1.json));
  const r2 = await pedir('PUT', `/pedidos/${id}`, campo.acceso, p); // reintento de la cola
  assert.equal(r2.estado, 200);

  // Volver a importar conserva el material y sus pedidos.
  await pedir('POST', '/materiales/importar', editor.acceso, { ...archivo, filas: [{ ...filas[0], descripcion: 'Cemento CP II' }] });

  for (const quien of [editor, lector]) {
    const lista = await pedir('GET', `/obras/${OBRA}/pedidos`, quien.acceso);
    assert.equal(lista.estado, 200);
    const fila = lista.json.find((x: { id: string }) => x.id === id);
    assert.equal(fila.material_codigo, 'MAT-001');
    assert.equal(fila.material_descripcion, 'Cemento CP II');
    assert.equal(fila.cantidad, 25);
    assert.equal(fila.autor_nombre, 'Capataz de prueba');
  }
  const catalogo = (await pedir('GET', '/materiales', editor.acceso)).json;
  assert.deepEqual(catalogo.map((m: { codigo: string }) => m.codigo), ['MAT-001']);

  // Material que no está en el catálogo, escrito a mano, con una foto de referencia.
  const yoCampo = campo.yo.usuario.id;
  const ruta = rutaFotoPedido(OBRA, yoCampo, randomUUID());
  const ajena = rutaFotoPedido(OBRA, editor.yo.usuario.id, randomUUID());
  assert.equal((await pedir('POST', '/archivos/subida', campo.acceso, { ruta: ajena, content_type: 'image/jpeg' })).estado, 403);
  const subida = await pedir('POST', '/archivos/subida', campo.acceso, { ruta, content_type: 'image/jpeg' });
  assert.equal(subida.estado, 200, JSON.stringify(subida.json));
  const put = await abrir(subida.json.url, { method: 'PUT', headers: subida.json.encabezados, body: JPG });
  assert.ok(put.status >= 200 && put.status < 300);
  const libre = { ...p, material_id: null, material_texto: 'Clavos 2 1/2"', unidad_texto: 'KG', fotos: [ruta] };
  assert.equal((await pedir('PUT', `/pedidos/${randomUUID()}`, campo.acceso, { ...libre, material_texto: ' ' })).estado, 422);
  assert.equal((await pedir('PUT', `/pedidos/${randomUUID()}`, campo.acceso, { ...libre, fotos: [ajena] })).estado, 403);
  const idLibre = randomUUID();
  const r3 = await pedir('PUT', `/pedidos/${idLibre}`, campo.acceso, libre);
  assert.equal(r3.estado, 200, JSON.stringify(r3.json));
  const fila = (await pedir('GET', `/obras/${OBRA}/pedidos`, lector.acceso)).json.find((x: { id: string }) => x.id === idLibre);
  assert.equal(fila.material_codigo, 'CREAR RECURSO EN SAP');
  assert.equal(fila.material_descripcion, 'Clavos 2 1/2"');
  assert.equal(fila.material_unidad, 'KG');
  assert.deepEqual(fila.fotos, [ruta]);
  const ver = await pedir('POST', '/archivos/ver', lector.acceso, { rutas: [ruta] });
  assert.equal((await abrir(ver.json.urls[ruta])).status, 200);
});
