// Subida y descarga de archivos a través de la API, con el token firmado de la
// URL (sin sesión: la URL misma es la autorización, vence en minutos). Se usa
// cuando el destino no da URLs firmadas propias (SharePoint).

import type { FastifyInstance } from 'fastify';
import { guardar, leerTokenArchivo, urlDescarga } from '../archivos.ts';
import { ErrorApi } from '../errores.ts';

const TIPOS = ['image/jpeg', 'application/pdf'];

async function verificar(token: string, permiso: 'r' | 'w') {
  try {
    const t = await leerTokenArchivo(token);
    if (t.permiso !== permiso) throw new Error();
    return t.ruta;
  } catch {
    throw new ErrorApi(403, 'sin_permiso', 'El enlace venció o no es válido');
  }
}

export async function rutasArchivos(app: FastifyInstance) {
  app.addContentTypeParser(TIPOS, { parseAs: 'buffer', bodyLimit: 20 * 1024 * 1024 }, (_p, cuerpo, listo) =>
    listo(null, cuerpo),
  );

  app.put<{ Params: { token: string } }>('/archivos/datos/:token', async (pedido, respuesta) => {
    const ruta = await verificar(pedido.params.token, 'w');
    const tipo = pedido.headers['content-type'] ?? '';
    if (!TIPOS.includes(tipo) || !Buffer.isBuffer(pedido.body) || pedido.body.length === 0) {
      throw new ErrorApi(422, 'datos_invalidos', 'Se espera una imagen JPEG');
    }
    await guardar(ruta, pedido.body, tipo);
    return respuesta.status(201).send();
  });

  app.get<{ Params: { token: string } }>('/archivos/datos/:token', async (pedido, respuesta) => {
    const ruta = await verificar(pedido.params.token, 'r');
    return respuesta.redirect(await urlDescarga(ruta));
  });
}
