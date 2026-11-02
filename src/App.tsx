import { useState, type FormEvent } from 'react'
import Dashboard from './components/Dashboard'
import { createWallet, importWallet, type SavedWallet } from './lib/api'

type Mode = 'create' | 'import'

export default function App() {
  const [mode, setMode] = useState<Mode | null>(null)
  const [label, setLabel] = useState('')
  const [email, setEmail] = useState('')
  const [mnemonic, setMnemonic] = useState('')
  const [activeWallet, setActiveWallet] = useState<SavedWallet | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function chooseMode(nextMode: Mode) {
    if (loading) {
      return
    }

    setMode(nextMode)
    setError(null)
    setLabel('')
    setEmail('')
    setMnemonic('')
  }

  //done
  function handleNewWallet() {
    setMode(null)
    setActiveWallet(null)
    setError(null)
    setLabel('')
    setEmail('')
    setMnemonic('')
  }

  //todo : check this why are we implementing this may be for updating the email
  function handleEmailSaved(nextEmail: string) {
    setActiveWallet(current =>
      current ? { ...current, email: nextEmail } : current
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!mode || loading) {
      return
    }

    const trimmedLabel = label.trim()
    if (trimmedLabel.length === 0) {
      setError('Enter a label for this wallet.')
      return
    }

    const trimmedEmail = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Enter a valid email address for transaction verification.')
      return
    }

    if (mode === 'import' && mnemonic.trim().length === 0) {
      setError('Paste the seed phrase to import.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const wallet =
        mode === 'create'
          ? await createWallet(trimmedLabel, trimmedEmail)
          : await importWallet(trimmedLabel, trimmedEmail, mnemonic)

      if (!wallet.credential) {
        throw new Error('Wallet credentials were not returned by the server')
      }

      setActiveWallet(wallet)
      setMnemonic('')
      setLabel('')
      setEmail('')

      setMode(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }

  if (activeWallet?.credential) {
    return (
      <main className="page">
        <section className="card dashboard-card">
          {/* takes the wallet , credentials and a function to create a new wallet */}
          <Dashboard
            wallet={activeWallet}
            credential={activeWallet.credential}
            onNewWallet={handleNewWallet}
            onEmailSaved={handleEmailSaved}
          />
        </section>
      </main>
    )
  }

  return (
    <main className="page">
      <section className="card">
        <header className="header">
          <p className="eyebrow">Beldex wallet tools</p>
          <h1>Wallet V1</h1>
          <p className="lede">
            Create a new twenty-five-word wallet or import an existing seed. Keys are derived by
            the Beldex WASM bridge and saved to Postgres. An email is required for send
            verification.
          </p>
        </header>

        <div className="mode-grid">
          <button
            type="button"
            className={`mode-button ${mode === 'create' ? 'active' : ''}`}
            onClick={() => chooseMode('create')}
            disabled={loading}
          >
            <span className="mode-title">Create New Wallet</span>
            <span className="mode-copy">Generate a fresh twenty-five-word seed.</span>
          </button>
          <button
            type="button"
            className={`mode-button ${mode === 'import' ? 'active' : ''}`}
            onClick={() => chooseMode('import')}
            disabled={loading}
          >
            <span className="mode-title">Import Existing Wallet</span>
            <span className="mode-copy">Use a seed phrase you already have.</span>
          </button>
        </div>

        {mode && (
          <form className="form" onSubmit={handleSubmit}>
            <label className="field-label" htmlFor="wallet-label">
              Wallet label
            </label>
            <input
              id="wallet-label"
              className="text-input"
              type="text"
              value={label}
              onChange={event => setLabel(event.target.value)}
              placeholder="e.g. Savings"
              autoComplete="off"
              disabled={loading}
            />

            <label className="field-label" htmlFor="wallet-email">
              Email for transaction verification
            </label>
            <input
              id="wallet-email"
              className="text-input"
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              inputMode="email"
              spellCheck={false}
              disabled={loading}
            />
            <p className="field-hint">
              A one-time code will be sent to this email before each send.
            </p>

            {mode === 'import' && (
              <>
                <label className="field-label" htmlFor="wallet-mnemonic">
                  Seed phrase
                </label>
                
                <textarea
                  id="wallet-mnemonic"
                  className="text-input seed-input"
                  value={mnemonic}
                  onChange={event => setMnemonic(event.target.value)}
                  placeholder="Paste the twenty-five-word seed phrase"
                  rows={4}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={loading}
                />
              </>
            )}

            <button className="submit-button" type="submit" disabled={loading}>
              {loading
                ? mode === 'create'
                  ? 'Creating...'
                  : 'Importing...'
                : mode === 'create'
                  ? 'Create wallet'
                  : 'Import wallet'}
            </button>
          </form>
        )}

        {error && (
          <div className="alert" role="alert">
            <strong>Something went wrong</strong>
            <span>{error}</span>
          </div>
        )}

        <footer className="footer">
          <span>Network: MAINNET</span>
          <span>Storage: Postgres</span>
        </footer>
      </section>
    </main>
  )
}
