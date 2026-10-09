import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authHeaders } from './AuthTokenStorage';
import { getBackendBaseUrl } from '../config/backendConfig';
import { ADS_USE_TEST_UNITS, GOOGLE_AD_UNITS } from '../config/adsConfig';
import { createTransitionAds } from './transitionAds';

export default function useTransitionAds(status, flow) {
  const latest = useRef(status); latest.current = status;
  const controller = useRef(null);
  if (!controller.current) controller.current = createTransitionAds({
    state: () => ({ ...latest.current, foreground: AppState.currentState === 'active', nextAlarmAt: latest.current.nextAlarmAt() }),
    storage: AsyncStorage,
    policyRequest: async () => {
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), 10000);
      try {
        const response = await fetch(`${await getBackendBaseUrl()}/api/me/ad-policy`, { headers: await authHeaders(), signal: abort.signal });
        if (!response.ok) throw new Error('Ad eligibility unavailable');
        return await response.json();
      } finally { clearTimeout(timeout); }
    },
    sdkLoader: () => require('react-native-google-mobile-ads'),
    unitId: sdk => ADS_USE_TEST_UNITS ? sdk.TestIds.INTERSTITIAL : GOOGLE_AD_UNITS[Platform.OS]?.interstitial,
  });
  useEffect(() => {
    if (flow) void controller.current.prepare(flow); else controller.current.cancel();
    return () => controller.current.cancel();
  }, [flow, status.account, status.guest, status.premium, status.blocked, status.ageBand]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', value => { if (value !== 'active') controller.current.cancel(); });
    return () => { listener.remove(); controller.current.cancel(); };
  }, []);
  return controller.current;
}
