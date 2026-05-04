import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import type { UserRole } from '../types';

function normalizeUserRole(raw: unknown): UserRole {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (s === 'operator') return 'operator';
  if (s === 'vendedor') return 'vendedor';
  return 'admin';
}

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  role: UserRole;
  organizationId: string | null;
  organizationName: string | null;
  loading: boolean;
  /** true después de intentar cargar la org para el usuario de la sesión actual (evita pantalla de error antes del fetch). */
  organizationResolved: boolean;
  organizationMissing: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    opts: { farmName?: string; inviteCode?: string; fullName?: string }
  ) => Promise<{ error: Error | null; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  refreshOrganization: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Refuerza org + membresía si faltan (p. ej. trigger no aplicó o metadatos vacíos). */
async function ensureFarmOrganizationFromSession(userId: string) {
  const callRpc = async () => {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData.user || authData.user.id !== userId) return;

    const meta = (authData.user.user_metadata ?? {}) as Record<string, unknown>;
    const inviteRaw = String(meta.invite_code ?? meta.inviteCode ?? '').trim();
    const inviteNorm = inviteRaw ? inviteRaw.toUpperCase() : '';
    const farmRaw = String(meta.farm_name ?? meta.farmName ?? '').trim();

    const { error: rpcError } = await supabase.rpc('ensure_own_farm_organization', {
      p_farm_name: inviteNorm ? null : farmRaw || null,
      p_invite_code: inviteNorm || null,
    });
    return rpcError;
  };

  try {
    let rpcError = await callRpc();
    const msg = rpcError?.message ?? '';
    if (
      rpcError &&
      (/not_authenticated|JWT expired|Invalid JWT/i.test(msg) || rpcError.code === '401')
    ) {
      await new Promise((r) => window.setTimeout(r, 150));
      rpcError = await callRpc();
    }
    if (rpcError) {
      console.error('ensure_own_farm_organization:', rpcError);
    }
  } catch (e) {
    console.error('ensure_own_farm_organization:', e);
  }
}

// Función auxiliar para buscar la granja
async function fetchMembership(userId: string) {
  try {
    const { data, error } = await supabase
      .from('organization_members')
      .select('organization_id, organizations(name)')
      .eq('user_id', userId)
      .limit(1)
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
  const orgLoadSeq = useRef(0);
  const [organizationResolved, setOrganizationResolved] = useState(false);

  const loadOrganization = useCallback(async (userId: string) => {
    const seq = ++orgLoadSeq.current;
    setOrganizationResolved(false);
    try {
      await ensureFarmOrganizationFromSession(userId);
      const { organizationId: oid, organizationName: oname } = await fetchMembership(userId);
      if (seq !== orgLoadSeq.current) return;
      setOrganizationId(oid);
      setOrganizationName(oname);
      setOrganizationMissing(!oid);
    } catch (error) {
      console.error('Error loading organization:', error);
      if (seq !== orgLoadSeq.current) return;
      setOrganizationId(null);
      setOrganizationName(null);
      setOrganizationMissing(true);
    } finally {
      if (seq === orgLoadSeq.current) {
        setOrganizationResolved(true);
      }
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
        orgLoadSeq.current += 1;
        setRole('admin');
        setOrganizationId(null);
        setOrganizationName(null);
        setOrganizationMissing(false);
        setOrganizationResolved(false);
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
        orgLoadSeq.current += 1;
        setSession(null);
        setRole('admin');
        setOrganizationId(null);
        setOrganizationName(null);
        setOrganizationMissing(false);
        setOrganizationResolved(false);
      }
    };

    initSession();

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, [loadOrganization, loadRole]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? new Error(error.message) : null };
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, opts: { farmName?: string; inviteCode?: string; fullName?: string }) => {
      const invite = (opts.inviteCode?.trim() ?? '').toUpperCase();
      const farm = opts.farmName?.trim() ?? '';
      const fullName = opts.fullName?.trim() ?? '';
      const inviteInvalidMsg = 'Código de invitación inválido';

      if (invite) {
        const { data: inviteOk, error: rpcError } = await supabase.rpc('validate_invite_code', {
          p_code: invite,
        });
        if (rpcError) {
          console.error('validate_invite_code:', rpcError);
        } else if (inviteOk !== true) {
          return { error: new Error(inviteInvalidMsg), needsEmailConfirmation: false };
        }
      }

      const dataPayload: Record<string, string> = {};
      if (fullName) {
        dataPayload.full_name = fullName;
        dataPayload.fullName = fullName;
      }
      if (invite) {
        dataPayload.invite_code = invite;
        dataPayload.inviteCode = invite;
      } else if (farm) {
        dataPayload.farm_name = farm;
        dataPayload.farmName = farm;
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: dataPayload },
      });
      let err = error ? new Error(error.message) : null;
      if (
        err &&
        /INVITE_CODE_INVALID|invalid_invite_code|P0001|check_violation|23514|Database error saving new user/i.test(
          err.message
        )
      ) {
        err = new Error(inviteInvalidMsg);
      }

      if (!err && data.session && data.user) {
        const { error: setErr } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        if (setErr) {
          console.error('setSession after signUp:', setErr);
        }
        const { error: rpcError } = await supabase.rpc('ensure_own_farm_organization', {
          p_farm_name: invite ? null : farm || null,
          p_invite_code: invite || null,
        });
        if (rpcError) {
          console.error('ensure_own_farm_organization:', rpcError);
          err = new Error(
            rpcError.message ||
              'Tu cuenta se creó pero no pudimos vincular la granja. Usá «Reintentar» en la pantalla de error o iniciá sesión de nuevo.'
          );
        }
      }

      return { error: err, needsEmailConfirmation: !data.session };
    },
    []
  );

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
    loading, organizationResolved, organizationMissing, signIn, signUp, signOut, refreshOrganization
  }), [session, role, organizationId, organizationName, loading, organizationResolved, organizationMissing, signIn, signUp, signOut, refreshOrganization]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ESTA ES LA FUNCIÓN QUE TE FALTABA
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}
