import React from 'react';
import Button from './ui/Button';
import { SUBSCRIPTION_PLAN_LINKS } from '../constants/subscription';
import { platformBillingService } from '../services/platformBilling';

interface TrialSubscriptionBannerProps {
  organizationId: string;
}

export default function TrialSubscriptionBanner({ organizationId }: TrialSubscriptionBannerProps) {
  const [isPaying, setIsPaying] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    if (!organizationId) {
      setIsPaying(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const paying = await platformBillingService.getPayingStatus(organizationId);
        if (!cancelled) setIsPaying(paying);
      } catch (error) {
        console.error('Error loading paying status:', error);
        if (!cancelled) setIsPaying(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  if (isPaying !== false) return null;

  return (
    <div
      role="status"
      className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:px-5 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
    >
      <p className="text-sm text-amber-900 leading-relaxed pr-2">
        Tu periodo de prueba de El Capataz está por regularizarse. Activa tu suscripción para seguir
        usando todas las funciones sin interrupciones.
      </p>
      <Button
        variant="primary"
        size="sm"
        type="button"
        className="shrink-0"
        onClick={() => window.open(SUBSCRIPTION_PLAN_LINKS.basico, '_blank', 'noopener,noreferrer')}
      >
        Suscribirme
      </Button>
    </div>
  );
}
