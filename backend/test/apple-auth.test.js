const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { verifyIdentity } = require('../src/appleAuth');
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = { ...publicKey.export({ format: 'jwk' }), kid: 'test', alg: 'RS256', use: 'sig' };
const now = Math.floor(Date.now() / 1000);
const base = { sub: 'apple-subject', iss: 'https://appleid.apple.com', aud: 'com.goldenepics.risequest', nonce: 'server-hashed-nonce', iat: now, exp: now + 300 };
const sign = claims => jwt.sign({ ...base, ...claims }, privateKey, { algorithm: 'RS256', keyid: 'test' });
test('accepts Apple-signed identity only with bound nonce and app audience', () => {
  expect(verifyIdentity(sign({}), base.nonce, [key], now).sub).toBe('apple-subject');
});
test.each([{ aud: 'other-app' }, { iss: 'other-issuer' }, { nonce: 'replayed' }, { exp: now - 60 }, { iat: now - 1000 }, { iat: now + 100 }, { sub: '' }])('rejects invalid identity claims %j', claims => {
  expect(() => verifyIdentity(sign(claims), base.nonce, [key], now)).toThrow();
});
test('does not trust arbitrary keys, unsigned tokens or algorithm substitution', () => {
  expect(() => verifyIdentity(sign({}), base.nonce, [], now)).toThrow();
  const token = jwt.sign(base, 'public-key-confusion', { algorithm: 'HS256', keyid: 'test' });
  expect(() => verifyIdentity(token, base.nonce, [key], now)).toThrow();
});
