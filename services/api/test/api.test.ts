// Prueba de punta a punta contra Postgres y Azurite locales con los datos de
// db/seed/desarrollo.sql. Requiere las variables de .env.example.

import { idParte, rutaFoto, rutaFotoPedido, rutaMiniatura } from '@registro-obra/contrato';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { prepararAlmacen } from '../src/archivos.ts';
import { conUsuario, pool } from '../src/db.ts';
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

  // Envíos: mis fotos de todos los días, con URLs y marcas; nada de otros autores.
  const mias = await pedir('GET', `/obras/${OBRA}/mis-fotos`, campo.acceso);
  assert.equal(mias.estado, 200, JSON.stringify(mias.json));
  assert.equal(mias.json.dias[0].fecha, hoy());
  const mia = mias.json.dias[0].fotos.find((f: { id: string }) => f.id === fotoId);
  assert.equal(mia.anotaciones.length, 1);
  assert.equal(typeof mia.miniatura_url, 'string');
  assert.equal((await abrir(mia.archivo_url)).status, 200);
  assert.ok(mias.json.dias.every((d: { fotos: { autor_id: string }[] }) => d.fotos.every((f) => f.autor_id === yoCampo)));
  const anteriores = await pedir('GET', `/obras/${OBRA}/mis-fotos?antes=${hoy()}`, campo.acceso);
  assert.ok(!anteriores.json.dias.some((d: { fecha: string }) => d.fecha === hoy()));
  const delEditor = await pedir('GET', `/obras/${OBRA}/mis-fotos?dias=31`, editor.acceso);
  assert.ok(!delEditor.json.dias.some((d: { fotos: { id: string }[] }) => d.fotos.some((f) => f.id === fotoId)));
  assert.equal((await pedir('GET', `/obras/${OBRA}/mis-fotos?dias=99`, campo.acceso)).estado, 422);

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

  // El editor corrige la foto y una marca; cada cambio queda en el historial.
  const sectores = (await pedir('GET', `/obras/${OBRA}/sectores`, editor.acceso)).json;
  const corr = await pedir('PATCH', `/fotos/${fotoId}`, editor.acceso, {
    comentario: '  Excavación de zanja, eje A  ', sector_id: sectores[0].id, motivo: 'Faltaba el eje',
  });
  assert.equal(corr.estado, 200, JSON.stringify(corr.json));
  assert.equal(corr.json.comentario, 'Excavación de zanja, eje A');
  assert.equal(corr.json.item_id, item.id); // lo que no se manda no cambia
  assert.equal((await pedir('PATCH', `/fotos/${fotoId}`, editor.acceso, { item_id: titulo.id })).estado, 403);
  assert.equal((await pedir('PATCH', `/fotos/${fotoId}`, editor.acceso, { sector_id: randomUUID() })).estado, 422);
  const marca = await pedir('PATCH', `/anotaciones/${anot.json.id}`, editor.acceso, { comentario: 'Fisura en el muro' });
  assert.equal(marca.json.comentario, 'Fisura en el muro');
  // Reenviar lo mismo (la app reintenta) no deja registro.
  assert.equal((await pedir('PUT', `/fotos/${fotoId}`, campo.acceso, { ...foto, comentario: corr.json.comentario, sector_id: sectores[0].id })).estado, 200);

  const borrada = await pedir('PATCH', `/fotos/${fotoId}`, editor.acceso, { eliminada: true, motivo: 'Foto repetida' });
  assert.ok(borrada.json.eliminado_en);
  const diaCampo = await pedir('GET', `/obras/${OBRA}/dia/${hoy()}`, campo.acceso);
  assert.ok(!diaCampo.json.fotos.some((f: { id: string }) => f.id === fotoId)); // campo no ve las borradas
  const diaEditor = await pedir('GET', `/obras/${OBRA}/dia/${hoy()}`, editor.acceso);
  assert.ok(diaEditor.json.fotos.some((f: { id: string; eliminado_en: string | null }) => f.id === fotoId && f.eliminado_en));
  assert.equal((await pedir('PATCH', `/fotos/${fotoId}`, editor.acceso, { eliminada: false })).json.eliminado_en, null);

  // Historial de obra: fotos vigentes de varios días, filtradas por ítem, persona y fechas.
  const desde = new Date(Date.now() - 90 * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Asuncion' });
  const deItem = await pedir('GET', `/obras/${OBRA}/historial?desde=${desde}&hasta=${hoy()}&item=${item.id}`, editor.acceso);
  assert.equal(deItem.estado, 200, JSON.stringify(deItem.json));
  const enHistorial = deItem.json.fotos.find((f: { id: string }) => f.id === fotoId);
  assert.equal(enHistorial?.fecha, hoy());
  assert.ok(deItem.json.fotos.every((f: { item_id: string }) => f.item_id === item.id));
  assert.ok(deItem.json.anotaciones.some((a: { id: string }) => a.id === anot.json.id));
  assert.equal(deItem.json.registros.find((r: { fecha: string }) => r.fecha === hoy())?.clima, 'Soleado, 31 °C');
  assert.equal(deItem.json.truncado, false);
  // El título que agrupa al ítem trae también sus fotos; otro ítem, no.
  if (item.padre_id) {
    const deTitulo = await pedir('GET', `/obras/${OBRA}/historial?desde=${desde}&hasta=${hoy()}&item=${item.padre_id}`, editor.acceso);
    assert.ok(deTitulo.json.fotos.some((f: { id: string }) => f.id === fotoId));
  }
  const otro = sync.json.items.find((i: { id: string; es_titulo: boolean }) => !i.es_titulo && i.id !== item.id);
  const deOtro = await pedir('GET', `/obras/${OBRA}/historial?desde=${desde}&hasta=${hoy()}&item=${otro.id}`, editor.acceso);
  assert.ok(!deOtro.json.fotos.some((f: { id: string }) => f.id === fotoId));
  const deNadie = await pedir('GET', `/obras/${OBRA}/historial?desde=${desde}&hasta=${hoy()}&persona=${editor.yo.usuario.id}`, editor.acceso);
  assert.ok(!deNadie.json.fotos.some((f: { id: string }) => f.id === fotoId));
  const antes = await pedir('GET', `/obras/${OBRA}/historial?desde=2020-01-01&hasta=2020-01-31`, editor.acceso);
  assert.deepEqual(antes.json.fotos, []);
  assert.equal((await pedir('GET', `/obras/${OBRA}/historial?desde=${hoy()}&hasta=2020-01-01`, editor.acceso)).estado, 422);
  // El lector solo ve lo que salió en informes publicados.
  const delLector = await pedir('GET', `/obras/${OBRA}/historial?desde=${desde}&hasta=${hoy()}`, lector.acceso);
  assert.ok(!delLector.json.fotos.some((f: { id: string }) => f.id === fotoId));

  const historial = (await pedir('GET', `/obras/${OBRA}/dia/${hoy()}`, editor.acceso)).json.historial
    .filter((h: { foto_id: string }) => h.foto_id === fotoId);
  assert.deepEqual(historial.map((h: { accion: string }) => h.accion), ['editar', 'editar', 'editar', 'borrar', 'restaurar']);
  const [, cambio, deMarca, borrado] = historial; // el primero es la corrección del autor ('Corregido')
  assert.equal(cambio.usuario_id, editor.yo.usuario.id);
  assert.equal(cambio.motivo, 'Faltaba el eje');
  assert.deepEqual(cambio.cambios.comentario, { antes: 'Corregido', despues: 'Excavación de zanja, eje A' });
  assert.deepEqual(Object.keys(cambio.cambios).sort(), ['comentario', 'sector_id']);
  assert.equal(deMarca.anotacion_id, anot.json.id);
  assert.equal(borrado.motivo, 'Foto repetida');
  // El historial no se escribe desde la API.
  await assert.rejects(pool.query(`insert into historial_fotos (obra_id, foto_id, accion) values ($1, $2, 'editar')`, [OBRA, fotoId]));

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
  // Incidente, dron y pluviómetro no vienen en la planilla y se conservan.
  type Fila = { codigo: string; categoria: string; padre_id: string | null };
  assert.equal(items.filter((i: Fila) => i.categoria === 'obra').length, 4);
  assert.deepEqual(
    items.filter((i: Fila) => i.categoria !== 'obra').map((i: Fila) => [i.categoria, i.codigo, i.padre_id]),
    [['incidente', 'INCIDENTE', null], ['dron', 'DRON', null], ['pluviometro', 'PLUVIOMETRO', null]],
  );
  // Una fila del Excel con un código fijo no pisa la entrada fija.
  const otra = await pedir('POST', `/obras/${OBRA}/items/importar`, editor.acceso, {
    archivo_nombre: 'v3.xlsx', filas: [...filas, { codigo: 'DRON', descripcion: 'OTRA COSA', cantidad: 1 }],
  });
  assert.equal(otra.estado, 200, JSON.stringify(otra.json));
  const despues = (await pedir('GET', `/obras/${OBRA}/items`, editor.acceso)).json;
  assert.equal(despues.length, 7);
  assert.equal(despues.find((i: Fila) => i.codigo === 'DRON').categoria, 'dron');
});

