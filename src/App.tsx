import React from 'react';
import { Page, type UserRole } from './types';
import { useAuth } from './contexts/AuthContext';
import AuthScreen from './components/auth/AuthScreen';
import Sidebar from './components/layout/Sidebar';
import AppHeader from './components/layout/AppHeader';
import Dashboard from './pages/Dashboard';
import Gallineros from './pages/Gallineros';
import Produccion from './pages/Produccion';
import Ventas from './pages/Ventas';
import Clientes from './pages/Clientes';
import Gastos from './pages/Gastos';
import Eventos from './pages/Eventos';
import Estadisticas from './pages/Estadisticas';
import Configuracion from './pages/Configuracion';
import Button from './components/ui/Button';
import { Loader2 } from 'lucide-react';
import { canAccessPage } from './hooks/useRole';
import { DashboardMetricsRefreshProvider } from './contexts/DashboardMetricsRefreshContext';

function normalizeAppRole(raw: unknown): UserRole {
  const s = String(raw ?? 'admin')
    .trim()
    .toLowerCase();
  if (s === 'operator') return 'operator';
  if (s === 'vendedor') return 'vendedor';
  return 'admin';
}

function AppShell() {
  const [currentPage, setCurrentPage] = React.useState<Page>('dashboard');
  const [selectedGallineroId, setSelectedGallineroId] = React.useState<string | null>(null);
  const { role: profileRole } = useAuth();
  const accessRole = normalizeAppRole(profileRole);

  React.useEffect(() => {
    if (!canAccessPage(accessRole, currentPage)) {
      setCurrentPage('dashboard');
    }
  }, [currentPage, accessRole]);

  const handleRegisterProduction = (gallineroId: string) => {
    setSelectedGallineroId(gallineroId);
    setCurrentPage('produccion');
  };

  const renderPage = () => {
    const pageProps = {
      selectedGallineroId,
    };

    switch (currentPage) {
      case 'dashboard':
        return <Dashboard {...pageProps} />;
      case 'gallineros':
        return <Gallineros onRegisterProduction={handleRegisterProduction} />;
      case 'produccion':
        return <Produccion {...pageProps} />;
      case 'ventas':
        return <Ventas />;
      case 'clientes':
        return <Clientes />;
      case 'gastos':
        return <Gastos />;
      case 'eventos':
        return <Eventos {...pageProps} />;
      case 'estadisticas':
        return <Estadisticas />;
      case 'configuracion':
        return <Configuracion />;
      default:
        return <Dashboard {...pageProps} />;
    }
  };

  return (
    <DashboardMetricsRefreshProvider>
      <div className="flex h-screen bg-gray-100">
        <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
        <div className="flex-1 flex flex-col overflow-hidden lg:ml-0 ml-0">
          <AppHeader selectedGallineroId={selectedGallineroId} onGallineroChange={setSelectedGallineroId} />
          <main className="flex-1 overflow-auto">
            <div className="p-6 lg:p-8">{renderPage()}</div>
          </main>
        </div>
      </div>
    </DashboardMetricsRefreshProvider>
  );
}

function App() {
  const {
    session,
    loading,
    organizationId,
    organizationMissing,
    organizationResolved,
    refreshOrganization,
    signOut,
  } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#1a2f1f] text-lime-100">
        <Loader2 className="animate-spin text-lime-400" size={40} />
        <p className="text-sm text-lime-200/80">Conectando con tu granja…</p>
      </div>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  if (!organizationResolved) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#1a2f1f] text-lime-100">
        <Loader2 className="animate-spin text-lime-400" size={40} />
        <p className="text-sm text-lime-200/80">Conectando con tu granja…</p>
      </div>
    );
  }

  if (organizationMissing || !organizationId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-100">
        <div className="max-w-md w-full rounded-2xl border border-amber-200 bg-white p-8 shadow-lg space-y-4 text-center">
          <h2 className="text-xl font-bold text-gray-900">No encontramos tu organización</h2>
          <p className="text-sm text-gray-600">
            Tu cuenta está activa pero no hay una granja vinculada. Si acabas de confirmar el correo,
            espera unos segundos y reintenta. Si tenías datos antiguos sin usuario, un administrador debe
            vincular tu cuenta a una organización en Supabase.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
            <Button variant="primary" onClick={() => refreshOrganization()}>
              Reintentar
            </Button>
            <Button variant="secondary" onClick={() => signOut()}>
              Cerrar sesión
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <AppShell />;
}

export default App;
