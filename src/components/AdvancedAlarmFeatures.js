import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Modal,
  FlatList,
  Alert,
  Dimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Sound from 'react-native-sound';
import { pick, types, isCancel } from '@react-native-documents/picker';

const { width } = Dimensions.get('window');

/**
 * Advanced Alarm Features Component
 * Comprehensive alarm customization with all premium features
 */
export const AdvancedAlarmFeatures = ({ 
  alarmData, 
  onUpdateAlarm, 
  userProfile,
  subscription 
}) => {
  const [localAlarmData, setLocalAlarmData] = useState(() => ({
    selectedTone: 'gentle_wake',
    startVolume: 0.3,
    maxVolume: 0.9,
    volumeCurve: 'standard',
    weatherEnabled: false,
    weatherConditions: [],
    multiStageEnabled: false,
    stages: { vibration: true, light: true, gentle: true },
  }));

  const effectiveAlarmData = alarmData && typeof onUpdateAlarm === 'function' ? alarmData : localAlarmData;
  const updateAlarm = (next) => {
    if (typeof onUpdateAlarm === 'function') {
      onUpdateAlarm(next);
    } else {
      setLocalAlarmData(next);
    }
  };

  const effectiveSubscription = subscription || { tier: 'free' };
  const isPremiumTier = ['premium', 'trial', 'family'].includes(String(effectiveSubscription?.tier || 'free'));
  const [showToneSelector, setShowToneSelector] = useState(false);
  const [showVolumeConfig, setShowVolumeConfig] = useState(false);
  const [showWeatherConfig, setShowWeatherConfig] = useState(false);
  const [showMultiStageConfig, setShowMultiStageConfig] = useState(false);
  const [customTones, setCustomTones] = useState([]);
  const [playingTone, setPlayingTone] = useState(null);

  const defaultTones = [
    { id: 'gentle_wake', name: 'Gentle Wake', file: 'gentle_wake.mp3', premium: false },
    { id: 'nature_birds', name: 'Nature Birds', file: 'nature_birds.mp3', premium: false },
    { id: 'ocean_waves', name: 'Ocean Waves', file: 'ocean_waves.mp3', premium: true },
    { id: 'rain_forest', name: 'Rain Forest', file: 'rain_forest.mp3', premium: true },
    { id: 'motivational_speech', name: 'Motivational Speech', file: 'motivational.mp3', premium: true },
    { id: 'custom_music', name: 'Custom Music', file: null, premium: true },
  ];

  const volumeCurves = [
    { id: 'gentle', name: 'Gentle Rise', description: 'Gradually increases over 2 minutes' },
    { id: 'standard', name: 'Standard', description: 'Normal volume increase' },
    { id: 'urgent', name: 'Urgent', description: 'Quick volume increase for important alarms' },
    { id: 'custom', name: 'Custom Curve', description: 'Design your own volume pattern' },
  ];

  const weatherConditions = [
    { id: 'rain', name: 'Rainy Weather', earlyMinutes: 15, message: 'Extra time for rainy conditions' },
    { id: 'snow', name: 'Snow/Ice', earlyMinutes: 30, message: 'Extra time for winter conditions' },
    { id: 'traffic', name: 'Heavy Traffic', earlyMinutes: 20, message: 'Traffic-aware wake-up' },
    { id: 'events', name: 'Special Events', earlyMinutes: 25, message: 'Event day preparation time' },
  ];

  useEffect(() => {
    loadCustomTones();
  }, []);

  const loadCustomTones = async () => {
    // In production, load user's custom uploaded tones
    setCustomTones([]);
  };

  const ToneSelector = () => (
    <Modal visible={showToneSelector} animationType="slide">
      <LinearGradient colors={['#667eea', '#764ba2']} style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>🎵 Choose Wake-Up Tone</Text>
          <TouchableOpacity onPress={() => setShowToneSelector(false)}>
            <Text style={styles.closeButton}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent}>
          <Text style={styles.sectionTitle}>Default Tones</Text>
          {defaultTones.map(tone => (
            <TouchableOpacity
              key={tone.id}
              style={[
                styles.toneItem,
                effectiveAlarmData.selectedTone === tone.id && styles.toneItemSelected
              ]}
              onPress={() => selectTone(tone)}
            >
              <View style={styles.toneInfo}>
                <Text style={styles.toneName}>{tone.name}</Text>
                {tone.premium && (
                  <Text style={styles.premiumBadge}>👑 Premium</Text>
                )}
              </View>
              <View style={styles.toneActions}>
                <TouchableOpacity
                  style={styles.playButton}
                  onPress={() => playTonePreview(tone)}
                >
                  <Text style={styles.playButtonText}>▶️</Text>
                </TouchableOpacity>
                {effectiveAlarmData.selectedTone === tone.id && (
                  <Text style={styles.selectedIcon}>✓</Text>
                )}
              </View>
            </TouchableOpacity>
          ))}

          {isPremiumTier && (
            <>
              <Text style={styles.sectionTitle}>Custom Tones</Text>
              <TouchableOpacity
                style={styles.uploadButton}
                onPress={uploadCustomTone}
              >
                <Text style={styles.uploadButtonText}>📁 Upload Custom Tone</Text>
              </TouchableOpacity>
              
              {customTones.map(tone => (
                <TouchableOpacity
                  key={tone.id}
                  style={[
                    styles.toneItem,
                    effectiveAlarmData.selectedTone === tone.id && styles.toneItemSelected
                  ]}
                  onPress={() => selectTone(tone)}
                >
                  <Text style={styles.toneName}>{tone.name}</Text>
                  <TouchableOpacity
                    style={styles.playButton}
                    onPress={() => playTonePreview(tone)}
                  >
                    <Text style={styles.playButtonText}>▶️</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </>
          )}
        </ScrollView>
      </LinearGradient>
    </Modal>
  );

  const VolumeConfiguration = () => (
    <Modal visible={showVolumeConfig} animationType="slide">
      <LinearGradient colors={['#667eea', '#764ba2']} style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>🔊 Volume Configuration</Text>
          <TouchableOpacity onPress={() => setShowVolumeConfig(false)}>
            <Text style={styles.closeButton}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent}>
          <View style={styles.volumeSection}>
            <Text style={styles.sectionTitle}>Starting Volume</Text>
            <View style={styles.volumeRow}>
              <TouchableOpacity
                style={styles.volumeStep}
                onPress={() => updateAlarm({ ...effectiveAlarmData, startVolume: Math.max(0.1, Number(effectiveAlarmData.startVolume || 0.3) - 0.1) })}
              >
                <Text style={styles.volumeStepText}>-</Text>
              </TouchableOpacity>
              <Text style={styles.volumeLabel}>
                {Math.round((effectiveAlarmData.startVolume || 0.3) * 100)}%
              </Text>
              <TouchableOpacity
                style={styles.volumeStep}
                onPress={() => updateAlarm({ ...effectiveAlarmData, startVolume: Math.min(1.0, Number(effectiveAlarmData.startVolume || 0.3) + 0.1) })}
              >
                <Text style={styles.volumeStepText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.volumeSection}>
            <Text style={styles.sectionTitle}>Maximum Volume</Text>
            <View style={styles.volumeRow}>
              <TouchableOpacity
                style={styles.volumeStep}
                onPress={() => updateAlarm({ ...effectiveAlarmData, maxVolume: Math.max(0.3, Number(effectiveAlarmData.maxVolume || 0.8) - 0.1) })}
              >
                <Text style={styles.volumeStepText}>-</Text>
              </TouchableOpacity>
              <Text style={styles.volumeLabel}>
                {Math.round((effectiveAlarmData.maxVolume || 0.8) * 100)}%
              </Text>
              <TouchableOpacity
                style={styles.volumeStep}
                onPress={() => updateAlarm({ ...effectiveAlarmData, maxVolume: Math.min(1.0, Number(effectiveAlarmData.maxVolume || 0.8) + 0.1) })}
              >
                <Text style={styles.volumeStepText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Volume Curve</Text>
          {volumeCurves.map(curve => (
            <TouchableOpacity
              key={curve.id}
              style={[
                styles.curveItem,
                effectiveAlarmData.volumeCurve === curve.id && styles.curveItemSelected
              ]}
              onPress={() => 
                updateAlarm({ ...effectiveAlarmData, volumeCurve: curve.id })
              }
            >
              <View>
                <Text style={styles.curveName}>{curve.name}</Text>
                <Text style={styles.curveDescription}>{curve.description}</Text>
              </View>
              {effectiveAlarmData.volumeCurve === curve.id && (
                <Text style={styles.selectedIcon}>✓</Text>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </LinearGradient>
    </Modal>
  );

  const WeatherConfiguration = () => (
    <Modal visible={showWeatherConfig} animationType="slide">
      <LinearGradient colors={['#667eea', '#764ba2']} style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>🌤️ Weather Integration</Text>
          <TouchableOpacity onPress={() => setShowWeatherConfig(false)}>
            <Text style={styles.closeButton}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent}>
          <View style={styles.settingItem}>
            <View>
              <Text style={styles.settingLabel}>Enable Weather Alerts</Text>
              <Text style={styles.settingDescription}>
                Adjust wake-up time based on weather conditions
              </Text>
            </View>
            <Switch
              value={effectiveAlarmData.weatherEnabled}
              onValueChange={(value) =>
                updateAlarm({ ...effectiveAlarmData, weatherEnabled: value })
              }
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={effectiveAlarmData.weatherEnabled ? '#f5dd4b' : '#f4f3f4'}
            />
          </View>

          {effectiveAlarmData.weatherEnabled && (
            <>
              <Text style={styles.sectionTitle}>Weather Conditions</Text>
              {weatherConditions.map(condition => (
                <TouchableOpacity
                  key={condition.id}
                  style={[
                    styles.weatherItem,
                    effectiveAlarmData.weatherConditions?.includes(condition.id) && styles.weatherItemSelected
                  ]}
                  onPress={() => toggleWeatherCondition(condition.id)}
                >
                  <View>
                    <Text style={styles.weatherName}>{condition.name}</Text>
                    <Text style={styles.weatherMessage}>
                      +{condition.earlyMinutes} min • {condition.message}
                    </Text>
                  </View>
                  {effectiveAlarmData.weatherConditions?.includes(condition.id) && (
                    <Text style={styles.selectedIcon}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </>
          )}
        </ScrollView>
      </LinearGradient>
    </Modal>
  );

  const MultiStageConfiguration = () => (
    <Modal visible={showMultiStageConfig} animationType="slide">
      <LinearGradient colors={['#667eea', '#764ba2']} style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>🎯 Multi-Stage Wake-Up</Text>
          <TouchableOpacity onPress={() => setShowMultiStageConfig(false)}>
            <Text style={styles.closeButton}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent}>
          <View style={styles.settingItem}>
            <View>
              <Text style={styles.settingLabel}>Enable Multi-Stage</Text>
              <Text style={styles.settingDescription}>
                Gentle pre-wake alerts before main alarm
              </Text>
            </View>
            <Switch
              value={effectiveAlarmData.multiStageEnabled}
              onValueChange={(value) =>
                updateAlarm({ ...effectiveAlarmData, multiStageEnabled: value })
              }
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={effectiveAlarmData.multiStageEnabled ? '#f5dd4b' : '#f4f3f4'}
            />
          </View>

          {effectiveAlarmData.multiStageEnabled && (
            <>
              <Text style={styles.sectionTitle}>Pre-Wake Stages</Text>
              
              <View style={styles.stageItem}>
                <Text style={styles.stageName}>Gentle Vibration</Text>
                <Text style={styles.stageTime}>-15 minutes</Text>
                <Switch
                  value={effectiveAlarmData.stages?.vibration}
                  onValueChange={(value) => updateStage('vibration', value)}
                />
              </View>

              <View style={styles.stageItem}>
                <Text style={styles.stageName}>Soft Light Simulation</Text>
                <Text style={styles.stageTime}>-10 minutes</Text>
                <Switch
                  value={effectiveAlarmData.stages?.light}
                  onValueChange={(value) => updateStage('light', value)}
                />
              </View>

              <View style={styles.stageItem}>
                <Text style={styles.stageName}>Gentle Sound</Text>
                <Text style={styles.stageTime}>-5 minutes</Text>
                <Switch
                  value={effectiveAlarmData.stages?.gentle}
                  onValueChange={(value) => updateStage('gentle', value)}
                />
              </View>

              <View style={styles.stageItem}>
                <Text style={styles.stageName}>Main Alarm</Text>
                <Text style={styles.stageTime}>Target time</Text>
                <Text style={styles.stageEnabled}>✓ Always Active</Text>
              </View>
            </>
          )}
        </ScrollView>
      </LinearGradient>
    </Modal>
  );

  const selectTone = (tone) => {
    if (tone.premium && !isPremiumTier) {
      Alert.alert(
        'Premium Feature',
        'This tone requires a premium subscription. Would you like to upgrade?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', onPress: () => {/* Navigate to upgrade */} }
        ]
      );
      return;
    }

    updateAlarm({ ...effectiveAlarmData, selectedTone: tone.id });
    setShowToneSelector(false);
  };

  const playTonePreview = async (tone) => {
    try {
      if (playingTone) {
        playingTone.stop();
        playingTone.release();
      }

      if (!tone.file) {
        Alert.alert('Preview unavailable', 'This tone does not have a preview file yet.');
        return;
      }

      Sound.setCategory('Playback');
      const sound = new Sound(tone.file, undefined, (error) => {
        if (error) {
          console.error('Error loading tone preview:', error);
          Alert.alert('Preview failed', 'Unable to play this tone preview.');
          return;
        }
        setPlayingTone(sound);
        sound.play((success) => {
          sound.release();
          setPlayingTone(null);
          if (!success) {
            console.warn('Tone preview playback failed');
          }
        });
      });
    } catch (error) {
      console.error('Error playing tone preview:', error);
    }
  };

  const uploadCustomTone = async () => {
    try {
      const results = await pick({
        type: [types.audio],
        copyTo: 'cachesDirectory',
      });

      const result = Array.isArray(results) ? results[0] : results;
      const uri = result?.fileCopyUri || result?.uri;
      if (!uri) return;

      const newTone = {
        id: `custom_${Date.now()}`,
        name: result?.name || 'Custom Tone',
        file: uri,
        custom: true,
      };
      setCustomTones([...customTones, newTone]);
      Alert.alert('Success', 'Custom tone uploaded successfully!');
    } catch (error) {
      if (isCancel(error)) {
        return;
      }
      Alert.alert('Error', 'Failed to upload custom tone');
    }
  };

  const toggleWeatherCondition = (conditionId) => {
    const conditions = effectiveAlarmData.weatherConditions || [];
    const updated = conditions.includes(conditionId)
      ? conditions.filter(id => id !== conditionId)
      : [...conditions, conditionId];
    
    updateAlarm({ ...effectiveAlarmData, weatherConditions: updated });
  };

  const updateStage = (stage, enabled) => {
    const stages = { ...effectiveAlarmData.stages, [stage]: enabled };
    updateAlarm({ ...effectiveAlarmData, stages });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎵 Advanced Alarm Features</Text>

      {/* Tone Selection */}
      <TouchableOpacity
        style={styles.featureButton}
        onPress={() => setShowToneSelector(true)}
      >
        <View style={styles.featureInfo}>
          <Text style={styles.featureLabel}>Wake-Up Tone</Text>
          <Text style={styles.featureValue}>
            {defaultTones.find(t => t.id === effectiveAlarmData.selectedTone)?.name || 'Default'}
          </Text>
        </View>
        <Text style={styles.featureIcon}>🎵</Text>
      </TouchableOpacity>

      {/* Volume Configuration */}
      <TouchableOpacity
        style={styles.featureButton}
        onPress={() => setShowVolumeConfig(true)}
      >
        <View style={styles.featureInfo}>
          <Text style={styles.featureLabel}>Volume & Curve</Text>
          <Text style={styles.featureValue}>
            {volumeCurves.find(c => c.id === effectiveAlarmData.volumeCurve)?.name || 'Standard'}
          </Text>
        </View>
        <Text style={styles.featureIcon}>🔊</Text>
      </TouchableOpacity>

      {/* Weather Integration */}
      <TouchableOpacity
        style={styles.featureButton}
        onPress={() => setShowWeatherConfig(true)}
      >
        <View style={styles.featureInfo}>
          <Text style={styles.featureLabel}>Weather Integration</Text>
          <Text style={styles.featureValue}>
            {effectiveAlarmData.weatherEnabled ? 'Enabled' : 'Disabled'}
          </Text>
        </View>
        <Text style={styles.featureIcon}>🌤️</Text>
      </TouchableOpacity>

      {/* Multi-Stage Wake-Up */}
      <TouchableOpacity
        style={styles.featureButton}
        onPress={() => setShowMultiStageConfig(true)}
      >
        <View style={styles.featureInfo}>
          <Text style={styles.featureLabel}>Multi-Stage Wake-Up</Text>
          <Text style={styles.featureValue}>
            {effectiveAlarmData.multiStageEnabled ? 'Enabled' : 'Disabled'}
          </Text>
        </View>
        <Text style={styles.featureIcon}>🎯</Text>
      </TouchableOpacity>

      {/* Modals */}
      <ToneSelector />
      <VolumeConfiguration />
      <WeatherConfiguration />
      <MultiStageConfiguration />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  featureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  featureInfo: {
    flex: 1,
  },
  featureLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  featureValue: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  featureIcon: {
    fontSize: 24,
  },

  // Modal Styles
  modalContainer: {
    flex: 1,
    paddingTop: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.2)',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  closeButton: {
    fontSize: 24,
    color: 'white',
    padding: 5,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginVertical: 15,
  },

  // Tone Selector Styles
  toneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 15,
    borderRadius: 10,
    marginBottom: 8,
  },
  toneItemSelected: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: 'white',
  },
  toneInfo: {
    flex: 1,
  },
  toneName: {
    fontSize: 16,
    color: 'white',
    fontWeight: '500',
  },
  premiumBadge: {
    fontSize: 12,
    color: '#ffd700',
    marginTop: 2,
  },
  toneActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 8,
    borderRadius: 6,
    marginRight: 10,
  },
  playButtonText: {
    color: 'white',
    fontSize: 16,
  },
  selectedIcon: {
    color: '#4CAF50',
    fontSize: 20,
    fontWeight: 'bold',
  },
  uploadButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderStyle: 'dashed',
  },
  uploadButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },

  // Volume Configuration Styles
  volumeSection: {
    marginBottom: 25,
  },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  volumeStep: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  volumeStepText: {
    color: 'white',
    fontSize: 20,
    fontWeight: '900',
  },
  volumeLabel: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '500',
  },
  curveItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 15,
    borderRadius: 10,
    marginBottom: 8,
  },
  curveItemSelected: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: 'white',
  },
  curveName: {
    fontSize: 16,
    color: 'white',
    fontWeight: '500',
  },
  curveDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },

  // Weather & Settings Styles
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  settingLabel: {
    fontSize: 16,
    color: 'white',
    fontWeight: '500',
  },
  settingDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  weatherItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 15,
    borderRadius: 10,
    marginBottom: 8,
  },
  weatherItemSelected: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: 'white',
  },
  weatherName: {
    fontSize: 16,
    color: 'white',
    fontWeight: '500',
  },
  weatherMessage: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },

  // Multi-Stage Styles
  stageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 15,
    borderRadius: 10,
    marginBottom: 8,
  },
  stageName: {
    flex: 1,
    fontSize: 16,
    color: 'white',
    fontWeight: '500',
  },
  stageTime: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginRight: 15,
  },
  stageEnabled: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '500',
  },
});

export default AdvancedAlarmFeatures;
