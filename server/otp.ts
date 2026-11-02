import { randomInt } from 'node:crypto'
import { maskEmail, sendOtpEmail } from './email'
import { prisma } from './prisma'

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

const OTP_TTL_MS =
  readPositiveInteger(process.env.OTP_TTL_MINUTES, 10) * 60_000
const OTP_MAX_ATTEMPTS = readPositiveInteger(
  process.env.OTP_MAX_ATTEMPTS,
  5
)
const OTP_RESEND_COOLDOWN_MS =
  readPositiveInteger(process.env.OTP_RESEND_COOLDOWN_SECONDS, 60) * 1_000
const OTP_MAX_REQUESTS_PER_HOUR = readPositiveInteger(
  process.env.OTP_MAX_REQUESTS_PER_HOUR,
  5
)
const OTP_IP_MAX_REQUESTS_PER_HOUR = readPositiveInteger(
  process.env.OTP_IP_MAX_REQUESTS_PER_HOUR,
  10
)

const ipRequestHistory = new Map<string, number[]>()

export class OtpError extends Error {
  status: number
  code: string
  retryAfter?: number

  constructor(
    message: string,
    status = 400,
    code = 'OTP_ERROR',
    retryAfter?: number
  ) {
    super(message)
    this.name = 'OtpError'
    this.status = status
    this.code = code
    this.retryAfter = retryAfter
  }
}

export function checkOtpIpRateLimit(ip: string | null): void {
  if (!ip) {
    return
  }

  const now = Date.now()
  const windowStart = now - 60 * 60 * 1_000
  const recent = (ipRequestHistory.get(ip) ?? []).filter(
    timestamp => timestamp >= windowStart
  )

  if (recent.length >= OTP_IP_MAX_REQUESTS_PER_HOUR) {
    throw new OtpError(
      'Too many verification requests. Please try again later.',
      429,
      'OTP_IP_RATE_LIMITED'
    )
  }

  recent.push(now)
  ipRequestHistory.set(ip, recent)

  if (ipRequestHistory.size > 1_000) {
    for (const [key, timestamps] of ipRequestHistory) {
      if (timestamps.every(timestamp => timestamp < windowStart)) {
        ipRequestHistory.delete(key)
      }
    }
  }
}

function createOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

function parseAmount(amountAtomic: string): bigint {
  if (!/^\d+$/.test(amountAtomic)) {
    throw new OtpError(
      'amountAtomic must be a positive integer string',
      400,
      'INVALID_AMOUNT'
    )
  }

  const amount = BigInt(amountAtomic)
  if (amount <= 0n) {
    throw new OtpError(
      'Amount must be greater than zero',
      400,
      'INVALID_AMOUNT'
    )
  }

  return amount
}

export interface RequestOtpInput {
  walletId: string
  sender: string
  email: string
  receiver: string
  amountAtomic: string
}

export interface RequestOtpResult {
  otpId: string
  expiresAt: string
  maskedEmail: string
}

export async function requestOtp(
  input: RequestOtpInput
): Promise<RequestOtpResult> {
  const receiver = input.receiver.trim()
  if (receiver.length === 0 || receiver.length > 256) {
    throw new OtpError(
      'Enter a valid receiver address',
      400,
      'INVALID_RECEIVER'
    )
  }

  const amount = parseAmount(input.amountAtomic)
  const now = new Date()
  const cooldownStart = new Date(now.getTime() - OTP_RESEND_COOLDOWN_MS)
  const hourStart = new Date(now.getTime() - 60 * 60 * 1_000)

  const recentPending = await prisma.otpVerification.findFirst({
    where: {
      walletId: input.walletId,
      status: 'PENDING',
      createdAt: { gte: cooldownStart }
    },
    orderBy: { createdAt: 'desc' }
  })

  if (recentPending) {
    const retryAfter = Math.max(
      1,
      Math.ceil(
        (recentPending.createdAt.getTime() +
          OTP_RESEND_COOLDOWN_MS -
          now.getTime()) /
          1_000
      )
    )

    throw new OtpError(
      `Please wait ${retryAfter} second${retryAfter === 1 ? '' : 's'} before requesting another code.`,
      429,
      'OTP_COOLDOWN',
      retryAfter
    )
  }

  const hourlyCount = await prisma.otpVerification.count({
    where: {
      walletId: input.walletId,
      createdAt: { gte: hourStart }
    }
  })

  if (hourlyCount >= OTP_MAX_REQUESTS_PER_HOUR) {
    throw new OtpError(
      'Too many verification requests. Please try again later.',
      429,
      'OTP_RATE_LIMITED'
    )
  }

  await prisma.otpVerification.updateMany({
    where: {
      walletId: input.walletId,
      status: 'PENDING'
    },
    data: { status: 'EXPIRED' }
  })

  const code = createOtpCode()
  const otpHash = await Bun.password.hash(code)
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS)

  const verification = await prisma.otpVerification.create({
    data: {
      walletId: input.walletId,
      sender: input.sender,
      receiver,
      amount,
      otpHash,
      expiresAt
    }
  })

  try {
    await sendOtpEmail(input.email, code, expiresAt)
  } catch (error) {
    await prisma.otpVerification.update({
      where: { id: verification.id },
      data: { status: 'FAILED' }
    })

    console.error(
      'OTP email delivery failed:',
      error instanceof Error ? error.message : 'Unknown error'
    )

    throw new OtpError(
      'Could not send the verification email. Check the email configuration and try again.',
      502,
      'OTP_EMAIL_FAILED'
    )
  }

  return {
    otpId: verification.id,
    expiresAt: expiresAt.toISOString(),
    maskedEmail: maskEmail(input.email)
  }
}

