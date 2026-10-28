const crypto = require('crypto');
const jwt = require('jsonwebtoken');
function privateKey(value, secret) { return crypto.createHmac('sha256', secret).update(value).digest('hex'); }
function apiRateKey(req, secret) {
  const token = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ''))?.[1];
  if (token) try {
    const claims = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (typeof claims.sub === 'string' && claims.sub && Number.isFinite(claims.exp)) return privateKey('account:'+claims.sub, secret);
  } catch (_) {}
  return privateKey('network:'+String(req.ip || 'unknown'), secret);
}
const rateMessage = { error: 'Please wait a moment before trying again.', code: 'RATE_LIMITED' };
function apiRateOptions(secret) { return { windowMs: 60000, limit: 240, keyGenerator: req => apiRateKey(req, secret), standardHeaders: true, legacyHeaders: false, message: rateMessage }; }
module.exports = { apiRateKey, apiRateOptions, rateMessage };
