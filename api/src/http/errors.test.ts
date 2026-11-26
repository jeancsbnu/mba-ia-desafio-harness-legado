import { Request, Response } from 'express'
import { describe, expect, it } from 'vitest'
import { DomainError, ErrorCode } from '../domain/errors'
import { errorHandler, HttpError } from './errors'

function respostaFalsa() {
  const resposta = { status: 0, corpo: undefined as unknown }
  const res = {
    status(codigo: number) {
      resposta.status = codigo
      return this
    },
    json(corpo: unknown) {
      resposta.corpo = corpo
      return this
    },
  }
  return { res: res as unknown as Response, resposta }
}

function tratar(err: unknown) {
  const { res, resposta } = respostaFalsa()
  errorHandler(err, {} as Request, res, () => undefined)
  return resposta
}

describe('errorHandler', () => {
  it.each<[ErrorCode, number]>([
    ['validation_error', 422],
    ['forbidden', 403],
    ['not_found', 404],
    ['invalid_transition', 409],
    ['file_too_large', 413],
    ['unsupported_type', 415],
  ])('traduz o erro de negócio %s para %i', (code, status) => {
    expect(tratar(new DomainError(code, 'mensagem'))).toEqual({ status, corpo: { error: code, message: 'mensagem' } })
  })

  it('mantém o status do HttpError', () => {
    expect(tratar(new HttpError(409, 'email_taken', 'E-mail já cadastrado'))).toEqual({
      status: 409,
      corpo: { error: 'email_taken', message: 'E-mail já cadastrado' },
    })
  })

  it('responde 400 para JSON inválido', () => {
    expect(tratar({ type: 'entity.parse.failed' })).toEqual({ status: 400, corpo: { error: 'bad_request', message: 'JSON inválido' } })
  })
})
