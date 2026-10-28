import ModalHeading from './ModalHeading';
import Modal from './AppModal';
import { sunrise } from './SunriseUI';
import { useRiseQuestDialog } from './RiseQuestDialog';
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MonetizationService } from '../utils/MonetizationService';
import { useStripePayments } from '../services/StripePaymentService';
import StripePaymentService from '../services/StripePaymentService';
import { usesStoreBilling, restoreStorePurchases } from '../services/StorePurchaseService';
import { openLegalPage } from '../config/legalLinks';
import { getBackendBaseUrl } from '../config/backendConfig';

export default function PremiumUpgradeModal({ visible, onClose, source = 'general', userProfile }) {
  const {alert:notify,dialog}=useRiseQuestDialog();
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
      locked_mini_game: '🎮 Unlock adaptive mini-games and take your morning challenges to the next level!',
      streak_protection: 'Build your routine with Premium extras.',
      missed_alarm: 'Explore more options for your wake-up routine.',
      weather: 'Explore more ways to personalize your mornings.',
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
        subtitle: 'Premium extras for you and your approved child profiles.',
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

      if (!selectedPlanHasPriceId) {
        notify('Pricing not ready', 'Subscription pricing is not loaded yet. Please try again in a moment.');
        return;
      }

      const customerEmail = userProfile?.email;
      if (!customerEmail) {
        notify('Missing Email', 'Please sign in first so we can attach your subscription to your account.');
        return;
      }

      const result = await processSubscription(planType, customerEmail);
      if (result?.success) {
        await MonetizationService.activatePremiumForPlan(planType, {
          stripeSubscriptionId: result.subscriptionId,
        });
        onClose();
      } else if (result?.pending) {
        notify('Purchase pending', 'The store or server is still confirming this purchase. Do not pay again. Use Restore Purchases to check it later.');
      } else if (!result?.cancelled && result?.error) {
        notify('Purchase not completed', result.error);
      }
    } catch (error) {
      notify('Could not complete upgrade', error.message || 'Please try again.');
    } finally { setBusy(false); }
  };

  const selectedPricing = pricing?.subscriptions?.[selectedPlan];
  const allowance = selectedPricing?.allowance;
  const features = [
    { icon: '🧩', text: 'Five adaptive mind games', detail: 'Number paths, Memory garden, Order & flow, Word rhythm and Echo trail.' },
    { icon: '🌱', text: 'Practice that grows with you', detail: 'Six levels, saved progress and an untimed option. Difficulty responds to your recent rounds.' },
    { icon: '🪐', text: 'Luna & Nova companions', detail: 'Choose either subscription companion for your daily talks and plans while your plan is active.' },
    { icon: '🎙️', text: `${selectedPlan.startsWith('family') ? 200 : 100} realistic voice credits each month`, detail: 'For the adult plan holder’s companion replies. Each credit covers up to 250 characters. Resets on the 1st (UTC), including yearly plans; unused credits do not roll over. Optional extras: 5 RP per credit — 50% less than the 10 RP standard price. Alarm audio is priced separately.' },
    { icon: '💬', text: 'Hands-free companion conversations', detail: 'Speak, hear a reply and keep talking without repeated taps. Choose from 12 realistic alarm voices. On Android, opt into chatting while switching apps, with an ongoing Stop notification. Choose your own RP limit or no session cap; paid extras always require opt-in.' },
    { icon: '🍃', text: 'An ad-free experience', detail: 'Enjoy RiseQuest without default advertising. Optional ads remain your choice in Settings.' },
    ...(Number.isInteger(allowance) && allowance > 0 ? [{ icon: '⭐', text: `${allowance.toLocaleString()} Rise Points per paid ${selectedPlan.includes('yearly')?'year':'month'}`, detail: 'Added once after each verified payment. Spend them on themes, sounds, celebrations and permanent companion unlocks.' }] : []),
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
    >
      <SafeAreaProvider><SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <LinearGradient colors={[sunrise.background, sunrise.orangeTint]} style={styles.container}>
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close plan options" style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
            <ModalHeading title={tierCopy.title} icon="star"/>
            <Text style={styles.subtitle}>{getSourceMessage()}</Text>
            <Text style={styles.tierSubtext}>{tierCopy.subtitle}</Text>
          </View>

          <View style={styles.featuresContainer}>
            <Text style={styles.featuresTitle}>✨ Included</Text>
            {features.map((f) => (
              <View key={f.text} style={styles.featureRow}>
                <Text style={styles.featureIcon}>{f.icon}</Text>
                <View style={{flex:1,gap:5}}><Text style={[styles.featureText,{fontWeight:'800',flex:0}]}>{f.text}</Text><Text style={{color: sunrise.ink,fontSize:13,lineHeight:20}}>{f.detail}</Text></View>
              </View>
            ))}
          </View>
          <View style={[styles.featuresContainer,{backgroundColor:'#FFFFFF24'}]}>
            <Text style={styles.featuresTitle}>{selectedTier==='family'?'🏡 Room for your family':'☀️ Your everyday RiseQuest'}</Text>
            <Text style={{color: sunrise.ink,fontSize:14,lineHeight:23}}>{selectedTier==='family'?'Your approved child profiles can use your active subscription’s adaptive games and companions. Manage their settings, review activity and approve shop requests from Family profiles. Family plans include a larger Rise Points allowance.':'Keep your alarms, original games, quests, earned medals, collection and Wake Buddies together with your Premium extras.'}</Text>
            {selectedTier==='family'&&<Text style={{color: sunrise.ink,fontSize:12,lineHeight:19,marginTop:10}}>Parent consent and safety controls are available to every family. Rise Points are credited to the paying account; parents review and pay for approved child shop requests.</Text>}
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


            <TouchableOpacity disabled={busy || !selectedPlanHasPriceId} style={styles.upgradeButton} onPress={() => handleUpgrade(selectedPlan)}>
              <Text style={styles.upgradeButtonText}>
                {busy ? 'Please wait…' : 'Subscribe'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.laterButton} onPress={onClose}>
              <Text style={styles.laterButtonText}>Maybe Later</Text>
            </TouchableOpacity>

            {pricing?.subscriptions?.[selectedPlan]?.allowance > 0 && <Text style={styles.tierSubtext}>{pricing.subscriptions[selectedPlan].allowance} RisePoints each paid billing period: 50% of the plan’s reference point equivalent. Free trials do not grant points. Annual allowances are credited once for the year.</Text>}
            <Text style={styles.tierSubtext}>Subscriptions renew automatically at the displayed price and period until canceled. Cancel in your store subscription settings before renewal. Your existing paid access remains available.</Text>
            {usesStoreBilling() && <TouchableOpacity style={styles.laterButton} disabled={busy} onPress={async () => {
              setBusy(true);
              try {
                const result = await restoreStorePurchases();
                setSubscription(await MonetizationService.getUserSubscription({ force: true }));
                notify('Purchases checked', result.pending ? 'Some receipts are still being confirmed. Do not purchase again.' : 'Your verified purchases and subscription access are up to date.');
              } catch (error) { notify('Could not restore purchases', error.message); }
              finally { setBusy(false); }
            }}><Text style={styles.laterButtonText}>Restore Purchases</Text></TouchableOpacity>}
            {usesStoreBilling() && <TouchableOpacity style={styles.laterButton} onPress={() => Linking.openURL(Platform.OS === 'ios'
              ? 'https://apps.apple.com/account/subscriptions'
              : 'https://play.google.com/store/account/subscriptions?package=com.risequest.app').catch(() => notify('Open your store', 'Manage subscriptions in your App Store or Google Play account.'))}>
              <Text style={styles.laterButtonText}>Manage Subscriptions</Text>
            </TouchableOpacity>}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20 }}>
              {['privacy', 'eula'].map(page => <TouchableOpacity key={page} accessibilityRole="link" style={styles.laterButton} onPress={async () => {
                try { await openLegalPage(page); }
                catch (_) { notify('Could not open page', 'Please check your internet connection.'); }
              }}><Text style={styles.laterButtonText}>{page === 'privacy' ? 'Privacy Policy' : 'Terms of Use (EULA)'}</Text></TouchableOpacity>)}
            </View>
          </View>
          </ScrollView>
        </LinearGradient>
      </SafeAreaView></SafeAreaProvider>
      {dialog}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: sunrise.background,
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
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: sunrise.ink,
    fontSize: 18,
    fontWeight: 'bold',
  },
  title: {
    fontSize: 30,
    fontWeight: 'bold',
    color: sunrise.ink,
    marginTop: 18,
    textAlign: 'center',
  },
  buildMarker: {
    marginTop: 6,
    fontSize: 12,
    color: sunrise.muted,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 16,
    color: sunrise.muted,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 22,
  },
  tierSubtext: {
    fontSize: 13,
    color: sunrise.muted,
    textAlign: 'center',
    marginTop: 6,
    fontWeight: '700',
  },
  featuresContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 14,
    marginHorizontal: 20,
    marginTop: 8,
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: sunrise.ink,
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
    color: sunrise.muted,
  },
  featureHighlight: {
    color: sunrise.ink,
    fontWeight: '700',
  },
  newBadge: {
    backgroundColor: '#ff6b6b',
    color: sunrise.ink,
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
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 6,
    borderWidth: 1,
    borderColor: sunrise.border,
  },
  tierChipActive: {
    backgroundColor: sunrise.orangeTint,
    borderColor: sunrise.orange,
  },
  tierChipText: {
    color: sunrise.muted,
    fontWeight: '800',
  },
  tierChipTextActive: {
    color: sunrise.ink,
  },
  plansTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: sunrise.ink,
    textAlign: 'center',
    marginBottom: 10,
  },
  planCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: sunrise.border,
    position: 'relative',
  },
  planCardSelected: {
    borderColor: sunrise.orange,
    backgroundColor: sunrise.orangeTint,
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
    color: sunrise.ink,
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
    color: sunrise.ink,
  },
  planPricing: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  planPrice: {
    fontSize: 30,
    fontWeight: 'bold',
    color: sunrise.ink,
  },
  planPeriod: {
    fontSize: 15,
    color: sunrise.muted,
    marginLeft: 6,
  },
  planEquivalent: {
    fontSize: 13,
    color: sunrise.muted,
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
    color: sunrise.ink,
    fontSize: 16,
    fontWeight: 'bold',
  },
  trialButtonSubtext: {
    color: sunrise.muted,
    fontSize: 13,
    marginTop: 5,
  },
  upgradeButton: {
    backgroundColor: sunrise.orange,
    borderRadius: 15,
    padding: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  upgradeButtonText: {
    color: sunrise.ink,
    fontSize: 16,
    fontWeight: 'bold',
  },
  laterButton: {
    alignItems: 'center',
    padding: 12,
  },
  laterButtonText: {
    color: sunrise.muted,
    fontSize: 16,
  },
});

