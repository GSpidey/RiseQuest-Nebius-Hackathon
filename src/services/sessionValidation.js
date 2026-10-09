// A network outage is not a logout. Only an explicit server rejection invalidates
// a saved session; callers must preserve profile, alarms, and local preferences.
async function checkStoredSession(baseUrl, token, request = fetch) {
  if (!token) return 'missing';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await request(`${baseUrl}/api/me`, {
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) return 'rejected';
    return response.ok ? 'valid' : 'unavailable';
  } catch (_) {
    return 'unavailable';
  } finally { clearTimeout(timeout); }
}

module.exports = { checkStoredSession };
