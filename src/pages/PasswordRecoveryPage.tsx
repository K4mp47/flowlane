import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/TextInput'
import { KeyRound } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { FloatingThemeToggle } from '../components/FloatingThemeToggle'

export function PasswordRecoveryPage() {
  const { completePasswordRecovery } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (password.length < 8) return setError('Use at least 8 characters.')
    if (password !== confirmPassword) return setError('The passwords do not match.')
    setIsLoading(true)
    try {
      await completePasswordRecovery(password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update password.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <FloatingThemeToggle />
      <main className="centered-page">
      <form className="surface-card compact-form" onSubmit={handleSubmit}>
        <div className="brand-mark"><KeyRound size={20} /></div>
        <div>
          <p className="eyebrow">Account recovery</p>
          <h2>Choose a new password</h2>
        </div>
        <TextInput label="New password" type="password" value={password} onChange={setPassword} isRequired />
        <TextInput label="Confirm password" type="password" value={confirmPassword} onChange={setConfirmPassword} isRequired />
        {error ? <div className="inline-alert error-alert">{error}</div> : null}
        <Button label="Update password" variant="primary" type="submit" width="100%" isLoading={isLoading} />
      </form>
    </main>
    </>
  )
}
