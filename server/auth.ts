import crypto from 'crypto'
import { NextFunction, Request, Response } from 'express'

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000

type SessionPayload = {
  email: string
  expiresAt: number
}

const encode = (value: string) => Buffer.from(value).toString('base64url')
const decode = (value: string) => Buffer.from(value, 'base64url').toString('utf8')

const getSecret = () => process.env.AUTH_SECRET || 'change-this-auth-secret'

const sign = (payload: string) => crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url')

const safeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

export const createSessionToken = (email: string) => {
  const payload = encode(JSON.stringify({ email, expiresAt: Date.now() + SESSION_DURATION_MS }))
  return `${payload}.${sign(payload)}`
}

export const verifySessionToken = (token: string): SessionPayload | null => {
  const [payload, signature] = token.split('.')
  if (!payload || !signature || !safeEqual(sign(payload), signature)) return null

  try {
    const session = JSON.parse(decode(payload)) as SessionPayload
    return session.email && session.expiresAt > Date.now() ? session : null
  } catch {
    return null
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  const session = token ? verifySessionToken(token) : null
  if (!session) {
    res.status(401).json({ error: 'Sesi login tidak valid atau sudah berakhir.' })
    return
  }
  next()
}

export const credentialsAreValid = (email: string, password: string) => {
  const configuredEmail = process.env.AUTH_EMAIL || ''
  const configuredPassword = process.env.AUTH_PASSWORD || ''
  return safeEqual(email, configuredEmail) && safeEqual(password, configuredPassword)
}
