import RechargeControls from '../features/companion/RechargeControls';
import { AppAlert as Alert } from '../components/AppModal';
import { sunrise } from '../components/SunriseUI';
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { useStripePayments } from '../services/StripePaymentService';
import StripePaymentService from '../services/StripePaymentService';
import { MonetizationService } from '../utils/MonetizationService';
import riseQuestWalletService from '../services/RiseQuestWalletService';

function formatMoney(amount, currency) {
  if (amount == null) return '';
  const c = String(currency || 'usd').toUpperCase();
  const symbol = c === 'USD' ? '$' : c === 'CAD' ? '$' : c === 'EUR' ? '€' : c === 'GBP' ? '£' : '$';
  return `${symbol}${Number(amount).toFixed(2)}`;
}

export default function WalletHubScreen({
  userProfile,
  risePoints = 0,
  onRefreshBalances,
  onOpenRewards,
  onOpenPremium,
}) {
  const insets = useSafeAreaInsets();
  const { processRisePointsPurchase } = useStripePayments();
  const [pricing, setPricing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sub, setSub] = useState(null);
  const [recent, setRecent] = useState([]);
  const [recentLoading, setRecentLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [cfg, subscription] = await Promise.all([
          StripePaymentService.getPricingConfig(),
          MonetizationService.getUserSubscription(),
        ]);
        if (!alive) return;
        setPricing(cfg || null);
        setSub(subscription || null);
      } catch (_) {
        if (!alive) return;
        setPricing(null);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const loadRecent = async () => {
      if (!userProfile?.email) {
        setRecent([]);
        return;
      }

      setRecentLoading(true);
      try {
        const userId = await riseQuestWalletService.getCurrentUserId();
        const rows = await riseQuestWalletService.getTransactionHistory(userId, 8);
        if (!alive) return;
        setRecent(Array.isArray(rows) ? rows : []);
      } catch (_) {
        if (!alive) return;
        setRecent([]);
      } finally {
        if (alive) setRecentLoading(false);
      }
    };

    void loadRecent();
    return () => {
      alive = false;
    };
  }, [userProfile?.email]);

  const packages = useMemo(() => {
    const pkgs = pricing?.risepoints;
    if (!pkgs || typeof pkgs !== 'object') return [];
    return Object.entries(pkgs).map(([id, p]) => ({
      id,
      points: Number(p?.points || 0),
      amount: Number(p?.amount || 0),
      currency: p?.currency || 'usd',
      priceId: p?.priceId || null,
      displayPrice: p?.displayPrice || null,
    })).filter(p => p.points > 0 && p.amount > 0);
  }, [pricing]);

  const purchase = async (pkgId) => {
    if (!userProfile?.email) {
      Alert.alert('Sign in required', 'Please sign in to purchase Rise Points.');
      return;
    }

    setBusy(true);
    try {
      const result = await processRisePointsPurchase(pkgId, userProfile.email);
      if (result?.success) {
        Alert.alert('Purchased', `Added ${result.pointsAdded} Rise Points.`);
        if (typeof onRefreshBalances === 'function') {
          await onRefreshBalances();
        }
      } else if (result?.pending) {
        Alert.alert('Purchase pending', 'Your purchase is awaiting store or server confirmation. Do not pay again. Use Restore Purchases in Premium or reopen your wallet later.');
      } else if (!result?.cancelled && result?.error) {
        Alert.alert('Purchase not completed', result.error);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <LinearGradient colors={[sunrise.background, sunrise.orangeTint]} style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(28, 16 + (insets?.bottom || 0) + 72) },
        ]}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.title}>💎 Wallet</Text>
          <Text style={styles.subtitle}>Your balances</Text>

          <View style={styles.balanceRow}>
            <View style={styles.balanceBox}>
              <Text style={styles.balanceValue}>🌟 {Number(risePoints || 0)}</Text>
              <Text style={styles.balanceLabel}>Rise Points</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', marginTop: 12 }}>
            <TouchableOpacity style={[styles.button, { flex: 1, marginRight: 8 }]} onPress={onOpenRewards}>
              <Text style={styles.buttonText}>Open Rewards Store ⭐</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, { flex: 1, marginLeft: 8 }]} onPress={onOpenPremium}>
              <Text style={styles.buttonText}>Premium 👑</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>🧾 Recent activity</Text>
          <Text style={styles.sectionText}>Latest Rise Points movements on your account.</Text>

          {recentLoading ? <ActivityIndicator style={{ marginTop: 12 }} color={sunrise.orange} /> : null}

          {!recentLoading && (!recent || recent.length === 0) ? (
            <Text style={[styles.sectionText, { marginTop: 10 }]}>
              No recent activity yet.
            </Text>
          ) : null}

          {!recentLoading && recent && recent.length ? recent.slice(0, 6).map((t, idx) => (
            <View key={String(t?.id ?? idx)} style={styles.activityRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.activityTitle} numberOfLines={1}>
                  {String(t?.reason || t?.description || 'Transaction')}
                </Text>
                <Text style={styles.activitySub} numberOfLines={1}>
                  {t?.createdAt ? new Date(t.createdAt).toLocaleString() : ''}
                </Text>
              </View>
              <Text style={styles.activityDelta}>
                {Number(t?.delta || 0) >= 0 ? '+' : ''}{Number(t?.delta || 0)}
              </Text>
            </View>
          )) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>👑 Premium</Text>
          <Text style={styles.sectionText}>
            {sub?.tier === MonetizationService.TIERS.PREMIUM
              ? 'You’re on Premium.'
              : sub?.tier === MonetizationService.TIERS.TRIAL
              ? 'You’re on a Free Trial.'
              : 'You’re on the Free plan.'}
          </Text>
          <TouchableOpacity style={[styles.button, { marginTop: 10 }]} onPress={onOpenPremium}>
            <Text style={styles.buttonText}>Manage / Upgrade</Text>
          </TouchableOpacity>
        </View>

        <RechargeControls key={userProfile?.id || userProfile?.email || 'guest'} userProfile={userProfile} onRefreshBalances={onRefreshBalances} />

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Buy Rise Points</Text>
          <Text style={styles.sectionText}>Choose a pack to add Rise Points to your wallet.</Text>

          {!pricing && (
            <Text style={[styles.sectionText, { marginTop: 10 }]}>
              Pricing is unavailable right now.
            </Text>
          )}

          {!!pricing && packages.length === 0 && (
            <Text style={[styles.sectionText, { marginTop: 10 }]}>
              No Rise Points packages are configured yet.
            </Text>
          )}

          {packages.map((p) => (
            <View key={p.id} style={styles.packageRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.packageTitle}>{p.points} Rise Points</Text>
                <Text style={styles.packageSub}>{p.displayPrice || formatMoney(p.amount, p.currency)}</Text>
              </View>
              <TouchableOpacity style={styles.smallButton} onPress={() => purchase(p.id)} disabled={busy}>
                <Text style={styles.smallButtonText}>{busy ? '...' : 'Buy'}</Text>
              </TouchableOpacity>
            </View>
          ))}

          {busy && <ActivityIndicator style={{ marginTop: 12 }} color={sunrise.orange} />}
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: sunrise.background },
  content: { padding: 16, paddingBottom: 28 },
  card: {
    borderWidth: 1, borderColor: sunrise.border,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  title: { color: sunrise.ink, fontSize: 20, fontWeight: '900' },
  subtitle: { color: sunrise.muted, marginTop: 6 },
  balanceRow: { flexDirection: 'row', marginTop: 12 },
  balanceBox: {
    borderWidth: 1, borderColor: sunrise.border,
    flex: 1,
    backgroundColor: sunrise.orangeTint,
    borderRadius: 14,
    padding: 12,
  },
  balanceValue: { color: sunrise.ink, fontSize: 18, fontWeight: '900' },
  balanceLabel: { color: sunrise.muted, marginTop: 6 },
  sectionTitle: { color: sunrise.ink, fontSize: 16, fontWeight: '900' },
  sectionText: { color: sunrise.muted, marginTop: 8 },
  button: {
    backgroundColor: sunrise.orangeTint,
    borderWidth: 1, borderColor: sunrise.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  buttonText: { color: sunrise.ink, fontWeight: '900' },
  packageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: sunrise.border,
  },
  packageTitle: { color: sunrise.ink, fontWeight: '900' },
  packageSub: { color: sunrise.muted, marginTop: 4 },
  smallButton: {
    backgroundColor: sunrise.orange,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginLeft: 10,
  },
  smallButtonText: { color: sunrise.ink, fontWeight: '900' },

  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: sunrise.border,
  },
  activityTitle: { color: sunrise.ink, fontWeight: '900' },
  activitySub: { color: sunrise.muted, marginTop: 4, fontSize: 12 },
  activityDelta: { color: sunrise.ink, fontWeight: '900', marginLeft: 10 },
});


