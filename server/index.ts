import { timingSafeEqual } from 'node:crypto'
import { createWalletSecrets, deriveWalletSecrets } from './beldex'
import {
  isValidEmail,
  normalizeEmail
} from './email'
import {
  checkOtpIpRateLimit,
  completeOtp,
  OtpError,
  requestOtp,
  verifyOtp
} from './otp'
import { prisma } from './prisma'

const PORT = Number(process.env.PORT ?? 3001)
const ALLOWED_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isDuplicateError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  )
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  )
}

async function readJsonRecord(
  request: Request
): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown
    return isRecord(body) ? body : null
  } catch {
    return null
  }
}

async function findWalletForViewKey(walletId: string, viewKey: string) {
  if (walletId.trim().length === 0 || viewKey.trim().length === 0) {
    return null
  }

  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    include: { credential: true }
  })

  if (
    !wallet?.credential ||
    !safeEqual(wallet.credential.secViewKey, viewKey.trim())
  ) {
    return null
  }

  return wallet
}

function otpErrorResponse(error: unknown): Response {
  if (error instanceof OtpError) {
    return json(
      {
        error: error.message,
        code: error.code,
        retryAfter: error.retryAfter
      },
      error.status
    )
  }

  console.error(
    'Unexpected OTP error:',
    error instanceof Error ? error.message : String(error)
  )

  return json({ error: 'Something went wrong' }, 500)
}

async function handleCreateWallet(request: Request): Promise<Response> {
  const body = await readJsonRecord(request)
  if (!body) {
    return json({ error: 'Request body must be a JSON object' }, 400)
  }

  const mode = body.mode
  if (mode !== 'create' && mode !== 'import') {
    return json({ error: 'mode must be either "create" or "import"' }, 400)
  }

  const label = typeof body.label === 'string' ? body.label.trim() : ''
  if (label.length === 0) {
    return json({ error: 'label must be a non-empty string' }, 400)
  }

  const email =
    typeof body.email === 'string' ? normalizeEmail(body.email) : ''
  if (!isValidEmail(email)) {
    return json({ error: 'email must be a valid email address' }, 400)
  }

  try {
    const secrets =
      mode === 'create'
        ? await createWalletSecrets()
        : await deriveWalletSecrets(
            typeof body.mnemonic === 'string' ? body.mnemonic : ''
          )

    const wallet = await prisma.wallet.create({
      data: {
        address: secrets.address,
        label,
        email, // include the mail
        credential: {
          create: {
            seedPhrase: secrets.mnemonic,
            secSpendKey: secrets.secSpendKey,
            secViewKey: secrets.secViewKey,
            pubSpendKey: secrets.pubSpendKey,
            pubViewKey: secrets.pubViewKey,
            address: secrets.address
          }
        }
      },
      include: { credential: true }
    })

    return json({ wallet }, 201)
  } catch (error) {
    if (isDuplicateError(error)) {
      return json({ error: 'A wallet with this address already exists' }, 409)
    }
    return json({ error: errorMessage(error) }, 400)
  }
}

async function handleSaveWalletEmail(
  request: Request,
  walletId: string
): Promise<Response> {
  const body = await readJsonRecord(request)
  if (!body) {
    return json({ error: 'Request body must be a JSON object' }, 400)
  }

  const email =
    typeof body.email === 'string' ? normalizeEmail(body.email) : ''
  if (!isValidEmail(email)) {
    return json({ error: 'email must be a valid email address' }, 400)
  }

  const viewKey = typeof body.viewKey === 'string' ? body.viewKey : ''
  const wallet = await findWalletForViewKey(walletId, viewKey)
  if (!wallet) {
    return json({ error: 'Wallet was not found' }, 404)
  }

  const updated = await prisma.wallet.update({
    where: { id: wallet.id },
    data: { email }
  })

  return json({ email: updated.email })
}

