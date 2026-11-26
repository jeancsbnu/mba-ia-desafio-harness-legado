import { NextFunction, Request, RequestHandler, Response } from 'express'
import { DomainError, ErrorCode } from '../domain/errors'

// Erro que nasce na própria camada HTTP (autenticação, corpo inválido).
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

// Tradução dos erros de negócio para HTTP: o único lugar que conhece os status.
const STATUS_POR_CODIGO: Record<ErrorCode, number> = {
  validation_error: 422,
  forbidden: 403,
  not_found: 404,
  invalid_transition: 409,
  file_too_large: 413,
  unsupported_type: 415,
}

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next)
  }
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'not_found', message: 'Rota não encontrada' })
}

function campo(err: unknown, nome: string): unknown {
  return typeof err === 'object' && err !== null ? (err as Record<string, unknown>)[nome] : undefined
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.code, message: err.message })
  }
  if (err instanceof DomainError) {
    return res.status(STATUS_POR_CODIGO[err.code]).json({ error: err.code, message: err.message })
  }
  if (campo(err, 'name') === 'MulterError') {
    return res.status(422).json({ error: 'validation_error', message: campo(err, 'message') })
  }
  if (campo(err, 'type') === 'entity.parse.failed') {
    return res.status(400).json({ error: 'bad_request', message: 'JSON inválido' })
  }
  console.log('erro inesperado', err)
  res.status(500).json({ error: 'internal_error', message: 'Erro interno' })
}
