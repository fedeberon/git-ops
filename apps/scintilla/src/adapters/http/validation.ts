import { HttpError } from './http-error.js';

// req.body es entrada externa: TypeScript no valida el JSON en tiempo de ejecución.
export function parseAssistantMessage(body: unknown): string {
  if (typeof body !== 'object' || body === null || !('message' in body) || typeof body.message !== 'string') {
    throw new HttpError(400, 'Se requiere un campo message de tipo string');
  }
  return body.message;
}
