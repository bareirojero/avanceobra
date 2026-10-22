// Google Drive simulado para las pruebas (ALMACEN=drive): token OAuth, búsqueda,
// carpetas, subida multipart, reemplazo y descarga. Uso: node drive-simulado.mjs [puerto]
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

const archivos = new Map(); // id -> { name, parents, mimeType, datos }

const cuerpo = (pedido) =>
  new Promise((listo) => {
    const partes = [];
    pedido.on('data', (p) => partes.push(p));
    pedido.on('end', () => listo(Buffer.concat(partes)));
  });

const json = (res, estado, valor) => {
  res.writeHead(estado, { 'content-type': 'application/json' });
  res.end(JSON.stringify(valor));
};

createServer(async (pedido, res) => {
  const url = new URL(pedido.url, 'http://x');
  const datos = await cuerpo(pedido);
  if (url.pathname === '/token') return json(res, 200, { access_token: 'simulado', expires_in: 3600 });
  if (pedido.headers.authorization !== 'Bearer simulado') return json(res, 401, { error: 'sin token' });

  if (pedido.method === 'GET' && url.pathname === '/drive/v3/files') {
    const q = url.searchParams.get('q');
    const nombre = /name = '((?:[^'\\]|\\.)*)'/.exec(q)[1].replace(/\\(.)/g, '$1');
    const padre = /'([^']+)' in parents/.exec(q)[1];
    const tipo = /mimeType = '([^']+)'/.exec(q)?.[1];
    const files = [...archivos.entries()]
      .filter(([, a]) => a.name === nombre && a.parents.includes(padre) && (!tipo || a.mimeType === tipo))
      .map(([id]) => ({ id }));
    return json(res, 200, { files });
  }
  if (pedido.method === 'POST' && url.pathname === '/drive/v3/files') {
    const id = randomUUID();
    archivos.set(id, { ...JSON.parse(datos), datos: null });
    return json(res, 200, { id });
  }
  if (pedido.method === 'POST' && url.pathname === '/upload/drive/v3/files') {
    const limite = /boundary=(.+)$/.exec(pedido.headers['content-type'])[1];
    const texto = datos.toString('latin1');
    const [, meta, contenido] = texto.split(`--${limite}`);
    const metaJson = JSON.parse(meta.slice(meta.indexOf('\r\n\r\n') + 4).trim());
    const inicio = contenido.indexOf('\r\n\r\n') + 4;
    const bytes = Buffer.from(contenido.slice(inicio, contenido.length - 2), 'latin1');
    const id = randomUUID();
    archivos.set(id, { ...metaJson, mimeType: 'archivo', datos: bytes });
    return json(res, 200, { id });
  }
  const m = /^\/(upload\/)?drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
  const a = m && archivos.get(m[2]);
  if (!a) return json(res, 404, { error: 'no existe' });
  if (pedido.method === 'PATCH') {
    a.datos = datos;
    return json(res, 200, { id: m[2] });
  }
  if (pedido.method === 'GET' && url.searchParams.get('alt') === 'media') {
    res.writeHead(200);
    return res.end(a.datos);
  }
  json(res, 400, { error: 'no simulado' });
}).listen(Number(process.argv[2] ?? 4570));
