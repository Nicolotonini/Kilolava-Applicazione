import { useAuth } from '../contexts/AuthContext';
import { useState, useEffect, useCallback } from 'react';

const ROLE_PERMISSIONS = {
  admin: ['*'],
  operations_manager: [
    'clients.read', 'clients.write', 'structures.read', 'structures.write',
    'units.read', 'units.write', 'calendar.read', 'calendar.write',
    'logistics.read', 'logistics.write', 'inventory.read', 'inventory.write',
    'orders.read', 'orders.write', 'automation.read', 'automation.write',
    'portal_ops.read', 'portal_ops.write',
  ],
  cleaner: ['tasks.own.read', 'tasks.own.write'],
  rider: ['logistics.own.read', 'logistics.own.write'],
  maintenance: ['maintenance.own.read', 'maintenance.own.write'],
  client: ['portal.read', 'portal.write'],
};

const OPS_ROLES = new Set(['admin', 'operations_manager']);

const NAV_VISIBILITY = {
  admin: ['dashboard', 'clients', 'structures', 'calendar', 'inventory', 'logistics', 'cleaning', 'maintenance', 'users', 'reports', 'documents', 'activity', 'settings'],
  operations_manager: ['dashboard', 'clients', 'structures', 'calendar', 'inventory', 'logistics', 'cleaning', 'maintenance', 'reports', 'documents', 'activity', 'settings'],
  cleaner: [],
  rider: [],
  maintenance: [],
  client: [],
};

const IMPERSONATION_KEY = 'kilolava_impersonate_role';

export const ROLE_LABELS = {
  admin: 'Admin',
  operations_manager: 'Operations Manager',
  cleaner: 'Addetto Pulizie',
  rider: 'Rider',
  maintenance: 'Manutentore',
  client: 'Cliente',
};

export const ALL_ROLES = ['admin', 'operations_manager', 'cleaner', 'rider', 'maintenance', 'client'];

export const usePermissions = () => {
  const { user } = useAuth();
  const realRole = (user?.role === 'manager' ? 'admin' : user?.role) || 'client';
  const isRealAdmin = realRole === 'admin';

  const [impersonatedRole, setImpersonatedRoleState] = useState(() => {
    return localStorage.getItem(IMPERSONATION_KEY) || null;
  });

  const setImpersonatedRole = useCallback((role) => {
    if (role && role !== realRole) {
      localStorage.setItem(IMPERSONATION_KEY, role);
      setImpersonatedRoleState(role);
    } else {
      localStorage.removeItem(IMPERSONATION_KEY);
      setImpersonatedRoleState(null);
    }
  }, [realRole]);

  // Clear impersonation if not admin
  useEffect(() => {
    if (!isRealAdmin && impersonatedRole) {
      localStorage.removeItem(IMPERSONATION_KEY);
      setImpersonatedRoleState(null);
    }
  }, [isRealAdmin, impersonatedRole]);

  const effectiveRole = (isRealAdmin && impersonatedRole) ? impersonatedRole : realRole;
  const isImpersonating = isRealAdmin && impersonatedRole && impersonatedRole !== realRole;
  const perms = user?.permissions || ROLE_PERMISSIONS[effectiveRole] || [];

  const hasPermission = (permission) => {
    if (perms.includes('*') && !isImpersonating) return true;
    if (isImpersonating) {
      const impPerms = ROLE_PERMISSIONS[effectiveRole] || [];
      if (impPerms.includes('*')) return true;
      return impPerms.includes(permission);
    }
    return perms.includes(permission);
  };

  const isOps = OPS_ROLES.has(effectiveRole);
  const isAdmin = effectiveRole === 'admin';

  const canAccessNav = (navItem) => {
    const visible = NAV_VISIBILITY[effectiveRole] || [];
    return visible.includes(navItem);
  };

  const getVisibleNavItems = () => {
    return NAV_VISIBILITY[effectiveRole] || [];
  };

  const getHomeRoute = () => {
    switch (effectiveRole) {
      case 'admin':
      case 'operations_manager':
        return '/dashboard';
      case 'rider':
        return '/rider';
      case 'cleaner':
        return '/cleaner';
      case 'maintenance':
        return '/maintenance';
      case 'client':
        return '/portal';
      default:
        return '/dashboard';
    }
  };

  return {
    role: effectiveRole,
    realRole,
    permissions: perms,
    hasPermission,
    isOps,
    isAdmin,
    isRealAdmin,
    isImpersonating,
    impersonatedRole,
    setImpersonatedRole,
    canAccessNav,
    getVisibleNavItems,
    getHomeRoute,
  };
};
