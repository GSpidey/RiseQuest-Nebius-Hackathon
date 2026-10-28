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

const styles = StyleSheet.create({
  container: {flex:1,padding:20},
  title: {fontSize:20,fontWeight:'700',marginBottom:8},
  subtitle: {fontSize:14,opacity:.7},
});
