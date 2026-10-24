// Prueba de punta a punta contra Postgres y Azurite locales con los datos de
// db/seed/desarrollo.sql. Requiere las variables de .env.example.

import { idParte, rutaFoto, rutaFotoPedido, rutaMiniatura } from '@registro-obra/contrato';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import pg from 'pg';
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

type Fila = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

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

  // Publicar congela: Rev. 0 con los datos del día tal como estaban.
  const r0 = (await pedir('GET', `/informes/${id}`, editor.acceso)).json;
  assert.equal(r0.revision, 0);
  assert.match(r0.revision_vigente.codigo, /-R0$/);
  const congelada = r0.revision_vigente.datos.fotos.find((f: Fila) => f.id === fotoId);
  assert.equal(congelada.comentario, 'Hormigonado de zapata en el eje 3');
  // Publicar otra vez sin editar no crea revisión nueva.
  assert.equal((await pedir('POST', `/informes/${id}/publicar`, editor.acceso)).json.revision, 0);

  // Lo que cambie después en la base no toca lo publicado.
  const cambio = await pedir('PATCH', `/fotos/${fotoId}`, editor.acceso, { comentario: 'Comentario corregido después' });
  assert.equal(cambio.estado, 200, JSON.stringify(cambio.json));
  const igual = (await pedir('GET', `/informes/${id}`, lector.acceso)).json;
  assert.equal(igual.revision_vigente.datos.fotos.find((f: Fila) => f.id === fotoId).comentario, 'Hormigonado de zapata en el eje 3');
  const pdfAntes = r0.pdf_path ?? (await esperarPdf(id, editor.acceso));

  // Editar de nuevo y publicar crea la Rev. 1 con los datos de ahora; la Rev. 0 queda igual.
  const editado = await pedir('PATCH', `/informes/${id}`, editor.acceso, { contenido: { ...r0.contenido, resumen: 'Resumen corregido' } });
  assert.equal(editado.json.estado, 'borrador');
  const r1 = await pedir('POST', `/informes/${id}/publicar`, editor.acceso);
  assert.equal(r1.json.revision, 1);
  const vigente = (await pedir('GET', `/informes/${id}`, editor.acceso)).json.revision_vigente;
  assert.match(vigente.codigo, /-R1$/);
  assert.equal(vigente.datos.fotos.find((f: Fila) => f.id === fotoId).comentario, 'Comentario corregido después');
  const revisiones = (await pedir('GET', `/informes/${id}/revisiones`, lector.acceso)).json;
  assert.deepEqual(revisiones.map((r: Fila) => r.revision), [1, 0]);
  await esperarPdf(id, editor.acceso);
  if (process.env.CHROMIUM_PATH) {
    const viejo = await pedir('GET', `/informes/${id}/pdf?revision=0`, lector.acceso);
    assert.equal(viejo.estado, 302);
    assert.match(await (await abrir(viejo.r.headers.location as string)).texto(), /^%PDF/);
  }

  if (process.env.DATABASE_ADMIN_URL) {
    const dueño = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
    await dueño.connect();
    try {
      const [rev0] = (await dueño.query(`select contenido, datos, pdf_path from informe_revisiones where informe_id = $1 and revision = 0`, [id])).rows;
      assert.notEqual(rev0.contenido.resumen, 'Resumen corregido');
      assert.equal(rev0.datos.fotos.find((f: Fila) => f.id === fotoId).comentario, 'Hormigonado de zapata en el eje 3');
      if (pdfAntes) assert.equal(rev0.pdf_path, pdfAntes);
      // Una revisión publicada no se modifica ni se borra, ni a mano en la base.
      await assert.rejects(dueño.query(`update informe_revisiones set contenido = '{}'::jsonb where informe_id = $1`, [id]), /no se modifica/);
      await assert.rejects(dueño.query(`delete from informe_revisiones where informe_id = $1`, [id]), /no se borra/);
    } finally {
      await dueño.end();
    }
  }
});

// El PDF de la revisión se arma en segundo plano al publicar.
async function esperarPdf(id: string, token: string) {
  if (!process.env.CHROMIUM_PATH) return null;
  for (let i = 0; i < 100; i++) {
    const r = (await pedir('GET', `/informes/${id}`, token)).json;
    if (r.pdf_path) return r.pdf_path as string;
    await new Promise((res) => setTimeout(res, 200));
  }
  throw new Error('El PDF de la revisión no se armó');
}

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
});
