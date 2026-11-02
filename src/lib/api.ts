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
  createdAt: string
  credential: WalletCredential | null
}

interface WalletResponse {
  wallet: SavedWallet
}

interface ErrorResponse {
  error?: string
}

async function postJson(body: Record<string, unknown>): Promise<SavedWallet> {

  const response = await fetch('/api/wallets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }
)

  const data = (await response.json()) as WalletResponse & ErrorResponse

  if (!response.ok) {
    throw new Error(data.error ?? `Request failed with HTTP ${response.status}`)
  }

  return data.wallet //good
}

//done
export function createWallet(label: string): Promise<SavedWallet> {
  return postJson({ mode: 'create', label }) //for the create wallet we just pass the label
}
//done
export function importWallet(label: string, mnemonic: string): Promise<SavedWallet> {
  return postJson({ mode: 'import', label, mnemonic }) //for the import wallet we pass the lable and the mnemonic
}