test('informe del día: generar, publicar y PDF', async () => {
  const editor = await entrar('editor');
  const yoEditor = editor.yo.usuario.id;
  const items = (await pedir('GET', `/obras/${OBRA}/items`, editor.acceso)).json;
  const item = items.find((i: { es_titulo: boolean; categoria: string }) => !i.es_titulo && i.categoria === 'obra');
  const incidente = items.find((i: { categoria: string }) => i.categoria === 'incidente');

  // El editor también puede subir fotos (desde la web).
  const parteId = idParte(OBRA, yoEditor, hoy());
  await pedir('PUT', `/partes/${parteId}`, editor.acceso, { obra_id: OBRA, fecha: hoy() });
  async function subirFoto(itemId: string, comentario: string, tomada_en: string) {
    const fotoId = randomUUID();
    for (const ruta of [rutaFoto(OBRA, yoEditor, fotoId), rutaMiniatura(OBRA, yoEditor, fotoId)]) {
      const s = await pedir('POST', '/archivos/subida', editor.acceso, { ruta, content_type: 'image/jpeg' });
      const { status } = await abrir(s.json.url, { method: 'PUT', headers: s.json.encabezados, body: JPG });
      assert.ok(status >= 200 && status < 300);
    }
    const f = await pedir('PUT', `/fotos/${fotoId}`, editor.acceso, {
      parte_id: parteId, obra_id: OBRA, item_id: itemId, origen: 'web', tomada_en,
      archivo_path: rutaFoto(OBRA, yoEditor, fotoId), miniatura_path: rutaMiniatura(OBRA, yoEditor, fotoId),
      comentario,
    });
    assert.equal(f.estado, 200, JSON.stringify(f.json));
    return fotoId;
  }
  const fotoId = await subirFoto(item.id, 'Hormigonado de zapata en el eje 3', new Date(Date.now() - 60000).toISOString());
  // Cargado después, el incidente igual sale primero en el informe.
  await subirFoto(incidente.id, 'Se cortó la luz de obra media hora', new Date().toISOString());

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
  assert.deepEqual(inf.contenido.avances.map((a: { item_id: string }) => a.item_id), [incidente.id, item.id]);

  const pub = await pedir('POST', `/informes/${id}/publicar`, editor.acceso);
  assert.equal(pub.estado, 200);
  const lector = await entrar('fiscal');
  assert.equal((await pedir('GET', `/informes/${id}`, lector.acceso)).estado, 200);
  // Publicado, el lector ve la foto del informe (y no la carga cruda de otros días).
  const vistas = (await pedir('POST', '/archivos/ver', lector.acceso, { rutas: [rutaFoto(OBRA, yoEditor, fotoId)] })).json.urls;
  assert.ok(vistas[rutaFoto(OBRA, yoEditor, fotoId)]);

  if (process.env.CHROMIUM_PATH) {
    // El lector también descarga el PDF aunque el editor no lo haya generado antes.
    const pdf = await pedir('GET', `/informes/${id}/pdf`, lector.acceso);
    assert.equal(pdf.estado, 302);
    assert.match(await (await abrir(pdf.r.headers.location as string)).texto(), /^%PDF/);
  }
});

