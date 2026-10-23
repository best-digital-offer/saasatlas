import { useState, type FormEvent } from 'react'
import { supabase } from './lib/supabase'
import { ArrowRight, X } from 'lucide-react'

type AuthDialogProps = {
  onClose: () => void
  onSignedIn: () => void
}

export default function AuthDialog({ onClose, onSignedIn }: AuthDialogProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setError('')
    if (!supabase) {
      setError('Authentication is not configured. Please try again later.')
      return
    }
    if (mode === 'signup' && password.length < 8) {
      setError('Use a password with at least 8 characters.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'signin') {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (signInError) throw signInError
        onSignedIn()
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        })
        if (signUpError) throw signUpError
        if (data.session) {
          onSignedIn()
        } else {
          setMessage('Check your inbox for the confirmation link. Confirm your email, then return here to sign in.')
        }
      }
    } catch (cause) {
      const messageText = cause instanceof Error ? cause.message : 'Authentication failed. Please try again.'
      setError(messageText.includes('Invalid login credentials')
        ? 'Email or password is incorrect.'
        : messageText.includes('Email not confirmed')
          ? 'Please confirm your email address before signing in.'
          : messageText)
    } finally {
      setBusy(false)
    }
  }

  return <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="dialog info-dialog auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-dialog-title">
      <button className="close-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
      <span className="modal-mark">S</span>
      <h2 id="auth-dialog-title">{mode === 'signin' ? 'Welcome back' : 'Create your founder account'}</h2>
      <p>{mode === 'signin' ? 'Sign in to manage your listings and standing bids.' : 'Create an account to manage your product listings on SaaslistAtlas.'}</p>
      <form onSubmit={submit} className="auth-form">
        <label htmlFor="auth-email">Email address</label>
        <input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" />
        <label htmlFor="auth-password">Password</label>
        <input id="auth-password" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'signin' ? 'Your password' : 'At least 8 characters'} />
        {error && <p className="auth-error" role="alert">{error}</p>}
        {message && <p className="auth-success" role="status">{message}</p>}
        <button className="button button-primary button-wide" type="submit" disabled={busy || !supabase}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'} <ArrowRight size={14} /></button>
      </form>
      <p className="auth-switch">{mode === 'signin' ? 'New to SaaslistAtlas?' : 'Already have an account?'} <button type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setMessage('') }}>{mode === 'signin' ? 'Create an account' : 'Sign in'}</button></p>
      {mode === 'signup' && <small className="modal-footnote">Email confirmation may be required. Account access, listing eligibility, and bids are checked by the server.</small>}
    </section>
  </div>
}
