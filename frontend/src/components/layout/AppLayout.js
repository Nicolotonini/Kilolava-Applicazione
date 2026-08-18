import React, { useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { usePermissions, ROLE_LABELS, ALL_ROLES } from '../../hooks/usePermissions';
import { NotificationBell } from '../NotificationBell';
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Package,
  Truck,
  Settings,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  Shield,
  Sparkles,
  Wrench,
  BarChart3,
  FileText,
  ChevronDown,
  Eye,
  EyeOff,
  Building2,
  History
} from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

const LOGO_URL = 'https://customer-assets.emergentagent.com/job_kilolava-core/artifacts/wuuhyigy_images.png';

const ALL_NAV_ITEMS = [
  { key: 'dashboard', path: '/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { key: 'clients', path: '/clients', icon: Users, labelKey: 'nav.clients' },
  { key: 'structures', path: '/structures', icon: Building2, labelFallback: 'Strutture' },
  { key: 'calendar', path: '/calendar', icon: CalendarDays, labelKey: 'nav.calendar' },
  { key: 'inventory', path: '/inventory', icon: Package, labelKey: 'nav.inventory' },
  { key: 'logistics', path: '/logistics', icon: Truck, labelFallback: 'Logistica' },
  { key: 'cleaning', path: '/cleaning', icon: Sparkles, labelFallback: 'Pulizie' },
  { key: 'maintenance', path: '/maintenance', icon: Wrench, labelFallback: 'Manutenzione' },
  { key: 'documents', path: '/documents', icon: FileText, labelFallback: 'Documenti' },
  { key: 'users', path: '/users', icon: Shield, labelFallback: 'Utenti' },
  { key: 'activity', path: '/activity', icon: History, labelFallback: 'Registro Attività' },
];

const ROLE_ICONS = {
  admin: Shield,
  operations_manager: LayoutDashboard,
  cleaner: Sparkles,
  rider: Truck,
  maintenance: Wrench,
  client: Users,
};

const AppLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { canAccessNav, role, realRole, isRealAdmin, isImpersonating, setImpersonatedRole } = usePermissions();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);

  const navItems = ALL_NAV_ITEMS
    .filter(item => canAccessNav(item.key))
    .map(item => ({
      ...item,
      label: item.labelKey ? t(item.labelKey) : item.labelFallback,
    }));

  const isActive = (path) => {
    if (path === '/clients') return location.pathname.startsWith('/clients');
    if (path === '/calendar') return location.pathname.startsWith('/calendar');
    if (path === '/documents') return location.pathname.startsWith('/documents');
    if (path === '/structures') return location.pathname.startsWith('/structures');
    return location.pathname === path;
  };

  const handleRoleSwitch = (newRole) => {
    setImpersonatedRole(newRole === realRole ? null : newRole);
    setRoleDropdownOpen(false);
    // Navigate to appropriate home route
    const homeRoutes = {
      admin: '/dashboard', operations_manager: '/dashboard',
      cleaner: '/cleaner', rider: '/rider', maintenance: '/maintenance', client: '/portal',
    };
    navigate(homeRoutes[newRole] || '/dashboard');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Impersonation banner */}
      {isImpersonating && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-amber-500 text-white text-center py-1 text-xs font-medium flex items-center justify-center gap-2">
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
        "hidden lg:flex lg:flex-col lg:w-52 lg:fixed lg:inset-y-0 bg-card border-r border-border",
        isImpersonating && "lg:top-7"
      )}>
        {/* Logo */}
        <div className="flex items-center h-14 px-5">
          <img src={LOGO_URL} alt="Kilolava" className="h-7 object-contain" data-testid="logo" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              data-testid={`nav-${item.path.slice(1)}`}
              className={cn(
                'sidebar-item',
                isActive(item.path) && 'active'
              )}
            >
              <item.icon className="h-[18px] w-[18px]" />
              <span className="text-[13px]">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User box + bottom actions */}
        <div className="px-3 pb-4 pt-3 space-y-2 border-t border-border">
          <div className="relative">
            {isRealAdmin && roleDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setRoleDropdownOpen(false)} />
                <div className="absolute bottom-full left-0 mb-1 w-full bg-card border border-border rounded-lg shadow-lg z-50 py-1" data-testid="role-dropdown">
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                          "w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-accent transition-colors",
                          isCurrent && "bg-primary/5 text-primary font-medium"
                        )}
                        data-testid={`impersonate-${r}`}
                      >
                        <RoleIcon className="h-4 w-4" />
                        <span className="text-xs">{ROLE_LABELS[r]}</span>
                        {isCurrent && <span className="ml-auto text-[10px] text-primary font-semibold">Attivo</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            <button
              onClick={() => isRealAdmin && setRoleDropdownOpen(!roleDropdownOpen)}
              className={cn(
                "w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors border border-border",
                isRealAdmin && "hover:bg-accent cursor-pointer",
                isImpersonating && "border-amber-400 bg-amber-50 dark:bg-amber-900/20"
              )}
              data-testid="role-switcher-btn"
            >
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs flex-shrink-0">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="text-left flex-1 min-w-0">
                <p className="text-xs font-medium leading-tight truncate">{user?.name}</p>
                <p className="text-[10px] text-muted-foreground leading-tight truncate">{ROLE_LABELS[role]}</p>
              </div>
              {isRealAdmin && (
                <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform flex-shrink-0", roleDropdownOpen ? "rotate-0" : "rotate-180")} />
              )}
            </button>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              data-testid="logout-btn"
              className="flex-1 justify-start text-muted-foreground hover:text-destructive text-xs h-9"
            >
              <LogOut className="h-4 w-4 mr-2" />
              {t('nav.logout')}
            </Button>
            <NavLink
              to="/settings"
              data-testid="sidebar-settings-btn"
              title="Impostazioni"
              className={cn(
                "p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground",
                location.pathname === '/settings' && "bg-accent text-foreground"
              )}
            >
              <Settings className="h-4 w-4" />
            </NavLink>
          </div>
        </div>
      </aside>

      {/* Top Header Bar (desktop) */}
      <header className={cn(
        "hidden lg:flex fixed top-0 right-0 h-14 bg-card border-b border-border z-50 items-center justify-between px-5",
        isImpersonating ? "left-52 top-7" : "left-52"
      )}>
        {/* Left: empty (user box moved to sidebar bottom) */}
        <div />

        {/* Right: Notifications, Settings, Logo */}
        <div className="flex items-center gap-2">
          <NotificationBell />
          <NavLink
            to="/settings"
            className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            data-testid="topbar-settings"
          >
            <Settings className="h-4 w-4" />
          </NavLink>
          <div className="w-px h-6 bg-border mx-1" />
          <img src={LOGO_URL} alt="Kilolava" className="h-6 object-contain opacity-60" />
        </div>
      </header>

      {/* Mobile Header */}
      <header className={cn(
        "lg:hidden fixed top-0 left-0 right-0 h-14 bg-card border-b border-border z-50 flex items-center justify-between px-4",
        isImpersonating && "top-7"
      )}>
        <img src={LOGO_URL} alt="Kilolava" className="h-7 object-contain" />
        <div className="flex items-center gap-2">
          <NotificationBell />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            data-testid="mobile-menu-btn"
            className="h-9 w-9"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Mobile Menu */}
      <div className={cn(
        'lg:hidden fixed right-0 w-64 h-[calc(100vh-3.5rem)] bg-card border-l border-border z-50 transform transition-transform duration-200',
        isImpersonating ? 'top-[calc(3.5rem+1.75rem)]' : 'top-14',
        mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
      )}>
        {/* Mobile role switcher */}
        {isRealAdmin && (
          <div className="p-3 border-b border-border">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Visualizza come</p>
            <div className="flex flex-wrap gap-1">
              {ALL_ROLES.map((r) => (
                <button
                  key={r}
                  onClick={() => { handleRoleSwitch(r); setMobileMenuOpen(false); }}
                  className={cn(
                    "px-2 py-1 rounded text-[10px] font-medium transition-colors",
                    r === role ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground hover:bg-accent"
                  )}
                >
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>
        )}

        <nav className="p-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setMobileMenuOpen(false)}
              data-testid={`mobile-nav-${item.path.slice(1)}`}
              className={cn('sidebar-item', isActive(item.path) && 'active')}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              data-testid="mobile-logout-btn"
              className="flex-1 justify-start text-muted-foreground hover:text-destructive"
            >
              <LogOut className="h-4 w-4 mr-2" />
              {t('nav.logout')}
            </Button>
            <NavLink
              to="/settings"
              onClick={() => setMobileMenuOpen(false)}
              data-testid="mobile-settings-btn"
              className="p-2 rounded-lg hover:bg-accent text-muted-foreground"
            >
              <Settings className="h-5 w-5" />
            </NavLink>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden mobile-nav">
        <div className="flex items-center justify-around">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              data-testid={`bottom-nav-${item.path.slice(1)}`}
              className={cn('mobile-nav-item', isActive(item.path) && 'active')}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-xs mt-1">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Dark/Light toggle fixed bottom-right */}
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          variant="outline"
          size="icon"
          onClick={toggleTheme}
          data-testid="theme-toggle"
          className="h-9 w-9 rounded-full shadow-lg bg-card border-border"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>

      {/* Main Content */}
      <main className={cn(
        "lg:pl-52 pb-20 lg:pb-0",
        isImpersonating ? "pt-[calc(3.5rem+1.75rem)] lg:pt-[calc(3.5rem+1.75rem)]" : "pt-14 lg:pt-14"
      )}>
        <div className="min-h-screen">
          {children || <Outlet />}
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
