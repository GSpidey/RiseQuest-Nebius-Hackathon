// Enhanced database models for RiseQuest v2 Architecture
import AsyncStorage from '@react-native-async-storage/async-storage';
import { migrateBackendMediaUrl, getBackendBaseUrl } from '../config/backendConfig';
import { authHeaders } from '../services/AuthTokenStorage';
import { createProfileRepository } from '../services/profileRepository';

const profileRepository = createProfileRepository({
  storage: AsyncStorage,
  identity: () => AsyncStorage.getItem('risequest_user_id'),
  request: async (method, body) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${await getBackendBaseUrl()}/api/me/preferences`, {
        method, headers: await authHeaders(), signal: controller.signal,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const result = await response.json();
      if (!response.ok) throw Object.assign(new Error(result.error || 'Could not save preferences'), { status: response.status });
      return result;
    } finally { clearTimeout(timeout); }
  },
});

/**
 * User Profile Management with Age-Adaptive Support
 */
export class UserProfileService {
  static AGE_GROUPS = {
    CHILD: 'child',     // <13, requires parental consent
    TEEN: 'teen',       // 13-17
    ADULT: 'adult'      // 18+
  };

  static USAGE_MODES = {
    STANDARD: 'standard',
    SUPPORT: 'support'  // ADHD/bipolar helpers enabled
  };

  static SUPPORT_CONDITIONS = {
    ADHD: 'adhd',
    ADD: 'add',
    BIPOLAR: 'bipolar',
    GENERAL: 'general'
  };

  static async createUserProfile(userData, { complete = false } = {}) {
    const existing = await this.getUserProfileByEmail(userData.email);
    const resolvedAgeGroup = userData.ageGroup || existing?.ageGroup || null;
    const defaultTeenSafety = resolvedAgeGroup === this.AGE_GROUPS.TEEN;
    const resolvedGoals = Array.isArray(userData.goals)
      ? userData.goals
      : (Array.isArray(userData.preferences?.goals) ? userData.preferences.goals : null);
    const profile = {
      id: userData.isGuest ? (existing?.id || Date.now().toString()) : String(userData.email || '').trim().toLowerCase(),
      version: existing?.version || 0,
      onboardingCompleted: existing?.onboardingCompleted || false,
      isGuest: Boolean(userData.isGuest || String(userData.email || '').endsWith('@risequest.local')),
      email: userData.email,
      phoneNumber: userData.phoneNumber || null,
      photoUrl: userData.photoUrl || userData.photoURL || null,
      bannerUrl: userData.bannerUrl || null,
      authProvider: userData.authProvider || null,
      ageGroup: resolvedAgeGroup,
      ageBand: userData.ageBand || existing?.ageBand,
      countryCode: userData.countryCode || existing?.countryCode,
      supportEnabled: userData.supportEnabled || false,
      supportConditions: userData.supportConditions || [],
      usageMode: userData.usageMode || this.USAGE_MODES.STANDARD,
      parentUserId: userData.parentUserId || null, // For child accounts
      displayName: userData.displayName || 'RiseQuest User',
      preferences: {
        // UI Accessibility
        uiDensity: userData.preferences?.uiDensity || 'standard', // compact, standard, spacious
        reducedSensory: userData.preferences?.reducedSensory || false,
        captionsEnabled: userData.preferences?.captionsEnabled || false,
        ttsEnabled: userData.preferences?.ttsEnabled || false,
        // TTS voice selection (device is free; cloud voices are subscription-gated in UI)
        ttsMode: userData.preferences?.ttsMode || 'device', // device|cloud
        ttsVoice: userData.preferences?.ttsVoice || null,
        colorContrast: userData.preferences?.colorContrast || 'standard',
        dyslexiaFriendly: userData.preferences?.dyslexiaFriendly || false,
        
        // Content & Features
        goals: resolvedGoals || userData.preferences?.goals || ['wake_consistency'],
        focusAreas: userData.preferences?.focusAreas || [],
        notificationStyle: userData.preferences?.notificationStyle || 'gentle',
        
        // Privacy
        dataMinimization: userData.preferences?.dataMinimization || false,
        communityOptIn: userData.preferences?.communityOptIn || false,
        // 'buddies' (private) or 'public'
        communityVisibility: userData.preferences?.communityVisibility || 'buddies',
        // Extra restrictions for teens (defaults on for teen accounts)
        communityTeenSafety: userData.preferences?.communityTeenSafety ?? defaultTeenSafety,
        analyticsOptIn: userData.preferences?.analyticsOptIn ?? false
      },
      subscription: {
        tier: 'free', // free, pro, family
        features: this.getFreeFeatures(),
        expiresAt: null,
        trialUsed: false
      },
      stats: {
        level: 1,
        experience: 0,
        risePoints: 100, // Starting bonus
        streak: 0,
        totalWakeUps: 0,
        joinedAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (complete && !profile.isGuest) return profileRepository.save(profile, { complete: true });
    if (!profile.isGuest) return profileRepository.cache(profile, profile.email);
    await AsyncStorage.setItem('user_profile', JSON.stringify(profile));
    return profile;
  }

  static async restoreForAccount(account) {
    return profileRepository.restore(account);
  }

  static async getUserProfileByEmail(email) {
    const target = String(email || '').trim().toLowerCase();
    if (!target) return null;

    const profile = await this.getUserProfile();
    if (!profile) return null;

    const profileEmail = String(profile.email || '').trim().toLowerCase();
    return profileEmail === target ? profile : null;
  }

  static async getUserProfile() {
    try {
      const profile = await AsyncStorage.getItem('user_profile');
      if (!profile) return null;
      const parsed = JSON.parse(profile);
      const owner = await AsyncStorage.getItem('risequest_user_id');
      if (!parsed.isGuest && (!owner || String(parsed.email || '').trim().toLowerCase() !== String(owner).trim().toLowerCase())) {
        return owner ? profileRepository.local(owner) : null;
      }
      const photoUrl = migrateBackendMediaUrl(parsed.photoUrl);
      const bannerUrl = migrateBackendMediaUrl(parsed.bannerUrl);
      if (photoUrl !== parsed.photoUrl || bannerUrl !== parsed.bannerUrl) {
        parsed.photoUrl = photoUrl;
        parsed.bannerUrl = bannerUrl;
        await AsyncStorage.setItem('user_profile', JSON.stringify(parsed));
      }
      return parsed;
    } catch (error) {
      console.error('Error loading user profile:', error);
      return null;
    }
  }

  static async updateProfile(updates) {
    try {
      const currentProfile = await this.getUserProfile();
      if (!currentProfile) return null;

      const updatedProfile = {
        ...currentProfile,
        ...updates,
        preferences: { ...currentProfile.preferences, ...updates.preferences },
        updatedAt: new Date().toISOString()
      };

      if (!updatedProfile.isGuest) return await profileRepository.save(updatedProfile);
      await AsyncStorage.setItem('user_profile', JSON.stringify(updatedProfile));
      return updatedProfile;
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
  }

  static async toggleSupportMode(enabled, conditions = []) {
    return await this.updateProfile({
      supportEnabled: enabled,
      supportConditions: conditions,
      usageMode: enabled ? this.USAGE_MODES.SUPPORT : this.USAGE_MODES.STANDARD
    });
  }

  static getFreeFeatures() {
    return {
      alarms: { unlimited: true },
      routines: { morning: 1, evening: 1, custom: 0 },
      habits: { max: 5 },
      focusTimer: { basic: true, advanced: false },
      supportFeatures: {
        moodLogging: true,
        sleepLogging: true,
        copingLibrary: { basic: true, premium: false },
        adhdTemplates: true,
        bipolarTemplates: true
      },
      community: { readOnly: true, posting: false },
      risePoints: { earning: true, boostMultiplier: 1.0 },
      store: { basicThemes: true, premiumContent: false },
      analytics: { basic: true, advanced: false, exports: false }
    };
  }

  static getProFeatures() {
    return {
      alarms: { unlimited: true, adaptive: true, smartScheduling: true },
      routines: { morning: -1, evening: -1, custom: -1, conditional: true },
      habits: { max: -1, analytics: true, habitPacks: true },
      focusTimer: { basic: true, advanced: true, intervals: true, blocking: true },
      supportFeatures: {
        moodLogging: true,
        sleepLogging: true,
        copingLibrary: { basic: true, premium: true },
        adhdTemplates: true,
        bipolarTemplates: true,
        correlationCharts: true,
        customTags: true,
        exportData: true,
        coachPrompts: true
      },
      community: { readOnly: true, posting: true, privateCircles: true },
      risePoints: { earning: true, boostMultiplier: 2.0 },
      store: { basicThemes: true, premiumContent: true, exclusiveItems: true },
      analytics: { basic: true, advanced: true, exports: true, cloudBackup: true }
    };
  }

  static async hasFeatureAccess(featurePath) {
    const profile = await this.getUserProfile();
    if (!profile) return false;

    const features = profile.subscription?.tier === 'pro' ?
      this.getProFeatures() : this.getFreeFeatures();

    // Navigate nested feature path (e.g., 'supportFeatures.copingLibrary.premium')
    const pathArray = featurePath.split('.');
    let current = features;
    
    for (const key of pathArray) {
      if (current[key] === undefined) return false;
      current = current[key];
    }
    
    return current === true || current === -1; // -1 means unlimited
  }

  static getAgeAppropriateFeatures(ageGroup) {
    const baseFeatures = {
      communityAccess: ageGroup !== this.AGE_GROUPS.CHILD,
      dataExport: ageGroup === this.AGE_GROUPS.ADULT,
      advancedAnalytics: ageGroup !== this.AGE_GROUPS.CHILD,
      socialFeatures: ageGroup !== this.AGE_GROUPS.CHILD,
      pointsConversion: ageGroup === this.AGE_GROUPS.ADULT, // XCoin bridge
      purchaseCapability: ageGroup !== this.AGE_GROUPS.CHILD || 'parental_consent'
    };

    return baseFeatures;
  }
}

/**
 * Enhanced Alarm Models with Support Features
 */
export class AlarmModel {
  constructor(data = {}) {
    this.id = data.id || Date.now().toString();
    this.userId = data.userId;
    this.label = data.label || 'RiseQuest Alarm';
    this.timeLocal = data.timeLocal; // 24hr format "07:30"
    this.days = data.days || [1, 2, 3, 4, 5]; // 0=Sunday, 1=Monday, etc.
    this.enabled = data.enabled !== false;
    
    // Quest & Challenge Settings
    this.questType = data.questType || 'basic'; // basic, math, memory, physical, adaptive
    this.questDifficulty = data.questDifficulty || 'normal'; // easy, normal, hard, extreme, adaptive
    this.importanceLevel = data.importanceLevel || 'normal'; // low, normal, high, critical
    
    // Support Features
    this.supportFeatures = {
      gentleWake: data.supportFeatures?.gentleWake || false,
      motivationalMessage: data.supportFeatures?.motivationalMessage || '',
      weatherAware: data.supportFeatures?.weatherAware || false,
      moodCheck: data.supportFeatures?.moodCheck || false, // Prompt mood logging
      energyAssessment: data.supportFeatures?.energyAssessment || false,
      adhdFriendly: data.supportFeatures?.adhdFriendly || false, // Extra gentle nudges
      bipolarSafe: data.supportFeatures?.bipolarSafe || false // Mood-sensitive adjustments
    };
    
    // Smart Features (Pro)
    this.smartFeatures = {
      adaptive: data.smartFeatures?.adaptive || false, // Adjust based on performance
      locationAware: data.smartFeatures?.locationAware || false,
      weatherIntegration: data.smartFeatures?.weatherIntegration || false,
      sleepCycleOptimized: data.smartFeatures?.sleepCycleOptimized || false
    };
    
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  static createFromTemplate(templateType, ageGroup, supportConditions = []) {
    const templates = {
      gentle_adhd: {
        label: 'ADHD-Friendly Wake Up',
        questType: 'gentle',
        questDifficulty: 'easy',
        supportFeatures: {
          gentleWake: true,
          adhdFriendly: true,
          motivationalMessage: 'You\'ve got this! One step at a time. 🌟',
          moodCheck: true
        }
      },
      bipolar_stable: {
        label: 'Mood-Stable Morning',
        questType: 'basic',
        questDifficulty: 'easy',
        supportFeatures: {
          bipolarSafe: true,
          energyAssessment: true,
          motivationalMessage: 'Starting gentle today. You matter. 💙'
        }
      },
      child_friendly: {
        label: 'Adventure Alarm!',
        questType: 'fun',
        questDifficulty: 'easy',
        supportFeatures: {
          gentleWake: true,
          motivationalMessage: 'Good morning, explorer! Ready for today\'s adventure? 🦄'
        }
      },
      teen_motivated: {
        label: 'Teen Power Hour',
        questType: 'math',
        questDifficulty: 'normal',
        supportFeatures: {
          motivationalMessage: 'Time to crush today! You\'re stronger than you think! 💪'
        }
      }
    };

    const template = templates[templateType] || templates.gentle_adhd;
    return new AlarmModel(template);
  }
}

/**
 * Routine Models with Support Templates
 */
export class RoutineModel {
  constructor(data = {}) {
    this.id = data.id || Date.now().toString();
    this.userId = data.userId;
    this.name = data.name || 'New Routine';
    this.type = data.type || 'morning'; // morning, evening, custom
    this.enabled = data.enabled !== false;
    this.proOnly = data.proOnly || false;
    
    this.steps = data.steps || [];
    this.supportFeatures = {
      adhdBreakdown: data.supportFeatures?.adhdBreakdown || false, // Break into micro-steps
      bipolarFlexible: data.supportFeatures?.bipolarFlexible || false, // Allow energy-based adjustments
      reminderNudges: data.supportFeatures?.reminderNudges || false,
      progressTracking: data.supportFeatures?.progressTracking || true
    };
    
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  static getTemplates(supportConditions = [], ageGroup = 'adult') {
    const templates = {
      adhd_morning: {
        name: 'ADHD-Friendly Morning',
        type: 'morning',
        steps: [
          { id: 1, title: 'Hydrate', description: 'Drink a glass of water', duration: 1, optional: false },
          { id: 2, title: 'Quick Stretch', description: '2-minute gentle stretch', duration: 2, optional: true },
          { id: 3, title: 'Medication Check', description: 'Take morning medications if needed', duration: 1, optional: false },
          { id: 4, title: 'Intention Setting', description: 'Choose ONE main goal for today', duration: 2, optional: false },
          { id: 5, title: 'Energy Snack', description: 'Eat something small', duration: 5, optional: true }
        ],
        supportFeatures: {
          adhdBreakdown: true,
          reminderNudges: true,
          progressTracking: true
        }
      },
      bipolar_evening: {
        name: 'Mood-Stable Evening',
        type: 'evening',
        steps: [
          { id: 1, title: 'Mood Check', description: 'Rate your mood and energy (1-5)', duration: 2, optional: false },
          { id: 2, title: 'Gratitude Note', description: 'Write one thing you\'re grateful for', duration: 3, optional: false },
          { id: 3, title: 'Tomorrow Prep', description: 'Lay out clothes, prep basics', duration: 5, optional: true },
          { id: 4, title: 'Wind Down', description: 'No screens, gentle activity', duration: 15, optional: false },
          { id: 5, title: 'Sleep Hygiene', description: 'Prepare bedroom for good sleep', duration: 5, optional: false }
        ],
        supportFeatures: {
          bipolarFlexible: true,
          reminderNudges: true,
          progressTracking: true
        }
      },
      child_morning: {
        name: 'Super Kid Morning Quest',
        type: 'morning',
        steps: [
          { id: 1, title: 'Superhero Stretch', description: 'Stretch like your favorite superhero!', duration: 2, optional: false },
          { id: 2, title: 'Dragon Teeth Brushing', description: 'Brush away the dragon germs!', duration: 3, optional: false },
          { id: 3, title: 'Power Breakfast', description: 'Eat your superhero fuel', duration: 10, optional: false },
          { id: 4, title: 'Adventure Pack', description: 'Pack your school adventure bag', duration: 5, optional: false }
        ],
        supportFeatures: {
          adhdBreakdown: true,
          reminderNudges: true,
          progressTracking: true
        }
      }
    };

    // Filter templates based on support conditions and age
    const availableTemplates = {};
    Object.keys(templates).forEach(key => {
      const template = templates[key];
      let isAppropriate = true;

      // Age-based filtering
      if (ageGroup === 'child' && !key.includes('child')) {
        if (key.includes('medication') || key.includes('bipolar')) {
          isAppropriate = false;
        }
      }

      if (isAppropriate) {
        availableTemplates[key] = template;
      }
    });

    return availableTemplates;
  }
}

export default {
  UserProfileService,
  AlarmModel,
  RoutineModel
};
