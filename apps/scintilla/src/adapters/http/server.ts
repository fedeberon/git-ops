import { createServer } from 'node:http';
import express from 'express';
import type { Assistant } from '../../ports/assistant.js';
import { createRoutes } from './routes.js';
import { errorHandler } from './middleware.js';

// Express queda encerrado en el adaptador. El núcleo sigue usando sus propios contratos.
export function createHttpServer(agent: Assistant) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(createRoutes(agent));
  app.use((_req, res) => { res.status(404).json({ error: 'Ruta no encontrada' }); });
  app.use(errorHandler);

  const server = createServer(app);
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  return server;
}
