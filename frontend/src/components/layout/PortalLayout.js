import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { NotificationBell } from '../NotificationBell';
import { Button } from '../ui/button';
import {
  LayoutDashboard, ClipboardList, ShoppingCart, History, BarChart3,
  LogOut, Moon, Sun, Menu, X
} from 'lucide-react';
import { cn } from '../../lib/utils';

const PortalLayout = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const navItems = [
    { path: '/portal', icon: LayoutDashboard, label: 'Dashboard', end: true },
    { path: '/portal/services', icon: ClipboardList, label: 'Servizi' },
    { path: '/portal/orders', icon: ShoppingCart, label: 'Ordini' },
    { path: '/portal/history', icon: History, label: 'Storico' },
    { path: '/portal/report', icon: BarChart3, label: 'Report' },
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background" data-testid="portal-layout">
      {/* Top nav */}
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
            <span className="font-heading font-bold text-lg tracking-tight">Kilolava</span>
            <span className="hidden sm:inline text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Portale Cliente</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-sm text-muted-foreground">{user?.name}</span>
            <NotificationBell />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={handleLogout} data-testid="portal-logout">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Desktop nav tabs */}
        <nav className="hidden lg:flex max-w-6xl mx-auto px-4 gap-1">
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) => cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                isActive
                  ? "border-[#F24E75] text-[#F24E75]"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
              data-testid={`portal-nav-${item.path.split('/').pop() || 'dashboard'}`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Mobile nav */}
        {mobileOpen && (
          <nav className="lg:hidden border-t border-border bg-card px-4 py-2 space-y-1">
            {navItems.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) => cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive ? "bg-[#F24E75]/10 text-[#F24E75]" : "text-muted-foreground hover:bg-accent"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
};

export default PortalLayout;
