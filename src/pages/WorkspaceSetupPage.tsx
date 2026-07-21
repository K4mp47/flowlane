import { useState, type FormEvent } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Building2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { FloatingThemeToggle } from '../components/FloatingThemeToggle'

export function WorkspaceSetupPage() {
  const { user, refreshMembership, signOut } = useAuth()
  const [name, setName] = useState('KanBan Tutondo')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function createWorkspace(event: FormEvent) {
    event.preventDefault()
    if (!user) return
    setError(null)
    setIsLoading(true)
    const { error: insertError } = await supabase
      .from('workspaces')
      .insert({ name: name.trim(), created_by: user.id })

    if (insertError) {
      setError(insertError.message)
      setIsLoading(false)
      return
    }

    await refreshMembership()
    setIsLoading(false)
  }

  return (
    <>
      <FloatingThemeToggle />
      <main className="centered-page">
      <form className="surface-card compact-form" onSubmit={createWorkspace}>
        <div className="brand-mark"><Building2 size={20} /></div>
        <div>
          <p className="eyebrow">First-time setup</p>
          <h2>Create the FlowLane workspace</h2>
          <p className="muted">The first workspace creator becomes its Admin. FlowLane will create the standard Kanban columns and task types automatically.</p>
        </div>
        <TextInput label="Workspace name" value={name} onChange={setName} isRequired />
        {error ? <div className="inline-alert error-alert">{error}</div> : null}
        <Button label="Create workspace" variant="primary" type="submit" width="100%" isLoading={isLoading} />
        <button className="text-button" type="button" onClick={() => void signOut()}>Sign out</button>
      </form>
    </main>
    </>
  )
}
