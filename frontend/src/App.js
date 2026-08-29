import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useSearchParams, useParams } from 'react-router-dom';
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
import RiderViewPage from './pages/RiderViewPage';
import ConsegnePanoramicaPage from './pages/consegne/ConsegnePanoramicaPage';
import DaOrganizzarePage from './pages/consegne/DaOrganizzarePage';
import OrganizzazionePage from './pages/consegne/OrganizzazionePage';
import ConsegneOggiPage from './pages/consegne/ConsegneOggiPage';
import ConsegneStoricoPage from './pages/consegne/ConsegneStoricoPage';
import FermataDetailPage from './pages/consegne/FermataDetailPage';
import SettingsPage from './pages/SettingsPage';
import MappaOperativaPage from './pages/MappaOperativaPage';
import ActivityLogPage from './pages/ActivityLogPage';
import UsersPage from './pages/UsersPage';
import IntegrationsPage from './pages/IntegrationsPage';
import CleanerView from './pages/CleanerView';
import MaintenanceView from './pages/MaintenanceView';
import CleaningPage from './pages/CleaningPage';
import CleaningOrganizePage from './pages/CleaningOrganizePage';
import CleaningTaskDetailPage from './pages/cleaning/CleaningTaskDetailPage';
import MaintenanceIssueDetailPage from './pages/MaintenanceIssueDetailPage';
import SegnalazioniPage from './pages/segnalazioni/SegnalazioniPage';
import SegnalazioneDetailPage from './pages/segnalazioni/SegnalazioneDetailPage';
import ChecklistTemplatesPage from './pages/ChecklistTemplatesPage';
import MaintenanceIssuesPage from './pages/MaintenanceIssuesPage';
import NotificationsPage from './pages/NotificationsPage';
import DocumentsPage from './pages/DocumentsPage';
import DocumentDetailPage from './pages/DocumentDetailPage';
import NewDocumentPage from './pages/NewDocumentPage';
import StructuresListPage from './pages/StructuresListPage';
import StructureDetailPage from './pages/StructureDetailPage';
import StruttureOverviewPage from './pages/magazzino/StruttureOverviewPage';
import GeneraleOverviewPage from './pages/magazzino/GeneraleOverviewPage';
import CentralStockPage from './pages/magazzino/CentralStockPage';
import KitPulizieListPage from './pages/magazzino/KitPulizieListPage';
import KitPulizieDetailPage from './pages/magazzino/KitPulizieDetailPage';
import NoleggioPage from './pages/magazzino/NoleggioPage';
import NoleggioDetailPage from './pages/magazzino/NoleggioDetailPage';
import FornitureListPage from './pages/magazzino/FornitureListPage';
import FornitureDetailPage from './pages/magazzino/FornitureDetailPage';
import ZainiPage from './pages/magazzino/ZainiPage';
import ZainoDetailPage from './pages/magazzino/ZainoDetailPage';
import MovimentiPage from './pages/magazzino/MovimentiPage';
import CataloghiKitPage from './pages/magazzino/CataloghiKitPage';
import LavorazioniPage from './pages/lavanderia/LavorazioniPage';
import LavanderiaStoricoPage from './pages/lavanderia/LavanderiaStoricoPage';
import KeysPage from './pages/KeysPage';
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

// Legacy: /structure-inventory → nuovo sistema Magazzino
const StructureInventoryRedirect = () => {
  const [params] = useSearchParams();
  const sid = params.get('structure_id');
  return <Navigate to={sid ? `/magazzino-strutture/noleggio/${sid}` : '/magazzino-strutture'} replace />;
};

