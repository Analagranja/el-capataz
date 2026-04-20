import React from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Input from '../components/ui/Input';
import { useAuth } from '../contexts/AuthContext';
import { useRole } from '../hooks/useRole';
import { supabase } from '../services/supabase';
import type { UserRole } from '../types';

type MemberRow = {
  user_id: string;
  created_at: string;
  role: UserRole;
  email: string;
};

export default function Configuracion() {
  const { organizationId, user, refreshOrganization } = useAuth();
  const { isAdmin } = useRole();
  const [members, setMembers] = React.useState<MemberRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [inviteEmail, setInviteEmail] = React.useState('');

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

      const userIds = (memberships || []).map((m: any) => m.user_id);
      if (userIds.length === 0) {
        setMembers([]);
        return;
      }

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, role, email')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      const roleByUser = new Map<string, UserRole>(
        (profiles || []).map((p: any) => [p.id, p.role === 'operator' ? 'operator' : 'admin'])
      );
      const emailByUser = new Map<string, string>(
        (profiles || []).map((p: any) => [p.id, p.email || ''])
      );

      setMembers(
        (memberships || []).map((m: any) => ({
          user_id: m.user_id,
          created_at: m.created_at,
          role: roleByUser.get(m.user_id) || 'admin',
          email: emailByUser.get(m.user_id) || '',
        }))
      );
    } catch (err: any) {
      setError(err?.message || 'No se pudo cargar la lista de usuarios.');
    } finally {
      setLoading(false);
    }
  }, [organizationId, isAdmin]);

  React.useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const updateRole = async (userId: string, role: UserRole) => {
    if (userId === user?.id && role === 'operator') {
      setError('No podés cambiarte a operador: perderías acceso a Ventas, Gastos y Estadísticas.');
      return;
    }
    try {
      setError('');
      const { error: updateError } = await supabase.from('profiles').update({ role }).eq('id', userId);
      if (updateError) throw updateError;
      setMembers((prev) => prev.map((m) => (m.user_id === userId ? { ...m, role } : m)));
      if (userId === user?.id) {
        await refreshOrganization();
      }
    } catch (err: any) {
      setError(err?.message || 'No se pudo actualizar el rol.');
    }
  };

  const removeUserAccess = async (userId: string) => {
    if (!organizationId) return;
    if (user?.id === userId) {
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
    } catch (err: any) {
      setError(err?.message || 'No se pudo eliminar el acceso del usuario.');
    }
  };

  if (!isAdmin) {
    return (
      <Card padding="md">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Acceso Denegado</h2>
        <p className="text-sm text-gray-600">
          Esta sección solo está disponible para administradores.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-gray-900">Configuración</h2>

      <Card padding="md">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Invitar usuario</h3>
        <p className="text-sm text-gray-600 mb-4">
          Próximo paso: enviar invitación por correo y asignar rol inicial.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="correo@ejemplo.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <Button type="button" variant="secondary" disabled>
            Invitar
          </Button>
        </div>
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
          <p className="text-sm text-gray-500">Cargando usuarios...</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-gray-500">No hay usuarios para mostrar.</p>
        ) : (
          <div className="space-y-3">
            {members.map((member) => (
              <div
                key={member.user_id}
                className="p-3 rounded-lg border border-gray-200 bg-white flex flex-col md:flex-row md:items-center md:justify-between gap-3"
              >
                <div>
                  <p className="font-medium text-gray-900">{member.email || member.user_id}</p>
                  <p className="text-xs text-gray-500">
                    Alta: {new Date(member.created_at).toLocaleDateString('es-CR')}
                  </p>
                </div>
                <div className="w-full md:w-auto flex flex-col md:flex-row gap-2 md:items-end">
                  <div className="w-full md:w-56">
                    <Select
                      label="Rol"
                      options={
                        member.user_id === user?.id
                          ? [{ value: 'admin', label: 'Admin' }]
                          : [
                              { value: 'admin', label: 'Admin' },
                              { value: 'operator', label: 'Operator' },
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
                    onClick={() => removeUserAccess(member.user_id)}
                    disabled={user?.id === member.user_id}
                    title={user?.id === member.user_id ? 'No podés eliminar tu propio acceso' : 'Quitar acceso'}
                  >
                    Eliminar
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
