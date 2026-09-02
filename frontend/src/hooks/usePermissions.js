import { useAuth } from '../contexts/AuthContext';
import { useState, useEffect, useCallback } from 'react';

// Specchio esatto della matrice backend ROLE_PERMISSIONS (server.py) — fonte di verità: backend.
// Il backend invia user.permissions (ruolo + extra_roles unificati); questa copia serve solo
// per l'anteprima "Visualizza come" (impersonation) e come fallback.
const ROLE_PERMISSIONS = {
  admin: ['*'],
  operations_manager: [
    'clients.read', 'clients.write', 'structures.read', 'structures.write',
    'units.read', 'units.write', 'calendar.read', 'calendar.write',
    'cleaning.read', 'cleaning.write', 'keys.read', 'keys.write',
    'logistics.read', 'logistics.write', 'inventory.read', 'inventory.write',
    'orders.read', 'orders.write', 'segnalazioni.read', 'segnalazioni.write',
    'maintenance.read', 'maintenance.write', 'laundry.read', 'laundry.write',
    'users.read', 'map.read', 'reports.read', 'automation.read', 'automation.write',
    'portal_ops.read', 'portal_ops.write',
  ],
  cleaner: ['tasks.own.read', 'tasks.own.write', 'keys.own.read', 'keys.own.write', 'segnalazioni.own.write'],
  rider: ['logistics.own.read', 'logistics.own.write', 'keys.own.read', 'keys.own.write', 'segnalazioni.own.write'],
  maintenance: ['maintenance.own.read', 'maintenance.own.write', 'segnalazioni.own.write'],
  laundry: ['laundry.own.read', 'laundry.own.write', 'segnalazioni.own.write'],
  client: ['portal.read', 'portal.write'],
};

const OPS_ROLES = new Set(['admin', 'operations_manager']);

// Funzioni tecniche riservate al Super Admin (secrets, integrazioni, impostazioni di sistema)
const ADMIN_ONLY_NAV = ['settings', 'integrations'];

const NAV_KEYS = [
  'dashboard', 'mappa', 'assistant', 'calendar', 'clients', 'structures', 'cleaning', 'cleaning-overview', 'cleaning-organize', 'segnalazioni',
  'structure-inventory', 'keys', 'deliveries',
  'consegne-overview', 'consegne-definizione', 'consegne-giro', 'consegne-storico',
  'ms-overview', 'ms-noleggio', 'ms-forniture', 'ms-pulizie', 'ms-movimenti',
  'mg-overview', 'mg-noleggio', 'mg-forniture', 'mg-pulizie', 'mg-zaini', 'mg-movimenti', 'cataloghi-prodotti', 'kit',
  'pl-jobs', 'pl-history',
  'maintenance', 'documents', 'reports', 'users', 'activity', 'settings', 'integrations',
  // legacy keys kept for compatibility
  'inventory', 'logistics',
];

const NAV_VISIBILITY = {
  admin: NAV_KEYS,
  // Responsabile Generale: operatività completa, MAI funzioni tecniche Admin-only
  operations_manager: NAV_KEYS.filter((k) => !ADMIN_ONLY_NAV.includes(k)),
  cleaner: [],
  rider: [],
  maintenance: [],
  laundry: ['pl-jobs'],
  client: [],
};

// Aree operative mobile-first per ruolo (home dedicate): un utente multi-ruolo le vede tutte in unione
export const ROLE_AREAS = {
  cleaner: { key: 'cleaner', label: 'Pulizie', path: '/cleaner' },
  rider: { key: 'rider', label: 'Consegne', path: '/rider' },
  maintenance: { key: 'maintenance', label: 'Manutenzioni', path: '/maintenance' },
  laundry: { key: 'laundry', label: 'Lavanderia', path: '/private-laundry/jobs' },
};

// Percorsi consentiti dentro il backoffice (AppLayout) per i ruoli NON ops, in unione sui ruoli effettivi
const ROLE_ALLOWED_PATHS = {
  laundry: ['/private-laundry/jobs'],
};

const IMPERSONATION_KEY = 'kilolava_impersonate_role';

export const ROLE_LABELS = {
  admin: 'Super Admin',
  operations_manager: 'Responsabile Generale',
  cleaner: 'Pulizie',
  rider: 'Rider',
  maintenance: 'Manutentore',
  laundry: 'Lavanderia',
  client: 'Cliente',
};

export const INTERNAL_ROLES = ['admin', 'operations_manager', 'cleaner', 'rider', 'maintenance', 'laundry'];
export const ALL_ROLES = ['admin', 'operations_manager', 'cleaner', 'rider', 'maintenance', 'laundry', 'client'];

const unionFor = (map, roles) => {
  const out = [];
  roles.forEach((r) => (map[r] || []).forEach((k) => { if (!out.includes(k)) out.push(k); }));
  return out;
};

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
  const extraRoles = isImpersonating ? [] : (user?.extra_roles || []);
  // Ruoli effettivi = principale + extra_roles (una persona = un account); l'impersonation NON eredita privilegi
  const effectiveRoles = [effectiveRole, ...extraRoles.filter((r) => r !== effectiveRole)];
  const hasRole = (r) => effectiveRoles.includes(r);

  const visibleNavKeys = unionFor(NAV_VISIBILITY, effectiveRoles);
  const canAccessNav = (navItem) => visibleNavKeys.includes(navItem);
  const getVisibleNavItems = () => visibleNavKeys;

  // Aree operative raggiungibili (home mobile-first) in unione sui ruoli effettivi
  const operativeAreas = effectiveRoles.map((r) => ROLE_AREAS[r]).filter(Boolean);
  const allowedBackofficePaths = isOps ? null : unionFor(ROLE_ALLOWED_PATHS, effectiveRoles);

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
      case 'laundry':
        return '/private-laundry/jobs';
      case 'client':
        return '/portal';
      default:
        return '/dashboard';
    }
  };

  return {
    role: effectiveRole,
    realRole,
    extraRoles,
    effectiveRoles,
    hasRole,
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
    operativeAreas,
    allowedBackofficePaths,
  };
};
