import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Selector } from '@/components/ui/Selector'
import { TextInput } from '@/components/ui/TextInput'
import { Eye, KanbanSquare, MailPlus, Search, ShieldCheck, Trash2, UserPlus, UserRoundCheck, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Board, Profile, Project, WorkspaceRole } from '../../types/domain'

interface TeamPanelProps {
  workspaceId: string
  project: Project
  boards: Board[]
  activeBoard: Board
  profiles: Profile[]
  workspaceRole: WorkspaceRole | null
  accessRole: WorkspaceRole | null
  onInvited: () => Promise<void> | void
}

interface DirectoryResult { id: string; email: string; displayName: string | null; avatarUrl: string | null }
interface AccessRow { user_id: string; role: WorkspaceRole; scope: 'PROJECT' | 'BOARD'; resource_id: string }

const roleOptions = [{ value: 'ADMIN', label: 'Admin' }, { value: 'MEMBER', label: 'Member' }, { value: 'VIEWER', label: 'Viewer' }]
const scopeOptions = [{ value: 'PROJECT', label: 'Entire project' }, { value: 'BOARD', label: 'One board only' }]
const roleIcon = { ADMIN: ShieldCheck, MEMBER: UserRoundCheck, VIEWER: Eye } as const

export function TeamPanel({ workspaceId, project, boards, activeBoard, profiles, workspaceRole, accessRole, onInvited }: TeamPanelProps) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<WorkspaceRole>('MEMBER')
  const [scope, setScope] = useState<'PROJECT' | 'BOARD'>('PROJECT')
  const [boardId, setBoardId] = useState(activeBoard.id)
  const [results, setResults] = useState<DirectoryResult[]>([])
  const [accessRows, setAccessRows] = useState<AccessRow[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [addingUserId, setAddingUserId] = useState<string | null>(null)
  const [removingKey, setRemovingKey] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const canManage = workspaceRole === 'ADMIN' || accessRole === 'ADMIN'
  const boardOptions = boards.map((board) => ({ value: board.id, label: board.name }))

  async function refreshAccess() {
    const [projectResult, boardResult] = await Promise.all([
      supabase.from('project_members').select('user_id,role').eq('project_id', project.id),
      supabase.from('board_members').select('board_id,user_id,role').in('board_id', boards.map((board) => board.id)),
    ])
    if (projectResult.error) throw projectResult.error
    if (boardResult.error) throw boardResult.error
    setAccessRows([
      ...(projectResult.data ?? []).map((row) => ({ user_id: row.user_id, role: row.role as WorkspaceRole, scope: 'PROJECT' as const, resource_id: project.id })),
      ...(boardResult.data ?? []).map((row) => ({ user_id: row.user_id, role: row.role as WorkspaceRole, scope: 'BOARD' as const, resource_id: row.board_id })),
    ])
  }

  useEffect(() => { setBoardId(activeBoard.id) }, [activeBoard.id])
  useEffect(() => { if (canManage) void refreshAccess().catch((err) => setError(err instanceof Error ? err.message : 'Unable to load access')) }, [canManage, project.id, boards.map((board) => board.id).join(',')])

  useEffect(() => {
    const query = email.trim().toLowerCase()
    if (query.length < 2 || !canManage) { setResults([]); return }
    const timer = window.setTimeout(async () => {
      setIsSearching(true)
      const { data, error: searchError } = await supabase.functions.invoke('team-directory', {
        body: { action: 'search', workspaceId, projectId: project.id, boardId: scope === 'BOARD' ? boardId : null, query },
      })
      if (searchError || data?.error) { setError(searchError?.message ?? String(data?.error)); setResults([]) }
      else setResults((data?.results ?? []) as DirectoryResult[])
      setIsSearching(false)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [boardId, canManage, email, project.id, scope, workspaceId])

  async function grantRegisteredUser(directoryUser: DirectoryResult) {
    if (!canManage) return
    setError(null); setMessage(null); setAddingUserId(directoryUser.id)
    const targetBoardId = scope === 'BOARD' ? boardId : null
    const { error: grantError } = await supabase.rpc('grant_resource_access', { _user_id: directoryUser.id, _project_id: project.id, _board_id: targetBoardId, _role: role })
    setAddingUserId(null)
    if (grantError) return setError(grantError.message)
    setEmail(''); setResults([]); setMessage(`${directoryUser.email} now has ${role.toLowerCase()} access to ${scope === 'PROJECT' ? project.name : boards.find((board) => board.id === boardId)?.name ?? 'the board'}.`)
    await refreshAccess(); await onInvited()
  }

  async function inviteMember(event: FormEvent) {
    event.preventDefault(); const normalizedEmail = email.trim().toLowerCase(); if (!normalizedEmail || !canManage) return
    setError(null); setMessage(null); setIsLoading(true)
    const { data, error: invokeError } = await supabase.functions.invoke('invite-member', { body: { workspaceId, projectId: project.id, boardId: scope === 'BOARD' ? boardId : null, email: normalizedEmail, role, redirectTo: window.location.origin } })
    setIsLoading(false)
    if (invokeError || data?.error) return setError(invokeError?.message ?? String(data?.error))
    setEmail(''); setResults([]); setMessage(`Invitation sent to ${normalizedEmail} for ${scope === 'PROJECT' ? 'the entire project' : 'one board'}.`); await refreshAccess(); await onInvited()
  }

  async function removeAccess(row: AccessRow) {
    const resourceLabel = row.scope === 'PROJECT' ? project.name : boards.find((board) => board.id === row.resource_id)?.name ?? 'this board'
    if (!window.confirm(`Remove this user's access to ${resourceLabel}?`)) return
    const key = `${row.scope}-${row.resource_id}-${row.user_id}`; setRemovingKey(key); setError(null)
    const { error: removeError } = await supabase.rpc('remove_resource_access', { _user_id: row.user_id, _project_id: project.id, _board_id: row.scope === 'BOARD' ? row.resource_id : null })
    setRemovingKey(null); if (removeError) return setError(removeError.message)
    await refreshAccess(); await onInvited()
  }

  const displayRows = useMemo(() => accessRows.map((row) => ({ ...row, profile: profiles.find((profile) => profile.id === row.user_id), board: row.scope === 'BOARD' ? boards.find((board) => board.id === row.resource_id) : null })), [accessRows, boards, profiles])

  return <section className="team-page">
    <div className="team-page-heading"><div><p className="eyebrow">Scoped access</p><h2>Project members</h2><p className="muted">Invite someone to every board in {project.name}, or restrict them to a single board.</p></div><div className="team-count"><Users size={17} /><strong>{new Set(accessRows.map((row) => row.user_id)).size}</strong><span>people</span></div></div>
    {canManage ? <form className="invite-card team-directory-card" onSubmit={inviteMember}>
      <div className="invite-card-icon"><Search size={19} /></div><div className="invite-copy"><strong>Grant access</strong><span>Choose the resource boundary first, then add a registered user or send an invitation.</span></div>
      <div className="invite-email team-directory-search"><TextInput label="Search registered email" isLabelHidden type="email" value={email} onChange={(value) => { setEmail(value); setError(null); setMessage(null) }} placeholder="Search email…" startIcon={Search} />{email.trim().length >= 2 ? <div className="team-directory-results">{isSearching ? <div className="team-directory-state">Searching FlowLane users…</div> : null}{!isSearching && results.map((result) => <div className="team-directory-result" key={result.id}><span className="avatar-circle">{(result.displayName || result.email).slice(0, 1).toUpperCase()}</span><div className="team-directory-result-copy"><strong>{result.displayName || result.email.split('@')[0]}</strong><span>{result.email}</span></div><Button label="Add" variant="secondary" icon={<UserPlus size={15} />} isLoading={addingUserId === result.id} onClick={() => void grantRegisteredUser(result)} /></div>)}{!isSearching && results.length === 0 ? <div className="team-directory-state">No registered user found. Send an email invitation instead.</div> : null}</div> : null}</div>
      <div className="invite-role-selector team-access-scope"><Selector label="Scope" isLabelHidden options={scopeOptions} value={scope} onChange={(value) => setScope(value as 'PROJECT' | 'BOARD')} width="100%" /></div>
      {scope === 'BOARD' ? <div className="invite-role-selector team-access-board"><Selector label="Board" isLabelHidden options={boardOptions} value={boardId} onChange={setBoardId} width="100%" /></div> : null}
      <div className="invite-role-selector team-access-role"><Selector label="Role" isLabelHidden options={roleOptions} value={role} onChange={(value) => setRole(value as WorkspaceRole)} width="100%" /></div><Button label="Invite by email" variant="primary" type="submit" icon={<MailPlus size={16} />} isLoading={isLoading} />
    </form> : <div className="inline-alert">You do not have permission to manage access for this project.</div>}
    {message ? <div className="inline-alert success-alert">{message}</div> : null}{error ? <div className="inline-alert error-alert">{error}</div> : null}
    <div className="role-explainer"><div><span className="role-chip role-admin"><ShieldCheck size={12} />Admin</span><span>Can manage the selected resource and its work.</span></div><div><span className="role-chip role-member"><UserRoundCheck size={12} />Member</span><span>Can create, edit, assign and move tasks.</span></div><div><span className="role-chip role-viewer"><Eye size={12} />Viewer</span><span>Read-only access.</span></div></div>
    <div className="team-table-shell"><div className="team-table-header"><span>Person</span><span>Role</span><span>Access</span><span /></div>{displayRows.map((row) => { const RoleIcon = roleIcon[row.role]; const label = row.profile?.display_name || row.profile?.email || 'Invited user'; const key = `${row.scope}-${row.resource_id}-${row.user_id}`; return <div className="team-row" key={key}><div className="team-person"><span className="avatar-circle">{label.slice(0, 1).toUpperCase()}</span><div><strong>{row.profile?.display_name || row.profile?.email?.split('@')[0] || 'Invited user'}</strong><span>{row.profile?.email || 'Invitation pending'}</span></div></div><span className={`role-chip role-${row.role.toLowerCase()}`}><RoleIcon size={13} />{row.role.charAt(0) + row.role.slice(1).toLowerCase()}</span><span className="team-access">{row.scope === 'PROJECT' ? <ShieldCheck size={14} /> : <KanbanSquare size={14} />}{row.scope === 'PROJECT' ? 'Entire project' : row.board?.name ?? 'Board'}</span>{canManage ? <IconButton label={`Remove ${label} access`} icon={<Trash2 size={15} />} variant="ghost" size="sm" isDisabled={removingKey === key} onClick={() => void removeAccess(row)} /> : <span />}</div> })}</div>
  </section>
}