const LegacyDetailRedirect = ({ base }) => {
  const params = useParams();
  return <Navigate to={`${base}/${params.id}`} replace />;
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
        <Route path="consegne" element={<ConsegnePanoramicaPage />} />
        <Route path="mappa" element={<MappaOperativaPage />} />
        <Route path="consegne/da-organizzare" element={<DaOrganizzarePage />} />
        <Route path="consegne/organizzazione" element={<OrganizzazionePage />} />
        <Route path="consegne/oggi" element={<ConsegneOggiPage />} />
        <Route path="consegne/storico" element={<ConsegneStoricoPage />} />
        <Route path="consegne/fermata/:fermataId" element={<FermataDetailPage />} />
        <Route path="logistics" element={<Navigate to="/consegne" replace />} />
        <Route path="logistics/:id" element={<LegacyDetailRedirect base="/consegne/fermata" />} />
        <Route path="maintenance/issue/:issueId" element={<MaintenanceIssueDetailPage />} />
        <Route path="cleaning/task/:taskId" element={<CleaningTaskDetailPage />} />
        <Route path="deliveries" element={<Navigate to="/consegne" replace />} />
        <Route path="structure-inventory" element={<StructureInventoryRedirect />} />
        <Route path="magazzino-strutture" element={<StruttureOverviewPage />} />
        <Route path="magazzino-strutture/noleggio" element={<NoleggioPage />} />
        <Route path="magazzino-strutture/noleggio/:structureId" element={<NoleggioDetailPage />} />
        <Route path="magazzino-strutture/forniture" element={<FornitureListPage />} />
        <Route path="magazzino-strutture/forniture/:structureId" element={<FornitureDetailPage />} />
        <Route path="magazzino-strutture/kit-pulizie" element={<KitPulizieListPage />} />
        <Route path="magazzino-strutture/kit-pulizie/:structureId" element={<KitPulizieDetailPage />} />
        <Route path="magazzino-strutture/movimenti" element={<MovimentiPage scope="strutture" />} />
        <Route path="magazzino-generale" element={<GeneraleOverviewPage />} />
        <Route path="magazzino-generale/noleggio" element={<CentralStockPage domain="noleggio" />} />
        <Route path="magazzino-generale/forniture" element={<CentralStockPage domain="forniture" />} />
        <Route path="magazzino-generale/pulizie" element={<CentralStockPage domain="pulizie" />} />
        <Route path="magazzino-generale/zaini" element={<ZainiPage />} />
        <Route path="magazzino-generale/zaini/:zainoId" element={<ZainoDetailPage />} />
        <Route path="magazzino-generale/movimenti" element={<MovimentiPage scope="generale" />} />
        <Route path="magazzino" element={<Navigate to="/magazzino-strutture" replace />} />
        <Route path="magazzino/noleggio" element={<Navigate to="/magazzino-strutture/noleggio" replace />} />
        <Route path="magazzino/noleggio/:id" element={<LegacyDetailRedirect base="/magazzino-strutture/noleggio" />} />
        <Route path="magazzino/forniture" element={<Navigate to="/magazzino-strutture/forniture" replace />} />
        <Route path="magazzino/forniture/:id" element={<LegacyDetailRedirect base="/magazzino-strutture/forniture" />} />
        <Route path="magazzino/pulizie" element={<Navigate to="/magazzino-strutture/kit-pulizie" replace />} />
        <Route path="magazzino/pulizie/:id" element={<LegacyDetailRedirect base="/magazzino-strutture/kit-pulizie" />} />
        <Route path="magazzino/zaini" element={<Navigate to="/magazzino-generale/zaini" replace />} />
        <Route path="magazzino/zaini/:id" element={<LegacyDetailRedirect base="/magazzino-generale/zaini" />} />
        <Route path="magazzino/movimenti" element={<Navigate to="/magazzino-strutture/movimenti" replace />} />
        <Route path="cataloghi-kit" element={<CataloghiKitPage />} />
        <Route path="keys" element={<KeysPage />} />
        <Route path="private-laundry/jobs" element={<LavorazioniPage />} />
        <Route path="private-laundry/history" element={<LavanderiaStoricoPage />} />
        <Route path="cleaning" element={<CleaningPage />} />
        <Route path="cleaning-organize" element={<CleaningOrganizePage />} />
        <Route path="segnalazioni" element={<SegnalazioniPage />} />
        <Route path="segnalazioni/:segId" element={<SegnalazioneDetailPage />} />
        <Route path="cleaning-issues" element={<Navigate to="/segnalazioni" replace />} />
        <Route path="checklist-templates" element={<ChecklistTemplatesPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="integrations" element={<IntegrationsPage />} />
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
