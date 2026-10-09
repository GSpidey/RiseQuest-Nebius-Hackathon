import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * Legacy/dev screen.
 * Real purchases are handled by:
 * - PremiumUpgradeModal (subscriptions)
 * - Wallet/RisePoints flows (one-time)
 */
export const RiseQuestPurchaseScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Purchases</Text>
      <Text style={styles.subtitle}>
        Use the Premium Upgrade screen for subscriptions and the Wallet for RisePoints.
      </Text>
    </View>
  );
};

export default RiseQuestPurchaseScreen;

/*
export const RiseQuestPurchaseScreen = () => {
        import React from 'react';
        import { View, Text, StyleSheet } from 'react-native';

        /**
         * Legacy/dev screen.
         * Real purchases are handled by:
         * - PremiumUpgradeModal (subscriptions)
         * - Wallet/RisePoints flows (one-time)
         */
        export const RiseQuestPurchaseScreen = () => {
          return (
            <View style={styles.container}>
              <Text style={styles.title}>Purchases</Text>
              <Text style={styles.subtitle}>
                Use the Premium Upgrade screen for subscriptions and the Wallet for RisePoints.
              </Text>
            </View>
          );
        };

        const styles = StyleSheet.create({
          container: {
            flex: 1,
            padding: 20,
          },
          title: {
            fontSize: 20,
            fontWeight: '700',
            marginBottom: 8,
          },
          subtitle: {
            fontSize: 14,
            opacity: 0.7,
          },
        });

        export default RiseQuestPurchaseScreen;

        
        {packages.map((pkg) => {
          const isSelected = selectedPackage === pkg.id;
          
          return (
            <TouchableOpacity
              key={pkg.id}
              style={[
                styles.packageCard,
                isSelected && styles.selectedCard,
                pkg.isPopular && styles.popularCard,
                pkg.isBestValue && styles.bestValueCard
              ]}
              onPress={() => setSelectedPackage(isSelected ? null : pkg.id)}
              disabled={loading}
            >
              {pkg.isPopular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularText}>MOST POPULAR</Text>
                </View>
              )}
              
              {pkg.isBestValue && (
                <View style={styles.bestValueBadge}>
                  <Text style={styles.bestValueText}>BEST VALUE</Text>
                </View>
              )}
              
              <View style={styles.cardHeader}>
                <Text style={styles.packageName}>{pkg.name}</Text>
                <Text style={styles.packagePrice}>
                  {riseQuestPricingConfig.helpers.formatCurrency(pkg.price)}
                </Text>
              </View>
              
              <Text style={styles.packageDescription}>{pkg.description}</Text>
              
              <View style={styles.pointsInfo}>
                <Text style={styles.pointsAmount}>
                  {riseQuestPricingConfig.helpers.formatPointsWithBonus(pkg.points, pkg.bonus)}
                </Text>
                {pkg.bonusPercentage > 0 && (
                  <Text style={styles.bonusPercentage}>+{pkg.bonusPercentage}% BONUS</Text>
                )}
              </View>
              
              <View style={styles.featuresList}>
                {pkg.features.map((feature, index) => (
                  <Text key={`feature-${pkg.id}-${index}`} style={styles.feature}>• {feature}</Text>
                ))}
              </View>
              
              {isSelected && (
                <TouchableOpacity
                  style={styles.purchaseButton}
                  onPress={() => handleRisePointsPurchase(pkg.id)}
                  disabled={loading}
                >
                  <Text style={styles.purchaseButtonText}>
                    {loading ? 'Processing...' : `Purchase ${pkg.name}`}
                  </Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderSubscriptionPlans = () => {
    const plans = Object.values(riseQuestPricingConfig.subscriptionPlans || {});
    
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⭐ RiseQuest Premium</Text>
        <Text style={styles.sectionDescription}>
          Advanced alarms, AI coach, location features, ad-free experience
        </Text>
        
        {plans.map((plan) => {
          const isSelected = selectedSubscription === plan.id;
          const isAnnual = plan.interval === 'year';
          
          return (
            <TouchableOpacity
              key={plan.id}
              style={[
                styles.packageCard,
                isSelected && styles.selectedCard,
                isAnnual && styles.annualCard
              ]}
              onPress={() => setSelectedSubscription(isSelected ? null : plan.id)}
              disabled={loading}
            >
              {isAnnual && plan.savings && (
                <View style={styles.savingsBadge}>
                  <Text style={styles.savingsText}>SAVE {plan.savings.percentage}%</Text>
                </View>
              )}
              
              <View style={styles.cardHeader}>
                <Text style={styles.packageName}>{plan.name}</Text>
                <Text style={styles.packagePrice}>
                  {riseQuestPricingConfig.helpers.formatCurrency(plan.price)}
                  <Text style={styles.priceInterval}>/{plan.interval}</Text>
                </Text>
              </View>
              
              {isAnnual && plan.savings && (
                <Text style={styles.savings}>
                  Save {riseQuestPricingConfig.helpers.formatCurrency(plan.savings.amount)} annually
                </Text>
              )}
              
              <View style={styles.featuresList}>
                {plan.features.map((feature, index) => (
                  <Text key={`feature-${plan.id}-${index}`} style={styles.feature}>• {feature}</Text>
                ))}
              </View>
              
              {isSelected && (
                <TouchableOpacity
                  style={styles.subscribeButton}
                  onPress={() => handleSubscriptionPurchase(plan.id)}
                  disabled={loading}
                >
                  <Text style={styles.subscribeButtonText}>
                    {loading ? 'Processing...' : `Subscribe to ${plan.name}`}
                  </Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderGamificationInfo = () => {
    const gamification = riseQuestPricingConfig.gamification;
    
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🎮 How to Earn Rise Points</Text>
        <Text style={styles.sectionDescription}>
          Complete daily challenges and maintain streaks to earn more points
        </Text>
        
        <View style={styles.gamificationCard}>
          <Text style={styles.gamificationTitle}>Earning Methods:</Text>
          <Text style={styles.gamificationItem}>• Daily Login: +{gamification.earningRates.dailyLogin} points</Text>
          <Text style={styles.gamificationItem}>• Easy Alarm: +{gamification.earningRates.alarmCompletion.easy} points</Text>
          <Text style={styles.gamificationItem}>• Normal Alarm: +{gamification.earningRates.alarmCompletion.normal} points</Text>
          <Text style={styles.gamificationItem}>• Hard Alarm: +{gamification.earningRates.alarmCompletion.hard} points</Text>
          <Text style={styles.gamificationItem}>• Extreme Alarm: +{gamification.earningRates.alarmCompletion.extreme} points</Text>
          <Text style={styles.gamificationItem}>• Snooze Challenges: +15-25 points</Text>
          <Text style={styles.gamificationItem}>• Weekly Streaks: Bonus multipliers!</Text>
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>🌅 RiseQuest Premium Store</Text>
        <Text style={styles.subtitle}>
          Rise Points: {userBalance.risePoints.toLocaleString()} | Premium Credits: {userBalance.premiumCredits}
        </Text>
      </View>

      {renderRisePointsPackages()}
      {renderSubscriptionPlans()}
      {renderGamificationInfo()}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          💡 All purchases are processed securely through Stripe
        </Text>
        <Text style={styles.footerText}>
          🔒 Your payment information is encrypted and secure
        </Text>
        <Text style={styles.footerText}>
          🌅 Rise Points never expire and unlock amazing features!
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f8ff',
  },
  header: {
    padding: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6c757d',
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 16,
  },
  packageCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#e9ecef',
    position: 'relative',
  },
  selectedCard: {
    borderColor: '#ff6b35',
    backgroundColor: '#fff8f6',
  },
  popularCard: {
    borderColor: '#28a745',
  },
  bestValueCard: {
    borderColor: '#6f42c1',
  },
  annualCard: {
    borderColor: '#17a2b8',
  },
  popularBadge: {
    position: 'absolute',
    top: -8,
    left: 16,
    backgroundColor: '#28a745',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  popularText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  bestValueBadge: {
    position: 'absolute',
    top: -8,
    right: 16,
    backgroundColor: '#6f42c1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  bestValueText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  savingsBadge: {
    position: 'absolute',
    top: -8,
    right: 16,
    backgroundColor: '#17a2b8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  savingsText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  packageName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212529',
    flex: 1,
  },
  packagePrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ff6b35',
  },
  priceInterval: {
    fontSize: 14,
    color: '#6c757d',
  },
  packageDescription: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 12,
  },
  pointsInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  pointsAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ff6b35',
    flex: 1,
  },
  bonusPercentage: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#28a745',
    backgroundColor: '#f8fff9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  savings: {
    fontSize: 14,
    color: '#17a2b8',
    fontWeight: '600',
    marginBottom: 8,
  },
  featuresList: {
    marginBottom: 16,
  },
  feature: {
    fontSize: 14,
    color: '#495057',
    marginBottom: 4,
  },
  purchaseButton: {
    backgroundColor: '#ff6b35',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  purchaseButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  subscribeButton: {
    backgroundColor: '#17a2b8',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  subscribeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  gamificationCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#ff6b35',
  },
  gamificationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 8,
  },
  gamificationItem: {
    fontSize: 14,
    color: '#495057',
    marginBottom: 4,
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#6c757d',
    textAlign: 'center',
    marginBottom: 4,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.7,
  },
});

export default RiseQuestPurchaseScreen;
*/
