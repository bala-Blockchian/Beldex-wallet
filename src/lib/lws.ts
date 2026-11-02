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

export interface LwsUnspentOutput {
  amount?: string | number
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
}

export interface LwsAddressTxs {
  total_received?: string | number
  transactions?: LwsAddressTx[]
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

//todo : what is the responce
export function balanceFromUnspent(
  unspent: LwsUnspentResponse | null
): bigint {
  if (!unspent) {
    return 0n
  }
  //checks
  if (unspent.amount !== undefined && unspent.amount !== null) {
    return parseAtomic(unspent.amount)
  }

  return (unspent.outputs ?? []).reduce(
    (total, output) => total + parseAtomic(output.amount), //great
    0n
  )
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
