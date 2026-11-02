export interface WalletCredential {
  id: string
  walletId: string
  seedPhrase: string
  secSpendKey: string
  secViewKey: string
  pubSpendKey: string
  pubViewKey: string
  address: string
  createdAt: string
  updatedAt: string
}

export interface SavedWallet {
  id: string
  address: string
  label: string
  email: string | null
  createdAt: string
  credential: WalletCredential | null
}

interface WalletResponse {
  wallet: SavedWallet
}

interface EmailResponse {
  email: string | null
}

interface ErrorResponse {
  error?: string
  code?: string
  retryAfter?: number
}

async function postJson<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  const data = (await response.json()) as T & ErrorResponse

  if (!response.ok) {
    throw new Error(data.error ?? `Request failed with HTTP ${response.status}`)
  }

  return data
}

export async function createWallet(
  label: string,
  email: string
): Promise<SavedWallet> {
  
  const data = await postJson<WalletResponse>('/api/wallets', {
    mode: 'create',
    label,
    email
  })

  return data.wallet
}

export async function importWallet(
  label: string,
  email: string,
  mnemonic: string
): Promise<SavedWallet> {
  const data = await postJson<WalletResponse>('/api/wallets', {
    mode: 'import',
    label,
    email,
    mnemonic
  })

  return data.wallet
}

export async function saveWalletEmail(
  walletId: string,
  viewKey: string,
  email: string
): Promise<string | null> {
  const data = await postJson<EmailResponse>(
    `/api/wallets/${encodeURIComponent(walletId)}/email`,
    { email, viewKey }
  )

  return data.email
}
