const ATOMIC_PER_BDX = 1_000_000_000n
const BDX_DECIMALS = 9

//done
export function atomicToBdx(atomic: bigint): string {
  if (atomic < 0n) {
    throw new Error('Amount cannot be negative')
  }

  const whole = atomic / ATOMIC_PER_BDX
  const fraction = atomic % ATOMIC_PER_BDX

  if (fraction === 0n) {
    return whole.toString()
  }

  const fractionText = fraction
    .toString()
    .padStart(BDX_DECIMALS, '0')
    .replace(/0+$/, '')

  return `${whole}.${fractionText}`
}

export function bdxToAtomic(value: string): bigint {
  const trimmed = value.trim()
  const pattern = new RegExp(`^\\d+(\\.\\d{1,${BDX_DECIMALS}})?$`)

  if (!pattern.test(trimmed)) {
    throw new Error(`Amount must have at most ${BDX_DECIMALS} decimal places`)
  }

  const [whole = '0', fraction = ''] = trimmed.split('.')
  return (
    BigInt(whole) * ATOMIC_PER_BDX +
    BigInt(fraction.padEnd(BDX_DECIMALS, '0'))
  )
}

//done
export function parseAtomic(value: unknown): bigint {
  if (value === undefined || value === null || value === '') {
    return 0n
  }

  try {
    return BigInt(String(value).trim())
  } catch {
    return 0n
  }
}

export function formatTimestamp(value?: string): string {
  if (!value) {
    return 'Pending'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

export function shortHash(hash?: string): string {
  if (!hash) {
    return 'Pending'
  }

  if (hash.length <= 18) {
    return hash
  }

  return `${hash.slice(0, 10)}...${hash.slice(-6)}`
}
