import { clearAuthToken } from './AuthTokenStorage';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import riseQuestWalletService from './RiseQuestWalletService';

const normalizeUserId = (email) => String(email || '').trim().toLowerCase();

export const GoogleAuthService = {
  // Initialize Google Sign-In
  async initialize() {
    try {
      GoogleSignin.configure({
        webClientId: '628709146989-df1prq7ube4v3383tg8gfe4ha3asrtb6.apps.googleusercontent.com',
        offlineAccess: true,
        hostedDomain: '',
        forceCodeForRefreshToken: true,
        accountName: '',
        iosClientId: '628709146989-2cgc85rvqm0c3ltnmod9slvtiqfb0okf.apps.googleusercontent.com',
        googleServicePlistPath: '',
        openIdSupport: false,
        profileImageSize: 120,
      });

      console.log('✅ Google Sign-In initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Google Sign-In initialization failed:', error);
      return false;
    }
  },

  // Check if user is already signed in
  async isSignedIn() {
    try {
      const isSignedIn = await GoogleSignin.isSignedIn();
      return isSignedIn;
    } catch (error) {
      console.error('Error checking sign-in status:', error);
      return false;
    }
  },

  // Get current user info
  async getCurrentUser() {
    try {
      const userInfo = await GoogleSignin.signInSilently();
      return userInfo;
    } catch (error) {
      if (error.code === statusCodes.SIGN_IN_REQUIRED) {
        console.log('User needs to sign in');
        return null;
      }
      console.error('Error getting current user:', error);
      return null;
    }
  },

  // Sign in with Google
  async signIn() {
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      
      // Save user data locally
      await this.saveUserData(userInfo);
      
      // Sync with backend
      await this.syncUserWithBackend(userInfo);
      
      Alert.alert(
        '🎉 Welcome to RiseQuest!',
        `Signed in as ${userInfo.user.name}. Your progress will now sync across devices!`
      );
      
      return userInfo;
    } catch (error) {
      console.error('Google Sign-In error:', error);
      
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        console.log('User cancelled sign-in');
        return null;
      } else if (error.code === statusCodes.IN_PROGRESS) {
        Alert.alert('Sign-in in progress', 'Please wait...');
        return null;
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert('Error', 'Google Play Services not available');
        return null;
      }
      
      Alert.alert('Sign-in Error', 'Could not sign in with Google. Please try again.');
      return null;
    }
  },

  // Sign out
  async signOut() {
    try {
      await clearAuthToken();
      await GoogleSignin.signOut();
      await AsyncStorage.multiRemove([
        'google_user_data',
        'risequest_auth_token',
        'risequest_user_id',
        'wallet_balance',
      ]);
      await riseQuestWalletService.clearCache();
      console.log('✅ User signed out successfully');
      return true;
    } catch (error) {
      console.error('Sign-out error:', error);
      return false;
    }
  },

  // Save user data locally
  async saveUserData(userInfo) {
    try {
      const userId = normalizeUserId(userInfo?.user?.email);
      const userData = {
        id: userInfo?.user?.id,
        userId,
        name: userInfo?.user?.name,
        email: userInfo?.user?.email,
        photo: userInfo?.user?.photo,
        signInTime: Date.now(),
      };
      
      await AsyncStorage.setItem('google_user_data', JSON.stringify(userData));
      console.log('✅ User data saved locally');
    } catch (error) {
      console.error('Error saving user data:', error);
    }
  },

  // Get saved user data
  async getSavedUserData() {
    try {
      const userData = await AsyncStorage.getItem('google_user_data');
      return userData ? JSON.parse(userData) : null;
    } catch (error) {
      console.error('Error getting saved user data:', error);
      return null;
    }
  },

  // Sync user data with backend (Hetzner API)
  async syncUserWithBackend(userInfo) {
    try {
      const userId = normalizeUserId(userInfo?.user?.email);
      if (!userId) {
        throw new Error('Missing Google email; cannot derive userId');
      }
      
      // Initialize wallet service for user
      await riseQuestWalletService.initializeForUser(userId, userInfo?.idToken);
      
      // Get wallet balance (created implicitly on first award/spend in backend)
      const wallet = await riseQuestWalletService.getWallet(userId);

      // Award welcome bonus once per user
      const welcomeKey = `risequest_welcome_bonus_awarded:${userId}`;
      const alreadyAwarded = await AsyncStorage.getItem(welcomeKey);
      if (!alreadyAwarded) {
        await riseQuestWalletService.awardRisePoints(
          userId,
          100,
          'Welcome to RiseQuest!',
          { type: 'welcome_bonus', isNewUser: true }
        );
        await AsyncStorage.setItem(welcomeKey, 'true');
      }
      
      console.log('✅ User synced with backend');
      return { userId, wallet };
    } catch (error) {
      console.error('Error syncing with backend:', error);
      return null;
    }
  },

  // Merge user progress from backend
  async mergeUserProgress(backendData) {
    try {
      // Get local progress
      const localStats = await AsyncStorage.getItem('risequest_stats');
      const localSubscription = await AsyncStorage.getItem('userSubscription');
      
      const localStatsData = localStats ? JSON.parse(localStats) : null;
      const localSubData = localSubscription ? JSON.parse(localSubscription) : null;

      // Get wallet balance from backend
      if (backendData?.wallet) {
        const walletBalance = {
          risePoints: backendData.wallet.xcoins || 0,
          premiumCredits: backendData.wallet.gecredits || 0,
          lastUpdated: Date.now(),
        };
        
        await AsyncStorage.setItem('wallet_balance', JSON.stringify(walletBalance));
        console.log('✅ Wallet balance synced from backend');
      }

      // Preserve local stats if they're more recent or merge carefully
      if (localStatsData && !backendData?.stats) {
        console.log('📊 Keeping local stats (no backend data)');
      } else if (backendData?.stats) {
        await AsyncStorage.setItem('risequest_stats', JSON.stringify(backendData.stats));
        console.log('✅ Stats synced from backend');
      }

      // Save unified user profile
      await AsyncStorage.setItem('user_profile', JSON.stringify({
        userId: backendData?.userId,
        wallet: backendData?.wallet,
        lastSyncTime: Date.now(),
        provider: 'backend',
      }));

    } catch (error) {
      console.error('Error merging user progress:', error);
    }
  },

  // Upload progress to backend
  async uploadProgress(stats, subscription, alarms) {
    try {
      const userInfo = await this.getSavedUserData();
      if (!userInfo) return false;

      const userId = normalizeUserId(userInfo?.email || userInfo?.userId);
      if (!userId) return false;

      // Sync stats by awarding points for achievements
      if (stats?.totalWakeUps > 0) {
        // Award points for historical wake-ups (one-time sync)
        const syncKey = 'historical_wakeups_synced';
        const alreadySynced = await AsyncStorage.getItem(syncKey);
        
        if (!alreadySynced) {
          await riseQuestWalletService.awardRisePoints(
            userId,
            stats.totalWakeUps * 10,
            `Historical sync: ${stats.totalWakeUps} wake-ups`,
            { type: 'historical_sync', wakeUps: stats.totalWakeUps }
          );
          
          await AsyncStorage.setItem(syncKey, 'true');
          console.log('☁️ Historical progress synced to backend');
        }
      }

      return true;
    } catch (error) {
      console.error('Error uploading progress to backend:', error);
      return false;
    }
  },

  // Auto-sync progress periodically
  async autoSync() {
    try {
      const isSignedIn = await this.isSignedIn();
      if (!isSignedIn) return;

      // Get current local data
      const [stats, subscription, alarms] = await Promise.all([
        AsyncStorage.getItem('risequest_stats'),
        AsyncStorage.getItem('userSubscription'),
        AsyncStorage.getItem('risequest_alarms'),
      ]);

      const statsData = stats ? JSON.parse(stats) : null;
      const subData = subscription ? JSON.parse(subscription) : null;
      const alarmsData = alarms ? JSON.parse(alarms) : [];

      // Upload to cloud
      await this.uploadProgress(statsData, subData, alarmsData);
      
    } catch (error) {
      console.error('Auto-sync error:', error);
    }
  },

  // Get user's Google profile for display
  async getUserProfile() {
    try {
      const savedUser = await this.getSavedUserData();
      if (savedUser) {
        return {
          name: savedUser.name,
          email: savedUser.email,
          photo: savedUser.photo,
          isGoogleUser: true,
        };
      }

      const currentUser = await this.getCurrentUser();
      if (currentUser) {
        return {
          name: currentUser.user.name,
          email: currentUser.user.email,
          photo: currentUser.user.photo,
          isGoogleUser: true,
        };
      }

      return null;
    } catch (error) {
      console.error('Error getting user profile:', error);
      return null;
    }
  },

  // Check if user has premium features via Google Play billing
  async checkGooglePlaySubscription() {
    try {
      // This would integrate with Google Play Billing
      // For now, return false as placeholder
      return false;
    } catch (error) {
      console.error('Error checking Google Play subscription:', error);
      return false;
    }
  },
};
