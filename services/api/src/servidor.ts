import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { prepararAlmacen } from './archivos.ts';
import { config } from './config.ts';
import { pool } from './db.ts';
import { manejarError } from './errores.ts';
import { rutasArchivos } from './rutas/archivos.ts';
import { rutasAuth } from './rutas/auth.ts';
import { rutasCampo } from './rutas/campo.ts';
import { rutasDashboard } from './rutas/dashboard.ts';
import { rutasEditor } from './rutas/editor.ts';
import { rutasInformes } from './rutas/informes.ts';
import { rutasMateriales } from './rutas/materiales.ts';
import { rutasTareas } from './rutas/tareas.ts';

export async function crearServidor() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
    maxParamLength: 2000, // tokens firmados de /api/archivos/datos/:token
  });
  await app.register(cookie);
  app.setErrorHandler(manejarError);

  app.get('/salud', async () => {
    await pool.query('select 1');
    return { ok: true };
  });

  await app.register(
    async (api) => {
      await api.register(rutasAuth);
      await api.register(rutasArchivos);
      await api.register(rutasCampo);
      await api.register(rutasDashboard);
      await api.register(rutasEditor);
      await api.register(rutasInformes);
      await api.register(rutasMateriales);
      await api.register(rutasTareas);
    },
    { prefix: '/api' },
  );
  return app;
}

if (process.argv[1]?.endsWith('servidor.ts')) {
  await prepararAlmacen();
  const app = await crearServidor();
  await app.listen({ port: config.puerto, host: '0.0.0.0' });
}
