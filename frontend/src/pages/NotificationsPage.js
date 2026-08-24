import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import {
  Bell, Check, CheckCheck, Trash2, Sparkles, Truck, Wrench,
  AlertTriangle, ShoppingCart, Package
} from 'lucide-react';
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

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('it-IT', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

const NotificationsPage = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (filter === 'unread') params.unread_only = true;
      const res = await api.get('/notifications', { params });
      setNotifications(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const handleRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch (e) { toast.error('Errore'); }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications(prev => prev.filter(n => n.id !== id));
      toast.success('Notifica eliminata');
    } catch (e) { toast.error('Errore'); }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.put('/notifications/mark-all-read');
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      toast.success('Tutte segnate come lette');
    } catch (e) { toast.error('Errore'); }
  };

  const handleNavigate = (notif) => {
    if (!notif.read) handleRead(notif.id);
    const route = ENTITY_ROUTES[notif.entity_type];
    if (route) navigate(route);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  // Group by date
  const grouped = {};
  notifications.forEach(n => {
    const day = new Date(n.created_at).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(n);
  });

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-3xl mx-auto" data-testid="notifications-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-heading font-semibold">Notifiche</h1>
          <p className="text-sm text-muted-foreground">{unreadCount > 0 ? `${unreadCount} non lette` : 'Tutto letto'}</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" className="gap-1" onClick={handleMarkAllRead} data-testid="mark-all-read-page">
            <CheckCheck className="h-4 w-4" />Segna tutto come letto
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        {[
          { key: 'all', label: `Tutte (${notifications.length})` },
          { key: 'unread', label: `Non lette (${unreadCount})` },
        ].map(f => (
          <button key={f.key} className={cn(
            "text-xs px-3 py-1.5 rounded-full font-medium border transition-colors",
            filter === f.key ? "border-[#F24E75] bg-[#F24E75]/10 text-[#F24E75]" : "border-border text-muted-foreground"
          )} onClick={() => setFilter(f.key)} data-testid={`filter-${f.key}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-16">
          <Bell className="h-12 w-12 mx-auto mb-3 text-muted-foreground/20" />
          <p className="text-muted-foreground">{filter === 'unread' ? 'Nessuna notifica non letta' : 'Nessuna notifica'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([day, notifs]) => (
            <div key={day}>
              <p className="text-xs font-medium text-muted-foreground mb-2 capitalize">{day}</p>
              <div className="space-y-1.5">
                {notifs.map(notif => {
                  const typeConf = TYPE_ICON[notif.type] || TYPE_ICON.default;
                  const Icon = typeConf.icon;
                  const priorityStyle = PRIORITY_STYLES[notif.priority] || PRIORITY_STYLES.normal;
                  return (
                    <Card key={notif.id}
                      className={cn("border-l-[3px] cursor-pointer transition-all hover:ring-1 hover:ring-[#F24E75]/20", priorityStyle, !notif.read && "ring-1 ring-primary/5")}
                      data-testid={`notif-item-${notif.id}`}>
                      <CardContent className="p-3" onClick={() => handleNavigate(notif)}>
                        <div className="flex items-start gap-3">
                          <div className={cn("mt-0.5 shrink-0", typeConf.color)}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <p className={cn("text-sm", !notif.read ? "font-semibold" : "text-muted-foreground")}>{notif.title}</p>
                              {!notif.read && <div className="w-2 h-2 rounded-full bg-[#F24E75] shrink-0" />}
                              {notif.priority === 'urgent' && <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">Urgente</span>}
                              {notif.priority === 'important' && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Importante</span>}
                            </div>
                            <p className="text-xs text-muted-foreground">{notif.message}</p>
                            <p className="text-xs text-muted-foreground/50 mt-1">{formatDate(notif.created_at)}</p>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            {!notif.read && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); handleRead(notif.id); }}>
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/60" onClick={e => { e.stopPropagation(); handleDelete(notif.id); }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;
