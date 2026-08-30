import React, { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { usePermissions, ROLE_LABELS, ALL_ROLES } from '../../hooks/usePermissions';
import { NotificationBell } from '../NotificationBell';
import {
  LayoutDashboard, Users, CalendarDays, Truck, Settings, LogOut, Menu, X,
  Sun, Moon, Shield, Sparkles, Wrench, FileText, ChevronDown, ChevronRight,
  Eye, Building2, Shirt, Boxes, KeyRound, AlertTriangle, Warehouse, MapPin,
} from 'lucide-react';
import { useSegnalazioniBadge } from '../../hooks/useSegnalazioniBadge';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

const LOGO_URL = 'https://customer-assets.emergentagent.com/job_kilolava-core/artifacts/wuuhyigy_images.png';

const NAV = [
  { type: 'item', key: 'dashboard', path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { type: 'item', key: 'mappa', path: '/mappa', icon: MapPin, label: 'Mappa Operativa' },
  {
    type: 'group', key: 'clients-structures', icon: Users, label: 'Clienti e Strutture', children: [
      { key: 'clients', path: '/clients', label: 'Clienti' },
      { key: 'structures', path: '/structures', label: 'Strutture' },
      { key: 'keys', path: '/keys', label: 'Chiavi' },
    ],
  },
  {
    type: 'group', key: 'cleaning', icon: Sparkles, label: 'Pulizie', children: [
      { key: 'cleaning-overview', path: '/cleaning', label: 'Panoramica' },
      { key: 'calendar', path: '/calendar', label: 'Calendario' },
      { key: 'cleaning-organize', path: '/cleaning-organize', label: 'Organizzazione' },
    ],
  },
  { type: 'item', key: 'segnalazioni', path: '/segnalazioni', icon: AlertTriangle, label: 'Segnalazioni' },
  {
    type: 'group', key: 'consegne', icon: Truck, label: 'Consegne', children: [
      { key: 'consegne-overview', path: '/consegne', label: 'Panoramica' },
      { key: 'consegne-da-organizzare', path: '/consegne/da-organizzare', label: 'Da organizzare' },
      { key: 'consegne-organizzazione', path: '/consegne/organizzazione', label: 'Organizzazione' },
      { key: 'consegne-oggi', path: '/consegne/oggi', label: 'Oggi' },
      { key: 'consegne-storico', path: '/consegne/storico', label: 'Storico' },
    ],
  },
  {
    type: 'group', key: 'magazzino-strutture', icon: Boxes, label: 'Magazzino nelle Strutture', children: [
      { key: 'ms-overview', path: '/magazzino-strutture', label: 'Panoramica' },
      { key: 'ms-noleggio', path: '/magazzino-strutture/noleggio', label: 'Lavanderia a Noleggio' },
      { key: 'ms-forniture', path: '/magazzino-strutture/forniture', label: 'Forniture / Consumabili' },
      { key: 'ms-movimenti', path: '/magazzino-strutture/movimenti', label: 'Movimenti' },
    ],
  },
  {
    type: 'group', key: 'magazzino-generale', icon: Warehouse, label: 'Magazzino Generale', children: [
      { key: 'mg-overview', path: '/magazzino-generale', label: 'Panoramica' },
      { key: 'mg-noleggio', path: '/magazzino-generale/noleggio', label: 'Lavanderia a Noleggio' },
      { key: 'mg-forniture', path: '/magazzino-generale/forniture', label: 'Forniture / Consumabili' },
      { key: 'mg-pulizie', path: '/magazzino-generale/pulizie', label: 'Prodotti Pulizie' },
      { key: 'mg-zaini', path: '/magazzino-generale/zaini', label: 'Zaini Operatrici' },
      { key: 'mg-movimenti', path: '/magazzino-generale/movimenti', label: 'Movimenti' },
    ],
  },
  {
    type: 'group', key: 'private-laundry', icon: Shirt, label: 'Lavanderia Privata', children: [
      { key: 'pl-jobs', path: '/private-laundry/jobs', label: 'Lavorazioni' },
      { key: 'pl-history', path: '/private-laundry/history', label: 'Storico' },
    ],
  },
  { type: 'item', key: 'maintenance', path: '/maintenance', icon: Wrench, label: 'Manutenzioni' },
  {
    type: 'group', key: 'administration', icon: FileText, label: 'Amministrazione', children: [
      { key: 'documents', path: '/documents', label: 'Documenti / DDT' },
      { key: 'reports', path: '/reports', label: 'Report' },
    ],
  },
  {
    type: 'group', key: 'system', icon: Settings, label: 'Sistema', children: [
      { key: 'users', path: '/users', label: 'Utenti & Ruoli' },
      { key: 'cataloghi-prodotti', path: '/cataloghi-prodotti', label: 'Cataloghi Prodotti' },
      { key: 'kit', path: '/kit', label: 'Kit' },
      { key: 'integrations', path: '/integrations', label: 'Integrazioni' },
      { key: 'activity', path: '/activity', label: 'Registro attività' },
      { key: 'settings', path: '/settings', label: 'Impostazioni' },
    ],
  },
];

const ROLE_ICONS = {
  admin: Shield,
  operations_manager: LayoutDashboard,
  cleaner: Sparkles,
  rider: Truck,
  maintenance: Wrench,
  client: Users,
};

function getBreadcrumb(pathname, search) {
  if (pathname === '/dashboard') return { title: 'Dashboard', crumbs: [] };
  if (pathname === '/calendar') return { title: 'Calendario', crumbs: [{ label: 'Pulizie' }] };
  if (pathname === '/clients') return { title: 'Clienti', crumbs: [] };
  if (pathname.startsWith('/clients/')) return { title: 'Dettaglio cliente', crumbs: [{ label: 'Clienti', to: '/clients' }] };
  if (pathname === '/structures') return { title: 'Strutture', crumbs: [] };
  if (pathname === '/structures/new') return { title: 'Nuova struttura', crumbs: [{ label: 'Strutture', to: '/structures' }] };
  if (pathname.startsWith('/structures/')) return { title: 'Dettaglio struttura', crumbs: [{ label: 'Strutture', to: '/structures' }] };
  if (pathname === '/cleaning') return { title: 'Panoramica', crumbs: [{ label: 'Pulizie' }] };
  if (pathname === '/cleaning-organize') return { title: 'Organizzazione', crumbs: [{ label: 'Pulizie' }] };
  if (pathname === '/segnalazioni') return { title: 'Segnalazioni', crumbs: [] };
  if (pathname.startsWith('/segnalazioni/')) return { title: 'Dettaglio segnalazione', crumbs: [{ label: 'Segnalazioni', to: '/segnalazioni' }] };
  if (pathname.startsWith('/cleaning/task/')) return { title: 'Dettaglio pulizia', crumbs: [{ label: 'Pulizie', to: '/cleaning' }] };
  if (pathname.startsWith('/maintenance/issue/')) return { title: 'Dettaglio intervento', crumbs: [{ label: 'Manutenzioni', to: '/maintenance' }] };
  if (pathname.startsWith('/logistics/')) return { title: 'Dettaglio consegna', crumbs: [{ label: 'Consegne', to: '/consegne' }] };
  if (pathname === '/checklist-templates') return { title: 'Checklist', crumbs: [{ label: 'Pulizie', to: '/cleaning' }] };
  if (pathname === '/magazzino-strutture') return { title: 'Panoramica', crumbs: [{ label: 'Magazzino nelle Strutture' }] };
  if (pathname === '/magazzino-strutture/noleggio') return { title: 'Lavanderia a Noleggio', crumbs: [{ label: 'Magazzino nelle Strutture' }] };
  if (pathname.startsWith('/magazzino-strutture/noleggio/')) return { title: 'Noleggio in struttura', crumbs: [{ label: 'Lavanderia a Noleggio', to: '/magazzino-strutture/noleggio' }] };
  if (pathname === '/magazzino-strutture/forniture') return { title: 'Forniture / Consumabili', crumbs: [{ label: 'Magazzino nelle Strutture' }] };
  if (pathname.startsWith('/magazzino-strutture/forniture/')) return { title: 'Forniture struttura', crumbs: [{ label: 'Forniture / Consumabili', to: '/magazzino-strutture/forniture' }] };
  if (pathname === '/magazzino-strutture/movimenti') return { title: 'Movimenti Strutture', crumbs: [{ label: 'Magazzino nelle Strutture' }] };
  if (pathname === '/magazzino-generale') return { title: 'Panoramica', crumbs: [{ label: 'Magazzino Generale' }] };
  if (pathname === '/magazzino-generale/noleggio') return { title: 'Lavanderia a Noleggio', crumbs: [{ label: 'Magazzino Generale' }] };
  if (pathname === '/magazzino-generale/forniture') return { title: 'Forniture / Consumabili', crumbs: [{ label: 'Magazzino Generale' }] };
  if (pathname === '/magazzino-generale/pulizie') return { title: 'Prodotti Pulizie', crumbs: [{ label: 'Magazzino Generale' }] };
  if (pathname === '/magazzino-generale/zaini') return { title: 'Zaini Operatrici', crumbs: [{ label: 'Magazzino Generale' }] };
  if (pathname.startsWith('/magazzino-generale/zaini/')) return { title: 'Dettaglio zaino', crumbs: [{ label: 'Zaini Operatrici', to: '/magazzino-generale/zaini' }] };
  if (pathname === '/magazzino-generale/movimenti') return { title: 'Movimenti Generale', crumbs: [{ label: 'Magazzino Generale' }] };
  if (pathname === '/cataloghi-prodotti') return { title: 'Cataloghi Prodotti', crumbs: [{ label: 'Sistema' }] };
  if (pathname === '/kit') return { title: 'Kit', crumbs: [{ label: 'Sistema' }] };
  if (pathname === '/keys') return { title: 'Chiavi', crumbs: [{ label: 'Clienti e Strutture' }] };
  if (pathname.startsWith('/consegne/fermata/')) return { title: 'Dettaglio fermata', crumbs: [{ label: 'Consegne', to: '/consegne' }] };
  if (pathname === '/consegne') return { title: 'Panoramica', crumbs: [{ label: 'Consegne' }] };
  if (pathname === '/consegne/da-organizzare') return { title: 'Da organizzare', crumbs: [{ label: 'Consegne' }] };
  if (pathname === '/consegne/organizzazione') return { title: 'Organizzazione', crumbs: [{ label: 'Consegne' }] };
  if (pathname === '/consegne/oggi') return { title: 'Oggi', crumbs: [{ label: 'Consegne' }] };
  if (pathname === '/consegne/storico') return { title: 'Storico', crumbs: [{ label: 'Consegne' }] };
  if (pathname === '/private-laundry/jobs') return { title: 'Lavorazioni', crumbs: [{ label: 'Lavanderia Privata' }] };
  if (pathname === '/private-laundry/history') return { title: 'Storico', crumbs: [{ label: 'Lavanderia Privata' }] };
  if (pathname === '/maintenance') return { title: 'Manutenzioni', crumbs: [] };
  if (pathname === '/documents') return { title: 'Documenti / DDT', crumbs: [{ label: 'Amministrazione' }] };
  if (pathname === '/documents/new') return { title: 'Nuovo documento', crumbs: [{ label: 'Documenti / DDT', to: '/documents' }] };
  if (pathname.startsWith('/documents/')) return { title: 'Dettaglio documento', crumbs: [{ label: 'Documenti / DDT', to: '/documents' }] };
  if (pathname === '/reports') return { title: 'Report', crumbs: [{ label: 'Amministrazione' }] };
  if (pathname === '/users') return { title: 'Utenti & Ruoli', crumbs: [{ label: 'Sistema' }] };
  if (pathname === '/integrations') return { title: 'Integrazioni', crumbs: [{ label: 'Sistema' }] };
  if (pathname === '/activity') return { title: 'Registro attività', crumbs: [{ label: 'Sistema' }] };
  if (pathname === '/settings') return { title: 'Impostazioni', crumbs: [{ label: 'Sistema' }] };
  if (pathname === '/notifications') return { title: 'Notifiche', crumbs: [] };
  return { title: 'Kilolava', crumbs: [] };
}

const AppLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { canAccessNav, role, realRole, isRealAdmin, isImpersonating, setImpersonatedRole } = usePermissions();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileAccountOpen, setMobileAccountOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState({});
  const accountRef = useRef(null);
  const segBadge = useSegnalazioniBadge();

  const isPathActive = (path) => {
    const [p] = path.split('?');
    if (p === '/magazzino-strutture' || p === '/magazzino-generale' || p === '/consegne') return location.pathname === p;
    return location.pathname === p || location.pathname.startsWith(p + '/');
  };

  // Auto-open the group containing the active route
  useEffect(() => {
    NAV.forEach((entry) => {
      if (entry.type === 'group' && entry.children.some((c) => isPathActive(c.path))) {
        setOpenGroups((prev) => (prev[entry.key] ? prev : { ...prev, [entry.key]: true }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  // Close account dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (accountRef.current && !accountRef.current.contains(e.target)) setAccountOpen(false);
    };
    if (accountOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [accountOpen]);

  const visibleNav = NAV
    .map((entry) => {
      if (entry.type === 'item') return canAccessNav(entry.key) ? entry : null;
      const children = entry.children.filter((c) => canAccessNav(c.key));
      if (children.length === 0) return null;
      return { ...entry, children };
    })
    .filter(Boolean);

  const toggleGroup = (key) => setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleRoleSwitch = (newRole) => {
    setImpersonatedRole(newRole === realRole ? null : newRole);
    setAccountOpen(false);
    setMobileAccountOpen(false);
    setMobileMenuOpen(false);
    const homeRoutes = {
      admin: '/dashboard', operations_manager: '/dashboard',
      cleaner: '/cleaner', rider: '/rider', maintenance: '/maintenance', client: '/portal',
    };
    navigate(homeRoutes[newRole] || '/dashboard');
  };

  const { title } = getBreadcrumb(location.pathname, location.search);

  const renderNavEntry = (entry, onNavigate) => {
    if (entry.type === 'item') {
      const active = isPathActive(entry.path);
      return (
        <NavLink
          key={entry.key}
          to={entry.path}
          onClick={onNavigate}
          data-testid={`nav-${entry.key}`}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors',
            active
              ? 'bg-primary/10 text-primary font-semibold'
              : 'text-foreground/70 hover:bg-muted hover:text-foreground'
          )}
        >
          <entry.icon className={cn('h-5 w-5 flex-shrink-0', active ? 'text-primary' : 'text-foreground/50')} />
          <span className="truncate">{entry.label}</span>
          {entry.key === 'segnalazioni' && segBadge.active > 0 && (
            <span className="ml-auto flex items-center gap-1.5 flex-shrink-0">
              {segBadge.urgent > 0 && (
                <span className="text-xs font-bold text-red-600 bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded-full" data-testid="nav-segnalazioni-urgent">
                  {segBadge.urgent} urgenti
                </span>
              )}
              <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full tabular-nums" data-testid="nav-segnalazioni-badge">
                {segBadge.active}
              </span>
            </span>
          )}
        </NavLink>
      );
    }
    const open = !!openGroups[entry.key];
    const childActive = entry.children.some((c) => isPathActive(c.path));
    return (
      <div key={entry.key}>
        <button
          onClick={() => toggleGroup(entry.key)}
          data-testid={`nav-group-${entry.key}`}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors',
            childActive && !open ? 'text-primary font-medium' : 'text-foreground/70 hover:bg-muted hover:text-foreground'
          )}
        >
          <entry.icon className={cn('h-5 w-5 flex-shrink-0', childActive ? 'text-primary' : 'text-foreground/50')} />
          <span className="flex-1 text-left truncate">{entry.label}</span>
          <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-90')} />
        </button>
        {open && (
          <div className="mt-0.5 mb-1 space-y-0.5">
            {entry.children.map((child) => {
              const active = isPathActive(child.path);
              return (
                <NavLink
                  key={child.key}
                  to={child.path}
                  onClick={onNavigate}
                  data-testid={`nav-${child.key}`}
                  className={cn(
                    'flex items-center gap-2 pl-11 pr-3 py-2 rounded-md text-sm transition-colors',
                    active
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-foreground/60 hover:bg-muted hover:text-foreground'
                  )}
                >
                  <span className="truncate">{child.label}</span>
                </NavLink>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderAccountDropdown = (posClass) => (
    <div className={cn('w-64 bg-popover border border-border rounded-xl shadow-lg py-1.5 animate-in', posClass)} data-testid="role-dropdown">
      <div className="px-3.5 py-2 border-b border-border">
        <p className="text-sm font-semibold truncate">{user?.name}</p>
        <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
      </div>
      {isRealAdmin && (
        <>
          <div className="px-3.5 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Visualizza come
          </div>
          {ALL_ROLES.map((r) => {
            const RoleIcon = ROLE_ICONS[r];
            const isCurrent = r === role;
            return (
              <button
                key={r}
                onClick={() => handleRoleSwitch(r)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3.5 py-1.5 text-left hover:bg-muted transition-colors',
                  isCurrent && 'text-primary font-medium'
                )}
                data-testid={`impersonate-${r}`}
              >
                <RoleIcon className="h-3.5 w-3.5" />
                <span className="text-xs">{ROLE_LABELS[r]}</span>
                {isCurrent && <span className="ml-auto text-xs text-primary font-semibold">Attivo</span>}
              </button>
            );
          })}
          <div className="my-1.5 border-t border-border" />
        </>
      )}
      <Link
        to="/settings"
        onClick={() => { setAccountOpen(false); setMobileAccountOpen(false); }}
        className="flex items-center gap-2.5 px-3.5 py-2 text-xs hover:bg-muted transition-colors"
        data-testid="account-settings-link"
      >
        <Settings className="h-3.5 w-3.5" />Impostazioni
      </Link>
      <button
        onClick={logout}
        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-destructive hover:bg-muted transition-colors"
        data-testid="logout-btn"
      >
        <LogOut className="h-3.5 w-3.5" />Esci
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Impersonation banner */}
      {isImpersonating && (
        <div className="fixed top-0 left-0 right-0 z-[80] bg-amber-500 text-white text-center py-1 text-xs font-medium flex items-center justify-center gap-2">
          <Eye className="h-3.5 w-3.5" />
          Stai visualizzando come: <strong>{ROLE_LABELS[role]}</strong>
          <button
            onClick={() => { setImpersonatedRole(null); navigate('/dashboard'); }}
            className="ml-2 underline hover:no-underline font-semibold"
            data-testid="exit-impersonation"
          >
            Torna ad Admin
          </button>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className={cn(
        'hidden lg:flex lg:flex-col lg:w-72 lg:fixed lg:inset-y-0 bg-card border-r border-border',
        isImpersonating && 'lg:top-7'
      )}>
        <div className="flex items-center gap-3 h-20 px-4 flex-shrink-0">
          <img src={LOGO_URL} alt="Kilolava" className="h-12 object-contain" data-testid="logo" />
          <span className="flex-1 text-3xl font-heading font-bold text-primary tracking-tight">kilolava</span>
        </div>
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto scrollbar-hide" data-testid="sidebar-nav">
          {visibleNav.map((entry) => renderNavEntry(entry))}
        </nav>

        {/* Bottom: notifications, theme, account */}
        <div className="px-3 py-3 border-t border-border space-y-1.5">
          <div className="flex items-center justify-between px-2">
            <NotificationBell dropUp align="left" />
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              data-testid="theme-toggle"
              title={theme === 'dark' ? 'Tema chiaro' : 'Tema scuro'}
              className="h-9 w-9"
            >
              {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </Button>
            <NavLink
              to="/settings"
              data-testid="sidebar-settings-btn"
              title="Impostazioni"
              className={cn(
                'h-9 w-9 flex items-center justify-center rounded-md hover:bg-muted transition-colors',
                location.pathname === '/settings' ? 'text-primary bg-primary/10' : 'text-foreground/70'
              )}
            >
              <Settings className="h-[18px] w-[18px]" />
            </NavLink>
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              data-testid="sidebar-logout-btn"
              title="Esci"
              className="h-9 w-9 text-foreground/70 hover:text-destructive"
            >
              <LogOut className="h-[18px] w-[18px]" />
            </Button>
          </div>
          <div className="relative" ref={accountRef}>
            {accountOpen && renderAccountDropdown('absolute left-0 bottom-full mb-2 z-[70]')}
            <button
              onClick={() => setAccountOpen(!accountOpen)}
              className={cn(
                'w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted transition-colors',
                isImpersonating && 'ring-1 ring-amber-400'
              )}
              data-testid="role-switcher-btn"
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="text-left flex-1 min-w-0">
                <p className="text-sm font-medium leading-tight truncate">{user?.name}</p>
                <p className="text-xs text-muted-foreground leading-tight">{ROLE_LABELS[role]}</p>
              </div>
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform flex-shrink-0', accountOpen ? 'rotate-0' : 'rotate-180')} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className={cn(
        'lg:hidden fixed top-0 left-0 right-0 h-14 bg-card border-b border-border z-50 flex items-center justify-between px-3',
        isImpersonating && 'top-7'
      )}>
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            data-testid="mobile-menu-btn"
            className="h-10 w-10 flex-shrink-0"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <span className="text-sm font-semibold truncate" data-testid="mobile-page-title">{title}</span>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <NotificationBell />
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-9 w-9"
            data-testid="mobile-theme-toggle"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <button
            onClick={() => setMobileAccountOpen(!mobileAccountOpen)}
            data-testid="mobile-account-btn"
            className={cn(
              'w-8 h-8 ml-1 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs',
              isImpersonating && 'ring-1 ring-amber-400'
            )}
          >
            {user?.name?.charAt(0).toUpperCase() || 'U'}
          </button>
        </div>
      </header>

      {/* Mobile account dropdown */}
      {mobileAccountOpen && (
        <>
          <div className="lg:hidden fixed inset-0 z-[68]" onClick={() => setMobileAccountOpen(false)} />
          <div className={cn(
            'lg:hidden fixed right-2 z-[70]',
            isImpersonating ? 'top-[calc(3.5rem+1.75rem+0.25rem)]' : 'top-[calc(3.5rem+0.25rem)]'
          )}>
            {renderAccountDropdown('')}
          </div>
        </>
      )}

      {/* Mobile side menu (from left) */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-[60]" onClick={() => setMobileMenuOpen(false)} />
      )}
      <div className={cn(
        'lg:hidden fixed left-0 inset-y-0 w-[85vw] max-w-[320px] bg-card border-r border-border z-[65] transform transition-transform duration-200 flex flex-col',
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      )} data-testid="mobile-full-menu">
        <div className="flex items-center justify-between h-14 px-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <img src={LOGO_URL} alt="Kilolava" className="h-8 object-contain" />
            <span className="text-lg font-heading font-bold text-primary tracking-tight">kilolava</span>
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setMobileMenuOpen(false)} data-testid="mobile-menu-close">
            <X className="h-5 w-5" />
          </Button>
        </div>
        {isRealAdmin && (
          <div className="px-4 py-2.5 border-b border-border flex-shrink-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Visualizza come</p>
            <div className="flex flex-wrap gap-1">
              {ALL_ROLES.map((r) => (
                <button
                  key={r}
                  onClick={() => handleRoleSwitch(r)}
                  className={cn(
                    'px-2 py-1 rounded-full text-xs font-medium transition-colors',
                    r === role ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>
        )}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          {visibleNav.map((entry) => renderNavEntry(entry, () => setMobileMenuOpen(false)))}
        </nav>
        <div className="px-3 py-3 border-t border-border flex items-center gap-2 flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs flex-shrink-0">
            {user?.name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{user?.name}</p>
            <p className="text-xs text-muted-foreground truncate">{ROLE_LABELS[role]}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={logout}
            data-testid="mobile-logout-btn"
            title="Esci"
            className="h-9 w-9 text-foreground/70 hover:text-destructive"
          >
            <LogOut className="h-[18px] w-[18px]" />
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <main className={cn(
        'lg:pl-72',
        isImpersonating
          ? 'pt-[calc(3.5rem+1.75rem)] lg:pt-7'
          : 'pt-14 lg:pt-0'
      )}>
        <div className="min-h-screen">
          <div key={location.pathname} className="page-enter">
            {children || <Outlet />}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
