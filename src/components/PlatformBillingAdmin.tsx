import React from 'react';
import Card from './ui/Card';
import { platformBillingService, PlatformOrganizationRow } from '../services/platformBilling';

export default function PlatformBillingAdmin() {
  const [rows, setRows] = React.useState<PlatformOrganizationRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await platformBillingService.listAllOrganizations();
      setRows(data);
    } catch (err: unknown) {
      console.error('platform admin list orgs:', err);
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : '';
      setError(msg || 'No se pudo cargar la lista de granjas.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const togglePaying = async (org: PlatformOrganizationRow) => {
    const next = !org.is_paying_customer;
    setBusyId(org.id);
    setError('');
    try {
      await platformBillingService.setPayingCustomer(org.id, next);
      setRows((prev) =>
        prev.map((row) => (row.id === org.id ? { ...row, is_paying_customer: next } : row))
      );
    } catch (err: unknown) {
      console.error('platform admin set paying:', err);
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : '';
      setError(msg || 'No se pudo actualizar el estado de pago.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card padding="md" className="border-violet-200/80 bg-violet-50/30">
      <h3 className="text-lg font-semibold text-gray-900">Suscripciones (administración de plataforma)</h3>
      <p className="text-sm text-gray-600 mt-1 mb-4">
        Marcá qué granjas tienen suscripción activa. Solo vos podés cambiar estos estados.
      </p>

      {error ? (
        <div className="p-3 mb-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-gray-500">Cargando granjas…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No hay organizaciones registradas.</p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-4 font-medium">Granja</th>
                <th className="py-2 pr-4 font-medium hidden sm:table-cell">Email owner</th>
                <th className="py-2 font-medium text-center w-24">¿Paga?</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((org) => (
                <tr key={org.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-3 pr-4">
                    <p className="font-medium text-gray-900">{org.name}</p>
                    <p className="text-xs text-gray-500 sm:hidden mt-0.5 truncate max-w-[200px]">
                      {org.signup_owner_email || '—'}
                    </p>
                  </td>
                  <td className="py-3 pr-4 text-gray-600 hidden sm:table-cell">
                    {org.signup_owner_email || '—'}
                  </td>
                  <td className="py-3 text-center">
                    <label className="inline-flex items-center justify-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                        checked={org.is_paying_customer}
                        disabled={busyId === org.id}
                        onChange={() => togglePaying(org)}
                        aria-label={`Marcar ${org.name} como pagadora`}
                      />
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
