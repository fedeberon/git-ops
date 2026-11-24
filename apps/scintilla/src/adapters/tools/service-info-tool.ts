import type { Tool } from '../../ports/tool.js';

// Herramienta de solo lectura; puede reemplazarse o acompañarse por otras capacidades.
export class ServiceInfoTool implements Tool {
  readonly definition = {
    name: 'get_service_info',
    description: 'Obtiene el nombre y las capacidades de Scintilla.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  };

  async execute(args: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted();
    if (typeof args !== 'object' || args === null || Array.isArray(args) || Object.keys(args).length > 0) {
      throw new Error('get_service_info no admite argumentos');
    }
    return { name: 'scintilla', capabilities: ['health', 'hello', 'assistant-demo'] };
  }
}
