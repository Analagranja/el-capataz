import React from 'react';
import {
  Home,
  Layers,
  TrendingUp,
  ShoppingCart,
  Contact,
  AlertCircle,
  BarChart3,
  Menu,
  X,
  LogOut,
  Wallet,
  Settings,
} from 'lucide-react';
import { Page, type UserRole } from '../../types';
import { useAuth } from '../../contexts/AuthContext';

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

/** Rol efectivo del perfil en Supabase (AuthContext carga `profiles.role`; siempre minúsculas). */
function normalizeMenuRole(raw: unknown): UserRole {
  const s = String(raw ?? 'admin')
    .trim()
    .toLowerCase();
  if (s === 'operator') return 'operator';
  if (s === 'vendedor') return 'vendedor';
  return 'admin';
}

/** Menú lateral según rol real — sin vista temporal ni overrides (solo RBAC). */
function showMenuItemForRole(pageId: Page, userRole: UserRole): boolean {
  if (userRole === 'admin') return true;
  if (userRole === 'operator') {
    return !['ventas', 'clientes', 'gastos', 'estadisticas', 'configuracion'].includes(pageId);
  }
  if (userRole === 'vendedor') {
    return !['gastos', 'estadisticas', 'configuracion'].includes(pageId);
  }
  return true;
}

export default function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { signOut, role: profileRoleFromDb } = useAuth();
  const userRole = normalizeMenuRole(profileRoleFromDb);

  const menuItems: { id: Page; label: string; icon: typeof Home }[] = [
    { id: 'dashboard', label: 'Panel', icon: Home },
    { id: 'gallineros', label: 'Gallineros', icon: Layers },
    { id: 'produccion', label: 'Producción', icon: TrendingUp },
    { id: 'ventas', label: 'Ventas', icon: ShoppingCart },
    { id: 'clientes', label: 'Clientes', icon: Contact },
    { id: 'gastos', label: 'Gastos', icon: Wallet },
    { id: 'eventos', label: 'Eventos', icon: AlertCircle },
    { id: 'estadisticas', label: 'Estadísticas', icon: BarChart3 },
    { id: 'configuracion', label: 'Configuración', icon: Settings },
  ];
  const visibleMenuItems = menuItems.filter((item) => showMenuItemForRole(item.id, userRole));

  const handleNavigate = (page: Page) => {
    onNavigate(page);
    setIsOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 left-4 z-40 lg:hidden p-2 rounded-lg bg-blue-600 text-white"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      <aside
        className={`fixed left-0 top-0 h-screen w-64 bg-gray-900 text-white pt-20 lg:pt-0 transform transition-transform duration-300 z-30 lg:relative lg:transform-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <nav className="p-4 flex flex-col h-[calc(100vh-5rem)] lg:h-full">
          <div className="space-y-2 flex-1">
            {visibleMenuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigate(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  <Icon size={20} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              signOut();
            }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors mt-4 border-t border-gray-800 pt-4"
          >
            <LogOut size={20} />
            <span>Cerrar sesión</span>
          </button>
        </nav>
      </aside>
    </>
  );
}
