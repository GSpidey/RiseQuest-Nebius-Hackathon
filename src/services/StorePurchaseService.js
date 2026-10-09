import { NativeModules, Platform } from 'react-native';
import { getAuthToken, onAuthSessionChanged } from './AuthTokenStorage';
import { getBackendBaseUrl } from '../config/backendConfig';

export const usesStoreBilling = () => Platform.OS === 'ios' ||
  NativeModules.RiseQuestAlarmAudio?.distribution === 'play';

// Connect only on purchase screens, never for guests or managed children.
let session = null;
let connecting = null;
onAuthSessionChanged(() => { closeStoreSession().catch(() => {}); });
async function api(path, token, body) {
  const response = await fetch(`${await getBackendBaseUrl()}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Purchase verification is unavailable.');
  return result;
}
async function current(s) {
  if (session !== s || !s.token || await getAuthToken() !== s.token) {
    throw new Error('Your account changed. Reopen the purchase screen to continue.');
  }
}
export async function closeStoreSession() {
  const old = session;
  session = null;
  if (!old) return;
  old.listeners.forEach(listener => listener.remove());
  old.pending?.resolve({ success: false, pending: true });
  if (old.pending) clearTimeout(old.pending.timer);
  await old.iap.endConnection();
}
async function verify(s, purchase) {
  await current(s);
  const item = s.catalog.products[purchase.productId];
  if (!item) throw new Error('Unrecognized store product.');
  const proof = purchase.purchaseToken || (Platform.OS === 'ios'
    ? await s.iap.getTransactionJwsIOS(purchase.productId) : null);
  if (!proof) throw new Error('The store has not provided a purchase receipt yet.');
  const result = await api('/api/store/verify', s.token, {
    store: Platform.OS === 'ios' ? 'apple' : 'google', productId: purchase.productId, proof,
  });
  await current(s);
  if (result.verified && result.finish) {
    // Never consume before the durable server ledger has accepted the receipt.
    await s.iap.finishTransaction({ purchase, isConsumable: item.kind === 'points' });
  }
  return { success: !!(result.verified && result.finish), pending: !result.finish,
    entitlement: result.entitlement, pointsAdded: result.finish ? item.points || 0 : 0,
    subscriptionId: purchase.id, source: 'store' };
}
function settle(s, result, productId) {
  if (!s.pending || (productId && s.pending.productId !== productId)) return;
  clearTimeout(s.pending.timer);
  s.pending.resolve(result);
  s.pending = null;
}
async function connect() {
  if (!usesStoreBilling()) throw new Error('This installation uses direct billing.');
  const token = await getAuthToken();
  if (!token) throw new Error('Sign in to manage purchases.');
  if (session?.token === token) return session;
  if (connecting) { await connecting; return connect(); }
  connecting = (async () => {
    await closeStoreSession();
    const catalog = await api('/api/store/catalog', token);
    if (await getAuthToken() !== token) throw new Error('Your account changed.');
    const iap = require('react-native-iap');
    await iap.initConnection();
    if (await getAuthToken() !== token) { await iap.endConnection(); throw new Error('Your account changed.'); }
    const s = { token, catalog, iap, listeners: [], pending: null, verifying: new Map() };
    session = s;
    s.verify = purchase => {
      const key = purchase.purchaseToken || purchase.id;
      if (!s.verifying.has(key)) s.verifying.set(key, verify(s, purchase).finally(() => s.verifying.delete(key)));
      return s.verifying.get(key);
    };
    s.listeners.push(iap.purchaseUpdatedListener(purchase => {
      s.verify(purchase).then(result => settle(s, result, purchase.productId)).catch(() => {
        // Unfinished receipts remain in the store queue for retry or restoration.
        settle(s, { success: false, pending: true }, purchase.productId);
      });
    }), iap.purchaseErrorListener(error => {
      settle(s, { success: false, cancelled: error.code === 'user-cancelled', error: error.message });
    }));
    return s;
  })();
  try { return await connecting; } finally { connecting = null; }
}
export async function getStorePricing() {
  const s = await connect();
  const entries = Object.entries(s.catalog.products);
  const [subscriptions, points] = await Promise.all([
    s.iap.fetchProducts({ skus: entries.filter(([, p]) => p.kind === 'subscription').map(([id]) => id), type: 'subs' }),
    s.iap.fetchProducts({ skus: entries.filter(([, p]) => p.kind === 'points').map(([id]) => id), type: 'in-app' }),
  ]);
  await current(s);
  s.products = [...subscriptions || [], ...points || []];
  const config = { subscriptions: {}, risepoints: {}, source: 'store' };
  for (const product of s.products) {
    const item = s.catalog.products[product.id];
    if (!item) continue;
    const baseOffer = Platform.OS === 'android' && item.kind === 'subscription'
      ? product.subscriptionOfferDetailsAndroid?.find(o => !o.offerId) : null;
    const basePrice = baseOffer?.pricingPhases?.pricingPhaseList?.find(p => p.recurrenceMode === 1);
    if (Platform.OS === 'android' && item.kind === 'subscription' && !basePrice) continue;
    const row = { ...item, priceId: product.id, displayPrice: product.displayPrice,
      amount: product.price, currency: product.currency,
      ...(basePrice ? { displayPrice: basePrice.formattedPrice, amount: Number(basePrice.priceAmountMicros) / 1000000, currency: basePrice.priceCurrencyCode } : {}) };
    config[item.kind === 'subscription' ? 'subscriptions' : 'risepoints'][item.plan || item.pack] = row;
  }
  return config;
}
export async function purchaseStoreItem(kind, selection) {
  const s = await connect();
  if (s.pending) throw new Error('Finish the current purchase first.');
  const key = String(selection).replace(/^points_/, '');
  const entry = Object.entries(s.catalog.products).find(([, p]) => p.kind === kind && (p.plan || p.pack) === key);
  if (!entry) throw new Error('Unknown store product.');
  await getStorePricing();
  await current(s);
  const [productId] = entry;
  const product = s.products.find(p => p.id === productId);
  if (!product) throw new Error('This product is not available from your store yet.');
  // Use the regular base plan; never select an undisclosed introductory offer.
  const offer = product.subscriptionOfferDetailsAndroid?.find(o => !o.offerId);
  if (Platform.OS === 'android' && kind === 'subscription' && !offer?.offerToken) {
    throw new Error('The subscription base plan is unavailable.');
  }
  const result = new Promise(resolve => {
    const timer = setTimeout(() => settle(s, { success: false, pending: true }), 120000);
    s.pending = { resolve, timer, productId };
  });
  try {
    await s.iap.requestPurchase({ type: kind === 'subscription' ? 'subs' : 'in-app', request: {
      apple: { sku: productId, appAccountToken: s.catalog.accountToken, quantity: 1,
        andDangerouslyFinishTransactionAutomatically: false },
      google: { skus: [productId], obfuscatedAccountId: s.catalog.accountToken,
        isOfferPersonalized: false, ...(offer ? { subscriptionOffers: [{ sku: productId, offerToken: offer.offerToken }] } : {}) },
    } });
  } catch (error) {
    settle(s, { success: false, cancelled: error.code === 'user-cancelled', error: error.message });
  }
  return result;
}
export async function restoreStorePurchases() {
  const s = await connect();
  const purchases = await s.iap.getAvailablePurchases();
  const results = await Promise.allSettled(purchases.map(purchase => s.verify(purchase)));
  await current(s);
  const entitlement = await api('/api/store/entitlements', s.token);
  return { entitlement, pending: results.some(result => result.status === 'rejected' || result.value.pending) };
}
