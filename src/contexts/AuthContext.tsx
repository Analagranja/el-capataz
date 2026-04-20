import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import type { UserRole } from '../types';

function normalizeUserRole(raw: unknown): UserRole {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  return s === 'operator' ? 'operator' : 'admin';
}

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  role: UserRole;
  organizationId: string | null;
  organizationName: string | null;
  loading: boolean;
  organizationMissing: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, farmName: string) => Promise<{ error: Error | null; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  refreshOrganization: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Función auxiliar para buscar la granja
async function fetchMembership(userId: string) {
  try {
    const { data, error } = await supabase
      .from('organization_members')
      .select('organization_id, organizations(name)')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return { organizationId: null, organizationName: null };

    const row = data as any;
    return { 
      organizationId: row.organization_id, 
      organizationName: row.organizations?.name || 'Mi Granja' 
    };
  } catch (e) {
    return { organizationId: null, organizationName: null };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole>('admin');
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState<string | null>(null);
  const [loading] = useState(false);
  const [organizationMissing, setOrganizationMissing] = useState(false);
  /** Evita aplicar rol de una petición obsoleta (logout, Strict Mode, cambio de usuario). */
  const roleLoadSeq = useRef(0);

  const loadOrganization = useCallback(async (userId: string) => {
    try {
      const { organizationId: oid, organizationName: oname } = await fetchMembership(userId);
      setOrganizationId(oid);
      setOrganizationName(oname);
      setOrganizationMissing(!oid);
    } catch (error) {
      console.error('Error loading organization:', error);
      setOrganizationId(null);
      setOrganizationName(null);
      setOrganizationMissing(true);
    }
  }, []);

  const loadRole = useCallback(async (userId: string) => {
    const seq = ++roleLoadSeq.current;
    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr || authData.user?.id !== userId || seq !== roleLoadSeq.current) {
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

      const { data: sessionWrap } = await supabase.auth.getSession();
      if (sessionWrap.session?.user?.id !== userId || seq !== roleLoadSeq.current) {
        return;
      }

      if (error) {
        setRole('admin');
        return;
      }

      if (!data) {
        setRole('admin');
        return;
      }

      setRole(normalizeUserRole((data as { role?: unknown }).role));
    } catch {
      if (seq === roleLoadSeq.current) {
        setRole('admin');
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) return;

      setSession(nextSession);
      if (nextSession?.user) {
        void loadOrganization(nextSession.user.id);
        void loadRole(nextSession.user.id);
      } else {
        roleLoadSeq.current += 1;
        setRole('admin');
        setOrganizationId(null);
        setOrganizationName(null);
        setOrganizationMissing(false);
      }
    });

    // Carga inicial no bloqueante: si tarda/falla, la app sigue.
    const initSession = async () => {
      try {
        const timeoutSession = new Promise<null>((resolve) => {
          window.setTimeout(() => resolve(null), 1500);
        });
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          timeoutSession,
        ]);

        if (cancelled) return;

        if (!sessionResult || !('data' in sessionResult)) {
          return;
        }

        const { data: { session: s } } = sessionResult;
        setSession(s);
        if (s?.user) {
          void loadOrganization(s.user.id);
          void loadRole(s.user.id);
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Error getting initial session:', error);
        roleLoadSeq.current += 1;
        setSession(null);
        setRole('admin');
        setOrganizationId(null);
        setOrganizationName(null);
        setOrganizationMissing(false);
      }
    };

    initSession();

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, [loadOrganization, loadRole]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? new Error(error.message) : null };
  }, []);

  const signUp = useCallback(async (email: string, password: string, farmName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email, password, options: { data: { farm_name: farmName } }
    });
    return { error: error ? new Error(error.message) : null, needsEmailConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const refreshOrganization = useCallback(async () => {
    if (session?.user) {
      await loadOrganization(session.user.id);
      await loadRole(session.user.id);
    }
  }, [session, loadOrganization, loadRole]);

  const value = useMemo(() => ({
    session, user: session?.user ?? null, role, organizationId, organizationName,
    loading, organizationMissing, signIn, signUp, signOut, refreshOrganization
  }), [session, role, organizationId, organizationName, loading, organizationMissing, signIn, signUp, signOut, refreshOrganization]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ESTA ES LA FUNCIÓN QUE TE FALTABA
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}
