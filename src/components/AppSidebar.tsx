import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/IconButton'
import { SideNav, SideNavItem } from '@/components/ui/SideNav'
import { BarChart3, Bell, CalendarDays, Check, FolderKanban, KanbanSquare, ListChecks, LogOut, Moon, Palette as PaletteIcon, PocketKnife, Sun, UserRoundCheck, Users } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useTheme, type Palette } from '../theme'

export type AppView = 'mine' | 'calendar' | 'projects' | 'all' | 'board' | 'analytics' | 'team'

interface AppSidebarProps {
  view: AppView
  onViewChange: (view: AppView) => void
  unreadCount: number
  onOpenNotifications: () => void
}

const paletteOptions: Array<{ value: Palette; label: string }> = [
  { value: 'red', label: 'Red' }, { value: 'green', label: 'Green' }, { value: 'blue', label: 'Blue' },
  { value: 'orange', label: 'Orange' }, { value: 'purple', label: 'Purple' }, { value: 'yellow', label: 'Yellow' },
  { value: 'cyan', label: 'Cyan' }, { value: 'teal', label: 'Teal' }, { value: 'lime', label: 'Lime' },
  { value: 'pink', label: 'Pink' }, { value: 'indigo', label: 'Indigo' }, { value: 'rose', label: 'Rose' },
]

export function AppSidebar({ view, onViewChange, unreadCount, onOpenNotifications }: AppSidebarProps) {
  const { membership, profile, signOut } = useAuth()
  const { theme, palette, toggleTheme, setPalette } = useTheme()
  const [isHovered, setIsHovered] = useState(false)
  const [isPaletteOpen, setIsPaletteOpen] = useState(false)
  const isViewer = membership?.role === 'VIEWER'
  const isAdmin = membership?.role === 'ADMIN'
  const displayName = profile?.display_name || profile?.email?.split('@')[0] || 'User'
  const initial = (profile?.display_name || profile?.email || 'U').slice(0, 1).toUpperCase()
  const navLabel = (label: string) => isHovered ? label : ''

  function collapseSidebar() { setIsHovered(false); setIsPaletteOpen(false) }
  const section = (label: string) => isHovered ? <div className="sidebar-section-label">{label}</div> : <div className="sidebar-section-spacer" aria-hidden="true" />

  return (
    <aside className={isHovered ? 'sidebar-hover-shell expanded' : 'sidebar-hover-shell'} onMouseEnter={() => setIsHovered(true)} onMouseLeave={collapseSidebar} onFocusCapture={() => setIsHovered(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) collapseSidebar() }}>
      <SideNav className="flowlane-side-nav" collapsible={{ isCollapsed: false, onCollapsedChange: () => undefined, hasButton: false }}
        header={<div className="sidebar-brand"><span className="sidebar-logo" aria-hidden="true"><PocketKnife size={19} strokeWidth={2} /></span>{isHovered ? <div className="sidebar-brand-copy"><strong>FlowLane</strong><span>{membership?.workspace.name}</span></div> : null}</div>}
        footer={<div className="sidebar-footer-stack"><div className="sidebar-utility-row">{!isViewer ? <div className="sidebar-notification-action"><IconButton label="Notifications" icon={<Bell size={17} />} variant="ghost" size="sm" onClick={onOpenNotifications} />{unreadCount > 0 ? <Badge label={String(unreadCount)} variant="red" /> : null}</div> : null}<IconButton label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'} icon={theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />} variant="ghost" size="sm" onClick={toggleTheme} /><div className="sidebar-palette-control"><IconButton label="Choose color palette" icon={<PaletteIcon size={17} />} variant="ghost" size="sm" onClick={() => setIsPaletteOpen((current) => !current)} />{isPaletteOpen ? <div className="palette-popover" role="dialog" aria-label="Choose color palette"><div className="palette-popover-heading"><strong>Accent color</strong><span>Changes highlights and primary actions only.</span></div><div className="palette-grid">{paletteOptions.map((option) => <button type="button" key={option.value} className={palette === option.value ? 'palette-option active' : 'palette-option'} data-palette-value={option.value} onClick={() => { setPalette(option.value); setIsPaletteOpen(false) }} aria-label={`Use ${option.label} accent`} aria-pressed={palette === option.value} title={option.label}><span className="palette-swatch" /><span>{option.label}</span>{palette === option.value ? <Check size={13} /> : null}</button>)}</div></div> : null}</div></div><div className="sidebar-user"><span className="sidebar-avatar">{initial}</span>{isHovered ? <div className="sidebar-user-copy"><strong>{displayName}</strong><span>{membership?.role}</span></div> : null}{isHovered ? <IconButton label="Sign out" icon={<LogOut size={16} />} variant="ghost" size="sm" onClick={() => void signOut()} /> : null}</div></div>}>
        {section('My work')}
        {!isViewer ? <SideNavItem label={navLabel('My tasks')} icon={<UserRoundCheck size={18} />} isSelected={view === 'mine'} onClick={() => onViewChange('mine')} /> : null}
        <SideNavItem label={navLabel('Calendar')} icon={<CalendarDays size={18} />} isSelected={view === 'calendar'} onClick={() => onViewChange('calendar')} />
        {section('Workspace')}
        <SideNavItem label={navLabel('Board')} icon={<KanbanSquare size={18} />} isSelected={view === 'board'} onClick={() => onViewChange('board')} />
        <SideNavItem label={navLabel('Projects')} icon={<FolderKanban size={18} />} isSelected={view === 'projects'} onClick={() => onViewChange('projects')} />
        <SideNavItem label={navLabel('All tasks')} icon={<ListChecks size={18} />} isSelected={view === 'all'} onClick={() => onViewChange('all')} />
        {section('Insights')}
        <SideNavItem label={navLabel('Analytics')} icon={<BarChart3 size={18} />} isSelected={view === 'analytics'} onClick={() => onViewChange('analytics')} />
        {isAdmin ? <>{section('Manage')}<SideNavItem label={navLabel('Team')} icon={<Users size={18} />} isSelected={view === 'team'} onClick={() => onViewChange('team')} /></> : null}
      </SideNav>
    </aside>
  )
}
