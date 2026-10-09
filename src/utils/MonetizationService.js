import { getAuthToken } from '../services/AuthTokenStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { GoogleLocationService } from '../services/GoogleLocationService';
import { getBackendBaseUrl } from '../config/backendConfig';
import riseQuestWalletService from '../services/RiseQuestWalletService';
import { createSubscriptionRepository } from '../services/subscriptionRepository';

let upgradeModalHandler = null;

const normalizeUserId = (email) => String(email || '').trim().toLowerCase();

async function getSignedInUserId() {
  if (!await getAuthToken()) return null;
  const fromWallet = await AsyncStorage.getItem('risequest_user_id');
  if (fromWallet) return normalizeUserId(fromWallet);
  const email = await AsyncStorage.getItem('user_email');
  if (email) return normalizeUserId(email);
  return null;
}

const subscriptions = createSubscriptionRepository({ storage: AsyncStorage, identity: getSignedInUserId,
  request: async method => {
    const response = await fetch(`${await getBackendBaseUrl()}/api/store/${method === 'POST' ? 'trial' : 'entitlements'}`, {
      method, headers: { Authorization: `Bearer ${await getAuthToken()}`, 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: '{}' } : {}),
    });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || 'Subscription status unavailable.'), { status: response.status });
    return result;
  },
});

