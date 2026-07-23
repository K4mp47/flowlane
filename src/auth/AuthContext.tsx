import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile, Workspace, WorkspaceMembership, WorkspaceRole } from '../types/domain'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  membership: WorkspaceMembership | null
  memberships: WorkspaceMembership[]
  role: WorkspaceRole | null
  isLoading: boolean
  isPasswordRecovery: boolean
  isInviteOnboarding: boolean
  refreshMembership: () => Promise<void>
  selectWorkspace: (workspaceId: string) => void
  signOut: () => Promise<void>
  deleteAccount: () => Promise<void>
  completePasswordRecovery: (password: string) => Promise<void>
  completeInviteOnboarding: (password: string, displayName: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchWorkspaceMemberships(userId: string): Promise<WorkspaceMembership[]> {
  const { data: membershipRows, error: membershipError } = await supabase
    .from('workspace_members')
    .select('workspace_id,user_id,role,joined_at')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true })

  if (membershipError) throw membershipError
  if (!membershipRows?.length) return []

  const workspaceIds = membershipRows.map((row) => row.workspace_id)
  const { data: workspaceRows, error: workspaceError } = await supabase
    .from('workspaces')
    .select('id,name,created_by')
    .in('id', workspaceIds)

  if (workspaceError) throw workspaceError
  const workspaces = new Map((workspaceRows ?? []).map((workspace) => [workspace.id, workspace as Workspace]))

  return membershipRows.flatMap((row) => {
    const workspace = workspaces.get(row.workspace_id)
    if (!workspace) return []
    return [{
      workspace_id: row.workspace_id,
      user_id: row.user_id,
      role: row.role as WorkspaceRole,
      workspace,
    }]
  })
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [memberships, setMemberships] = useState<WorkspaceMembership[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(() => window.localStorage.getItem('flowlane-active-workspace'))
  const [isLoading, setIsLoading] = useState(true)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)

  const membership = useMemo(() => {
    if (!memberships.length) return null
    return memberships.find((item) => item.workspace_id === activeWorkspaceId) ?? memberships[0]
  }, [activeWorkspaceId, memberships])

  useEffect(() => {
    if (!membership) return
    if (activeWorkspaceId !== membership.workspace_id) setActiveWorkspaceId(membership.workspace_id)
    window.localStorage.setItem('flowlane-active-workspace', membership.workspace_id)
  }, [activeWorkspaceId, membership])

  const hydrateUser = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession)
    if (!nextSession?.user) {
      setProfile(null)
      setMemberships([])
      return
    }

    const userId = nextSession.user.id
    const [{ data: profileData, error: profileError }, membershipData] = await Promise.all([
      supabase.from('profiles').select('id,email,display_name,avatar_url').eq('id', userId).maybeSingle(),
      fetchWorkspaceMemberships(userId),
    ])

    if (profileError) throw profileError
    setProfile((profileData as Profile | null) ?? null)
    setMemberships(membershipData)
  }, [])

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!active) return
      try {
        if (error) throw error
        await hydrateUser(data.session)
      } catch (err) {
        console.error('Unable to hydrate session', err)
      } finally {
        if (active) setIsLoading(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true)
      void hydrateUser(nextSession).catch((err) => console.error('Unable to refresh auth state', err))
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [hydrateUser])

  const refreshMembership = useCallback(async () => {
    if (!session?.user) return
    setMemberships(await fetchWorkspaceMemberships(session.user.id))
  }, [session?.user])

  const selectWorkspace = useCallback((workspaceId: string) => {
    if (!memberships.some((item) => item.workspace_id === workspaceId)) return
    setActiveWorkspaceId(workspaceId)
    window.localStorage.setItem('flowlane-active-workspace', workspaceId)
  }, [memberships])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const deleteAccount = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('delete-account', { body: { confirmed: true } })
    if (error) throw error
    if (data?.error) throw new Error(String(data.error))

    window.localStorage.removeItem('flowlane-active-workspace')
    window.localStorage.removeItem('flowlane-theme')
    window.localStorage.removeItem('flowlane-palette')

    await supabase.auth.signOut({ scope: 'local' })
    setSession(null)
    setProfile(null)
    setMemberships([])
    setActiveWorkspaceId(null)
  }, [])

  const completePasswordRecovery = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
    setIsPasswordRecovery(false)
  }, [])

  const completeInviteOnboarding = useCallback(async (password: string, displayName: string) => {
    if (!session?.user) throw new Error('Invitation session is no longer available. Open the invitation email again.')

    const { error: authError } = await supabase.auth.updateUser({
      password,
      data: { ...session.user.user_metadata, onboarding_required: false },
    })
    if (authError) throw authError

    const cleanName = displayName.trim()
    if (cleanName) {
      const { error: profileError } = await supabase.from('profiles').update({ display_name: cleanName }).eq('id', session.user.id)
      if (profileError) throw profileError
    }

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.delete('flowlane_invite')
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    }

    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
    if (refreshError) throw refreshError
    await hydrateUser(refreshed.session)
  }, [hydrateUser, session])

  const isInviteOnboarding = Boolean(
    session?.user?.user_metadata?.onboarding_required === true ||
    (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('flowlane_invite') === '1'),
  )

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    profile,
    membership,
    memberships,
    role: membership?.role ?? null,
    isLoading,
    isPasswordRecovery,
    isInviteOnboarding,
    refreshMembership,
    selectWorkspace,
    signOut,
    deleteAccount,
    completePasswordRecovery,
    completeInviteOnboarding,
  }), [session, profile, membership, memberships, isLoading, isPasswordRecovery, isInviteOnboarding, refreshMembership, selectWorkspace, signOut, deleteAccount, completePasswordRecovery, completeInviteOnboarding])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
