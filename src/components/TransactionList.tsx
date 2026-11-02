import {
  atomicToBdx,
  formatTimestamp,
  parseAtomic,
  shortHash
} from '../lib/format'
import type { LwsAddressTx } from '../lib/lws'

interface TransactionListProps {
  transactions: LwsAddressTx[]
  loading: boolean
  error: string | null
}

type Direction = 'received' | 'sent' | 'self'

function classify(transaction: LwsAddressTx): {
  direction: Direction
  label: string
  amount: bigint
  sign: string
} {
  const received = parseAtomic(transaction.total_received)
  const sent = parseAtomic(transaction.total_sent)

  if (sent > 0n && received > 0n) {
    return {
      direction: 'self',
      label: 'Self transfer',
      amount: sent,
      sign: ''
    }
  }

  if (sent > 0n) {
    return {
      direction: 'sent',
      label: 'Sent',
      amount: sent,
      sign: '-'
    }
  }

  return {
    direction: 'received',
    label: 'Received',
    amount: received,
    sign: '+'
  }
}

export default function TransactionList({
  transactions,
  loading,
  error
}: TransactionListProps) {
  if (loading && transactions.length === 0) {
    return <p className="muted-state">Loading transactions...</p>
  }

  if (error && transactions.length === 0) {
    return <p className="muted-state">{error}</p>
  }

  if (transactions.length === 0) {
    return <p className="muted-state">No transactions yet.</p>
  }

  return (
    <ul className="tx-list">
      {transactions.map((transaction, index) => {
        const { direction, label, amount, sign } = classify(transaction)
        const pending = transaction.mempool === true
        const key = transaction.hash ?? transaction.id ?? index

        return (
          <li className="tx-row" key={key}>
            <span className={`tx-icon ${direction}`} aria-hidden="true">
              {direction === 'received' ? 'IN' : 'OUT'}
            </span>

            <div className="tx-main">
              <div className="tx-top">
                <span className={`tx-direction ${direction}`}>{label}</span>
                {pending && <span className="pending-pill">Pending</span>}
              </div>
              <span className="tx-meta">
                {formatTimestamp(transaction.timestamp)}
                {transaction.height !== undefined
                  ? ` · Height ${transaction.height}`
                  : ''}
              </span>
              <span className="tx-hash">{shortHash(transaction.hash)}</span>
            </div>

            <span className={`tx-amount ${direction}`}>
              {sign}
              {atomicToBdx(amount)} BDX
            </span>
          </li>
        )
      })}
    </ul>
  )
}
