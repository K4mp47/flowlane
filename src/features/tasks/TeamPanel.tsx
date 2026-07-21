import { useMemo, useState, type FormEvent } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Selector } from '@astryxdesign/core/Selector'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Eye, MailPlus, ShieldCheck, UserRoundCheck, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Profile, WorkspaceRole } from '../../types/domain'

interface TeamPanelProps {
  workspaceId: string
  profiles: Profile[]
  members: Array<{ user_id: string; role: WorkspaceRole }>
  onInvited: () => Promise<void> | void
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
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rows = useMemo(() => members.map((member) => ({
    ...member,
    profile: profiles.find((profile) => profile.id === member.user_id),
  })), [members, profiles])

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

    if (invokeError) {
      setError(invokeError.message)
      setIsLoading(false)
      return
    }

    if (data?.error) {
      setError(String(data.error))
      setIsLoading(false)
      return
    }

    setEmail('')
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
          <p className="muted">Invite employees and choose how much of FlowLane they can access.</p>
        </div>
        <div className="team-count"><Users size={17} /><strong>{members.length}</strong><span>people</span></div>
      </div>

      <form className="invite-card" onSubmit={inviteMember}>
        <div className="invite-card-icon"><MailPlus size={19} /></div>
        <div className="invite-copy">
          <strong>Invite a colleague</strong>
          <span>Invitations are email-based and access stays invite-only.</span>
        </div>
        <div className="invite-email">
          <TextInput
            label="Email"
            isLabelHidden
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="name@company.com"
            isRequired
          />
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
        <Button label="Send invite" variant="primary" type="submit" isLoading={isLoading} />
      </form>

      {message ? <div className="inline-alert success-alert">{message}</div> : null}
      {error ? <div className="inline-alert error-alert">{error}</div> : null}

      <div className="role-explainer">
        <div><span className="role-chip role-admin"><ShieldCheck size={12} />Admin</span><span>Full workspace, board and member management.</span></div>
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