export const MonetizationService = {
  setUpgradeModalHandler(handler) {
    upgradeModalHandler = typeof handler === 'function' ? handler : null;
  },

  // Subscription tiers - Enhanced with family plans
  TIERS: {
    FREE: 'free',
    PREMIUM: 'premium',
    FAMILY: 'family',
    TRIAL: 'trial'
  },

  // Premium features gates - Enhanced for family plans
  PREMIUM_FEATURES: {
    UNLIMITED_MINI_GAMES: 'unlimited_mini_games',
    CUSTOM_VOICE_PACKS: 'custom_voice_packs',
    SLEEP_TRACKING: 'sleep_tracking',
    LOCATION_ALARMS: 'location_alarms',
    UNLIMITED_STREAK_TRACKING: 'unlimited_streak_tracking',
    MULTI_STAGE_ALARMS: 'multi_stage_alarms',
    EMERGENCY_BACKUP: 'emergency_backup',
    EXTENDED_WEATHER: 'extended_weather',
    AD_FREE: 'ad_free',
    PRIORITY_SUPPORT: 'priority_support',
    HABIT_BUILDER: 'habit_builder',
    ACHIEVEMENT_BADGES: 'achievement_badges',
    FAMILY_DASHBOARD: 'family_dashboard',
    PARENTAL_CONTROLS: 'parental_controls',
    MULTI_USER_SYNC: 'multi_user_sync',
    FAMILY_CHALLENGES: 'family_challenges',
    COSMETIC_STORE_ACCESS: 'cosmetic_store_access',
    RISE_POINTS_BONUS: 'rise_points_bonus'
  },

  // Pricing - Global localized pricing structure
  PRICING: {
    // Tier 1 Markets (Premium pricing)
    US: {
      MONTHLY: 5.99,
      YEARLY: 49.99,
      FAMILY_MONTHLY: 8.99,
      FAMILY_YEARLY: 79.99,
      currency: 'USD'
    },
    CA: {
      MONTHLY: 7.99,
      YEARLY: 69.99,
      FAMILY_MONTHLY: 11.99,
      FAMILY_YEARLY: 99.99,
      currency: 'CAD'
    },
    // Tier 2 Markets (Standard pricing)
    GB: {
      MONTHLY: 4.99,
      YEARLY: 39.99,
      FAMILY_MONTHLY: 7.99,
      FAMILY_YEARLY: 69.99,
      currency: 'GBP'
    },
    EU: {
      MONTHLY: 5.49,
      YEARLY: 44.99,
      FAMILY_MONTHLY: 8.49,
      FAMILY_YEARLY: 74.99,
      currency: 'EUR'
    },
    AU: {
      MONTHLY: 8.99,
      YEARLY: 79.99,
      FAMILY_MONTHLY: 13.99,
      FAMILY_YEARLY: 119.99,
      currency: 'AUD'
    },
    // Tier 3 Markets (Emerging economies - lower pricing)
    IN: {
      MONTHLY: 149,
      YEARLY: 1199,
      FAMILY_MONTHLY: 229,
      FAMILY_YEARLY: 1799,
      currency: 'INR'
    },
    BR: {
      MONTHLY: 12.90,
      YEARLY: 109.90,
      FAMILY_MONTHLY: 19.90,
      FAMILY_YEARLY: 169.90,
      currency: 'BRL'
    },
    // Default fallback (USD)
    DEFAULT: {
      MONTHLY: 5.99,
      YEARLY: 49.99,
      FAMILY_MONTHLY: 8.99,
      FAMILY_YEARLY: 79.99,
      currency: 'USD'
    },
    // Cosmetic pricing (same structure)
    COSMETICS: {
      VOICE_PACK: { US: 2.99, CA: 3.99, GB: 2.49, EU: 2.99, AU: 4.49, IN: 99, BR: 9.90 },
      THEME_PACK: { US: 2.99, CA: 3.99, GB: 2.49, EU: 2.99, AU: 4.49, IN: 99, BR: 9.90 },
      RISE_POINTS_SMALL: { US: 1.99, CA: 2.99, GB: 1.99, EU: 2.49, AU: 2.99, IN: 79, BR: 6.90 },
      RISE_POINTS_MEGA: { US: 19.99, CA: 26.99, GB: 16.99, EU: 19.99, AU: 29.99, IN: 649, BR: 59.90 }
    }
  },

  async getUserSubscription(options) {
    return subscriptions.get(options);
  },

  // Detect user region for localized pricing using Google Location Service
  async detectUserRegion() {
    try {
      // Use existing Google Location Service to get country
      const locationData = await GoogleLocationService.getCurrentLocation();
      
      if (locationData && locationData.address && locationData.address.country) {
        const country = locationData.address.country;
        
        // Map country names to pricing regions
        const countryToRegionMap = {
          'United States': 'US',
          'Canada': 'CA',
          'United Kingdom': 'GB',
          'Australia': 'AU',
          'India': 'IN',
          'Brazil': 'BR',
          // EU countries
          'Germany': 'EU',
          'France': 'EU',
          'Italy': 'EU',
          'Spain': 'EU',
          'Netherlands': 'EU',
          'Belgium': 'EU',
          'Austria': 'EU',
          'Finland': 'EU',
          'Sweden': 'EU',
          'Denmark': 'EU',
          'Norway': 'EU',
          'Poland': 'EU'
        };
        
        const region = countryToRegionMap[country] || 'DEFAULT';
        console.log(`🌍 Detected region: ${region} (Country: ${country})`);
        return region;
      }

      // Fallback to device locale if location fails
      console.log('📍 Location detection failed, using device locale fallback');
      return 'DEFAULT';
      
    } catch (error) {
      console.error('Region detection failed:', error);
      return 'DEFAULT';
    }
  },

  // Get localized pricing for user's region
  getLocalizedPricing(region = 'DEFAULT') {
    return this.PRICING[region] || this.PRICING.DEFAULT;
  },

  // Get Stripe price ID for user's region and plan
  async getStripePriceId(planType) {
    try {
      const baseUrl = await getBackendBaseUrl();
      const response = await fetch(`${baseUrl}/api/pricing-config`);
      const config = await response.json();
      return config?.subscriptions?.[planType]?.priceId || null;
    } catch (error) {
      console.error('Error getting Stripe price ID:', error);
      return null;
    }
  },

  // Get cosmetic item price ID for user's region
  async getCosmeticStripePriceId(itemType) {
    try {
      const baseUrl = await getBackendBaseUrl();
      const response = await fetch(`${baseUrl}/api/pricing-config`);
      const config = await response.json();
      return config?.cosmetics?.[itemType]?.priceId || null;
    } catch (error) {
      console.error('Error getting cosmetic price ID:', error);
      return null;
    }
  },

  // Get user's currency for display purposes
  async getUserCurrency() {
    try {
      const baseUrl = await getBackendBaseUrl();
      const response = await fetch(`${baseUrl}/api/pricing-config`);
      const config = await response.json();
      return config?.subscriptions?.monthly?.currency || 'usd';
    } catch (error) {
      console.error('Error getting user currency:', error);
      return 'usd';
    }
  },

  async updateUserSubscription(subscriptionData) {
    try {
      await subscriptions.update(subscriptionData);
    } catch (error) {
      console.error('Error updating subscription:', error);
    }
  },

  async startFreeTrial() {
    const subscription = await this.getUserSubscription();
    
    if (subscription.trialUsed) {
      Alert.alert('Trial Already Used', 'You have already used your free trial. Upgrade to Premium to continue enjoying all features!');
      return false;
    }

    const trialData = await subscriptions.startTrial();
    if (trialData.tier !== this.TIERS.TRIAL) return false;
    
    Alert.alert(
      '🎉 7-Day Premium Trial Started!',
      'Enjoy Premium for 7 days. No payment method is needed and this trial does not renew or charge you.'
    );
    
    return true;
  },

  async checkTrialExpiry() {
    const subscription = await this.getUserSubscription();
    
    if (subscription.tier === this.TIERS.TRIAL && subscription.endDate) {
      if (Date.now() > subscription.endDate) {
        // Trial expired, revert to free
        const expiredData = {
          ...subscription,
          tier: this.TIERS.FREE,
          startDate: null,
          endDate: null
        };
        
        await this.updateUserSubscription(expiredData);
        
        this.showTrialExpiredPrompt();
        return true;
      }
    }
    
    return false;
  },

  showTrialExpiredPrompt() {
    Alert.alert(
      '⏰ Trial Expired',
      'Your 7-day Premium trial has ended. Upgrade now to keep your streaks and unlock all features!',
      [
        { text: 'Maybe Later', style: 'cancel' },
        { 
          text: 'Upgrade Now! 🚀', 
          onPress: () => this.showUpgradeModal('trial_expired')
        }
      ]
    );
  },

  async checkFeatureAccess(feature) {
    const subscription = await this.getUserSubscription();
    
    // Premium and trial users have access to all features
    if ([this.TIERS.PREMIUM, this.TIERS.FAMILY, this.TIERS.TRIAL].includes(subscription.tier)) {
      return true;
    }
    
    // Check if user has purchased specific packs
    if (subscription.purchasedPacks && subscription.purchasedPacks.includes(feature)) {
      return true;
    }
    
    // Free tier limitations
    switch (feature) {
      case this.PREMIUM_FEATURES.UNLIMITED_MINI_GAMES:
        return false; // Only 1 basic game for free
      case this.PREMIUM_FEATURES.UNLIMITED_STREAK_TRACKING:
        return false; // Only 7-day tracking for free
      case this.PREMIUM_FEATURES.EXTENDED_WEATHER:
        return false; // Basic weather only
      default:
        return false;
    }
  },

  async addRisePoints(points, reason, metadata = {}) {
    const userId = await getSignedInUserId();
    const subscription = await this.getUserSubscription();

    // If signed in, persist to backend wallet ledger.
    if (userId) {
      try {
        await riseQuestWalletService.initializeForUser(userId, await getAuthToken());
        const result = await riseQuestWalletService.awardRisePoints(userId, points, String(reason || 'award'), metadata);
        const newPoints = Number(result?.balance ?? subscription.risePoints ?? 0);
        await this.updateUserSubscription({ ...subscription, risePoints: newPoints });
        return newPoints;
      } catch (e) {
        console.warn('Reward not credited:', e?.message);
        return Number(subscription.risePoints || 0);
      }
    }

    // Anonymous/local-only fallback.
    const newPoints = (subscription.risePoints || 0) + points;
    await this.updateUserSubscription({ ...subscription, risePoints: newPoints });
    return newPoints;
  },

  async spendRisePoints(points, item, metadata = {}) {
    const subscription = await this.getUserSubscription();

    const userId = await getSignedInUserId();
    if (userId) {
      try {
        await riseQuestWalletService.initializeForUser(userId, await getAuthToken());
        const result = await riseQuestWalletService.spendRisePoints(userId, points, String(item || 'spend'), metadata);
        const newPoints = Number(result?.balance ?? subscription.risePoints ?? 0);
        await this.updateUserSubscription({ ...subscription, risePoints: newPoints });
        return true;
      } catch (e) {
        const msg = String(e?.message || 'Failed to spend RisePoints');
        if (msg.toLowerCase().includes('insufficient')) {
          Alert.alert('Not Enough Points', `You need ${points} RisePoints to unlock ${item}`);
          return false;
        }
        Alert.alert('Purchase unavailable', msg);
        return false;
      }
    }

    if ((subscription.risePoints || 0) < points) {
      Alert.alert('Not Enough Points', `You need ${points} RisePoints to unlock ${item}`);
      return false;
    }

    const newPoints = (subscription.risePoints || 0) - points;
    await this.updateUserSubscription({ ...subscription, risePoints: newPoints });
    return true;
  },

  // Upsell trigger scenarios
  async triggerUpsell(scenario, context = {}) {
    const subscription = await this.getUserSubscription();
    
    // Don't show upsells to premium users
    if (subscription.tier === this.TIERS.PREMIUM) return;

    const upsellPrompts = {
      locked_mini_game: {
        title: '🎮 Unlock All Mini-Games',
        message: 'Access 8+ challenging mini-games with Premium! Math, puzzles, memory games and more await.',
        buttons: [
          { text: 'Stay Free', style: 'cancel' },
          { text: 'Get Premium 🚀', onPress: () => this.showUpgradeModal('locked_mini_game') }
        ]
      },
      
      streak_limit: {
        title: '🔥 Protect Your Streak!',
        message: `Amazing ${context.streak}-day streak! Upgrade to Premium for unlimited streak tracking and streak protection.`,
        buttons: [
          { text: 'Continue Free', style: 'cancel' },
          { text: 'Upgrade & Protect 🛡️', onPress: () => this.showUpgradeModal('streak_protection') }
        ]
      },
      
      missed_critical_alarm: {
        title: '🚨 Never Miss Important Alarms Again',
        message: 'Premium users get Emergency Backup Alerts and Wake-Up Calls from contacts. Upgrade to never oversleep again!',
        buttons: [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Upgrade for Safety 🛡️', onPress: () => this.showUpgradeModal('missed_alarm') }
        ]
      },
      
      weather_locked: {
        title: '🌤️ Get Full Weather Insights',
        message: 'Unlock 5-day forecasts, severe weather alerts, and smart wake-up recommendations with Premium!',
        buttons: [
          { text: 'Basic is Fine', style: 'cancel' },
          { text: 'Upgrade for Weather 🌈', onPress: () => this.showUpgradeModal('weather') }
        ]
      },
      
      pro_tip: {
        title: '💡 Pro Tip',
        message: 'Premium members wake up 23% more reliably and build stronger habits. Join thousands who upgraded!',
        buttons: [
          { text: 'Maybe Later', style: 'cancel' },
          { text: 'Join Premium Club 👑', onPress: () => this.showUpgradeModal('pro_tip') }
        ]
      }
    };

    const prompt = upsellPrompts[scenario];
    if (prompt) {
      Alert.alert(prompt.title, prompt.message, prompt.buttons);
    }
  },

  showUpgradeModal(source) {
    console.log(`Upgrade modal triggered from: ${source}`);

    if (upgradeModalHandler) {
      upgradeModalHandler(source);
      return;
    }
    
    Alert.alert('👑 Upgrade to Premium', 'Use the Upgrade button in the header to subscribe.');
  },

  async processPurchase() {
    this.showUpgradeModal('upsell');
  },

  async activatePremium() {
    return subscriptions.get({ force: true });
  },

  async activatePremiumForPlan(planType, { stripeSubscriptionId } = {}) {
    // PaymentSheet/store success alone does not prove a settled entitlement.
    return subscriptions.get({ force: true });
  },

  // Gamification rewards
  RISE_POINT_REWARDS: {
    DAILY_WAKEUP: 10,
    STREAK_MILESTONE: 50,
    CHALLENGE_COMPLETED: 25,
    PERFECT_WEEK: 100,
    EARLY_WAKEUP: 15,
    NO_SNOOZE: 20,
    // Quest System Rewards
    QUEST_CREATED: 15,
    QUEST_STEP_COMPLETED: 5,
    QUEST_COMPLETED: 50,
    QUEST_FOCUS_SESSION: 10,
    QUEST_STREAK_3: 25,
    QUEST_STREAK_7: 75,
    QUEST_PERFECT_EXECUTION: 100,
  },

  UNLOCKABLE_REWARDS: {
    BASIC_MINI_GAME: 100,
    VOICE_PACK_TRIAL: 200,
    THEME_UNLOCK: 150,
    PREMIUM_TRIAL_DAY: 500
  },

  // Free tier limitations
  FREE_LIMITS: {
    MINI_GAMES: 1, // Only math game
    STREAK_TRACKING_DAYS: 7,
    WEATHER_DAYS: 1, // Today only
    SNOOZE_CHALLENGES: 1, // Basic difficulty only
    VOICE_PACKS: 0, // Default voice only
    THEMES: 1 // Default theme only
  },

  async checkDailyLimits(action) {
    const subscription = await this.getUserSubscription();
    
    if (subscription.tier !== this.TIERS.FREE) {
      return true; // Premium/trial users have no limits
    }

    // Check specific free tier limits
    switch (action) {
      case 'mini_game_access':
        return true; // Allow basic mini-game
      case 'extended_streak':
        return false; // Block extended streak tracking
      case 'weather_forecast':
        return false; // Block extended weather
      default:
        return true;
    }
  },

  // Analytics for conversion optimization
  async trackUpsellInteraction(scenario, action) {
    // Track user interactions with upsell prompts
    const analytics = {
      scenario,
      action, // 'shown', 'dismissed', 'converted'
      timestamp: Date.now(),
      userTier: (await this.getUserSubscription()).tier
    };
    
    // In real app, send to analytics service
    console.log('Upsell Analytics:', analytics);
  },

  // Launch funnel
  async initializeNewUser() {
    const subscription = await this.getUserSubscription();
    
    if (!subscription.trialUsed) {
      // Show onboarding with trial offer
      Alert.alert(
        '🎉 Welcome to RiseQuest!',
        'Start your journey with a FREE 7-day Premium trial. Experience all features and build better morning habits!',
        [
          { text: 'Start Free Version', style: 'cancel' },
          { text: 'Start FREE Trial 🎁', onPress: () => this.startFreeTrial() }
        ]
      );
    }
  },

  // Ad management for free users
  shouldShowAd(location) {
    return new Promise(async (resolve) => {
      const subscription = await this.getUserSubscription();
      
      if (subscription.tier === this.TIERS.FREE) {
        // Only show ads on settings/weather pages, never on alarm screen
        const adLocations = ['settings', 'weather', 'stats'];
        resolve(adLocations.includes(location));
      } else {
        resolve(false); // Premium users see no ads
      }
    });
  },

  // Cosmetic store purchases
  async processCosmeticPurchase({ items, total, currency, userProfile }) {
    try {
      const subscription = await this.getUserSubscription();
      
      // Check parental approval for minors
      if (userProfile?.ageGroup === 'child' && total > 5.00) {
        const approval = await this.requestParentalApproval(total, items);
        if (!approval) {
          return { success: false, error: 'Parental approval required' };
        }
      }

      // Process payment via backend
      const paymentResult = await this.processCosmericPayment({
        items,
        total,
        currency,
        userEmail: userProfile?.email,
        userTier: subscription.tier
      });

      if (paymentResult.success) {
        // Update local storage with purchased items
        await this.updateCosmeticInventory(items);
        
        // Award bonus Rise Points for family plan users
        if (subscription.tier === this.TIERS.FAMILY) {
          const bonusPoints = Math.floor(total * 10); // 10 points per dollar
          await this.awardRisePoints(bonusPoints, 'cosmetic_purchase_bonus');
        }

        return { success: true, transactionId: paymentResult.transactionId };
      } else {
        return { success: false, error: paymentResult.error };
      }
    } catch (error) {
      console.error('Cosmetic purchase error:', error);
      return { success: false, error: error.message };
    }
  },

  // Rise Points bundle purchases
  async purchaseRisePointsBundle(bundleSize) {
    const bundlePricing = {
      small: { points: 500, price: this.PRICING.RISE_POINTS_SMALL },
      medium: { points: 1500, price: this.PRICING.RISE_POINTS_MEDIUM },
      large: { points: 3500, price: this.PRICING.RISE_POINTS_LARGE },
      mega: { points: 8000, price: this.PRICING.RISE_POINTS_MEGA }
    };

    const bundle = bundlePricing[bundleSize];
    if (!bundle) {
      return { success: false, error: 'Invalid bundle size' };
    }

    try {
      const paymentResult = await this.processCosmericPayment({
        items: [{ id: `rise_points_${bundleSize}`, name: `${bundle.points} Rise Points`, price: bundle.price }],
        total: bundle.price,
        currency: 'CAD',
        isRisePointsPurchase: true
      });

      if (paymentResult.success) {
        await this.awardRisePoints(bundle.points, 'direct_purchase');
        return { success: true, pointsAwarded: bundle.points };
      } else {
        return { success: false, error: paymentResult.error };
      }
    } catch (error) {
      console.error('Rise Points purchase error:', error);
      return { success: false, error: error.message };
    }
  },

  // Helper methods for cosmetic system
  async updateCosmeticInventory(items) {
    try {
      const existing = await AsyncStorage.getItem('purchasedCosmetics');
      const inventory = existing ? JSON.parse(existing) : [];
      
      const newItems = items.map(item => ({
        ...item,
        purchaseDate: new Date().toISOString(),
        active: false // User needs to manually activate
      }));

      await AsyncStorage.setItem('purchasedCosmetics', JSON.stringify([...inventory, ...newItems]));
    } catch (error) {
      console.error('Error updating cosmetic inventory:', error);
    }
  },

  async awardRisePoints(points, reason) {
    try {
      const subscription = await this.getUserSubscription();
      subscription.risePoints = (subscription.risePoints || 0) + points;
      
      await subscriptions.update(subscription);
      
      // Log the transaction
      const transaction = {
        type: 'rise_points_award',
        amount: points,
        reason,
        timestamp: Date.now(),
        balance: subscription.risePoints
      };
      
      const transactions = await AsyncStorage.getItem('risePointsTransactions');
      const history = transactions ? JSON.parse(transactions) : [];
      history.push(transaction);
      
      await AsyncStorage.setItem('risePointsTransactions', JSON.stringify(history));
    } catch (error) {
      console.error('Error awarding Rise Points:', error);
    }
  },

  async processCosmericPayment(paymentData) {
    console.warn('processCosmericPayment is deprecated. Use Stripe PaymentSheet flows from the UI.', paymentData);
    return { success: false, error: 'Use Stripe PaymentSheet purchase flow' };
  },

  async requestParentalApproval(amount, items) {
    console.log(`Parental approval requested for $${amount} purchase:`, items);
    return false;
  }
};
