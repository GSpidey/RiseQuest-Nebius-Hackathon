import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MonetizationService } from '../utils/MonetizationService';
import { useStripePayments } from '../services/StripePaymentService';
import StripePaymentService from '../services/StripePaymentService';
import { usesStoreBilling, restoreStorePurchases } from '../services/StorePurchaseService';
import { getBackendBaseUrl } from '../config/backendConfig';

export default function PremiumUpgradeModal({ visible, onClose, source = 'general', userProfile }) {
  const insets = useSafeAreaInsets();
  const [selectedTier, setSelectedTier] = useState('premium'); // premium | family
  const [selectedPlan, setSelectedPlan] = useState('yearly'); // monthly | yearly | family_monthly | family_yearly
  const [subscription, setSubscription] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [busy, setBusy] = useState(false);
  const { processSubscription } = useStripePayments();

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    const load = async () => {
      try {
        const [sub, cfg] = await Promise.all([
          MonetizationService.getUserSubscription(),
          StripePaymentService.getPricingConfig(),
        ]);
        if (!alive) return;
        setSubscription(sub || null);
        setPricing(cfg || null);
      } catch (_) {
        if (!alive) return;
        setPricing(null);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [visible]);

  const formatPrice = (amount, currency) => {
    if (amount == null) return '';
    const c = String(currency || 'usd').toUpperCase();
    const symbol = c === 'USD' ? '$' : c === 'CAD' ? '$' : c === 'EUR' ? '€' : c === 'GBP' ? '£' : '$';
    return `${symbol}${Number(amount).toFixed(2)}`;
  };

  const getSourceMessage = () => {
    const messages = {
      locked_mini_game: '🎮 Unlock all mini-games and take your morning challenges to the next level!',
      streak_protection: '🔥 Protect your amazing streak and unlock unlimited tracking!',
      missed_alarm: 'Explore more options for your wake-up routine.',
      weather: '🌤️ Get complete weather insights for perfect wake-up timing!',
      trial_expired: 'Your trial has ended. Choose a plan if you would like to keep Premium.',
      general: '👑 Upgrade to Premium and transform your mornings!',
      header: '👑 Upgrade to Premium and transform your mornings!',
      wallet: '👑 Upgrade to Premium and transform your mornings!',
    };
    return messages[source] || messages.general;
  };

  const tierCopy = useMemo(() => {
    if (selectedTier === 'family') {
      return {
        title: '👑 RiseQuest Family',
        subtitle: 'Share Premium benefits with your household.',
      };
    }

    return {
      title: '👑 RiseQuest Premium',
      subtitle: 'Unlock the full RiseQuest experience for your account.',
    };
  }, [selectedTier]);

  const plans = useMemo(() => {
    const monthly = pricing?.subscriptions?.monthly;
    const yearly = pricing?.subscriptions?.yearly;
    const familyMonthly = pricing?.subscriptions?.family_monthly;
    const familyYearly = pricing?.subscriptions?.family_yearly;
    return [
      {
        id: 'yearly',
        tier: 'premium',
        name: 'Yearly',
        price: yearly?.displayPrice || formatPrice(yearly?.amount, yearly?.currency),
        period: '/year',
        popular: true,
        monthlyEquivalent: null,
        priceId: yearly?.priceId || null,
      },
      {
        id: 'monthly',
        tier: 'premium',
        name: 'Monthly',
        price: monthly?.displayPrice || formatPrice(monthly?.amount, monthly?.currency),
        period: '/month',
        popular: false,
        monthlyEquivalent: null,
        priceId: monthly?.priceId || null,
      },
      {
        id: 'family_yearly',
        tier: 'family',
        name: 'Family Yearly',
        price: familyYearly?.displayPrice || formatPrice(familyYearly?.amount, familyYearly?.currency),
        period: '/year',
        popular: true,
        monthlyEquivalent: null,
        priceId: familyYearly?.priceId || null,
      },
      {
        id: 'family_monthly',
        tier: 'family',
        name: 'Family Monthly',
        price: familyMonthly?.displayPrice || formatPrice(familyMonthly?.amount, familyMonthly?.currency),
        period: '/month',
        popular: false,
        monthlyEquivalent: null,
        priceId: familyMonthly?.priceId || null,
      },
    ];
  }, [pricing]);

  const visiblePlans = useMemo(() => {
    return plans.filter((p) => p.tier === selectedTier);
  }, [plans, selectedTier]);

  const selectedPlanHasPriceId = Boolean(pricing?.subscriptions?.[selectedPlan]?.priceId);

  const handleUpgrade = async (planType) => {
    if (busy) return;
    setBusy(true);
    try {
      if (planType === 'trial') {
        const success = await MonetizationService.startFreeTrial();
        if (success) onClose();
        return;
      }

      if (!selectedPlanHasPriceId) {
        Alert.alert('Pricing not ready', 'Subscription pricing is not loaded yet. Please try again in a moment.');
        return;
      }

      const customerEmail = userProfile?.email;
      if (!customerEmail) {
        Alert.alert('Missing Email', 'Please sign in first so we can attach your subscription to your account.');
        return;
      }

      const result = await processSubscription(planType, customerEmail);
      if (result?.success) {
        await MonetizationService.activatePremiumForPlan(planType, {
          stripeSubscriptionId: result.subscriptionId,
        });
        onClose();
      } else if (result?.pending) {
        Alert.alert('Purchase pending', 'The store or server is still confirming this purchase. Do not pay again. Use Restore Purchases to check it later.');
      } else if (!result?.cancelled && result?.error) {
        Alert.alert('Purchase not completed', result.error);
      }
    } catch (error) {
      Alert.alert('Could not complete upgrade', error.message || 'Please try again.');
    } finally { setBusy(false); }
  };

  const features = [
    ...(selectedTier === 'family'
      ? [{ icon: '👨‍👩‍👧‍👦', text: 'Family plan access', highlight: true }]
      : []),
    { icon: '🎮', text: 'All mini-games unlocked', highlight: true },
    { icon: '📞', text: 'Wake-up support tools', highlight: true },
    { icon: '🚫', text: 'Ad‑free experience', highlight: false },
    { icon: '⚡', text: 'Priority support', highlight: false },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
    >
      <SafeAreaProvider><SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <LinearGradient colors={['#667eea', '#764ba2']} style={styles.container}>
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close plan options" style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{tierCopy.title}</Text>
            <Text style={styles.subtitle}>{getSourceMessage()}</Text>
            <Text style={styles.tierSubtext}>{tierCopy.subtitle}</Text>
          </View>

          <View style={styles.featuresContainer}>
            <Text style={styles.featuresTitle}>✨ Included</Text>
            {features.map((f) => (
              <View key={f.text} style={styles.featureRow}>
                <Text style={styles.featureIcon}>{f.icon}</Text>
                <Text style={[styles.featureText, f.highlight && styles.featureHighlight]}>{f.text}</Text>
                {f.highlight && <Text style={styles.newBadge}>HOT</Text>}
              </View>
            ))}
          </View>

          <View style={styles.plansContainer}>
            <Text style={styles.plansTitle}>Choose Your Plan:</Text>

            <View style={styles.tierRow}>
              <Pressable
                onPress={() => {
                  setSelectedTier('premium');
                  setSelectedPlan('yearly');
                }}
                style={({ pressed }) => [
                  styles.tierChip,
                  selectedTier === 'premium' && styles.tierChipActive,
                  pressed && { opacity: 0.92 },
                ]}
              >
                <Text style={[styles.tierChipText, selectedTier === 'premium' && styles.tierChipTextActive]}>Premium</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setSelectedTier('family');
                  setSelectedPlan('family_yearly');
                }}
                style={({ pressed }) => [
                  styles.tierChip,
                  selectedTier === 'family' && styles.tierChipActive,
                  pressed && { opacity: 0.92 },
                ]}
              >
                <Text style={[styles.tierChipText, selectedTier === 'family' && styles.tierChipTextActive]}>Family</Text>
              </Pressable>
            </View>

            {visiblePlans.map((plan) => (
              <Pressable
                key={plan.id}
                onPress={() => setSelectedPlan(plan.id)}
                style={({ pressed }) => [
                  styles.planCard,
                  plan.popular && styles.planCardPopular,
                  selectedPlan === plan.id && styles.planCardSelected,
                  pressed && { opacity: 0.92 },
                ]}
              >
                {plan.popular && (
                  <View style={styles.popularBadge} pointerEvents="none">
                    <Text style={styles.popularBadgeText}>YEARLY PLAN</Text>
                  </View>
                )}

                <View style={styles.planHeader}>
                  <Text style={styles.planName}>{plan.name}</Text>
                </View>

                <View style={styles.planPricing}>
                  <Text style={styles.planPrice}>{plan.price || '—'}</Text>
                  <Text style={styles.planPeriod}>{plan.period}</Text>
                </View>

                {!!plan.monthlyEquivalent && <Text style={styles.planEquivalent}>{plan.monthlyEquivalent}</Text>}
              </Pressable>
            ))}
          </View>

          <View style={[styles.footer, { paddingBottom: Math.max(12, (insets?.bottom || 0) + 12) }]}>
            {!subscription?.trialUsed && (
              <TouchableOpacity disabled={busy} style={styles.trialButton} onPress={() => handleUpgrade('trial')}>
                <Text style={styles.trialButtonText}>🎁 Start 7-Day FREE Trial</Text>
                <Text style={styles.trialButtonSubtext}>No card needed. Does not renew or charge you.</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity disabled={busy || !selectedPlanHasPriceId} style={styles.upgradeButton} onPress={() => handleUpgrade(selectedPlan)}>
              <Text style={styles.upgradeButtonText}>
                {busy ? 'Please wait…' : 'Subscribe'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.laterButton} onPress={onClose}>
              <Text style={styles.laterButtonText}>Maybe Later</Text>
            </TouchableOpacity>

            <Text style={styles.tierSubtext}>Subscriptions renew automatically at the displayed price and period until canceled. Cancel in your store subscription settings before renewal. Your existing paid access remains available.</Text>
            {usesStoreBilling() && <TouchableOpacity style={styles.laterButton} disabled={busy} onPress={async () => {
              setBusy(true);
              try {
                const result = await restoreStorePurchases();
                setSubscription(await MonetizationService.getUserSubscription({ force: true }));
                Alert.alert('Purchases checked', result.pending ? 'Some receipts are still being confirmed. Do not purchase again.' : 'Your verified purchases and subscription access are up to date.');
              } catch (error) { Alert.alert('Could not restore purchases', error.message); }
              finally { setBusy(false); }
            }}><Text style={styles.laterButtonText}>Restore Purchases</Text></TouchableOpacity>}
            {usesStoreBilling() && <TouchableOpacity style={styles.laterButton} onPress={() => Linking.openURL(Platform.OS === 'ios'
              ? 'https://apps.apple.com/account/subscriptions'
              : 'https://play.google.com/store/account/subscriptions?package=com.risequest.app').catch(() => Alert.alert('Open your store', 'Manage subscriptions in your App Store or Google Play account.'))}>
              <Text style={styles.laterButtonText}>Manage Subscriptions</Text>
            </TouchableOpacity>}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20 }}>
              {['privacy', 'terms'].map(page => <TouchableOpacity key={page} style={styles.laterButton} onPress={async () => {
                try { await Linking.openURL(`${await getBackendBaseUrl()}/legal/${page}`); }
                catch (_) { Alert.alert('Could not open page', 'Please check your internet connection.'); }
              }}><Text style={styles.laterButtonText}>{page === 'privacy' ? 'Privacy' : 'Terms'}</Text></TouchableOpacity>)}
            </View>
          </View>
          </ScrollView>
        </LinearGradient>
      </SafeAreaView></SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  closeButton: {
    alignSelf: 'flex-end',
    width: 48,
    height: 48,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  title: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 18,
    textAlign: 'center',
  },
  buildMarker: {
    marginTop: 6,
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 22,
  },
  tierSubtext: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'center',
    marginTop: 6,
    fontWeight: '700',
  },
  featuresContainer: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 15,
    padding: 14,
    marginHorizontal: 20,
    marginTop: 8,
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
    textAlign: 'center',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  featureIcon: {
    fontSize: 18,
    marginRight: 10,
    width: 26,
    textAlign: 'center',
  },
  featureText: {
    flex: 1,
    fontSize: 15,
    color: 'rgba(255,255,255,0.92)',
  },
  featureHighlight: {
    color: '#fff',
    fontWeight: '700',
  },
  newBadge: {
    backgroundColor: '#ff6b6b',
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  plansContainer: {
    marginHorizontal: 20,
    marginTop: 14,
  },
  tierRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 10,
  },
  tierChip: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  tierChipActive: {
    backgroundColor: 'rgba(255,255,255,0.26)',
    borderColor: 'rgba(255,255,255,0.35)',
  },
  tierChipText: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '800',
  },
  tierChipTextActive: {
    color: '#fff',
  },
  plansTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
  },
  planCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 15,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  planCardSelected: {
    borderColor: '#ffd700',
    backgroundColor: 'rgba(255,215,0,0.18)',
  },
  planCardPopular: {
    borderColor: '#ff6b6b',
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    left: 16,
    backgroundColor: '#ff6b6b',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 15,
  },
  popularBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  planName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  planPricing: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  planPrice: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#fff',
  },
  planPeriod: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    marginLeft: 6,
  },
  planEquivalent: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 6,
  },
  footer: {
    marginTop: 'auto',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  trialButton: {
    backgroundColor: '#48bb78',
    borderRadius: 15,
    padding: 14,
    alignItems: 'center',
  },
  trialButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  trialButtonSubtext: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    marginTop: 5,
  },
  upgradeButton: {
    backgroundColor: '#ffd700',
    borderRadius: 15,
    padding: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  upgradeButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  laterButton: {
    alignItems: 'center',
    padding: 12,
  },
  laterButtonText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
  },
});
