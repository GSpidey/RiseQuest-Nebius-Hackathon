const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/features/api.js'), 'utf8')
  .replace(/^import .*;$/gm, '').replace('export async function featureApi', 'async function featureApi');
function client(token = 'account-one') {
  let current = token, calls = [];
  const context = { getAuthToken: async () => current, getBackendBaseUrl: async () => 'https://example.test',
    AbortController, setTimeout, clearTimeout, fetch: async (url, options) => {
      calls.push({ url, options }); return { ok: true, status: 200, json: async () => ({ enabled: true }) };
    } };
  vm.createContext(context); vm.runInContext(source, context);
  return { api: context.featureApi, calls, switchAccount: token => { current = token; }, context };
}
test('recharge cannot mutate a different account after the consent screen changes session', async () => {
  const c = client(); c.switchAccount('account-two');
  await assert.rejects(c.api('/api/wallet/recharge/activate', { confirmed: true }, { expectedToken: 'account-one' }), /account changed/);
  assert.equal(c.calls.length, 0);
});
test('matching consent account sends its authenticated mutation', async () => {
  const c = client();
  const r = await c.api('/api/wallet/recharge/activate', { confirmed: true }, { expectedToken: 'account-one' });
  assert.equal(r.enabled, true); assert.equal(c.calls[0].options.headers.Authorization, 'Bearer account-one');
});
test('existing feature calls without a pinned token keep working', async () => {
  const c = client(); assert.equal((await c.api('/api/companions')).enabled, true);
  assert.equal(c.calls[0].options.method, 'GET');
});
