import { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { authConfig } from '../../config/auth'
import { CurrentUser, Role } from '../../domain/ticket'
import { HttpError } from '../errors'

// `req.user` é preenchido pelo requireAuth.
declare module 'express-serve-static-core' {
  interface Request {
    user?: CurrentUser
  }
}

export function signToken(user: { id: string; role: string }) {
  return jwt.sign({ sub: user.id, role: user.role }, authConfig.jwtSecret, { expiresIn: '8h' })
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized', message: 'Token ausente' })
  }
  try {
    const payload = jwt.verify(header.slice(7), authConfig.jwtSecret) as jwt.JwtPayload
    req.user = { id: payload.sub as string, role: payload.role as Role }
    next()
  } catch {
    return res.status(401).json({ error: 'unauthorized', message: 'Token inválido' })
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user
    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({ error: 'forbidden', message: 'Sem permissão' })
    }
    next()
  }
}

// Usuário de uma rota protegida por requireAuth.
export function currentUser(req: Request): CurrentUser {
  if (!req.user) throw new HttpError(401, 'unauthorized', 'Token ausente')
  return req.user
}
