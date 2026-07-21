import { Badge } from '@astryxdesign/core/Badge'
import { Bell, KanbanSquare, LogOut, UserRoundCheck, Users, Workflow } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

interface AppSidebarProps {
  view: 'board' | 'mine' | 'team'
  onViewChange: (view: 'board' | 'mine' | 'team') => void
  unreadCount: number
  onOpenNotifications: () => void
}

export function AppSidebar({ view, onViewChange, unreadCount, onOpenNotifications }: AppSidebarProps) {
  const { membership, profile, signOut } = useAuth()
  const isViewer = membership?.role === 'VIEWER'
  const isAdmin = membership?.role === 'ADMIN'

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-logo"><Workflow size={19} /></span>
        <div>
          <strong>FlowLane</strong>
          <span>{membership?.workspace.name}</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Primary navigation">
        <button className={view === 'board' ? 'nav-item active' : 'nav-item'} onClick={() => onViewChange('board')}>
          <KanbanSquare size={18} />
          <span>Board</span>
        </button>
        {!isViewer ? (
          <button className={view === 'mine' ? 'nav-item active' : 'nav-item'} onClick={() => onViewChange('mine')}>
            <UserRoundCheck size={18} />
            <span>My tasks</span>
          </button>
        ) : null}
        {isAdmin ? (
          <button className={view === 'team' ? 'nav-item active' : 'nav-item'} onClick={() => onViewChange('team')}>
            <Users size={18} />
            <span>Team</span>
          </button>
        ) : null}
      </nav>

      <div className="sidebar-footer">
        {!isViewer ? (
          <button className="sidebar-stat sidebar-stat-button" onClick={onOpenNotifications}>
            <Bell size={16} />
            <span>Notifications</span>
            {unreadCount > 0 ? <Badge label={String(unreadCount)} variant="neutral" /> : null}
          </button>
        ) : null}
        <div className="sidebar-user">
          <div className="avatar-circle">{(profile?.display_name || profile?.email || 'U').slice(0, 1).toUpperCase()}</div>
          <div className="sidebar-user-copy">
            <strong>{profile?.display_name || profile?.email?.split('@')[0] || 'User'}</strong>
            <span>{membership?.role}</span>
          </div>
          <button className="icon-plain" title="Sign out" onClick={() => void signOut()}><LogOut size={17} /></button>
        </div>
      </div>
    </aside>
  )
}
