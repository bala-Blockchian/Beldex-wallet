// done
import type { WalletCredential } from './api'
import {
  getBeldexBridge,
  type BridgeCallback,
  type BridgeSendOptions
} from './bridge'
import { parseAtomic } from './format'

export const NETTYPE = 0
export const PRIORITY = 1

const rawLwsUrl = import.meta.env.VITE_LWS_URL?.trim() || '/lws'
export const LWS_URL = rawLwsUrl.endsWith('/')
  ? rawLwsUrl.slice(0, -1)
  : rawLwsUrl

export type ProgressHandler = (message: string) => void

export interface LwsSpentOutput {
  amount?: string | number
  key_image?: string
  tx_pub_key?: string
  out_index?: string | number
  mixin?: string | number
  mempool?: boolean
}

export interface LwsUnspentOutput {
  amount?: string | number
  public_key?: string
  index?: string | number
  out_index?: string | number
  global_index?: string | number
  tx_id?: string | number
  tx_hash?: string
  tx_prefix_hash?: string
  tx_pub_key?: string
  timestamp?: string
  height?: string | number
  spend_key_images?: string[]
  rct?: unknown
}

export interface LwsUnspentResponse {
  amount?: string | number
  outputs?: LwsUnspentOutput[]
  err_msg?: string
}

export interface LwsAddressTx {
  id?: string | number
  hash?: string
  timestamp?: string
  total_received?: string | number
  total_sent?: string | number
  unlock_time?: string | number
  height?: string | number
  payment_id?: string
  coinbase?: boolean
  mempool?: boolean
  mixin?: string | number
  spent_outputs?: LwsSpentOutput[]
}

export interface LwsAddressTxs {
  total_received?: string | number
  scanned_height?: string | number
  blockchain_height?: string | number
  transactions?: LwsAddressTx[]
}

export interface WalletActivity {
  balanceAtomic: bigint
  transactions: LwsAddressTx[]
}

export interface SendResult {
  tx_hash: string
  used_fee?: string
  tx_key?: string
  total_sent?: string
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === 'object') {
    return value as Record<string, unknown>
  }
  return null
}

