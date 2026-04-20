import { useEffect, useState } from 'react';
import { Page, UserRole } from '../types';
import { useAuth } from '../contexts/AuthContext';

const OPERATOR_BLOCKED_PAGES: Page[] = ['ventas', 'clientes', 'gastos', 'estadisticas', 'configuracion'];
const ROLE_VIEW_OVERRIDE_KEY = 'temporary_role_view_override';
const ROLE_VIEW_CHANGED_EVENT = 'temporary-role-view-changed';

function readRoleOverride(): UserRole | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(ROLE_VIEW_OVERRIDE_KEY);
  if (raw === 'admin' || raw === 'operator') return raw;
  return null;
}

export function canAccessPage(role: UserRole, page: Page): boolean {
  if (role === 'admin') return true;
  return !OPERATOR_BLOCKED_PAGES.includes(page);
}

export function useRole() {
  const { role: actualRole } = useAuth();
  const [roleViewOverride, setRoleViewOverride] = useState<UserRole | null>(() => readRoleOverride());
  const role = roleViewOverride ?? actualRole;
  const isAdmin = role === 'admin';
  const isOperator = role === 'operator';

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
    setTemporaryRoleView,
    canAccessPage: (page: Page) => canAccessPage(role, page),
  };
}
