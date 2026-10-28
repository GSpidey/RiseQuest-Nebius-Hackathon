import { AppAlert as Alert } from '../services/dialogQueue';
import { authHeaders } from './AuthTokenStorage';

import { useStripe, initStripe } from '@stripe/stripe-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBackendBaseUrl } from '../config/backendConfig';
import { usesStoreBilling, getStorePricing, purchaseStoreItem } from './StorePurchaseService';

async function prepareStripe(publishableKey) {
  if (typeof publishableKey !== 'string' || !/^pk_(live|test)_\w+$/.test(publishableKey)) {
    throw new Error('Payments are temporarily unavailable. Please try again later.');
  }
  await initStripe({ publishableKey, urlScheme: 'risequest' });
}

class StripePaymentService {
  constructor() {
    this.supportEmail = 'Risequestsupport@goldenepics.com';
    this.isInitialized = false;
  }

  // Initialize Stripe
  async initialize() {
    try {
      this.isInitialized = true;
      console.log('Stripe initialized successfully');
      return true;
    } catch (error) {
      console.error('Stripe initialization failed:', error);
      return false;
    }
  }

  // Create subscription PaymentSheet payload with localized pricing
  async createSubscriptionPaymentSheet(planType, customerEmail, userId = customerEmail) {
    try {
      const pricing = await this.getPricingConfig();
      const selected = pricing?.subscriptions?.[planType];
      const priceId = selected?.priceId;

      if (!priceId) {
        throw new Error('Subscription pricing is not configured on the backend');
      }

      const baseUrl = await getBackendBaseUrl();
      const response = await fetch(`${baseUrl}/api/stripe/subscription/payment-sheet`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          priceId,
          customerEmail,
          userId,
          metadata: {
            app: 'RiseQuest',
            platform: 'mobile',
            type: 'subscription',
            planType: planType,
          },
        }),
      });

      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error);
      }

      return {
        success: true,
        subscriptionId: result.subscriptionId,
        customerId: result.customerId,
        ephemeralKey: result.ephemeralKey,
        paymentIntentClientSecret: result.paymentIntentClientSecret,
        publishableKey: result.publishableKey || null,
      };
    } catch (error) {
      console.error('Subscription creation failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Create one-time PaymentSheet payload for RisePoints
  async createRisePointsPaymentSheet({ amount, currency = 'usd', description, customerEmail, userId, risePoints }) {
    try {
      const baseUrl = await getBackendBaseUrl();
      const response = await fetch(`${baseUrl}/api/stripe/payment-intent/payment-sheet`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          amount: Math.round(amount * 100), // Convert to cents
          currency,
          description,
          customerEmail,
          userId,
          metadata: {
            app: 'RiseQuest',
            type: 'risepoints',
            risePoints,
          },
        }),
      });

      const paymentIntent = await response.json();
      
      if (paymentIntent.error) {
        throw new Error(paymentIntent.error);
      }

      return {
        success: true,
        paymentIntentClientSecret: paymentIntent.paymentIntentClientSecret,
        paymentIntentId: paymentIntent.paymentIntentId,
        customerId: paymentIntent.customerId,
        ephemeralKey: paymentIntent.ephemeralKey,
        publishableKey: paymentIntent.publishableKey || null,
      };
    } catch (error) {
      console.error('Payment intent creation failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Generic one-time PaymentSheet payload (used for cosmetics and other one-time purchases)
  async createOneTimePaymentSheet({ amount, currency = 'usd', description, customerEmail, userId, metadata }) {
    try {
      const baseUrl = await getBackendBaseUrl();
      const response = await fetch(`${baseUrl}/api/stripe/payment-intent/payment-sheet`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          amount: Math.round(amount * 100),
          currency,
          description,
          customerEmail,
          userId,
          metadata: {
            app: 'RiseQuest',
            type: 'one_time',
            ...metadata,
          },
        }),
      });

      const result = await response.json();
      if (result.error) throw new Error(result.error);

      return {
        success: true,
        paymentIntentClientSecret: result.paymentIntentClientSecret,
        paymentIntentId: result.paymentIntentId,
        customerId: result.customerId,
        ephemeralKey: result.ephemeralKey,
        publishableKey: result.publishableKey || null,
      };
    } catch (error) {
      console.error('One-time PaymentSheet creation failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Get pricing configuration from Stripe
  async getPricingConfig() {
    try {
      if (usesStoreBilling()) return await getStorePricing();
      const baseUrl = await getBackendBaseUrl();
      const response = await fetch(`${baseUrl}/api/pricing-config`);
      const config = await response.json();

      if (config?.error) throw new Error(config.error);
      return config;
    } catch (error) {
      console.error('Failed to fetch pricing config:', error);
      return null;
    }
  }

  // Note: Webhook signature verification must be done on the backend, not in the mobile app.
}

// Hook for using Stripe in components
export const useStripePayments = () => {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  
  const processSubscription = async (planType, customerEmail) => {
    try {
      if (usesStoreBilling()) return await purchaseStoreItem('subscription', planType);
      // Create subscription on backend
      const stripeService = new StripePaymentService();
      const subscription = await stripeService.createSubscriptionPaymentSheet(planType, customerEmail, customerEmail);
      
      if (!subscription.success) {
        throw new Error(subscription.error);
      }

      // Initialize payment sheet
      await prepareStripe(subscription.publishableKey);
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: subscription.paymentIntentClientSecret,
        customerId: subscription.customerId,
        customerEphemeralKeySecret: subscription.ephemeralKey,
        merchantDisplayName: 'RiseQuest',
        style: 'alwaysDark',
        googlePay: { merchantCountryCode: 'US', testEnv: __DEV__ },
        applePay: { merchantCountryCode: 'US' },
      });

      if (initError) {
        throw new Error(initError.message);
      }

      // Present payment sheet
      const { error: presentError } = await presentPaymentSheet();
      
      if (presentError) {
        if (presentError.code === 'Canceled') {
          return { success: false, cancelled: true };
        }
        throw new Error(presentError.message);
      }

      // Payment successful
      await AsyncStorage.setItem('stripeSubscriptionId', subscription.subscriptionId);
      return { success: true, subscriptionId: subscription.subscriptionId };
      
    } catch (error) {
      console.error('Subscription payment failed:', error);
      Alert.alert(
        'Payment Failed',
        `${error.message}\n\nPlease contact support: Risequestsupport@goldenepics.com`
      );
      return { success: false, error: error.message };
    }
  };

  const processRisePointsPurchase = async (packageType, customerEmail) => {
    try {
      if (usesStoreBilling()) return await purchaseStoreItem('points', packageType);
      const stripeService = new StripePaymentService();
      const config = await stripeService.getPricingConfig();
      const pointsPackage = config.risepoints[packageType];
      
      if (!pointsPackage) {
        throw new Error('Invalid package type');
      }

      if (!pointsPackage.priceId) {
        throw new Error('RisePoints pricing is not configured on the backend');
      }

      if (!customerEmail) {
        throw new Error('Missing email (sign in required)');
      }

      // Create payment sheet payload
      const paymentIntent = await stripeService.createRisePointsPaymentSheet({
        amount: pointsPackage.amount,
        currency: pointsPackage.currency || 'usd',
        description: `RisePoints - ${pointsPackage.points} points`,
        customerEmail,
        userId: customerEmail,
        risePoints: pointsPackage.points,
      });
      
      if (!paymentIntent.success) {
        throw new Error(paymentIntent.error);
      }

      // Initialize payment sheet
      await prepareStripe(paymentIntent.publishableKey);
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: paymentIntent.paymentIntentClientSecret,
        customerId: paymentIntent.customerId || undefined,
        customerEphemeralKeySecret: paymentIntent.ephemeralKey || undefined,
        merchantDisplayName: 'RiseQuest',
        style: 'alwaysDark',
        googlePay: { merchantCountryCode: 'US', testEnv: __DEV__ },
        applePay: { merchantCountryCode: 'US' },
      });

      if (initError) {
        throw new Error(initError.message);
      }

      // Present payment sheet
      const { error: presentError } = await presentPaymentSheet();
      
      if (presentError) {
        if (presentError.code === 'Canceled') {
          return { success: false, cancelled: true };
        }
        throw new Error(presentError.message);
      }

      // Stripe completed; only the server ledger can confirm points fulfillment.
      const baseUrl = await getBackendBaseUrl();
      const claim = await fetch(`${baseUrl}/api/wallet/claim-rise-points`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ userId: customerEmail, paymentIntentId: paymentIntent.paymentIntentId }),
      });

      if (!claim.ok) {
        Alert.alert('Payment received', 'Your points are still being confirmed. Refresh your wallet shortly; do not pay again. If they do not appear, contact RiseQuest support.');
        return { success: false, pending: true, paymentIntentId: paymentIntent.paymentIntentId };
      }

      return { 
        success: true, 
        pointsAdded: pointsPackage.points,
        paymentIntentId: paymentIntent.paymentIntentId 
      };
      
    } catch (error) {
      console.error('RisePoints purchase failed:', error);
      Alert.alert(
        'Purchase Failed',
        `${error.message}\n\nPlease contact support: Risequestsupport@goldenepics.com`
      );
      return { success: false, error: error.message };
    }
  };

  const processOneTimePurchase = async ({ amount, currency, description, customerEmail, metadata }) => {
    try {
      if (usesStoreBilling()) throw new Error('Use Rise Points from your wallet to unlock cosmetics.');
      if (!customerEmail) throw new Error('Missing email (sign in required)');
      const stripeService = new StripePaymentService();
      const payload = await stripeService.createOneTimePaymentSheet({
        amount,
        currency,
        description,
        customerEmail,
        userId: customerEmail,
        metadata,
      });

      if (!payload.success) throw new Error(payload.error);

      await prepareStripe(payload.publishableKey);
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: payload.paymentIntentClientSecret,
        customerId: payload.customerId || undefined,
        customerEphemeralKeySecret: payload.ephemeralKey || undefined,
        merchantDisplayName: 'RiseQuest',
        style: 'alwaysDark',
        googlePay: { merchantCountryCode: 'US', testEnv: __DEV__ },
        applePay: { merchantCountryCode: 'US' },
      });

      if (initError) throw new Error(initError.message);

      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code === 'Canceled') return { success: false, cancelled: true };
        throw new Error(presentError.message);
      }

      return { success: true, paymentIntentId: payload.paymentIntentId };
    } catch (error) {
      console.error('One-time payment failed:', error);
      Alert.alert('Payment Failed', `${error.message}\n\nPlease contact support: Risequestsupport@goldenepics.com`);
      return { success: false, error: error.message };
    }
  };

  return {
    processSubscription,
    processRisePointsPurchase,
    processOneTimePurchase,
  };
};

export default new StripePaymentService();

