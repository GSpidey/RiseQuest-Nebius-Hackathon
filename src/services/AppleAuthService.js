import { appleAuth } from '@invertase/react-native-apple-authentication';
import { getBackendBaseUrl } from '../config/backendConfig';
import { getAuthToken } from './AuthTokenStorage';

async function post(path, body, authenticated = false) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${await getBackendBaseUrl()}${path}`, { method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${await getAuthToken()}` } : {}) },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || 'Apple sign-in failed.'), { code: data.code });
    return data;
  } finally { clearTimeout(timer); }
}
export async function signInWithApple({ ageBand, countryCode, link = false } = {}) {
  const challenge = await post('/api/auth/apple/challenge', {});
  const credential = await appleAuth.performRequest({ requestedOperation: appleAuth.Operation.LOGIN,
    requestedScopes: [appleAuth.Scope.FULL_NAME, appleAuth.Scope.EMAIL], nonce: challenge.nonce, state: challenge.challengeId,
  });
  if (!credential.identityToken || credential.state !== challenge.challengeId) throw new Error('Apple sign-in could not be verified.');
  return post(link ? '/api/auth/apple/link' : '/api/auth/apple', {
    challengeId: challenge.challengeId, identityToken: credential.identityToken, authorizationCode: credential.authorizationCode,
    ageBand, countryCode, displayName: [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ') || undefined,
  }, link);
}