test('informe automático de las 23:55 para los días sin informe', { skip: !process.env.TAREAS_SECRETO }, async () => {
  const editor = await entrar('editor');
  const yoEditor = editor.yo.usuario.id;
  const item = (await pedir('GET', `/obras/${OBRA}/items`, editor.acceso)).json.find((i: { es_titulo: boolean }) => !i.es_titulo);
  // Fotos de un día que nadie informó.
  const dia = '2025-06-10';
  const parteId = idParte(OBRA, yoEditor, dia);
  await pedir('PUT', `/partes/${parteId}`, editor.acceso, { obra_id: OBRA, fecha: dia });
  const fotoId = randomUUID();
  const f = await pedir('PUT', `/fotos/${fotoId}`, editor.acceso, {
    parte_id: parteId, obra_id: OBRA, item_id: item.id, origen: 'web', tomada_en: `${dia}T14:00:00.000Z`,
    archivo_path: rutaFoto(OBRA, yoEditor, fotoId), miniatura_path: rutaMiniatura(OBRA, yoEditor, fotoId),
    comentario: 'Encofrado de vigas',
  });
  assert.equal(f.estado, 200, JSON.stringify(f.json));

  const tarea = (clave?: string, body: unknown = {}) =>
    app.inject({ method: 'POST', url: '/api/tareas/informes-diarios', headers: clave ? { authorization: `Bearer ${clave}` } : {}, payload: body as object });
  assert.equal((await tarea()).statusCode, 401);
  assert.equal((await tarea('otra-clave')).statusCode, 401);

  // Corre "el día siguiente" y repasa el anterior.
  const r = await tarea(process.env.TAREAS_SECRETO, { fecha: '2025-06-11' });
  assert.equal(r.statusCode, 200, r.body);
  const { dias, resultados } = r.json();
  assert.deepEqual(dias, ['2025-06-10', '2025-06-11']);
  const hecho = resultados.find((x: { obra_id: string; fecha: string }) => x.obra_id === OBRA && x.fecha === dia);
  assert.equal(hecho?.estado, 'borrador', JSON.stringify(resultados));
  const inf = (await pedir('GET', `/informes/${hecho.informe_id}`, editor.acceso)).json;
  assert.equal(inf.automatico, true);
  assert.equal(inf.generado_por, yoEditor);
  assert.ok(inf.contenido.avances.length > 0);

  // Ya informado: la siguiente corrida no lo vuelve a generar.
  const segunda = await tarea(process.env.TAREAS_SECRETO, { fecha: '2025-06-11' });
  assert.equal(segunda.statusCode, 200, segunda.body);
  const otra = segunda.json();
  assert.ok(!otra.resultados.some((x: { obra_id: string; fecha: string }) => x.obra_id === OBRA && x.fecha === dia));
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

  // Estado: todo pedido empieza en 'enviado'; solo el editor lo cambia, de a varios.
  assert.equal(fila.estado, 'enviado');
  const estado = (ids: string[], e: string, quien = editor) => pedir('PATCH', `/obras/${OBRA}/pedidos/estado`, quien.acceso, { ids, estado: e });
  assert.equal((await estado([id], 'en_compra', campo)).estado, 403);
  assert.equal((await estado([id], 'en_compra', lector)).estado, 403);
  assert.equal((await estado([id], 'perdido')).estado, 422);
  const cambio = await estado([id, idLibre], 'planificando');
  assert.equal(cambio.estado, 200, JSON.stringify(cambio.json));
  assert.equal(cambio.json.length, 2);
  assert.equal(cambio.json[0].estado_cambiado_por, editor.yo.usuario.id);
  assert.equal((await estado([id, idLibre], 'planificando')).json.length, 0); // sin cambios, no toca nada
  await estado([idLibre], 'disponible');

  // Campo baja sus pedidos (de todas las fechas) con el estado, y después solo lo cambiado.
  const mios = await pedir('GET', `/obras/${OBRA}/mis-pedidos`, campo.acceso);
  assert.equal(mios.estado, 200, JSON.stringify(mios.json));
  const deCampo = new Map(mios.json.pedidos.map((x: { id: string; estado: string }) => [x.id, x.estado]));
  assert.equal(deCampo.get(id), 'planificando');
  assert.equal(deCampo.get(idLibre), 'disponible');
  assert.equal((await pedir('GET', `/obras/${OBRA}/mis-pedidos`, editor.acceso)).json.pedidos.length, 0); // no son suyos
  await estado([id], 'rechazado');
  const despues = (await pedir('GET', `/obras/${OBRA}/mis-pedidos?desde=${encodeURIComponent(mios.json.hasta)}`, campo.acceso)).json;
  assert.deepEqual(despues.pedidos.map((x: { id: string; estado: string }) => [x.id, x.estado]), [[id, 'rechazado']]);
});

