import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AgentExecutionError, InvalidInputError } from '../../domain/agent.js';
import { HttpError } from './http-error.js';

export const requireJson: RequestHandler = (req, _res, next) => {
  if (!req.is('application/json')) {
    next(new HttpError(415, 'Se requiere Content-Type: application/json'));
    return;
  }
  next();
};

export function methodNotAllowed(allowed: string): RequestHandler {
  return (_req, res, next) => {
    res.setHeader('Allow', allowed);
    next(new HttpError(405, 'Método no permitido'));
  };
}

// Express reconoce cuatro argumentos como middleware de errores.
// No devuelve stacks, cuerpos de solicitudes ni detalles internos al cliente.
export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.destroyed || res.writableEnded) return;
  if (res.headersSent) { next(error); return; }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof InvalidInputError) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (error instanceof AgentExecutionError) {
    res.status(502).json({ error: error.message });
    return;
  }
  // Errores del parser JSON de Express/body-parser.
  if (typeof error === 'object' && error !== null && 'type' in error) {
    if (error.type === 'entity.too.large') {
      res.status(413).json({ error: 'Cuerpo demasiado grande' });
      return;
    }
    if (error.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'JSON inválido' });
      return;
    }
    if (error.type === 'encoding.unsupported' || error.type === 'charset.unsupported') {
      res.status(415).json({ error: 'Codificación no admitida' });
      return;
    }
  }
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    res.status(504).json({ error: 'Se agotó el tiempo de ejecución' });
    return;
  }
  console.error('Fallo al procesar la solicitud');
  res.status(500).json({ error: 'Error interno' });
};
