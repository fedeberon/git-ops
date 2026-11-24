import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHttpServer } from '../src/adapters/http/server.js';
import { RunAgent } from '../src/application/run-agent.js';
import { SimulatedModel } from '../src/adapters/model/simulated-model.js';
import { ServiceInfoTool } from '../src/adapters/tools/service-info-tool.js';
import { InvalidInputError } from '../src/domain/agent.js';
import type { Assistant } from '../src/ports/assistant.js';

async function withServer(agent: Assistant, run: (base: string) => Promise<void>): Promise<void> {
  const server = createHttpServer(agent);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try { await run('http://127.0.0.1:' + address.port); }
  finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  }
}

const createAgent = () => new RunAgent(new SimulatedModel(), [new ServiceInfoTool()]);

test('HTTP conserva health, hello y el ciclo del asistente', async () => {
  await withServer(createAgent(), async (base) => {
    const health = await fetch(base + '/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok', service: 'scintilla', model: 'simulated' });
    const hello = await fetch(base + '/hello');
    assert.deepEqual(await hello.json(), { message: 'Hola mundo' });
    const head = await fetch(base + '/health', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    const response = await fetch(base + '/assistant', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hola' }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { mode: string; toolsUsed: string[] };
    assert.equal(body.mode, 'simulated');
    assert.deepEqual(body.toolsUsed, ['get_service_info']);
  });
});

test('HTTP diferencia JSON inválido, contenido incorrecto y cuerpos grandes', async () => {
  await withServer(createAgent(), async (base) => {
    for (const [body, expected] of [['{', 400], ['{}', 400], [JSON.stringify({ message: 'x'.repeat(17000) }), 413]] as const) {
      const response = await fetch(base + '/assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      });
      assert.equal(response.status, expected);
      await response.text();
    }
    const response = await fetch(base + '/assistant', { method: 'POST', body: 'Hola' });
    assert.equal(response.status, 415);
    await response.text();
  });
});

test('HTTP devuelve 404 y 405 con el encabezado Allow', async () => {
  await withServer(createAgent(), async (base) => {
    const missing = await fetch(base + '/missing');
    assert.equal(missing.status, 404);
    await missing.text();
    const wrongMethod = await fetch(base + '/assistant');
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get('allow'), 'POST');
    await wrongMethod.text();
  });
});

test('Express propaga errores async del puerto hacia el middleware', async () => {
  const agent: Assistant = { async execute() { throw new InvalidInputError('Entrada rechazada'); } };
  await withServer(agent, async (base) => {
    const response = await fetch(base + '/assistant', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"message":"Hola"}',
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'Entrada rechazada' });
  });
});
