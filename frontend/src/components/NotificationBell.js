import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Button } from './ui/button';
import { Bell, Check, CheckCheck, X, AlertTriangle, Truck, Sparkles, Wrench, ShoppingCart, Package } from 'lucide-react';
import { cn } from '../lib/utils';

const TYPE_ICON = {
  cleaning_assigned: { icon: Sparkles, color: 'text-teal-500' },
  cleaning_updated: { icon: Sparkles, color: 'text-teal-500' },
  logistics_assigned: { icon: Truck, color: 'text-blue-500' },
  maintenance_assigned: { icon: Wrench, color: 'text-orange-500' },
  issue_from_cleaning: { icon: AlertTriangle, color: 'text-red-500' },
  order_created: { icon: ShoppingCart, color: 'text-purple-500' },
  order_status: { icon: ShoppingCart, color: 'text-purple-500' },
  stock_alert: { icon: Package, color: 'text-amber-500' },
  default: { icon: Bell, color: 'text-muted-foreground' },
};

const PRIORITY_STYLES = {
  urgent: 'border-l-red-500 bg-red-50/50 dark:bg-red-950/20',
  important: 'border-l-amber-400 bg-amber-50/30 dark:bg-amber-950/10',
  normal: 'border-l-transparent',
};

const ENTITY_ROUTES = {
  cleaning_task: '/cleaning',
  maintenance_issue: '/maintenance',
  logistics_task: '/logistics',
  order: '/portal/orders',
};

const NotificationItem = ({ notif, onRead, onNavigate }) => {
  const typeConf = TYPE_ICON[notif.type] || TYPE_ICON.default;
  const Icon = typeConf.icon;
  const priorityStyle = PRIORITY_STYLES[notif.priority] || PRIORITY_STYLES.normal;
  const timeAgo = getTimeAgo(notif.created_at);

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 px-3 py-2.5 border-l-[3px] cursor-pointer transition-colors hover:bg-accent/50",
        priorityStyle,
        !notif.read && "bg-primary/[0.03]"
      )}
      onClick={() => onNavigate(notif)}
      data-testid={`notification-${notif.id}`}
    >
      <div className={cn("mt-0.5 shrink-0", typeConf.color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className={cn("text-xs leading-tight", !notif.read ? "font-semibold" : "font-medium text-muted-foreground")}>
            {notif.title}
          </p>
          {!notif.read && <div className="w-1.5 h-1.5 rounded-full bg-[#F24E75] shrink-0" />}
        </div>
        <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{notif.message}</p>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">{timeAgo}</p>
      </div>
      {!notif.read && (
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 mt-0.5" onClick={e => { e.stopPropagation(); onRead(notif.id); }}>
          <Check className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
};

function getTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ora';
  if (mins < 60) return `${mins}m fa`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h fa`;
  const days = Math.floor(hours / 24);
  return `${days}g fa`;
}

export const NotificationBell = ({ className, dropUp = false, align = 'right' }) => {
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await api.get('/notifications/unread-count');
      setUnread(res.data.count);
    } catch (e) { /* silent */ }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/notifications?limit=15');
      setNotifications(res.data);
    } catch (e) { /* silent */ }
    finally { setLoading(false); }
  }, []);

  // Poll for unread count every 30s
  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  // Load notifications when dropdown opens
  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setUnread(prev => Math.max(0, prev - 1));
    } catch (e) { /* silent */ }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.put('/notifications/mark-all-read');
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnread(0);
    } catch (e) { /* silent */ }
  };

  const handleNavigate = (notif) => {
    if (!notif.read) handleRead(notif.id);
    setOpen(false);
    const route = ENTITY_ROUTES[notif.entity_type];
    if (route) navigate(route);
  };

  return (
    <div className={cn("relative", className)} ref={dropdownRef}>
      <Button variant="ghost" size="icon" className="h-8 w-8 relative" onClick={() => setOpen(!open)} data-testid="notification-bell">
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-[#F24E75] text-[10px] font-bold text-white flex items-center justify-center px-1" data-testid="notif-badge">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Button>

      {open && (
        <div className={cn(
          "absolute w-80 sm:w-96 bg-card border border-border rounded-xl shadow-xl z-[60] overflow-hidden animate-in fade-in duration-150",
          dropUp ? "bottom-full mb-2" : "top-full mt-2 slide-in-from-top-2",
          align === 'left' ? "left-0" : "right-0"
        )}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
            <h3 className="text-sm font-semibold">Notifiche</h3>
            <div className="flex gap-1">
              {unread > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1 px-2" onClick={handleMarkAllRead} data-testid="mark-all-read">
                  <CheckCheck className="h-3 w-3" />Segna tutto letto
                </Button>
              )}
              <Button variant="ghost" size="sm" className="h-7 text-[10px] px-2" onClick={() => { setOpen(false); navigate('/notifications'); }} data-testid="view-all-notifs">
                Vedi tutte
              </Button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[360px] overflow-y-auto divide-y divide-border/50">
            {loading ? (
              <div className="py-8 text-center text-xs text-muted-foreground">Caricamento...</div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">Nessuna notifica</div>
            ) : (
              notifications.map(n => (
                <NotificationItem key={n.id} notif={n} onRead={handleRead} onNavigate={handleNavigate} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
