import { refreshCollection } from './cosmeticCollection';
import { celebrate } from '../features/customization/ThemeMotion';
import { getAuthToken, setAuthToken } from './AuthTokenStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBackendBaseUrl } from '../config/backendConfig';

/**
 * RiseQuest Mobile App - XCoin Wallet Engine Integration
 * Connects to centralized wallet system for Rise Points (powered by Epic Credits)
 * 
 * Dual-Currency System:
 * - XCOIN: Gamified rewards, achievements, engagement
 * - GECREDITS: Premium features, consultations, services
 * 
 * RiseQuest Branding: "Rise Points" (powered by Epic Credits)
 */

// Backend wallet configuration
const WALLET_CONFIG = {
  API_VERSION: 'v1',
  PRODUCT_ID: 'risequest',
  COMPANY_ID: 'goldenepic-solutions-inc',
  ENVIRONMENT: 'production',
};

const GRAPHQL_OPERATIONS = {};

class RiseQuestWalletService {
  constructor() {
    this.config = WALLET_CONFIG;
    this.authToken = null;
    this.userId = null;
    this.walletCache = null;
    
    this.loadAuthData();
  }

  // === AUTHENTICATION ===
  
  async loadAuthData() {
    try {
      this.authToken = await getAuthToken();
      this.userId = await AsyncStorage.getItem('risequest_user_id');
    } catch (error) {
      console.error('Error loading auth data:', error);
    }
  }

  async setAuthData(token, userId) {
    try {
      await setAuthToken(token);
      await AsyncStorage.setItem('risequest_user_id', userId);
      this.authToken = token;
      this.userId = userId;
    } catch (error) {
      console.error('Error saving auth data:', error);
    }
  }

  async getCurrentUserId() {
    if (!this.userId) {
      await this.loadAuthData();
    }
    return this.userId;
  }

