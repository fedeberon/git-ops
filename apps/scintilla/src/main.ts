import { RunAgent } from './application/run-agent.js';
import { createHttpServer } from './adapters/http/server.js';
import { SimulatedModel } from './adapters/model/simulated-model.js';
import { ServiceInfoTool } from './adapters/tools/service-info-tool.js';

// Composition root: único lugar que elige y conecta implementaciones concretas.
const model = new SimulatedModel();
const tools = [new ServiceInfoTool()];
const agent = new RunAgent(model, tools);
const server = createHttpServer(agent);
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? '8080');
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT debe ser un entero entre 1 y 65535');
}
server.on('error', (error) => {
  console.error('No se pudo iniciar Scintilla:', error.message);
  process.exitCode = 1;
});
server.listen(port, host, () => console.log('Scintilla escuchando en http://' + host + ':' + port));

// Docker y el sistema operativo pueden detener el servidor ordenadamente.
let stopping = false;
function stop(): void {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 12000);
  deadline.unref();
  server.close(() => { clearTimeout(deadline); });
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
