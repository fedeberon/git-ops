import type { RequestHandler } from 'express';
import type { Assistant } from '../../ports/assistant.js';
import { HttpError } from './http-error.js';
import { parseAssistantMessage } from './validation.js';

export const health: RequestHandler = (_req, res) => {
  res.json({ status: 'ok', service: 'scintilla', model: 'simulated' });
};

export const hello: RequestHandler = (_req, res) => {
  res.json({ message: 'Hola mundo' });
};

// Inyección del puerto: el handler desconoce RunAgent, Bedrock y las herramientas.
export function createAssistantHandler(agent: Assistant): RequestHandler {
  let activeRequests = 0;
  return async (req, res) => {
    const message = parseAssistantMessage(req.body);
    if (activeRequests >= 20) throw new HttpError(503, 'Capacidad temporalmente agotada');
    activeRequests++;
    const disconnected = new AbortController();
    const onClose = () => { if (!res.writableEnded) disconnected.abort(); };
    res.once('close', onClose);
    const signal = AbortSignal.any([AbortSignal.timeout(10000), disconnected.signal]);
    try {
      const result = await agent.execute(message, signal);
      if (!res.destroyed) res.json({ ...result, mode: 'simulated' });
    } finally {
      res.off('close', onClose);
      activeRequests--;
    }
    // Express 5 envía rechazos de este async handler al middleware de errores.
  };
}
