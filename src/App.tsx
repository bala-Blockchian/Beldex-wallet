//done
import { useState, type FormEvent } from 'react'
import { createWallet, importWallet, type SavedWallet } from './lib/api'

type Mode = 'create' | 'import'

function KeyRow({ label, value }: { label: string; value?: string }) {
  return (
    //table
    <div className="key-row">
      <dt>{label}</dt>
      <dd>{value && value.length > 0 ? value : '-'}</dd>
    </div>
  )
}

export default function App() {
  const [mode, setMode] = useState<Mode | null>(null)
  const [label, setLabel] = useState('')
  const [mnemonic, setMnemonic] = useState('')
  const [result, setResult] = useState<SavedWallet | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function chooseMode(nextMode: Mode) { //create mode 
    if (loading) {
      return
    }
    setMode(nextMode)
    setResult(null)
    setError(null)

    setLabel('')
    setMnemonic('')
  }

  function reset() {
    setMode(null)
    setResult(null)
    setError(null)
    setLabel('')
    setMnemonic('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    //currently in yhe choose mode state
    if (!mode || loading) {
      return
    }

    const trimmedLabel = label.trim()
    //done 
    if (trimmedLabel.length === 0) {
      setError('Enter a label for this wallet.')
      return
    }
    //done
    if (mode === 'import' && mnemonic.trim().length === 0) {
      setError('Paste the seed phrase to import.')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const wallet =
        mode === 'create'
          ? await createWallet(trimmedLabel)
          : await importWallet(trimmedLabel, mnemonic)

      setResult(wallet)
      setMnemonic('')

    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }

  const credential = result?.credential

  return (
    <main className="page">
      <section className="card">
        <header className="header">

          <p className="eyebrow">Beldex wallet tools</p>
          <h1>Wallet V1</h1>
          <p className="lede">
            Create a new twenty-five-word wallet or import an existing seed. Keys are derived by
            the Beldex WASM bridge and saved to Postgres.
          </p>
        </header>

        {!result && (
          <>
            <div className="mode-grid">
              {/* button for creating new wallet */}
              <button
                type="button"
                className={`mode-button ${mode === 'create' ? 'active' : ''}`}
                onClick={() => chooseMode('create')}
                disabled={loading}
              >
                <span className="mode-title">Create New Wallet</span>
                <span className="mode-copy">Generate a fresh twenty-five-word seed.</span>
              </button>
              {/* button for the importing the wallet */}
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
            {/* depends on the mode */}
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
                  onChange={event => setLabel(event.target.value)} //get the name of the wallet
                  placeholder="e.g. Savings"
                  autoComplete="off"
                  disabled={loading}
                />

                {mode === 'import' && (
                  <>
                    <label className="field-label" htmlFor="wallet-mnemonic">
                      Seed phrase
                    </label>
                    <textarea
                      id="wallet-mnemonic"
                      className="text-input seed-input"
                      value={mnemonic}
                      onChange={event => setMnemonic(event.target.value)} //get the existing seed from the user
                      placeholder="Paste the twenty-five-word seed phrase"
                      rows={4}
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      disabled={loading}
                    />
                  </>
                )}
                {/* done */}
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
          </>
        )}

        {error && (
          <div className="alert" role="alert">
            <strong>Something went wrong</strong>
            <span>{error}</span>
          </div>
        )}  
        {/* done */}

        {result && credential && (
          <section className="result" aria-live="polite">
            <div className="result-header">
              <div>
                <p className="eyebrow">Saved to Postgres</p>
                {/* wallet name */}
                <h2>{result.label}</h2> 
              </div>
              <span className="success-pill">Wallet ready</span>
            </div>

            <div className="seed-block">
              <span className="field-label">Seed phrase</span>
              <p className="seed-phrase">{credential.seedPhrase}</p>
            </div>

            <dl className="key-grid">
              <KeyRow label="Address" value={credential.address} />
              <KeyRow label="Private spend key" value={credential.secSpendKey} />
              <KeyRow label="Private view key" value={credential.secViewKey} />
              <KeyRow label="Public spend key" value={credential.pubSpendKey} />
              <KeyRow label="Public view key" value={credential.pubViewKey} />
            </dl>

            <button type="button" className="submit-button" onClick={reset}>
              Create or import another wallet
            </button>
          </section>
        )}

        <footer className="footer">
          <span>Network: MAINNET</span>
          <span>Storage: Postgres</span>
        </footer>
      </section>
    </main>
  )
}
