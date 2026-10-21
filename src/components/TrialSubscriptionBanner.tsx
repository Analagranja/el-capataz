import React from 'react';
import Button from './ui/Button';
import { SUBSCRIPTION_PLAN_LINKS } from '../constants/subscription';
import { useAuth } from '../contexts/AuthContext';
import { subscriptionBannerCopy, type OrgBillingStatus } from '../utils/orgBilling';

function checkoutUrlForPhase(phase: OrgBillingStatus['phase']): string {
  if (phase === 'grace' || phase === 'readonly') {
    return SUBSCRIPTION_PLAN_LINKS.basicoPostTrial;
  }
  return SUBSCRIPTION_PLAN_LINKS.basico;
}

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

  const checkoutUrl = checkoutUrlForPhase(billingPhase);

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
        onClick={() => window.open(checkoutUrl, '_blank', 'noopener,noreferrer')}
      >
        Suscribirme
      </Button>
    </div>
  );
}
