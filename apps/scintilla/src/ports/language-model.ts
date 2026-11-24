import type { Message, ModelResponse, ToolDefinition } from '../domain/agent.js';

// Puerto de salida: el caso de uso pide una decisión sin conocer el proveedor.
export interface LanguageModel {
  generate(input: {
    messages: readonly Message[];
    tools: readonly ToolDefinition[];
    signal: AbortSignal;
  }): Promise<ModelResponse>;
}
