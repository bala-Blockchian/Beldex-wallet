// @ts-ignore - @bdxi/beldex-app-bridge ships no type definitions
import loadBridge from '@bdxi/beldex-app-bridge'

export const NETTYPE = 0

export interface WalletSecrets {
  mnemonic: string
  seed: string //same as the private spend key
  address: string
  pubSpendKey: string
  pubViewKey: string
  secSpendKey: string
  secViewKey: string
}

interface CreatedWalletResult {
  mnemonic_string: string
  mnemonic_language: string
  sec_seed_string?: string
  address_string: string
  pub_viewKey_string: string
  sec_viewKey_string: string
  pub_spendKey_string: string
  sec_spendKey_string: string
}

interface MnemonicKeysResult {
  sec_seed_string?: string //acts as the seed

  address_string: string
  pub_viewKey_string: string
  sec_viewKey_string: string
  pub_spendKey_string: string
  sec_spendKey_string: string
}

//func we use from the bridge
interface Bridge {
  newly_created_wallet(localeLanguageCode: string, nettype: number): CreatedWalletResult
  seed_and_keys_from_mnemonic(mnemonic: string, nettype: number): MnemonicKeysResult
}

let bridgePromise: Promise<Bridge> | null = null

//et the instance of the bridge
export function getBridge(): Promise<Bridge> {
  if (bridgePromise === null) {
    bridgePromise = (loadBridge as (options: object) => Promise<Bridge>)({}).catch((error: unknown) => {
      bridgePromise = null
      throw error
    })
  }
  return bridgePromise
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.trim().replace(/\s+/g, ' ') //done
}

function toWalletSecrets(result: MnemonicKeysResult, mnemonic: string): WalletSecrets {

  return {
    mnemonic,
    seed: result.sec_seed_string ?? result.sec_spendKey_string, //same as the private spend key

    address: result.address_string,
    pubSpendKey: result.pub_spendKey_string,
    pubViewKey: result.pub_viewKey_string,
    secSpendKey: result.sec_spendKey_string,
    secViewKey: result.sec_viewKey_string
  }
}

//core funcs
export async function createWalletSecrets(): Promise<WalletSecrets> {
  const bridge = await getBridge()

  let result: CreatedWalletResult

  try {
    result = bridge.newly_created_wallet('en-US', NETTYPE) //done
  } catch (error) {
    throw new Error(`newly_created_wallet failed: ${errorMessage(error)}`)
  }

  const mnemonic = normalizeMnemonic(result.mnemonic_string)
  const wordCount = mnemonic.split(' ').filter(Boolean).length //good
  if (wordCount !== 25) {
    throw new Error(`Bridge returned a ${wordCount}-word seed; expected twenty-five words`)
  }

  return toWalletSecrets(result, mnemonic)
}

export async function deriveWalletSecrets(mnemonic: string): Promise<WalletSecrets> {
  const normalized = normalizeMnemonic(mnemonic)

  if (normalized.length === 0) {
    throw new Error('mnemonic must not be empty')
  }

  const bridge = await getBridge()

  let result: MnemonicKeysResult
  try {
    result = bridge.seed_and_keys_from_mnemonic(normalized, NETTYPE)
  } catch (error) {
    throw new Error(`seed_and_keys_from_mnemonic failed: ${errorMessage(error)}`)
  }

  return toWalletSecrets(result, normalized)
}
