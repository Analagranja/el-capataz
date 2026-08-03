import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';
import { feedConsumptionMonthlyService } from '../services/feedConsumptionMonthly';
import {
  closedMonthsForOrganization,
  findMissingFeedMonths,
  formatYearMonthLabel,
  formatYearMonthList,
  type YearMonth,
} from '../utils/feedConsumptionMissing';
import Card from './ui/Card';
import Button from './ui/Button';
import { canAccessPage } from '../hooks/useRole';
import type { UserRole } from '../types';

const LOOKBACK_CLOSED_MONTHS = 6;
const PREVIEW_LIMIT = 3;

export type FeedConsumptionNavTarget = { year: number; month: number };

function normalizeRole(raw: unknown): UserRole {
  const s = String(raw ?? 'admin')
    .trim()
    .toLowerCase();
  if (s === 'operator') return 'operator';
  if (s === 'vendedor') return 'vendedor';
  return 'admin';
}

type Props = {
  onGoToDeclare: (target: FeedConsumptionNavTarget) => void;
};

export default function FeedConsumptionMissingReminder({ onGoToDeclare }: Props) {
  const { organizationId, role: profileRole } = useAuth();
  const canDeclare = canAccessPage(normalizeRole(profileRole), 'gastos');

  const [missing, setMissing] = React.useState<YearMonth[]>([]);
  const [showAll, setShowAll] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!organizationId || !canDeclare) {
      setMissing([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: orgRow, error: orgError } = await supabase
          .from('organizations')
          .select('created_at')
          .eq('id', organizationId)
          .maybeSingle();
        if (orgError) throw orgError;

        const closed = closedMonthsForOrganization(
          new Date(),
          orgRow?.created_at ?? null,
          LOOKBACK_CLOSED_MONTHS
        );
        if (closed.length === 0) {
          if (!cancelled) setMissing([]);
          return;
        }
        const years = [...new Set(closed.map((c) => c.year))];
        const rows = await feedConsumptionMonthlyService.getAllByYears(organizationId, years);
        if (cancelled) return;
        setMissing(findMissingFeedMonths(closed, rows));
      } catch (e) {
        console.error('Error checking missing feed consumption months:', e);
        if (!cancelled) setMissing([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, canDeclare]);

  if (!canDeclare || loading || missing.length === 0) return null;

  const visible = showAll ? missing : missing.slice(0, PREVIEW_LIMIT);
  const hasMore = missing.length > PREVIEW_LIMIT;
  const primary = missing[0];
  const primaryLabel = formatYearMonthLabel(primary);
  const listLabel = formatYearMonthList(visible);

  return (
    <Card padding="md" className="border border-amber-200 bg-amber-50/80">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-amber-950">
            Te falta declarar el consumo de alimento de: {listLabel}.
          </p>
          <p className="text-sm text-amber-900/80">
            Cargalo para mantener actualizado tu Inventario.
            {hasMore && !showAll ? (
              <>
                {' '}
                <button
                  type="button"
                  className="font-medium text-amber-950 underline underline-offset-2 hover:text-amber-800"
                  onClick={() => setShowAll(true)}
                >
                  Ver todos ({missing.length})
                </button>
              </>
            ) : null}
            {showAll && hasMore ? (
              <>
                {' '}
                <button
                  type="button"
                  className="font-medium text-amber-950 underline underline-offset-2 hover:text-amber-800"
                  onClick={() => setShowAll(false)}
                >
                  Ver menos
                </button>
              </>
            ) : null}
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="shrink-0 self-stretch sm:self-center"
          onClick={() => onGoToDeclare({ year: primary.year, month: primary.month })}
        >
          Cargar {primaryLabel.toLowerCase()}
        </Button>
      </div>
    </Card>
  );
}
