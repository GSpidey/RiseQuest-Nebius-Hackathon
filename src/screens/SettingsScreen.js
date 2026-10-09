import { getAuthToken, authHeaders } from '../services/AuthTokenStorage';
import { signInWithApple } from '../services/AppleAuthService';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  Modal,
  FlatList,
  TextInput,
  Image,
  Platform,
  PermissionsAndroid,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LinearGradient from 'react-native-linear-gradient';
import { EmergencyService } from '../utils/EmergencyService';
import { MultiStageService } from '../utils/MultiStageService';
import { LocationService } from '../utils/LocationService';
import { UserProfileService } from '../models/RiseQuestModels';
import { communityService } from '../services/CommunityService';
import { getBackendBaseUrl } from '../config/backendConfig';
import { MonetizationService } from '../utils/MonetizationService';
import { pick, types as docTypes } from '@react-native-documents/picker';
import { clearAccountCaches } from '../services/accountCache';

export default function SettingsScreen({ userProfile, onShowSupport, onShowTerms, onSignOut, onUpdateProfile, onSecretAdmin }) {
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [savingOptionalAds, setSavingOptionalAds] = useState(false);
  const adAccountRef = useRef(userProfile?.email);
  adAccountRef.current = userProfile?.email;
  const saveOptionalAds = async enabled => {
    if (savingOptionalAds) return;
    setSavingOptionalAds(true);
    const owner = userProfile?.email;
    try {
      const saved = await UserProfileService.updateProfile({ preferences: { optionalInlineAds: enabled } });
      if (!saved || saved.preferences?.optionalInlineAds !== enabled) throw new Error('The option could not be saved for this account.');
      if (adAccountRef.current === owner) onUpdateProfile?.(saved);
    } catch (error) { Alert.alert('Optional advertisements', error.message || 'Please try again.'); }
    finally { setSavingOptionalAds(false); }
  };
  const chooseOptionalAds = enabled => {
    if (!enabled) return saveOptionalAds(false);
    Alert.alert('Show optional inline ads?',
      'Premium and your trial stay ad-free by default. This optional choice permits nonpersonalized Google ads only at the bottom of More and in Today’s expanded Explore section. No pop-ups or ads during alarms, challenges or private wellness tools. You can turn this off anytime. Regional consent is separate.',
      [{ text: 'Keep ad-free', style: 'cancel' }, { text: 'Enable optional ads', onPress: () => saveOptionalAds(true) }]);
  };
  const deleteAccount = () => Alert.alert('Delete your RiseQuest account?',
    'This permanently deletes your online profile, preferences, coaching history and managed child profiles. RiseQuest Stripe subscriptions will be canceled without a new charge. Apple and Google subscriptions must be canceled separately in your store settings. Device-local alarms remain until you remove them in Alarms. You must have signed in within the last 10 minutes.', [
      { text: 'Keep account', style: 'cancel' },
      { text: 'Delete account', style: 'destructive', onPress: async () => {
        if (deletingAccount) return;
        setDeletingAccount(true);
        try {
          const response = await fetch(`${await getBackendBaseUrl()}/api/me/delete-account`, {
            method: 'POST', headers: await authHeaders(),
            body: JSON.stringify({ confirmation: 'DELETE', storeSubscriptionsAcknowledged: true }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Deletion could not be requested.');
          const owner = String(userProfile?.email || userProfile?.id || '').toLowerCase();
          await clearAccountCaches(AsyncStorage, [owner, ...(result.cacheOwners || [])]);
          await onSignOut();
          Alert.alert('Deletion requested', `${result.message}\nReference: ${result.reference}`);
        } catch (error) { Alert.alert('Account deletion', error.message); }
        finally { setDeletingAccount(false); }
      } },
    ]);
  const [emergencyContacts, setEmergencyContacts] = useState([]);
  const [locationProfiles, setLocationProfiles] = useState([]);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showContactsList, setShowContactsList] = useState(false);
  const [availableContacts, setAvailableContacts] = useState([]);
  const [settings, setSettings] = useState({
    // Emergency Settings
    enableBackupAlerts: true,
    backupDelay: 10,
    maxMissedAlarms: 3,
    allowBuddyWakeUp: true,
    
    // Multi-Stage Settings
    preWakeEnabled: true,
    preWakeMinutes: 15,
    escalationEnabled: true,
    escalationMinutes: 5,
    emergencyBackup: true,
    
    // AI & Smart Features
    aiCoachEnabled: true,
    weatherIntegration: true,
    locationAwareness: true,
    adaptiveDifficulty: true,
    
    // Sound & Vibration
    gradualVolumeIncrease: true,
    smartVolumeAdjustment: true,
    vibrationPatterns: true,
    
    // Privacy & Data
    dataCollection: true,
    shareAnonymousStats: false,
    cloudSync: false,
  });

  const [communityOptIn, setCommunityOptIn] = useState(Boolean(userProfile?.preferences?.communityOptIn));
  const [communityVisibility, setCommunityVisibility] = useState(String(userProfile?.preferences?.communityVisibility || 'buddies'));
  const [communityTeenSafety, setCommunityTeenSafety] = useState(
    userProfile?.preferences?.communityTeenSafety ?? (userProfile?.ageGroup === 'teen')
  );

  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [editProfile, setEditProfile] = useState(null);
  const [passwordCurrent, setPasswordCurrent] = useState('');
  const [passwordNew, setPasswordNew] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [canUseVoicePacks, setCanUseVoicePacks] = useState(false);

  const [alarmDiag, setAlarmDiag] = useState({
    notifications: 'unknown',
  });

  const aboutTapCountRef = useRef(0);
  const aboutTapTimerRef = useRef(null);

  const readJsonSafe = async (resp) => {
    const text = await resp.text();
    if (!text) return { json: null, text: '' };
    try {
      return { json: JSON.parse(text), text };
    } catch (_) {
      return { json: null, text };
    }
  };

  useEffect(() => {
    setCommunityOptIn(Boolean(userProfile?.preferences?.communityOptIn));
    setCommunityVisibility(String(userProfile?.preferences?.communityVisibility || 'buddies'));
    setCommunityTeenSafety(userProfile?.preferences?.communityTeenSafety ?? (userProfile?.ageGroup === 'teen'));
  }, [userProfile]);

  useEffect(() => {
    if (!showEditProfileModal) return;
    const p = userProfile || {};
    setEditProfile({
      displayName: String(p.displayName || ''),
      phoneNumber: p.phoneNumber ? String(p.phoneNumber) : '',
      ageGroup: String(p.ageGroup || UserProfileService.AGE_GROUPS.ADULT),
      supportEnabled: Boolean(p.supportEnabled),
      supportConditions: Array.isArray(p.supportConditions) ? p.supportConditions : [],
      uiDensity: String(p.preferences?.uiDensity || 'standard'),
      reducedSensory: Boolean(p.preferences?.reducedSensory),
      dyslexiaFriendly: Boolean(p.preferences?.dyslexiaFriendly),
      captionsEnabled: Boolean(p.preferences?.captionsEnabled),
      ttsEnabled: Boolean(p.preferences?.ttsEnabled),
      ttsMode: String(p.preferences?.ttsMode || 'device'),
      ttsVoice: p.preferences?.ttsVoice ? String(p.preferences.ttsVoice) : '',
      analyticsOptIn: p.preferences?.analyticsOptIn === true,
      goals: Array.isArray(p.preferences?.goals) ? p.preferences.goals : [],
      authProvider: p.authProvider ? String(p.authProvider) : null,
    });
    setPasswordCurrent('');
    setPasswordNew('');
    setPasswordConfirm('');
  }, [showEditProfileModal, userProfile]);

  useEffect(() => {
    if (!showEditProfileModal) return;
    MonetizationService.checkFeatureAccess(MonetizationService.PREMIUM_FEATURES.CUSTOM_VOICE_PACKS)
      .then((ok) => setCanUseVoicePacks(Boolean(ok)))
      .catch(() => setCanUseVoicePacks(false));
  }, [showEditProfileModal]);

  const toggleArrayItem = (arr, value) => {
    const list = Array.isArray(arr) ? arr : [];
    return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
  };

  const updateBackendProfile = async ({ displayName, phoneNumber }) => {
    try {
      const token = await getAuthToken();
      if (!token) return;
      const baseUrl = await getBackendBaseUrl();
      const resp = await fetch(`${baseUrl}/api/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          displayName,
          phoneNumber,
        }),
      });
      const { json } = await readJsonSafe(resp);
      if (!resp.ok) {
        throw new Error(json?.error || 'Failed to update backend profile');
      }
      return json?.user || null;
    } catch (e) {
      console.warn('Backend profile update failed:', e);
      return null;
    }
  };

  const refreshAlarmDiagnostics = async () => {
    if (Platform.OS !== 'android') {
      setAlarmDiag({ notifications: 'n/a' });
      return;
    }
    try {
      const ok = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      setAlarmDiag({ notifications: ok ? 'granted' : 'not-granted' });
    } catch (_) {
      setAlarmDiag({ notifications: 'unknown' });
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

  const openNotificationSettings = async () => {
    try {
      await Linking.openSettings();
    } catch (_) {
      // ignore
    }
  };

  const uploadProfileImage = async ({ kind }) => {
    const isAvatar = kind === 'avatar';
    const setBusy = isAvatar ? setUploadingAvatar : setUploadingBanner;

    try {
      const token = await getAuthToken();
      if (!token) {
        Alert.alert('Sign in required', 'Please sign in to update your profile image.');
        return;
      }

      let file;
      try {
        const results = await pick({ type: [docTypes.images], allowMultiSelection: false });
        file = results?.[0];
      } catch (_) {
        return;
      }

      if (!file?.uri) {
        Alert.alert('Profile image', 'Could not read the selected image.');
        return;
      }

      setBusy(true);
      const baseUrl = await getBackendBaseUrl();
      const form = new FormData();
      form.append('file', {
        uri: file.uri,
        name: file.name || `${kind}.jpg`,
        type: file.mimeType || 'image/jpeg',
      });

      const resp = await fetch(`${baseUrl}/api/me/${isAvatar ? 'avatar' : 'banner'}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      });

      const { json, text } = await readJsonSafe(resp);
      if (!resp.ok) {
        throw new Error(json?.error || text || 'Upload failed');
      }

      const url = isAvatar
        ? (json?.photoUrl || json?.url || null)
        : (json?.bannerUrl || json?.url || null);

      const updated = await UserProfileService.updateProfile(isAvatar ? { photoUrl: url } : { bannerUrl: url });
      if (updated && typeof onUpdateProfile === 'function') {
        onUpdateProfile(updated);
      }
      Alert.alert('Profile image', isAvatar ? 'Avatar updated.' : 'Banner updated.');
    } catch (e) {
      Alert.alert('Profile image', e?.message ? String(e.message) : 'Failed to upload image');
    } finally {
      setBusy(false);
    }
  };

  const setOrChangePassword = async () => {
    if (!passwordNew || passwordNew.length < 8) {
      Alert.alert('Password', 'Password must be at least 8 characters.');
      return;
    }
    if (passwordNew !== passwordConfirm) {
      Alert.alert('Password', 'Passwords do not match.');
      return;
    }

    try {
      const token = await getAuthToken();
      if (!token) {
        Alert.alert('Sign in required', 'Please sign in to set a password.');
        return;
      }

      const baseUrl = await getBackendBaseUrl();
      const resp = await fetch(`${baseUrl}/api/auth/set-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          password: passwordNew,
          currentPassword: passwordCurrent || null,
        }),
      });
      const { json, text } = await readJsonSafe(resp);
      if (!resp.ok) {
        if (resp.status === 404) {
          throw new Error('Your backend is missing /api/auth/set-password (needs redeploy).');
        }

        if (!json && typeof text === 'string' && text.trim().startsWith('<')) {
          throw new Error(`Failed to set password (HTTP ${resp.status}). The server returned HTML (likely a missing endpoint or reverse-proxy error).`);
        }
        throw new Error(json?.error || 'Failed to set password');
      }

      Alert.alert('Password', 'Password saved successfully.');
      setPasswordCurrent('');
      setPasswordNew('');
      setPasswordConfirm('');
    } catch (e) {
      Alert.alert('Password', e?.message ? String(e.message) : 'Failed to set password');
    }
  };

  const saveProfileEdits = async () => {
    if (!editProfile) return;
    const displayName = String(editProfile.displayName || '').trim() || 'RiseQuest User';
    const phoneNumber = String(editProfile.phoneNumber || '').trim();

    setSavingProfile(true);
    try {
      const current = await UserProfileService.getUserProfile();
      if (!current) {
        setShowEditProfileModal(false);
        return;
      }

      const mergedPreferences = {
        ...(current.preferences || {}),
        uiDensity: editProfile.uiDensity,
        reducedSensory: Boolean(editProfile.reducedSensory),
        dyslexiaFriendly: Boolean(editProfile.dyslexiaFriendly),
        captionsEnabled: Boolean(editProfile.captionsEnabled),
        ttsEnabled: Boolean(editProfile.ttsEnabled),
        ttsMode: Boolean(editProfile.ttsEnabled) ? String(editProfile.ttsMode || 'device') : 'device',
        ttsVoice:
          Boolean(editProfile.ttsEnabled) && String(editProfile.ttsMode || 'device') === 'cloud'
            ? (String(editProfile.ttsVoice || '').trim() || null)
            : null,
        analyticsOptIn: Boolean(editProfile.analyticsOptIn),
        goals: Array.isArray(editProfile.goals) ? editProfile.goals : [],
      };

      const updated = await UserProfileService.updateProfile({
        displayName,
        phoneNumber: phoneNumber || null,
        ageGroup: editProfile.ageGroup,
        supportEnabled: Boolean(editProfile.supportEnabled),
        supportConditions: Array.isArray(editProfile.supportConditions) ? editProfile.supportConditions : [],
        usageMode: editProfile.supportEnabled ? UserProfileService.USAGE_MODES.SUPPORT : UserProfileService.USAGE_MODES.STANDARD,
        preferences: mergedPreferences,
      });

      const optimistic = updated || {
        ...current,
        displayName,
        phoneNumber: phoneNumber || null,
        ageGroup: editProfile.ageGroup,
        supportEnabled: Boolean(editProfile.supportEnabled),
        supportConditions: Array.isArray(editProfile.supportConditions) ? editProfile.supportConditions : [],
        usageMode: editProfile.supportEnabled ? UserProfileService.USAGE_MODES.SUPPORT : UserProfileService.USAGE_MODES.STANDARD,
        preferences: mergedPreferences,
      };

      if (typeof onUpdateProfile === 'function') {
        onUpdateProfile(optimistic);
      }

      const backendUser = await updateBackendProfile({ displayName, phoneNumber: phoneNumber || null });
      if (backendUser && typeof onUpdateProfile === 'function') {
        const merged = await UserProfileService.updateProfile({
          phoneNumber: backendUser.phoneNumber ?? optimistic.phoneNumber ?? null,
          displayName: backendUser.displayName ?? optimistic.displayName,
          photoUrl: backendUser.photoUrl ?? optimistic.photoUrl ?? null,
          bannerUrl: backendUser.bannerUrl ?? optimistic.bannerUrl ?? null,
        });
        onUpdateProfile(merged || optimistic);
      }

      Alert.alert('Profile', 'Saved successfully.');
      setShowEditProfileModal(false);
    } catch (e) {
      Alert.alert('Edit Profile', e.message || 'Could not save profile changes.');
    } finally {
      setSavingProfile(false);
    }
  };

  const EditProfileModal = () => (
    <Modal visible={showEditProfileModal} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>✏️ Edit Profile</Text>
          <TouchableOpacity style={styles.closeButton} onPress={() => setShowEditProfileModal(false)}>
            <Text style={styles.closeButtonText}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent} keyboardShouldPersistTaps="handled">
          {!editProfile ? null : (
            <>
              <Text style={styles.editSectionTitle}>Profile Media</Text>
              <View style={styles.profileMediaRow}>
                <View style={styles.avatarWrap}>
                  {userProfile?.photoUrl ? (
                    <Image source={{ uri: userProfile.photoUrl }} style={styles.avatarImage} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarPlaceholderText}>🙂</Text>
                    </View>
                  )}
                </View>
                <View style={styles.profileMediaButtons}>
                  <TouchableOpacity
                    style={[styles.mediaButton, (uploadingAvatar || uploadingBanner) && styles.mediaButtonDisabled]}
                    disabled={uploadingAvatar || uploadingBanner}
                    onPress={() => uploadProfileImage({ kind: 'avatar' })}
                  >
                    <Text style={styles.mediaButtonText}>{uploadingAvatar ? 'Uploading…' : 'Change Avatar'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.mediaButton, (uploadingAvatar || uploadingBanner) && styles.mediaButtonDisabled]}
                    disabled={uploadingAvatar || uploadingBanner}
                    onPress={() => uploadProfileImage({ kind: 'banner' })}
                  >
                    <Text style={styles.mediaButtonText}>{uploadingBanner ? 'Uploading…' : 'Change Banner'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.editHint}>Images are selected from your device and saved to your account.</Text>

              <Text style={styles.editLabel}>Display name</Text>
              <TextInput
                value={editProfile.displayName}
                onChangeText={(t) => setEditProfile(prev => ({ ...prev, displayName: t }))}
                style={styles.editInput}
                placeholder="Your name"
              />

              <Text style={styles.editLabel}>Phone number (optional)</Text>
              <TextInput
                value={editProfile.phoneNumber}
                onChangeText={(t) => setEditProfile(prev => ({ ...prev, phoneNumber: t }))}
                style={styles.editInput}
                placeholder="+1..."
                keyboardType="phone-pad"
              />

              <Text style={styles.editSectionTitle}>Accessibility</Text>

              <View style={styles.rowBetween}>
                <Text style={styles.rowLabel}>Reduced sensory mode</Text>
                <Switch
                  value={editProfile.reducedSensory}
                  onValueChange={(v) => setEditProfile(prev => ({ ...prev, reducedSensory: v }))}
                  trackColor={{ false: '#e2e8f0', true: '#667eea' }}
                  thumbColor={editProfile.reducedSensory ? '#ffffff' : '#cbd5e0'}
                />
              </View>
              <View style={styles.rowBetween}>
                <Text style={styles.rowLabel}>Dyslexia-friendly fonts</Text>
                <Switch
                  value={editProfile.dyslexiaFriendly}
                  onValueChange={(v) => setEditProfile(prev => ({ ...prev, dyslexiaFriendly: v }))}
                  trackColor={{ false: '#e2e8f0', true: '#667eea' }}
                  thumbColor={editProfile.dyslexiaFriendly ? '#ffffff' : '#cbd5e0'}
                />
              </View>
              <View style={styles.rowBetween}>
                <Text style={styles.rowLabel}>Captions for audio</Text>
                <Switch
                  value={editProfile.captionsEnabled}
                  onValueChange={(v) => setEditProfile(prev => ({ ...prev, captionsEnabled: v }))}
                  trackColor={{ false: '#e2e8f0', true: '#667eea' }}
                  thumbColor={editProfile.captionsEnabled ? '#ffffff' : '#cbd5e0'}
                />
              </View>

              <View style={styles.rowBetween}>
                <Text style={styles.rowLabel}>Read alarm message aloud</Text>
                <Switch
                  value={Boolean(editProfile.ttsEnabled)}
                  onValueChange={(v) => setEditProfile(prev => ({ ...prev, ttsEnabled: v }))}
                  trackColor={{ false: '#e2e8f0', true: '#667eea' }}
                  thumbColor={editProfile.ttsEnabled ? '#ffffff' : '#cbd5e0'}
                />
              </View>

              {Boolean(editProfile.ttsEnabled) && canUseVoicePacks && (
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.editLabel}>Premium voice (cloud)</Text>
                  <View style={styles.rowBetween}>
                    <Text style={styles.rowLabel}>Use cloud voice</Text>
                    <Switch
                      value={String(editProfile.ttsMode || 'device') === 'cloud'}
                      onValueChange={(v) => setEditProfile(prev => ({
                        ...prev,
                        ttsMode: v ? 'cloud' : 'device',
                        ttsVoice: v ? (prev.ttsVoice || 'en-US-JennyNeural') : '',
                      }))}
                      trackColor={{ false: '#e2e8f0', true: '#667eea' }}
                      thumbColor={String(editProfile.ttsMode || 'device') === 'cloud' ? '#ffffff' : '#cbd5e0'}
                    />
                  </View>

                  {String(editProfile.ttsMode || 'device') === 'cloud' && (
                    <View style={{ marginTop: 8 }}>
                      {[
                        { id: 'en-US-JennyNeural', label: 'Jenny (US)' },
                        { id: 'en-US-GuyNeural', label: 'Guy (US)' },
                        { id: 'en-GB-SoniaNeural', label: 'Sonia (UK)' },
                        { id: 'en-AU-NatashaNeural', label: 'Natasha (AU)' },
                      ].map((v) => (
                        <TouchableOpacity
                          key={v.id}
                          style={[styles.pill, String(editProfile.ttsVoice || '') === v.id && styles.pillActive]}
                          onPress={() => setEditProfile(prev => ({ ...prev, ttsVoice: v.id }))}
                        >
                          <Text style={[styles.pillText, String(editProfile.ttsVoice || '') === v.id && styles.pillTextActive]}>{v.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}

              <Text style={styles.editSectionTitle}>Support</Text>
              <View style={styles.rowBetween}>
                <Text style={styles.rowLabel}>Enable special support</Text>
                <Switch
                  value={editProfile.supportEnabled}
                  onValueChange={(v) => setEditProfile(prev => ({ ...prev, supportEnabled: v }))}
                  trackColor={{ false: '#e2e8f0', true: '#667eea' }}
                  thumbColor={editProfile.supportEnabled ? '#ffffff' : '#cbd5e0'}
                />
              </View>
              {editProfile.supportEnabled && (
                <View style={{ marginTop: 8 }}>
                  {[
                    { id: 'adhd', label: 'ADHD' },
                    { id: 'add', label: 'ADD' },
                    { id: 'bipolar', label: 'Bipolar' },
                    { id: 'general', label: 'General wellness' },
                  ].map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.pill, editProfile.supportConditions.includes(c.id) && styles.pillActive]}
                      onPress={() => setEditProfile(prev => ({
                        ...prev,
                        supportConditions: toggleArrayItem(prev.supportConditions, c.id),
                      }))}
                    >
                      <Text style={[styles.pillText, editProfile.supportConditions.includes(c.id) && styles.pillTextActive]}>{c.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={styles.editSectionTitle}>Goals</Text>
              <View style={{ marginTop: 8 }}>
                {[
                  { id: 'wake_consistency', label: 'Wake consistently' },
                  { id: 'morning_routine', label: 'Morning routine' },
                  { id: 'focus_improvement', label: 'Improve focus' },
                  { id: 'habit_building', label: 'Build habits' },
                  { id: 'mood_tracking', label: 'Track mood & energy' },
                  { id: 'stress_management', label: 'Manage stress' },
                  { id: 'sleep_quality', label: 'Sleep quality' },
                  { id: 'productivity', label: 'Productivity' },
                ].map((g) => (
                  <TouchableOpacity
                    key={g.id}
                    style={[styles.pill, editProfile.goals.includes(g.id) && styles.pillActive]}
                    onPress={() => setEditProfile(prev => ({
                      ...prev,
                      goals: toggleArrayItem(prev.goals, g.id),
                    }))}
                  >
                    <Text style={[styles.pillText, editProfile.goals.includes(g.id) && styles.pillTextActive]}>{g.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.editSectionTitle}>Password</Text>
              {editProfile.authProvider === 'google' && (
                <Text style={styles.editHint}>
                  For account security, set a password so you can sign in without Google if needed.
                </Text>
              )}
              <TextInput
                value={passwordCurrent}
                onChangeText={setPasswordCurrent}
                style={styles.editInput}
                placeholder="Current password (if you already set one)"
                secureTextEntry
              />
              <TextInput
                value={passwordNew}
                onChangeText={setPasswordNew}
                style={styles.editInput}
                placeholder="New password (min 8 chars)"
                secureTextEntry
              />
              <TextInput
                value={passwordConfirm}
                onChangeText={setPasswordConfirm}
                style={styles.editInput}
                placeholder="Confirm new password"
                secureTextEntry
              />
              <TouchableOpacity style={styles.savePasswordButton} onPress={setOrChangePassword}>
                <Text style={styles.savePasswordText}>Save Password</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primarySaveButton, savingProfile && { opacity: 0.7 }]}
                onPress={saveProfileEdits}
                disabled={savingProfile}
              >
                <Text style={styles.primarySaveText}>{savingProfile ? 'Saving…' : 'Save Profile'}</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    setSettings(previous => ({ ...previous, shareAnonymousStats: userProfile?.preferences?.analyticsOptIn === true }));
  }, [userProfile?.email, userProfile?.preferences?.analyticsOptIn]);

  useEffect(() => {
    refreshAlarmDiagnostics();
  }, []);

  const loadSettings = async () => {
    try {
      const contacts = await EmergencyService.getEmergencyContacts();
      setEmergencyContacts(contacts);
      
      const profiles = await LocationService.getLocationProfiles();
      setLocationProfiles(profiles);
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const updateSetting = async (key, value) => {
    if (key === 'shareAnonymousStats') {
      try {
        const saved = await UserProfileService.updateProfile({ preferences: { analyticsOptIn: value } });
        if (!saved) throw new Error('Sign in to save privacy settings.');
        onUpdateProfile?.(saved);
        setSettings(previous => ({ ...previous, shareAnonymousStats: saved.preferences.analyticsOptIn === true }));
      } catch (error) { Alert.alert('Could not save privacy setting', error.message); }
      return;
    }
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const persistCommunityPrefs = async (next) => {
    try {
      const current = await UserProfileService.getUserProfile();
      if (!current) return;

      const mergedPreferences = {
        ...(current.preferences || {}),
        ...(next.preferences || {}),
      };

      // Child accounts: keep community disabled.
      const isChild = current.ageGroup === UserProfileService.AGE_GROUPS.CHILD;
      if (isChild) {
        mergedPreferences.communityOptIn = false;
        mergedPreferences.communityVisibility = 'buddies';
        mergedPreferences.communityTeenSafety = true;
      }

      // Teen safety mode forces private visibility.
      if (mergedPreferences.communityTeenSafety) {
        mergedPreferences.communityVisibility = 'buddies';
      }

      const updated = await UserProfileService.updateProfile({ preferences: mergedPreferences });
      if (updated && typeof onUpdateProfile === 'function') {
        onUpdateProfile(updated);
      }

      // Persist to backend when signed-in.
      if (!updated?.isGuest) {
        const visibility = mergedPreferences.communityVisibility === 'public' ? 'PUBLIC' : 'BUDDIES';
        await communityService.updateSettings({
          optIn: Boolean(mergedPreferences.communityOptIn),
          visibility,
          teenSafety: Boolean(mergedPreferences.communityTeenSafety),
        });
      }
    } catch (error) {
      console.warn('Community settings persist failed:', error);
    }
  };

  const loadContacts = async () => {
    try {
      const contacts = await EmergencyService.getContacts();
      setAvailableContacts(contacts);
      setShowContactsList(true);
    } catch (error) {
      Alert.alert('Error', 'Could not load contacts');
    }
  };

  const addEmergencyContact = async (contact) => {
    try {
      const newContact = await EmergencyService.addEmergencyContact(contact);
      setEmergencyContacts(prev => [...prev, newContact]);
      setShowContactsList(false);
      Alert.alert('Success', `${contact.name} added as emergency contact`);
    } catch (error) {
      Alert.alert('Error', 'Could not add emergency contact');
    }
  };

  const removeEmergencyContact = async (contactId) => {
    Alert.alert(
      'Remove Contact',
      'Are you sure you want to remove this emergency contact?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await EmergencyService.removeEmergencyContact(contactId);
              setEmergencyContacts(prev => prev.filter(c => c.id !== contactId));
            } catch (error) {
              Alert.alert('Error', 'Could not remove contact');
            }
          },
        },
      ]
    );
  };

  const SettingSection = ({ title, children }) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );

  const SettingRow = ({ label, value, onValueChange, description }) => (
    <View style={styles.settingRow}>
      <View style={styles.settingInfo}>
        <Text style={styles.settingLabel}>{label}</Text>
        {description && <Text style={styles.settingDescription}>{description}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#e2e8f0', true: '#667eea' }}
        thumbColor={value ? '#ffffff' : '#cbd5e0'}
      />
    </View>
  );

  const EmergencyContactsModal = () => (
    <Modal
      visible={showEmergencyModal}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>🚨 Emergency Contacts</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setShowEmergencyModal(false)}
          >
            <Text style={styles.closeButtonText}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent}>
          <Text style={styles.modalDescription}>
            Emergency contacts will be notified if you miss critical alarms.
          </Text>

          {emergencyContacts.map((contact) => (
            <View key={contact.id} style={styles.contactCard}>
              <View style={styles.contactInfo}>
                <Text style={styles.contactName}>{contact.name}</Text>
                <Text style={styles.contactPhone}>{contact.phoneNumber}</Text>
                <Text style={styles.contactRelation}>{contact.relationship}</Text>
              </View>
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removeEmergencyContact(contact.id)}
              >
                <Text style={styles.removeButtonText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity
            style={styles.addContactButton}
            onPress={loadContacts}
          >
            <Text style={styles.addContactText}>➕ Add Emergency Contact</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );

  const ContactsListModal = () => (
    <Modal
      visible={showContactsList}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Select Contact</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setShowContactsList(false)}
          >
            <Text style={styles.closeButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={availableContacts}
          keyExtractor={(item) => String(item.id || item.recordID || item.primaryNumber || Math.random())}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.contactItem}
              onPress={() => addEmergencyContact(item)}
            >
              <Text style={styles.contactItemName} numberOfLines={1}>
                {String(item.name || item.displayName || '').trim() || 'Unknown'}
              </Text>
              <Text style={styles.contactItemPhone} numberOfLines={1}>
                {String(item.primaryNumber || item.phoneNumbers?.[0]?.number || '').trim()}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );

  return (
    <LinearGradient colors={['#667eea', '#764ba2']} style={styles.container}>
      <ScrollView style={styles.content}>
        {EditProfileModal()}
        {/* User Profile Section */}
        {userProfile && (
          <SettingSection title="👤 Profile">
            <View style={styles.profileCard}>
              <Text style={styles.profileName}>{userProfile.displayName}</Text>
              <Text style={styles.profileEmail}>{userProfile.email}</Text>
              {!!userProfile.phoneNumber && (
                <Text style={styles.profileEmail}>{userProfile.phoneNumber}</Text>
              )}
              <Text style={styles.profileAge}>
                Age Group: {userProfile.ageGroup} 
                {userProfile.supportEnabled && ' • Support Mode Active'}
              </Text>
            </View>
            
            <TouchableOpacity style={styles.actionRow} onPress={() => {
              setShowEditProfileModal(true);
            }}>
              <Text style={styles.actionLabel}>✏️ Edit Profile</Text>
              <Text style={styles.actionSubtext}>Update your information</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.actionRow} onPress={() => {
              if (typeof onShowSupport === 'function') {
                onShowSupport();
              }
            }}>
              <Text style={styles.actionLabel}>🧠 Support Settings</Text>
              <Text style={styles.actionSubtext}>
                {userProfile.supportEnabled ? 'Manage ADHD/bipolar features' : 'Enable support features'}
              </Text>
            </TouchableOpacity>
          </SettingSection>
        )}

        <SettingSection title="⏱️ Alarm Diagnostics">
          <View style={styles.profileCard}>
            <Text style={styles.profileEmail}>Notifications: {alarmDiag.notifications}</Text>
            <Text style={styles.profileEmail}>Exact alarms: requires Android special access</Text>
            <TouchableOpacity style={styles.diagnosticButton} onPress={openNotificationSettings}>
              <Text style={styles.diagnosticButtonText}>Open notification settings</Text>
            </TouchableOpacity>
            {Platform.OS === 'android' && (
              <TouchableOpacity style={styles.diagnosticButton} onPress={openExactAlarmSettings}>
                <Text style={styles.diagnosticButtonText}>Enable “Alarms & reminders”</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.diagnosticLink} onPress={refreshAlarmDiagnostics}>
              <Text style={styles.diagnosticLinkText}>Refresh diagnostics</Text>
            </TouchableOpacity>
          </View>
        </SettingSection>

        {/* Emergency & Backup */}
        <SettingSection title="🚨 Emergency & Backup">
          <SettingRow
            label="Emergency Backup Alerts"
            value={settings.enableBackupAlerts}
            onValueChange={(value) => updateSetting('enableBackupAlerts', value)}
            description="Contact emergency contacts if you miss critical alarms"
          />
          
          <TouchableOpacity
            style={styles.configButton}
            onPress={() => setShowEmergencyModal(true)}
          >
            <Text style={styles.configButtonText}>
              📞 Emergency Contacts ({emergencyContacts.length})
            </Text>
            <Text style={styles.configButtonArrow}>➤</Text>
          </TouchableOpacity>

          <SettingRow
            label="Buddy Wake-Up System"
            value={settings.allowBuddyWakeUp}
            onValueChange={(value) => updateSetting('allowBuddyWakeUp', value)}
            description="Allow RiseQuest friends to send you wake-up calls"
          />
        </SettingSection>

        {/* Multi-Stage Alarms */}
        <SettingSection title="📅 Multi-Stage Alarms">
          <SettingRow
            label="Pre-Wake Gentle Chimes"
            value={settings.preWakeEnabled}
            onValueChange={(value) => updateSetting('preWakeEnabled', value)}
            description="Gentle sounds 15 minutes before main alarm"
          />
          
          <SettingRow
            label="Escalation Alerts"
            value={settings.escalationEnabled}
            onValueChange={(value) => updateSetting('escalationEnabled', value)}
            description="Louder alarms if you don't wake up"
          />
          
          <SettingRow
            label="Emergency Backup Stage"
            value={settings.emergencyBackup}
            onValueChange={(value) => updateSetting('emergencyBackup', value)}
            description="Final stage alerts emergency contacts"
          />
        </SettingSection>

        {/* AI & Smart Features */}
        <SettingSection title="🤖 AI & Smart Features">
          <SettingRow
            label="AI Motivational Coach"
            value={settings.aiCoachEnabled}
            onValueChange={(value) => updateSetting('aiCoachEnabled', value)}
            description="Personalized motivational messages"
          />
          
          <SettingRow
            label="Weather Integration"
            value={settings.weatherIntegration}
            onValueChange={(value) => updateSetting('weatherIntegration', value)}
            description="Weather-based wake-up advice"
          />
          
          <SettingRow
            label="Location Awareness"
            value={settings.locationAwareness}
            onValueChange={(value) => updateSetting('locationAwareness', value)}
            description="Adapt alarms based on your location"
          />
          
          <TouchableOpacity
            style={styles.configButton}
            onPress={() => setShowLocationModal(true)}
          >
            <Text style={styles.configButtonText}>
              📍 Location Profiles ({locationProfiles.length})
            </Text>
            <Text style={styles.configButtonArrow}>➤</Text>
          </TouchableOpacity>
        </SettingSection>

        {/* Sound & Experience */}
        <SettingSection title="🔊 Sound & Experience">
          <SettingRow
            label="Gradual Volume Increase"
            value={settings.gradualVolumeIncrease}
            onValueChange={(value) => updateSetting('gradualVolumeIncrease', value)}
            description="Start quiet and gradually get louder"
          />
          
          <SettingRow
            label="Smart Volume Adjustment"
            value={settings.smartVolumeAdjustment}
            onValueChange={(value) => updateSetting('smartVolumeAdjustment', value)}
            description="Adjust volume based on environment"
          />
          
          <SettingRow
            label="Adaptive Difficulty"
            value={settings.adaptiveDifficulty}
            onValueChange={(value) => updateSetting('adaptiveDifficulty', value)}
            description="Challenge difficulty adapts to your performance"
          />
        </SettingSection>

        <SettingSection title="👥 Community">
          {userProfile?.ageGroup === UserProfileService.AGE_GROUPS.CHILD ? (
            <View style={styles.profileCard}>
              <Text style={styles.settingLabel}>Community is disabled for child accounts</Text>
              <Text style={styles.settingDescription}>
                This keeps the experience safe. Teen and adult accounts can opt in.
              </Text>
            </View>
          ) : (
            <>
              <SettingRow
                label="Enable Community"
                value={communityOptIn}
                onValueChange={async (value) => {
                  const next = Boolean(value);
                  setCommunityOptIn(next);
                  await persistCommunityPrefs({ preferences: { communityOptIn: next } });
                }}
                description="Buddies, support circles, encouragement feed, and messaging"
              />

              {communityOptIn && (
                <View style={[styles.settingRow, { alignItems: 'flex-start' }]}>
                  <View style={styles.settingInfo}>
                    <Text style={styles.settingLabel}>Default Visibility</Text>
                    <Text style={styles.settingDescription}>
                      Private posts are visible to buddies. Public posts are visible to all RiseQuest users.
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row' }}>
                    <TouchableOpacity
                      style={[
                        styles.visibilityChip,
                        { marginRight: 8 },
                        communityVisibility === 'buddies' && styles.visibilityChipActive,
                      ]}
                      onPress={async () => {
                        setCommunityVisibility('buddies');
                        await persistCommunityPrefs({ preferences: { communityVisibility: 'buddies' } });
                      }}
                    >
                      <Text style={styles.visibilityChipText}>🔒 Buddies</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      disabled={Boolean(communityTeenSafety)}
                      style={[
                        styles.visibilityChip,
                        communityVisibility === 'public' && styles.visibilityChipActive,
                        communityTeenSafety && { opacity: 0.5 },
                      ]}
                      onPress={async () => {
                        setCommunityVisibility('public');
                        await persistCommunityPrefs({ preferences: { communityVisibility: 'public' } });
                      }}
                    >
                      <Text style={styles.visibilityChipText}>🌍 Public</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {userProfile?.ageGroup === UserProfileService.AGE_GROUPS.TEEN && communityOptIn && (
                <SettingRow
                  label="Teen Safety Mode"
                  value={Boolean(communityTeenSafety)}
                  onValueChange={async (value) => {
                    const next = Boolean(value);
                    setCommunityTeenSafety(next);
                    if (next) setCommunityVisibility('buddies');
                    await persistCommunityPrefs({
                      preferences: {
                        communityTeenSafety: next,
                        ...(next ? { communityVisibility: 'buddies' } : {}),
                      },
                    });
                  }}
                  description="Disables public posting and keeps community activity buddy-only"
                />
              )}
            </>
          )}
        </SettingSection>

        {/* Privacy & Data */}
        <SettingSection title="🔒 Privacy & Data">
          {!userProfile?.isGuest && userProfile?.ageGroup === 'adult' && userProfile?.ageBand === 'adult' && (
            <SettingRow label="Show optional unobtrusive ads"
              value={userProfile?.preferences?.optionalInlineAds === true}
              onValueChange={chooseOptionalAds}
              description={savingOptionalAds ? 'Saving…' : 'For Premium and trial accounts: off by default. Only inline More/Explore ads; no interruptions. Regional consent is separate.'} />
          )}
          <TouchableOpacity style={styles.actionRow} accessibilityRole="button" onPress={async () => {
            try {
              if (userProfile?.isGuest) {
                Alert.alert('Advertising privacy', 'Guests receive no ads. Sign in to review saved account privacy choices.');
                return;
              }
              const response = await fetch(`${await getBackendBaseUrl()}/api/me/preferences`, { headers: await authHeaders() });
              const result = await response.json();
              if (!response.ok) throw new Error('Could not load your privacy choices.');
              if (result.profile?.ageGroup !== 'adult' || result.profile?.ageBand !== 'adult') {
                Alert.alert('Advertising privacy', 'No personalized advertising is used. Parents manage child-directed advertising permissions in Family profiles. Adult regional consent forms are not requested for children or unknown-age accounts.');
                return;
              }
              const { AdsConsent } = require('react-native-google-mobile-ads');
              const info = await AdsConsent.getConsentInfo();
              if (info.privacyOptionsRequirementStatus === 'REQUIRED') await AdsConsent.showPrivacyOptionsForm();
              else {
                // An explicit privacy-settings visit can collect consent even
                // for an ad-free member. It never initializes or requests ads.
                const updated = await AdsConsent.gatherConsent({ tagForUnderAgeOfConsent: false });
                if (updated.privacyOptionsRequirementStatus !== 'REQUIRED') Alert.alert('Advertising privacy', 'No regional consent form is currently required. Reviewing privacy choices does not enable ads. Premium and trial accounts remain ad-free unless you explicitly enable optional inline ads. RiseQuest never uses wellness information for advertising.');
              }
            } catch (error) { Alert.alert('Advertising privacy', error.message || 'Please try again.'); }
          }}><Text style={styles.actionLabel}>Advertising Privacy Choices</Text>
            <Text style={styles.actionSubtext}>Review applicable consent choices</Text></TouchableOpacity>
          <SettingRow
            label="Anonymous Usage Stats"
            value={settings.shareAnonymousStats}
            onValueChange={(value) => updateSetting('shareAnonymousStats', value)}
            description="Help improve RiseQuest with anonymous data"
          />
          
          <SettingRow
            label="Cloud Sync (Coming Soon)"
            value={settings.cloudSync}
            onValueChange={(value) => updateSetting('cloudSync', value)}
            description="Sync your alarms and stats across devices"
          />
        </SettingSection>

        {/* Support & Legal */}
        <SettingSection title="🛠️ Support & Legal">
          {Platform.OS === 'ios' && !userProfile?.isGuest && userProfile?.authProvider !== 'child' && <TouchableOpacity
            style={styles.actionRow} accessibilityRole="button" onPress={async () => {
              try { await signInWithApple({ link: true }); Alert.alert('Apple linked', 'You can now sign in to this RiseQuest account with Apple.'); }
              catch (error) { if (error.code !== '1001') Alert.alert('Link Apple', error.message || 'Please try again.'); }
            }}>
            <Text style={styles.actionLabel}>Link Sign in with Apple</Text>
            <Text style={styles.actionSubtext}>Keep the same account, saved settings and purchases</Text>
          </TouchableOpacity>}
          <TouchableOpacity style={styles.actionRow} onPress={onShowSupport}>
            <Text style={styles.actionLabel}>🎧 Contact Support</Text>
            <Text style={styles.actionSubtext}>Get help with RiseQuest</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionRow} onPress={onShowTerms}>
            <Text style={styles.actionLabel}>📋 Terms & Conditions</Text>
            <Text style={styles.actionSubtext}>View our terms of service</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.actionRow} 
            onPress={async () => {
              try { await Linking.openURL(`${await getBackendBaseUrl()}/legal/privacy`); }
              catch (_) { Alert.alert('Could not open privacy policy', 'Please check your connection.'); }
            }}
          >
            <Text style={styles.actionLabel}>🔒 Privacy Policy</Text>
            <Text style={styles.actionSubtext}>How we protect your data</Text>
          </TouchableOpacity>
          {!userProfile?.isGuest && userProfile?.authProvider !== 'child' && <TouchableOpacity
            accessibilityRole="button" style={styles.actionRow} disabled={deletingAccount} onPress={deleteAccount}>
            <Text style={[styles.actionLabel, { color: '#A52525' }]}>{deletingAccount ? 'Requesting deletion…' : 'Delete Account'}</Text>
            <Text style={styles.actionSubtext}>Delete your online data and managed child profiles</Text>
          </TouchableOpacity>}
          
          <TouchableOpacity 
            style={styles.actionRow} 
            onPress={() => Alert.alert('Rate RiseQuest', 'This would open the app store for rating')}
          >
            <Text style={styles.actionLabel}>⭐ Rate Our App</Text>
            <Text style={styles.actionSubtext}>Love RiseQuest? Leave a review!</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.actionRow, { borderBottomWidth: 0 }]} 
            onPress={() => {
              Alert.alert(
                'Sign Out',
                'Are you sure you want to sign out? Your data will be saved locally.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Sign Out', style: 'destructive', onPress: onSignOut }
                ]
              );
            }}
          >
            <Text style={[styles.actionLabel, { color: '#ff6b6b' }]}>🚪 Sign Out</Text>
            <Text style={styles.actionSubtext}>Sign out of your account</Text>
          </TouchableOpacity>
        </SettingSection>

        {/* About */}
        <View style={styles.aboutSection}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {
              // Hidden admin entry: tap the About title 10x within 8 seconds.
              // No UI affordance; non-admin users won't see anything.
              try {
                aboutTapCountRef.current += 1;
                if (aboutTapTimerRef.current) {
                  clearTimeout(aboutTapTimerRef.current);
                }
                aboutTapTimerRef.current = setTimeout(() => {
                  aboutTapCountRef.current = 0;
                  aboutTapTimerRef.current = null;
                }, 8000);

                if (aboutTapCountRef.current >= 10) {
                  aboutTapCountRef.current = 0;
                  if (aboutTapTimerRef.current) {
                    clearTimeout(aboutTapTimerRef.current);
                    aboutTapTimerRef.current = null;
                  }
                  if (typeof onSecretAdmin === 'function') {
                    onSecretAdmin();
                  }
                }
              } catch (_) {
                // ignore
              }
            }}
          >
            <Text style={styles.aboutTitle}>About RiseQuest</Text>
          </TouchableOpacity>
          <Text style={styles.aboutText}>
            Version 1.0.0 • Built with ❤️ for better mornings
          </Text>
          <Text style={styles.aboutDescription}>
            Transform your wake-up routine with gamified alarms, AI coaching, 
            and smart features that make mornings an adventure!
          </Text>
        </View>
      </ScrollView>

      <EmergencyContactsModal />
      <ContactsListModal />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 20,
  },

  editLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 12,
    marginBottom: 6,
  },
  editInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  editSectionTitle: {
    marginTop: 18,
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
  },
  editHint: {
    marginTop: 8,
    fontSize: 13,
    color: '#475569',
  },
  profileMediaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  avatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  avatarImage: {
    width: 64,
    height: 64,
  },
  avatarPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderText: {
    fontSize: 28,
  },
  profileMediaButtons: {
    flex: 1,
    marginLeft: 12,
  },
  mediaButton: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  mediaButtonDisabled: {
    opacity: 0.6,
  },
  mediaButtonText: {
    color: '#fff',
    fontWeight: '900',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  rowLabel: {
    flex: 1,
    paddingRight: 12,
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '700',
  },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  pillActive: {
    backgroundColor: '#e0e7ff',
    borderColor: '#c7d2fe',
  },
  pillText: {
    color: '#0f172a',
    fontWeight: '800',
    fontSize: 13,
  },
  pillTextActive: {
    color: '#1e293b',
  },
  savePasswordButton: {
    marginTop: 10,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  savePasswordText: {
    color: '#fff',
    fontWeight: '900',
  },
  primarySaveButton: {
    marginTop: 16,
    backgroundColor: '#667eea',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 30,
  },
  primarySaveText: {
    color: '#fff',
    fontWeight: '900',
  },
  diagnosticButton: {
    marginTop: 10,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  diagnosticButtonText: {
    color: '#fff',
    fontWeight: '900',
  },
  diagnosticLink: {
    marginTop: 10,
    alignItems: 'center',
  },
  diagnosticLinkText: {
    color: '#667eea',
    fontWeight: '900',
  },
  section: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 15,
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 15,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  settingInfo: {
    flex: 1,
    marginRight: 15,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
  configButton: {
  visibilityChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  visibilityChipActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  visibilityChipText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 12,
  },
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    padding: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 8,
  },
  configButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  configButtonArrow: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2d3748',
  },
  closeButton: {
    backgroundColor: '#667eea',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  closeButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  modalDescription: {
    fontSize: 16,
    color: '#4a5568',
    marginBottom: 20,
    textAlign: 'center',
  },
  contactCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2d3748',
  },
  contactPhone: {
    fontSize: 14,
    color: '#4a5568',
    marginTop: 2,
  },
  contactRelation: {
    fontSize: 12,
    color: '#718096',
    marginTop: 2,
  },
  removeButton: {
    backgroundColor: '#fed7d7',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  removeButtonText: {
    color: '#e53e3e',
    fontWeight: '600',
    fontSize: 12,
  },
  addContactButton: {
    backgroundColor: '#e6fffa',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 2,
    borderColor: '#38b2ac',
    borderStyle: 'dashed',
  },
  addContactText: {
    fontSize: 16,
    color: '#38b2ac',
    fontWeight: '600',
  },
  contactItem: {
    backgroundColor: '#fff',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  contactItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3748',
  },
  contactItemPhone: {
    fontSize: 14,
    color: '#4a5568',
    marginTop: 2,
  },
  aboutSection: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 15,
    padding: 20,
    alignItems: 'center',
    marginBottom: 40,
  },
  aboutTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  aboutText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 15,
  },
  aboutDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 20,
  },
  actionRow: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  actionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  actionSubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  
  // Profile Styles
  profileCard: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
  },
  profileName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  profileEmail: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 5,
  },
  profileAge: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
});
