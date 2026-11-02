import { useCallback, useEffect, useState } from 'react'
import type { SavedWallet, WalletCredential } from '../lib/api'
import { atomicToBdx, shortHash } from '../lib/format'
import {
  balanceFromUnspent,
  fetchAddressTxs,
  fetchUnspent,
  loginToLws,
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
}

export default function Dashboard({
  wallet,
  credential,
  onNewWallet
}: DashboardProps) {
  //done
  const [balanceAtomic, setBalanceAtomic] = useState<bigint | null>(null)
  const [transactions, setTransactions] = useState<LwsAddressTx[]>([])

  const [loading, setLoading] = useState(true) // done
  const [error, setError] = useState<string | null>(null)
  const [sendOpen, setSendOpen] = useState(false)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  //runs when ever the credentiols changes
  const loadActivity = useCallback(async () => {
    try {
      await loginToLws(credential) //login with the credentials

      const [unspent, addressTxs] = await Promise.all([
        //call both the functions
        fetchUnspent(credential),
        fetchAddressTxs(credential)
      ])

      setBalanceAtomic(balanceFromUnspent(unspent)) //set the balance of the wallet
      setTransactions(addressTxs.transactions ?? []) //gets the array of txs

    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }, [credential])

  //on mounting it runs the loadActivity function
  useEffect(() => {
    void loadActivity()
  }, [loadActivity])

  //done
  function refreshActivity() {
    setLoading(true) //leading for the balance 
    setError(null)

    void loadActivity()
  }

  function handleSendSuccess(result: SendResult) {
    setSendOpen(false)

    setSuccessMessage(
      `Transaction submitted successfully. Hash: ${shortHash(result.tx_hash)}`
    )
    refreshActivity()
  }

  return (
    <>
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Active wallet</p>
          {/* wallet name  */}
          <h1>{wallet.label}</h1> 
        </div> 
        <button type="button" className="ghost-button" onClick={onNewWallet}> 
          {/* creats the new wallet */}
          New wallet
        </button>
      </header>

      <section className="balance-card">
        <div>
          <span className="field-label">Available balance</span>

          <p className="balance-value">
            {/* done */}
            {balanceAtomic === null ? '—' : atomicToBdx(balanceAtomic)} 
            <span className="balance-unit">BDX</span>
          </p>

        </div>
        {/* done */}
        {loading && <span className="spinner" aria-label="Refreshing balance" />}
      </section>

      <section className="address-card">
        <div className="address-head">
          <span className="field-label">Wallet address</span>
          {/* done */}
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
        {/* for the send */}
        <button
          type="button"
          className="action-button send-action"
          onClick={() => setSendOpen(true)}
        >
          Send
        </button>
        {/* for the receive */}
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
            // to get the new tx 
            onClick={refreshActivity} 
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>

        </div>
        {/* todo : look into it */}
        <TransactionList
          transactions={transactions}
          loading={loading}
          error={error}
        />
      </section>

      {/* done */}
      {sendOpen && (
        <SendModal
          credential={credential}
          balanceAtomic={balanceAtomic}
          onClose={() => setSendOpen(false)}
          onSuccess={handleSendSuccess} //retruns the result.. should be rendered on the screen
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
