import { useState, type FormEvent } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { TextInput } from '@astryxdesign/core/TextInput'
import { LockKeyhole, Mail, Workflow } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { FloatingThemeToggle } from '../components/FloatingThemeToggle'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setIsLoading(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) setError(signInError.message)
    setIsLoading(false)
  }

  async function handlePasswordReset() {
    if (!email) {
      setError('Enter your company email first, then request a password reset.')
      return
    }
    setError(null)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    if (resetError) setError(resetError.message)
    else setMessage('Password reset email sent. Check your inbox.')
  }

  return (
    <>
      <FloatingThemeToggle />
      <main className="auth-shell">
      <section className="auth-panel auth-brand-panel">
        <div className="brand-mark"><Workflow size={22} /></div>
        <div>
          <p className="eyebrow">FlowLane</p>
          <h1>Keep the whole department moving in the same direction.</h1>
          <p className="auth-lead">A focused Kanban workspace for clear ownership, consistent tasks and visible blockers.</p>
        </div>
        <div className="auth-feature-list">
          <span>Invite-only team access</span>
          <span>Realtime Kanban updates</span>
          <span>Read-only Viewer accounts</span>
        </div>
      </section>

      <section className="auth-panel auth-form-panel">
        <form className="auth-form" onSubmit={handleSubmit}>
          <div>
            <p className="eyebrow">Welcome back</p>
            <h2>Sign in to FlowLane</h2>
            <p className="muted">Use the email address associated with your invited account.</p>
          </div>
          <TextInput
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            startIcon={Mail}
            placeholder="name@company.com"
            isRequired
          />
          <TextInput
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            startIcon={LockKeyhole}
            placeholder="Your password"
            isRequired
          />
          {error ? <div className="inline-alert error-alert">{error}</div> : null}
          {message ? <div className="inline-alert success-alert">{message}</div> : null}
          <Button label="Sign in" variant="primary" type="submit" width="100%" isLoading={isLoading} />
          <button className="text-button" type="button" onClick={handlePasswordReset}>Forgot password?</button>
          <p className="auth-footnote">Accounts are invite-only. Contact a FlowLane administrator if you need access.</p>
        </form>
      </section>
    </main>
    </>
  )
}
