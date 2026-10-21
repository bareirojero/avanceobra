import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { autenticar, emitirTokens, login, renovar, salir, tokenRenovacionDe } from '../auth.ts';
import { conUsuario } from '../db.ts';
import { ErrorApi } from '../errores.ts';
import { yo } from './campo.ts';

const Login = z.object({
  usuario: z.string().min(1).max(60),
  clave: z.string().min(1).max(200),
  dispositivo: z.enum(['app', 'web']),
});

export async function rutasAuth(app: FastifyInstance) {
  app.post('/auth/login', async (pedido, respuesta) => {
    const { usuario, clave, dispositivo } = Login.parse(pedido.body);
    const s = await login(usuario, clave, dispositivo);
    const tokens = await emitirTokens(respuesta, s.usuarioId, s.version, dispositivo, s.renovacion);
    return { ...tokens, yo: await yo(s.usuarioId) };
  });

  app.post('/auth/renovar', async (pedido, respuesta) => {
    const cuerpo = z.object({ renovacion: z.string().optional() }).parse(pedido.body ?? {});
    const token = tokenRenovacionDe(pedido, cuerpo);
    if (!token) throw new ErrorApi(401, 'no_autenticado', 'Iniciá sesión de nuevo');
    const dispositivo = cuerpo.renovacion ? 'app' : 'web';
    const s = await renovar(token, dispositivo);
    return emitirTokens(respuesta, s.usuarioId, s.version, dispositivo, s.renovacion);
  });

  app.post('/auth/salir', async (pedido, respuesta) => {
    const cuerpo = z.object({ renovacion: z.string().optional() }).parse(pedido.body ?? {});
    await salir(respuesta, tokenRenovacionDe(pedido, cuerpo));
    return { ok: true };
  });

  app.post('/auth/clave', { preHandler: autenticar }, async (pedido) => {
    const { actual, nueva } = z.object({ actual: z.string(), nueva: z.string().min(6) }).parse(pedido.body);
    await conUsuario(pedido.sesion.usuarioId, (q) => q('select cambiar_mi_clave($1, $2)', [actual, nueva]));
    return { ok: true }; // las demás sesiones quedan cerradas; esta también: volver a iniciar
  });
}
