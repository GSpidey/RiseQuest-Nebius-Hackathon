/**
 * RiseQuest Mobile Purchase Service
 * Handles Rise Points (XCOIN) and subscription purchases
 * Aligned with Stripe configuration for RiseQuest platform
 */

import { getBackendBaseUrl } from '../config/backendConfig';
import { authHeaders } from './AuthTokenStorage';
import StripePaymentService from './StripePaymentService';

export interface RisePointsPackage {
  id: string;
  name: string;
  description: string;
  price: number; // in cents
  displayPrice: string;
  points: number;
  bonus: number;
  total: number;
  priceId?: string | null; // Stripe price ID (provided by backend)
  bonusPercentage: number;
  recommendedFor: 'casual' | 'regular' | 'frequent' | 'power';
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  interval: 'month' | 'year';
  price: number; // in cents
  displayPrice: string;
  stripePriceId?: string | null;
  features: string[];
  benefits: {
    adFree: boolean;
    aiCoach: boolean;
    locationFeatures: boolean;
    advancedAlarms: boolean;
    unlimitedThemes: boolean;
    premiumSounds: boolean;
  };
}

export interface PurchaseRequest {
  packageId: string;
  priceId: string;
  userId: string;
}

export interface PurchaseResponse {
  success: boolean;
  transactionId?: string;
  newBalance?: {
    risePoints: number;
    premiumCredits: number;
  };
  subscriptionId?: string;
  error?: string;
}

async function fetchWalletBalance(userId: string): Promise<{ risePoints: number } | null> {
  try {
    const baseUrl = await getBackendBaseUrl();
    const resp = await fetch(`${baseUrl}/api/wallet/balance?userId=${encodeURIComponent(userId)}`, { headers: await authHeaders() });
    const json = await resp.json();
    if (!resp.ok || json?.error) return null;
    return { risePoints: Number(json.balance || 0) };
  } catch {
    return null;
  }
}

let offeringsCache: {
  risePoints: RisePointsPackage[];
  subscriptions: SubscriptionPlan[];
  lastFetchedAt: number | null;
} = {
  risePoints: [],
  subscriptions: [],
  lastFetchedAt: null,
};

function formatMoney(amount: number, currency: string) {
  const c = String(currency || 'usd').toUpperCase();
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(Number(amount));
  } catch {
    return `${amount}`;
  }
}

export class RiseQuestMobilePurchaseService {

  /**
   * Fetch offerings from backend (/api/pricing-config) and cache them.
   */
  static async refreshOfferings(): Promise<{ risePoints: RisePointsPackage[]; subscriptions: SubscriptionPlan[] }> {
    const cfg = await StripePaymentService.getPricingConfig();
    if (!cfg || cfg?.error) {
      throw new Error(cfg?.error || 'Failed to fetch pricing config');
    }

    const rp = cfg?.risepoints || {};
    const subs = cfg?.subscriptions || {};

    const risePoints: RisePointsPackage[] = [
      { key: 'small', id: 'points_small', name: 'Rise Points Small', recommendedFor: 'casual' as const },
      { key: 'medium', id: 'points_medium', name: 'Rise Points Medium', recommendedFor: 'regular' as const },
      { key: 'large', id: 'points_large', name: 'Rise Points Large', recommendedFor: 'frequent' as const },
      { key: 'mega', id: 'points_mega', name: 'Rise Points Mega', recommendedFor: 'power' as const },
    ].map((base) => {
      const row = rp[base.key] || {};
      const amount = Number(row.amount || 0);
      const currency = String(row.currency || 'usd').toUpperCase();
      const points = Number(row.points || 0);
      return {
        id: base.id,
        name: base.name,
        description: 'Purchase Rise Points to unlock rewards and cosmetics',
        price: Math.round(amount * 100),
        displayPrice: row.displayPrice || formatMoney(amount, currency),
        points,
        bonus: 0,
        total: points,
        bonusPercentage: 0,
        priceId: row.priceId ?? null,
        recommendedFor: base.recommendedFor,
      };
    });

    const subscriptions: SubscriptionPlan[] = [
      {
        key: 'monthly',
        id: 'premium_monthly',
        name: 'RiseQuest Premium (Monthly)',
        interval: 'month' as const,
        features: [
          'Ad-free experience',
          'AI-powered wake-up coach',
          'Advanced location-based alarms',
          'Unlimited custom themes',
          'Premium sound library',
          'Advanced analytics',
          'Priority customer support',
        ],
      },
      {
        key: 'yearly',
        id: 'premium_yearly',
        name: 'RiseQuest Premium (Yearly)',
        interval: 'year' as const,
        features: [
          'Everything in Monthly Premium',
          'Annual progress reports',
          'Exclusive yearly challenges',
          'Premium customer support',
        ],
      },
    ].map((base) => {
      const row = subs[base.key] || {};
      const amount = Number(row.amount || 0);
      const currency = String(row.currency || 'usd').toUpperCase();
      return {
        id: base.id,
        name: base.name,
        description: 'Advanced alarms, AI coach, location features, ad-free experience',
        interval: base.interval,
        price: Math.round(amount * 100),
        displayPrice: `${row.displayPrice || formatMoney(amount, currency)}/${base.interval}`,
        stripePriceId: row.priceId ?? null,
        features: base.features,
        benefits: {
          adFree: true,
          aiCoach: true,
          locationFeatures: true,
          advancedAlarms: true,
          unlimitedThemes: true,
          premiumSounds: true,
        },
      };
    });

    offeringsCache = {
      risePoints,
      subscriptions,
      lastFetchedAt: Date.now(),
    };

    return { risePoints, subscriptions };
  }
  
