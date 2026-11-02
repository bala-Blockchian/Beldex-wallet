import loadBeldexBridge from '@bdxi/beldex-app-bridge'

if (typeof (globalThis as { __dirname?: string }).__dirname === 'undefined') {
  ;(globalThis as { __dirname?: string }).__dirname = '/'
}

export type BridgeCallback = (
  errorMessage: string | null,
  response?: unknown
) => void

export interface BridgeDestination {
  to_address: string
  send_amount: string
}

export interface BridgeErrorPayload {
  err_msg?: string
  err_code?: number
  createTx_errCode?: number
}

export interface BridgeSendResult {
  tx_hash: string
  used_fee?: string
  tx_key?: string
  total_sent?: string
}

export interface BridgeSendOptions {
  fromWallet_didFailToInitialize: boolean
  fromWallet_didFailToBoot: boolean
  fromWallet_needsImport: boolean
  requireAuthentication: boolean
  isRegister: boolean
  registration_string?: string
  destinations: BridgeDestination[]
  hasPickedAContact: boolean
  resolvedAddress_fieldIsVisible: boolean
  manuallyEnteredPaymentID_fieldIsVisible: boolean
  resolvedPaymentID_fieldIsVisible: boolean
  is_sweeping: boolean
  from_address_string: string
  sec_viewKey_string: string
  sec_spendKey_string: string
  pub_spendKey_string: string
  priority: number
  nettype: number
  get_unspent_outs_fn: (
    params: Record<string, unknown>,
    callback: BridgeCallback
  ) => void
  get_random_outs_fn: (
    params: Record<string, unknown>,
    callback: BridgeCallback
  ) => void
  submit_raw_tx_fn: (
    params: Record<string, unknown>,
    callback: BridgeCallback
  ) => void
  status_update_fn: (status: { code: number }) => void
  willBeginSending_fn: () => void
  canceled_fn: () => void
  authenticate_fn: (callback: (approved: boolean) => void) => void
  error_fn: (payload: BridgeErrorPayload) => void
  success_fn: (result: BridgeSendResult) => void
}

export interface DecodedAddress {
  spend: string
  view: string
  intPaymentId?: string
  isSubaddress: boolean
}

export interface BeldexBridge {
  decode_address(address: string, nettype: number): DecodedAddress
  async__send_funds(options: BridgeSendOptions): void
}

let bridgePromise: Promise<BeldexBridge> | null = null

export function getBeldexBridge(): Promise<BeldexBridge> {
  if (bridgePromise) {
    return bridgePromise
  }

  const pending = (loadBeldexBridge({}) as Promise<unknown>).then(
    instance => instance as BeldexBridge
  )

  bridgePromise = pending
  pending.catch(() => {
    if (bridgePromise === pending) {
      bridgePromise = null
    }
  })

  return pending
}