export interface VerifyOtpInput {
  walletId: string
  otpId: string
  code: string
}

export interface VerifyOtpResult {
  verified: true
  expiresAt: string
}

export async function verifyOtp(
  input: VerifyOtpInput
): Promise<VerifyOtpResult> {
  const verification = await prisma.otpVerification.findFirst({
    where: {
      id: input.otpId,
      walletId: input.walletId
    }
  })

  if (!verification) {
    throw new OtpError(
      'Verification code was not found',
      404,
      'OTP_NOT_FOUND'
    )
  }

  if (verification.status === 'COMPLETED') {
    throw new OtpError(
      'This verification code has already been used',
      409,
      'OTP_ALREADY_USED'
    )
  }

  if (verification.status === 'EXPIRED') {
    throw new OtpError(
      'This verification code has expired. Request a new one.',
      410,
      'OTP_EXPIRED'
    )
  }

  if (verification.status === 'FAILED') {
    throw new OtpError(
      'This verification code can no longer be used. Request a new one.',
      429,
      'OTP_FAILED'
    )
  }

  if (verification.expiresAt.getTime() <= Date.now()) {
    await prisma.otpVerification.update({
      where: { id: verification.id },
      data: { status: 'EXPIRED' }
    })

    throw new OtpError(
      'This verification code has expired. Request a new one.',
      410,
      'OTP_EXPIRED'
    )
  }

  if (verification.status === 'VERIFIED') {
    return {
      verified: true,
      expiresAt: verification.expiresAt.toISOString()
    }
  }

  if (verification.attempts >= OTP_MAX_ATTEMPTS) {
    await prisma.otpVerification.update({
      where: { id: verification.id },
      data: { status: 'FAILED' }
    })

    throw new OtpError(
      'Too many incorrect attempts. Request a new code.',
      429,
      'OTP_TOO_MANY_ATTEMPTS'
    )
  }

  let valid = false

  if (/^\d{6}$/.test(input.code)) {
    try {
      valid = await Bun.password.verify(input.code, verification.otpHash)
    } catch {
      valid = false
    }
  }

  if (!valid) {
    const attempts = verification.attempts + 1
    const failed = attempts >= OTP_MAX_ATTEMPTS

    await prisma.otpVerification.update({
      where: { id: verification.id },
      data: {
        attempts,
        status: failed ? 'FAILED' : 'PENDING'
      }
    })

    if (failed) {
      throw new OtpError(
        'Too many incorrect attempts. Request a new code.',
        429,
        'OTP_TOO_MANY_ATTEMPTS'
      )
    }

    throw new OtpError(
      'The verification code is incorrect',
      400,
      'OTP_INVALID'
    )
  }

  await prisma.otpVerification.update({
    where: { id: verification.id },
    data: { status: 'VERIFIED' }
  })

  return {
    verified: true,
    expiresAt: verification.expiresAt.toISOString()
  }
}

export interface CompleteOtpInput {
  walletId: string
  otpId: string
  txHash: string
}

export async function completeOtp(input: CompleteOtpInput): Promise<void> {
  if (!/^[a-fA-F0-9]{64}$/.test(input.txHash)) {
    throw new OtpError('Invalid transaction hash', 400, 'INVALID_TX_HASH')
  }

  const verification = await prisma.otpVerification.findFirst({
    where: {
      id: input.otpId,
      walletId: input.walletId
    }
  })

  if (!verification) {
    throw new OtpError(
      'Verification record was not found',
      404,
      'OTP_NOT_FOUND'
    )
  }

  if (verification.status === 'COMPLETED') {
    return
  }

  if (verification.status !== 'VERIFIED') {
    throw new OtpError(
      'The verification code has not been verified',
      409,
      'OTP_NOT_VERIFIED'
    )
  }

  if (verification.expiresAt.getTime() <= Date.now()) {
    await prisma.otpVerification.update({
      where: { id: verification.id },
      data: { status: 'EXPIRED' }
    })

    throw new OtpError(
      'This verification code has expired',
      410,
      'OTP_EXPIRED'
    )
  }

  await prisma.otpVerification.update({
    where: { id: verification.id },
    data: {
      status: 'COMPLETED',
      txHash: input.txHash
    }
  })
}
