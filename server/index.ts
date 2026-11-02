//done
import { createWalletSecrets, deriveWalletSecrets } from './beldex'
import { prisma } from './prisma'

const PORT = Number(process.env.PORT ?? 3001)
const ALLOWED_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'


//for the cors error good 
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

async function handleCreateWallet(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (!isRecord(body)) {
    return json({ error: 'Request body must be a JSON object' }, 400) //done
  }

  const mode = body.mode
  if (mode !== 'create' && mode !== 'import') {
    return json({ error: 'mode must be either "create" or "import"' }, 400)//done
  }

  const label = typeof body.label === 'string' ? body.label.trim() : ''
  if (label.length === 0) {
    return json({ error: 'label must be a non-empty string' }, 400)//done
  }

  try {
    const secrets =
      mode === 'create'
        ? await createWalletSecrets() //calling the oether function
        : await deriveWalletSecrets(typeof body.mnemonic === 'string' ? body.mnemonic : '')

    //db call
    const wallet = await prisma.wallet.create({
      data: {
        address: secrets.address,
        label, //comes from the input
        credential: {
          //one to one rel
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

//done
const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return json({}, 204)
    }

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return json({ status: 'ok' }) //done
    }

    if (url.pathname === '/api/wallets' && request.method === 'POST') {
      return handleCreateWallet(request)
    }

    return json({ error: 'Not found' }, 404)
  }
})

console.log(`Beldex wallet API running at http://localhost:${server.port}`)
