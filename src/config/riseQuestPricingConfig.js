import { getBackendBaseUrl } from './backendConfig';

export async function fetchOfferings() {
  const baseUrl = await getBackendBaseUrl();
  const resp = await fetch(`${baseUrl}/api/pricing-config`);
  const cfg = await resp.json();
  if (!resp.ok || cfg?.error) throw new Error(cfg?.error || 'Failed to fetch pricing config');

  const rp = cfg?.risepoints || {};
  const subs = cfg?.subscriptions || {};

  return {
    risePointsPackages: {
      small: rp.small,
      medium: rp.medium,
      large: rp.large,
      mega: rp.mega,
    },
    subscriptionPlans: {
      monthly: subs.monthly,
      yearly: subs.yearly,
      family_monthly: subs.family_monthly,
      family_yearly: subs.family_yearly,
    },
  };
}

export const helpers = {
  formatCurrency: (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: String(currency).toUpperCase(),
    }).format(Number(amount));
  },
};

export default {
  fetchOfferings,
  helpers,
};
