import React from 'react';

type Value = { version: number; bump: () => void };

const DashboardMetricsRefreshContext = React.createContext<Value | null>(null);

export function DashboardMetricsRefreshProvider({ children }: { children: React.ReactNode }) {
  const [version, setVersion] = React.useState(0);
  const bump = React.useCallback(() => setVersion((v) => v + 1), []);
  const value = React.useMemo(() => ({ version, bump }), [version, bump]);
  return (
    <DashboardMetricsRefreshContext.Provider value={value}>{children}</DashboardMetricsRefreshContext.Provider>
  );
}

/** Para que el Panel vuelva a cargar métricas (p. ej. tras guardar en Producción o Gastos). */
export function useDashboardMetricsTick(): number {
  const ctx = React.useContext(DashboardMetricsRefreshContext);
  if (!ctx) {
    throw new Error('useDashboardMetricsTick requiere DashboardMetricsRefreshProvider');
  }
  return ctx.version;
}

/** Incrementa el tick del panel; si no hay provider, no hace nada. */
export function useBumpDashboardMetrics(): () => void {
  const ctx = React.useContext(DashboardMetricsRefreshContext);
  return ctx?.bump ?? (() => {});
}
