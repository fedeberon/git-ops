import type { ToolDefinition } from '../domain/agent.js';

// Cada herramienta declara su contrato y valida sus argumentos al ejecutarse.
// El esquema informa al modelo; la validación real sigue siendo responsabilidad del código.
export interface Tool {
  readonly definition: ToolDefinition;
  execute(args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
}