  /**
   * Rise Points packages (backend-driven). Call refreshOfferings() to populate.
   */
  static getRisePointsPackages(): RisePointsPackage[] {
    return offeringsCache.risePoints;
  }

  /**
   * Subscription plans (backend-driven). Call refreshOfferings() to populate.
   */
  static getSubscriptionPlans(): SubscriptionPlan[] {
    return offeringsCache.subscriptions;
  }

  /**
   * Get all available packages and plans
   */
  static getAllOfferings() {
    return {
      risePoints: this.getRisePointsPackages(),
      subscriptions: this.getSubscriptionPlans()
    };
  }

  /**
   * Find Rise Points package by ID
   */
  static findRisePointsPackageById(packageId: string): RisePointsPackage | null {
    const packages = this.getRisePointsPackages();
    return packages.find(pkg => pkg.id === packageId) || null;
  }

  /**
   * Find subscription plan by ID
   */
  static findSubscriptionPlanById(planId: string): SubscriptionPlan | null {
    const plans = this.getSubscriptionPlans();
    return plans.find(plan => plan.id === planId) || null;
  }

  /**
   * Purchase Rise Points package
   */
  static async purchaseRisePoints(
    userId: string,
    packageId: string
  ): Promise<PurchaseResponse> {
    void userId;
    void packageId;
    return {
      success: false,
      error: 'Use the Wallet + Stripe PaymentSheet flow to purchase RisePoints',
    };
  }

