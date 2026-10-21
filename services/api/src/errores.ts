import type { CodigoError } from '@registro-obra/contrato';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export class ErrorApi extends Error {
  estado: number;
  codigo: CodigoError;
  constructor(estado: number, codigo: CodigoError, mensaje: string) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
  }
}

export const noEncontrado = (que = 'Recurso') => new ErrorApi(404, 'no_encontrado', `${que} inexistente`);
export const sinPermiso = (mensaje = 'No tenés permiso para esto') => new ErrorApi(403, 'sin_permiso', mensaje);

// Códigos de Postgres → respuesta HTTP.
const DE_POSTGRES: Record<string, [number, CodigoError]> = {
  '42501': [403, 'sin_permiso'], // privilegio o política RLS
  '23505': [409, 'conflicto'],
  '23503': [422, 'datos_invalidos'],
  '23502': [422, 'datos_invalidos'],
  '23514': [422, 'datos_invalidos'],
  '22023': [422, 'datos_invalidos'],
  '22P02': [422, 'datos_invalidos'],
  '22007': [422, 'datos_invalidos'],
  P0002: [404, 'no_encontrado'],
  '28P01': [401, 'credenciales_invalidas'],
};

export function manejarError(error: FastifyError | Error, pedido: FastifyRequest, respuesta: FastifyReply) {
  if (error instanceof ErrorApi) {
    return respuesta.status(error.estado).send({ error: { codigo: error.codigo, mensaje: error.message } });
  }
  if (error instanceof ZodError) {
    return respuesta
      .status(422)
      .send({ error: { codigo: 'datos_invalidos', mensaje: 'Datos inválidos', detalle: error.issues } });
  }
  const pgCodigo = (error as { code?: string }).code;
  if (pgCodigo && DE_POSTGRES[pgCodigo]) {
    const [estado, codigo] = DE_POSTGRES[pgCodigo];
    const mensaje = estado === 403 ? 'No tenés permiso para esto' : error.message;
    return respuesta.status(estado).send({ error: { codigo, mensaje } });
  }
  if ((error as FastifyError).statusCode && (error as FastifyError).statusCode! < 500) {
    return respuesta
      .status((error as FastifyError).statusCode!)
      .send({ error: { codigo: 'datos_invalidos', mensaje: error.message } });
  }
  pedido.log.error(error);
  return respuesta.status(500).send({ error: { codigo: 'error_interno', mensaje: 'Error interno' } });
}
