import type { WalletCredential } from './api'

export interface OtpRequestResponse {
  otpId: string
  expiresAt: string
  maskedEmail: string
}

export interface OtpVerifyResponse {
  verified: true
  expiresAt: string
}

interface OtpErrorResponse {
  error?: string
  code?: string
  retryAfter?: number
}

export class OtpApiError extends Error {
  status: number
  code?: string
  retryAfter?: number

  constructor(
    message: string,
    status: number,
    code?: string,
    retryAfter?: number
  ) {
    super(message)
    this.name = 'OtpApiError'
    this.status = status
    this.code = code
    this.retryAfter = retryAfter
  }
}

async function postOtp<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  const data = (await response.json().catch(() => ({}))) as T &
    OtpErrorResponse

  if (!response.ok) {
    throw new OtpApiError(
      data.error ?? `Request failed with HTTP ${response.status}`,
      response.status,
      data.code,
      data.retryAfter
    )
  }

  return data
}

export function requestOtp(
  credential: WalletCredential,
  receiver: string,
  amountAtomic: bigint
): Promise<OtpRequestResponse> {
  return postOtp<OtpRequestResponse>('/api/otp/request', {
    walletId: credential.walletId,
    viewKey: credential.secViewKey,
    receiver,
    amountAtomic: amountAtomic.toString()
  })
}

export function verifyOtp(
  credential: WalletCredential,
  otpId: string,
  code: string
): Promise<OtpVerifyResponse> {
  return postOtp<OtpVerifyResponse>('/api/otp/verify', {
    walletId: credential.walletId,
    viewKey: credential.secViewKey,
    otpId,
    code
  })
}

export function completeOtp(
  credential: WalletCredential,
  otpId: string,
  txHash: string
): Promise<void> {
  return postOtp<{ completed: boolean }>('/api/otp/complete', {
    walletId: credential.walletId,
    viewKey: credential.secViewKey,
    otpId,
    txHash
  }).then(() => undefined)
}
