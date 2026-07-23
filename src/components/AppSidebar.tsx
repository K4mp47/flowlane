import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/IconButton'
import { SideNav, SideNavItem } from '@/components/ui/SideNav'
import { BarChart3, CalendarDays, Check, FolderKanban, KanbanSquare, ListChecks, LogOut, MessageSquare, Moon, Palette as PaletteIcon, PocketKnife, Sun, Trash2, UserRoundCheck, Users } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
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
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [palettePosition, setPalettePosition] = useState({ left: 64, bottom: 72 })
  const paletteAnchorRef = useRef<HTMLDivElement | null>(null)
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

  function collapseSidebar() { setIsHovered(false); setIsPaletteOpen(false) }
  function choosePalette(value: Palette) { setPalette(value); setIsPaletteOpen(false) }

  async function handleDeleteAccount() {
    const confirmation = window.prompt(
      'Delete your FlowLane account permanently? Tasks you created, comments, checklist items, assignments, notifications, memberships, profile data and stored attachments will be removed. Type DELETE to confirm.',
    )
    if (confirmation !== 'DELETE') return

    setIsDeletingAccount(true)
    try {
      await deleteAccount()
    } catch (error) {
      console.error('Unable to delete account', error)
      window.alert(error instanceof Error ? error.message : 'Unable to delete your account. Please try again.')
      setIsDeletingAccount(false)
    }
  }

  const section = (label: string) => <div className="sidebar-section-label">{label}</div>

  const paletteStyle: PalettePositionStyle = {
    '--palette-left': `${palettePosition.left}px`,
    '--palette-bottom': `${palettePosition.bottom}px`,
  }

  const paletteDialog = isPaletteOpen ? createPortal(
    <div className="palette-popover palette-popover-portal" role="dialog" aria-label="Choose color palette" style={paletteStyle} onMouseDown={(event) => event.stopPropagation()}>
      <div className="palette-popover-heading"><strong>Accent color</strong><span>Changes highlights and primary actions only.</span></div>
      <div className="palette-grid">
        {paletteOptions.map((option) => <button type="button" key={option.value} className={palette === option.value ? 'palette-option active' : 'palette-option'} data-palette-value={option.value} onClick={() => choosePalette(option.value)} aria-label={`Use ${option.label} accent`} aria-pressed={palette === option.value} title={option.label}><span className="palette-swatch" /><span>{option.label}</span>{palette === option.value ? <Check size={13} /> : null}</button>)}
      </div>
    </div>,
    document.body,
  ) : null

  return <>
    <aside className={isHovered ? 'sidebar-hover-shell expanded' : 'sidebar-hover-shell'} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => { if (!isPaletteOpen) collapseSidebar() }} onFocusCapture={() => setIsHovered(true)} onBlurCapture={(event) => { if (!isPaletteOpen && !event.currentTarget.contains(event.relatedTarget as Node | null)) collapseSidebar() }}>
      <SideNav className="flowlane-side-nav" collapsible={{ isCollapsed: false, onCollapsedChange: () => undefined, hasButton: false }}
        header={<div className="sidebar-brand"><span className="sidebar-logo" aria-hidden="true"><PocketKnife size={18} strokeWidth={2.1} /></span><div className="sidebar-brand-copy"><strong>FlowLane</strong><span>{membership?.workspace.name}</span></div></div>}
        footer={<div className="sidebar-footer-stack">
          <div className="sidebar-utility-row">
            {!isViewer ? <div className="sidebar-notification-action"><IconButton label="Notifications" icon={<MessageSquare size={17} />} variant="ghost" size="sm" onClick={onOpenNotifications} />{unreadCount > 0 ? <Badge label={String(unreadCount)} variant="red" /> : null}</div> : null}
            <IconButton label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'} icon={theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />} variant="ghost" size="sm" onClick={toggleTheme} />
            <div className="sidebar-palette-control" ref={paletteAnchorRef}><IconButton label="Choose color palette" icon={<PaletteIcon size={17} />} variant="ghost" size="sm" className={isPaletteOpen ? 'is-active' : undefined} onClick={() => { setIsHovered(true); setIsPaletteOpen((current) => !current) }} /></div>
          </div>
          <div className="sidebar-user"><span className="sidebar-avatar">{initial}</span><div className="sidebar-user-copy"><strong>{displayName}</strong><span>{membership?.role}</span></div>{isHovered ? <div className="sidebar-account-actions"><IconButton label="Sign out" icon={<LogOut size={16} />} variant="ghost" size="sm" onClick={() => void signOut()} /><IconButton label="Delete account" icon={<Trash2 size={16} />} variant="ghost" size="sm" className="sidebar-delete-account" isDisabled={isDeletingAccount} onClick={() => void handleDeleteAccount()} /></div> : null}</div>
        </div>}>
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
    {paletteDialog}
  </>
}
