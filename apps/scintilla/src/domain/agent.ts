// Contratos propios del agente: no dependen de Node, HTTP ni un proveedor de IA.
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type Message =
  | { role: 'user'; content: string }
  | { role: 'assistant'; calls: ToolCall[] }
  | { role: 'tool'; callId: string; name: string; content: string };

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type ModelResponse =
  | { kind: 'answer'; text: string }
  | { kind: 'tool_calls'; calls: ToolCall[] };

export interface AgentResult {
  answer: string;
  toolsUsed: string[];
  modelCalls: number;
}

export class InvalidInputError extends Error {}
export class AgentExecutionError extends Error {}
