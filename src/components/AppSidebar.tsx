import { useState } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { IconButton } from '@astryxdesign/core/IconButton'
import { SideNav, SideNavItem } from '@astryxdesign/core/SideNav'
import { Bell, FolderKanban, KanbanSquare, LogOut, Moon, Sun, UserRoundCheck, Users, Workflow } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useTheme } from '../theme'

interface AppSidebarProps {
  view: 'board' | 'mine' | 'projects' | 'team'
  onViewChange: (view: 'board' | 'mine' | 'projects' | 'team') => void
  unreadCount: number
  onOpenNotifications: () => void
}

export function AppSidebar({ view, onViewChange, unreadCount, onOpenNotifications }: AppSidebarProps) {
  const { membership, profile, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [isHovered, setIsHovered] = useState(false)
  const isViewer = membership?.role === 'VIEWER'
  const isAdmin = membership?.role === 'ADMIN'
  const displayName = profile?.display_name || profile?.email?.split('@')[0] || 'User'
  const initial = (profile?.display_name || profile?.email || 'U').slice(0, 1).toUpperCase()

  return (
    <aside
      className={isHovered ? 'sidebar-hover-shell expanded' : 'sidebar-hover-shell'}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => setIsHovered(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsHovered(false)
      }}
    >
      <SideNav
        className="flowlane-side-nav"
        collapsible={{
          isCollapsed: !isHovered,
          onCollapsedChange: (collapsed) => setIsHovered(!collapsed),
          hasButton: false,
        }}
        header={(
          <div className="sidebar-astryx-brand">
            <span className="sidebar-astryx-logo"><Workflow size={18} /></span>
            <div className="sidebar-astryx-brand-copy">
              <strong>FlowLane</strong>
              <span>{membership?.workspace.name}</span>
            </div>
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
              <IconButton
                label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
                icon={theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
                variant="ghost"
                size="sm"
                onClick={toggleTheme}
              />
            </div>
            <div className="sidebar-astryx-user">
              <span className="sidebar-astryx-avatar">{initial}</span>
              <div className="sidebar-astryx-user-copy">
                <strong>{displayName}</strong>
                <span>{membership?.role}</span>
              </div>
              <IconButton label="Sign out" icon={<LogOut size={16} />} variant="ghost" size="sm" onClick={() => void signOut()} />
            </div>
          </div>
        )}
      >
        <SideNavItem label="Board" icon={<KanbanSquare size={18} />} isSelected={view === 'board'} onClick={() => onViewChange('board')} />
        {!isViewer ? (
          <SideNavItem label="My tasks" icon={<UserRoundCheck size={18} />} isSelected={view === 'mine'} onClick={() => onViewChange('mine')} />
        ) : null}
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