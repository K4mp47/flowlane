import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { AlertTriangle, ArrowRightLeft, Bell, CalendarClock, CheckCheck, FilePlus2, MessageSquare, PencilLine, Trash2, UserPlus, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Notification, NotificationType } from '../../types/domain'

interface NotificationsPanelProps { userId: string; workspaceId: string; onClose: () => void; onOpenTask: (taskId: string) => void; onUnreadCountChange: (count: number) => void }
type NotificationFilter = 'ALL' | 'UNREAD'

const notificationIcon: Record<NotificationType, ReactNode> = {
  ASSIGNMENT: <UserPlus size={15} />,
  MENTION: <MessageSquare size={15} />,
  DUE_SOON: <CalendarClock size={15} />,
  OVERDUE: <AlertTriangle size={15} />,
  STATUS_CHANGE: <ArrowRightLeft size={15} />,
  COMMENT: <MessageSquare size={15} />,
  TASK_CREATED: <FilePlus2 size={15} />,
  TASK_UPDATED: <PencilLine size={15} />,
}

export function NotificationsPanel({ userId, workspaceId, onClose, onOpenTask, onUnreadCountChange }: NotificationsPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [filter, setFilter] = useState<NotificationFilter>('ALL')
  const [error, setError] = useState<string | null>(null)
  const [isClearingAll, setIsClearingAll] = useState(false)

  const loadNotifications = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (queryError) {
      setError(queryError.message)
      return
    }

    const rows = (data ?? []) as Notification[]
    setNotifications(rows)
    onUnreadCountChange(rows.filter((notification) => !notification.read_at).length)
  }, [onUnreadCountChange, userId, workspaceId])

  useEffect(() => {
    void loadNotifications()
    const channel = supabase
      .channel(`notifications-panel-${userId}-${workspaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => void loadNotifications())
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [loadNotifications, userId, workspaceId])

  const visibleNotifications = useMemo(
    () => filter === 'UNREAD' ? notifications.filter((notification) => !notification.read_at) : notifications,
    [filter, notifications],
  )
  const unreadCount = notifications.filter((notification) => !notification.read_at).length

  async function markRead(notification: Notification) {
    if (!notification.read_at) {
      const readAt = new Date().toISOString()
      const { error: updateError } = await supabase.from('notifications').update({ read_at: readAt }).eq('id', notification.id)
      if (updateError) return setError(updateError.message)
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: readAt } : item))
      onUnreadCountChange(Math.max(0, unreadCount - 1))
    }
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

  async function dismiss(notification: Notification) {
    const { error: deleteError } = await supabase.from('notifications').delete().eq('id', notification.id)
    if (deleteError) return setError(deleteError.message)
    const next = notifications.filter((item) => item.id !== notification.id)
    setNotifications(next)
    onUnreadCountChange(next.filter((item) => !item.read_at).length)
  }

  async function clearRead() {
    const readIds = notifications.filter((notification) => notification.read_at).map((notification) => notification.id)
    if (!readIds.length) return
    const { error: deleteError } = await supabase.from('notifications').delete().in('id', readIds)
    if (deleteError) return setError(deleteError.message)
    setNotifications((current) => current.filter((notification) => !notification.read_at))
  }

  async function clearAll() {
    if (!notifications.length || !window.confirm('Clear all notifications for this workspace?')) return

    setError(null)
    setIsClearingAll(true)
    const { error: deleteError } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)

    setIsClearingAll(false)
    if (deleteError) return setError(deleteError.message)

    setNotifications([])
    onUnreadCountChange(0)
    setFilter('ALL')
  }

  return (
    <div className="task-peek-backdrop" onMouseDown={onClose}>
      <aside className="notification-panel" onMouseDown={(event) => event.stopPropagation()}>
        <header className="notification-header">
          <div>
            <p className="eyebrow">FlowLane</p>
            <h2>Notifications</h2>
            <p>{unreadCount ? `${unreadCount} unread update${unreadCount === 1 ? '' : 's'}` : 'You are all caught up'}</p>
          </div>
          <button className="icon-plain" onClick={onClose} aria-label="Close notifications"><X size={18} /></button>
        </header>

        <div className="notification-toolbar">
          <div className="notification-tabs">
            <button className={filter === 'ALL' ? 'active' : ''} onClick={() => setFilter('ALL')}>All <span>{notifications.length}</span></button>
            <button className={filter === 'UNREAD' ? 'active' : ''} onClick={() => setFilter('UNREAD')}>Unread <span>{unreadCount}</span></button>
          </div>
          <div className="notification-actions">
            <Button label="Mark all read" size="sm" variant="secondary" icon={<CheckCheck size={14} />} onClick={() => void markAllRead()} isDisabled={!unreadCount} />
            <Button label="Clear read" size="sm" variant="secondary" icon={<Trash2 size={14} />} onClick={() => void clearRead()} isDisabled={!notifications.some((notification) => notification.read_at)} />
            <Button label="Clear all" size="sm" variant="secondary" icon={<Trash2 size={14} />} onClick={() => void clearAll()} isDisabled={!notifications.length} isLoading={isClearingAll} />
          </div>
        </div>

        {error ? <div className="inline-alert error-alert">{error}</div> : null}

        <div className="notification-list">
          {visibleNotifications.map((notification) => (
            <div className={notification.read_at ? 'notification-row' : 'notification-row unread'} key={notification.id}>
              <button className="notification-main-action" onClick={() => void markRead(notification)}>
                <span className={`notification-icon type-${notification.type.toLowerCase()}`}>{notificationIcon[notification.type] ?? <Bell size={15} />}</span>
                <span className="notification-copy">
                  <strong>{notification.title}</strong>
                  {notification.message ? <span>{notification.message}</span> : null}
                  <small>{new Date(notification.created_at).toLocaleString()}</small>
                </span>
                {!notification.read_at ? <span className="unread-dot" /> : null}
              </button>
              <button className="notification-dismiss" onClick={() => void dismiss(notification)} aria-label="Dismiss notification"><X size={13} /></button>
            </div>
          ))}
          {!visibleNotifications.length ? <div className="notification-empty">{filter === 'UNREAD' ? 'No unread notifications.' : 'No notifications yet.'}</div> : null}
        </div>
      </aside>
    </div>
  )
}
