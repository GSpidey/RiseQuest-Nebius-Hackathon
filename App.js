import { getAuthToken, setAuthToken, clearAuthToken } from './src/services/AuthTokenStorage';
import { checkStoredSession } from './src/services/sessionValidation';
import { challengeDifficulty, prepareAlarmSave, persistAlarmEdit } from './src/services/alarmEditing';
import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  AccessibilityInfo,
  StatusBar,
  Dimensions,
  Modal,
  Platform,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  NativeModules,
  NativeEventEmitter,
  AppState,
  BackHandler,
  Image,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import PushNotification from 'react-native-push-notification';
import Geolocation from 'react-native-geolocation-service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestNotifications, canScheduleExactAlarms, openSettings } from 'react-native-permissions';
import { StripeProvider } from '@stripe/stripe-react-native';
import { getBackendBaseUrl } from './src/config/backendConfig';
import { WELLBEING_NOTICE } from './src/config/wellbeingNotice';
import riseQuestWalletService from './src/services/RiseQuestWalletService';
import RiseQuestLogo from './src/assets/LOGO RISEQUEST.svg';
import TodayScreen from './src/screens/TodayScreen';
import { sunrise, ui, SunriseIcon, ToolRow } from './src/components/SunriseUI';

// RiseQuest v2 Components
import OnboardingScreen from './src/screens/OnboardingScreen';
import { MoodTracker, FocusTimer } from './src/components/SupportComponents';
import CopingLibrary from './src/components/CopingLibrary';
import WalletHubScreen from './src/screens/WalletHubScreen';
import { UserProfileService } from './src/models/RiseQuestModels';

// Advanced Features
import { AdvancedAlarmFeatures } from './src/components/AdvancedAlarmFeatures';
import { MiniGameChallengeSystem } from './src/components/MiniGameChallengeSystem';
import { SleepHealthIntegration } from './src/components/SleepHealthIntegration';
import { LocationSmartFeatures } from './src/components/LocationSmartFeatures';
import { SocialEmergencyFeatures } from './src/components/SocialEmergencyFeatures';
import { AICoachAnalytics } from './src/components/AICoachAnalytics';

// Existing Components
import CreateAlarmScreen from './src/screens/CreateAlarmScreen';
import MiniGameScreen from './src/components/MiniGameScreen';
import EnhancedAlarmScreen from './src/components/EnhancedAlarmScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import AgeScreen from './src/components/AgeScreen';
import { canRegister } from './backend/src/agePolicy';
import DiscreetAd from './src/components/DiscreetAd';
import useTransitionAds from './src/services/useTransitionAds';
import FamilyProfilesScreen from './src/screens/FamilyProfilesScreen';
import CommunityAgeBoundary from './src/components/CommunityAgeBoundary';
import PremiumUpgradeModal from './src/components/PremiumUpgradeModal';
import RisePointsScreen from './src/components/RisePointsScreen';
import CosmeticStore from './src/components/CosmeticStore';
import AdminPanel from './src/AdminPanel';
import AdminDashboardScreen from './src/screens/AdminDashboardScreen';
import TermsAndConditions from './src/TermsAndConditions';
import SupportCenter from './src/SupportCenter';
import PaymentService from './src/PaymentService';
import { MonetizationService } from './src/utils/MonetizationService';
import { communityService } from './src/services/CommunityService';
import PaymentFlowTest from './src/components/PaymentFlowTest';
import { WeatherService } from './src/utils/AIServices';
import Tts from 'react-native-tts';
import ErrorLogService from './src/utils/ErrorLogService';

// Quest System
import QuestScreen from './src/screens/QuestScreen';

// Google Sign-In
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { appleAuth, AppleButton } from '@invertase/react-native-apple-authentication';
import { signInWithApple } from './src/services/AppleAuthService';

const normalizeUserId = (email) => String(email || '').trim().toLowerCase();

const { width, height } = Dimensions.get('window');

// Configure notifications (set up inside component so we can open alarm UI)

