import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking } from 'react-native';
import { getBackendBaseUrl } from './config/backendConfig';

class PaymentService {
  constructor() {
    this.supportEmail = 'Risequestsupport@goldenepics.com';
    this.paymentProviders = {
      stripe: true,
      paypal: true,
      apple: true,  // In-App Purchase
      google: true, // Google Play Billing
    };
  }

  // Initialize payment system
  async initializePayments() {
    try {
      const baseUrl = await getBackendBaseUrl();
      const resp = await fetch(`${baseUrl}/api/mobile-config`);
      const cfg = await resp.json();
      if (cfg?.stripePublishableKey) {
        await AsyncStorage.setItem('risequest_stripe_publishable_key', cfg.stripePublishableKey);
      }

      console.log('Payment systems initialized:', this.paymentProviders);
      return true;
    } catch (error) {
      console.error('Payment initialization failed:', error);
      return false;
    }
  }

  // Process premium subscription purchase - Updated for CAD pricing
  async purchasePremiumSubscription(plan, paymentMethod = 'stripe') {
    try {
      // Real subscriptions are handled via Stripe PaymentSheet in PremiumUpgradeModal.
      Alert.alert('Upgrade', 'Open the Premium Upgrade screen to subscribe.');
      return { success: false, error: 'Use PremiumUpgradeModal' };
    } catch (error) {
      console.error('Purchase failed:', error);
      
      // Show user-friendly error
      Alert.alert(
        'Purchase Failed',
        `We couldn't process your payment. Please try again or contact support at ${this.supportEmail}`,
        [
          { text: 'Try Again', style: 'default' },
          { 
            text: 'Contact Support', 
            onPress: () => this.contactSupport('Payment Issue')
          },
        ]
      );

      return { success: false, error: error.message };
    }
  }

  // Process RisePoints purchase (microtransactions)
  async purchaseRisePoints(pointsPackage, paymentMethod = 'stripe') {
    try {
      Alert.alert('RisePoints', 'Use the RisePoints purchase flow (PaymentSheet) from the wallet screen.');
      return { success: false, error: 'Use Stripe PaymentSheet flow' };
    } catch (error) {
      console.error('Points purchase failed:', error);
      
      Alert.alert(
        'Purchase Failed',
        `We couldn't process your RisePoints purchase. Please contact support at ${this.supportEmail}`,
        [
          { 
            text: 'Contact Support', 
            onPress: () => this.contactSupport('RisePoints Purchase Issue')
          },
          { text: 'OK', style: 'default' },
        ]
      );

      return { success: false, error: error.message };
    }
  }

  // Legacy shim: payments are handled by Stripe PaymentSheet flows.
  async processPayment() {
    return { success: false, error: 'Use Stripe PaymentSheet flow' };
  }

  // Update subscription status in local storage
  async updateSubscriptionStatus(plan, paymentResult) {
    try {
      const subscriptionData = {
        tier: 'PREMIUM',
        plan,
        subscriptionId: paymentResult.subscriptionId,
        expiresAt: paymentResult.expiresAt,
        purchasedAt: new Date().toISOString(),
        isActive: true,
        autoRenew: true,
      };

      await AsyncStorage.setItem('subscriptionData', JSON.stringify(subscriptionData));
      
      // Log purchase for analytics
      await this.logPurchaseEvent('premium_subscription', {
        plan,
        amount: paymentResult.amount,
        transactionId: paymentResult.transactionId,
      });

    } catch (error) {
      console.error('Failed to update subscription:', error);
    }
  }

  // Add RisePoints to user account
  async addRisePoints(points) {
    try {
      const currentStats = await AsyncStorage.getItem('userStats');
      const stats = currentStats ? JSON.parse(currentStats) : { risePoints: 0 };
      
      stats.risePoints = (stats.risePoints || 0) + points;
      
      await AsyncStorage.setItem('userStats', JSON.stringify(stats));
      
      // Log purchase for analytics
      await this.logPurchaseEvent('risepoints_purchase', {
        pointsAdded: points,
        newBalance: stats.risePoints,
      });

    } catch (error) {
      console.error('Failed to add RisePoints:', error);
    }
  }

  // Cancel subscription
  async cancelSubscription() {
    try {
      const subscriptionData = await AsyncStorage.getItem('subscriptionData');
      if (!subscriptionData) {
        throw new Error('No active subscription found');
      }

      const subscription = JSON.parse(subscriptionData);
      
      // In a real app, you'd call the payment provider's API to cancel
      // For now, we'll just mark it as cancelled locally
      subscription.isActive = false;
      subscription.autoRenew = false;
      subscription.cancelledAt = new Date().toISOString();
      
      await AsyncStorage.setItem('subscriptionData', JSON.stringify(subscription));
      
      Alert.alert(
        'Subscription Cancelled',
        'Your premium subscription has been cancelled. You\'ll continue to have access to premium features until your current billing period ends.',
        [{ text: 'OK' }]
      );

      return { success: true };
    } catch (error) {
      console.error('Cancellation failed:', error);
      Alert.alert(
        'Cancellation Failed',
        `Please contact support at ${this.supportEmail} for assistance.`
      );
      return { success: false, error: error.message };
    }
  }

