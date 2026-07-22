import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Selector } from '@/components/ui/Selector'
import { TextInput } from '@/components/ui/TextInput'
import { Eye, MailPlus, Search, ShieldCheck, UserPlus, UserRoundCheck, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Profile, WorkspaceRole } from '../../types/domain'

interface TeamPanelProps {
  workspaceId: string
  profiles: Profile[]
  members: Array<{ user_id: string; role: WorkspaceRole }>
  onInvited: () => Promise<void> | void
}

interface DirectoryResult {
  id: string
  email: string
  displayName: string | null
  avatarUrl: string | null
}

const roleOptions = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'MEMBER', label: 'Member' },
  { value: 'VIEWER', label: 'Viewer' },
]

const roleIcon = {
  ADMIN: ShieldCheck,
  MEMBER: UserRoundCheck,
  VIEWER: Eye,
} as const

export function TeamPanel({ workspaceId, profiles, members, onInvited }: TeamPanelProps) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<WorkspaceRole>('MEMBER')
  const [results, setResults] = useState<DirectoryResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [addingUserId, setAddingUserId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rows = useMemo(() => members.map((member) => ({
    ...member,
    profile: profiles.find((profile) => profile.id === member.user_id),
  })), [members, profiles])

  useEffect(() => {
    const query = email.trim().toLowerCase()
    if (query.length < 2) {
      setResults([])
      return
    }

    const timer = window.setTimeout(async () => {
      setIsSearching(true)
      const { data, error: searchError } = await supabase.functions.invoke('team-directory', {
        body: { action: 'search', workspaceId, query },
      })
      if (searchError || data?.error) {
        setError(searchError?.message ?? String(data.error))
        setResults([])
      } else {
        setResults((data?.results ?? []) as DirectoryResult[])
      }
      setIsSearching(false)
    }, 250)

    return () => window.clearTimeout(timer)
  }, [email, workspaceId])

  async function addRegisteredUser(user: DirectoryResult) {
    setError(null)
    setMessage(null)
    setAddingUserId(user.id)

    const { data, error: addError } = await supabase.functions.invoke('team-directory', {
      body: { action: 'add', workspaceId, userId: user.id, role },
    })

    if (addError || data?.error) {
      setError(addError?.message ?? String(data.error))
      setAddingUserId(null)
      return
    }

    setEmail('')
    setResults([])
    setMessage(`${user.email} was added to this workspace as ${role}.`)
    await onInvited()
    setAddingUserId(null)
  }

  async function inviteMember(event: FormEvent) {
    event.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) return

    setError(null)
    setMessage(null)
    setIsLoading(true)

    const { data, error: invokeError } = await supabase.functions.invoke('invite-member', {
      body: {
        workspaceId,
        email: normalizedEmail,
        role,
        redirectTo: window.location.origin,
      },
    })

    if (invokeError || data?.error) {
      setError(invokeError?.message ?? String(data?.error))
      setIsLoading(false)
      return
    }

    setEmail('')
    setResults([])
    setMessage(`Invitation sent to ${normalizedEmail} as ${role}.`)
    await onInvited()
    setIsLoading(false)
  }

  return (
    <section className="team-page">
      <div className="team-page-heading">
        <div>
          <p className="eyebrow">Workspace access</p>
          <h2>Team</h2>
          <p className="muted">Find existing FlowLane users by email, add them instantly, or invite a new person by email.</p>
        </div>
        <div className="team-count"><Users size={17} /><strong>{members.length}</strong><span>people</span></div>
      </div>

      <form className="invite-card team-directory-card" onSubmit={inviteMember}>
        <div className="invite-card-icon"><Search size={19} /></div>
        <div className="invite-copy">
          <strong>Add someone to this workspace</strong>
          <span>Registered users can be added immediately and will see this workspace in their workspace switcher.</span>
        </div>
        <div className="invite-email team-directory-search">
          <TextInput
            label="Search registered email"
            isLabelHidden
            type="email"
            value={email}
            onChange={(value) => { setEmail(value); setError(null); setMessage(null) }}
            placeholder="Search email…"
            startIcon={Search}
          />
          {email.trim().length >= 2 ? (
            <div className="team-directory-results">
              {isSearching ? <div className="team-directory-state">Searching FlowLane users…</div> : null}
              {!isSearching && results.map((result) => (
                <div className="team-directory-result" key={result.id}>
                  <span className="avatar-circle">{(result.displayName || result.email).slice(0, 1).toUpperCase()}</span>
                  <div className="team-directory-result-copy">
                    <strong>{result.displayName || result.email.split('@')[0]}</strong>
                    <span>{result.email}</span>
                  </div>
                  <Button
                    label="Add"
                    variant="secondary"
                    icon={<UserPlus size={15} />}
                    isLoading={addingUserId === result.id}
                    onClick={() => void addRegisteredUser(result)}
                  />
                </div>
              ))}
              {!isSearching && results.length === 0 ? (
                <div className="team-directory-state">No registered user found. You can send an email invitation instead.</div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="invite-role-selector">
          <Selector
            label="Role"
            isLabelHidden
            options={roleOptions}
            value={role}
            onChange={(value) => setRole(value as WorkspaceRole)}
            width="100%"
          />
        </div>
        <Button label="Invite by email" variant="primary" type="submit" icon={<MailPlus size={16} />} isLoading={isLoading} />
      </form>

      {message ? <div className="inline-alert success-alert">{message}</div> : null}
      {error ? <div className="inline-alert error-alert">{error}</div> : null}

      <div className="role-explainer">
        <div><span className="role-chip role-admin"><ShieldCheck size={12} />Admin</span><span>Full workspace, project and member management.</span></div>
        <div><span className="role-chip role-member"><UserRoundCheck size={12} />Member</span><span>Create, edit, assign and move tasks.</span></div>
        <div><span className="role-chip role-viewer"><Eye size={12} />Viewer</span><span>Live Kanban visibility only; no workflow changes.</span></div>
      </div>

      <div className="team-table-shell">
        <div className="team-table-header"><span>Person</span><span>Role</span><span>Access</span></div>
        {rows.map(({ user_id, role: memberRole, profile }) => {
          const RoleIcon = roleIcon[memberRole]
          return (
            <div className="team-row" key={user_id}>
              <div className="team-person">
                <span className="avatar-circle">{(profile?.display_name || profile?.email || '?').slice(0, 1).toUpperCase()}</span>
                <div><strong>{profile?.display_name || profile?.email?.split('@')[0] || 'Invited user'}</strong><span>{profile?.email || 'Invitation pending'}</span></div>
              </div>
              <span className={`role-chip role-${memberRole.toLowerCase()}`}><RoleIcon size={13} />{memberRole.charAt(0) + memberRole.slice(1).toLowerCase()}</span>
              <span className="team-access"><ShieldCheck size={14} />{memberRole === 'VIEWER' ? 'Read only' : memberRole === 'ADMIN' ? 'Full access' : 'Workflow access'}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
