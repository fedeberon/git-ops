import type { LanguageModel } from '../../ports/language-model.js';
import type { ModelResponse } from '../../domain/agent.js';

// Adaptador determinista para aprender el ciclo sin invocar IA ni generar cargos.
// No entiende lenguaje natural: cualquier entrada sigue la misma demostración.
export class SimulatedModel implements LanguageModel {
  async generate(input: Parameters<LanguageModel['generate']>[0]): Promise<ModelResponse> {
    input.signal.throwIfAborted();
    const last = input.messages.at(-1);
    if (last?.role === 'tool') {
      return {
        kind: 'answer',
        text: 'Demostración simulada. Resultado de la herramienta: ' + last.content,
      };
    }
    return {
      kind: 'tool_calls',
      calls: [{ id: 'demo-1', name: 'get_service_info', arguments: {} }],
    };
  }
}
