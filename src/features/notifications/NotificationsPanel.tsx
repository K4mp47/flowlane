import { useEffect, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Bell, CheckCheck, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Notification } from '../../types/domain'

interface NotificationsPanelProps {
  userId: string
  workspaceId: string
  onClose: () => void
  onOpenTask: (taskId: string) => void
  onUnreadCountChange: (count: number) => void
}

export function NotificationsPanel({ userId, workspaceId, onClose, onOpenTask, onUnreadCountChange }: NotificationsPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [error, setError] = useState<string | null>(null)

  async function loadNotifications() {
    const { data, error: queryError } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (queryError) {
      setError(queryError.message)
      return
    }

    const rows = (data ?? []) as Notification[]
    setNotifications(rows)
    onUnreadCountChange(rows.filter((notification) => !notification.read_at).length)
  }

  useEffect(() => {
    void loadNotifications()
    const channel = supabase
      .channel(`notifications-panel-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => {
        void loadNotifications()
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [userId, workspaceId])

  async function markRead(notification: Notification) {
    if (notification.read_at) {
      if (notification.task_id) onOpenTask(notification.task_id)
      return
    }

    const readAt = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('notifications')
      .update({ read_at: readAt })
      .eq('id', notification.id)

    if (updateError) return setError(updateError.message)
    const next = notifications.map((item) => item.id === notification.id ? { ...item, read_at: readAt } : item)
    setNotifications(next)
    onUnreadCountChange(next.filter((item) => !item.read_at).length)
    if (notification.task_id) onOpenTask(notification.task_id)
  }

  async function markAllRead() {
    const unreadIds = notifications.filter((notification) => !notification.read_at).map((notification) => notification.id)
    if (!unreadIds.length) return
    const readAt = new Date().toISOString()
    const { error: updateError } = await supabase.from('notifications').update({ read_at: readAt }).in('id', unreadIds)
    if (updateError) return setError(updateError.message)
    setNotifications((current) => current.map((notification) => ({ ...notification, read_at: notification.read_at ?? readAt })))
    onUnreadCountChange(0)
  }

  return (
    <div className="task-peek-backdrop" onMouseDown={onClose}>
      <aside className="notification-panel" onMouseDown={(event) => event.stopPropagation()}>
        <header className="notification-header">
          <div>
            <p className="eyebrow">FlowLane</p>
            <h2>Notifications</h2>
          </div>
          <button className="icon-plain" onClick={onClose} aria-label="Close notifications"><X size={18} /></button>
        </header>
        <div className="notification-actions">
          <Button label="Mark all read" size="sm" variant="secondary" icon={<CheckCheck size={14} />} onClick={() => void markAllRead()} />
        </div>
        {error ? <div className="inline-alert error-alert">{error}</div> : null}
        <div className="notification-list">
          {notifications.map((notification) => (
            <button className={notification.read_at ? 'notification-row' : 'notification-row unread'} key={notification.id} onClick={() => void markRead(notification)}>
              <span className="notification-icon"><Bell size={15} /></span>
              <span className="notification-copy">
                <strong>{notification.title}</strong>
                {notification.message ? <span>{notification.message}</span> : null}
                <small>{new Date(notification.created_at).toLocaleString()}</small>
              </span>
              {!notification.read_at ? <span className="unread-dot" /> : null}
            </button>
          ))}
          {!notifications.length ? <div className="notification-empty">No notifications yet.</div> : null}
        </div>
      </aside>
    </div>
  )
}
