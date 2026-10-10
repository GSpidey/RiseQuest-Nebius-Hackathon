import { getAuthToken } from '../services/AuthTokenStorage';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Switch,
  Alert,
  Modal,
  ActivityIndicator,
  Platform,
  Linking,
  PermissionsAndroid,
  NativeModules,
  Keyboard,
  AppState,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { LocationService } from '../utils/LocationService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBackendBaseUrl } from '../config/backendConfig';
import { pick, types, isCancel, keepLocalCopy } from '@react-native-documents/picker';
import Sound from 'react-native-sound';
import PushNotification from 'react-native-push-notification';
import { challengeDifficulty } from '../services/alarmEditing';
import { createAlarmPreview } from '../services/alarmPreview';

const CreateAlarmScreen = ({ onSave, onCancel, initialAlarm = null, onRefreshBalances }) => {
  const pendingMessageRequest = useRef(null);
  const insets = useSafeAreaInsets();
  const [formHeight, setFormHeight] = useState(0);
  const [alarmData, setAlarmData] = useState({
    time: '07:00',
    label: 'Wake up',
    isEnabled: true,
    repeatDaily: true,
    importanceLevel: 'medium',
    snoozeEnabled: true,
    challengeMode: false,
    weatherAlert: true,
    customMessage: '',
    aiPersonality: 'motivational',
    selectedTone: 'default',
    customToneUri: null,
    customToneName: null,
    locationId: 'current',
    locationAware: false,
    ...initialAlarm,
    challengeDifficulty: challengeDifficulty(initialAlarm),
  });
  const [saving, setSaving] = useState(false);
  const saveBusyRef = useRef(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const previewRef = useRef(null);
  if (!previewRef.current) previewRef.current = createAlarmPreview(Sound, {
    onChange: setPreviewPlaying,
    onError: () => Alert.alert('Preview failed', 'Could not play this audio file.'),
  });
  const stopPreview = () => previewRef.current.stop();
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => { if (state !== 'active') previewRef.current.stop(); });
    return () => { sub.remove(); previewRef.current.stop(); };
  }, []);
  const pickerBusyRef = useRef(false);
  const openTimePicker = async () => {
    if (pickerBusyRef.current) return;
    pickerBusyRef.current = true;
    Keyboard.dismiss();
    stopPreview();
    try {
      const [hour, minute] = alarmData.time.split(':').map(Number);
      const time = await NativeModules.RiseQuestAlarmAudio.pickTime(hour, minute);
      if (time) setAlarmData(previous => ({ ...previous, time }));
    } catch (_) { Alert.alert('Time picker', 'Could not open the time picker. Please try again.'); }
    finally { pickerBusyRef.current = false; }
  };

  const [generatingMessage, setGeneratingMessage] = useState(false);
  const messageBusyRef = useRef(false);
  const [messageNotice, setMessageNotice] = useState('');
  const [messageError, setMessageError] = useState('');

  const AI_MESSAGE_COST = 25;

  useEffect(() => {
    if (initialAlarm) return; // Editing must not replace this alarm's chosen tone.
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('risequest_default_alarm_tone');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!mounted || !parsed) return;
        const selectedTone = String(parsed?.selectedTone || '').trim();
        const customToneUri = parsed?.customToneUri ? String(parsed.customToneUri) : null;
        const customToneName = parsed?.customToneName ? String(parsed.customToneName) : null;
        if (selectedTone === 'custom' && customToneUri) {
          setAlarmData((prev) => ({
            ...prev,
            selectedTone: 'custom',
            customToneUri,
            customToneName,
          }));
        }
      } catch (_) {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const readJsonSafe = async (resp) => {
    const text = await resp.text();
    if (!text) return { json: null, text: '' };
    try {
      return { json: JSON.parse(text), text };
    } catch (_) {
      return { json: null, text };
    }
  };

  const openExactAlarmSettings = async () => {
    if (Platform.OS !== 'android') return;
    try {
      if (typeof Linking.sendIntent === 'function') {
        await Linking.sendIntent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM');
        return;
      }
    } catch (_) {
      // ignore
    }

    try {
      await Linking.openSettings();
    } catch (_) {
      // ignore
    }
  };

  const generateWakeupMessage = async () => {
    if (messageBusyRef.current) return;
    messageBusyRef.current = true;
    setMessageError('');
    setMessageNotice('');
    try {
      const token = await getAuthToken();
      if (!token) {
        setMessageError('Please sign in to generate a wake-up message.');
        return;
      }

      setGeneratingMessage(true);
      const baseUrl = await getBackendBaseUrl();
      const payload = JSON.stringify({ personality: String(alarmData.aiPersonality || 'motivational'),
        label: String(alarmData.label || ''), importance: String(alarmData.importanceLevel || 'medium'), time: String(alarmData.time || '07:00') });
      if (pendingMessageRequest.current?.payload !== payload || pendingMessageRequest.current?.token !== token) {
        pendingMessageRequest.current = { payload, token, key: `wakeup_${Date.now()}_${Math.random().toString(36).slice(2)}` };
      }
      const resp = await fetch(`${baseUrl}/api/ai/wakeup-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Idempotency-Key': pendingMessageRequest.current.key,
        },
        body: payload,
      });

      const { json, text } = await readJsonSafe(resp);
      if (!resp.ok) {
        throw new Error(json?.error || text || 'Failed to generate message');
      }

      const message = String(json?.message || '').trim();
      if (!message) {
        throw new Error('AI returned an empty message.');
      }
      pendingMessageRequest.current = null;

      setAlarmData((prev) => ({ ...prev, customMessage: message }));
      const refunded = Boolean(json?.refunded);
      const provider = json?.provider ? String(json.provider) : null;

      if (provider === 'curated' || provider === 'fallback' || refunded) {
        setMessageNotice('Prepared suggestion · No RisePoints charged.');
      }
      // The result is already visible. Refresh the normal wallet display quietly.
      Promise.resolve().then(() => onRefreshBalances?.()).catch(() => {});
    } catch (e) {
      setMessageError(e?.message ? String(e.message) : 'Could not generate a message. Please try again.');
    } finally {
      messageBusyRef.current = false;
      setGeneratingMessage(false);
    }
  };

  const [locationProfiles, setLocationProfiles] = useState([]);
  const [showLocationModal, setShowLocationModal] = useState(false);

  const ensureAudioPickPermission = async () => true; // System picker grants access to the selected document.

  const pickCustomTone = async () => {
    stopPreview();
    try {
      const ok = await ensureAudioPickPermission();
      if (!ok) {
        Alert.alert('Permission needed', 'Allow audio access to pick a custom tone.');
        return;
      }

      const results = await pick({
        type: [types.audio],
      });

      const result = Array.isArray(results) ? results[0] : results;
      if (!result?.uri) return;
      const [copy] = await keepLocalCopy({ destination: 'documentDirectory', files: [{ uri: result.uri, fileName: `alarm_${Date.now()}_${String(result.name || 'tone.mp3').replace(/[^a-zA-Z0-9._-]/g, '_')}` }] });
      if (copy.status !== 'success') throw new Error('Could not retain the selected tone');
      const uri = copy.localUri;

      setAlarmData((prev) => ({
        ...prev,
        selectedTone: 'custom',
        customToneUri: uri,
        customToneName: result?.name || 'Custom tone',
      }));

      // Preview immediately
      previewTone({ value: 'custom' }, uri);
    } catch (e) {
      if (isCancel(e)) return;
      Alert.alert('Custom tone', 'Could not pick an audio file for your custom tone.');
    }
  };

  const previewTone = (tone, customUriOverride = null) => {
    stopPreview();
    const v = String(tone?.value || '').trim();
    if (v === 'custom') {
      const uri = customUriOverride || alarmData.customToneUri;
      if (!uri) {
        Alert.alert('Preview', 'Pick an audio file first.');
        return;
      }

      try {
        Sound.setCategory('Playback');
      } catch (_) {
        // ignore
      }

      previewRef.current.play(uri);
      return;
    }

    // Built-in tones are currently system/default; best-effort preview via a local notification.
    try {
      PushNotification.localNotification({
        channelId: 'risequest-alarms',
        title: 'Tone preview',
        message: ' ',
        playSound: true,
        soundName: 'default',
        vibrate: false,
        importance: 'high',
      });
    } catch (_) {
      // ignore
    }
  };
  const [loadingLocation, setLoadingLocation] = useState(false);

  const [showNameLocationModal, setShowNameLocationModal] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [pendingLocationToSave, setPendingLocationToSave] = useState(null);

  const normalizeToHHMM = (value) => {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 4);
    if (!digits) return null;

    let hours;
    let minutes;

    if (digits.length <= 2) {
      hours = Number(digits);
      minutes = 0;
    } else if (digits.length === 3) {
      hours = Number(digits.slice(0, 1));
      minutes = Number(digits.slice(1, 3));
    } else {
      hours = Number(digits.slice(0, 2));
      minutes = Number(digits.slice(2, 4));
    }

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    if (hours < 0 || hours > 23) return null;
    if (minutes < 0 || minutes > 59) return null;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  };

  const formatTime12h = (hhmm) => {
    const normalized = normalizeToHHMM(hhmm);
    if (!normalized) return null;
    const [hh, mm] = normalized.split(':');
    const h24 = Number(hh);
    const m = Number(mm);
    const period = h24 >= 12 ? 'PM' : 'AM';
    const h12 = ((h24 + 11) % 12) + 1;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  };

  useEffect(() => {
    loadLocationProfiles();
  }, []);

  const loadLocationProfiles = async () => {
    try {
      const profiles = await LocationService.getLocationProfiles();
      setLocationProfiles(profiles);
    } catch (error) {
      console.error('Error loading location profiles:', error);
    }
  };

  const addNewLocation = async () => {
    try {
      setLoadingLocation(true);
      const currentLocation = await LocationService.getCurrentLocation();
      
      if (currentLocation.error) {
        Alert.alert('Location Error', currentLocation.error);
        return;
      }

      const suggested = String(LocationService.formatLocationName(currentLocation.address) || '').trim();

      // Alert.prompt is iOS-only; use our own modal for Android.
      if (Platform.OS === 'ios' && typeof Alert.prompt === 'function') {
        Alert.prompt(
          'Save Location',
          'Give this location a name:',
          async (name) => {
            const trimmed = String(name || '').trim();
            if (!trimmed) return;
            try {
              const newProfile = await LocationService.saveLocationProfile(trimmed, currentLocation);
              await loadLocationProfiles();
              setAlarmData({ ...alarmData, locationId: newProfile.id });
              Alert.alert('Success', `Location "${trimmed}" saved!`);
            } catch (error) {
              Alert.alert('Error', 'Could not save location');
            }
          },
          'plain-text',
          suggested
        );
      } else {
        setPendingLocationToSave(currentLocation);
        setNewLocationName(suggested);
        setShowNameLocationModal(true);
      }
    } catch (error) {
      Alert.alert('Error', 'Could not get current location');
    } finally {
      setLoadingLocation(false);
    }
  };

  const confirmSavePendingLocation = async () => {
    const trimmed = String(newLocationName || '').trim();
    if (!trimmed) {
      Alert.alert('Save Location', 'Please enter a location name.');
      return;
    }
    const loc = pendingLocationToSave;
    if (!loc) {
      setShowNameLocationModal(false);
      return;
    }

    try {
      setLoadingLocation(true);
      const newProfile = await LocationService.saveLocationProfile(trimmed, loc);
      await loadLocationProfiles();
      setAlarmData(prev => ({ ...prev, locationId: newProfile.id }));
      setShowNameLocationModal(false);
      setPendingLocationToSave(null);
      Alert.alert('Success', `Location "${trimmed}" saved!`);
    } catch (e) {
      Alert.alert('Error', 'Could not save location');
    } finally {
      setLoadingLocation(false);
    }
  };

  const importanceLevels = [
    { value: 'low', label: 'Low', description: 'Gentle wake-up' },
    { value: 'medium', label: 'Medium', description: 'Standard alarm' },
    { value: 'high', label: 'High', description: 'Important meeting' },
    { value: 'critical', label: 'Critical', description: 'Cannot miss!' },
  ];

  const alarmTones = [
    { value: 'default', label: '🔔 Default' },
    { value: 'gentle', label: '🌅 Gentle Morning' },
    { value: 'energetic', label: '⚡ Energetic' },
    { value: 'nature', label: '🌿 Nature Sounds' },
    { value: 'motivational', label: '💪 Motivational' },
    { value: 'custom', label: '📁 Custom Tone' },
  ];

  const handleSave = async () => {
    stopPreview();
    Keyboard.dismiss();
    if (saveBusyRef.current) return;
    saveBusyRef.current = true;
    setSaving(true);
    try {
      const normalized = normalizeToHHMM(alarmData.time);
      if (!normalized) {
        Alert.alert('Invalid time', 'Enter a valid time like 730 (7:30 AM) or 19:45 (7:45 PM).');
        return;
      }

      const newAlarm = {
        ...alarmData,
        time: normalized,
      };

      await onSave(newAlarm);
    } catch (error) {
      Alert.alert('Error', 'Failed to save alarm. Please try again.');
      console.error('Error creating alarm:', error);
    } finally {
      saveBusyRef.current = false;
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View collapsable={false} style={{ flex: 1 }}
        onLayout={({ nativeEvent }) => setFormHeight(Math.round(nativeEvent.layout.height))}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.header}
        >
          <Text style={styles.headerTitle}>{initialAlarm ? 'Edit Alarm' : 'Create New Alarm'}</Text>
          {Platform.OS === 'ios' && <Text style={{ color: '#FFFFFF', fontSize: 14, lineHeight: 20, marginTop: 8 }}>
            {Number.parseInt(String(Platform.Version), 10) >= 26
              ? 'Uses iPhone system alarms. iOS always permits Stop on the lock screen; challenges are optional in the app.'
              : 'Uses notifications on this iOS version. Sound is brief and follows Focus/silent settings; continuous background ringing is not available.'}
            {'\n'}Spoken messages play when RiseQuest is open. Custom iOS alarm sounds must be WAV, CAF or AIFF and shorter than 30 seconds.
          </Text>}
          <Text style={styles.headerSubtitle}>Set up your wake-up experience</Text>
        </LinearGradient>

        <ScrollView
          key={`alarm-form-${formHeight}`}
          style={styles.content}
          contentContainerStyle={{ padding: 24, paddingBottom: 32 + (insets.bottom || 0) }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          nestedScrollEnabled
          removeClippedSubviews={false}
          showsVerticalScrollIndicator={false}
        >
        {/* Time Picker */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⏰ Alarm Time</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Select alarm time, ${formatTime12h(alarmData.time)}`}
            style={styles.timeInput} onPress={openTimePicker}>
            <Text style={{ fontSize: 36, fontWeight: '900', color: '#5841B5', textAlign: 'center' }}>{formatTime12h(alarmData.time)}</Text>
          </TouchableOpacity>
          <Text style={styles.timeHint}>Tap to choose a time</Text>
        </View>

        {/* Label */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏷️ Label</Text>
          <TextInput
            style={styles.input}
            value={alarmData.label}
            onChangeText={(label) => setAlarmData({ ...alarmData, label })}
            placeholder="Wake up"
          />
        </View>

        {/* Custom Message */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💬 Custom Wake-up Message</Text>
          <TextInput
            style={styles.textArea}
            value={alarmData.customMessage}
            onChangeText={(customMessage) => { setAlarmData({ ...alarmData, customMessage }); setMessageNotice(''); }}
            placeholder="Good morning! Today is going to be amazing!"
            multiline
            scrollEnabled={false}
            numberOfLines={3}
          />
          {!!messageNotice && <Text style={styles.timeHint} accessibilityLiveRegion="polite">{messageNotice}</Text>}
          <Text style={styles.timeHint}>Read aloud when Text-to-speech is enabled in Settings and the alarm screen opens. The alarm tone may start first.</Text>

          <View style={styles.aiBlock}>
            <Text style={styles.aiTitle}>🤖 AI Message (cost: {AI_MESSAGE_COST} RisePoints)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.aiPersonalityRow}>
              {[
                { id: 'motivational', label: '💪 Motivational' },
                { id: 'gentle', label: '🌸 Gentle' },
                { id: 'scientific', label: '🔬 Scientific' },
                { id: 'friendly', label: '😊 Friendly' },
                { id: 'professional', label: '👔 Professional' },
                { id: 'strict', label: '📏 Strict' },
                { id: 'rude', label: '😈 Rude' },
              ].map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.aiPill, alarmData.aiPersonality === p.id && styles.aiPillActive]}
                  onPress={() => setAlarmData((prev) => ({ ...prev, aiPersonality: p.id }))}
                >
                  <Text style={[styles.aiPillText, alarmData.aiPersonality === p.id && styles.aiPillTextActive]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.aiButton, generatingMessage && styles.aiButtonDisabled]}
              disabled={generatingMessage}
              onPress={generateWakeupMessage}
            >
              <Text style={styles.aiButtonText}>
                {generatingMessage ? 'Generating…' : `Generate message (${AI_MESSAGE_COST} RP)`}
              </Text>
            </TouchableOpacity>

            {!!messageError && <Text style={styles.timeHint} accessibilityRole="alert" accessibilityLiveRegion="polite">{messageError}</Text>}

            {Platform.OS === 'android' && (
              <TouchableOpacity style={styles.aiLinkButton} onPress={openExactAlarmSettings}>
                <Text style={styles.aiLinkText}>⚠️ Android: Enable “Alarms & reminders” for reliable exact alarms</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Importance Level */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎯 Importance Level</Text>
          <View style={styles.optionsGrid}>
            {importanceLevels.map((level) => (
              <TouchableOpacity
                key={level.value}
                style={[
                  styles.optionCard,
                  alarmData.importanceLevel === level.value && styles.optionCardSelected
                ]}
                onPress={() => setAlarmData({ ...alarmData, importanceLevel: level.value })}
              >
                <Text style={[
                  styles.optionLabel,
                  alarmData.importanceLevel === level.value && styles.optionLabelSelected
                ]}>
                  {level.label}
                </Text>
                <Text style={[
                  styles.optionDescription,
                  alarmData.importanceLevel === level.value && styles.optionDescriptionSelected
                ]}>
                  {level.description}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Alarm Tone */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎵 Alarm Tone</Text>
          {previewPlaying && <TouchableOpacity accessibilityRole="button" style={styles.aiLinkButton} onPress={stopPreview}>
            <Text style={styles.aiLinkText}>Stop preview</Text>
          </TouchableOpacity>}
          <Text style={styles.timeHint}>Custom audio previews stop automatically after 10 seconds.</Text>
          <View style={styles.tonesList}>
            {alarmTones.map((tone) => (
              <TouchableOpacity
                key={tone.value}
                style={[
                  styles.toneOption,
                  alarmData.selectedTone === tone.value && styles.toneOptionSelected
                ]}
                onPress={() => {
                  if (tone.value === 'custom') {
                    pickCustomTone();
                    return;
                  }
                  setAlarmData({ ...alarmData, selectedTone: tone.value });
                  previewTone(tone);
                }}
              >
                <Text style={[
                  styles.toneLabel,
                  alarmData.selectedTone === tone.value && styles.toneLabelSelected
                ]}>
                  {tone.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {alarmData.selectedTone === 'custom' && (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.timeHint}>
                {alarmData.customToneName ? `Selected: ${alarmData.customToneName}` : 'Pick an audio file to use as your alarm tone.'}
              </Text>
              <TouchableOpacity accessibilityRole="button" style={[styles.aiLinkButton, { marginTop: 8 }]}
                onPress={() => previewPlaying ? stopPreview() : previewTone({ value: 'custom' })}>
                <Text style={styles.aiLinkText}>{previewPlaying ? 'Stop preview' : 'Preview sound'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.aiLinkButton, { marginTop: 8 }]} onPress={pickCustomTone}>
                <Text style={styles.aiLinkText}>📁 Choose audio file</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Settings Toggles */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚙️ Alarm Settings</Text>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Alarm enabled</Text>
            <Switch accessibilityLabel="Alarm enabled" value={alarmData.isEnabled !== false}
              onValueChange={isEnabled => setAlarmData({ ...alarmData, isEnabled })} />
          </View>
          
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>🔄 Repeat Daily</Text>
            <Switch
              value={alarmData.repeatDaily}
              onValueChange={(repeatDaily) => setAlarmData({ ...alarmData, repeatDaily })}
              trackColor={{ false: '#e2e8f0', true: '#667eea' }}
            />
          </View>

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>😴 Enable Snooze</Text>
            <Switch
              value={alarmData.snoozeEnabled}
              onValueChange={(snoozeEnabled) => setAlarmData({ ...alarmData, snoozeEnabled })}
              trackColor={{ false: '#e2e8f0', true: '#667eea' }}
            />
          </View>

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>🎮 Challenge Mode</Text>
            <Switch
              value={alarmData.challengeMode}
              onValueChange={(challengeMode) => setAlarmData({ ...alarmData, challengeMode })}
              trackColor={{ false: '#e2e8f0', true: '#667eea' }}
            />
          </View>

          {alarmData.challengeMode && <View>
            <Text style={styles.sectionTitle}>Challenge difficulty</Text>
            <Text style={{ color: '#475569', marginBottom: 10 }}>Three correct answers unlock Stop and Snooze at every difficulty.</Text>
            {['easy', 'medium', 'hard'].map(level => (
              <TouchableOpacity key={level} accessibilityRole="radio"
                accessibilityState={{ selected: alarmData.challengeDifficulty === level }}
                style={[styles.optionCard, alarmData.challengeDifficulty === level && styles.optionCardSelected]}
                onPress={() => setAlarmData({ ...alarmData, challengeDifficulty: level })}>
                <Text style={styles.optionLabel}>{level === 'easy' ? 'Easy' : level === 'hard' ? 'Hard' : 'Medium'}</Text>
              </TouchableOpacity>
            ))}
          </View>}
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>🌤️ Weather Alert</Text>
            <Switch
              value={alarmData.weatherAlert}
              onValueChange={(weatherAlert) => setAlarmData({ ...alarmData, weatherAlert })}
              trackColor={{ false: '#e2e8f0', true: '#667eea' }}
            />
          </View>

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>📍 Location Aware</Text>
            <Switch
              value={alarmData.locationAware}
              onValueChange={(locationAware) => setAlarmData({ ...alarmData, locationAware })}
              trackColor={{ false: '#e2e8f0', true: '#667eea' }}
            />
          </View>
        </View>

        {/* Location Selection */}
        {alarmData.locationAware && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📍 Location Settings</Text>
            
            <TouchableOpacity
              style={styles.locationSelector}
              onPress={() => setShowLocationModal(true)}
            >
              <Text style={styles.locationSelectorText}>
                {alarmData.locationId === 'current' 
                  ? '📱 Use Current Location' 
                  : locationProfiles.find(p => p.id === alarmData.locationId)?.name || 'Select Location'
                }
              </Text>
              <Text style={styles.locationSelectorArrow}>▼</Text>
            </TouchableOpacity>

            <Text style={styles.locationHint}>
              Location-aware alarms adjust volume and difficulty based on your surroundings
            </Text>
          </View>
        )}
        </ScrollView>

        {/* Location Name Modal (Android + fallback) */}
        <Modal
          visible={showNameLocationModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowNameLocationModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.nameModalCard}>
              <Text style={styles.modalTitle}>Save Location</Text>
              <Text style={styles.nameModalHint}>Give this location a name:</Text>
              <TextInput
                value={newLocationName}
                onChangeText={setNewLocationName}
                placeholder="Home"
                style={styles.nameModalInput}
                autoCapitalize="words"
              />
              <View style={styles.nameModalActions}>
                <TouchableOpacity
                  style={[styles.cancelButton, { flex: 1 }]}
                  onPress={() => {
                    setShowNameLocationModal(false);
                    setPendingLocationToSave(null);
                  }}
                  disabled={loadingLocation}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveButton, { flex: 1 }]}
                  onPress={confirmSavePendingLocation}
                  disabled={loadingLocation}
                >
                  <Text style={styles.saveButtonText}>{loadingLocation ? 'Saving…' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

      {/* Location Modal */}
      <Modal
        visible={showLocationModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowLocationModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Choose Location</Text>
            
            <ScrollView style={styles.locationList}>
              <TouchableOpacity
                style={[
                  styles.locationOption,
                  alarmData.locationId === 'current' && styles.locationOptionSelected
                ]}
                onPress={() => {
                  setAlarmData({ ...alarmData, locationId: 'current' });
                  setShowLocationModal(false);
                }}
              >
                <Text style={styles.locationOptionText}>📱 Use Current Location</Text>
                <Text style={styles.locationOptionDesc}>Dynamic location when alarm triggers</Text>
              </TouchableOpacity>

              {locationProfiles.map((profile) => (
                <TouchableOpacity
                  key={profile.id}
                  style={[
                    styles.locationOption,
                    alarmData.locationId === profile.id && styles.locationOptionSelected
                  ]}
                  onPress={() => {
                    setAlarmData({ ...alarmData, locationId: profile.id });
                    setShowLocationModal(false);
                  }}
                >
                  <Text style={styles.locationOptionText}>
                    {LocationService.getLocationEmoji(profile.name)} {profile.name}
                  </Text>
                  <Text style={styles.locationOptionDesc}>
                    {LocationService.formatLocationName(profile.address)}
                  </Text>
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                style={styles.addLocationButton}
                onPress={addNewLocation}
                disabled={loadingLocation}
              >
                {loadingLocation ? (
                  <ActivityIndicator size="small" color="#667eea" />
                ) : (
                  <Text style={styles.addLocationText}>➕ Add Current Location</Text>
                )}
              </TouchableOpacity>
            </ScrollView>

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowLocationModal(false)}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Action Buttons */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.cancelButton} onPress={() => { stopPreview(); onCancel(); }}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveButtonText}>{saving ? 'Saving…' : initialAlarm ? 'Save changes' : 'Create Alarm'}</Text>
        </TouchableOpacity>
      </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    padding: 24,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: 'white',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 17,
    color: 'white',
    opacity: 0.9,
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: 16,
    letterSpacing: 0.3,
  },
  timeInput: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    fontSize: 36,
    fontWeight: '900',
    textAlign: 'center',
    color: '#667eea',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    letterSpacing: 1,
  },
  timeHint: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
  },
  input: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 18,
    fontSize: 17,
    color: '#1f2937',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 2,
    borderColor: '#f1f5f9',
    fontWeight: '500',
  },
  textArea: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 18,
    fontSize: 17,
    color: '#1f2937',
    height: 100,
    textAlignVertical: 'top',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 2,
    borderColor: '#f1f5f9',
    fontWeight: '500',
  },
  aiBlock: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  aiTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
  },
  aiPersonalityRow: {
    paddingVertical: 4,
    paddingRight: 10,
    gap: 10,
  },
  aiPill: {
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  aiPillActive: {
    backgroundColor: 'rgba(102, 126, 234, 0.12)',
    borderColor: '#c7d2fe',
  },
  aiPillText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  aiPillTextActive: {
    color: '#4338ca',
  },
  aiButton: {
    marginTop: 12,
    backgroundColor: '#0f172a',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  aiButtonDisabled: {
    opacity: 0.6,
  },
  aiButtonText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
  },
  aiLinkButton: {
    marginTop: 10,
  },
  aiLinkText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 13,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  optionCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    width: '47%',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  optionCardSelected: {
    borderColor: '#667eea',
    backgroundColor: 'rgba(102, 126, 234, 0.08)',
    shadowColor: '#667eea',
    shadowOpacity: 0.2,
  },
  optionLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  optionLabelSelected: {
    color: '#667eea',
  },
  optionDescription: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
    lineHeight: 18,
  },
  optionDescriptionSelected: {
    color: '#667eea',
  },
  tonesList: {
    marginTop: 12,
    gap: 12,
  },
  toneOption: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  toneOptionSelected: {
    borderColor: '#667eea',
    backgroundColor: 'rgba(102, 126, 234, 0.08)',
    shadowColor: '#667eea',
    shadowOpacity: 0.15,
  },
  toneLabel: {
    fontSize: 16,
    color: '#1f2937',
    fontWeight: '600',
  },
  toneLabelSelected: {
    color: '#667eea',
    fontWeight: '800',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  toggleLabel: {
    fontSize: 16,
    color: '#2d3748',
  },
  footer: {
    flexDirection: 'row',
    padding: 24,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    gap: 16,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cancelButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#6b7280',
    letterSpacing: 0.3,
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#667eea',
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: 'white',
    letterSpacing: 0.3,
  },
  locationSelector: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  locationSelectorText: {
    fontSize: 16,
    color: '#2d3748',
    flex: 1,
  },
  locationSelectorArrow: {
    fontSize: 14,
    color: '#a0aec0',
  },
  locationHint: {
    fontSize: 12,
    color: '#718096',
    marginTop: 8,
    fontStyle: 'italic',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  nameModalCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 18,
    width: '90%',
    maxWidth: 420,
  },
  nameModalHint: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 10,
    textAlign: 'center',
  },
  nameModalInput: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    fontSize: 16,
    color: '#111827',
  },
  nameModalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2d3748',
    textAlign: 'center',
    marginBottom: 20,
  },
  locationList: {
    maxHeight: 300,
  },
  locationOption: {
    backgroundColor: '#f7fafc',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  locationOptionSelected: {
    borderColor: '#667eea',
    backgroundColor: '#ebf4ff',
  },
  locationOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 5,
  },
  locationOptionDesc: {
    fontSize: 14,
    color: '#718096',
  },
  addLocationButton: {
    backgroundColor: '#e6fffa',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 2,
    borderColor: '#38b2ac',
    borderStyle: 'dashed',
  },
  addLocationText: {
    fontSize: 16,
    color: '#38b2ac',
    fontWeight: '600',
  },
  modalCloseButton: {
    backgroundColor: '#667eea',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    marginTop: 20,
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});

export default CreateAlarmScreen;
