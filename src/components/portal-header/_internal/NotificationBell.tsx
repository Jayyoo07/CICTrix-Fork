import { Bell } from 'lucide-react';
import { useId } from 'react';
import { usePopoverDismiss } from './usePopover';

export interface HeaderNotification {
  id: string;
  title: string;
  message?: string | null;
  /** ISO timestamp. */
  createdAt: string;
  unread: boolean;
  /** `alert` marks something that needs attention, e.g. a returned IPCR. */
  tone?: 'default' | 'alert';
}

export interface NotificationBellProps {
  items: HeaderNotification[];
  unreadCount: number;
  open: boolean;
  /** Opening may mark items read; the portal owns that, so it owns the state. */
  onToggle: () => void;
  onClose: () => void;
}

export function NotificationBell({ items, unreadCount, open, onToggle, onClose }: NotificationBellProps) {
  const anchorRef = usePopoverDismiss<HTMLDivElement>(open, onClose);
  const panelId = useId();
  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications';

  return (
    <div className="ph-pop-anchor" ref={anchorRef}>
      <button
        type="button"
        className="ph-icon-btn"
        aria-label={label}
        title="Notifications"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <Bell size={20} strokeWidth={1.75} aria-hidden="true" />
        {unreadCount > 0 && <span className="ph-badge" aria-hidden="true">{unreadCount}</span>}
      </button>

      {open && (
        <div className="ph-pop" id={panelId} role="region" aria-label="Notifications">
          <div className="ph-pop-head">
            <span>Notifications</span>
            {unreadCount > 0 && <span className="ph-pop-new">{unreadCount} new</span>}
          </div>
          {items.length === 0 ? (
            <p className="ph-pop-empty">No notifications yet</p>
          ) : (
            <ul className="ph-pop-list">
              {items.map((n) => (
                <li key={n.id} className={`ph-pop-item${n.unread ? ' is-unread' : ''}${n.tone === 'alert' ? ' is-alert' : ''}`}>
                  <Bell size={16} strokeWidth={1.75} aria-hidden="true" />
                  <div>
                    <p className="ph-pop-title">{n.title}</p>
                    {n.message && <p className="ph-pop-msg">{n.message}</p>}
                    <p className="ph-pop-time">{new Date(n.createdAt).toLocaleString()}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
