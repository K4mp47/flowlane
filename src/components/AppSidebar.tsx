import { Badge } from '@astryxdesign/core/Badge'
import { Bell, KanbanSquare, LogOut, UserRoundCheck, Workflow } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

interface AppSidebarProps {
  view: 'board' | 'mine'
  onViewChange: (view: 'board' | 'mine') => void
  unreadCount: number
}

export function AppSidebar({ view, onViewChange, unreadCount }: AppSidebarProps) {
  const { membership, profile, signOut } = useAuth()
  const isViewer = membership?.role === 'VIEWER'

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
      </nav>

      <div className="sidebar-footer">
        {!isViewer ? (
          <div className="sidebar-stat">
            <Bell size={16} />
            <span>Notifications</span>
            {unreadCount > 0 ? <Badge label={String(unreadCount)} variant="neutral" /> : null}
          </div>
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
