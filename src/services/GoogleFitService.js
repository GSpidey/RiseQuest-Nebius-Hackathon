import { AppAlert as Alert } from '../services/dialogQueue';
import { getAuthToken } from './AuthTokenStorage';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { getBackendBaseUrl } from '../config/backendConfig';

const FITNESS_SCOPES = [
  'https://www.googleapis.com/auth/fitness.sleep.read',
];

const DAY_MS = 24 * 60 * 60 * 1000;

const readJsonSafe = async (resp) => {
  const text = await resp.text();
  if (!text) return { json: null, text: '' };
  try {
    return { json: JSON.parse(text), text };
  } catch (_) {
    return { json: null, text };
  }
};

const dateKeyUtc = (date) => {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);
};

const ensureGoogleTokensWithScopes = async () => {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  // Attempt silent sign-in first.
  try {
    await GoogleSignin.signInSilently();
  } catch (_) {
    // ignore
  }

  // Ensure user is signed in.
  const current = await GoogleSignin.getCurrentUser();
  if (!current) {
    await GoogleSignin.signIn();
  }

  // Request incremental scopes.
  // addScopes() throws if user cancels.
  await GoogleSignin.addScopes({ scopes: FITNESS_SCOPES });

  const tokens = await GoogleSignin.getTokens();
  if (!tokens?.accessToken) {
    throw new Error('Google access token missing');
  }

  return tokens.accessToken;
};

const fetchSleepAggregate = async ({ accessToken, startTimeMillis, endTimeMillis }) => {
  const url = 'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate';
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      aggregateBy: [
        {
          dataTypeName: 'com.google.sleep.segment',
        },
      ],
      bucketByTime: {
        durationMillis: DAY_MS,
      },
      startTimeMillis,
      endTimeMillis,
    }),
  });

  const { json, text } = await readJsonSafe(resp);
  if (!resp.ok) {
    throw new Error(json?.error?.message || text || `Google Fit error (${resp.status})`);
  }
  return json;
};

const parseSleepBuckets = (aggJson) => {
  const buckets = Array.isArray(aggJson?.bucket) ? aggJson.bucket : [];

  // Return 1 entry per day with (bedtimeAt, wakeAt, durationMinutes)
  return buckets
    .map((b) => {
      const startMillis = Number(b.startTimeMillis);
      const endMillis = Number(b.endTimeMillis);
      if (!Number.isFinite(startMillis) || !Number.isFinite(endMillis)) return null;

      const datasets = Array.isArray(b?.dataset) ? b.dataset : [];
      const points = datasets.flatMap((d) => (Array.isArray(d?.point) ? d.point : []));
      if (!points.length) return null;

      // Each point is a sleep segment. We treat the whole day: earliest start = bedtime, latest end = wake.
      let minStartNs = null;
      let maxEndNs = null;
      let totalSleepMs = 0;

      for (const p of points) {
        const s = Number(p.startTimeNanos);
        const e = Number(p.endTimeNanos);
        if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;

        if (minStartNs == null || s < minStartNs) minStartNs = s;
        if (maxEndNs == null || e > maxEndNs) maxEndNs = e;

        totalSleepMs += (e - s) / 1e6;
      }

      if (minStartNs == null || maxEndNs == null) return null;

      const bedtimeAt = new Date(minStartNs / 1e6);
      const wakeAt = new Date(maxEndNs / 1e6);
      const durationMinutes = Math.max(1, Math.round(totalSleepMs / 60000));

      // If we didn't compute meaningful duration, fall back to span.
      const spanMinutes = Math.max(1, Math.round((wakeAt.getTime() - bedtimeAt.getTime()) / 60000));
      const finalMinutes = durationMinutes > 0 ? Math.min(durationMinutes, spanMinutes) : spanMinutes;

      return {
        dateKey: dateKeyUtc(new Date(endMillis)),
        bedtimeAt: bedtimeAt.toISOString(),
        wakeAt: wakeAt.toISOString(),
        durationMinutes: finalMinutes,
      };
    })
    .filter(Boolean);
};

export const GoogleFitService = {
  async connectAndSyncSleep({ days = 30 } = {}) {
    if (Platform.OS !== 'android') {
      Alert.alert('Google Fit', 'Google Fit integration is currently Android-only.');
      return { ok: false, reason: 'not_android' };
    }

    const token = await getAuthToken();
    if (!token) {
      Alert.alert('Sign in required', 'Please sign in to sync Google Fit sleep data.');
      return { ok: false, reason: 'no_app_auth' };
    }

    let accessToken;
    try {
      accessToken = await ensureGoogleTokensWithScopes();
    } catch (e) {
      const msg = e?.message ? String(e.message) : 'Google authorization failed';
      return { ok: false, reason: 'google_auth_failed', message: msg };
    }

    const endTimeMillis = Date.now();
    const startTimeMillis = endTimeMillis - Math.max(1, Math.min(365, Number(days))) * DAY_MS;

    let agg;
    try {
      agg = await fetchSleepAggregate({ accessToken, startTimeMillis, endTimeMillis });
    } catch (e) {
      const msg = e?.message ? String(e.message) : 'Google Fit request failed';
      return { ok: false, reason: 'google_fit_request_failed', message: msg };
    }

    const entries = parseSleepBuckets(agg);

    if (!entries.length) {
      return {
        ok: true,
        synced: 0,
        found: 0,
        message: 'No Google Fit sleep data found for this date range.',
      };
    }

    const baseUrl = await getBackendBaseUrl();

    let synced = 0;
    for (const e of entries) {
      // Sleep quality isn't provided via com.google.sleep.segment aggregate.
      // Keep it conservative: derive from duration vs 8h (cap 95).
      const durationHours = (Number(e.durationMinutes || 0) / 60) || 0;
      const sleepQuality = Math.max(30, Math.min(95, Math.round((durationHours / 8) * 100)));

      const resp = await fetch(`${baseUrl}/api/sleep/entries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          bedtimeAt: e.bedtimeAt,
          wakeAt: e.wakeAt,
          sleepQuality,
          notes: 'Synced from Google Fit',
          source: 'wearable',
        }),
      });

      if (resp.ok) {
        synced += 1;
      }
    }

    await AsyncStorage.setItem('risequest_googlefit_last_sync', new Date().toISOString()).catch(() => {});
    return {
      ok: true,
      synced,
      found: entries.length,
      message: synced ? `Synced ${synced} nights from Google Fit.` : 'No entries were accepted by the backend.',
    };
  },
};