  // Restore purchases (for iOS/Android)
  async restorePurchases() {
    try {
      // In a real app, this would query the app store for previous purchases
      Alert.alert(
        'Restore Purchases',
        'We\'re checking for previous purchases...',
        [{ text: 'OK' }]
      );

      // Simulate restore process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // For demo, we'll just check if there's existing subscription data
      const subscriptionData = await AsyncStorage.getItem('subscriptionData');
      
      if (subscriptionData) {
        const subscription = JSON.parse(subscriptionData);
        if (subscription.isActive) {
          Alert.alert(
            'Purchases Restored',
            'Your premium subscription has been restored!',
            [{ text: 'Great!' }]
          );
          return { success: true, restored: true };
        }
      }

      Alert.alert(
        'No Purchases Found',
        'We couldn\'t find any previous purchases associated with this account.',
        [{ text: 'OK' }]
      );

      return { success: true, restored: false };
    } catch (error) {
      console.error('Restore failed:', error);
      Alert.alert(
        'Restore Failed',
        `Please contact support at ${this.supportEmail} if you believe this is an error.`
      );
      return { success: false, error: error.message };
    }
  }

  // Contact support for payment issues
  async contactSupport(subject = 'Payment Support') {
    const emailBody = encodeURIComponent(`
Hi RiseQuest Support Team,

I need assistance with: ${subject}

Device Info:
- App Version: 1.0.0
- Issue Date: ${new Date().toLocaleString()}

Please help me resolve this issue.

Thank you!
    `);

    const mailtoUrl = `mailto:${this.supportEmail}?subject=${encodeURIComponent(subject)}&body=${emailBody}`;
    
    try {
      const supported = await Linking.canOpenURL(mailtoUrl);
      if (supported) {
        await Linking.openURL(mailtoUrl);
      } else {
        Alert.alert(
          'Contact Support',
          `Please email us at: ${this.supportEmail}`,
          [
            {
              text: 'Copy Email',
              onPress: () => {
                // Copy email to clipboard functionality would go here
                Alert.alert('Email Copied', 'Support email copied to clipboard');
              }
            },
            { text: 'OK' }
          ]
        );
      }
    } catch (error) {
      console.error('Failed to open email:', error);
    }
  }

  // Send purchase confirmation
  async sendPurchaseConfirmation(paymentResult) {
    try {
      // In a real app, this would trigger a server-side email
      console.log('Purchase confirmation sent:', {
        transactionId: paymentResult.transactionId,
        amount: paymentResult.amount,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to send confirmation:', error);
    }
  }

  // Log purchase events for analytics
  async logPurchaseEvent(eventType, data) {
    try {
      const event = {
        type: eventType,
        data,
        timestamp: new Date().toISOString(),
        userId: 'user_' + Date.now(), // Replace with actual user ID
      };

      // In a real app, this would send to analytics service
      console.log('Purchase event logged:', event);
      
      // Store locally for admin panel
      const events = await AsyncStorage.getItem('purchaseEvents') || '[]';
      const parsedEvents = JSON.parse(events);
      parsedEvents.push(event);
      
      // Keep only last 100 events
      if (parsedEvents.length > 100) {
        parsedEvents.splice(0, parsedEvents.length - 100);
      }
      
      await AsyncStorage.setItem('purchaseEvents', JSON.stringify(parsedEvents));
    } catch (error) {
      console.error('Failed to log purchase event:', error);
    }
  }

  // Get payment methods available
  getAvailablePaymentMethods() {
    return [
      {
        id: 'stripe',
        name: 'Credit/Debit Card',
        icon: '💳',
        enabled: this.paymentProviders.stripe,
      },
      {
        id: 'paypal',
        name: 'PayPal',
        icon: '🅿️',
        enabled: this.paymentProviders.paypal,
      },
      {
        id: 'apple',
        name: 'Apple Pay',
        icon: '🍎',
        enabled: this.paymentProviders.apple,
      },
      {
        id: 'google',
        name: 'Google Pay',
        icon: '🟢',
        enabled: this.paymentProviders.google,
      },
    ].filter(method => method.enabled);
  }

  // Check if user has active subscription
  async hasActiveSubscription() {
    try {
      const subscriptionData = await AsyncStorage.getItem('subscriptionData');
      if (!subscriptionData) return false;

      const subscription = JSON.parse(subscriptionData);
      if (!subscription.isActive) return false;

      // Check if subscription hasn't expired
      const expiresAt = new Date(subscription.expiresAt);
      const now = new Date();
      
      return expiresAt > now;
    } catch (error) {
      console.error('Failed to check subscription:', error);
      return false;
    }
  }
}

export default new PaymentService();
