import type { AgentResult } from '../domain/agent.js';

// Puerto de entrada: HTTP u otro adaptador pueden ejecutar el mismo caso de uso.
export interface Assistant {
  execute(message: string, signal: AbortSignal): Promise<AgentResult>;
}
