import {
  AgentExecutionError,
  InvalidInputError,
  type AgentResult,
  type Message,
} from '../domain/agent.js';
import type { LanguageModel } from '../ports/language-model.js';
import type { Tool } from '../ports/tool.js';
import type { Assistant } from '../ports/assistant.js';

// Caso de uso: coordina modelo y herramientas. No importa ningún adaptador.
export class RunAgent implements Assistant {
  private readonly tools = new Map<string, Tool>();

  constructor(
    private readonly model: LanguageModel,
    tools: readonly Tool[],
    private readonly maxModelCalls = 4,
  ) {
    if (!Number.isInteger(maxModelCalls) || maxModelCalls < 1) {
      throw new Error('maxModelCalls debe ser un entero positivo');
    }
    for (const tool of tools) {
      if (this.tools.has(tool.definition.name)) {
        throw new Error('Nombre de herramienta duplicado: ' + tool.definition.name);
      }
      this.tools.set(tool.definition.name, tool);
    }
  }

  async execute(message: string, signal: AbortSignal): Promise<AgentResult> {
    if (!message.trim() || message.length > 4000) {
      throw new InvalidInputError('message debe contener entre 1 y 4000 caracteres');
    }
    // Estado local por ejecución: distintas solicitudes no comparten conversaciones.
    const messages: Message[] = [{ role: 'user', content: message.trim() }];
    const toolsUsed: string[] = [];
    const definitions = [...this.tools.values()].map((tool) => tool.definition);

    for (let step = 1; step <= this.maxModelCalls; step++) {
      signal.throwIfAborted();
      const response = await this.model.generate({ messages, tools: definitions, signal });
      signal.throwIfAborted();
      if (response.kind === 'answer') {
        return { answer: response.text, toolsUsed, modelCalls: step };
      }
      if (response.calls.length === 0 || response.calls.length > 4) {
        throw new AgentExecutionError('Cantidad de herramientas solicitadas fuera del límite');
      }
      // Validar el conjunto antes de ejecutar cualquier herramienta de esta ronda.
      const ids = new Set<string>();
      for (const call of response.calls) {
        if (ids.has(call.id) || !this.tools.has(call.name)) {
          throw new AgentExecutionError('El modelo solicitó una herramienta no permitida o un ID duplicado');
        }
        ids.add(call.id);
      }
      messages.push({ role: 'assistant', calls: response.calls });
      for (const call of response.calls) {
        signal.throwIfAborted();
        const tool = this.tools.get(call.name)!;
        const result = await tool.execute(call.arguments, signal);
        signal.throwIfAborted();
        const content = JSON.stringify(result);
        if (content === undefined || content.length > 16000) {
          throw new AgentExecutionError('Resultado de herramienta inválido o demasiado grande');
        }
        messages.push({ role: 'tool', callId: call.id, name: call.name, content });
        toolsUsed.push(call.name);
      }
    }
    throw new AgentExecutionError('Se alcanzó el límite de llamadas al modelo');
  }
}
