// Error del transporte HTTP. No sale del adaptador ni se usa en el dominio.
export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
