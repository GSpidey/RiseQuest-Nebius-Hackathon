import { getBackendBaseUrl } from './backendConfig';

export async function fetchOfferings() {
  const baseUrl = await getBackendBaseUrl();
  const resp = await fetch(`${baseUrl}/api/pricing-config`);
  const cfg = await resp.json();
  if (!resp.ok || cfg?.error) throw new Error(cfg?.error || 'Failed to fetch pricing config');

  const rp = cfg?.risepoints || {};
  const subs = cfg?.subscriptions || {};

  return {
    risePointsPackages: {
      small: rp.small,
      medium: rp.medium,
      large: rp.large,
      mega: rp.mega,
    },
    subscriptionPlans: {
      monthly: subs.monthly,
      yearly: subs.yearly,
      family_monthly: subs.family_monthly,
      family_yearly: subs.family_yearly,
    },
  };
}

export const helpers = {
  formatCurrency: (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: String(currency).toUpperCase(),
    }).format(Number(amount));
  },
};

export default {
  fetchOfferings,
  helpers,
};
        analytics: true,
        prioritySupport: true,
        betaAccess: true
      }
    }
  },

  // Gamification system
  gamification: {
    earningRates: {
      dailyLogin: 10,
      alarmCompletion: {
        easy: 5,
        normal: 10,
        hard: 15,
        extreme: 25
      },
      snoozeChallenge: {
        math: 15,
        puzzle: 20,
        memory: 18,
        physical: 25
      },
      streakBonus: {
        multiplier: 2, // days * 2, max 100
        maxBonus: 100
      }
    },
    
    spendingOptions: {
      premiumTheme: 50,
      advancedFeatures: 100,
      customSounds: 25,
      challengeModes: 75,
      aiCoachUpgrade: 150,
      locationFeatures: 200
    }
  },

  // Purchase helper functions
  helpers: {
    // Calculate points value
    calculatePointsValue: (packageId) => {
      const pkg = riseQuestPricingConfig.risePointsPackages[packageId];
      if (!pkg) return null;
      
      const pricePerPoint = pkg.price / pkg.total;
      const allPackages = Object.values(riseQuestPricingConfig.risePointsPackages);
      const bestPricePerPoint = Math.min(...allPackages.map(p => p.price / p.total));
      
      return {
        pricePerPoint,
        totalValue: pkg.total,
        bestValue: pricePerPoint === bestPricePerPoint,
        bonusValue: pkg.bonus
      };
    },

    // Get recommended package based on usage
    getRecommendedPackage: (monthlyAlarms = 0, currentPoints = 0, streakDays = 0) => {
      if (currentPoints > 1000) return null; // Already has enough points
      
      if (monthlyAlarms > 60 || streakDays > 30) return 'mega';
      if (monthlyAlarms > 30 || streakDays > 14) return 'large';
      if (monthlyAlarms > 10 || streakDays > 7) return 'medium';
      return 'small';
    },

    // Calculate subscription savings
    calculateSubscriptionSavings: () => {
      const monthly = riseQuestPricingConfig.subscriptionPlans.monthly;
      const yearly = riseQuestPricingConfig.subscriptionPlans.yearly;
      
      const yearlyEquivalent = monthly.price * 12;
      const savings = yearlyEquivalent - yearly.price;
      const percentage = Math.round((savings / yearlyEquivalent) * 100);
      
      return {
        percentage,
        amount: savings,
        monthlyPrice: monthly.price,
        yearlyPrice: yearly.price
      };
    },

    // Format currency
    formatCurrency: (amount) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(amount);
    },

    // Format points with bonus
    formatPointsWithBonus: (points, bonus) => {
      if (bonus > 0) {
        return `${points.toLocaleString()} + ${bonus.toLocaleString()} bonus = ${(points + bonus).toLocaleString()} total`;
      }
      return `${points.toLocaleString()} points`;
    }
  },

  // App-specific metadata
  metadata: {
    appName: 'RiseQuest',
    version: '1.0.0',
    lastUpdated: '2025-08-24',
    stripeMerchant: 'RiseQuest by Golden Epics Solutions',
    supportEmail: 'risequestsupport@goldenepics.com',
    webhookEndpoint: 'https://api.xcoin.goldenepics.com/webhooks/stripe/risequest',
    currency: 'USD',
    platform: 'mobile'
  }
};

module.exports = riseQuestPricingConfig;
