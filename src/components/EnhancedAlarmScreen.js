import { getAuthToken } from '../services/AuthTokenStorage';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  NativeModules,
  Linking,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { WeatherService, MotivationalService } from '../utils/AIServices';
import { LocationService } from '../utils/LocationService';
import Tts from 'react-native-tts';
import Sound from 'react-native-sound';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBackendBaseUrl } from '../config/backendConfig';
import { resolveAlarmBuddy, dialablePhone } from '../services/wakeBuddy';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EnhancedAlarmScreen({
  alarm,
  userProfile,
  userStats,
  onDismiss,
  challengeLocked = false,
  startToneImmediately = false,
}) {
  const [weather, setWeather] = useState(null);
  const [motivation, setMotivation] = useState(null);
  const [locationContext, setLocationContext] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [wakeBuddy, setWakeBuddy] = useState(null);
  const [buddyError, setBuddyError] = useState('');
  const [contactingBuddy, setContactingBuddy] = useState(false);
  useEffect(() => {
    let live = true;
    resolveAlarmBuddy(AsyncStorage, alarm).then(buddy => { if (live) setWakeBuddy(buddy); })
      .catch(() => { if (live) setBuddyError('Could not load your buddy. You can still stop or snooze the alarm.'); });
    return () => { live = false; };
  }, [alarm?.wakeBuddyId]);
  const contactBuddy = async () => {
    if (challengeLocked || contactingBuddy) return;
    setContactingBuddy(true);
    try {
      // Resolve again so removed contacts cannot be called from an old alarm.
      const buddy = await resolveAlarmBuddy(AsyncStorage, alarm);
      const phone = dialablePhone(buddy?.phone);
      if (!phone) throw new Error('This buddy is no longer available. Choose another when editing your alarm.');
      Alert.alert('Contact your wake-up buddy?', `Snooze for 5 minutes and open ${buddy.name} in your phone dialer? You choose whether to place the call.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Snooze & open dialer', onPress: async () => {
          await onDismiss('snooze');
          try { await Linking.openURL(`tel:${phone}`); }
          catch (_) { Alert.alert('Dialer unavailable', 'Your alarm is snoozed. Open your phone app to contact your buddy. No call was placed.'); }
        } },
      ]);
    } catch (error) { setBuddyError(error.message || 'Could not open your buddy. Please retry.'); }
    finally { setContactingBuddy(false); }
  };

  useEffect(() => {
    loadEnhancedData();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Native playback owns downloaded speech and its transition to the tone.
    // Do not speak it again or make a network request when React opens.
    if (alarm?.speechEnabled && alarm?.speechUri) return;
    const enabled = Boolean(userProfile?.preferences?.ttsEnabled);
    const text = String(alarm?.customMessage || '').trim();
    const shouldSpeak = Boolean(enabled && text);
    const shouldStartTone = Boolean(startToneImmediately || shouldSpeak);
    if (!shouldStartTone) return;
    let isMounted = true;
    let messageSound = null;
    let toneSound = null;
    let volumeTimer = null;
    let ttsFinishSub = null;
    let ttsCancelSub = null;
    let fallbackTimer = null;

    const getToneSource = () => {
      // Native alarm service owns looping audio, including while React is closed.
      if (NativeModules.RiseQuestAlarmAudio) return null;
      if (String(alarm?.selectedTone || '') === 'custom' && alarm?.customToneUri) {
        return { uri: String(alarm.customToneUri), loops: -1 };
      }
      // Built-in tones are currently system-default (notification sound). Custom tone is the supported path.
      return null;
    };

    const startTone = () => {
      if (!isMounted) return;
      if (toneSound) return;
      const src = getToneSource();
      if (!src?.uri) return;

      try {
        Sound.setCategory('Playback');
      } catch (_) {
        // ignore
      }

      toneSound = new Sound(src.uri, null, (error) => {
        if (!isMounted) return;
        if (error) {
          console.warn('Alarm tone load failed:', error);
          return;
        }

        try {
          toneSound.setNumberOfLoops(typeof src.loops === 'number' ? src.loops : -1);
        } catch (_) {
          // ignore
        }

        const startVolume = typeof alarm?.startVolume === 'number' ? alarm.startVolume : 0.35;
        const maxVolume = typeof alarm?.maxVolume === 'number' ? alarm.maxVolume : 1.0;
        try {
          toneSound.setVolume(Math.max(0, Math.min(1, startVolume)));
        } catch (_) {
          // ignore
        }

        // Simple ramp (gentle curve) to make settings feel effective.
        const curve = String(alarm?.volumeCurve || 'gentle');
        const rampMs = curve === 'urgent' ? 15000 : curve === 'standard' ? 45000 : 120000;
        const startedAt = Date.now();
        volumeTimer = setInterval(() => {
          if (!isMounted || !toneSound) return;
          const t = Math.min(1, (Date.now() - startedAt) / rampMs);
          const v = startVolume + (maxVolume - startVolume) * t;
          try {
            toneSound.setVolume(Math.max(0, Math.min(1, v)));
          } catch (_) {
            // ignore
          }
          if (t >= 1) {
            clearInterval(volumeTimer);
            volumeTimer = null;
          }
        }, 750);

        toneSound.play(() => {
          // For looping sounds, this callback may not fire. For non-loop, it does.
        });
      });
    };

    const personalityToDefaultVoice = {
      motivational: 'en-US-GuyNeural',
      fun: 'en-US-JennyNeural',
      friendly: 'en-US-JennyNeural',
      gentle: 'en-GB-SoniaNeural',
      professional: 'en-US-GuyNeural',
      scientific: 'en-US-GuyNeural',
      strict: 'en-US-GuyNeural',
      rude: 'en-US-GuyNeural',
    };

    (async () => {
      try {
        if (startToneImmediately) {
          startTone();
        }

        if (!shouldSpeak) {
          return;
        }

        const mode = String(userProfile?.preferences?.ttsMode || 'device');
        const selected = String(userProfile?.preferences?.ttsVoice || '').trim();
        const fallbackVoice = personalityToDefaultVoice[String(alarm?.aiPersonality || 'motivational')] || 'en-US-JennyNeural';
        const cloudVoice = selected || fallbackVoice;

        if (mode === 'cloud') {
          const token = await getAuthToken();
          if (token) {
            const baseUrl = await getBackendBaseUrl();
            const resp = await fetch(`${baseUrl}/api/tts/speak`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ text, voice: cloudVoice }),
            });
            const dataText = await resp.text();
            let json = null;
            try {
              json = dataText ? JSON.parse(dataText) : null;
            } catch {
              json = null;
            }

            if (resp.ok && json?.url) {
              if (!isMounted) return;
              messageSound = new Sound(String(json.url), null, (error) => {
                if (error) {
                  try {
                    Tts.getInitStatus().then(() => {
                      if (!isMounted) return;
                      Tts.stop();
                      Tts.speak(text);
                    });
                  } catch (_) {
                    // ignore
                  }
                  return;
                }
                messageSound.play(() => {
                  startTone();
                });
              });
              return;
            }
          }
        }

        await Tts.getInitStatus();
        if (!isMounted) return;

        try {
          ttsFinishSub = Tts.addEventListener('tts-finish', () => {
            startTone();
          });
          ttsCancelSub = Tts.addEventListener('tts-cancel', () => {
            startTone();
          });
        } catch (_) {
          // ignore
        }

        // Fallback in case finish events don't fire.
        fallbackTimer = setTimeout(() => {
          startTone();
        }, 4000);

        Tts.stop();
        Tts.speak(text);
      } catch (e) {
        // If TTS isn't available on the device, fail silently.
      }
    })();

    return () => {
      isMounted = false;
      try {
        Tts.stop();
      } catch (_) {
        // ignore
      }
      try {
        if (ttsFinishSub?.remove) ttsFinishSub.remove();
        if (ttsCancelSub?.remove) ttsCancelSub.remove();
      } catch (_) {
        // ignore
      }
      try {
        if (fallbackTimer) {
          clearTimeout(fallbackTimer);
          fallbackTimer = null;
        }
        if (volumeTimer) {
          clearInterval(volumeTimer);
          volumeTimer = null;
        }
        if (messageSound) {
          messageSound.stop(() => {});
          messageSound.release();
          messageSound = null;
        }
        if (toneSound) {
          toneSound.stop(() => {});
          toneSound.release();
          toneSound = null;
        }
      } catch (_) {
        // ignore
      }
    };
  }, [
    alarm?.customMessage,
    alarm?.aiPersonality,
    userProfile?.preferences?.ttsEnabled,
    userProfile?.preferences?.ttsMode,
    userProfile?.preferences?.ttsVoice,
    startToneImmediately,
  ]);

  const loadEnhancedData = async () => {
    try {
      
      // Load weather data if enabled
      let weatherData = null;
      if (alarm.weatherAlert) {
        weatherData = await WeatherService.getCurrentWeather();
        setWeather(weatherData);
      }

      // Load location context if location is set
      let locationData = null;
      if (alarm.locationId && alarm.locationId !== 'current') {
        const profiles = await LocationService.getLocationProfiles();
        const targetLocation = profiles.find(p => p.id === alarm.locationId);
        if (targetLocation && targetLocation.latitude) {
          locationData = await LocationService.checkLocationContext(targetLocation);
          setLocationContext(locationData);
        }
      }

      // Generate AI motivational message
      const motivationData = await MotivationalService.getCompleteMotivationalMessage(
        userStats,
        alarm.importanceLevel || alarm.importance,
        weatherData
      );
      setMotivation(motivationData);

    } catch (error) {
      console.error('Enhanced alarm data load error:', error);
    }
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString([], { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const handleSnooze = () => {
    if (challengeLocked) {
      onDismiss('challenge');
      return;
    }
    if (alarm.challengeMode && userStats.level >= 3) {
      Alert.alert(
        'Challenge Mode Active! 🎮',
        'Complete a mini-game to snooze this alarm!',
        [
          { text: 'Accept Challenge', onPress: () => onDismiss('challenge') },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } else {
      onDismiss('snooze');
    }
  };

  const getLocationMessage = () => {
    if (!locationContext) return null;
    
    const settings = LocationService.getLocationBasedAlarmSettings(locationContext);
    return settings.message;
  };

  return (
    <LinearGradient
      colors={
        (alarm.importanceLevel || alarm.importance) === 'critical' 
          ? ['#ff6b6b', '#ee5a52'] 
          : (alarm.importanceLevel || alarm.importance) === 'high' 
          ? ['#feca57', '#ff9ff3'] 
          : ['#667eea', '#764ba2']
      }
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Current Time Display */}
        <View style={styles.timeContainer}>
          <Text style={styles.currentTime}>{formatTime(currentTime)}</Text>
          <Text style={styles.currentDate}>{formatDate(currentTime)}</Text>
        </View>

        {/* Alarm Info */}
        <View style={styles.alarmInfoContainer}>
          <Text style={styles.alarmTitle}>{alarm.label || alarm.title || 'RiseQuest Alarm'}</Text>
          {alarm.customMessage && (
            <Text style={styles.customMessage}>"{alarm.customMessage}"</Text>
          )}
        </View>

        {/* Weather Information */}
        {weather && !weather.error && (
          <View style={styles.weatherContainer}>
            <Text style={styles.weatherTitle}>
              {weather.icon} Weather Update
            </Text>
            <Text style={styles.weatherInfo}>
              {weather.temperature}°C • {weather.description}
            </Text>
            <Text style={styles.weatherAdvice}>
              {WeatherService.getWeatherAdvice(weather)}
            </Text>
          </View>
        )}

        {/* Location Context */}
        {locationContext && (
          <View style={styles.locationContainer}>
            <Text style={styles.locationMessage}>
              {getLocationMessage()}
            </Text>
          </View>
        )}

        {/* AI Motivational Message */}
        {motivation && (
          <View style={styles.motivationContainer}>
            <Text style={styles.greetingText}>{motivation.greeting}</Text>
            <Text style={styles.dayMessage}>{motivation.dayMessage}</Text>
            <Text style={styles.quote}>"{motivation.quote}"</Text>
            <Text style={styles.tip}>{motivation.tip}</Text>
          </View>
        )}

        {/* User Stats Display */}
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{userStats.level}</Text>
            <Text style={styles.statLabel}>Level</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{userStats.streak}</Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{userStats.experience ?? userStats.xp ?? 0}</Text>
            <Text style={styles.statLabel}>XP</Text>
          </View>
        </View>

        {!challengeLocked && alarm.snoozeEnabled !== false && wakeBuddy && <TouchableOpacity
          accessibilityRole="button" disabled={contactingBuddy}
          style={[styles.actionButton, { backgroundColor: '#E5F6F0', marginBottom: 12 }]}
          onPress={contactBuddy}>
          <Text style={{ color: '#235F54', fontSize: 17, fontWeight: '700', textAlign: 'center' }}>🤝 Contact {wakeBuddy.name}</Text>
          <Text style={{ color: '#52645E', textAlign: 'center', marginTop: 5 }}>Snooze & open your buddy’s number</Text>
        </TouchableOpacity>}
        {!!buddyError && <Text accessibilityLiveRegion="polite" style={{ color: '#FFF', marginBottom: 12 }}>{buddyError}</Text>}

        {/* Importance Indicator */}
        {(alarm.importanceLevel || alarm.importance) !== 'normal' && (
          <View style={styles.importanceContainer}>
            <Text style={styles.importanceText}>
              {(alarm.importanceLevel || alarm.importance) === 'critical' ? '🚨 CRITICAL ALARM' : '⚡ HIGH PRIORITY'}
            </Text>
          </View>
        )}
      </ScrollView>
      <SafeAreaView edges={['bottom']} style={{ paddingHorizontal: 20, backgroundColor: 'rgba(52,40,85,0.18)' }}>
        <View style={[styles.buttonContainer, { marginTop: 12, marginBottom: 12 }]}>
          {challengeLocked ? <TouchableOpacity style={[styles.actionButton, styles.dismissButton]} onPress={() => onDismiss('challenge')}>
            <Text style={styles.buttonText}>🎮 Start Challenge</Text>
          </TouchableOpacity> : <>
            {alarm.snoozeEnabled !== false && <TouchableOpacity style={[styles.actionButton, styles.snoozeButton]} onPress={handleSnooze}>
              <Text style={styles.buttonText}>{alarm.challengeMode && userStats.level >= 3 ? '🎮 Challenge Snooze' : '😴 Snooze'}</Text>
            </TouchableOpacity>}
            <TouchableOpacity style={[styles.actionButton, styles.dismissButton]} onPress={() => onDismiss('dismiss')}>
              <Text style={styles.buttonText}>✅ I'm Awake!</Text>
            </TouchableOpacity>
          </>}
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 20,
    textAlign: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  timeContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  currentTime: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  currentDate: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 5,
  },
  alarmInfoContainer: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 15,
    padding: 20,
    marginBottom: 20,
  },
  alarmTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
  },
  customMessage: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  weatherContainer: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 15,
    padding: 15,
    marginBottom: 20,
  },
  weatherTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  weatherInfo: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 5,
  },
  weatherAdvice: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  locationContainer: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 15,
    padding: 15,
    marginBottom: 20,
  },
  locationMessage: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
  },
  motivationContainer: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 15,
    padding: 20,
    marginBottom: 20,
  },
  greetingText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
  },
  dayMessage: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginBottom: 10,
  },
  quote: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 10,
  },
  tip: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 15,
    padding: 20,
    marginBottom: 30,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 5,
  },
  buttonContainer: {
    gap: 15,
  },
  actionButton: {
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 25,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  snoozeButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  dismissButton: {
    backgroundColor: 'rgba(46, 213, 115, 0.9)',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  importanceContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  importanceText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    backgroundColor: 'rgba(255,0,0,0.3)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
});
