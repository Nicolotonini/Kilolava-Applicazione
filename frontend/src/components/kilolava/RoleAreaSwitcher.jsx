import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, Truck, Wrench, Shirt } from 'lucide-react';
import { usePermissions } from '../../hooks/usePermissions';
import { cn } from '../../lib/utils';

const ICONS = { cleaner: Sparkles, rider: Truck, maintenance: Wrench, laundry: Shirt };

// Multi-ruolo (es. Pulizie + Lavanderia): chip per passare tra le aree operative abilitate. Nascosto se una sola area.
export const RoleAreaSwitcher = ({ className }) => {
  const { operativeAreas, isOps } = usePermissions();
  const location = useLocation();
  const navigate = useNavigate();
  if (isOps || operativeAreas.length < 2) return null;
  return (
    <div className={cn('flex items-center gap-1.5 overflow-x-auto scrollbar-hide', className)} data-testid="role-area-switcher">
      {operativeAreas.map((a) => {
        const Icon = ICONS[a.key];
        const active = location.pathname === a.path || location.pathname.startsWith(a.path + '/');
        return (
          <button
            key={a.key}
            type="button"
            onClick={() => navigate(a.path)}
            data-testid={`area-${a.key}`}
            className={cn(
              'inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold border transition-colors whitespace-nowrap',
              active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground/70 border-border hover:bg-muted'
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}{a.label}
          </button>
        );
      })}
    </div>
  );
};

export default RoleAreaSwitcher;
