import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/IconButton'
import { SideNav, SideNavItem } from '@/components/ui/SideNav'
import { BarChart3, CalendarDays, Check, FolderKanban, KanbanSquare, ListChecks, LogOut, Menu, MessageSquare, Moon, Palette as PaletteIcon, PocketKnife, Sun, Trash2, UserRoundCheck, Users, X } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useTheme, type Palette } from '../theme'

export type AppView = 'mine' | 'calendar' | 'projects' | 'all' | 'board' | 'analytics' | 'team'

interface AppSidebarProps { view: AppView; onViewChange: (view: AppView) => void; unreadCount: number; onOpenNotifications: () => void }

const paletteOptions: Array<{ value: Palette; label: string }> = [
  { value: 'red', label: 'Red' }, { value: 'green', label: 'Green' }, { value: 'blue', label: 'Blue' },
  { value: 'orange', label: 'Orange' }, { value: 'purple', label: 'Purple' }, { value: 'yellow', label: 'Yellow' },
  { value: 'cyan', label: 'Cyan' }, { value: 'teal', label: 'Teal' }, { value: 'lime', label: 'Lime' },
  { value: 'pink', label: 'Pink' }, { value: 'indigo', label: 'Indigo' }, { value: 'rose', label: 'Rose' },
]

type PalettePositionStyle = CSSProperties & { '--palette-left': string; '--palette-bottom': string }