  /**
   * Purchase subscription plan
   */
  static async purchaseSubscription(
    userId: string,
    planId: string
  ): Promise<PurchaseResponse> {
    try {
      const planInfo = this.findSubscriptionPlanById(planId);
      if (!planInfo) {
        return {
          success: false,
          error: 'Subscription plan not found'
        };
      }

      void userId;
      return {
        success: false,
        error: 'Use the Premium Upgrade screen (Stripe PaymentSheet) to subscribe',
      };
    } catch (error) {
      console.error('Error purchasing subscription:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  // Backward-compatible typo alias
  static async purchribeSubscription(userId: string, planId: string): Promise<PurchaseResponse> {
    return this.purchaseSubscription(userId, planId);
  }

  /**
   * Calculate subscription savings
   */
  static calculateSubscriptionSavings(planId: string): { percentage: number; amount: number } | null {
    const plan = this.findSubscriptionPlanById(planId);
    if (!plan || plan.interval !== 'year') return null;

    const monthlyPlan = this.getSubscriptionPlans().find(
      p => p.interval === 'month'
    );

    if (!monthlyPlan) return null;

    const yearlyEquivalent = monthlyPlan.price * 12;
    const savings = yearlyEquivalent - plan.price;
    const percentage = Math.round((savings / yearlyEquivalent) * 100);

    return {
      percentage,
      amount: savings
    };
  }

  /**
   * Get rise points value calculation
   */
  static calculatePointsValue(packageId: string): {
    pricePerPoint: number;
    totalValue: number;
    bestValue: boolean;
    bonusValue: number;
  } | null {
    const packageInfo = this.findRisePointsPackageById(packageId);
    if (!packageInfo) return null;

    const pricePerPoint = packageInfo.price / packageInfo.total;
    const allPackages = this.getRisePointsPackages();
    const bestPricePerPoint = Math.min(...allPackages.map(pkg => pkg.price / pkg.total));

    return {
      pricePerPoint: pricePerPoint / 100, // Convert to dollars
      totalValue: packageInfo.total,
      bestValue: pricePerPoint === bestPricePerPoint,
      bonusValue: packageInfo.bonus
    };
  }

  /**
   * Format currency for display
   */
  static formatCurrency(cents: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(cents / 100);
  }

  /**
   * Get purchase history for user
   */
  static async getPurchaseHistory(userId: string): Promise<any[]> {
    try {
      // If the backend provides history endpoints later, wire them here.
      // For now, return empty history (no mock rows).
      void userId;
      return [];
    } catch (error) {
      console.error('Error getting purchase history:', error);
      return [];
    }
  }

  /**
   * Validate purchase eligibility
   */
  static async validatePurchaseEligibility(
    userId: string,
    packageId: string
  ): Promise<{
    eligible: boolean;
    reason?: string;
  }> {
    try {
      // Basic validation - in production, you might check payment methods, account status, etc.
      const packageInfo = this.findRisePointsPackageById(packageId) || 
                          this.findSubscriptionPlanById(packageId);
      
      if (!packageInfo) {
        return {
          eligible: false,
          reason: 'Package not found'
        };
      }

      return {
        eligible: true
      };
    } catch (error) {
      console.error('Error validating purchase eligibility:', error);
      return {
        eligible: false,
        reason: 'Validation error occurred'
      };
    }
  }

  /**
   * Get package comparison for UI
   */
  static getPackageComparison() {
    const pointsPackages = this.getRisePointsPackages();
    const subscriptions = this.getSubscriptionPlans();

    return {
      risePoints: {
        title: 'Rise Points',
        symbol: '🌅',
        description: 'Gamified points to unlock themes, sounds, challenges, and premium features',
        packages: pointsPackages.map(pkg => ({
          ...pkg,
          valueData: this.calculatePointsValue(pkg.id)
        }))
      },
      subscriptions: {
        title: 'RiseQuest Premium',
        symbol: '⭐',
        description: 'Advanced alarms, AI coach, location features, ad-free experience',
        packages: subscriptions.map(sub => ({
          ...sub,
          savings: this.calculateSubscriptionSavings(sub.id)
        }))
      }
    };
  }

  /**
   * Get gamification features for rise points
   */
  static getGamificationFeatures() {
    return {
      earningMethods: [
        { action: 'Daily login', points: 10, description: 'Login each day to earn points' },
        { action: 'Complete alarm (Easy)', points: 5, description: 'Successfully wake up with easy alarm' },
        { action: 'Complete alarm (Normal)', points: 10, description: 'Successfully wake up with normal alarm' },
        { action: 'Complete alarm (Hard)', points: 15, description: 'Successfully wake up with hard alarm' },
        { action: 'Complete alarm (Extreme)', points: 25, description: 'Successfully wake up with extreme alarm' },
        { action: 'Snooze challenge (Math)', points: 15, description: 'Complete math challenge to stop snooze' },
        { action: 'Snooze challenge (Puzzle)', points: 20, description: 'Complete puzzle challenge to stop snooze' },
        { action: 'Snooze challenge (Memory)', points: 18, description: 'Complete memory challenge to stop snooze' },
        { action: 'Snooze challenge (Physical)', points: 25, description: 'Complete physical challenge to stop snooze' },
        { action: 'Weekly streak bonus', points: 'Variable', description: 'Bonus points for maintaining streaks' }
      ],
      spendingOptions: [
        { item: 'Premium theme', cost: 50, description: 'Unlock custom alarm themes' },
        { item: 'Advanced features', cost: 100, description: 'Unlock location-based alarms and AI coach' },
        { item: 'Custom sounds', cost: 25, description: 'Unlock premium alarm sounds' },
        { item: 'Challenge modes', cost: 75, description: 'Unlock advanced snooze challenges' }
      ]
    };
  }
}

export default RiseQuestMobilePurchaseService;
