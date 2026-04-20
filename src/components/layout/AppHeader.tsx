import React from 'react';
import { Gallinero } from '../../types';
import { gallinerosService } from '../../services/gallineros';
import { useAuth } from '../../contexts/AuthContext';
import { useRole } from '../../hooks/useRole';
import Select from '../ui/Select';
import Button from '../ui/Button';
import { LogOut } from 'lucide-react';

interface AppHeaderProps {
  selectedGallineroId: string | null;
  onGallineroChange: (gallineroId: string) => void;
}

export default function AppHeader({ selectedGallineroId, onGallineroChange }: AppHeaderProps) {
  const { organizationId, organizationName, signOut } = useAuth();
  const { actualRole, roleViewOverride, setTemporaryRoleView } = useRole();
  const [gallineros, setGallineros] = React.useState<Gallinero[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!organizationId) {
      setGallineros([]);
      setLoading(false);
      return;
    }

    const loadGallineros = async () => {
      try {
        const data = await gallinerosService.getAll(organizationId);
        setGallineros(data);
      } catch (error) {
        console.error('Error loading gallineros:', error);
      } finally {
        setLoading(false);
      }
    };

    setLoading(true);
    loadGallineros();
  }, [organizationId]);

  if (loading) {
    return (
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="h-16 px-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Granja Avícola</h1>
            {organizationName && (
              <p className="text-xs text-emerald-700 font-medium truncate max-w-[200px] sm:max-w-md">
                {organizationName}
              </p>
            )}
          </div>
        </div>
      </header>
    );
  }

  const options = gallineros.map((g) => ({
    value: g.id,
    label: `${g.name} (${g.current_count} gallinas)`,
  }));

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-20">
      <div className="h-auto min-h-16 px-6 py-2 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Granja Avícola</h1>
          {organizationName && (
            <p className="text-xs text-emerald-700 font-medium truncate">{organizationName}</p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-1 justify-end min-w-0">
          {actualRole === 'admin' && (
            <div className="w-full max-w-[220px]">
              <Select
                label="Vista (temporal)"
                options={[
                  { value: '', label: 'Rol real' },
                  { value: 'admin', label: 'Vista Admin' },
                  { value: 'operator', label: 'Vista Operario' },
                ]}
                value={roleViewOverride || ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setTemporaryRoleView(v === 'admin' || v === 'operator' ? v : null);
                }}
                className="text-sm"
              />
            </div>
          )}
          {gallineros.length > 0 && (
            <div className="w-full max-w-xs">
              <Select
                options={options}
                value={selectedGallineroId || ''}
                onChange={(e) => onGallineroChange(e.target.value)}
                className="text-sm"
              />
            </div>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => signOut()}
            className="shrink-0 flex items-center gap-1.5"
            title="Cerrar sesión"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Salir</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