test('gerente: solo el Dashboard, con las fotos del último día', async () => {
  const editor = await entrar('editor');
  const campo = await entrar('capataz');
  const yoCampo = campo.yo.usuario.id;

  // Una foto de hoy, para que el Dashboard tenga qué mostrar.
  const item = (await pedir('GET', `/obras/${OBRA}/sync`, campo.acceso)).json.items.find((i: { es_titulo: boolean }) => !i.es_titulo);
  const parteId = idParte(OBRA, yoCampo, hoy());
  assert.equal((await pedir('PUT', `/partes/${parteId}`, campo.acceso, { obra_id: OBRA, fecha: hoy() })).estado, 200);
  const fotoId = randomUUID();
  const ruta = rutaFoto(OBRA, yoCampo, fotoId);
  const subida = await pedir('POST', '/archivos/subida', campo.acceso, { ruta, content_type: 'image/jpeg' });
  await abrir(subida.json.url, { method: 'PUT', headers: subida.json.encabezados, body: JPG });
  const f = await pedir('PUT', `/fotos/${fotoId}`, campo.acceso, {
    parte_id: parteId, obra_id: OBRA, item_id: item.id, tomada_en: new Date().toISOString(),
    archivo_path: ruta, miniatura_path: rutaMiniatura(OBRA, yoCampo, fotoId), comentario: 'Para el Dashboard',
  });
  assert.equal(f.estado, 200, JSON.stringify(f.json));

  const usuario = `ger${Date.now() % 100000}`;
  const creado = await pedir('POST', '/usuarios', editor.acceso, { usuario, nombre: 'Gerente Prueba', clave: 'gerente1', rol: 'gerente', obra_id: OBRA });
  assert.equal(creado.estado, 200, JSON.stringify(creado.json));
  const gerente = await entrar(usuario, 'gerente1');
  const yo = await pedir('GET', '/yo', gerente.acceso);
  assert.equal(yo.estado, 200);
  assert.equal(yo.json.obras.length, 1);
  assert.equal(yo.json.obras[0].rol, 'gerente');

  // Ve el Dashboard: la fecha del último día con fotos y esas fotos, que se pueden abrir.
  const dash = await pedir('GET', `/obras/${OBRA}/dashboard`, gerente.acceso);
  assert.equal(dash.estado, 200, JSON.stringify(dash.json));
  assert.equal(dash.json.fecha, hoy());
  const suya = dash.json.fotos.find((x: { id: string }) => x.id === fotoId);
  assert.equal(suya.comentario, 'Para el Dashboard');
  assert.equal(suya.autor, 'Capataz de prueba');
  assert.ok(suya.item);
  assert.equal((await abrir(suya.archivo_url)).status, 200);
  assert.deepEqual(
    (await pedir('GET', `/obras/${OBRA}/dashboard`, editor.acceso)).json.fotos.map((x: { id: string }) => x.id),
    dash.json.fotos.map((x: { id: string }) => x.id),
  );

  // Nada más: la API le cierra el resto de los módulos.
  for (const [metodo, url, body] of [
    ['GET', `/obras/${OBRA}/sync`],
    ['GET', `/obras/${OBRA}/items`],
    ['GET', `/obras/${OBRA}/dia/${hoy()}`],
    ['GET', `/obras/${OBRA}/historial?desde=${hoy()}&hasta=${hoy()}`],
    ['GET', `/obras/${OBRA}/informes`],
    ['GET', `/obras/${OBRA}/pedidos`],
    ['GET', '/usuarios'],
    ['GET', '/materiales'],
    ['POST', '/archivos/ver', { rutas: [ruta] }],
  ] as const) {
    const r = await pedir(metodo, url, gerente.acceso, body);
    assert.equal(r.estado, 403, `${metodo} ${url}: ${r.estado}`);
  }

  // Y en la base tampoco ve la carga ni el itemizado, aunque se saltee la API.
  const [vista] = await conUsuario(gerente.yo.usuario.id, (q) =>
    q(`select (select count(*) from items where obra_id = $1)::int as items,
              (select count(*) from fotos where obra_id = $1)::int as fotos,
              (select count(*) from obra_miembros where obra_id = $1)::int as miembros,
              (select count(*) from obras where id = $1)::int as obras`, [OBRA]),
  );
  assert.deepEqual(vista, { items: 0, fotos: 0, miembros: 0, obras: 1 });

  // Quien no es de la obra no ve su Dashboard.
  const otro = `ajeno${Date.now() % 100000}`;
  const ajenoId = (await pedir('POST', '/usuarios', editor.acceso, { usuario: otro, nombre: 'Ajeno', clave: 'ajeno123', rol: 'campo', obra_id: OBRA })).json.id;
  assert.equal((await pedir('DELETE', `/obras/${OBRA}/miembros/${ajenoId}`, editor.acceso)).estado, 200);
  const ajeno = await entrar(otro, 'ajeno123');
  assert.equal((await pedir('GET', `/obras/${OBRA}/dashboard`, ajeno.acceso)).estado, 403);
});
