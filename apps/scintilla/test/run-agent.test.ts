import test from 'node:test';
import assert from 'node:assert/strict';
import { RunAgent } from '../src/application/run-agent.js';
import { SimulatedModel } from '../src/adapters/model/simulated-model.js';
import { ServiceInfoTool } from '../src/adapters/tools/service-info-tool.js';
import { AgentExecutionError, InvalidInputError } from '../src/domain/agent.js';
import type { LanguageModel } from '../src/ports/language-model.js';

const signal = () => new AbortController().signal;

test('ejecuta una herramienta y devuelve su resultado al modelo', async () => {
  const agent = new RunAgent(new SimulatedModel(), [new ServiceInfoTool()]);
  const result = await agent.execute('Contame qué hace Scintilla', signal());
  assert.equal(result.modelCalls, 2);
  assert.deepEqual(result.toolsUsed, ['get_service_info']);
  assert.match(result.answer, /scintilla/);
});

test('rechaza herramientas no registradas antes de ejecutarlas', async () => {
  const model: LanguageModel = {
    async generate() {
      return { kind: 'tool_calls', calls: [{ id: '1', name: 'delete_everything', arguments: {} }] };
    },
  };
  await assert.rejects(new RunAgent(model, []).execute('Hola', signal()), AgentExecutionError);
});

test('detiene un modelo que pide herramientas indefinidamente', async () => {
  const model: LanguageModel = {
    async generate() {
      return { kind: 'tool_calls', calls: [{ id: '1', name: 'get_service_info', arguments: {} }] };
    },
  };
  await assert.rejects(new RunAgent(model, [new ServiceInfoTool()], 2).execute('Hola', signal()), /límite/);
});

test('valida entrada y evita nombres de herramientas duplicados', async () => {
  const tool = new ServiceInfoTool();
  assert.throws(() => new RunAgent(new SimulatedModel(), [tool, tool]), /duplicado/);
  await assert.rejects(new RunAgent(new SimulatedModel(), [tool]).execute('  ', signal()), InvalidInputError);
});

test('conversaciones simultáneas no comparten su historial', async () => {
  const agent = new RunAgent(new SimulatedModel(), [new ServiceInfoTool()]);
  const results = await Promise.all(['Primera', 'Segunda'].map((text) => agent.execute(text, signal())));
  for (const result of results) {
    assert.equal(result.modelCalls, 2);
    assert.deepEqual(result.toolsUsed, ['get_service_info']);
  }
});

test('respeta cancelación y valida argumentos de herramientas', async () => {
  const controller = new AbortController();
  controller.abort();
  const agent = new RunAgent(new SimulatedModel(), [new ServiceInfoTool()]);
  await assert.rejects(agent.execute('Hola', controller.signal));
  await assert.rejects(new ServiceInfoTool().execute({ command: 'algo' }, signal()), /no admite argumentos/);
});
