import { Router, json } from 'express';
import type { Assistant } from '../../ports/assistant.js';
import { createAssistantHandler, health, hello } from './handlers.js';
import { methodNotAllowed, requireJson } from './middleware.js';

// Declaración de rutas: no contiene lógica de negocio ni un selector manual de URLs.
export function createRoutes(agent: Assistant): Router {
  const router = Router({ caseSensitive: true, strict: true });
  router.route('/health').get(health).all(methodNotAllowed('GET, HEAD'));
  router.route('/hello').get(hello).all(methodNotAllowed('GET, HEAD'));
  router.route('/assistant')
    .post(requireJson, json({ limit: '16kb', inflate: false }), createAssistantHandler(agent))
    .all(methodNotAllowed('POST'));
  return router;
}
