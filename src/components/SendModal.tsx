import { useState, type FormEvent } from 'react'
import type { WalletCredential } from '../lib/api'
import { atomicToBdx, bdxToAtomic } from '../lib/format'
import { sendFromWallet, type SendResult } from '../lib/lws'
import Modal from './Modal'

interface SendModalProps {
  credential: WalletCredential
  balanceAtomic: bigint | null
  onClose: () => void
  onSuccess: (result: SendResult) => void
}

export default function SendModal({
  credential,
  balanceAtomic, //get the balance from the input
  onClose,
  onSuccess
}: SendModalProps) {

  const [receiver, setReceiver] = useState('')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (loading) {
      return
    }

    try {
      if (receiver.trim().length === 0) {
        throw new Error('Enter a receiver address')
      }

      if (balanceAtomic === null) {
        throw new Error('Balance is still loading. Try again in a moment.')
      }

      const atomic = bdxToAtomic(amount)
      if (atomic <= 0n) {
        throw new Error('Amount must be greater than zero')
      }

      // if the send amount is greater than the balane revert it
      if (atomic > balanceAtomic) { 
        throw new Error('Amount exceeds the available balance')
      }

      setLoading(true)
      setError(null)
      setProgress('Preparing transaction...')

      const result = await sendFromWallet(

        credential,
        receiver,
        atomicToBdx(atomic),
        
        setProgress
      )

      setLoading(false)
      onSuccess(result) //reverting the results 

    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setProgress(null)
      setLoading(false)
    }
  }

  return (
    <Modal title="Send BDX" onClose={onClose} closeDisabled={loading}>
      <form className="modal-form" onSubmit={handleSubmit}>
        <p className="modal-copy">
          Available balance:{' '}
          <strong>
            {/* show the bdx balance */}
            {balanceAtomic === null ? 'Loading...' : `${atomicToBdx(balanceAtomic)} BDX`} 
          </strong>
        </p>

        <label className="field-label" htmlFor="send-receiver">
          Receiver address
        </label>
        <input
          id="send-receiver"
          className="text-input"
          type="text"
          value={receiver}
          onChange={event => setReceiver(event.target.value)}
          placeholder="Beldex address"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          disabled={loading}
          autoFocus
        />

        <label className="field-label" htmlFor="send-amount">
          Amount in BDX
        </label>
        <input
          id="send-amount"
          className="text-input"
          type="number"
          min="0"
          step="0.000000001"
          value={amount}
          onChange={event => setAmount(event.target.value)}
          placeholder="0.00"
          inputMode="decimal"
          disabled={loading}
        />

        {progress && (
          <p className="progress" role="status">
            <span className="spinner" aria-hidden="true" />
            {progress}
          </p>
        )}

        {error && (
          <div className="alert" role="alert">
            <strong>Send failed</strong>
            <span>{error}</span>
          </div>
        )}

        <div className="modal-actions">
          {/* close button */}
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          {/* send button */}
          <button
            type="submit"
            className="submit-button send-button"
            disabled={loading || balanceAtomic === null} //if the balance is zero and the loading is true
          >
            {loading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
