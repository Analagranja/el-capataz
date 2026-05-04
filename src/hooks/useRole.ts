import { useEffect, useState } from 'react';
import { Page, UserRole } from '../types';
import { useAuth } from '../contexts/AuthContext';

const ROLE_VIEW_OVERRIDE_KEY = 'temporary_role_view_override';
const ROLE_VIEW_CHANGED_EVENT = 'temporary-role-view-changed';

const OPERATOR_BLOCKED_PAGES: Page[] = [
  'ventas',
  'gastos',
  'clientes',
  'estadisticas',
  'configuracion',
];
const VENDEDOR_BLOCKED_PAGES: Page[] = ['gastos', 'estadisticas', 'configuracion'];

function readRoleOverride(): UserRole | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(ROLE_VIEW_OVERRIDE_KEY);
  if (raw === 'admin' || raw === 'operator' || raw === 'vendedor') return raw;
  return null;
}

/** Navegación lateral por rol (RBAC). */
export function canAccessPage(role: UserRole, page: Page): boolean {
  if (role === 'admin') return true;
  if (role === 'operator') return !OPERATOR_BLOCKED_PAGES.includes(page);
  if (role === 'vendedor') return !VENDEDOR_BLOCKED_PAGES.includes(page);
  return false;
}

/** Gallineros: crear / editar / eliminar estructuras (solo admin). */
export function canManageCoops(role: UserRole): boolean {
  return role === 'admin';
}

/** Producción: registrar recolecciones, bolsas, editar o borrar registros (admin y operario). */
export function canLogProduction(role: UserRole): boolean {
  return role === 'admin' || role === 'operator';
}

export function useRole() {
  const { role: actualRole } = useAuth();
  const [roleViewOverride, setRoleViewOverride] = useState<UserRole | null>(() => readRoleOverride());
  const role = roleViewOverride ?? actualRole;
  const isAdmin = role === 'admin';
  const isOperator = role === 'operator';
  const isVendedor = role === 'vendedor';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncFromStorage = () => setRoleViewOverride(readRoleOverride());
    window.addEventListener('storage', syncFromStorage);
    window.addEventListener(ROLE_VIEW_CHANGED_EVENT, syncFromStorage as EventListener);
    return () => {
      window.removeEventListener('storage', syncFromStorage);
      window.removeEventListener(ROLE_VIEW_CHANGED_EVENT, syncFromStorage as EventListener);
    };
  }, []);

  const setTemporaryRoleView = (next: UserRole | null) => {
    if (typeof window === 'undefined') return;
    if (!next) {
      window.localStorage.removeItem(ROLE_VIEW_OVERRIDE_KEY);
    } else {
      window.localStorage.setItem(ROLE_VIEW_OVERRIDE_KEY, next);
    }
    window.dispatchEvent(new Event(ROLE_VIEW_CHANGED_EVENT));
    setRoleViewOverride(next);
  };

  return {
    role,
    actualRole,
    roleViewOverride,
    isAdmin,
    isOperator,
    isVendedor,
    setTemporaryRoleView,
    canAccessPage: (page: Page) => canAccessPage(role, page),
    canManageCoops: () => canManageCoops(role),
    canLogProduction: () => canLogProduction(role),
  };
}