async function handleRequestOtp(
  request: Request,
  remoteAddress: string | null
): Promise<Response> {
  const body = await readJsonRecord(request)
  if (!body) {
    return json({ error: 'Request body must be a JSON object' }, 400)
  }

  const walletId = typeof body.walletId === 'string' ? body.walletId : ''
  const viewKey = typeof body.viewKey === 'string' ? body.viewKey : ''
  const receiver = typeof body.receiver === 'string' ? body.receiver : ''
  const amountAtomic =
    typeof body.amountAtomic === 'string' ? body.amountAtomic : ''

  const wallet = await findWalletForViewKey(walletId, viewKey)
  if (!wallet) {
    return json({ error: 'Wallet was not found' }, 404)
  }

  if (!wallet.email) {
    return json(
      {
        error: 'Add an email to this wallet before sending funds',
        code: 'EMAIL_REQUIRED'
      },
      400
    )
  }

  try {
    checkOtpIpRateLimit(remoteAddress)

    const result = await requestOtp({
      walletId: wallet.id,
      sender: wallet.address,
      email: wallet.email,
      receiver,
      amountAtomic
    })

    return json(result, 201)
  } catch (error) {
    return otpErrorResponse(error)
  }
}

async function handleVerifyOtp(request: Request): Promise<Response> {
  const body = await readJsonRecord(request)
  if (!body) {
    return json({ error: 'Request body must be a JSON object' }, 400)
  }

  const walletId = typeof body.walletId === 'string' ? body.walletId : ''
  const viewKey = typeof body.viewKey === 'string' ? body.viewKey : ''
  const otpId = typeof body.otpId === 'string' ? body.otpId : ''
  const code = typeof body.code === 'string' ? body.code.trim() : ''

  const wallet = await findWalletForViewKey(walletId, viewKey)
  if (!wallet) {
    return json({ error: 'Wallet was not found' }, 404)
  }

  try {
    const result = await verifyOtp({
      walletId: wallet.id,
      otpId,
      code
    })

    return json(result)
  } catch (error) {
    return otpErrorResponse(error)
  }
}

async function handleCompleteOtp(request: Request): Promise<Response> {
  const body = await readJsonRecord(request)
  if (!body) {
    return json({ error: 'Request body must be a JSON object' }, 400)
  }

  const walletId = typeof body.walletId === 'string' ? body.walletId : ''
  const viewKey = typeof body.viewKey === 'string' ? body.viewKey : ''
  const otpId = typeof body.otpId === 'string' ? body.otpId : ''
  const txHash = typeof body.txHash === 'string' ? body.txHash.trim() : ''

  const wallet = await findWalletForViewKey(walletId, viewKey)
  if (!wallet) {
    return json({ error: 'Wallet was not found' }, 404)
  }

  try {
    await completeOtp({
      walletId: wallet.id,
      otpId,
      txHash
    })

    return json({ completed: true })
  } catch (error) {
    return otpErrorResponse(error)
  }
}

const server = Bun.serve({
  port: PORT,
  async fetch(request, server) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return json({}, 204)
    }

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return json({ status: 'ok' })
    }

    if (url.pathname === '/api/wallets' && request.method === 'POST') {
      return handleCreateWallet(request)
    }

    const emailMatch = url.pathname.match(/^\/api\/wallets\/([^/]+)\/email$/)
    if (emailMatch && request.method === 'POST') {
      return handleSaveWalletEmail(request, decodeURIComponent(emailMatch[1]))
    }

    if (url.pathname === '/api/otp/request' && request.method === 'POST') {
      return handleRequestOtp(
        request,
        server.requestIP(request)?.address ?? null
      )
    }

    if (url.pathname === '/api/otp/verify' && request.method === 'POST') {
      return handleVerifyOtp(request)
    }

    if (url.pathname === '/api/otp/complete' && request.method === 'POST') {
      return handleCompleteOtp(request)
    }

    return json({ error: 'Not found' }, 404)
  }
})

console.log(`Beldex wallet API running at http://localhost:${server.port}`)
