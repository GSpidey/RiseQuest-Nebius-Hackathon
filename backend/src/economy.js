const crypto = require('crypto');
// Existing paid products retain their original fulfillment values.
const LEGACY_PACKS = Object.freeze({ small: { cents: 299, points: 250 }, medium: { cents: 499, points: 550 },
  large: { cents: 999, points: 1150 }, mega: { cents: 1999, points: 3125 } });
const POINT_PACKS_V2 = Object.freeze({ pocket: { cents: 199, points: 100, name: 'Pocket' },
  everyday: { cents: 499, points: 300, name: 'Everyday' }, plus: { cents: 999, points: 700, name: 'Plus' },
  explorer: { cents: 1999, points: 1600, name: 'Explorer' }, studio: { cents: 3999, points: 3600, name: 'Studio' } });
// 50 points / reference USD; half the plan equivalent, rounded to whole points.
const PLANS = Object.freeze({ monthly: { cents: 599, grant: 150 }, yearly: { cents: 4999, grant: 1250 },
  family_monthly: { cents: 899, grant: 225 }, family_yearly: { cents: 7999, grant: 2000 } });
const STRIPE_POINT_PRICES = Object.freeze(Object.fromEntries(Object.keys(POINT_PACKS_V2).map(pack => [pack, process.env[`STRIPE_PRICE_POINTS_${pack.toUpperCase()}`] || ''])));
const GRANT_START = new Date('2026-10-23T00:00:00Z');
function grantId(store, period) { return 'subscription_grant_' + crypto.createHash('sha256').update(`${store}|${period}`).digest('hex'); }
async function grantSubscription(tx, userId, { store, period, plan, paid, purchasedAt }) {
  const amount = PLANS[plan]?.grant;
  if (!amount || !paid || !period || !purchasedAt || !Number.isFinite(new Date(purchasedAt).getTime()) || new Date(purchasedAt) < GRANT_START) return 0;
  const id = grantId(store, period), prior = await tx.risePointsTransaction.findUnique({ where: { id } });
  const revoked = await tx.risePointsTransaction.findUnique({where:{id:`revoke_${id}`}});
  if (revoked) { if (revoked.userId !== userId) throw new Error('Purchase account mismatch'); return 0; }
  if (prior) { if (prior.userId !== userId) throw new Error('Purchase account mismatch'); return 0; }
  await tx.risePointsTransaction.create({ data: { id, userId, delta: amount, reason: 'Subscription RisePoints allowance',
    metadata: { store, period, plan, referenceRate: 50, fraction: 0.5 } } });
  await tx.risePointsBalance.upsert({ where: { userId }, create: { userId, balance: amount }, update: { balance: { increment: amount } } });
  return amount;
}
async function revokeSubscriptionGrant(tx, userId, store, period) {
  const id = grantId(store, period), reversal = `revoke_${id}`;
  const grant = await tx.risePointsTransaction.findUnique({where:{id}});
  if ((grant && grant.userId !== userId) || await tx.risePointsTransaction.findUnique({where:{id:reversal}})) return 0;
  if (!grant) {
    // A verified refund can arrive before its payment webhook. Record it so a late payment cannot mint points.
    await tx.risePointsTransaction.create({data:{id:reversal,userId,delta:0,reason:'Refunded subscription allowance',metadata:{store,period,unrecovered:0}}});
    return 0;
  }
  const wallet = await tx.risePointsBalance.findUnique({where:{userId}});
  const amount = Math.min(wallet?.balance || 0, grant.delta);
  await tx.risePointsTransaction.create({data:{id:reversal,userId,delta:-amount,reason:'Refunded subscription allowance',metadata:{store,period,unrecovered:grant.delta-amount}}});
  if(amount) await tx.risePointsBalance.update({where:{userId},data:{balance:{decrement:amount}}});
  return amount;
}
function googleOrderAllowance(order, {orderId, token, productId, plan}) {
  if (!orderId || order?.orderId !== orderId || order.purchaseToken !== token || !order.lineItems?.some(row=>row.productId===productId)) return {};
  if (order.state === 'REFUNDED') return {revokedGrantPeriod:orderId};
  const total=Number(order.total?.units || 0)+Number(order.total?.nanos || 0)/1e9;
  if (order.state !== 'PROCESSED' || !Number.isFinite(total) || total <= 0) return {};
  return {grant:{store:'google',period:orderId,plan,paid:true,purchasedAt:order.createTime}};
}
module.exports = { googleOrderAllowance, revokeSubscriptionGrant, STRIPE_POINT_PRICES, LEGACY_PACKS, POINT_PACKS_V2, PLANS, GRANT_START, grantSubscription, grantId };
