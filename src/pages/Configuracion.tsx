import React from 'react';
import type { User } from '@supabase/supabase-js';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import { useAuth } from '../contexts/AuthContext';
import { useRole } from '../hooks/useRole';
import { supabase } from '../services/supabase';
import type { UserRole } from '../types';

type MemberRow = {
  user_id: string;
  created_at: string;
  role: UserRole;
  full_name: string | null;
};

function shortUserId(id: string): string {
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function parseDbRole(raw: string | null | undefined): UserRole {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'operator') return 'operator';
  if (s === 'vendedor') return 'vendedor';
  return 'admin';
}

function resolveMemberDisplayName(
  member: MemberRow,
  sessionUserId: string | undefined,
  sessionUser: User | null
): string {
  const fromProfile = member.full_name?.trim();
  if (fromProfile) return fromProfile;
  if (member.user_id === sessionUserId && sessionUser?.user_metadata) {
    const meta = sessionUser.user_metadata as Record<string, unknown>;
    for (const key of ['full_name', 'fullName', 'name', 'display_name', 'displayName'] as const) {
      const v = meta[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  return `Usuario ${shortUserId(member.user_id)}`;
}

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Administrador',
  operator: 'Operario',
  vendedor: 'Vendedor',
};

export default function Configuracion() {
  const { organizationId, user: sessionUser, refreshOrganization } = useAuth();
  const { isAdmin } = useRole();
  const [members, setMembers] = React.useState<MemberRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [orgInviteCode, setOrgInviteCode] = React.useState<string | null>(null);
  const [inviteDefaultRole, setInviteDefaultRole] = React.useState<UserRole>('operator');
  const [inviteRoleBusy, setInviteRoleBusy] = React.useState(false);
  const [inviteLoading, setInviteLoading] = React.useState(false);
  const [inviteBusy, setInviteBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const loadOrgInviteCode = React.useCallback(async () => {
    if (!organizationId || !isAdmin) {
      setOrgInviteCode(null);
      return;
    }
    setInviteLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('organizations')
        .select('invite_code, invite_default_role')
        .eq('id', organizationId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      const row = data as { invite_code?: string; invite_default_role?: string } | null;
      setOrgInviteCode(row?.invite_code ?? null);
      setInviteDefaultRole(parseDbRole(row?.invite_default_role));
    } catch {
      setOrgInviteCode(null);
    } finally {
      setInviteLoading(false);
    }
  }, [organizationId, isAdmin]);

  React.useEffect(() => {
    void loadOrgInviteCode();
  }, [loadOrgInviteCode]);

  const saveInviteDefaultRole = async (next: UserRole) => {
    if (!organizationId) return;
    setInviteRoleBusy(true);
    setError('');
    try {
      const { error: upErr } = await supabase
        .from('organizations')
        .update({ invite_default_role: next })
        .eq('id', organizationId);
      if (upErr) throw upErr;
      setInviteDefaultRole(next);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo guardar el rol de invitación.';
      setError(msg);
    } finally {
      setInviteRoleBusy(false);
    }
  };

  const loadMembers = React.useCallback(async () => {
    if (!organizationId || !isAdmin) {
      setMembers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');

      const { data: memberships, error: membershipsError } = await supabase
        .from('organization_members')
        .select('user_id, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: true });

      if (membershipsError) throw membershipsError;

      const userIds = (memberships || []).map((m: { user_id: string }) => m.user_id);
      if (userIds.length === 0) {
        setMembers([]);
        return;
      }

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, role, full_name')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      const profileByUser = new Map<
        string,
        { role: UserRole; full_name: string | null }
      >(
        (profiles || []).map((p: { id: string; role: string; full_name?: string | null }) => [
          p.id,
          { role: parseDbRole(p.role), full_name: p.full_name ?? null },
        ])
      );

      setMembers(
        (memberships || []).map((m: { user_id: string; created_at: string }) => {
          const p = profileByUser.get(m.user_id);
          return {
            user_id: m.user_id,
            created_at: m.created_at,
            role: p?.role ?? 'admin',
            full_name: p?.full_name ?? null,
          };
        })
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo cargar la lista de usuarios.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [organizationId, isAdmin]);

  React.useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const updateRole = async (userId: string, role: UserRole) => {
    if (userId === sessionUser?.id && (role === 'operator' || role === 'vendedor')) {
      setError(
        'No podés quitarte el rol de administrador desde aquí: perderías acceso a Configuración y a la gestión de roles.'
      );
      return;
    }
    try {
      setError('');
      const { error: updateError } = await supabase.from('profiles').update({ role }).eq('id', userId);
      if (updateError) throw updateError;
      setMembers((prev) => prev.map((m) => (m.user_id === userId ? { ...m, role } : m)));
      if (userId === sessionUser?.id) {
        await refreshOrganization();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo actualizar el rol.';
      setError(msg);
    }
  };

  const copyInviteCode = async () => {
    if (!orgInviteCode) return;
    try {
      await navigator.clipboard.writeText(orgInviteCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('No se pudo copiar al portapapeles.');
    }
  };

  const randomInviteSuffix = () =>
    Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0');

  const regenerateInviteCode = async () => {
    if (!organizationId) return;
    setInviteBusy(true);
    setError('');
    try {
      const year = new Date().getFullYear();
      let lastErr: unknown = null;
      for (let i = 0; i < 10; i++) {
        const code = `GALLINAS-${year}-${randomInviteSuffix()}`;
        const { error: upErr } = await supabase
          .from('organizations')
          .update({ invite_code: code })
          .eq('id', organizationId);
        if (!upErr) {
          setOrgInviteCode(code);
          return;
        }
        lastErr = upErr;
      }
      throw lastErr ?? new Error('reintentos agotados');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo generar un código nuevo (¿ya existe?).';
      setError(msg);
    } finally {
      setInviteBusy(false);
    }
  };

  const removeUserAccess = async (userId: string) => {
    if (!organizationId) return;
    if (sessionUser?.id === userId) {
      setError('No podés eliminar tu propio acceso.');
      return;
    }
    if (!window.confirm('¿Seguro que querés quitar el acceso de este usuario a la granja?')) return;

    try {
      setError('');
      const { error: deleteError } = await supabase
        .from('organization_members')
        .delete()
        .eq('organization_id', organizationId)
        .eq('user_id', userId);
      if (deleteError) throw deleteError;
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo eliminar el acceso del usuario.';
      setError(msg);
    }
  };

  if (!isAdmin) {
    return (
      <Card padding="md">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Acceso denegado</h2>
        <p className="text-sm text-gray-600">Esta sección solo está disponible para administradores.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Configuración</h2>
        <p className="text-sm text-gray-600 mt-1">Granja, invitaciones y miembros del equipo.</p>
      </div>

      <Card padding="md">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Código de invitación</h3>
        <p className="text-sm text-gray-600 mb-4">
          Compartí este código para que otra persona cree su cuenta y se una a esta granja. El rol del
          invitado lo definís con el selector (se guarda en el servidor con la organización). Si regenerás el
          código, el anterior deja de valer.
        </p>
        {inviteLoading ? (
          <p className="text-sm text-gray-500">Cargando…</p>
        ) : orgInviteCode ? (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <code className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-lg font-mono tracking-wide text-gray-900 break-all">
                {orgInviteCode}
              </code>
              <div className="flex flex-wrap gap-2 shrink-0">
                <Button type="button" variant="secondary" size="sm" onClick={() => void copyInviteCode()}>
                  {copied ? 'Copiado' : 'Copiar'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={inviteBusy}
                  onClick={() => void regenerateInviteCode()}
                >
                  {inviteBusy ? 'Generando…' : 'Generar nuevo código'}
                </Button>
              </div>
            </div>
            <div className="max-w-md">
              <Select
                label="Rol del próximo registro con este código"
                options={[
                  { value: 'admin', label: 'Administrador (acceso completo)' },
                  {
                    value: 'operator',
                    label: 'Operario (producción y eventos; sin ventas ni gastos)',
                  },
                  {
                    value: 'vendedor',
                    label: 'Vendedor (clientes y ventas; producción y gallineros solo lectura)',
                  },
                ]}
                value={inviteDefaultRole}
                disabled={inviteRoleBusy}
                onChange={(e) => {
                  const v = e.target.value as UserRole;
                  if (v === 'admin' || v === 'operator' || v === 'vendedor') void saveInviteDefaultRole(v);
                }}
              />
              <p className="text-xs text-gray-500 mt-1.5">
                El valor se aplica en Supabase al validar el código (no hace falta que el invitado elija el rol
                en la app). No cambia cuentas ya creadas.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-amber-700">No se pudo cargar el código. Reintentá más tarde.</p>
        )}
      </Card>

      <Card padding="md">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900">Usuarios de la granja</h3>
          <Button type="button" variant="secondary" size="sm" onClick={loadMembers}>
            Recargar
          </Button>
        </div>
        {error && (
          <div className="p-3 mb-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">
            {error}
          </div>
        )}
        {loading ? (
          <p className="text-sm text-gray-500">Cargando usuarios…</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-gray-500">No hay usuarios para mostrar.</p>
        ) : (
          <div className="space-y-3">
            {members.map((member) => (
              <div
                key={member.user_id}
                className="p-3 rounded-lg border border-gray-200 bg-white flex flex-col md:flex-row md:items-center md:justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 truncate">
                    {resolveMemberDisplayName(member, sessionUser?.id, sessionUser ?? null)}
                  </p>
                </div>
                <div className="w-full md:w-auto flex flex-col sm:flex-row gap-2 md:items-center">
                  <div className="w-full sm:w-52">
                    <Select
                      label="Rol"
                      options={
                        member.user_id === sessionUser?.id
                          ? [{ value: 'admin', label: ROLE_LABEL.admin }]
                          : [
                              { value: 'admin', label: ROLE_LABEL.admin },
                              { value: 'operator', label: ROLE_LABEL.operator },
                              { value: 'vendedor', label: ROLE_LABEL.vendedor },
                            ]
                      }
                      value={member.role}
                      onChange={(e) => updateRole(member.user_id, e.target.value as UserRole)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    className="shrink-0"
                    onClick={() => removeUserAccess(member.user_id)}
                    disabled={sessionUser?.id === member.user_id}
                    title={
                      sessionUser?.id === member.user_id
                        ? 'No podés eliminar tu propio acceso'
                        : 'Quitar acceso'
                    }
                  >
                    Quitar acceso
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
