import { getBackendBaseUrl } from './backendConfig';

/**
 * Backend-driven Stripe pricing.
 * Price IDs are configured server-side via env vars and surfaced via /api/pricing-config.
 */
export async function fetchPricingConfig() {
  const baseUrl = await getBackendBaseUrl();
  const resp = await fetch(`${baseUrl}/api/pricing-config`);
  const json = await resp.json();
  if (!resp.ok || json?.error) throw new Error(json?.error || 'Failed to fetch pricing config');
  return json;
}

export default {
  fetchPricingConfig,
};
