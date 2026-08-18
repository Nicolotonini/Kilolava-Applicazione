import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from './components/ui/sonner';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { ThemeProvider } from './contexts/ThemeContext';

// Pages
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ClientsPage from './pages/ClientsPage';
import ClientDetailPage from './pages/ClientDetailPage';
import CalendarPage from './pages/CalendarPage';
import InventoryPage from './pages/InventoryPage';
import LogisticsPage from './pages/LogisticsPage';
import RiderViewPage from './pages/RiderViewPage';
import SettingsPage from './pages/SettingsPage';
import ActivityLogPage from './pages/ActivityLogPage';
import UsersPage from './pages/UsersPage';
import CleanerView from './pages/CleanerView';
import MaintenanceView from './pages/MaintenanceView';
import CleaningPage from './pages/CleaningPage';
import ChecklistTemplatesPage from './pages/ChecklistTemplatesPage';
import MaintenanceIssuesPage from './pages/MaintenanceIssuesPage';
import NotificationsPage from './pages/NotificationsPage';
import DocumentsPage from './pages/DocumentsPage';
import DocumentDetailPage from './pages/DocumentDetailPage';
import NewDocumentPage from './pages/NewDocumentPage';
import StructuresListPage from './pages/StructuresListPage';
import StructureDetailPage from './pages/StructureDetailPage';
import StructureInventoryPage from './pages/StructureInventoryPage';
import PrivateLaundryPage from './pages/PrivateLaundryPage';
import ReportsPage from './pages/ReportsPage';

// Portal Pages
import PortalDashboard from './pages/portal/PortalDashboard';
import PortalServices from './pages/portal/PortalServices';
import PortalOrders from './pages/portal/PortalOrders';
import NewOrderPage from './pages/portal/NewOrderPage';
import PortalHistory from './pages/portal/PortalHistory';
import PortalOrderDetail from './pages/portal/PortalOrderDetail';
import PortalReport from './pages/portal/PortalReport';

// Layout
import AppLayout from './components/layout/AppLayout';
import PortalLayout from './components/layout/PortalLayout';

// Maintenance Route Switch - renders different pages based on role
const MaintenanceRouteSwitch = () => {
  const { user } = useAuth();
  const effectiveRole = user?.role === 'manager' ? 'admin' : user?.role;
  
  if (effectiveRole === 'maintenance') {
    return <MaintenanceView />;
  }
  // Admin/ops_manager get the admin page wrapped in AppLayout
  return (
    <AppLayout>
      <MaintenanceIssuesPage />
    </AppLayout>
  );
};

// Role-based home route resolver
const getHomeRoute = (role) => {
  const r = role === 'manager' ? 'admin' : role;
  switch (r) {
    case 'rider': return '/rider';
    case 'client': return '/portal';
    case 'cleaner': return '/cleaner';
    case 'maintenance': return '/maintenance';
    default: return '/dashboard';
  }
};

// Public Route Component (redirects to dashboard if authenticated)
const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Caricamento...</div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={getHomeRoute(user?.role)} replace />;
  }

  return children;
};

// Role-restricted route - only allows specific roles
const RoleRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, loading, user } = useAuth();
  const effectiveRole = user?.role === 'manager' ? 'admin' : user?.role;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Caricamento...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(effectiveRole)) {
    return <Navigate to={getHomeRoute(user?.role)} replace />;
  }

  return children;
};

// Catch-all redirect that sends users to their home route
const CatchAllRedirect = () => {
  const { isAuthenticated, loading, user } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">Caricamento...</div></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={getHomeRoute(user?.role)} replace />;
};

function AppRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <RegisterPage />
          </PublicRoute>
        }
      />

      {/* Maintenance View - standalone mobile-first layout (MUST be before admin routes) */}
      <Route
        path="/maintenance"
        element={
          <RoleRoute allowedRoles={['maintenance', 'admin', 'operations_manager']}>
            <MaintenanceRouteSwitch />
          </RoleRoute>
        }
      />

      {/* Protected Routes - Backoffice (admin, operations_manager) */}
      <Route
        path="/"
        element={
          <RoleRoute allowedRoles={['admin', 'operations_manager']}>
            <AppLayout />
          </RoleRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="clients/:clientId" element={<ClientDetailPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="logistics" element={<LogisticsPage />} />
        <Route path="deliveries" element={<Navigate to="/logistics" replace />} />
        <Route path="structure-inventory" element={<StructureInventoryPage />} />
        <Route path="private-laundry/jobs" element={<PrivateLaundryPage view="jobs" />} />
        <Route path="private-laundry/history" element={<PrivateLaundryPage view="history" />} />
        <Route path="cleaning" element={<CleaningPage />} />
        <Route path="checklist-templates" element={<ChecklistTemplatesPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="activity" element={<ActivityLogPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="documents/new" element={<NewDocumentPage />} />
        <Route path="documents/:docId" element={<DocumentDetailPage />} />
        <Route path="structures" element={<StructuresListPage />} />
        <Route path="structures/new" element={<StructureDetailPage />} />
        <Route path="structures/:structureId" element={<StructureDetailPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      {/* Rider View - standalone mobile-first layout */}
      <Route
        path="/rider"
        element={
          <RoleRoute allowedRoles={['rider']}>
            <RiderViewPage />
          </RoleRoute>
        }
      />

      {/* Cleaner View - standalone mobile-first layout */}
      <Route
        path="/cleaner"
        element={
          <RoleRoute allowedRoles={['cleaner']}>
            <CleanerView />
          </RoleRoute>
        }
      />

      {/* Client Portal */}
      <Route
        path="/portal"
        element={
          <RoleRoute allowedRoles={['client']}>
            <PortalLayout />
          </RoleRoute>
        }
      >
        <Route index element={<PortalDashboard />} />
        <Route path="services" element={<PortalServices />} />
        <Route path="orders" element={<PortalOrders />} />
        <Route path="orders/new" element={<NewOrderPage />} />
        <Route path="orders/:orderId" element={<PortalOrderDetail />} />
        <Route path="history" element={<PortalHistory />} />
        <Route path="report" element={<PortalReport />} />
      </Route>

      {/* Catch all - redirect based on role */}
      <Route path="*" element={<CatchAllRedirect />} />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
            <Toaster position="top-right" richColors />
          </BrowserRouter>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;
