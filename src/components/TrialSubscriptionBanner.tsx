import React from 'react';
import Button from './ui/Button';
import { SUBSCRIPTION_PLAN_LINKS } from '../constants/subscription';
import { useAuth } from '../contexts/AuthContext';
import { subscriptionBannerCopy, type OrgBillingStatus } from '../utils/orgBilling';

export default function TrialSubscriptionBanner() {
  const { isReadOnly, daysRemainingUntilReadOnly, billingPhase, trialDaysRemaining } = useAuth();

  const status: OrgBillingStatus = {
    phase: billingPhase,
    isReadOnly,
    daysRemainingUntilReadOnly,
    trialDaysRemaining,
  };
  const copy = subscriptionBannerCopy(status);
  if (!copy) return null;

  return (
    <div
      role="status"
      className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:px-5 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
    >
      <p className="text-sm text-amber-900 leading-relaxed pr-2">{copy}</p>
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
