import Modal, { AppAlert as Alert } from './AppModal';
/**
 * Quest Focus Mode - Distraction-Free Single Step View
 * Minimalist interface showing only the current task step
 */

import { sunrise } from './SunriseUI';
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Dimensions, Animated } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import QuestService from '../services/QuestService';

const { width, height } = Dimensions.get('window');

const QuestFocusMode = ({ visible, quest, onClose, onProgress, userProfile }) => {
  const [currentStep, setCurrentStep] = useState(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [pulseAnim] = useState(new Animated.Value(1));
  const [progressAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    if (quest) {
      const nextStep = QuestService.getNextStep(quest);
      setCurrentStep(nextStep);
      
      // Animate progress bar
      Animated.timing(progressAnim, {
        toValue: quest.progress / 100,
        duration: 1000,
        useNativeDriver: false,
      }).start();
    }
  }, [quest]);

  useEffect(() => {
    // Pulse animation for current step
    const pulse = () => {
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]).start(() => pulse());
    };

    if (visible && currentStep) {
      pulse();
    }

    return () => pulseAnim.setValue(1);
  }, [visible, currentStep]);

  const handleCompleteStep = async () => {
    if (!currentStep || isCompleting) return;

    Alert.alert(
      'Complete Step',
      `Mark "${currentStep.title}" as completed?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            setIsCompleting(true);
            try {
              const updatedQuest = await onProgress(quest.id, currentStep.id, true);
              if (!updatedQuest) throw new Error('This step was not saved.');
              const nextStep = QuestService.getNextStep(updatedQuest);
              
              if (nextStep) {
                setCurrentStep(nextStep);
                
                // Celebrate completion
                Alert.alert(
                  'Step Completed! 🎉',
                  `Great job! Moving to the next step.`,
                  [{ text: 'Continue', onPress: () => {} }]
                );
              } else {
                // Quest completed
                Alert.alert(
                  'Quest Completed! 🏆',
                  `Congratulations! You've completed "${quest.title}"!`,
                  [{ text: 'Awesome!', onPress: onClose }]
                );
              }
            } catch (error) {
              console.error('Error completing step:', error);
              Alert.alert('Not saved', error.message || 'Failed to complete step');
            } finally {
              setIsCompleting(false);
            }
          }
        }
      ]
    );
  };

  const handleSkipStep = () => {
    Alert.alert(
      'Skip Step',
      'Are you sure you want to skip this step? You can always come back to it later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Skip',
          onPress: () => {
            // Find the next incomplete step after current
            const currentIndex = quest.subtasks.findIndex(task => task.id === currentStep.id);
            const nextStep = quest.subtasks.find((task, index) => 
              index > currentIndex && !task.completed
            );
            
            if (nextStep) {
              setCurrentStep(nextStep);
            } else {
              Alert.alert(
                'No More Steps',
                'This is the last step in your quest.',
                [{ text: 'OK' }]
              );
            }
          }
        }
      ]
    );
  };

  const formatTime = (minutes) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const getStepNumber = () => {
    if (!quest || !currentStep) return 0;
    return quest.subtasks.findIndex(task => task.id === currentStep.id) + 1;
  };

  const getMotivationalMessage = () => {
    const messages = [
      "You've got this! 💪",
      "One step at a time! 🚀",
      "Making great progress! ⭐",
      "Stay focused! 🎯",
      "Almost there! 🏁",
      "Keep pushing forward! 🌟",
      "You're doing amazing! 🔥",
      "Every step counts! ✨"
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  };

  if (!visible || !quest || !currentStep) {
    return null;
  }

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen">
      <SafeAreaView style={styles.container}>
        <LinearGradient
          colors={[sunrise.orangeTint, '#FFE49A']}
          style={styles.background}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
            
            <View style={styles.headerCenter}>
              <Text style={styles.questTitle}>{quest.title}</Text>
              <Text style={styles.focusMode}>🎯 FOCUS MODE</Text>
            </View>
            
            <View style={styles.headerRight}>
              <Text style={styles.stepCounter}>
                {getStepNumber()}/{quest.totalSteps}
              </Text>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <Animated.View 
                style={[
                  styles.progressFill,
                  {
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%']
                    })
                  }
                ]} 
              />
            </View>
            <Text style={styles.progressText}>{quest.progress}% Complete</Text>
          </View>

          {/* Main Content */}
          <View style={styles.content}>
            {/* Motivational Message */}
            <Text style={styles.motivationalMessage}>
              {getMotivationalMessage()}
            </Text>

            {/* Current Step Card */}
            <Animated.View 
              style={[
                styles.stepCard,
                { transform: [{ scale: pulseAnim }] }
              ]}
            >
              <View style={styles.stepHeader}>
                <Text style={styles.stepNumber}>Step {getStepNumber()}</Text>
                <Text style={styles.stepTime}>
                  ⏱️ {formatTime(currentStep.estimatedMinutes)}
                </Text>
              </View>

              <Text style={styles.stepTitle}>{currentStep.title}</Text>
              
              {currentStep.description && (
                <Text style={styles.stepDescription}>
                  {currentStep.description}
                </Text>
              )}

              {/* Step Difficulty Indicator */}
              <View style={styles.difficultyContainer}>
                <Text style={styles.difficultyLabel}>Difficulty:</Text>
                <View style={[
                  styles.difficultyBadge,
                  { backgroundColor: getDifficultyColor(currentStep.difficulty) }
                ]}>
                  <Text style={styles.difficultyText}>
                    {currentStep.difficulty.toUpperCase()}
                  </Text>
                </View>
              </View>
            </Animated.View>

            {/* Action Buttons */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.completeButton]}
                onPress={handleCompleteStep}
                disabled={isCompleting}
              >
                <Text style={styles.completeButtonText}>
                  {isCompleting ? '⏳ Completing...' : '✅ Complete Step'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.skipButton]}
                onPress={handleSkipStep}
              >
                <Text style={styles.skipButtonText}>⏭️ Skip For Now</Text>
              </TouchableOpacity>
            </View>

            {/* Tips */}
            <View style={styles.tips}>
              <Text style={styles.tipsTitle}>💡 Focus Tips</Text>
              <Text style={styles.tip}>• Eliminate distractions around you</Text>
              <Text style={styles.tip}>• Take breaks if feeling overwhelmed</Text>
              <Text style={styles.tip}>• Celebrate small wins along the way</Text>
            </View>
          </View>

          {/* Bottom Info */}
          <View style={styles.bottomInfo}>
            <Text style={styles.bottomText}>
              🌟 Stay focused on one step at a time
            </Text>
          </View>
        </LinearGradient>
      </SafeAreaView>
    </Modal>
  );
};

