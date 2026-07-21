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
  role: WorkspaceRole | null
  isLoading: boolean
  isPasswordRecovery: boolean
  refreshMembership: () => Promise<void>
  signOut: () => Promise<void>
  completePasswordRecovery: (password: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchWorkspaceMembership(userId: string): Promise<WorkspaceMembership | null> {
  const { data: membershipRows, error: membershipError } = await supabase
    .from('workspace_members')
    .select('workspace_id,user_id,role')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true })
    .limit(1)

  if (membershipError) throw membershipError
  const membership = membershipRows?.[0]
  if (!membership) return null

  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .select('id,name,created_by')
    .eq('id', membership.workspace_id)
    .single()

  if (workspaceError) throw workspaceError

  return {
    workspace_id: membership.workspace_id,
    user_id: membership.user_id,
    role: membership.role as WorkspaceRole,
    workspace: workspace as Workspace,
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [membership, setMembership] = useState<WorkspaceMembership | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)

  const hydrateUser = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession)
    if (!nextSession?.user) {
      setProfile(null)
      setMembership(null)
      return
    }

    const userId = nextSession.user.id
    const [{ data: profileData, error: profileError }, membershipData] = await Promise.all([
      supabase.from('profiles').select('id,email,display_name,avatar_url').eq('id', userId).maybeSingle(),
      fetchWorkspaceMembership(userId),
    ])

    if (profileError) throw profileError
    setProfile((profileData as Profile | null) ?? null)
    setMembership(membershipData)
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
    const nextMembership = await fetchWorkspaceMembership(session.user.id)
    setMembership(nextMembership)
  }, [session?.user])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const completePasswordRecovery = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
    setIsPasswordRecovery(false)
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    profile,
    membership,
    role: membership?.role ?? null,
    isLoading,
    isPasswordRecovery,
    refreshMembership,
    signOut,
    completePasswordRecovery,
  }), [session, profile, membership, isLoading, isPasswordRecovery, refreshMembership, signOut, completePasswordRecovery])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