export default function App() {
  // Core App State
  const [currentScreen, setCurrentScreen] = useState('loading');
  const [userProfile, setUserProfile] = useState(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [wellnessTab, setWellnessTab] = useState('mood');
  const [verifiedAdminRole, setVerifiedAdminRole] = useState(false);
  const [showAuthInline, setShowAuthInline] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [registrationAgeBand, setRegistrationAgeBand] = useState(null);
  const [registrationCountry, setRegistrationCountry] = useState(null);
  const [showGoogleAgeScreen, setShowGoogleAgeScreen] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPhone, setAuthPhone] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirm, setAuthConfirm] = useState('');
  const [authShowPassword, setAuthShowPassword] = useState(false);
  const [authShowConfirm, setAuthShowConfirm] = useState(false);
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState(null);

  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotStep, setForgotStep] = useState('request'); // request | reset
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotToken, setForgotToken] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotShowPassword, setForgotShowPassword] = useState(false);
  const [forgotShowConfirm, setForgotShowConfirm] = useState(false);

  const screenHistoryRef = useRef([]);
  const previousScreenRef = useRef('loading');

  useEffect(() => {
    const prev = previousScreenRef.current;
    if (prev && prev !== currentScreen) {
      // Keep a small history for back navigation.
      screenHistoryRef.current.push(prev);
      if (screenHistoryRef.current.length > 30) {
        screenHistoryRef.current.shift();
      }
      previousScreenRef.current = currentScreen;
    }
  }, [currentScreen]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const handler = () => {
      if (Keyboard.isVisible()) {
        Keyboard.dismiss();
        return true;
      }
      // Challenge takeover: block back while the alarm challenge is active.
      if (challengeLockActive && (showMiniGame || showEnhancedAlarm)) {
        return true;
      }

      // Close modals first
      if (showCreateAlarm) {
        setShowCreateAlarm(false);
        return true;
      }
      if (showMiniGame) {
        setShowMiniGame(false);
        return true;
      }
      if (showEnhancedAlarm) {
        void handleEnhancedAlarmDismiss('dismiss');
        return true;
      }
      if (showPremiumModal) {
        setShowPremiumModal(false);
        return true;
      }
      if (showRisePoints) {
        setShowRisePoints(false);
        return true;
      }
      if (showCosmeticStore) {
        setShowCosmeticStore(false);
        return true;
      }
      if (showPaymentTest) {
        setShowPaymentTest(false);
        return true;
      }
      if (showAdminPanel) {
        setShowAdminPanel(false);
        return true;
      }
      if (showTermsAndConditions) {
        setShowTermsAndConditions(false);
        return true;
      }
      if (showSupportCenter) {
        setShowSupportCenter(false);
        return true;
      }

      // Inline auth back
      if (currentScreen === 'start' && showAuthInline) {
        setAuthError(null);
        setShowAuthInline(false);
        return true;
      }

      const tabScreens = ['home', 'wellness', 'quests', 'alarms', 'wallet', 'settings', 'community', 'more'];
      if (tabScreens.includes(currentScreen) && currentScreen !== 'home') {
        setCurrentScreen('home');
        return true;
      }

      if (currentScreen !== 'home' && currentScreen !== 'start' && currentScreen !== 'loading') {
        const history = screenHistoryRef.current;
        while (history.length) {
          const candidate = history.pop();
          if (candidate && candidate !== currentScreen) {
            setCurrentScreen(candidate);
            return true;
          }
        }
        setCurrentScreen('home');
        return true;
      }

      // Let Android handle exiting the app from home/start.
      return false;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => subscription.remove();
  }, [
    currentScreen,
    showAuthInline,
    showCreateAlarm,
    showMiniGame,
    showEnhancedAlarm,
    challengeLockActive,
    showPremiumModal,
    showRisePoints,
    showCosmeticStore,
    showPaymentTest,
    showAdminPanel,
    showTermsAndConditions,
    showSupportCenter,
  ]);
  
  // Google Auth setup
  useEffect(() => {
    GoogleSignin.configure({
      webClientId: '628709146989-df1prq7ube4v3383tg8gfe4ha3asrtb6.apps.googleusercontent.com',
      iosClientId: '628709146989-2cgc85rvqm0c3ltnmod9slvtiqfb0okf.apps.googleusercontent.com',
      offlineAccess: true,
      scopes: ['profile', 'email']
    });
  }, []);

  // Existing State
  const [alarms, setAlarms] = useState([]);
  const [userStats, setUserStats] = useState({
    level: 1,
    experience: 0,
    streak: 0,
    totalWakeUps: 0,
    challengesCompleted: 0,
    snoozesUsed: 0,
    lastWakeUpAt: null,
    lastChallengeAt: null,
    lastSnoozeAt: null,
  });
  
  // Modal States
  const [showCreateAlarm, setShowCreateAlarm] = useState(false);
  const [editingAlarm, setEditingAlarm] = useState(null);
  const [showMiniGame, setShowMiniGame] = useState(false);
  const [showEnhancedAlarm, setShowEnhancedAlarm] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [showRisePoints, setShowRisePoints] = useState(false);
  const [showCosmeticStore, setShowCosmeticStore] = useState(false);
  const [showPaymentTest, setShowPaymentTest] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState('USER');
  const [showTermsAndConditions, setShowTermsAndConditions] = useState(false);
  const [showSupportCenter, setShowSupportCenter] = useState(false);
  const [upgradeSource, setUpgradeSource] = useState('general');
  const [currentActiveAlarm, setCurrentActiveAlarm] = useState(null);
  const [currentGameType, setCurrentGameType] = useState('math');
  const [subscription, setSubscription] = useState(null);

  // Alarm challenge takeover state
  const [challengeLockActive, setChallengeLockActive] = useState(false);
  const [challengeGiveUpEnabledAt, setChallengeGiveUpEnabledAt] = useState(0);
  const alarmActionBusyRef = useRef(false);

  const [stripePublishableKey, setStripePublishableKey] = useState(null);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [risePointsBalance, setRisePointsBalance] = useState(null);

  const [mustSetPassword, setMustSetPassword] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordNew, setPasswordNew] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  const [homeWeather, setHomeWeather] = useState(null);
  const [homeWeatherLoading, setHomeWeatherLoading] = useState(false);
  const homeWeatherLastFetchRef = useRef(0);

  const [appThemeId, setAppThemeId] = useState(null);
  const adsSuppressed = Boolean(currentActiveAlarm || challengeLockActive || showCreateAlarm || showMiniGame ||
    showEnhancedAlarm || showPremiumModal || showRisePoints || showCosmeticStore || showPaymentTest ||
    showAdminPanel || showTermsAndConditions || showSupportCenter || showProfileModal || mustSetPassword);
  const cosmeticCheckoutRef = useRef(false);
  useEffect(() => { if (showCosmeticStore) cosmeticCheckoutRef.current = false; }, [showCosmeticStore]);
  const transitionAds = useTransitionAds({
    account: userProfile?.email, guest: isGuest, premium: subscription?.tier !== 'free', ageBand: userProfile?.ageBand,
    blocked: Boolean(currentActiveAlarm || challengeLockActive || showCreateAlarm || showEnhancedAlarm || showPremiumModal ||
      showRisePoints || showPaymentTest || showAdminPanel || showTermsAndConditions || showSupportCenter || showProfileModal || mustSetPassword),
    nextAlarmAt: () => Math.min(...alarms.filter(a => a.isEnabled !== false).map(a => computeNextTrigger(a).getTime())),
  }, showMiniGame ? 'standalone_game_complete' : showCosmeticStore ? 'cosmetics_browse_done' : null);
  const finishCosmeticBrowsing = () => {
    if (!cosmeticCheckoutRef.current) transitionAds.trigger('cosmetics_browse_done');
    setShowCosmeticStore(false);
  };


  useEffect(() => {
    initializeApp();
  }, []);

  useEffect(() => {
    // Start capturing logs for Admin diagnostics.
    ErrorLogService.init({ maxEntries: 300 });
  }, []);

  useEffect(() => {
    const role = String(userRole || '').toUpperCase();
    const ok = Boolean(isAuthenticated && !isGuest && ['STAFF', 'ADMIN', 'SUPERADMIN'].includes(role));
    setIsAdminAuthenticated(ok);
  }, [isAuthenticated, isGuest, userRole]);

  useEffect(() => {
    AsyncStorage.getItem('risequest_user_role')
      .then((r) => {
        if (r) setUserRole(String(r).toUpperCase());
      })
      .catch(() => {});
  }, []);

  const openAdminPanelSecret = () => {
    // Only allow if currently signed in as the admin account.
    if (!isAdminAuthenticated) return;
    setShowAdminPanel(true);
  };

  useEffect(() => {
    // Load equipped theme for minimal global theming (gradients).
    AsyncStorage.getItem('risequest_app_theme_id')
      .then((id) => setAppThemeId(id ? String(id) : null))
      .catch(() => {});
  }, []);

  const getThemeGradient = (themeId) => {
    switch (String(themeId || '')) {
      case 'theme_nature':
      case 'theme_zen':
        return ['#48bb78', '#38a169'];
      case 'theme_urban':
        return ['#feca57', '#ff9ff3'];
      case 'theme_space':
      case 'theme_ocean':
        return ['#667eea', '#764ba2'];
      default:
        return ['#FF7A00', '#FFC83D'];
    }
  };

  const appGradient = getThemeGradient(appThemeId);

  // Administrative navigation must not trust the locally cached role alone.
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    setVerifiedAdminRole(false);
    if (isAuthenticated && !isGuest) {
      (async () => {
        try {
          const token = await getAuthToken();
          if (!token) return;
          const base = await getBackendBaseUrl();
          const response = await fetch(`${base}/api/me`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
          if (!response.ok) return;
          const data = await response.json();
          if (active) setVerifiedAdminRole(['STAFF', 'ADMIN', 'SUPERADMIN'].includes(String(data?.user?.role || '').toUpperCase()));
        } catch (_) {
          // Fail closed for the shortcut if account verification is unavailable.
        } finally { clearTimeout(timeout); }
      })();
    } else { clearTimeout(timeout); }
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [isAuthenticated, isGuest, userProfile?.id, currentScreen === 'more']);

  const loadHomeWeather = async ({ force = false } = {}) => {
    const now = Date.now();
    const last = homeWeatherLastFetchRef.current || 0;
    if (!force && last && now - last < 15 * 60 * 1000) return;

    homeWeatherLastFetchRef.current = now;
    setHomeWeatherLoading(true);
    try {
      const data = await WeatherService.getCurrentWeather({ requestPermission: force });
      setHomeWeather(data);
    } catch (e) {
      setHomeWeather({ error: e?.message || 'Could not fetch weather data' });
    } finally {
      setHomeWeatherLoading(false);
    }
  };

  const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const speakWeatherForAlarm = async (alarm) => {
    try {
      if (!alarm?.weatherAlert) return;
      if (!userProfile?.preferences?.ttsEnabled) return;

      const data = await WeatherService.getCurrentWeather();
      if (!data || data?.error) return;

      const temperature = typeof data.temperature === 'number' ? `${data.temperature}°C` : String(data.temperature || '').trim();
      const description = String(data.description || '').trim();
      const advice = String(WeatherService.getWeatherAdvice(data) || '').trim();

      const parts = [
        'Weather update.',
        temperature && description ? `${temperature}, ${description}.` : (temperature || description),
        advice,
      ].filter(Boolean);

      const text = parts.join(' ');
      if (!text) return;

      await Tts.getInitStatus();
      Tts.stop();
      Tts.speak(text);
    } catch (_) {
      // best-effort only
    }
  };

  const startAlarmTakeover = (alarm, metadata = {}) => {
    if (!alarm) return;
    NativeModules.RiseQuestAlarmAudio?.start(JSON.stringify({
      ...alarm, id: String(alarm.id),
      notificationId: String(alarm.notificationId || toNotificationIntId(alarm.id)),
      customToneUri: alarm.selectedTone === 'custom' ? alarm.customToneUri : null,
    }));
    setCurrentActiveAlarm(alarm);
    setShowEnhancedAlarm(true);

    const requiresChallenge = Boolean(alarm?.challengeMode);
    if (requiresChallenge) {
      const now = Date.now();
      setChallengeLockActive(true);
      setChallengeGiveUpEnabledAt(now + 2 * 60 * 1000);
      setCurrentGameType('math');
      setShowMiniGame(true);
    } else {
      setChallengeLockActive(false);
      setChallengeGiveUpEnabledAt(0);
    }

    void postAlarmEvent('triggered', alarm, { ...metadata, source: metadata?.source || 'takeover' });
  };

  useEffect(() => {
    if (currentScreen !== 'home') return;
    void loadHomeWeather();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScreen]);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !NativeModules.RiseQuestAlarmAudio || !alarms.length) return;
    let live = true;
    const open = id => {
      if (!live || !id || String(currentActiveAlarm?.id) === String(id)) return;
      const alarm = alarms.find(item => String(item.id) === String(id));
      if (alarm) startAlarmTakeover(alarm, { source: 'ios_alarm' });
    };
    const check = () => { if (AppState.currentState === 'active') NativeModules.RiseQuestAlarmAudio.active().then(open).catch(() => {}); };
    const emitter = new NativeEventEmitter(NativeModules.RiseQuestAlarmAudio);
    const event = emitter.addListener('risequestAlarmTriggered', body => open(body.alarmId));
    const state = AppState.addEventListener('change', value => { if (value === 'active') check(); });
    const interval = setInterval(check, 2000);
    check();
    return () => { live = false; event.remove(); state.remove(); clearInterval(interval); };
  }, [alarms, currentActiveAlarm?.id]);

  const ensureAlarmChannel = () => {
    try {
      PushNotification.createChannel(
        {
          channelId: 'risequest-alarms',
          channelName: 'RiseQuest Alarms',
          importance: 4,
          vibrate: true,
          playSound: true,
          soundName: 'default',
        },
        () => {}
      );
    } catch (_) {
      // ignore
    }
  };

  const toNotificationIntId = (value) => {
    // Android notification IDs are effectively 32-bit signed ints.
    // Date.now() overflows; use a small stable hash.
    const str = String(value || '');
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0; // 32-bit
    }
    const positive = Math.abs(hash);
    const max = 2147483647;
    return (positive % (max - 1)) + 1;
  };

  const computeNextTrigger = (alarm) => {
    const now = new Date();
    const [hh, mm] = String(alarm?.time || '07:00').split(':');
    const trigger = new Date(now);
    trigger.setHours(parseInt(hh, 10) || 0);
    trigger.setMinutes(parseInt(mm, 10) || 0);
    trigger.setSeconds(0);
    trigger.setMilliseconds(0);

    if (trigger.getTime() <= now.getTime()) {
      trigger.setDate(trigger.getDate() + 1);
    }
    return trigger;
  };

  const scheduleAlarmNotification = async (alarm, overrideDate = null) => {
    try {
      if (!alarm || alarm.isEnabled === false) return;
      ensureAlarmChannel();

      const notificationId = Number(alarm.notificationId) || toNotificationIntId(alarm.id);
      const trigger = overrideDate || computeNextTrigger(alarm);
      if (Platform.OS === 'ios') {
        await NativeModules.RiseQuestAlarmAudio.schedule(JSON.stringify({ ...alarm, id: String(alarm.id), triggerMs: trigger.getTime() }));
        return;
      }

      PushNotification.localNotificationSchedule({
        id: notificationId,
        channelId: 'risequest-alarms',
        title: alarm.label || 'RiseQuest Alarm',
        message: alarm.customMessage || 'Time to wake up and start your quest!',
        date: trigger,
        allowWhileIdle: true,
        playSound: true,
        soundName: 'default',
        vibrate: true,
        vibration: 800,
        priority: 'high',
        visibility: 'public',
        // Only include repeatType when repeating; passing null can break scheduling on some devices.
        ...(alarm.repeatDaily ? { repeatType: 'day' } : {}),
        userInfo: {
          alarmId: String(alarm.id),
          notificationId: String(notificationId),
          toneUri: alarm.selectedTone === 'custom' ? String(alarm.customToneUri || '') : '',
          startVolume: String(alarm.startVolume ?? 0.35),
          maxVolume: String(alarm.maxVolume ?? 1),
          volumeCurve: String(alarm.volumeCurve || 'gentle'),
        },
      });
    } catch (e) {
      console.warn('Schedule alarm failed:', e);
      if (Platform.OS === 'ios') throw e;
    }
  };

  const cancelAlarmNotification = (alarm) => {
    if (Platform.OS === 'ios') return NativeModules.RiseQuestAlarmAudio.cancel(String(alarm?.id));
    try {
      const notificationId = Number(alarm?.notificationId) || toNotificationIntId(alarm?.id);
      PushNotification.cancelLocalNotification(notificationId);
    } catch (_) {
      // ignore
    }
  };

  const postAlarmEvent = async (type, alarm, metadata = {}) => {
    try {
      const token = await getAuthToken();
      if (!token) return;
      const baseUrl = await getBackendBaseUrl();
      await fetch(`${baseUrl}/api/events/alarm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type,
          alarmId: alarm?.id != null ? String(alarm.id) : null,
          metadata: {
            importanceLevel: alarm?.importanceLevel,
            repeatDaily: alarm?.repeatDaily,
            snoozeChallengeMode: alarm?.snoozeChallengeMode,
            ...metadata,
          },
        }),
      });
    } catch (_) {
      // best-effort only
    }
  };

  useEffect(() => {
    MonetizationService.setUpgradeModalHandler((source) => {
      if (isGuest) {
        Alert.alert('Sign in required', 'Create an account to unlock premium features.');
        return;
      }
      setUpgradeSource(source || 'general');
      setShowPremiumModal(true);
    });

    return () => {
      MonetizationService.setUpgradeModalHandler(null);
    };
  }, [isGuest]);

  // Initialize notification configuration
  useEffect(() => {
    try {
      PushNotification.configure({
        onRegister: function (token) {
          // Notification registration token must not be logged.
        },
        onNotification: function (notification) {
          try {
            const rawId = notification?.id || notification?.data?.id || notification?.userInfo?.alarmId;
            const alarmId = notification?.userInfo?.alarmId || notification?.data?.alarmId || rawId;
            if (alarmId) {
              AsyncStorage.setItem('risequest_last_alarm_id', String(alarmId)).catch(() => {});
              const match = alarms.find(a => String(a.id) === String(alarmId) || String(a.notificationId) === String(rawId));
              if (match) {
                startAlarmTakeover(match, { source: 'notification', rawId: rawId != null ? String(rawId) : null });
              }
            }
          } catch (_) {
            // ignore
          }
        },
        permissions: {
          alert: true,
          badge: true,
          sound: true,
        },
        popInitialNotification: true,
        requestPermissions: false,
      });
    } catch (e) {
      console.warn('Push notification configure failed:', e);
    }
  }, [alarms]);

  // Cold-start: if app was opened from an alarm notification, show the alarm UI.
  useEffect(() => {
    if (!alarms.length) return;
    AsyncStorage.getItem('risequest_last_alarm_id')
      .then((id) => {
        if (!id) return;
        AsyncStorage.removeItem('risequest_last_alarm_id').catch(() => {});
        const match = alarms.find(a => String(a.id) === String(id));
        if (match) {
          startAlarmTakeover(match, { source: 'cold_start' });
        }
      })
      .catch(() => {});
  }, [alarms]);

  const loadStripeConfig = async () => {
    try {
      const baseUrl = await getBackendBaseUrl();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      let resp;
      try { resp = await fetch(`${baseUrl}/api/mobile-config`, { signal: controller.signal }); }
      finally { clearTimeout(timeout); }
      if (!resp.ok) throw new Error('Payment configuration is temporarily unavailable');
      const json = await resp.json();

      const pk = json?.stripePublishableKey;
      if (typeof pk !== 'string' || !/^pk_(live|test)_\w+$/.test(pk)) {
        throw new Error('Stripe publishable key missing from backend');
      }

      await AsyncStorage.setItem('risequest_stripe_publishable_key', pk);
      setStripePublishableKey(pk);
    } catch (error) {
      console.warn('Stripe config load failed:', error);
      const cached = await AsyncStorage.getItem('risequest_stripe_publishable_key').catch(() => null);
      if (cached && /^pk_(live|test)_\w+$/.test(cached)) {
        setStripePublishableKey(cached);
      }
    }
  };

  const initializeApp = async () => {
    try {
      // Local alarms and guest/offline screens do not depend on a payment API.
      void loadStripeConfig();

      // Permissions are requested only when the relevant feature is used.
      
      // Check authentication status
      const authState = await checkAuthStatus();
      
      // Load user data if authenticated
      if (authState?.isAuthenticated) {
        await loadUserData();
        await refreshRisePointsBalance();
        if (!authState.isGuest) {
          await initializeMonetization();
          await PaymentService.initializePayments();
        }

        // If this is a Google-auth account without a password, require password setup.
        if (!authState.isGuest) {
          try {
            const token = await getAuthToken();
            if (token) {
              await checkPasswordRequirement(token);
            }
          } catch (_) {
            // ignore
          }
        }
      }
    } catch (error) {
      console.error('App initialization error:', error);
      setCurrentScreen('start');
    }
  };

  const checkPasswordRequirement = async (token) => {
    try {
      const baseUrl = await getBackendBaseUrl();
      const resp = await fetch(`${baseUrl}/api/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const text = await resp.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch (_) {
        json = null;
      }
      if (!resp.ok || !json) return;
      const provider = String(json?.user?.authProvider || '').toLowerCase();
      const hasPassword = Boolean(json?.user?.hasPassword);

      // Only mandate for Google accounts when backend tells us password isn't set.
      if (provider === 'google' && hasPassword === false) {
        setMustSetPassword(true);
      } else {
        setMustSetPassword(false);
      }
    } catch (e) {
      // If backend doesn't support hasPassword yet or is unreachable, don't block the app.
      return;
    }
  };

  const submitPassword = async () => {
    const p1 = String(passwordNew || '');
    const p2 = String(passwordConfirm || '');
    if (p1.length < 8) {
      Alert.alert('Set Password', 'Password must be at least 8 characters.');
      return;
    }
    if (p1 !== p2) {
      Alert.alert('Set Password', 'Passwords do not match.');
      return;
    }

    setPasswordBusy(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        Alert.alert('Set Password', 'You are not signed in.');
        return;
      }
      const baseUrl = await getBackendBaseUrl();
      const resp = await fetch(`${baseUrl}/api/auth/set-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: p1 }),
      });
      const text = await resp.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch (_) {
        json = null;
      }
      if (!resp.ok) {
        const backendError = json?.error || json?.message;
        const hint = !json && typeof text === 'string' && text.trim().startsWith('<')
          ? 'The server returned HTML (likely a missing endpoint or reverse-proxy error).'
          : null;

        if (resp.status === 404) {
          throw new Error('Your backend is missing /api/auth/set-password (needs redeploy).');
        }

        throw new Error(backendError || `Failed to set password (HTTP ${resp.status}).${hint ? ` ${hint}` : ''}`);
      }
      setPasswordNew('');
      setPasswordConfirm('');
      setMustSetPassword(false);
      Alert.alert('Password saved', 'You can now sign in with email + password too.');
    } catch (e) {
      Alert.alert('Set Password', e?.message ? String(e.message) : 'Failed to set password');
    } finally {
      setPasswordBusy(false);
    }
  };

  const refreshRisePointsBalance = async () => {
    try {
      const bal = await riseQuestWalletService.getBalance();
      const points = typeof bal?.risePoints === 'number' ? bal.risePoints : 0;
      setRisePointsBalance(points);
    } catch (error) {
      console.warn('RisePoints balance refresh failed:', error);
    }
  };

  const awardDailyActivityPoints = async ({ action, points, reason, minFocusMinutes }) => {
    try {
      if (!isAuthenticated || isGuest) return false;
      const email = userProfile?.email;
      if (!email) return false;

      if (action === 'focus_session_complete' && typeof minFocusMinutes === 'number') {
        // caller will pass minFocusMinutes check before calling, but keep a guard
        if (minFocusMinutes < 1) return false;
      }

      const today = new Date().toISOString().slice(0, 10);
      const key = `rise_points_daily:${normalizeUserId(email)}:${String(action)}:${today}`;
      const already = await AsyncStorage.getItem(key);
      if (already === '1') {
        return false;
      }

      const userId = normalizeUserId(email);
      await riseQuestWalletService.awardRisePoints(userId, Number(points), String(reason));
      await AsyncStorage.setItem(key, '1');
      await refreshRisePointsBalance();
      return true;
    } catch (error) {
      console.warn('Award daily points failed:', error);
      return false;
    }
  };

  useEffect(() => {
    // Refresh when closing the RisePoints screen
    if (!showRisePoints && isAuthenticated && !isGuest) {
      refreshRisePointsBalance();
    }
  }, [showRisePoints, isAuthenticated, isGuest]);

  useEffect(() => {
    // Refresh wallet balances when opening wallet screen.
    if (currentScreen === 'wallet' && isAuthenticated && !isGuest) {
      refreshRisePointsBalance();
    }
  }, [currentScreen, isAuthenticated, isGuest]);

  useEffect(() => {
    // Keep backend community settings aligned with local profile prefs.
    const sync = async () => {
      if (!isAuthenticated || isGuest) return;
      const optIn = Boolean(userProfile?.preferences?.communityOptIn);
      if (!optIn) return;
      const visibility = userProfile?.preferences?.communityVisibility === 'public' ? 'PUBLIC' : 'BUDDIES';
      const teenSafety = Boolean(userProfile?.preferences?.communityTeenSafety);
      try {
        await communityService.updateSettings({ optIn: true, visibility, teenSafety });
      } catch (_) {
        // ignore
      }
    };
    void sync();
  }, [isAuthenticated, isGuest, userProfile?.preferences?.communityOptIn, userProfile?.preferences?.communityVisibility, userProfile?.preferences?.communityTeenSafety]);

  const checkAuthStatus = async () => {
    try {
      let existingProfile = await UserProfileService.getUserProfile();
      if (!existingProfile?.isGuest) {
        const storedToken = await getAuthToken();
        const session = await checkStoredSession(await getBackendBaseUrl(), storedToken);
        if (session === 'rejected') {
          await clearAuthToken();
          setIsAuthenticated(false);
          setIsGuest(false);
          setVerifiedAdminRole(false);
          setAuthError('Your saved session has expired. Sign in again; your account, alarms, and points are safe.');
          setCurrentScreen('start');
          setShowAuthInline(true);
          return { isAuthenticated: false, isGuest: false };
        }
        if (session === 'valid') {
          const owner = await AsyncStorage.getItem('risequest_user_id');
          if (owner) existingProfile = await UserProfileService.restoreForAccount({ email: owner });
        }
      }
      if (existingProfile && (existingProfile.isGuest || await getAuthToken())) {
        const guest = Boolean(existingProfile.isGuest);
        setUserProfile(existingProfile);
        setIsAuthenticated(true);
        setIsGuest(guest);
        setNeedsOnboarding(!guest && !existingProfile.onboardingCompleted);
        setCurrentScreen(guest || existingProfile.onboardingCompleted ? 'home' : 'onboarding');
        setShowAuthInline(false);
        return { isAuthenticated: true, isGuest: guest };
      }

      const guestMode = await AsyncStorage.getItem('guest_mode');
      if (guestMode === 'true') {
        const guestProfile = await UserProfileService.createUserProfile({
          email: `guest_${Date.now()}@risequest.local`,
          displayName: 'Guest',
          supportEnabled: false,
        });
        await UserProfileService.updateProfile({ isGuest: true });
        setUserProfile({ ...guestProfile, isGuest: true });
        setIsAuthenticated(true);
        setIsGuest(true);
        setCurrentScreen('home');
        setShowAuthInline(false);
        return { isAuthenticated: true, isGuest: true };
      }

      const authToken = await getAuthToken();
      if (authToken) {
        setIsAuthenticated(true);
        setIsGuest(false);
        setCurrentScreen('home');
        setShowAuthInline(false);
        return { isAuthenticated: true, isGuest: false };
      }

      setCurrentScreen('start');
      setShowAuthInline(false);
      return { isAuthenticated: false, isGuest: false };
    } catch (error) {
      console.error('Auth check error:', error);
      setCurrentScreen('start');
      setShowAuthInline(false);
      return { isAuthenticated: false, isGuest: false };
    }
  };

  const saveAuthSession = async ({ userId, token, email }) => {
    await AsyncStorage.removeItem('guest_mode');
    if (email) await AsyncStorage.setItem('user_email', email);
    await AsyncStorage.setItem('risequest_user_id', userId);
    await setAuthToken(token);
  };

  const saveUserRole = async (role) => {
    const r = String(role || 'USER').toUpperCase();
    setUserRole(r);
    try {
      await AsyncStorage.setItem('risequest_user_role', r);
    } catch (_) {
      // ignore
    }
  };

  const handleEmailSignup = async () => {
    setAuthError(null);
    if (!canRegister(registrationAgeBand, registrationCountry)) {
      setAuthError('Please select your age group. A parent manages profiles for children under 13.');
      return;
    }
    if (!authEmail || !authPassword) {
      setAuthError('Email and password are required.');
      return;
    }
    if (authPassword.length < 8) {
      setAuthError('Password must be at least 8 characters.');
      return;
    }
    if (authPassword !== authConfirm) {
      setAuthError('Passwords do not match.');
      return;
    }

    setAuthBusy(true);
    try {
      const baseUrl = await getBackendBaseUrl();
      const resp = await fetch(`${baseUrl}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: authEmail.trim().toLowerCase(),
          phoneNumber: authPhone.trim() || null,
          password: authPassword,
          displayName: authDisplayName || 'RiseQuest User',
          ageBand: registrationAgeBand,
          countryCode: registrationCountry,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.error || 'Sign up failed');
      }

      await saveAuthSession({ userId: data.user.id, token: data.token, email: data.user.email });
      await saveUserRole(data?.user?.role || 'USER');
      await riseQuestWalletService.initializeForUser(data.user.id, data.token);

      // Signup creates the server profile. Restore its version before any
      // onboarding write so a first save cannot conflict with that initial row.
      const profile = await UserProfileService.restoreForAccount({
        email: data.user.email,
        phoneNumber: data.user.phoneNumber || (authPhone.trim() || null),
        displayName: data.user.displayName || authDisplayName || 'RiseQuest User',
        authProvider: 'password',
        photoUrl: data.user.photoUrl || null,
        bannerUrl: data.user.bannerUrl || null,
      });
      setUserProfile(profile);
      setIsAuthenticated(true);
      setIsGuest(false);
      setNeedsOnboarding(true);
      setCurrentScreen('onboarding');
    } catch (error) {
      console.error('Email signup error:', error);
      setAuthError(error.message || 'Sign up failed');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleEmailLogin = async () => {
    setAuthError(null);
    if (!authEmail || !authPassword) {
      setAuthError('Email/phone and password are required.');
      return;
    }

    setAuthBusy(true);
    try {
      const identifier = authEmail.trim();
      const baseUrl = await getBackendBaseUrl();
      const resp = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier,
          password: authPassword,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        if (
          resp.status === 401 &&
          String(data?.error || '').toLowerCase().includes('invalid') &&
          String(identifier || '').trim().toLowerCase() === 'admin@goldenepics.com'
        ) {
          throw new Error('Invalid credentials. If this is the admin account, the backend may need admin bootstrap enabled.');
        }
        throw new Error(data?.error || 'Login failed');
      }

      await saveAuthSession({ userId: data.user.id, token: data.token, email: data.user.email });
      await saveUserRole(data?.user?.role || 'USER');
      await riseQuestWalletService.initializeForUser(data.user.id, data.token);

      const profile = await UserProfileService.restoreForAccount(data.user);
      setUserProfile(profile);
      setNeedsOnboarding(!profile.onboardingCompleted);
      setCurrentScreen(profile.onboardingCompleted ? 'home' : 'onboarding');

      setIsAuthenticated(true);
      setIsGuest(false);
    } catch (error) {
      console.error('Email login error:', error);
      setAuthError(error.message || 'Login failed');
    } finally {
      setAuthBusy(false);
    }
  };

  const enterChildSession = async ({ token, user }) => {
    // Do not retain a reusable parent token on a child's screen. Returning to
    // guardian controls requires normal parent authentication.
    await riseQuestWalletService.clearCache();
    await saveAuthSession({ userId: user.id, token, email: user.email });
    await saveUserRole('USER');
    const restored = await UserProfileService.restoreForAccount(user);
    await riseQuestWalletService.initializeForUser(user.id, token);
    setSubscription(null);
    setVerifiedAdminRole(false);
    setUserStats({ level: 1, experience: 0, streak: 0, totalWakeUps: 0,
      challengesCompleted: 0, snoozesUsed: 0, lastWakeUpAt: null, lastChallengeAt: null, lastSnoozeAt: null });
    setUserProfile(restored); setIsAuthenticated(true); setIsGuest(false);
    setNeedsOnboarding(false); setCurrentScreen('home');
  };

  const openForgotPassword = () => {
    setForgotStep('request');
    setForgotEmail(String(authEmail || '').trim());
    setForgotToken('');
    setForgotNewPassword('');
    setForgotConfirmPassword('');
    setForgotBusy(false);
    setForgotShowPassword(false);
    setForgotShowConfirm(false);
    setShowForgotPassword(true);
  };

  const requestPasswordReset = async () => {
    const email = String(forgotEmail || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      Alert.alert('Forgot password', 'Enter a valid email.');
      return;
    }
    setForgotBusy(true);
    try {
      const baseUrl = await getBackendBaseUrl();
      const resp = await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const text = await resp.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      // Always show generic success.
      Alert.alert('Check your email', 'If an account exists for that email, a reset code will be sent.');
      if (json?.devToken) {
        setForgotToken(String(json.devToken));
        Alert.alert('Dev reset token', `Use this token to reset now:\n\n${String(json.devToken)}`);
      }
      setForgotStep('reset');
    } catch (e) {
      Alert.alert('Forgot password', 'Could not request a reset.');
    } finally {
      setForgotBusy(false);
    }
  };

  const submitPasswordReset = async () => {
    const email = String(forgotEmail || '').trim().toLowerCase();
    const token = String(forgotToken || '').trim();
    const p1 = String(forgotNewPassword || '');
    const p2 = String(forgotConfirmPassword || '');
    if (!email || !email.includes('@')) {
      Alert.alert('Reset password', 'Enter a valid email.');
      return;
    }
    if (!token) {
      Alert.alert('Reset password', 'Enter the reset token.');
      return;
    }
    if (p1.length < 8) {
      Alert.alert('Reset password', 'Password must be at least 8 characters.');
      return;
    }
    if (p1 !== p2) {
      Alert.alert('Reset password', 'Passwords do not match.');
      return;
    }

    setForgotBusy(true);
    try {
      const baseUrl = await getBackendBaseUrl();
      const resp = await fetch(`${baseUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, password: p1 }),
      });
      const text = await resp.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (!resp.ok) {
        throw new Error(json?.error || `Reset failed (HTTP ${resp.status})`);
      }
      let resetProfile = null;
      if (json?.token && json?.user?.id) {
        await saveAuthSession({ userId: json.user.id, token: json.token, email: json.user.email });
        await saveUserRole(json?.user?.role || 'USER');
        try {
          await riseQuestWalletService.initializeForUser(json.user.id, json.token);
        } catch (e) {
          console.warn('Wallet init after reset failed:', e);
        }

        resetProfile = await UserProfileService.restoreForAccount(json.user);
        setUserProfile(resetProfile);
      }
      setShowForgotPassword(false);
      setAuthPassword('');
      setAuthConfirm('');
      setAuthError(null);
      setIsAuthenticated(true);
      setIsGuest(false);
      setNeedsOnboarding(Boolean(resetProfile && !resetProfile.onboardingCompleted));
      setCurrentScreen(resetProfile?.onboardingCompleted ? 'home' : 'onboarding');
      setShowAuthInline(false);
      Alert.alert('Password updated', 'You can sign in with your new password.');
    } catch (e) {
      Alert.alert('Reset password', e?.message ? String(e.message) : 'Reset failed');
    } finally {
      setForgotBusy(false);
    }
  };

  const continueAsGuest = async () => {
    try {
      await AsyncStorage.setItem('guest_mode', 'true');
      const guestProfile = await UserProfileService.createUserProfile({
        email: `guest_${Date.now()}@risequest.local`,
        displayName: 'Guest',
        supportEnabled: false,
      });
      await UserProfileService.updateProfile({ isGuest: true });
      setUserProfile({ ...guestProfile, isGuest: true });
      setIsAuthenticated(true);
      setIsGuest(true);
      setNeedsOnboarding(false);
      setCurrentScreen('home');
      setShowAuthInline(false);
    } catch (error) {
      console.error('Guest mode error:', error);
      Alert.alert('Guest Mode', 'Unable to start guest session.');
    }
  };

  const handleGoogleSignIn = async () => {
    if ((authMode === 'signup' || showGoogleAgeScreen) && !canRegister(registrationAgeBand, registrationCountry)) {
      setShowGoogleAgeScreen(true);
      setAuthError('Please select your age and country before continuing. A parent manages profiles where required.');
      return;
    }
    try {
      if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      // Force the account chooser so we don't silently reuse a cached account.
      try {
        await GoogleSignin.signOut();
      } catch (_) {
        // ignore
      }

      const signInResponse = await GoogleSignin.signIn();

      if (signInResponse?.type !== 'success') {
        // cancelled
        return;
      }

      const userInfo = signInResponse.data;
      if (!userInfo?.user?.email) {
        throw new Error('Google sign-in did not return user info.');
      }

      const tokens = await GoogleSignin.getTokens();
      const idToken = tokens?.idToken || userInfo?.idToken;

      if (!idToken) {
        throw new Error('Google sign-in did not return an idToken.');
      }

      // Exchange Google idToken for RiseQuest JWT + canonical user profile
      const baseUrl = await getBackendBaseUrl();
      const backendResp = await fetch(`${baseUrl}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, ageBand: registrationAgeBand, countryCode: registrationCountry }),
      });
      const backendJson = await backendResp.json();
      if (!backendResp.ok) {
        if (backendJson?.code === 'AGE_SCREEN_REQUIRED') { setShowGoogleAgeScreen(true); setAuthError(backendJson.error); return; }
        throw new Error(backendJson?.error || 'Google authentication failed');
      }

      await saveAuthSession({
        userId: backendJson.user.id,
        token: backendJson.token,
        email: backendJson.user.email,
      });

      await saveUserRole(backendJson?.user?.role || 'USER');

      // Require password setup if backend indicates none is set.
      await checkPasswordRequirement(backendJson.token);
        
        // Create or update user profile
        const profileData = {
        email: backendJson.user.email,
        displayName: backendJson.user.displayName,
        phoneNumber: backendJson.user.phoneNumber || null,
        photoUrl: backendJson.user.photoUrl || userInfo.user.photo || null,
        bannerUrl: backendJson.user.bannerUrl || null,
        authProvider: 'google',
        };

        // Initialize backend wallet auth context
        const userId = normalizeUserId(profileData.email);
        await riseQuestWalletService.initializeForUser(userId, backendJson.token);

        const restored = await UserProfileService.restoreForAccount(profileData);
        setUserProfile(restored);
        setIsAuthenticated(true);
        setIsGuest(false);
        setNeedsOnboarding(!restored.onboardingCompleted);
        setCurrentScreen(restored.onboardingCompleted ? 'home' : 'onboarding');
        setShowAuthInline(false);
    } catch (error) {
      console.error('Google auth error:', error);
      const message = error?.message ? String(error.message) : 'Failed to sign in with Google.';
      const codeSuffix = error?.code ? `\n\nCode: ${String(error.code)}` : '';
      Alert.alert('Authentication Error', `${message}${codeSuffix}`);
    }
  };

  const handleAppleSignIn = async () => {
    if ((authMode === 'signup' || showGoogleAgeScreen) && !canRegister(registrationAgeBand, registrationCountry)) {
      setShowGoogleAgeScreen(true);
      return;
    }
    if (authBusy) return;
    setAuthBusy(true);
    try {
      const result = await signInWithApple({ ageBand: registrationAgeBand, countryCode: registrationCountry });
      await riseQuestWalletService.clearCache();
      await saveAuthSession({ userId: result.user.id, email: result.user.email, token: result.token });
      await saveUserRole(result.user.role || 'USER');
      await riseQuestWalletService.initializeForUser(result.user.id, result.token);
      const restored = await UserProfileService.restoreForAccount(result.user);
      setUserProfile(restored); setIsAuthenticated(true); setIsGuest(false);
      setNeedsOnboarding(!restored.onboardingCompleted);
      setCurrentScreen(restored.onboardingCompleted ? 'home' : 'onboarding');
      setShowAuthInline(false);
    } catch (error) {
      if (error.code === 'AGE_SCREEN_REQUIRED') { setShowGoogleAgeScreen(true); setAuthError(error.message); return; }
      if (error.code !== appleAuth.Error.CANCELED) Alert.alert('Apple sign-in', error.message || 'Please try again.');
    } finally { setAuthBusy(false); }
  };

  const handleOnboardingComplete = async (completedProfile) => {
    try {
      try {
        const emailKey = normalizeUserId(completedProfile?.email);
        if (emailKey) {
          await AsyncStorage.setItem(`risequest_onboarded_email:${emailKey}`, 'true');
        }
      } catch (_) {
        // ignore
      }
      setUserProfile(completedProfile);
      setIsAuthenticated(true);
      setNeedsOnboarding(false);
      setCurrentScreen('home');
      
      // Initialize app data for new user
      await loadUserData();
      await initializeMonetization();
      await PaymentService.initializePayments();
      
      Alert.alert(
        'Welcome to RiseQuest! 🎉',
        'Your personalized experience is ready. Let\'s start your journey to better mornings!'
      );
    } catch (error) {
      console.error('Onboarding completion error:', error);
      Alert.alert('Error', 'Failed to complete setup. Please try again.');
    }
  };

  const signOut = async () => {
    try {
      await clearAuthToken();
      await AsyncStorage.multiRemove([
        'auth_token',
        'user_email',
        'user_profile',
        'risequest_user_id',
        'risequest_auth_token',
        'wallet_balance',
        'guest_mode',
        'risequest_user_role',
      ]);
      await riseQuestWalletService.clearCache();
      setUserProfile(null);
      setIsAuthenticated(false);
      setIsGuest(false);
      setUserRole('USER');
      setCurrentScreen('start');
      setSubscription(null);
      setUserStats({
        level: 1,
        experience: 0,
        streak: 0,
        totalWakeUps: 0,
        challengesCompleted: 0,
        snoozesUsed: 0,
        lastWakeUpAt: null,
        lastChallengeAt: null,
        lastSnoozeAt: null,
      });
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const initializeMonetization = async () => {
    try {
      // Load subscription data
      const sub = await MonetizationService.getUserSubscription();
      setSubscription(sub);
      
      // Check trial expiry
      await MonetizationService.checkTrialExpiry();
      
      // Show onboarding for new users
      if (!sub.trialUsed && sub.tier === MonetizationService.TIERS.FREE) {
        setTimeout(() => {
          MonetizationService.initializeNewUser();
        }, 2000); // Show after 2 seconds
      }
    } catch (error) {
      console.error('Error initializing monetization:', error);
    }
  };

  const ensureAlarmPermissions = async () => {
    if (Platform.OS === 'ios') {
      const allowed = await NativeModules.RiseQuestAlarmAudio.requestPermission();
      if (!allowed) Alert.alert('Alarm permission', 'Enable RiseQuest alarms or notifications in iPhone Settings before saving.');
      return Boolean(allowed);
    }
    const { status } = await requestNotifications(['alert', 'sound']);
    if (status !== 'granted') {
      Alert.alert('Alarm notifications', 'Enable notifications so your alarm can notify you.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Open settings', onPress: () => openSettings('notifications').catch(() => {}) },
      ]);
      return false;
    }
    if (Number(Platform.Version) >= 31 && !await canScheduleExactAlarms()) {
      Alert.alert('Alarms & reminders', 'Allow RiseQuest to schedule exact alarms, then return and save your alarm.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Open settings', onPress: () => openSettings('alarms').catch(() => {}) },
      ]);
      return false;
    }
    return true;
  };

  const loadUserData = async () => {
    try {
      const savedAlarms = await AsyncStorage.getItem('risequest_alarms');
      const savedStats = await AsyncStorage.getItem('risequest_stats');
      
      if (savedAlarms) {
        const parsed = JSON.parse(savedAlarms);
        const next = Array.isArray(parsed)
          ? parsed.map((a) => {
              if (a && !a.notificationId) {
                return { ...a, notificationId: toNotificationIntId(a.id) };
              }
              return a;
            })
          : [];

        setAlarms(next);
        await AsyncStorage.setItem('risequest_alarms', JSON.stringify(next));

        // Best-effort reschedule enabled alarms (covers cases where app was updated or device rebooted).
        if (Platform.OS === 'android') next.forEach((a) => {
          if (a?.isEnabled !== false) {
            cancelAlarmNotification(a);
            scheduleAlarmNotification(a);
          }
        });
        // Old builds used millisecond timestamps as Android notification IDs.
        // These cannot fit in Android's int ID and fail repeatedly at boot.
        // Current alarms above have already been scheduled with valid IDs.
        PushNotification.getScheduledLocalNotifications((scheduled) => {
          scheduled.forEach((item) => {
            if (/^\d+$/.test(String(item.id)) && Number(item.id) > 2147483647) {
              PushNotification.cancelLocalNotification(String(item.id));
            }
          });
        });
      }
      
      if (savedStats) {
        const parsed = JSON.parse(savedStats);
        setUserStats({
          level: 1,
          experience: 0,
          streak: 0,
          totalWakeUps: 0,
          challengesCompleted: 0,
          snoozesUsed: 0,
          lastWakeUpAt: null,
          lastChallengeAt: null,
          lastSnoozeAt: null,
          ...parsed,
        });
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const deleteAlarm = async (alarmId) => {
    // Cancel notification (use stored notificationId when present)
    const alarm = alarms.find(a => String(a.id) === String(alarmId));
    if (alarm) {
      cancelAlarmNotification(alarm);
    } else {
      try {
        PushNotification.cancelLocalNotification(toNotificationIntId(alarmId));
      } catch (_) {
        // ignore
      }
    }
    
    // Remove from state and storage
    const updatedAlarms = alarms.filter(alarm => alarm.id !== alarmId);
    setAlarms(updatedAlarms);
    await AsyncStorage.setItem('risequest_alarms', JSON.stringify(updatedAlarms));
    
    AccessibilityInfo.announceForAccessibility('Alarm deleted.');
  };

  const handleEnhancedAlarmDismiss = async (action, challengeSatisfied = false) => {
    const alarmForEvent = currentActiveAlarm;

    // If this alarm requires challenge takeover, prevent dismiss/snooze.
    if (challengeLockActive && alarmForEvent?.challengeMode && action !== 'challenge' && !challengeSatisfied) {
      setCurrentGameType('math');
      setShowMiniGame(true);
      return;
    }

    if (action === 'challenge') {
      // Keep the alarm screen mounted so audio continues; show the mini-game on top.
      if (!challengeLockActive) {
        setChallengeLockActive(true);
        setChallengeGiveUpEnabledAt(Date.now() + 2 * 60 * 1000);
      }
      await postAlarmEvent('challenge', alarmForEvent, { source: 'enhanced_alarm' });
      setCurrentGameType('math');
      setShowMiniGame(true);
      return;
    }

    if (alarmForEvent) {
      NativeModules.RiseQuestAlarmAudio?.stop(String(alarmForEvent.id));
      // Audio and both overlays must stop before storage/network bookkeeping.
      setShowMiniGame(false);
      setShowEnhancedAlarm(false);
      setCurrentActiveAlarm(null);
      setChallengeLockActive(false);
      setChallengeGiveUpEnabledAt(0);
      await cancelAlarmNotification(alarmForEvent);
      if (action === 'snooze') {
        await scheduleAlarmNotification({ ...alarmForEvent, repeatDaily: false }, new Date(Date.now() + 5 * 60 * 1000));
      } else if (alarmForEvent.repeatDaily) {
        await scheduleAlarmNotification(alarmForEvent);
      } else {
        const updatedAlarms = alarms.map(item => String(item.id) === String(alarmForEvent.id) ? { ...item, isEnabled: false } : item);
        setAlarms(updatedAlarms);
        await AsyncStorage.setItem('risequest_alarms', JSON.stringify(updatedAlarms));
      }
    }
    setShowEnhancedAlarm(false);
    setCurrentActiveAlarm(null);
    setChallengeLockActive(false);
    setChallengeGiveUpEnabledAt(0);

    if (action === 'dismiss') {
      await postAlarmEvent('dismiss', alarmForEvent, { source: 'enhanced_alarm' });
      // Update stats for successful wake-up
      const newStats = {
        ...userStats,
        totalWakeUps: userStats.totalWakeUps + 1,
        streak: userStats.streak + 1,
        experience: userStats.experience + 50,
        level: Math.floor((userStats.experience + 50) / 100) + 1,
        lastWakeUpAt: new Date().toISOString(),
      };
      
      // Award RisePoints for successful wake-up
      if (!isGuest) {
        await MonetizationService.addRisePoints(
          MonetizationService.RISE_POINT_REWARDS.DAILY_WAKEUP,
          'waking up on time'
        );
      }
      
      // Check for streak milestones and potential upsells
      if (newStats.streak > 0 && newStats.streak % 7 === 0) {
        if (!isGuest) {
          await MonetizationService.addRisePoints(
            MonetizationService.RISE_POINT_REWARDS.STREAK_MILESTONE,
            `${newStats.streak}-day streak milestone`
          );
        }
        
        // Check if free user hit streak limit
        const hasUnlimitedStreaks = await MonetizationService.checkFeatureAccess(
          MonetizationService.PREMIUM_FEATURES.UNLIMITED_STREAK_TRACKING
        );
        
        if (!hasUnlimitedStreaks && newStats.streak >= MonetizationService.FREE_LIMITS.STREAK_TRACKING_DAYS) {
          if (!isGuest) {
            setTimeout(() => {
              MonetizationService.triggerUpsell('streak_limit', { streak: newStats.streak });
            }, 1000);
          }
        }
      }
      
      updateUserStats(newStats);
      AccessibilityInfo.announceForAccessibility('Alarm stopped.');
      Promise.resolve().then(() => refreshRisePointsBalance()).catch(() => {});
    } else if (action === 'snooze') {
      await postAlarmEvent('snooze', alarmForEvent, { source: 'enhanced_alarm' });
      updateUserStats({
        ...userStats,
        snoozesUsed: (userStats.snoozesUsed || 0) + 1,
        lastSnoozeAt: new Date().toISOString(),
      });

      // Random chance to show pro tip
      if (Math.random() < 0.3) {
        setTimeout(() => {
          MonetizationService.triggerUpsell('pro_tip');
        }, 500);
      }
      Alert.alert('Snoozed', 'Alarm will ring again in 5 minutes');
    }
  };

  const saveAlarm = async (alarmData) => {
    try {
      if (alarmData.isEnabled !== false && !await ensureAlarmPermissions()) return;
      const id = Date.now().toString();
      const result = prepareAlarmSave(alarms, alarmData, editingAlarm?.id, {
        id, notificationId: toNotificationIntId(id), createdAt: Date.now(),
      });
      await persistAlarmEdit(result, {
        persist: items => AsyncStorage.setItem('risequest_alarms', JSON.stringify(items)),
        cancel: cancelAlarmNotification, schedule: scheduleAlarmNotification,
      });
      setAlarms(result.alarms);
      
      setShowCreateAlarm(false);
      setEditingAlarm(null);
      AccessibilityInfo.announceForAccessibility(result.existing ? 'Alarm updated.' : 'Alarm created.');
    } catch (error) {
      console.error('Error saving alarm:', error);
      Alert.alert('Alarm not scheduled', error?.message || 'Could not save alarm. Please check permissions and try again.');
    }
  };

  const updateUserStats = async (newStats) => {
    setUserStats(newStats);
    await AsyncStorage.setItem('risequest_stats', JSON.stringify(newStats));
  };

  const handleNavChange = (screen) => {
    if (isGuest && screen === 'wallet') {
      Alert.alert('Sign in required', 'Create an account to access Rise Points and your wallet.');
      return;
    }
    setCurrentScreen(screen);
  };

  const handleGameStart = async (gameType) => {
    // Check if user has access to this mini-game
    const hasAccess = await MonetizationService.checkFeatureAccess(
      MonetizationService.PREMIUM_FEATURES.UNLIMITED_MINI_GAMES
    );
    
    if (!hasAccess && gameType !== 'math') {
      // Show upsell for locked mini-games
      await MonetizationService.triggerUpsell('locked_mini_game', { gameType });
      return;
    }
    
    setCurrentGameType(gameType);
    setShowMiniGame(true);
  };

  const handleGameComplete = async (score) => {
    // If this is an alarm challenge takeover, completing the mini-game dismisses the alarm.
    if (challengeLockActive && currentActiveAlarm?.challengeMode) {
      const alarm = currentActiveAlarm;
      setShowMiniGame(false);
      setChallengeLockActive(false);
      setChallengeGiveUpEnabledAt(0);
      void postAlarmEvent('challenge_completed', alarm, { source: 'mini_game', score: Number(score) || 0 }).catch(() => {});
      await handleEnhancedAlarmDismiss('dismiss', true);
      await sleepMs(450);
      await speakWeatherForAlarm(alarm);
      return;
    }

    const newStats = {
      ...userStats,
      experience: userStats.experience + score * 10,
      totalWakeUps: userStats.totalWakeUps + 1,
      challengesCompleted: (userStats.challengesCompleted || 0) + 1,
      lastChallengeAt: new Date().toISOString(),
    };
    
    // Award RisePoints for completing challenge
    postAlarmEvent('challenge_completed', null, { source: 'mini_game' }).then(() => MonetizationService.addRisePoints(
      MonetizationService.RISE_POINT_REWARDS.CHALLENGE_COMPLETED,
      'completing mini-game challenge'
    )).catch(() => {});
    
    // Level up if enough experience
    if (newStats.experience >= newStats.level * 100) {
      newStats.level += 1;
      newStats.experience = newStats.experience - (newStats.level - 1) * 100;
      Alert.alert('Level Up! 🎉', `You reached level ${newStats.level}!`);
    }
    
    updateUserStats(newStats);
    if (newStats.level === userStats.level) transitionAds.trigger('standalone_game_complete');
    setShowMiniGame(false);
  };

  const handleGameFail = () => {
    Alert.alert('Try Again!', 'Complete the challenge to stop snoozing.');
    // Keep the game open for retry
  };

  const handleChallengeAlarmAction = async (action, score) => {
    if (!currentActiveAlarm?.challengeMode || Number(score) < 3 ||
        !['dismiss', 'snooze'].includes(action) || alarmActionBusyRef.current) return;
    alarmActionBusyRef.current = true;
    const alarm = currentActiveAlarm;
    try {
      // Do not wait for analytics or rewards to silence an alarm.
      const dismissal = handleEnhancedAlarmDismiss(action, true);
      void postAlarmEvent('challenge_completed', alarm, { source: 'mini_game', score: Number(score) }).catch(() => {});
      await dismissal;
    } catch (error) {
      console.error('Alarm follow-up failed:', error);
      Alert.alert('Alarm stopped', 'The alarm sound was stopped, but a follow-up could not be saved. Check your alarm schedule.');
    } finally {
      alarmActionBusyRef.current = false;
    }
  };

  const handleChallengeGiveUp = async () => {
    if (!challengeLockActive || !currentActiveAlarm?.challengeMode) {
      setShowMiniGame(false);
      return;
    }

    const alarm = currentActiveAlarm;
    setShowMiniGame(false);
    setChallengeLockActive(false);
    setChallengeGiveUpEnabledAt(0);
    void postAlarmEvent('challenge_give_up', alarm, { source: 'mini_game' }).catch(() => {});
    await handleEnhancedAlarmDismiss('give_up', true);
    await sleepMs(450);
    await speakWeatherForAlarm(alarm);
  };

  const headerLabels = {
    home: 'Today', wellness: 'Wellness', quests: 'Quests', community: 'Community',
    more: 'More', settings: 'Settings', wallet: 'Wallet', alarms: 'Alarms',
    sleep: 'Sleep & recovery', coach: 'Your AI coach', location: 'Smart location',
    social: 'Buddies & emergency', 'mini-games': 'Mini-games',
    'advanced-alarms': 'Advanced alarms', admin: 'Administration',
  };
  const primaryScreens = ['home', 'wellness', 'quests', 'community', 'more'];
  const Header = () => (
    <View style={chromeStyles.header}>
      <View style={chromeStyles.headingRow}>
        {primaryScreens.includes(currentScreen) ? (
          <RiseQuestLogo width={42} height={42} />
        ) : (
          <TouchableOpacity style={chromeStyles.back} accessibilityRole="button" accessibilityLabel="Back to More" onPress={() => setCurrentScreen('more')}>
            <SunriseIcon name="back" />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={chromeStyles.greeting}>{currentScreen === 'home' ? `Good ${getTimeOfDay()}` : 'RiseQuest'}</Text>
          <Text style={chromeStyles.heading} numberOfLines={1}>{currentScreen === 'home' ? userProfile?.displayName?.split(' ')[0] || 'RiseQuester' : headerLabels[currentScreen] || 'RiseQuest'}</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open your profile" onPress={() => setShowProfileModal(true)} style={chromeStyles.avatar}>
          {userProfile?.photoUrl ? <Image source={{ uri: userProfile.photoUrl }} style={chromeStyles.avatarImage} /> : <Text style={chromeStyles.initial}>{(userProfile?.displayName || 'R').slice(0, 1).toUpperCase()}</Text>}
        </TouchableOpacity>
      </View>
      {currentScreen === 'home' && <View style={chromeStyles.chips}>
        <Text style={[chromeStyles.chip, { backgroundColor: sunrise.purpleTint }]}>Level {userStats.level}</Text>
        <Text style={[chromeStyles.chip, { backgroundColor: sunrise.tealTint }]}>{userStats.streak} day streak</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Rise Points, open wallet" onPress={() => handleNavChange('wallet')} style={[chromeStyles.chipButton, { backgroundColor: sunrise.orangeTint }]}>
          <Text style={chromeStyles.chipText}>{(risePointsBalance ?? subscription?.risePoints) || 0} Rise Points</Text>
        </TouchableOpacity>
      </View>}
    </View>
  );

  const Navigation = () => {
    const section = ['sleep', 'coach'].includes(currentScreen) ? 'wellness'
      : primaryScreens.includes(currentScreen) ? currentScreen : 'more';
    return <View style={chromeStyles.navigation} accessibilityRole="tablist">
      {[
        ['home', 'today', 'Today'], ['wellness', 'wellness', 'Wellness'],
        ['quests', 'quests', 'Quests'], ['community', 'community', 'Community'],
        ['more', 'more', 'More'],
      ].map(([screen, icon, label]) => {
        const selected = section === screen;
        return <TouchableOpacity key={screen} testID={`navigation-${screen}`} style={chromeStyles.tab} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected }} onPress={() => handleNavChange(screen)}>
          <View style={[chromeStyles.tabIcon, selected && { backgroundColor: sunrise.orangeTint }]}><SunriseIcon name={icon} size={22} color={selected ? '#994500' : sunrise.muted} /></View>
          <Text style={[chromeStyles.tabLabel, selected && { color: '#994500', fontWeight: '800' }]}>{label}</Text>
        </TouchableOpacity>;
      })}
    </View>;
  };

  const MoreScreen = () => (
    <ScrollView style={ui.page} contentContainerStyle={ui.pageContent}>
      <Text style={[ui.title, { marginBottom: 6 }]}>Make RiseQuest yours</Text>
      <Text style={[ui.subtitle, { marginBottom: 20 }]}>Your tools, rewards, and settings in one place.</Text>
      <View style={[ui.card, { paddingHorizontal: 18 }]}>
        <ToolRow icon="wallet" title="Wallet" subtitle="Rise Points, purchases, and balances" onPress={() => handleNavChange('wallet')} tint={sunrise.orangeTint} color="#994500" />
        <ToolRow icon="star" title="Premium" subtitle="Your plan and upgrade options" onPress={() => { setUpgradeSource('more'); setShowPremiumModal(true); }} />
        <ToolRow icon="palette" title="Cosmetic store" subtitle="Keep your favourite themes and personal touches" onPress={() => setShowCosmeticStore(true)} />
      </View>
      <View style={[ui.card, { paddingHorizontal: 18 }]}>
        <ToolRow icon="alarm" title="Alarms" onPress={() => setCurrentScreen('alarms')} />
        <ToolRow icon="games" title="Challenge mini-games" onPress={() => setCurrentScreen('mini-games')} />
        <ToolRow icon="location" title="Smart location" onPress={() => setCurrentScreen('location')} tint={sunrise.blueTint} color="#1672A6" />
        <ToolRow icon="shield" title="Wake buddies & emergency tools" onPress={() => setCurrentScreen('social')} tint={sunrise.tealTint} color="#087C70" />
      </View>
      <View style={[ui.card, { paddingHorizontal: 18 }]}>
        <ToolRow icon="settings" title="Settings" onPress={() => setCurrentScreen('settings')} />
        {userProfile?.ageGroup === 'adult' && <ToolRow icon="community" title="Family profiles" subtitle="Parent consent, private child profiles and controls" onPress={() => setCurrentScreen('family')} />}
        {userProfile?.authProvider === 'child' && <ToolRow icon="shield" title="Return to parent sign-in" onPress={signOut} />}
        <ToolRow icon="support" title="Help & support" onPress={() => setShowSupportCenter(true)} />
        {verifiedAdminRole && <ToolRow icon="shield" title="Administration" subtitle="Authorized account tools" onPress={() => setCurrentScreen('admin')} />}
        {verifiedAdminRole && ['ADMIN', 'SUPERADMIN'].includes(userRole) && <ToolRow icon="shield" title="Parent consent reviews" onPress={() => setCurrentScreen('family-review')} />}
      </View>
      {!adsSuppressed && <DiscreetAd account={userProfile?.email} guest={isGuest} premium={subscription?.tier && subscription.tier !== 'free'} optionalInlineAds={userProfile?.preferences?.optionalInlineAds === true} placement="more_banner" />}
    </ScrollView>
  );

  // Start / Welcome Screen
  const StartScreen = () => (
    <View style={styles.authContainer}>
      <LinearGradient
        colors={['#4A277C', '#963800']}
        style={styles.authGradient}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, width: '100%' }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.authScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.authContent}>
              {!showAuthInline ? (
                <>
                  <View style={styles.authLogo}>
                    <RiseQuestLogo width={88} height={88} />
                  </View>
                  <Text testID="welcome-title" style={styles.authTitle}>Welcome to RiseQuest</Text>
                  <Text style={styles.authSubtitle}>
                    Transform your mornings with gamified alarms, wellness tracking, and personalized support
                  </Text>

                  <View style={styles.authFeatures}>
                    <Text style={styles.authFeature}>🎮 Gamified wake-up experiences</Text>
                    <Text style={styles.authFeature}>🧠 Gentle, adaptable daily routines</Text>
                    <Text style={styles.authFeature}>💙 Mood & focus tracking</Text>
                    <Text style={styles.authFeature}>🏆 Rise Points rewards system</Text>
                    <Text style={styles.authFeature}>🤝 Supportive community</Text>
                  </View>

                  <TouchableOpacity
                    testID="welcome-get-started"
                    style={styles.startPrimaryButton}
                    onPress={() => {
                      setAuthError(null);
                      setShowAuthInline(true);
                    }}
                  >
                    <Text style={styles.startPrimaryButtonText}>Get Started</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    testID="welcome-guest"
                    style={styles.startSecondaryButton}
                    onPress={continueAsGuest}
                  >
                    <Text style={styles.startSecondaryButtonText}>Continue as Guest</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.authBack}
                    onPress={() => {
                      setAuthError(null);
                      setShowAuthInline(false);
                    }}
                  >
                    <Text style={styles.authBackText}>← Back</Text>
                  </TouchableOpacity>

                  <View style={styles.authLogo}>
                    <RiseQuestLogo width={76} height={76} />
                  </View>
                  <Text style={styles.authFormTitle}>Sign in</Text>

                  <View style={styles.authCard}>
                    <View style={styles.authModeToggle}>
                      <TouchableOpacity
                        style={[styles.authModeButton, authMode === 'login' && styles.authModeButtonActive]}
                        onPress={() => setAuthMode('login')}
                      >
                        <Text style={[styles.authModeText, authMode === 'login' && styles.authModeTextActive]}>Login</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.authModeButton, authMode === 'signup' && styles.authModeButtonActive]}
                        onPress={() => setAuthMode('signup')}
                      >
                        <Text style={[styles.authModeText, authMode === 'signup' && styles.authModeTextActive]}>Sign Up</Text>
                      </TouchableOpacity>
                    </View>

                    {(authMode === 'signup' || showGoogleAgeScreen) && <AgeScreen value={registrationAgeBand} onChange={setRegistrationAgeBand} countryCode={registrationCountry} onCountryChange={setRegistrationCountry} />}
                    {((authMode === 'login' && !showGoogleAgeScreen) || canRegister(registrationAgeBand, registrationCountry)) && <>
                    {authMode === 'signup' && (
                      <TextInput
                        style={styles.authInput}
                        placeholder="Display name"
                        placeholderTextColor="#94a3b8"
                        value={authDisplayName}
                        onChangeText={setAuthDisplayName}
                        returnKeyType="next"
                      />
                    )}

                    <TextInput
                      style={styles.authInput}
                      placeholder={authMode === 'login' ? 'Email or phone number' : 'Email'}
                      placeholderTextColor="#94a3b8"
                      autoCapitalize="none"
                      keyboardType={authMode === 'login' ? 'default' : 'email-address'}
                      value={authEmail}
                      onChangeText={setAuthEmail}
                      returnKeyType="next"
                    />

                    {authMode === 'signup' && (
                      <TextInput
                        style={styles.authInput}
                        placeholder="Phone number (optional)"
                        placeholderTextColor="#94a3b8"
                        keyboardType="phone-pad"
                        value={authPhone}
                        onChangeText={setAuthPhone}
                        returnKeyType="next"
                      />
                    )}

                    <View style={styles.passwordRow}>
                      <TextInput
                        style={[styles.authInput, styles.passwordInput]}
                        placeholder="Password"
                        placeholderTextColor="#94a3b8"
                        secureTextEntry={!authShowPassword}
                        value={authPassword}
                        onChangeText={setAuthPassword}
                        returnKeyType={authMode === 'signup' ? 'next' : 'done'}
                      />
                      <TouchableOpacity
                        style={styles.showPasswordButton}
                        onPress={() => setAuthShowPassword((v) => !v)}
                        activeOpacity={0.9}
                      >
                        <Text style={styles.showPasswordText}>{authShowPassword ? 'Hide' : 'Show'}</Text>
                      </TouchableOpacity>
                    </View>

                    {authMode === 'signup' && (
                      <View style={styles.passwordRow}>
                        <TextInput
                          style={[styles.authInput, styles.passwordInput]}
                          placeholder="Confirm password"
                          placeholderTextColor="#94a3b8"
                          secureTextEntry={!authShowConfirm}
                          value={authConfirm}
                          onChangeText={setAuthConfirm}
                          returnKeyType="done"
                        />
                        <TouchableOpacity
                          style={styles.showPasswordButton}
                          onPress={() => setAuthShowConfirm((v) => !v)}
                          activeOpacity={0.9}
                        >
                          <Text style={styles.showPasswordText}>{authShowConfirm ? 'Hide' : 'Show'}</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {authMode === 'login' && (
                      <TouchableOpacity
                        style={styles.forgotLink}
                        onPress={openForgotPassword}
                        disabled={authBusy}
                      >
                        <Text style={styles.forgotLinkText}>Forgot password?</Text>
                      </TouchableOpacity>
                    )}

                    {!!authError && <Text style={styles.authError}>{authError}</Text>}

                    <TouchableOpacity
                      style={[styles.authPrimaryButton, authBusy && styles.authPrimaryButtonDisabled]}
                      onPress={authMode === 'signup' ? handleEmailSignup : handleEmailLogin}
                      disabled={authBusy}
                    >
                      <Text style={styles.authPrimaryButtonText}>
                        {authBusy ? 'Please wait…' : (authMode === 'signup' ? 'Create Account' : 'Login')}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.googleSignInButtonAlt}
                      onPress={handleGoogleSignIn}
                      disabled={authBusy}
                    >
                      <Text style={styles.googleSignInTextAlt}>Continue with Google</Text>
                    </TouchableOpacity>
                    {Platform.OS === 'ios' && appleAuth.isSupported && <AppleButton
                      buttonStyle={AppleButton.Style.BLACK} buttonType={AppleButton.Type.CONTINUE}
                      style={{ width: '100%', height: 48, marginTop: 12 }} onPress={handleAppleSignIn} />}
                    </>}

                    <TouchableOpacity
                      style={[styles.googleSignInButtonAlt, { marginTop: 12 }]}
                      onPress={continueAsGuest}
                    >
                      <Text style={styles.googleSignInTextAlt}>Continue as Guest</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              <Text style={styles.authDisclaimer}>
                By continuing, you agree to our Terms of Service and Privacy Policy.
                {'\n'}{WELLBEING_NOTICE}{'\n'}Review how your data is used before sharing it.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </View>
  );

  const ForgotPasswordModal = () => (
    <Modal
      visible={showForgotPassword}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        if (forgotBusy) return;
        setShowForgotPassword(false);
      }}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827' }}>Reset password</Text>
          <TouchableOpacity onPress={() => setShowForgotPassword(false)} disabled={forgotBusy}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: forgotBusy ? '#94a3b8' : '#667eea' }}>Close</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
          <Text style={{ fontSize: 13, color: '#475569', marginBottom: 12 }}>
            Enter your email to request a reset token. Then paste the token and choose a new password.
          </Text>

          <Text style={{ fontSize: 12, fontWeight: '800', color: '#111827', marginBottom: 6 }}>Email</Text>
          <TextInput
            value={forgotEmail}
            onChangeText={setForgotEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor="#94a3b8"
            style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12, color: '#111827' }}
          />

          {forgotStep === 'request' ? (
            <TouchableOpacity
              onPress={requestPasswordReset}
              disabled={forgotBusy}
              style={{ backgroundColor: forgotBusy ? '#94a3b8' : '#111827', borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontWeight: '900' }}>{forgotBusy ? 'Requesting…' : 'Request reset'}</Text>
            </TouchableOpacity>
          ) : (
            <>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#111827', marginTop: 12, marginBottom: 6 }}>Reset token</Text>
              <TextInput
                value={forgotToken}
                onChangeText={setForgotToken}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Paste token"
                placeholderTextColor="#94a3b8"
                style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12, color: '#111827' }}
              />

              <Text style={{ fontSize: 12, fontWeight: '800', color: '#111827', marginBottom: 6 }}>New password</Text>
              <View style={styles.passwordRowModal}>
                <TextInput
                  value={forgotNewPassword}
                  onChangeText={setForgotNewPassword}
                  secureTextEntry={!forgotShowPassword}
                  placeholder="New password"
                  placeholderTextColor="#94a3b8"
                  style={styles.passwordModalInput}
                />
                <TouchableOpacity style={styles.showPasswordButton} onPress={() => setForgotShowPassword((v) => !v)}>
                  <Text style={styles.showPasswordText}>{forgotShowPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>

              <Text style={{ fontSize: 12, fontWeight: '800', color: '#111827', marginBottom: 6 }}>Confirm new password</Text>
              <View style={styles.passwordRowModal}>
                <TextInput
                  value={forgotConfirmPassword}
                  onChangeText={setForgotConfirmPassword}
                  secureTextEntry={!forgotShowConfirm}
                  placeholder="Confirm password"
                  placeholderTextColor="#94a3b8"
                  style={styles.passwordModalInput}
                />
                <TouchableOpacity style={styles.showPasswordButton} onPress={() => setForgotShowConfirm((v) => !v)}>
                  <Text style={styles.showPasswordText}>{forgotShowConfirm ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={submitPasswordReset}
                disabled={forgotBusy}
                style={{ backgroundColor: forgotBusy ? '#94a3b8' : '#111827', borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginTop: 8 }}
              >
                <Text style={{ color: '#fff', fontWeight: '900' }}>{forgotBusy ? 'Updating…' : 'Update password'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setForgotStep('request')}
                disabled={forgotBusy}
                style={{ paddingVertical: 12, alignItems: 'center' }}
              >
                <Text style={{ color: '#667eea', fontWeight: '900' }}>Request a new token</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );

  // Loading Screen
  const LoadingScreen = () => (
    <SafeAreaView style={styles.loadingContainer}>
      <LinearGradient
        colors={['#4A277C', '#963800']}
        style={styles.loadingGradient}
      >
        <View style={styles.loadingLogo}>
          <RiseQuestLogo width={80} height={80} />
        </View>
        <Text style={styles.loadingTitle}>RiseQuest</Text>
        <Text style={styles.loadingSubtitle}>Initializing your journey...</Text>
      </LinearGradient>
    </SafeAreaView>
  );

  // Wellness Screen (New - integrates mood tracking, focus timer, coping library)
  const WellnessScreen = () => {

    return (
      <View style={styles.wellnessContainer}>
        <View style={styles.wellnessTabs}>
          <TouchableOpacity
            style={[styles.wellnessTab, wellnessTab === 'mood' && styles.wellnessTabActive]}
            onPress={() => setWellnessTab('mood')}
          >
            <Text style={[styles.wellnessTabText, wellnessTab === 'mood' && styles.wellnessTabTextActive]}>
              💙 Mood
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.wellnessTab, wellnessTab === 'focus' && styles.wellnessTabActive]}
            onPress={() => setWellnessTab('focus')}
          >
            <Text style={[styles.wellnessTabText, wellnessTab === 'focus' && styles.wellnessTabTextActive]}>
              🎯 Focus
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.wellnessTab, wellnessTab === 'coping' && styles.wellnessTabActive]}
            onPress={() => setWellnessTab('coping')}
          >
            <Text style={[styles.wellnessTabText, wellnessTab === 'coping' && styles.wellnessTabTextActive]}>
              🌟 Coping
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.wellnessContent}>
          {wellnessTab === 'mood' && (
            <MoodTracker 
              userProfile={userProfile} 
              onMoodLogged={(entry) => {
                void entry;
                // Award points only when a mood entry is actually logged (once/day)
                awardDailyActivityPoints({
                  action: 'mood_check_in',
                  points: 5,
                  reason: 'mood check-in',
                }).then((awarded) => {
                  if (awarded) {
                    Alert.alert('Rise Points +5 🌟', 'Thanks for checking in today.');
                  } else {
                    Alert.alert('Mood logged', 'Your entry was saved. Rise Points can be earned once per day for this activity.');
                  }
                });
              }}
            />
          )}
          {wellnessTab === 'focus' && (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 140 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <FocusTimer
                userProfile={userProfile}
                onFocusCompleted={({ durationMinutes }) => {
                  const minutes = Number(durationMinutes || 0);
                  const minMinutes = 15;
                  if (minutes < minMinutes) {
                    Alert.alert('Nice work!', `Complete at least ${minMinutes} minutes to earn Rise Points.`);
                    return;
                  }

                  awardDailyActivityPoints({
                    action: 'focus_session_complete',
                    points: 20,
                    reason: `completed ${minutes}-minute focus session`,
                    minFocusMinutes: minMinutes,
                  }).then((awarded) => {
                    if (awarded) {
                      Alert.alert('Rise Points +20 🌟', 'Focus session completed.');
                    } else {
                      Alert.alert('Focus session completed', 'Rise Points can be earned once per day for this activity.');
                    }
                  });
                }}
              />
            </ScrollView>
          )}
          {wellnessTab === 'coping' && (
            <CopingLibrary userProfile={userProfile} />
          )}
        </View>
      </View>
    );
  };

  // Wallet Screen (Enhanced Rise Points)
  const WalletScreen = () => (
    isGuest ? (
      <View style={styles.guestLockContainer}>
        <Text style={styles.guestLockTitle}>Sign in required</Text>
        <Text style={styles.guestLockText}>Create an account to access Rise Points and your wallet.</Text>
        <TouchableOpacity style={styles.guestLockButton} onPress={() => setCurrentScreen('auth')}>
          <Text style={styles.guestLockButtonText}>Go to Sign In</Text>
        </TouchableOpacity>
      </View>
    ) : (
      <WalletHubScreen
        userProfile={userProfile}
        risePoints={(risePointsBalance ?? subscription?.risePoints) || 0}
        onRefreshBalances={refreshRisePointsBalance}
        onOpenRewards={() => setShowRisePoints(true)}
        onOpenPremium={() => {
          setUpgradeSource('wallet');
          setShowPremiumModal(true);
        }}
      />
    )
  );

  const HomeScreen = () => (
    <TodayScreen
      userProfile={userProfile} isGuest={isGuest} alarms={alarms} stats={userStats}
      premium={subscription?.tier && subscription.tier !== 'free'}
      adsSuppressed={adsSuppressed}
      points={(risePointsBalance ?? subscription?.risePoints) || 0}
      onNavigate={handleNavChange} onCreateAlarm={() => { setEditingAlarm(null); setShowCreateAlarm(true); }}
      onRewards={() => setShowRisePoints(true)} onCosmetics={() => setShowCosmeticStore(true)}
      onFocus={() => { setWellnessTab('focus'); setCurrentScreen('wellness'); }}
      weather={homeWeather} weatherLoading={homeWeatherLoading}
      accentColors={appGradient}
      onRefreshWeather={() => loadHomeWeather({ force: true })} nextTrigger={computeNextTrigger}
    />
  );

  const getTimeOfDay = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  };

  const formatTime12h = (hhmm) => {
    const value = String(hhmm || '').trim();
    const match = value.match(/^\s*(\d{1,2})\s*:\s*(\d{2})\s*$/);
    if (!match) return null;
    const h24 = Number(match[1]);
    const m = Number(match[2]);
    if (!Number.isFinite(h24) || !Number.isFinite(m)) return null;
    if (h24 < 0 || h24 > 23 || m < 0 || m > 59) return null;
    const period = h24 >= 12 ? 'PM' : 'AM';
    const h12 = ((h24 + 11) % 12) + 1;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  };

  const AlarmsScreen = () => (
    <ScrollView style={styles.content}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>⏰ Your Alarms</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => { setEditingAlarm(null); setShowCreateAlarm(true); }}
          >
            <Text style={styles.addButtonText}>+ Add</Text>
          </TouchableOpacity>
        </View>
        
        {alarms.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No alarms set yet</Text>
            <Text style={styles.emptySubtext}>Set an alarm to start your RiseQuest journey!</Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => { setEditingAlarm(null); setShowCreateAlarm(true); }}
            >
              <Text style={styles.buttonText}>🔔 Set Alarm</Text>
            </TouchableOpacity>
          </View>
        ) : (
          alarms.map((alarm, index) => (
            <View key={alarm.id || index} style={styles.alarmItem}>
              <TouchableOpacity accessibilityRole="button"
                accessibilityLabel={`Edit alarm ${alarm.label || ''}, ${formatTime12h(alarm.time) || alarm.time}`}
                onPress={() => { setEditingAlarm(alarm); setShowCreateAlarm(true); }}>
              <View style={styles.alarmHeader}>
                <Text style={styles.alarmTime}>{formatTime12h(alarm.time) || alarm.time}</Text>
                <View style={styles.alarmBadges}>
                  {alarm.challengeMode && <Text style={styles.badge}>🎮</Text>}
                  {alarm.weatherAlert && <Text style={styles.badge}>🌤️</Text>}
                  {alarm.importanceLevel === 'critical' && <Text style={styles.badge}>🚨</Text>}
                </View>
              </View>
              <Text style={styles.alarmLabel}>{alarm.label}</Text>
              {alarm.customMessage && (
                <Text style={styles.alarmMessage}>"{alarm.customMessage}"</Text>
              )}
              <Text style={{ color: '#5841B5', fontWeight: '700', paddingVertical: 10 }}>Edit alarm</Text>
              </TouchableOpacity>
              <View style={styles.alarmFooter}>
                <Text style={styles.alarmInfo}>
                  {alarm.isEnabled === false ? 'Off' : 'On'} • {alarm.repeatDaily ? 'Daily' : 'One-time'}
                  {alarm.challengeMode ? ` • ${challengeDifficulty(alarm)} challenge` : ''}
                </Text>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => deleteAlarm(alarm.id)}
                >
                  <Text style={styles.deleteButtonText}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>🎵 Advanced Alarms</Text>
        <Text style={styles.cardText}>
          Customize volume curves, tone behavior, and smart wake-up options.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => setCurrentScreen('advanced-alarms')}
        >
          <Text style={styles.buttonText}>Open Advanced Alarms</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>💡 Alarm Tips</Text>
        <View style={styles.tipsList}>
          <Text style={styles.tipItem}>🎯 Tap an alarm to edit its time, message or challenge difficulty</Text>
          <Text style={styles.tipItem}>🎮 Enable challenge mode for engaging wake-ups</Text>
          <Text style={styles.tipItem}>🌤️ Weather alerts help you plan your day</Text>
          <Text style={styles.tipItem}>🔄 Daily repeats keep you consistent</Text>
        </View>
      </View>
    </ScrollView>
  );

  const GamesScreen = () => (
    <ScrollView style={styles.content}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🎮 Wake-Up Games</Text>
        <Text style={styles.cardText}>
          Complete these mini-games when your alarm goes off to level up!
        </Text>
        
        <View style={styles.gamesList}>
          <TouchableOpacity 
            style={styles.gameCard}
            onPress={() => {
              setCurrentGameType('math');
              setShowMiniGame(true);
            }}
          >
            <Text style={styles.gameTitle}>🧮 Math Challenge</Text>
            <Text style={styles.gameDescription}>Solve quick math problems</Text>
            <Text style={styles.gameTryButton}>Try Demo →</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.gameCard}
            onPress={() => {
              setCurrentGameType('memory');
              setShowMiniGame(true);
            }}
          >
            <Text style={styles.gameTitle}>🧩 Memory Puzzle</Text>
            <Text style={styles.gameDescription}>Remember the pattern</Text>
            <Text style={styles.gameTryButton}>Try Demo →</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.gameCard}
            onPress={() => {
              setCurrentGameType('physical');
              setShowMiniGame(true);
            }}
          >
            <Text style={styles.gameTitle}>🤸 Physical Task</Text>
            <Text style={styles.gameDescription}>Shake or move your phone</Text>
            <Text style={styles.gameTryButton}>Try Demo →</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.gameCard}
            onPress={() => {
              setCurrentGameType('reaction');
              setShowMiniGame(true);
            }}
          >
            <Text style={styles.gameTitle}>🎯 Quick Reaction</Text>
            <Text style={styles.gameDescription}>Tap targets quickly</Text>
            <Text style={styles.gameTryButton}>Try Demo →</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>🏆 Game Benefits</Text>
        <View style={styles.featureList}>
          <Text style={styles.feature}>🧠 Activates your brain instantly</Text>
          <Text style={styles.feature}>⚡ Reduces morning grogginess</Text>
          <Text style={styles.feature}>🎯 Adaptive difficulty based on importance</Text>
          <Text style={styles.feature}>📈 Track your performance over time</Text>
          <Text style={styles.feature}>🏅 Earn XP and level up</Text>
        </View>
      </View>
    </ScrollView>
  );

  const StatsScreen = () => (
    <ScrollView style={styles.content}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📊 Your Progress</Text>
        
        <View style={styles.statCard}>
          <Text style={styles.statCardTitle}>Level {userStats.level}</Text>
          <Text style={styles.statCardValue}>{userStats.experience} XP</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${(userStats.experience % 100)}%` }]} />
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{userStats.streak}</Text>
            <Text style={styles.statBoxLabel}>Day Streak</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{userStats.totalWakeUps}</Text>
            <Text style={styles.statBoxLabel}>Total Wake-ups</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>🏆 Achievements</Text>
        <Text style={styles.cardText}>Coming soon! Earn badges for consistent wake-ups!</Text>
      </View>
    </ScrollView>
  );

  const renderScreen = () => {
    switch (currentScreen) {
      case 'loading':
        return LoadingScreen();
      case 'start':
        return StartScreen();
      case 'auth':
        return StartScreen();
      case 'onboarding':
        return (
          <OnboardingScreen 
            onComplete={handleOnboardingComplete}
            prefillProfile={{
              ...userProfile,
              email: userProfile?.email,
              displayName: userProfile?.displayName,
              phoneNumber: userProfile?.phoneNumber,
              photoUrl: userProfile?.photoUrl,
              authProvider: userProfile?.authProvider,
            }}
          />
        );
      case 'home':
        return HomeScreen();
      case 'more':
        return MoreScreen();
      case 'family':
        return <FamilyProfilesScreen onEnterChild={enterChildSession} />;
      case 'family-review':
        return <FamilyProfilesScreen isAdmin />;
      case 'wellness':
        return WellnessScreen();
      case 'quests':
        return (
          <QuestScreen 
            userProfile={userProfile}
            onClose={() => setCurrentScreen('home')}
          />
        );
      case 'alarms':
        return <AlarmsScreen />;
      case 'wallet':
        return <WalletScreen />;
      case 'settings':
        return (
          <SettingsScreen 
            userProfile={userProfile}
            onShowSupport={() => setShowSupportCenter(true)}
            onShowTerms={() => setShowTermsAndConditions(true)}
            onSignOut={signOut}
            onUpdateProfile={(next) => setUserProfile(next)}
            onSecretAdmin={openAdminPanelSecret}
          />
        );
      case 'admin':
        return (
          <AdminDashboardScreen
            visible
            onClose={() => setCurrentScreen('home')}
          />
        );
      case 'community':
        return (
          <CommunityAgeBoundary key={userProfile?.email || userProfile?.id || 'guest'}
            userProfile={userProfile}
            embedded
          />
        );
      case 'advanced-alarms':
        return <AdvancedAlarmFeatures userProfile={userProfile} />;
      case 'mini-games':
        return <MiniGameChallengeSystem userProfile={userProfile} onClose={() => setCurrentScreen('home')} />;
      case 'sleep':
        return <SleepHealthIntegration key={userProfile?.email || userProfile?.id || 'guest'} userProfile={userProfile} />;
      case 'location':
        return (
          <LocationSmartFeatures
            userProfile={userProfile}
            onUpdateProfile={(next) => setUserProfile(next)}
            alarms={alarms}
            onUpdateAlarms={(next) => setAlarms(next)}
            onNavigate={(screen) => setCurrentScreen(screen)}
          />
        );
      case 'social':
        return <SocialEmergencyFeatures userProfile={userProfile} />;
      case 'coach':
        return <AICoachAnalytics key={userProfile?.email || 'guest'} userProfile={userProfile} alarmData={alarms} sleepData={[]} onNavigate={(screen) => setCurrentScreen(screen)} />;
      default:
        return HomeScreen();
    }
  };

  // Don't show header and navigation for special screens
  const shouldShowChrome = !['loading', 'start', 'auth', 'onboarding'].includes(currentScreen);

  return (
    <SafeAreaProvider>
      <StripeProvider publishableKey={stripePublishableKey || ''}>
        <SafeAreaView style={styles.container}>
          {shouldShowChrome && Header()}
          {renderScreen()}
          {shouldShowChrome && Navigation()}

        {/* Mandatory Password Setup for Google accounts */}
        <Modal visible={mustSetPassword} animationType="slide" presentationStyle="fullScreen">
          <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
            <View style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: '#111827' }}>Set a password</Text>
              <TouchableOpacity onPress={signOut}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#667eea' }}>Sign out</Text>
              </TouchableOpacity>
            </View>
            <View style={{ paddingHorizontal: 16 }}>
              <Text style={{ color: '#475569', marginBottom: 12 }}>
                For account security, please create a password. You'll be able to sign in with email + password too.
              </Text>
              <TextInput
                value={passwordNew}
                onChangeText={setPasswordNew}
                placeholder="New password (min 8 characters)"
                secureTextEntry
                style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 }}
              />
              <TextInput
                value={passwordConfirm}
                onChangeText={setPasswordConfirm}
                placeholder="Confirm password"
                secureTextEntry
                style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 }}
              />
              <TouchableOpacity
                onPress={submitPassword}
                disabled={passwordBusy}
                style={{ backgroundColor: '#111827', borderRadius: 12, paddingVertical: 14, alignItems: 'center', opacity: passwordBusy ? 0.7 : 1 }}
              >
                <Text style={{ color: '#fff', fontWeight: '900' }}>{passwordBusy ? 'Saving…' : 'Save password'}</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Modal>

        {/* Profile Modal */}
        <Modal visible={showProfileModal} animationType="slide" presentationStyle="pageSheet">
          <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
            <View style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827' }}>Profile</Text>
              <TouchableOpacity onPress={() => setShowProfileModal(false)}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#667eea' }}>Done</Text>
              </TouchableOpacity>
            </View>
            <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={[styles.profileAvatar, { marginRight: 12, width: 56, height: 56, borderRadius: 28 }]}>
                  {userProfile?.photoUrl ? (
                    <Image source={{ uri: userProfile.photoUrl }} style={[styles.profileAvatarImage, { width: 56, height: 56, borderRadius: 28 }]} />
                  ) : (
                    <Text style={styles.profileAvatarFallback}>👤</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827' }} numberOfLines={1}>
                    {userProfile?.displayName || 'RiseQuest User'}
                  </Text>
                  <Text style={{ fontSize: 13, color: '#475569' }} numberOfLines={1}>
                    {userProfile?.email || ''}
                  </Text>
                </View>
              </View>
              {!!userProfile?.phoneNumber && (
                <Text style={{ marginTop: 10, fontSize: 13, color: '#475569' }}>Phone: {userProfile.phoneNumber}</Text>
              )}
              {!!userProfile?.authProvider && (
                <Text style={{ marginTop: 6, fontSize: 13, color: '#475569' }}>Provider: {userProfile.authProvider}</Text>
              )}
              {!!userProfile?.ageGroup && (
                <Text style={{ marginTop: 6, fontSize: 13, color: '#475569' }}>Age group: {userProfile.ageGroup}</Text>
              )}

              <Text style={{ marginTop: 14, fontSize: 14, fontWeight: '800', color: '#111827' }}>Onboarding</Text>
              <Text style={{ marginTop: 6, fontSize: 13, color: '#475569' }}>
                Support mode: {userProfile?.supportEnabled ? 'Enabled' : 'Off'}
              </Text>
              {!!userProfile?.supportConditions?.length && (
                <Text style={{ marginTop: 6, fontSize: 13, color: '#475569' }}>
                  Support areas: {userProfile.supportConditions.join(', ')}
                </Text>
              )}
              {!!userProfile?.preferences?.goals?.length && (
                <Text style={{ marginTop: 6, fontSize: 13, color: '#475569' }}>
                  Goals: {userProfile.preferences.goals.join(', ')}
                </Text>
              )}

              <Text style={{ marginTop: 14, fontSize: 14, fontWeight: '800', color: '#111827' }}>Accessibility</Text>
              <Text style={{ marginTop: 6, fontSize: 13, color: '#475569' }}>
                UI density: {userProfile?.preferences?.uiDensity || 'standard'}
              </Text>
              <Text style={{ marginTop: 6, fontSize: 13, color: '#475569' }}>
                Reduced sensory: {userProfile?.preferences?.reducedSensory ? 'On' : 'Off'}
              </Text>
              <Text style={{ marginTop: 6, fontSize: 13, color: '#475569' }}>
                Dyslexia-friendly: {userProfile?.preferences?.dyslexiaFriendly ? 'On' : 'Off'}
              </Text>
              <Text style={{ marginTop: 6, fontSize: 13, color: '#475569' }}>
                Captions: {userProfile?.preferences?.captionsEnabled ? 'On' : 'Off'}
              </Text>
            </View>
          </SafeAreaView>
        </Modal>
      
        {/* Create Alarm Modal */}
        <Modal
          visible={showCreateAlarm}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => {
            if (Keyboard.isVisible()) Keyboard.dismiss();
            else setShowCreateAlarm(false);
          }}
        >
          {showCreateAlarm && <SafeAreaProvider><CreateAlarmScreen
            initialAlarm={editingAlarm}
            onRefreshBalances={refreshRisePointsBalance}
            onSave={saveAlarm}
            onCancel={() => setShowCreateAlarm(false)}
          /></SafeAreaProvider>}
        </Modal>

      {/* Enhanced Alarm Modal */}
      <Modal
        visible={showEnhancedAlarm}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => {
          if (challengeLockActive && currentActiveAlarm?.challengeMode) return;
          void handleEnhancedAlarmDismiss('dismiss');
        }}
      >
        {currentActiveAlarm && (
          <EnhancedAlarmScreen
            alarm={currentActiveAlarm}
            userProfile={userProfile}
            userStats={userStats}
            onDismiss={handleEnhancedAlarmDismiss}
            challengeLocked={Boolean(challengeLockActive && currentActiveAlarm?.challengeMode)}
            startToneImmediately={Boolean(challengeLockActive && currentActiveAlarm?.challengeMode)}
          />
        )}
      </Modal>

      {/* Mini Game Modal (rendered after alarm so it overlays) */}
      <Modal
        visible={showMiniGame}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => {
          if (challengeLockActive && currentActiveAlarm?.challengeMode) return;
          setShowMiniGame(false);
        }}
      >
        {showMiniGame && <MiniGameScreen
          gameType={currentGameType}
          difficulty={currentActiveAlarm ? challengeDifficulty(currentActiveAlarm) : 'medium'}
          onComplete={handleGameComplete}
          onFail={handleGameFail}
          onAlarmAction={handleChallengeAlarmAction}
          lockExit={Boolean(challengeLockActive && currentActiveAlarm?.challengeMode)}
          giveUpEnabledAt={challengeGiveUpEnabledAt}
          onGiveUp={handleChallengeGiveUp}
          onRequestClose={() => {
            if (challengeLockActive && currentActiveAlarm?.challengeMode) return;
            setShowMiniGame(false);
          }}
        />}
      </Modal>

        {/* Premium Upgrade Modal */}
        <PremiumUpgradeModal
          visible={showPremiumModal}
          onClose={async () => {
            setSubscription(await MonetizationService.getUserSubscription({ force: true }));
            setShowPremiumModal(false);
          }}
          source={upgradeSource}
          userProfile={userProfile}
        />

      <RisePointsScreen
        visible={showRisePoints}
        onClose={() => setShowRisePoints(false)}
      />

      {/* Admin Panel Modal */}
      <AdminPanel
        visible={showAdminPanel}
        onClose={() => setShowAdminPanel(false)}
        userProfile={userProfile}
        alarms={alarms}
        isAdminAuthenticated={isAdminAuthenticated}
        onOpenPaymentTest={() => setShowPaymentTest(true)}
      />

      {/* Terms & Conditions Modal */}
      <TermsAndConditions
        visible={showTermsAndConditions}
        onClose={() => setShowTermsAndConditions(false)}
      />

      {/* Support Center Modal */}
      <SupportCenter
        visible={showSupportCenter}
        onClose={() => setShowSupportCenter(false)}
        userProfile={userProfile}
        onUpdateProfile={(next) => setUserProfile(next)}
      />

      {/* Payment Flow Test Modal */}
      <Modal
        visible={showPaymentTest}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowPaymentTest(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827' }}>Payment Test</Text>
            <TouchableOpacity onPress={() => setShowPaymentTest(false)}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#667eea' }}>Done</Text>
            </TouchableOpacity>
          </View>
          <PaymentFlowTest />
        </SafeAreaView>
      </Modal>

      {/* Cosmetic Store Modal */}
      <Modal
        visible={showCosmeticStore}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={finishCosmeticBrowsing}
      >
        <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827' }}>Cosmetic Store</Text>
            <TouchableOpacity onPress={finishCosmeticBrowsing}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#667eea' }}>Done</Text>
            </TouchableOpacity>
          </View>
          <CosmeticStore userProfile={userProfile} onPurchaseStarted={() => { cosmeticCheckoutRef.current = true; transitionAds.cancel(); }} onPurchaseComplete={() => {}} />
        </SafeAreaView>
        </SafeAreaProvider>
      </Modal>

      {ForgotPasswordModal()}

        <StatusBar barStyle="dark-content" />
        </SafeAreaView>
      </StripeProvider>
    </SafeAreaProvider>
  );
}

const chromeStyles = StyleSheet.create({
  header: { backgroundColor: sunrise.background, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: sunrise.border },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  greeting: { color: sunrise.muted, fontSize: 13, marginBottom: 2 },
  heading: { color: sunrise.ink, fontSize: 21, fontWeight: '800' },
  back: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: sunrise.purpleTint, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: 46, height: 46 },
  initial: { fontSize: 20, fontWeight: '800', color: '#5940BD' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, alignItems: 'center' },
  chip: { color: sunrise.ink, fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12 },
  chipButton: { paddingHorizontal: 10, minHeight: 44, borderRadius: 12, justifyContent: 'center' },
  chipText: { color: sunrise.ink, fontSize: 12, fontWeight: '700' },
  navigation: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: sunrise.border, paddingVertical: 7 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 58, paddingHorizontal: 1 },
  tabIcon: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 15 },
  tabLabel: { color: sunrise.muted, fontSize: 11, textAlign: 'center', marginTop: 3 },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: sunrise.background,
  },
  header: {
    padding: 16,
    paddingTop: 20,
    alignItems: 'center',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 10,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pointsButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 10,
  },
  pointsText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  headerTier: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
    marginBottom: 12,
  },
  profileHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  profileAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 10,
  },
  profileAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  profileAvatarFallback: {
    fontSize: 18,
    color: 'white',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  statLabel: {
    fontSize: 12,
    color: 'white',
    opacity: 0.8,
  },
  content: {
    flex: 1,
    padding: 20,
    paddingBottom: Platform.OS === 'android' ? 140 : 110,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#4a5568',
    marginBottom: 15,
  },
  cardText: {
    fontSize: 16,
    color: '#718096',
    lineHeight: 24,
    marginBottom: 15,
  },
  featureList: {
    marginBottom: 15,
  },
  feature: {
    fontSize: 16,
    color: '#718096',
    marginBottom: 8,
    lineHeight: 24,
  },
  primaryButton: {
    backgroundColor: '#667eea',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    marginBottom: 10,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
    color: '#a0aec0',
    marginBottom: 20,
  },
  alarmItem: {
    backgroundColor: '#f7fafc',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
  },
  alarmTime: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2d3748',
  },
  alarmLabel: {
    fontSize: 14,
    color: '#718096',
  },
  gamesList: {
    marginTop: 10,
  },
  gameCard: {
    backgroundColor: '#f7fafc',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#667eea',
  },
  gameTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2d3748',
    marginBottom: 5,
  },
  gameDescription: {
    fontSize: 14,
    color: '#718096',
  },
  statCard: {
    backgroundColor: '#667eea',
    borderRadius: 15,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  statCardTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 5,
  },
  statCardValue: {
    fontSize: 16,
    color: 'white',
    opacity: 0.9,
    marginBottom: 15,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'white',
    borderRadius: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statBox: {
    backgroundColor: '#f7fafc',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 5,
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#667eea',
  },
  statBoxLabel: {
    fontSize: 14,
    color: '#718096',
    marginTop: 5,
  },
  navigation: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingBottom: 12,
  },
  navButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 15,
  },
  navButtonActive: {
    backgroundColor: '#ebf4ff',
  },
  navText: {
    fontSize: 24,
    color: '#718096',
    textAlign: 'center',
  },
  navTextActive: {
    color: '#1f2937',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#a0aec0',
    marginBottom: 20,
    textAlign: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  addButton: {
    backgroundColor: '#667eea',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 8,
  },
  addButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  alarmHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  alarmBadges: {
    flexDirection: 'row',
  },
  badge: {
    fontSize: 16,
    marginLeft: 5,
  },
  alarmMessage: {
    fontSize: 14,
    color: '#667eea',
    fontStyle: 'italic',
    marginBottom: 10,
  },
  alarmFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alarmInfo: {
    fontSize: 12,
    color: '#a0aec0',
  },
  deleteButton: {
    padding: 5,
  },
  deleteButtonText: {
    fontSize: 16,
  },
  tipsList: {
    marginTop: 10,
  },
  tipItem: {
    fontSize: 14,
    color: '#718096',
    marginBottom: 8,
    lineHeight: 20,
  },
  gameTryButton: {
    fontSize: 14,
    color: '#667eea',
    fontWeight: '600',
    marginTop: 5,
  },
  // Monetization UI Styles
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 10,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  risePointsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 10,
  },
  risePointsText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  premiumButton: {
    backgroundColor: '#FFD700',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  premiumButtonText: {
    color: '#333',
    fontSize: 11,
    fontWeight: 'bold',
  },

  // Authentication Styles
  authContainer: {
    flex: 1,
  },
  authGradient: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    padding: 20,
  },
  authScrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: Platform.OS === 'android' ? 24 : 0,
  },
  authContent: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
  },
  authLogo: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  authTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
    textAlign: 'center',
  },
  authFormTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 6,
    textAlign: 'center',
  },
  authFormSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    marginBottom: 14,
  },
  authSubtitle: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  authFeatures: {
    marginBottom: 40,
  },
  authFeature: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
    textAlign: 'center',
  },
  googleSignInButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  googleSignInText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  authBack: {
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  authBackText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontWeight: '600',
  },

  startPrimaryButton: {
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginBottom: 12,
    width: '100%',
    alignItems: 'center',
  },
  startPrimaryButtonText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  startSecondaryButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginBottom: 18,
    width: '100%',
    alignItems: 'center',
  },
  startSecondaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  authDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    width: '100%',
  },
  authDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  authDividerText: {
    color: 'rgba(255,255,255,0.7)',
    marginHorizontal: 12,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  authCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  authModeToggle: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    padding: 4,
    marginBottom: 16,
    width: '100%',
  },
  authModeButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 16,
    alignItems: 'center',
  },
  authModeButtonActive: {
    backgroundColor: '#111827',
  },
  authModeText: {
    color: '#475569',
    fontWeight: '600',
  },
  authModeTextActive: {
    color: '#fff',
  },
  authInput: {
    width: '100%',
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#111827',
    marginBottom: 12,
  },
  passwordRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  passwordInput: {
    flex: 1,
    width: undefined,
    marginBottom: 0,
    marginRight: 10,
  },
  showPasswordButton: {
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  showPasswordText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 12,
  },
  forgotLink: {
    width: '100%',
    paddingVertical: 4,
    marginBottom: 10,
    alignItems: 'flex-end',
  },
  forgotLinkText: {
    color: '#667eea',
    fontWeight: '800',
    fontSize: 13,
  },
  passwordRowModal: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  passwordModalInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#111827',
    marginRight: 10,
  },
  authError: {
    color: '#b45309',
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
  },
  authPrimaryButton: {
    backgroundColor: '#1f2937',
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginBottom: 12,
    width: '100%',
    alignItems: 'center',
  },
  authPrimaryButtonDisabled: {
    opacity: 0.6,
  },
  authPrimaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  googleSignInButtonAlt: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 18,
    width: '100%',
    alignItems: 'center',
  },
  googleSignInTextAlt: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
  },
  authDisclaimer: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 16,
  },

  // Loading Styles
  loadingContainer: {
    flex: 1,
  },
  loadingGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingLogo: {
    width: 90,
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  loadingTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  loadingSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
  },
  guestLockContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f8f9fa',
  },
  guestLockTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2d3748',
    marginBottom: 10,
  },
  guestLockText: {
    fontSize: 14,
    color: '#718096',
    textAlign: 'center',
    marginBottom: 16,
  },
  guestLockButton: {
    backgroundColor: '#667eea',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  guestLockButtonText: {
    color: '#fff',
    fontWeight: '600',
  },

  // Wellness Screen Styles
  wellnessContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  wellnessTabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  wellnessTab: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
  },
  wellnessTabActive: {
    borderBottomWidth: 3,
    borderBottomColor: '#667eea',
  },
  wellnessTabText: {
    fontSize: 14,
    color: '#666',
  },
  wellnessTabTextActive: {
    color: '#667eea',
    fontWeight: 'bold',
  },
  wellnessContent: {
    flex: 1,
  },

  // Enhanced Home Screen Styles
  supportSummary: {
    backgroundColor: '#f0f8ff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
  },
  supportTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#667eea',
    marginBottom: 10,
  },
  quickActionButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  quickActionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  todayStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 15,
  },
  statDisplay: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#667eea',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
  },
  encouragement: {
    fontSize: 14,
    color: '#48bb78',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  quickAction: {
    width: '48%',
    backgroundColor: '#f8f9fa',
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  quickActionEmoji: {
    fontSize: 24,
    marginBottom: 8,
  },
  quickActionLabel: {
    fontSize: 12,
    color: '#333',
    textAlign: 'center',
  },
  supportFeatures: {
    marginBottom: 15,
  },
  supportFeature: {
    fontSize: 14,
    color: '#48bb78',
    marginBottom: 8,
  },

  // New Advanced Features Styles
  homeWelcomeCard: {
    paddingTop: 12,
    paddingBottom: 12,
  },
  homeWelcomeTitle: {
    fontSize: 18,
  },
  featurePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    marginBottom: 10,
  },
  featureIcon: {
    fontSize: 24,
    marginRight: 15,
  },
  featureInfo: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  featureDesc: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
});
