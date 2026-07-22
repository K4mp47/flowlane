import { useState } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { IconButton } from '@astryxdesign/core/IconButton'
import { SideNav, SideNavItem } from '@astryxdesign/core/SideNav'
import { BarChart3, Bell, Check, FolderKanban, KanbanSquare, LogOut, Moon, Palette as PaletteIcon, PocketKnife, Sun, UserRoundCheck, Users } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useTheme, type Palette } from '../theme'

export type AppView = 'board' | 'mine' | 'analytics' | 'projects' | 'team'

interface AppSidebarProps {
  view: AppView
  onViewChange: (view: AppView) => void
  unreadCount: number
  onOpenNotifications: () => void
}

const paletteOptions: Array<{ value: Palette; label: string }> = [
  { value: 'red', label: 'Red' },
  { value: 'green', label: 'Green' },
  { value: 'blue', label: 'Blue' },
  { value: 'orange', label: 'Orange' },
  { value: 'purple', label: 'Purple' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'cyan', label: 'Cyan' },
  { value: 'teal', label: 'Teal' },
  { value: 'lime', label: 'Lime' },
  { value: 'pink', label: 'Pink' },
  { value: 'indigo', label: 'Indigo' },
  { value: 'rose', label: 'Rose' },
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

  function collapseSidebar() {
    setIsHovered(false)
    setIsPaletteOpen(false)
  }

  return (
    <aside
      className={isHovered ? 'sidebar-hover-shell expanded' : 'sidebar-hover-shell'}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={collapseSidebar}
      onFocusCapture={() => setIsHovered(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) collapseSidebar()
      }}
    >
      <SideNav
        className="flowlane-side-nav"
        collapsible={{ isCollapsed: false, onCollapsedChange: () => undefined, hasButton: false }}
        header={(
          <div className="sidebar-astryx-brand">
            <span className="sidebar-astryx-logo" aria-hidden="true"><PocketKnife size={19} strokeWidth={2} /></span>
            <div className="sidebar-astryx-brand-copy"><strong>FlowLane</strong><span>{membership?.workspace.name}</span></div>
          </div>
        )}
        footer={(
          <div className="sidebar-footer-stack">
            <div className="sidebar-utility-row">
              {!isViewer ? (
                <div className="sidebar-notification-action">
                  <IconButton label="Notifications" icon={<Bell size={17} />} variant="ghost" size="sm" onClick={onOpenNotifications} />
                  {unreadCount > 0 ? <Badge label={String(unreadCount)} variant="red" /> : null}
                </div>
              ) : null}
              <IconButton label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'} icon={theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />} variant="ghost" size="sm" onClick={toggleTheme} />
              <div className="sidebar-palette-control">
                <IconButton label="Choose color palette" icon={<PaletteIcon size={17} />} variant="ghost" size="sm" onClick={() => setIsPaletteOpen((current) => !current)} />
                {isPaletteOpen ? (
                  <div className="palette-popover" role="dialog" aria-label="Choose color palette">
                    <div className="palette-popover-heading">
                      <strong>Color palette</strong>
                      <span>Choose the accent used across FlowLane.</span>
                    </div>
                    <div className="palette-grid">
                      {paletteOptions.map((option) => (
                        <button
                          type="button"
                          key={option.value}
                          className={palette === option.value ? 'palette-option active' : 'palette-option'}
                          data-palette-value={option.value}
                          onClick={() => {
                            setPalette(option.value)
                            setIsPaletteOpen(false)
                          }}
                          aria-label={`Use ${option.label} palette`}
                          aria-pressed={palette === option.value}
                          title={option.label}
                        >
                          <span className="palette-swatch" />
                          <span>{option.label}</span>
                          {palette === option.value ? <Check size={13} /> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="sidebar-astryx-user">
              <span className="sidebar-astryx-avatar">{initial}</span>
              <div className="sidebar-astryx-user-copy"><strong>{displayName}</strong><span>{membership?.role}</span></div>
              <IconButton label="Sign out" icon={<LogOut size={16} />} variant="ghost" size="sm" onClick={() => void signOut()} />
            </div>
          </div>
        )}
      >
        <SideNavItem label="Board" icon={<KanbanSquare size={18} />} isSelected={view === 'board'} onClick={() => onViewChange('board')} />
        {!isViewer ? <SideNavItem label="My tasks" icon={<UserRoundCheck size={18} />} isSelected={view === 'mine'} onClick={() => onViewChange('mine')} /> : null}
        <SideNavItem label="Analytics" icon={<BarChart3 size={18} />} isSelected={view === 'analytics'} onClick={() => onViewChange('analytics')} />
        {isAdmin ? (
          <>
            <SideNavItem label="Projects" icon={<FolderKanban size={18} />} isSelected={view === 'projects'} onClick={() => onViewChange('projects')} />
            <SideNavItem label="Team" icon={<Users size={18} />} isSelected={view === 'team'} onClick={() => onViewChange('team')} />
          </>
        ) : null}
      </SideNav>
    </aside>
  )
}
