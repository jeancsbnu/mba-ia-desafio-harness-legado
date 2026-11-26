// Erros de regra de negócio. Os serviços lançam DomainError com um código; a
// camada HTTP (api/src/http/errors.ts) é quem traduz o código para o status.
export type ErrorCode =
  | 'validation_error'
  | 'forbidden'
  | 'not_found'
  | 'invalid_transition'
  | 'file_too_large'
  | 'unsupported_type'

export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
  }
}

// Arquivo recebido num upload, sem depender do multer.
export interface UploadedFile {
  originalname: string
  mimetype: string
  size: number
  buffer: Buffer
}
