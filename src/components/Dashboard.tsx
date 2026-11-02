import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SavedWallet, WalletCredential } from '../lib/api'
import { atomicToBdx, shortHash } from '../lib/format'
import {
  fetchWalletActivity,
  type LwsAddressTx,
  type SendResult
} from '../lib/lws'
import CopyButton from './CopyButton'
import ReceiveModal from './ReceiveModal'
import SendModal from './SendModal'
import TransactionList from './TransactionList'

interface DashboardProps {
  wallet: SavedWallet
  credential: WalletCredential
  onNewWallet: () => void
  onEmailSaved: (email: string) => void
}

export default function Dashboard({
  wallet,
  credential,
  onNewWallet,
  onEmailSaved
}: DashboardProps) {

  const [balanceAtomic, setBalanceAtomic] = useState<bigint | null>(null)
  const [transactions, setTransactions] = useState<LwsAddressTx[]>([])
  const [pendingTransactions, setPendingTransactions] = useState<
    LwsAddressTx[]
  >([])

  const [loading, setLoading] = useState(true) 
  const [error, setError] = useState<string | null>(null)
  const [sendOpen, setSendOpen] = useState(false)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const loadActivity = useCallback(async () => {
    try {
      const activity = await fetchWalletActivity(credential)

      setBalanceAtomic(activity.balanceAtomic)
      setTransactions(activity.transactions)
      
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }, [credential])

  useEffect(() => {
    void loadActivity() 
  }, [loadActivity])

  //continuesly updates the pending tx array
  useEffect(() => {
    if (pendingTransactions.length === 0) {
      return
    }

    let cancelled = false
    let timer: number | undefined
    let attempts = 0
    const maxAttempts = 20
    const intervalMs = 3000

    const poll = async () => {
      if (cancelled) {
        return
      }

      attempts += 1

      try {
        const activity = await fetchWalletActivity(credential, {
          login: false
        })

        if (cancelled) {
          return
        }

        setBalanceAtomic(activity.balanceAtomic)
        setTransactions(activity.transactions)
        //done

        //tx hash that is indexed mean they have the tx hash 
        const indexedHashes = new Set(
          activity.transactions
            .map(transaction => transaction.hash)
            .filter((hash): hash is string => Boolean(hash))
        )

        //if the pending tx hash present in the indexed hash
        const allIndexed = pendingTransactions.every(
          transaction =>
            transaction.hash !== undefined &&
            indexedHashes.has(transaction.hash)
        )

        // updates the pending tx array, the tx that does not have the hash or not present in the indexedHashes
        if (allIndexed) {
          setPendingTransactions(previous =>
            previous.filter(transaction => {
              return (
                transaction.hash === undefined ||
                !indexedHashes.has(transaction.hash)
              )
            })
          )
          return
        }

      } catch {
        // Keep polling; a later attempt may succeed.
      }

      if (!cancelled && attempts < maxAttempts) {
        timer = window.setTimeout(() => void poll(), intervalMs)
      }
    }

    timer = window.setTimeout(() => void poll(), 1500)

    return () => {
      cancelled = true
      if (timer !== undefined) {
        window.clearTimeout(timer)
      }
    }
  }, [credential, pendingTransactions]) //done

  //returns both the pending tx and the indexed txs
  const visibleTransactions = useMemo(() => {
    //by checking the indexed and pending tx and it return both the tx as the array
    const indexedHashes = new Set(
      transactions
        .map(transaction => transaction.hash)
        .filter((hash): hash is string => Boolean(hash))
    )

    const pendingOnly = pendingTransactions.filter(
      transaction =>
        transaction.hash === undefined || !indexedHashes.has(transaction.hash)
    )

    return [...pendingOnly, ...transactions]

  }, [pendingTransactions, transactions])

  function refreshActivity() {
    setLoading(true) 
    setError(null)

    void loadActivity()
  }

  // on sending the tx
  function handleSendSuccess(result: SendResult, amountAtomic: bigint) {
    setSendOpen(false)

    setSuccessMessage(
      `Transaction submitted successfully. Hash: ${shortHash(result.tx_hash)}. Waiting for the network to index it.`
    )

    setPendingTransactions(previous => [
      {
        hash: result.tx_hash,
        timestamp: new Date().toISOString(),
        total_received: '0',
        total_sent: amountAtomic.toString(),
        mempool: true
      },
      ...previous.filter(transaction => transaction.hash !== result.tx_hash)  //prevents the duplicates
    ])

    refreshActivity()
  }

  return (
    <>
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Active wallet</p>
          <h1>{wallet.label}</h1>
        </div>

        <button type="button" className="ghost-button" onClick={onNewWallet}>
          New wallet
        </button>

      </header>
      <section className="balance-card">
        <div>
          <span className="field-label">Available balance</span>
          <p className="balance-value">
            {balanceAtomic === null ? '—' : atomicToBdx(balanceAtomic)}
            <span className="balance-unit">BDX</span>
          </p>
        </div>
        {loading && <span className="spinner" aria-label="Refreshing balance" />}
      </section>

      <section className="address-card">
        <div className="address-head">
          <span className="field-label">Wallet address</span>
          <CopyButton value={credential.address} label="Copy address" />
        </div>
        <code className="address-text">{credential.address}</code>
      </section>

      {successMessage && (
        <div className="success-banner" role="status">
          <span>{successMessage}</span>

          <button
            type="button"
            className="banner-dismiss"
            onClick={() => setSuccessMessage(null)} //null
          >
            Dismiss
          </button>

        </div>
      )}

      {error && (
        <div className="alert" role="alert">
          <strong>Could not refresh wallet activity</strong>
          <span>{error}</span>
        </div>
      )}

      <div className="action-bar">
        <button
          type="button"
          className="action-button send-action"
          onClick={() => setSendOpen(true)}
        >
          Send
        </button>

        <button
          type="button"
          className="action-button receive-action"
          onClick={() => setReceiveOpen(true)}
        >
          Receive
        </button>

      </div>

      <section className="transactions-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Activity</p>
            <h2>Transactions</h2>
          </div>

          <button
            type="button"
            className="ghost-button"
            onClick={refreshActivity}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>

        </div>

        <TransactionList
          transactions={visibleTransactions}
          loading={loading}
          error={error}
        />

      </section>

      {sendOpen && (
        <SendModal
          credential={credential}
          walletEmail={wallet.email}
          balanceAtomic={balanceAtomic}
          onClose={() => setSendOpen(false)}
          onSuccess={handleSendSuccess}
          onEmailSaved={onEmailSaved}
        />
      )}

      {receiveOpen && (
        <ReceiveModal
          address={credential.address}
          onClose={() => setReceiveOpen(false)}
        />
      )}
    </>
  )
}