export function AppSidebar({ view, onViewChange, unreadCount, onOpenNotifications }: AppSidebarProps) {
  const { membership, profile, signOut, deleteAccount } = useAuth()
  const { theme, palette, toggleTheme, setPalette } = useTheme()
  const [isHovered, setIsHovered] = useState(false)
  const [isPaletteOpen, setIsPaletteOpen] = useState(false)
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [palettePosition, setPalettePosition] = useState({ left: 64, bottom: 72 })
  const paletteAnchorRef = useRef<HTMLDivElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const isViewer = membership?.role === 'VIEWER'
  const isAdmin = membership?.role === 'ADMIN'
  const displayName = profile?.display_name || profile?.email?.split('@')[0] || 'User'
  const initial = (profile?.display_name || profile?.email || 'U').slice(0, 1).toUpperCase()

  useLayoutEffect(() => {
    if (!isPaletteOpen || !paletteAnchorRef.current) return
    const rect = paletteAnchorRef.current.getBoundingClientRect()
    const popoverWidth = 276
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - popoverWidth - 12)
    setPalettePosition({ left, bottom: Math.max(12, window.innerHeight - rect.top + 8) })
  }, [isPaletteOpen, isHovered])

  useEffect(() => {
    if (isViewer || !profile?.id || !membership?.workspace_id) return

    function ensureAudioContext() {
      const context = audioContextRef.current ?? new AudioContext()
      audioContextRef.current = context
      if (context.state === 'suspended') void context.resume()
      return context
    }

    function unlockAudio() { ensureAudioContext() }
    window.addEventListener('pointerdown', unlockAudio, { once: true })
    window.addEventListener('keydown', unlockAudio, { once: true })

    function playNotificationChime() {
      const context = ensureAudioContext()
      if (context.state !== 'running') return

      const now = context.currentTime
      const gain = context.createGain()
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42)
      gain.connect(context.destination)

      const firstTone = context.createOscillator()
      firstTone.type = 'sine'
      firstTone.frequency.setValueAtTime(660, now)
      firstTone.connect(gain)
      firstTone.start(now)
      firstTone.stop(now + 0.2)

      const secondTone = context.createOscillator()
      secondTone.type = 'sine'
      secondTone.frequency.setValueAtTime(880, now + 0.12)
      secondTone.connect(gain)
      secondTone.start(now + 0.12)
      secondTone.stop(now + 0.42)
    }

    const channel = supabase
      .channel(`notification-sound-${profile.id}-${membership.workspace_id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` }, (payload) => {
        const notification = payload.new as { workspace_id?: string }
        if (notification.workspace_id === membership.workspace_id) playNotificationChime()
      })
      .subscribe()

    return () => {
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
      void supabase.removeChannel(channel)
      if (audioContextRef.current) {
        void audioContextRef.current.close()
        audioContextRef.current = null
      }
    }
  }, [isViewer, membership?.workspace_id, profile?.id])

  function collapseSidebar() { setIsHovered(false); setIsPaletteOpen(false) }
  function choosePalette(value: Palette) { setPalette(value); setIsPaletteOpen(false) }
  function chooseView(value: AppView) { onViewChange(value); setIsMobileMoreOpen(false) }

  async function handleDeleteAccount() {
    const confirmation = window.prompt('Delete your FlowLane account permanently? User-owned tasks, comments, assignments, notifications, memberships, profile data and correlated stored attachments will be removed. Type DELETE to confirm.')
    if (confirmation !== 'DELETE') return
    setIsDeletingAccount(true)
    try { await deleteAccount() }
    catch (error) {
      console.error('Unable to delete account', error)
      window.alert(error instanceof Error ? error.message : 'Unable to delete your account. Please try again.')
      setIsDeletingAccount(false)
    }
  }

  const section = (label: string) => <div className="sidebar-section-label">{label}</div>
  const paletteStyle: PalettePositionStyle = { '--palette-left': `${palettePosition.left}px`, '--palette-bottom': `${palettePosition.bottom}px` }
  const paletteDialog = isPaletteOpen ? createPortal(
    <div className="palette-popover palette-popover-portal" role="dialog" aria-label="Choose color palette" style={paletteStyle} onMouseDown={(event) => event.stopPropagation()}>
      <div className="palette-popover-heading"><strong>Accent color</strong><span>Changes highlights and primary actions only.</span></div>
      <div className="palette-grid">{paletteOptions.map((option) => <button type="button" key={option.value} className={palette === option.value ? 'palette-option active' : 'palette-option'} data-palette-value={option.value} onClick={() => choosePalette(option.value)} aria-label={`Use ${option.label} accent`} aria-pressed={palette === option.value} title={option.label}><span className="palette-swatch" /><span>{option.label}</span>{palette === option.value ? <Check size={13} /> : null}</button>)}</div>
    </div>, document.body,
  ) : null

  const mobileMoreSheet = isMobileMoreOpen ? createPortal(
    <div className="mobile-more-backdrop" onMouseDown={() => setIsMobileMoreOpen(false)}>
      <section className="mobile-more-sheet" onMouseDown={(event) => event.stopPropagation()} aria-label="More navigation and settings">
        <div className="mobile-more-handle" />
        <header className="mobile-more-header"><div><strong>FlowLane</strong><span>{membership?.workspace.name}</span></div><IconButton label="Close" icon={<X size={18} />} onClick={() => setIsMobileMoreOpen(false)} /></header>
        <div className="mobile-more-nav">
          <button type="button" className={view === 'all' ? 'active' : ''} onClick={() => chooseView('all')}><ListChecks size={18} /><span>All tasks</span></button>
          <button type="button" className={view === 'analytics' ? 'active' : ''} onClick={() => chooseView('analytics')}><BarChart3 size={18} /><span>Analytics</span></button>
          {isAdmin ? <button type="button" className={view === 'team' ? 'active' : ''} onClick={() => chooseView('team')}><Users size={18} /><span>Team</span></button> : null}
          {!isViewer ? <button type="button" onClick={() => { setIsMobileMoreOpen(false); onOpenNotifications() }}><MessageSquare size={18} /><span>Notifications</span>{unreadCount > 0 ? <Badge label={String(unreadCount)} variant="red" /> : null}</button> : null}
        </div>
        <div className="mobile-more-section"><span className="mobile-more-label">Appearance</span><button type="button" className="mobile-setting-row" onClick={toggleTheme}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}<span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span></button><div className="mobile-accent-grid">{paletteOptions.map((option) => <button key={option.value} type="button" className={palette === option.value ? 'active' : ''} data-palette-value={option.value} aria-label={`${option.label} accent`} onClick={() => setPalette(option.value)}><span className="palette-swatch" />{palette === option.value ? <Check size={12} /> : null}</button>)}</div></div>
        <div className="mobile-more-section mobile-account-section"><div className="mobile-profile-row"><span className="sidebar-avatar">{initial}</span><div><strong>{displayName}</strong><span>{membership?.role}</span></div></div><button type="button" className="mobile-setting-row" onClick={() => void signOut()}><LogOut size={18} /><span>Sign out</span></button><button type="button" className="mobile-setting-row danger" disabled={isDeletingAccount} onClick={() => void handleDeleteAccount()}><Trash2 size={18} /><span>Delete account</span></button></div>
      </section>
    </div>, document.body,
  ) : null

  return <>
    <aside className={isHovered ? 'sidebar-hover-shell expanded' : 'sidebar-hover-shell'} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => { if (!isPaletteOpen) collapseSidebar() }} onFocusCapture={() => setIsHovered(true)} onBlurCapture={(event) => { if (!isPaletteOpen && !event.currentTarget.contains(event.relatedTarget as Node | null)) collapseSidebar() }}>
      <SideNav className="flowlane-side-nav" collapsible={{ isCollapsed: false, onCollapsedChange: () => undefined, hasButton: false }}
        header={<div className="sidebar-brand"><span className="sidebar-logo" aria-hidden="true"><PocketKnife size={18} strokeWidth={2.1} /></span><div className="sidebar-brand-copy"><strong>FlowLane</strong><span>{membership?.workspace.name}</span></div></div>}
        footer={<div className="sidebar-footer-stack"><div className="sidebar-utility-row">{!isViewer ? <div className="sidebar-notification-action"><IconButton label="Notifications" icon={<MessageSquare size={17} />} variant="ghost" size="sm" onClick={onOpenNotifications} />{unreadCount > 0 ? <Badge label={String(unreadCount)} variant="red" /> : null}</div> : null}<IconButton label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'} icon={theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />} variant="ghost" size="sm" onClick={toggleTheme} /><div className="sidebar-palette-control" ref={paletteAnchorRef}><IconButton label="Choose color palette" icon={<PaletteIcon size={17} />} variant="ghost" size="sm" className={isPaletteOpen ? 'is-active' : undefined} onClick={() => { setIsHovered(true); setIsPaletteOpen((current) => !current) }} /></div></div><div className="sidebar-user"><span className="sidebar-avatar">{initial}</span><div className="sidebar-user-copy"><strong>{displayName}</strong><span>{membership?.role}</span></div>{isHovered ? <div className="sidebar-account-actions"><IconButton label="Sign out" icon={<LogOut size={16} />} variant="ghost" size="sm" onClick={() => void signOut()} /><IconButton label="Delete account" icon={<Trash2 size={16} />} variant="ghost" size="sm" className="sidebar-delete-account" isDisabled={isDeletingAccount} onClick={() => void handleDeleteAccount()} /></div> : null}</div></div>}>
        {section('My work')}
        {!isViewer ? <SideNavItem label="My tasks" icon={<UserRoundCheck size={18} />} isSelected={view === 'mine'} onClick={() => onViewChange('mine')} /> : null}
        <SideNavItem label="Calendar" icon={<CalendarDays size={18} />} isSelected={view === 'calendar'} onClick={() => onViewChange('calendar')} />
        {section('Workspace')}
        <SideNavItem label="Board" icon={<KanbanSquare size={18} />} isSelected={view === 'board'} onClick={() => onViewChange('board')} />
        <SideNavItem label="Projects" icon={<FolderKanban size={18} />} isSelected={view === 'projects'} onClick={() => onViewChange('projects')} />
        <SideNavItem label="All tasks" icon={<ListChecks size={18} />} isSelected={view === 'all'} onClick={() => onViewChange('all')} />
        {section('Insights')}
        <SideNavItem label="Analytics" icon={<BarChart3 size={18} />} isSelected={view === 'analytics'} onClick={() => onViewChange('analytics')} />
        {isAdmin ? <>{section('Manage')}<SideNavItem label="Team" icon={<Users size={18} />} isSelected={view === 'team'} onClick={() => onViewChange('team')} /></> : null}
      </SideNav>
    </aside>

    <nav className="mobile-app-nav" aria-label="Primary navigation">
      {!isViewer ? <button type="button" className={view === 'mine' ? 'active' : ''} onClick={() => chooseView('mine')}><UserRoundCheck size={20} /><span>My tasks</span></button> : null}
      <button type="button" className={view === 'calendar' ? 'active' : ''} onClick={() => chooseView('calendar')}><CalendarDays size={20} /><span>Calendar</span></button>
      <button type="button" className={view === 'board' ? 'active' : ''} onClick={() => chooseView('board')}><KanbanSquare size={20} /><span>Board</span></button>
      <button type="button" className={view === 'projects' ? 'active' : ''} onClick={() => chooseView('projects')}><FolderKanban size={20} /><span>Projects</span></button>
      <button type="button" className={isMobileMoreOpen || ['all','analytics','team'].includes(view) ? 'active' : ''} onClick={() => setIsMobileMoreOpen(true)}><Menu size={20} /><span>More</span>{unreadCount > 0 ? <i className="mobile-nav-dot" /> : null}</button>
    </nav>

    {paletteDialog}
    {mobileMoreSheet}
  </>
}
