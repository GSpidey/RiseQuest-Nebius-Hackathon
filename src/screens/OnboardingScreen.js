import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Dimensions,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { UserProfileService } from '../models/RiseQuestModels';
import AgeScreen from '../components/AgeScreen';
import { groupForBand } from '../services/agePolicy';
import { canRegister } from '../../backend/src/agePolicy';
import { WELLBEING_NOTICE } from '../config/wellbeingNotice';

const { width, height } = Dimensions.get('window');

/**
 * Enhanced Onboarding Flow with Age-Adaptive & Support Features
 */
const OnboardingScreen = ({ onComplete, prefillProfile }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [userData, setUserData] = useState({
    ageGroup: prefillProfile?.ageGroup || null,
    ageBand: prefillProfile?.ageBand || null,
    countryCode: prefillProfile?.countryCode || null,
    supportEnabled: prefillProfile?.supportEnabled || false,
    supportConditions: prefillProfile?.supportConditions || [],
    displayName: '',
    goals: prefillProfile?.preferences?.goals || [],
    preferences: {
      uiDensity: 'standard',
      reducedSensory: false,
      captionsEnabled: false,
      dyslexiaFriendly: false,
      notificationStyle: 'gentle',
      communityOptIn: false,
      analyticsOptIn: false,
      ...prefillProfile?.preferences,
    },
  });

  const steps = [
    'welcome',
    'age_group',
    'support_toggle',
    'support_conditions', // Only if support enabled
    'accessibility',
    'goals',
    'privacy',
    'completion'
  ];

  const getVisibleSteps = () => {
    let visibleSteps = ['welcome', 'age_group', 'support_toggle'];
    
    if (userData.supportEnabled) {
      visibleSteps.push('support_conditions');
    }
    
    visibleSteps.push('accessibility', 'goals', 'privacy');
    
    
    visibleSteps.push('completion');
    return visibleSteps;
  };

  const currentVisibleSteps = getVisibleSteps();
  const actualStep = currentVisibleSteps[currentStep];

  const nextStep = () => {
    if (currentStep < currentVisibleSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const updateUserData = (updates) => {
    setUserData(prev => ({ ...prev, ...updates }));
  };

  const completeOnboarding = async () => {
    try {
      // Validate required fields
      if (!userData.ageGroup) {
        Alert.alert('Required', 'Please select your age group');
        return;
      }

      if (!canRegister(userData.ageBand, userData.countryCode)) {
        Alert.alert('Parent-managed setup', 'A verified parent must create and manage this child profile.');
        return;
      }

      const email = String(prefillProfile?.email || '').trim() || `user_${Date.now()}@risequest.local`;
      const displayName = userData.displayName || prefillProfile?.displayName || 'RiseQuest User';

      // Create user profile
      const profile = await UserProfileService.createUserProfile({
        ...userData,
        email,
        displayName,
        phoneNumber: userData.phoneNumber || prefillProfile?.phoneNumber || null,
        photoUrl: prefillProfile?.photoUrl || prefillProfile?.photoURL || null,
        authProvider: prefillProfile?.authProvider || null,
      }, { complete: true });

      if (profile) {
        await onComplete(profile);
      } else {
        Alert.alert('Error', 'Failed to create profile. Please try again.');
      }
    } catch (error) {
      console.error('Onboarding error:', error);
      Alert.alert('Could not save setup', error.message || 'Please check your connection and try again.');
    }
  };

  const renderWelcome = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.emoji}>🌅</Text>
      <Text style={styles.title}>Welcome to RiseQuest!</Text>
      <Text style={styles.description}>
        Transform your mornings into an adventure with personalized wake-up experiences, 
        habit building, and optional support for ADHD, ADD, and bipolar wellness.
      </Text>
      <View style={styles.featureList}>
        <Text style={styles.feature}>🎮 Gamified wake-up challenges</Text>
        <Text style={styles.feature}>⏰ Smart alarms & routines</Text>
        <Text style={styles.feature}>🧠 Optional neurodivergent support</Text>
        <Text style={styles.feature}>🏆 Rise Points & achievements</Text>
        <Text style={styles.feature}>🔒 Privacy-first design</Text>
      </View>
      <Text style={styles.description}>{WELLBEING_NOTICE}</Text>
    </View>
  );

  const renderAgeGroup = () => (
    <AgeScreen value={userData.ageBand} onChange={ageBand => updateUserData({ ageBand, ageGroup: groupForBand(ageBand) })}
      countryCode={userData.countryCode} onCountryChange={countryCode => updateUserData({ countryCode })} />
  );


  const renderSupportToggle = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.emoji}>🧠</Text>
      <Text style={styles.title}>Optional Special Support</Text>
      <Text style={styles.description}>
        RiseQuest can provide extra support for ADHD, ADD, and bipolar wellness. 
        This is completely optional and can be changed anytime.
      </Text>
      
      <View style={styles.toggleContainer}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleTitle}>Enable Special Support</Text>
            <Text style={styles.toggleDesc}>
              ADHD/bipolar-friendly features, mood tracking, and gentle routines
            </Text>
          </View>
          <Switch
            value={userData.supportEnabled}
            onValueChange={(value) => updateUserData({ supportEnabled: value })}
            trackColor={{ false: '#ccc', true: '#4CAF50' }}
            thumbColor={userData.supportEnabled ? '#fff' : '#f4f3f4'}
          />
        </View>
      </View>

      {userData.supportEnabled && (
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>What this includes (all free):</Text>
          <Text style={styles.infoItem}>• Gentle wake-up options</Text>
          <Text style={styles.infoItem}>• Mood & energy tracking</Text>
          <Text style={styles.infoItem}>• ADHD/bipolar routine templates</Text>
          <Text style={styles.infoItem}>• Coping strategies library</Text>
          <Text style={styles.infoItem}>• Extra encouragement & reminders</Text>
        </View>
      )}
    </View>
  );

  const renderSupportConditions = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.emoji}>💙</Text>
      <Text style={styles.title}>Support Areas</Text>
      <Text style={styles.description}>
        Which areas would you like extra support with? (Optional - helps personalize your experience)
      </Text>
      
      <View style={styles.conditionsList}>
        {[
          { id: 'adhd', title: 'ADHD Support', desc: 'Focus, attention, and routine help' },
          { id: 'add', title: 'ADD Support', desc: 'Attention and organization assistance' },
          { id: 'bipolar', title: 'Bipolar Wellness', desc: 'Mood tracking and stability tools' },
          { id: 'general', title: 'General Wellness', desc: 'Basic mental health support' }
        ].map(condition => (
          <TouchableOpacity
            key={condition.id}
            style={[
              styles.conditionButton,
              userData.supportConditions.includes(condition.id) && styles.selectedCondition
            ]}
            onPress={() => {
              const currentConditions = userData.supportConditions;
              const isSelected = currentConditions.includes(condition.id);
              const newConditions = isSelected
                ? currentConditions.filter(c => c !== condition.id)
                : [...currentConditions, condition.id];
              updateUserData({ supportConditions: newConditions });
            }}
          >
            <Text style={styles.conditionTitle}>{condition.title}</Text>
            <Text style={styles.conditionDesc}>{condition.desc}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderAccessibility = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.emoji}>♿</Text>
      <Text style={styles.title}>Accessibility & Preferences</Text>
      <Text style={styles.description}>
        Customize the app to work better for you.
      </Text>
      
      <View style={styles.accessibilityList}>
        <View style={styles.accessibilityItem}>
          <Text style={styles.accessibilityLabel}>Reduced sensory mode</Text>
          <Switch
            value={userData.preferences.reducedSensory}
            onValueChange={(value) => updateUserData({
              preferences: { ...userData.preferences, reducedSensory: value }
            })}
          />
        </View>

        <View style={styles.accessibilityItem}>
          <Text style={styles.accessibilityLabel}>Dyslexia-friendly fonts</Text>
          <Switch
            value={userData.preferences.dyslexiaFriendly}
            onValueChange={(value) => updateUserData({
              preferences: { ...userData.preferences, dyslexiaFriendly: value }
            })}
          />
        </View>

        <View style={styles.accessibilityItem}>
          <Text style={styles.accessibilityLabel}>Captions for audio</Text>
          <Switch
            value={userData.preferences.captionsEnabled}
            onValueChange={(value) => updateUserData({
              preferences: { ...userData.preferences, captionsEnabled: value }
            })}
          />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Interface Style</Text>
      <View style={styles.densityOptions}>
        {[
          { id: 'compact', label: 'Compact', desc: 'More content, less spacing' },
          { id: 'standard', label: 'Standard', desc: 'Balanced layout' },
          { id: 'spacious', label: 'Spacious', desc: 'More breathing room' }
        ].map(option => (
          <TouchableOpacity
            key={option.id}
            style={[
              styles.densityButton,
              userData.preferences.uiDensity === option.id && styles.selectedDensity
            ]}
            onPress={() => updateUserData({
              preferences: { ...userData.preferences, uiDensity: option.id }
            })}
          >
            <Text style={styles.densityLabel}>{option.label}</Text>
            <Text style={styles.densityDesc}>{option.desc}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderGoals = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.emoji}>🎯</Text>
      <Text style={styles.title}>Your Goals</Text>
      <Text style={styles.description}>
        What would you like to improve? (Select all that apply)
      </Text>
      
      <View style={styles.goalsList}>
        {[
          { id: 'wake_consistency', title: 'Wake Up Consistently', emoji: '⏰' },
          { id: 'morning_routine', title: 'Build Morning Routine', emoji: '🌅' },
          { id: 'focus_improvement', title: 'Improve Focus', emoji: '🎯' },
          { id: 'habit_building', title: 'Build Better Habits', emoji: '📈' },
          { id: 'mood_tracking', title: 'Track Mood & Energy', emoji: '💙' },
          { id: 'stress_management', title: 'Manage Stress', emoji: '🧘' },
          { id: 'sleep_quality', title: 'Better Sleep Quality', emoji: '😴' },
          { id: 'productivity', title: 'Increase Productivity', emoji: '⚡' }
        ].map(goal => (
          <TouchableOpacity
            key={goal.id}
            style={[
              styles.goalButton,
              userData.goals.includes(goal.id) && styles.selectedGoal
            ]}
            onPress={() => {
              const currentGoals = userData.goals;
              const isSelected = currentGoals.includes(goal.id);
              const newGoals = isSelected
                ? currentGoals.filter(g => g !== goal.id)
                : [...currentGoals, goal.id];
              updateUserData({ goals: newGoals });
            }}
          >
            <Text style={styles.goalEmoji}>{goal.emoji}</Text>
            <Text style={styles.goalTitle}>{goal.title}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderPrivacy = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.emoji}>🔒</Text>
      <Text style={styles.title}>Privacy Settings</Text>
      <Text style={styles.description}>
        You control your data. These settings can be changed anytime.
      </Text>
      
      <View style={styles.privacyList}>
        <View style={styles.privacyItem}>
          <View style={styles.privacyInfo}>
            <Text style={styles.privacyLabel}>Join Community Features</Text>
            <Text style={styles.privacyDesc}>Connect with other users (optional)</Text>
          </View>
          <Switch
            value={userData.preferences.communityOptIn}
            onValueChange={(value) => updateUserData({
              preferences: { ...userData.preferences, communityOptIn: value }
            })}
          />
        </View>

        <View style={styles.privacyItem}>
          <View style={styles.privacyInfo}>
            <Text style={styles.privacyLabel}>Analytics & Improvements</Text>
            <Text style={styles.privacyDesc}>Help us improve the app (anonymous)</Text>
          </View>
          <Switch
            value={userData.preferences.analyticsOptIn}
            onValueChange={(value) => updateUserData({
              preferences: { ...userData.preferences, analyticsOptIn: value }
            })}
          />
        </View>
      </View>

      <View style={styles.dataInfoBox}>
        <Text style={styles.dataInfoTitle}>Your Data Rights:</Text>
        <Text style={styles.dataInfoItem}>• Export your data anytime</Text>
        <Text style={styles.dataInfoItem}>• Delete your account & data</Text>
        <Text style={styles.dataInfoItem}>• Change privacy settings anytime</Text>
        <Text style={styles.dataInfoItem}>• Saved preferences sync privately to your account</Text>
      </View>
    </View>
  );


  const renderCompletion = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.emoji}>🎉</Text>
      <Text style={styles.title}>All Set!</Text>
      <Text style={styles.description}>
        Your personalized RiseQuest experience is ready. You can change any of these 
        settings later in the app.
      </Text>
      
      <View style={styles.summaryBox}>
        <Text style={styles.summaryTitle}>Your Setup:</Text>
        <Text style={styles.summaryItem}>Age Group: {userData.ageGroup}</Text>
        <Text style={styles.summaryItem}>
          Special Support: {userData.supportEnabled ? 'Enabled' : 'Disabled'}
        </Text>
        <Text style={styles.summaryItem}>Goals: {userData.goals.length} selected</Text>
        <Text style={styles.summaryItem}>
          Community: {userData.preferences.communityOptIn ? 'Opted in' : 'Private mode'}
        </Text>
      </View>
    </View>
  );

  const renderCurrentStep = () => {
    switch (actualStep) {
      case 'welcome': return renderWelcome();
      case 'age_group': return renderAgeGroup();
      case 'support_toggle': return renderSupportToggle();
      case 'support_conditions': return renderSupportConditions();
      case 'accessibility': return renderAccessibility();
      case 'goals': return renderGoals();
      case 'privacy': return renderPrivacy();
      case 'completion': return renderCompletion();
      default: return renderWelcome();
    }
  };

  const canProceed = () => {
    switch (actualStep) {
      case 'age_group': return userData.ageBand != null && userData.ageGroup !== 'child';
      default: return true;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#FF7A00', '#7C5CFC']}
        style={styles.background}
      >
        <View style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={styles.scrollContainer}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {/* Progress Indicator */}
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${((currentStep + 1) / currentVisibleSteps.length) * 100}%` }
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                {currentStep + 1} of {currentVisibleSteps.length}
              </Text>
            </View>

            {/* Step Content */}
            <View style={styles.contentContainer}>
              {renderCurrentStep()}
            </View>

            {/* Spacer so the bottom buttons never overlap content */}
            <View style={{ height: 12 }} />
          </ScrollView>

          {/* Navigation Buttons (fixed, safe-area aware via SafeAreaView) */}
          <View style={styles.navigationContainer}>
            {currentStep > 0 && (
              <TouchableOpacity style={styles.backButton} onPress={prevStep}>
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              style={[
                styles.nextButton,
                !canProceed() && styles.nextButtonDisabled
              ]}
              onPress={actualStep === 'completion' ? completeOnboarding : nextStep}
              disabled={!canProceed()}
            >
              <Text style={styles.nextButtonText}>
                {actualStep === 'completion' ? 'Start RiseQuest!' : 'Continue'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 16,
  },
  progressContainer: {
    marginBottom: 36,
  },
  progressBar: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 6,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  progressFill: {
    height: 6,
    backgroundColor: '#fff',
    borderRadius: 6,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 3,
  },
  progressText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 15,
    opacity: 0.9,
    fontWeight: '700',
  },
  contentContainer: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 28,
    padding: 32,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  stepContainer: {
    flex: 1,
    alignItems: 'center',
  },
  emoji: {
    fontSize: 72,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 0.5,
    color: '#333',
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
    color: '#666',
    lineHeight: 22,
  },
  featureList: {
    alignSelf: 'stretch',
  },
  feature: {
    fontSize: 16,
    marginBottom: 8,
    color: '#555',
  },
  optionsList: {
    alignSelf: 'stretch',
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    marginBottom: 10,
  },
  selectedOption: {
    borderColor: '#667eea',
    backgroundColor: '#f0f2ff',
  },
  optionEmoji: {
    fontSize: 30,
    marginRight: 15,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  optionDesc: {
    fontSize: 14,
    color: '#666',
  },
  toggleContainer: {
    alignSelf: 'stretch',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
  },
  toggleInfo: {
    flex: 1,
    marginRight: 15,
  },
  toggleTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  toggleDesc: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  infoBox: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 10,
    marginTop: 15,
    alignSelf: 'stretch',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  infoItem: {
    fontSize: 14,
    color: '#555',
    marginBottom: 5,
  },
  conditionsList: {
    alignSelf: 'stretch',
  },
  conditionButton: {
    padding: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    marginBottom: 10,
  },
  selectedCondition: {
    borderColor: '#667eea',
    backgroundColor: '#f0f2ff',
  },
  conditionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  conditionDesc: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  accessibilityList: {
    alignSelf: 'stretch',
    marginBottom: 20,
  },
  accessibilityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  accessibilityLabel: {
    fontSize: 16,
    color: '#333',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  densityOptions: {
    alignSelf: 'stretch',
  },
  densityButton: {
    padding: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    marginBottom: 8,
  },
  selectedDensity: {
    borderColor: '#667eea',
    backgroundColor: '#f0f2ff',
  },
  densityLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  densityDesc: {
    fontSize: 12,
    color: '#666',
  },
  goalsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
  },
  goalButton: {
    width: '48%',
    padding: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  selectedGoal: {
    borderColor: '#667eea',
    backgroundColor: '#f0f2ff',
  },
  goalEmoji: {
    fontSize: 24,
    marginBottom: 5,
  },
  goalTitle: {
    fontSize: 14,
    textAlign: 'center',
    color: '#333',
  },
  privacyList: {
    alignSelf: 'stretch',
    marginBottom: 20,
  },
  privacyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  privacyInfo: {
    flex: 1,
    marginRight: 15,
  },
  privacyLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  privacyDesc: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  dataInfoBox: {
    backgroundColor: '#e8f5e8',
    padding: 15,
    borderRadius: 10,
    alignSelf: 'stretch',
  },
  dataInfoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#2e7d32',
  },
  dataInfoItem: {
    fontSize: 14,
    color: '#2e7d32',
    marginBottom: 5,
  },
  consentBox: {
    alignSelf: 'stretch',
  },
  consentTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
    textAlign: 'center',
  },
  consentText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    lineHeight: 20,
  },
  consentButton: {
    padding: 15,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    alignItems: 'center',
  },
  consentButtonActive: {
    borderColor: '#4CAF50',
    backgroundColor: '#f1f8e9',
  },
  consentButtonText: {
    fontSize: 16,
    color: '#666',
  },
  consentButtonTextActive: {
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  summaryBox: {
    backgroundColor: '#f8f9fa',
    padding: 20,
    borderRadius: 10,
    alignSelf: 'stretch',
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  summaryItem: {
    fontSize: 14,
    color: '#555',
    marginBottom: 8,
  },
  navigationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  nextButton: {
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 25,
    backgroundColor: '#fff',
  },
  nextButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  nextButtonText: {
    color: '#667eea',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default OnboardingScreen;