//done
async function postJson<T>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<T> {
  let response: Response

  try {
    response = await fetch(`${LWS_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  } catch (error) {
    throw new Error(
      `Could not reach the light wallet server at ${LWS_URL}. (${describeError(error)})`
    )
  }

  if (!response.ok) {
    throw new Error(
      `Light wallet server ${endpoint} returned HTTP ${response.status} ${response.statusText}`
    )
  }

  const data = (await response.json()) as unknown
  const record = asRecord(data)
  if (record && typeof record.err_msg === 'string' && record.err_msg) {
    throw new Error(record.err_msg)
  }

  return data as T
}

//done
export async function loginToLws(credential: WalletCredential): Promise<void> {
  try {
    await postJson('/login', {
      //pass the address and the private view key
      address: credential.address,
      view_key: credential.secViewKey,
      create_account: true,
      generated_locally: true
    })
  } catch {
    // The account may already exist, so a failed login is not always fatal.
  }
}

export function fetchUnspent(
  credential: WalletCredential
): Promise<LwsUnspentResponse> {
  return postJson('/get_unspent_outs', {
    address: credential.address,
    view_key: credential.secViewKey,
    amount: '0',
    dust_threshold: '2000000000',
    use_dust: true,
    mixin: 9
  })
}

export function fetchAddressTxs(
  credential: WalletCredential
): Promise<LwsAddressTxs> {
  //
  return postJson('/get_address_txs', {
    address: credential.address,
    view_key: credential.secViewKey
  })
}

function normalizeHex(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

//it is the combination of public tx key and the output index 
function outpointKey(
  txPubKey: unknown,
  outIndex: unknown
): string | null {
  const key = normalizeHex(txPubKey)
  if (key.length === 0 || outIndex === undefined || outIndex === null) {
    return null
  }
  return `${key}:${String(outIndex).trim()}`
}

//  generates the outpoint and the keyimage for all the spent output from the tx 
function collectSpentOutputs(transactions: LwsAddressTx[]): {
  outpoints: Set<string>
  keyImages: Set<string>
} {

  const outpoints = new Set<string>() //set of keys 
  const keyImages = new Set<string>()//set the of spent output keyimags from the previous tx

  for (const transaction of transactions) {
    for (const spent of transaction.spent_outputs ?? []) {
      const outpoint = outpointKey(spent.tx_pub_key, spent.out_index)
      if (outpoint !== null) {
        outpoints.add(outpoint)
      }

      const keyImage = normalizeHex(spent.key_image)
      if (keyImage.length > 0) {
        keyImages.add(keyImage)
      }
    }
  }

  return { outpoints, keyImages }
}

//done
function isOutputSpent(

  output: LwsUnspentOutput,
  spent: { outpoints: Set<string>; keyImages: Set<string> }

): boolean {
  //get the outpoint key for the unspent outputs
  const outpoint = outpointKey(
    output.tx_pub_key,
    output.index ?? output.out_index
  )

  //check if the calculted outpoint of thr unspend matchs in the spent output that comes from the tx
  if (outpoint !== null) {
    return spent.outpoints.has(outpoint)
  }
  // also check if the keyimage matchs
  return (output.spend_key_images ?? []).some(keyImage =>
    spent.keyImages.has(normalizeHex(keyImage))
  )
}

//done
export function balanceFromUnspent(
  unspent: LwsUnspentResponse | null,
  transactions: LwsAddressTx[] = []
): bigint {

  const outputs = unspent?.outputs ?? []
  if (outputs.length === 0) {
    return 0n //done
  }
  const spent = collectSpentOutputs(transactions) //gets all the keyimage of spent outputs

  return outputs.reduce((total, output) => {
    // this function takes both the keyimage of the spent output and all the unspent outputs
    if (isOutputSpent(output, spent)) {
      return total // if it is spent dont include it in the total 
    }
    return total + parseAtomic(output.amount) // if not added it to the total
  }, 0n)

}

//return the hight timestamp and the tx hash 
function sortValue(transaction: LwsAddressTx): [number, number, number] {

  const height = Number(transaction.height ?? 0)
  const timestamp = Date.parse(transaction.timestamp ?? '')
  const id = Number(transaction.id ?? 0)

  return [
    Number.isFinite(height) ? height : 0,
    Number.isNaN(timestamp) ? 0 : timestamp,
    Number.isFinite(id) ? id : 0
  ]
}

//done
export function sortTransactionsNewestFirst(
  transactions: LwsAddressTx[]
): LwsAddressTx[] {

  return [...transactions].sort((left, right) => {
    const leftValue = sortValue(left)
    const rightValue = sortValue(right)

    for (let index = 0; index < leftValue.length; index += 1) { //iterate 3 times

      if (leftValue[index] !== rightValue[index]) {
        return rightValue[index] - leftValue[index]
      }

    }

    return 0
  })
}

//done
export async function fetchWalletActivity(
  credential: WalletCredential,
  options: { login?: boolean } = {}
): Promise<WalletActivity> {
  if (options.login !== false) {
    await loginToLws(credential)
  }

  const [unspent, addressTxs] = await Promise.all([
    fetchUnspent(credential),
    fetchAddressTxs(credential)
  ])

  const transactions = addressTxs.transactions ?? []

  return {
    balanceAtomic: balanceFromUnspent(unspent, transactions),
    transactions: sortTransactionsNewestFirst(transactions)
  }
}

function lwsProxy(
  endpoint: string
): (params: Record<string, unknown>, callback: BridgeCallback) => void {
  return (params, callback) => {
    postJson<unknown>(endpoint, params)
      .then(response => callback(null, response))
      .catch(error => callback(describeError(error)))
  }
}

export async function sendFromWallet(
  credential: WalletCredential,
  receiverAddress: string,
  amountBdx: string,
  onProgress?: ProgressHandler
): Promise<SendResult> {

  const receiver = receiverAddress.trim()
  if (receiver.length === 0) {
    throw new Error('Enter a receiver address')
  }

  const bridge = await getBeldexBridge()

  //for the sender
  const fromDecoded = bridge.decode_address(credential.address, NETTYPE)
  //checks if the address matchs with the public spend key
  if (fromDecoded.spend !== credential.pubSpendKey) {
    throw new Error('Stored public spend key does not match the wallet address')
  }

  try {
    bridge.decode_address(receiver, NETTYPE) //for the receiver
  } catch (error) {
    throw new Error(`Invalid receiver address: ${describeError(error)}`)
  }

  await loginToLws(credential) //login

  return new Promise<SendResult>((resolve, reject) => {

    let settled = false

    const fail = (message: string) => {
      if (!settled) {

        settled = true
        reject(new Error(message))

      }
    }

    const succeed = (result: SendResult) => {

      if (!settled) {

        settled = true
        resolve(result)
      }
    }

    const options: BridgeSendOptions = {
      fromWallet_didFailToInitialize: false,
      fromWallet_didFailToBoot: false,
      fromWallet_needsImport: false,
      requireAuthentication: false,
      isRegister: false,
      registration_string: undefined,

      destinations: [
        {
          to_address: receiver,
          send_amount: amountBdx
        }
      ],

      hasPickedAContact: false,
      resolvedAddress_fieldIsVisible: false,
      manuallyEnteredPaymentID_fieldIsVisible: false,
      resolvedPaymentID_fieldIsVisible: false,
      is_sweeping: false,

      from_address_string: credential.address,
      sec_viewKey_string: credential.secViewKey,
      sec_spendKey_string: credential.secSpendKey,
      pub_spendKey_string: credential.pubSpendKey,

      priority: PRIORITY,
      nettype: NETTYPE,

      //lws callbacks
      get_unspent_outs_fn: lwsProxy('/get_unspent_outs'),
      get_random_outs_fn: lwsProxy('/get_random_outs'),
      submit_raw_tx_fn: lwsProxy('/submit_raw_tx'),

      status_update_fn: status =>
        onProgress?.(`Preparing transaction (status ${status.code})...`),
      willBeginSending_fn: () =>
        onProgress?.('Signing and submitting transaction...'),

      canceled_fn: () => fail('The transaction was canceled'),
      authenticate_fn: callback => callback(true),
      error_fn: payload =>
        fail(
          payload.err_msg ??
            `The transaction failed (code ${payload.err_code ?? payload.createTx_errCode ?? 'unknown'})`
        ),

      success_fn: result =>
        succeed({
          tx_hash: result.tx_hash,
          used_fee: result.used_fee,
          tx_key: result.tx_key,
          total_sent: result.total_sent
        })
    }

    try {
      bridge.async__send_funds(options)
    } catch (error) {
      fail(describeError(error))
    }
  })
}