  async getHeaders() {
    this.authToken = await getAuthToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.authToken || 'anonymous'}`,
    };
  }

  // === GRAPHQL OPERATIONS ===

  async requestJson(path, { method = 'GET', body } = {}) {
    const baseUrl = await getBackendBaseUrl();
    const headers = await this.getHeaders();
    const resp = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await resp.json();
    if (!resp.ok || json?.error) {
      throw new Error(json?.error || `Request failed (${resp.status})`);
    }
    return json;
  }

  // === WALLET OPERATIONS ===

  async createWallet(userId) {
    try {
      const bal = await this.requestJson(`/api/wallet/balance?userId=${encodeURIComponent(userId)}`);
      const wallet = { id: `${userId}-wallet`, userId, xcoins: bal.balance || 0, gecredits: 0 };
      this.walletCache = wallet;
      return wallet;
    } catch (error) {
      console.error('Error creating wallet:', error);
      throw error;
    }
  }

  async getWallet(userId = null) {
    try {
      const targetUserId = userId || this.userId;
      if (!targetUserId) {
        throw new Error('User ID required');
      }

      const bal = await this.requestJson(`/api/wallet/balance?userId=${encodeURIComponent(targetUserId)}`);
      const wallet = { id: `${targetUserId}-wallet`, userId: targetUserId, xcoins: bal.balance || 0, gecredits: 0 };
      this.walletCache = wallet;
      return wallet;
    } catch (error) {
      console.error('Error getting wallet:', error);
      throw error;
    }
  }

  async getBalance(userId = null) {
    try {
      const wallet = await this.getWallet(userId);
      return {
        risePoints: wallet.xcoins, // Branded as "Rise Points"
        premiumCredits: wallet.gecredits, // Premium features
        total: wallet.xcoins + wallet.gecredits
      };
    } catch (error) {
      console.error('Error getting balance:', error);
      // Do not turn a failed/unauthenticated request into a fictitious zero balance.
      throw error;
    }
  }

  // === EARNING MECHANISMS ===

  async awardRisePoints(userId, amount, reason, metadata = {}) {
    try {
      // Preserve event/item identity for server-defined rewards and pricing.
      const result = await this.requestJson('/api/wallet/award', {
        method: 'POST',
        body: {
          userId,
          delta: Number(amount),
          reason,
          metadata,
        },
      });

      this.walletCache = null;
      if (result.awarded > 0) celebrate('progress');
      refreshCollection().catch(() => {});
      return result;
    } catch (error) {
      console.error('Error awarding Rise Points:', error);
      throw error;
    }
  }

  // === SPENDING MECHANISMS ===

  async spendRisePoints(userId, amount, description, metadata = {}) {
    try {
      // Preserve event/item identity for server-defined rewards and pricing.
      const result = await this.requestJson('/api/wallet/spend', {
        method: 'POST',
        body: {
          userId,
          delta: Number(amount),
          reason: description,
          metadata,
          idempotencyKey: metadata.idempotencyKey || `purchase_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        },
      });

      this.walletCache = null;
      return result;
    } catch (error) {
      console.error('Error spending Rise Points:', error);
      throw error;
    }
  }

  // === GAMIFICATION FEATURES ===

  async awardDailyLoginBonus(userId) {
    return this.awardRisePoints(userId, 2, 'Daily login bonus', {
      type: 'daily_login',
      timestamp: new Date().toISOString()
    });
  }

  async awardAlarmCompletion(userId, difficulty = 'normal') {
    const points = {
      easy: 5,
      normal: 10,
      hard: 15,
      extreme: 25
    };
    
    return this.awardRisePoints(userId, 3, `Alarm completed (${difficulty})`, {
      type: 'alarm_completion',
      difficulty,
      timestamp: new Date().toISOString()
    });
  }

  async awardSnoozeChallenge(userId, challengeType, success) {
    if (!success) return null;
    
    const points = {
      math: 15,
      puzzle: 20,
      memory: 18,
      physical: 25
    };
    
    return this.awardRisePoints(userId, 2, `Snooze challenge completed (${challengeType})`, {
      type: 'snooze_challenge',
      challengeType,
      success,
      timestamp: new Date().toISOString()
    });
  }

  async awardStreakBonus(userId, streakDays) {
    const bonusPoints = Math.min(streakDays * 2, 100); // Max 100 points
    
    return this.awardRisePoints(userId, bonusPoints, `${streakDays}-day streak bonus`, {
      type: 'streak_bonus',
      streakDays,
      timestamp: new Date().toISOString()
    });
  }

  // === PREMIUM FEATURES ===

  async purchasePremiumTheme(userId, themeId, cost = 50) {
    return this.spendRisePoints(userId, cost, `Premium theme: ${themeId}`, {
      type: 'premium_theme',
      themeId,
      timestamp: new Date().toISOString()
    });
  }

  async unlockAdvancedFeatures(userId, featureId, cost = 100) {
    return this.spendRisePoints(userId, cost, `Unlock feature: ${featureId}`, {
      type: 'feature_unlock',
      featureId,
      timestamp: new Date().toISOString()
    });
  }

  // === TRANSACTION HISTORY ===

  async getTransactionHistory(userId = null, limit = 20) {
    try {
      const targetUserId = userId || this.userId;
      if (!targetUserId) return [];
      const rows = await this.requestJson(`/api/wallet/transactions?userId=${encodeURIComponent(targetUserId)}&limit=${encodeURIComponent(limit)}`);
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      console.error('Error getting transaction history:', error);
      return [];
    }
  }

  // === UTILITY METHODS ===

  formatRisePoints(amount) {
    return `${amount.toLocaleString()} Rise Points`;
  }

  formatPremiumCredits(amount) {
    return `${amount} Premium Credits`;
  }

  async clearCache() {
    this.walletCache = null;
    this.authToken = null;
    this.userId = null;
  }

  // === INTEGRATION HELPERS ===

  async initializeForUser(userId, authToken) {
    await this.setAuthData(authToken, userId);
    await this.getWallet(userId);
  }
}

// Export singleton instance
const riseQuestWalletService = new RiseQuestWalletService();
export default riseQuestWalletService;

// Also export the class for testing
export { RiseQuestWalletService };
