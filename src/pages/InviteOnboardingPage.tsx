import { useState, type FormEvent } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { TextInput } from '@astryxdesign/core/TextInput'
import { KeyRound, UserRoundCheck, Workflow } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { FloatingThemeToggle } from '../components/FloatingThemeToggle'

export function InviteOnboardingPage() {
  const { user, membership, completeInviteOnboarding, signOut } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Use at least 8 characters for your password.')
      return
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.')
      return
    }

    setIsLoading(true)
    try {
      await completeInviteOnboarding(password, displayName)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to finish account setup.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <FloatingThemeToggle />
      <main className="auth-shell invite-onboarding-shell">
        <section className="auth-panel auth-brand-panel">
          <div className="brand-mark"><Workflow size={22} /></div>
          <div>
            <p className="eyebrow">FlowLane invitation</p>
            <h1>Finish setting up your workspace account.</h1>
            <p className="auth-lead">Your invitation has been accepted. Choose a password and you can start collaborating immediately.</p>
          </div>
          <div className="auth-feature-list">
            <span><UserRoundCheck size={15} /> {membership?.workspace.name ?? 'Your workspace'}</span>
            <span>{membership?.role ? `${membership.role.charAt(0)}${membership.role.slice(1).toLowerCase()} access` : 'Workspace access'}</span>
            <span>Invite-only account</span>
          </div>
        </section>

        <section className="auth-panel auth-form-panel">
          <form className="auth-form" onSubmit={handleSubmit}>
            <div>
              <p className="eyebrow">Complete account</p>
              <h2>Create your password</h2>
              <p className="muted">Signed in as {user?.email}. This password will be used for future FlowLane sign-ins.</p>
            </div>

            <TextInput
              label="Display name"
              value={displayName}
              onChange={setDisplayName}
              placeholder="How your team should see you"
              isOptional
              width="100%"
            />
            <TextInput
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              startIcon={KeyRound}
              placeholder="At least 8 characters"
              isRequired
              width="100%"
            />
            <TextInput
              label="Confirm password"
              type="password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              startIcon={KeyRound}
              placeholder="Repeat your password"
              isRequired
              width="100%"
            />

            {error ? <div className="inline-alert error-alert">{error}</div> : null}

            <Button label="Finish setup" variant="primary" type="submit" width="100%" isLoading={isLoading} />
            <button className="text-button" type="button" onClick={() => void signOut()}>Sign out and use another account</button>
          </form>
        </section>
      </main>
    </>
  )
}
