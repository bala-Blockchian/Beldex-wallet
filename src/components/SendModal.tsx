import { useState, type FormEvent } from 'react'
import {
  saveWalletEmail,
  type WalletCredential
} from '../lib/api'
import { atomicToBdx, bdxToAtomic } from '../lib/format'
import { sendFromWallet, type SendResult } from '../lib/lws'
import {
  completeOtp,
  requestOtp,
  verifyOtp
} from '../lib/otp'
import Modal from './Modal'

interface SendModalProps {
  credential: WalletCredential
  walletEmail: string | null
  balanceAtomic: bigint | null
  onClose: () => void
  onSuccess: (result: SendResult, amountAtomic: bigint) => void
  onEmailSaved: (email: string) => void
}

type Step = 'details' | 'otp'

function normalizedEmail(value: string): string {
  return value.trim().toLowerCase()
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export default function SendModal({
  credential,
  walletEmail,
  balanceAtomic,
  onClose,
  onSuccess,
  onEmailSaved
}: SendModalProps) {
  const [step, setStep] = useState<Step>('details')
  const [receiver, setReceiver] = useState('')
  const [amount, setAmount] = useState('')
  const [email, setEmail] = useState(walletEmail ?? '')
  const [emailSaved, setEmailSaved] = useState(Boolean(walletEmail))
  const [otpId, setOtpId] = useState<string | null>(null)
  const [otpCode, setOtpCode] = useState('')
  const [maskedEmail, setMaskedEmail] = useState('')
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  const busy = requesting || verifying || sending

  function validateAmount(): bigint {
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

    if (atomic > balanceAtomic) {
      throw new Error('Amount exceeds the available balance')
    }

    return atomic
  }

  async function ensureEmail(): Promise<string> {
    if (emailSaved) {
      return normalizedEmail(email)
    }

    const nextEmail = normalizedEmail(email)
    if (!isValidEmail(nextEmail)) {
      throw new Error('Enter a valid email address for transaction verification')
    }

    const savedEmail = await saveWalletEmail(
      credential.walletId,
      credential.secViewKey,
      nextEmail
    )

    if (!savedEmail) {
      throw new Error('The email could not be saved to this wallet')
    }

    setEmail(savedEmail)
    setEmailSaved(true)
    onEmailSaved(savedEmail)
    return savedEmail
  }

  async function requestVerificationCode(atomic: bigint): Promise<void> {
    const response = await requestOtp(
      credential,
      receiver.trim(),
      atomic
    )

    setOtpId(response.otpId)
    setMaskedEmail(response.maskedEmail)
    setExpiresAt(response.expiresAt)
    setOtpCode('')
    setStep('otp')
  }

  async function handleRequestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (busy) {
      return
    }

    setError(null)

    try {
      const atomic = validateAmount()
      setRequesting(true)
      await ensureEmail()
      await requestVerificationCode(atomic)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setRequesting(false)
    }
  }

  async function handleResendOtp() {
    if (busy) {
      return
    }

    setError(null)

    try {
      const atomic = validateAmount()
      setRequesting(true)
      await requestVerificationCode(atomic)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setRequesting(false)
    }
  }

  async function handleVerifyAndSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (busy || !otpId) {
      return
    }

    setError(null)
    setProgress(null)

    try {
      const atomic = validateAmount()
      setVerifying(true)

      const verification = await verifyOtp(credential, otpId, otpCode)

      if (Date.parse(verification.expiresAt) <= Date.now()) {
        throw new Error('This verification code has expired. Request a new one.')
      }

      setVerifying(false)
      setSending(true)
      setProgress('Preparing transaction...')

      const result = await sendFromWallet(
        credential,
        receiver,
        atomicToBdx(atomic),
        setProgress
      )

      try {
        await completeOtp(credential, otpId, result.tx_hash)
      } catch {
        // The transaction is already submitted; completion is only audit data.
      }

      setProgress(null)
      setSending(false)
      onSuccess(result, atomic)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setProgress(null)
      setVerifying(false)
      setSending(false)
    }
  }

  function handleEditDetails() {
    if (busy) {
      return
    }

    setStep('details')
    setOtpId(null)
    setOtpCode('')
    setMaskedEmail('')
    setExpiresAt(null)
    setError(null)
    setProgress(null)
  }

  return (
    <Modal
      title={step === 'otp' ? 'Verify send' : 'Send BDX'}
      onClose={onClose}
      closeDisabled={busy}
    >
      {step === 'details' ? (
        <form className="modal-form" onSubmit={handleRequestOtp}>
          <p className="modal-copy">
            Available balance:{' '}
            <strong>
              {balanceAtomic === null
                ? 'Loading...'
                : `${atomicToBdx(balanceAtomic)} BDX`}
            </strong>
          </p>

          {!emailSaved && (
            <>
              <label className="field-label" htmlFor="send-email">
                Email for verification
              </label>
              <input
                id="send-email"
                className="text-input"
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                inputMode="email"
                spellCheck={false}
                disabled={requesting || sending}
                autoFocus
              />
              <p className="field-hint">
                This email will be saved to your wallet and used for one-time
                codes before each send.
              </p>
            </>
          )}

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
            disabled={requesting || sending}
            autoFocus={emailSaved}
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
            disabled={requesting || sending}
          />

          {error && (
            <div className="alert" role="alert">
              <strong>Something went wrong</strong>
              <span>{error}</span>
            </div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={requesting || sending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="submit-button send-button"
              disabled={requesting || balanceAtomic === null}
            >
              {requesting ? 'Sending code...' : 'Send OTP'}
            </button>
          </div>
        </form>
      ) : (
        <form className="modal-form" onSubmit={handleVerifyAndSend}>
          <p className="modal-copy">
            Enter the 6-digit code sent to <strong>{maskedEmail}</strong>.
          </p>

          <label className="field-label" htmlFor="send-otp">
            Verification code
          </label>
          <input
            id="send-otp"
            className="text-input otp-input"
            type="text"
            value={otpCode}
            onChange={event =>
              setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))
            }
            placeholder="000000"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            disabled={verifying || sending}
            autoFocus
          />
          {expiresAt && (
            <p className="field-hint">
              Code expires at{' '}
              {new Date(expiresAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
              .
            </p>
          )}

          {progress && (
            <p className="progress" role="status">
              <span className="spinner" aria-hidden="true" />
              {progress}
            </p>
          )}

          {error && (
            <div className="alert" role="alert">
              <strong>Something went wrong</strong>
              <span>{error}</span>
            </div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={handleEditDetails}
              disabled={verifying || sending}
            >
              Edit details
            </button>
            <button
              type="submit"
              className="submit-button send-button"
              disabled={
                verifying ||
                sending ||
                requesting ||
                otpCode.length !== 6
              }
            >
              {verifying ? 'Verifying...' : sending ? 'Sending...' : 'Verify & Send'}
            </button>
          </div>

          <button
            type="button"
            className="ghost-button resend-button"
            onClick={handleResendOtp}
            disabled={verifying || sending || requesting}
          >
            {requesting ? 'Sending new code...' : 'Resend code'}
          </button>
        </form>
      )}
    </Modal>
  )
}