const getDifficultyColor = (difficulty) => {
  switch (difficulty) {
    case 'easy': return '#48bb78';
    case 'medium': return '#ed8936';
    case 'hard': return '#e53e3e';
    default: return sunrise.orange;
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
  },
  closeButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  closeButtonText: {
    color: sunrise.ink,
    fontSize: 20,
    fontWeight: '900',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 20,
  },
  questTitle: {
    color: sunrise.ink,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  focusMode: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    marginTop: 4,
    letterSpacing: 1.5,
    fontWeight: '600',
  },
  headerRight: {
    width: 48,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 8,
    borderRadius: 16,
  },
  stepCounter: {
    color: sunrise.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  progressContainer: {
    paddingHorizontal: 24,
    marginBottom: 36,
  },
  progressBar: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 3,
  },
  progressText: {
    color: sunrise.muted,
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '700',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  motivationalMessage: {
    color: sunrise.ink,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 32,
    opacity: 0.95,
    letterSpacing: 0.3,
    lineHeight: 26,
  },
  stepCard: {
    backgroundColor: '#fff',
    borderRadius: 28,
    padding: 32,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  stepHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: sunrise.orangeTint,
    padding: 16,
    borderRadius: 16,
    marginHorizontal: -8,
  },
  stepNumber: {
    fontSize: 15,
    color: '#9A4700',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  stepTime: {
    fontSize: 15,
    color: '#6b7280',
    fontWeight: '700',
  },
  stepTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#1f2937',
    marginBottom: 16,
    lineHeight: 34,
    letterSpacing: 0.3,
  },
  stepDescription: {
    fontSize: 17,
    color: '#6b7280',
    lineHeight: 26,
    marginBottom: 20,
    fontWeight: '500',
  },
  difficultyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  difficultyLabel: {
    fontSize: 15,
    color: '#6b7280',
    marginRight: 12,
    fontWeight: '600',
  },
  difficultyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  difficultyText: {
    color: sunrise.ink,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  actions: {
    marginBottom: 32,
    gap: 16,
  },
  actionButton: {
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  completeButton: {
    backgroundColor: '#10b981',
    shadowColor: '#10b981',
  },
  skipButton: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  completeButtonText: {
    color: sunrise.ink,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  skipButtonText: {
    color: sunrise.ink,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  tips: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  tipsTitle: {
    color: sunrise.ink,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  tip: {
    color: sunrise.muted,
    fontSize: 15,
    marginBottom: 6,
    fontWeight: '500',
    lineHeight: 22,
  },
  bottomInfo: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: 'center',
  },
  bottomText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 22,
  },
});

export default QuestFocusMode;

