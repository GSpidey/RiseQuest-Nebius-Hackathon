import {moodStorageKey} from '../features/companion/supportClient';
import Modal, { AppAlert as Alert } from './AppModal';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, SafeAreaView, Dimensions, Animated, TextInput } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { UserProfileService } from '../models/RiseQuestModels';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

/**
 * Enhanced Mood & Energy Logger with ADHD/Bipolar Support
 */
const MoodTracker = ({ userProfile, onMoodLogged }) => {
  const moodKey=moodStorageKey(userProfile?.id||userProfile?.email);
  const activeMoodKey=useRef(moodKey);activeMoodKey.current=moodKey;
  const [selectedMood, setSelectedMood] = useState(null);
  const [selectedEnergy, setSelectedEnergy] = useState(null);
  const [selectedFocus, setSelectedFocus] = useState(null);
  const [notes, setNotes] = useState('');
  const [isLogging, setIsLogging] = useState(false);
  const [showingHistory, setShowingHistory] = useState(false);
  const [moodHistory, setMoodHistory] = useState([]);

  const moodOptions = [
    { id: 'very_low', emoji: '😢', label: 'Very Low', color: '#FF5252' },
    { id: 'low', emoji: '😔', label: 'Low', color: '#FF9800' },
    { id: 'neutral', emoji: '😐', label: 'Neutral', color: '#FFC107' },
    { id: 'good', emoji: '🙂', label: 'Good', color: '#8BC34A' },
    { id: 'great', emoji: '😊', label: 'Great', color: '#4CAF50' },
    { id: 'excellent', emoji: '🤩', label: 'Excellent', color: '#2196F3' }
  ];

  const energyLevels = [
    { id: 'exhausted', label: 'Exhausted', value: 1 },
    { id: 'tired', label: 'Tired', value: 2 },
    { id: 'low', label: 'Low', value: 3 },
    { id: 'moderate', label: 'Moderate', value: 4 },
    { id: 'good', label: 'Good', value: 5 },
    { id: 'high', label: 'High', value: 6 },
    { id: 'very_high', label: 'Very High', value: 7 }
  ];

  const focusLevels = [
    { id: 'scattered', label: 'Very Scattered', value: 1 },
    { id: 'distracted', label: 'Distracted', value: 2 },
    { id: 'unfocused', label: 'Unfocused', value: 3 },
    { id: 'okay', label: 'Okay', value: 4 },
    { id: 'focused', label: 'Focused', value: 5 },
    { id: 'very_focused', label: 'Very Focused', value: 6 },
    { id: 'hyperfocus', label: 'Hyperfocus', value: 7 }
  ];

  useEffect(() => {
    setMoodHistory([]);loadMoodHistory();
  }, [moodKey]);

  const loadMoodHistory = async () => {
    try {
      const history = await AsyncStorage.getItem(moodKey);
      if (history && activeMoodKey.current===moodKey) {
        setMoodHistory(JSON.parse(history));
      }
    } catch (error) {
      console.error('Error loading mood history:', error);
    }
  };

  const saveMoodEntry = async () => {
    if (!selectedMood || !selectedEnergy || !selectedFocus) {
      Alert.alert('Required', 'Please select mood, energy, and focus levels');
      return;
    }

    setIsLogging(true);

    try {
      const entry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        mood: selectedMood,
        energy: selectedEnergy,
        focus: selectedFocus,
        notes: notes.trim(),
        contextTags: [] // Could include sleep quality, medication, weather, etc.
      };

      const currentHistory = await AsyncStorage.getItem(moodKey);
      const history = currentHistory ? JSON.parse(currentHistory) : [];
      history.unshift(entry); // Add to beginning

      // Keep only last 90 days
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const filteredHistory = history.filter(h => 
        new Date(h.timestamp) > ninetyDaysAgo
      );

      await AsyncStorage.setItem(moodKey, JSON.stringify(filteredHistory));
      
      if(activeMoodKey.current!==moodKey)return;
      // Reset form
      setSelectedMood(null);
      setSelectedEnergy(null);
      setSelectedFocus(null);
      setNotes('');
      
      // Update local state
      setMoodHistory(filteredHistory);
      
      if (onMoodLogged) {
        onMoodLogged(entry);
      }

      Alert.alert('Logged', 'Your mood entry has been saved');
    } catch (error) {
      console.error('Error saving mood entry:', error);
      Alert.alert('Error', 'Failed to save mood entry');
    } finally {
      setIsLogging(false);
    }
  };

  const getMoodTrend = () => {
    if (moodHistory.length < 2) return null;
    
    const recent = moodHistory.slice(0, 7); // Last 7 entries
    const moodValues = recent.map(entry => {
      const mood = moodOptions.find(m => m.id === entry.mood);
      return moodOptions.indexOf(mood);
    });

    const avg = moodValues.reduce((a, b) => a + b, 0) / moodValues.length;
    const recentAvg = moodValues.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, moodValues.length);
    
    if (recentAvg > avg + 0.5) return 'improving';
    if (recentAvg < avg - 0.5) return 'declining';
    return 'stable';
  };

  const renderMoodSelector = () => (
    <View style={styles.selectorContainer}>
      <Text style={styles.selectorTitle}>How are you feeling?</Text>
      <View style={styles.moodGrid}>
        {moodOptions.map(mood => (
          <TouchableOpacity
            key={mood.id}
            style={[
              styles.moodButton,
              selectedMood === mood.id && { 
                backgroundColor: mood.color + '20',
                borderColor: mood.color 
              }
            ]}
            onPress={() => setSelectedMood(mood.id)}
          >
            <Text style={styles.moodEmoji}>{mood.emoji}</Text>
            <Text style={styles.moodLabel}>{mood.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderEnergySelector = () => (
    <View style={styles.selectorContainer}>
      <Text style={styles.selectorTitle}>Energy Level</Text>
      <View style={styles.levelContainer}>
        {energyLevels.map(level => (
          <TouchableOpacity
            key={level.id}
            style={[
              styles.levelButton,
              selectedEnergy === level.id && styles.selectedLevel
            ]}
            onPress={() => setSelectedEnergy(level.id)}
          >
            <Text style={styles.levelValue}>{level.value}</Text>
            <Text style={styles.levelLabel}>{level.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderFocusSelector = () => (
    <View style={styles.selectorContainer}>
      <Text style={styles.selectorTitle}>Focus & Attention</Text>
      <View style={styles.levelContainer}>
        {focusLevels.map(level => (
          <TouchableOpacity
            key={level.id}
            style={[
              styles.levelButton,
              selectedFocus === level.id && styles.selectedLevel
            ]}
            onPress={() => setSelectedFocus(level.id)}
          >
            <Text style={styles.levelValue}>{level.value}</Text>
            <Text style={styles.levelLabel}>{level.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderTrendInsight = () => {
    const trend = getMoodTrend();
    if (!trend || moodHistory.length < 3) return null;

    const trendConfig = {
      improving: { emoji: '📈', color: '#4CAF50', message: 'Your mood has been improving!' },
      declining: { emoji: '📉', color: '#FF5722', message: 'Consider reaching out for support' },
      stable: { emoji: '📊', color: '#2196F3', message: 'Your mood has been stable' }
    };

    const config = trendConfig[trend];

    return (
      <View style={[styles.trendContainer, { borderLeftColor: config.color }]}>
        <Text style={styles.trendEmoji}>{config.emoji}</Text>
        <Text style={styles.trendMessage}>{config.message}</Text>
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 140 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.headerTitle}>Mood & Focus Check-in</Text>
      <Text style={styles.headerSubtitle}>
        Track your patterns to better understand yourself
      </Text>

      {renderTrendInsight()}
      {renderMoodSelector()}
      {renderEnergySelector()}
      {renderFocusSelector()}

      <View style={styles.notesContainer}>
        <Text style={styles.notesTitle}>Notes (Optional)</Text>
        <TextInput
          style={styles.notesInput}
          placeholder="What's affecting your mood today? Sleep, stress, medication, etc."
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={200}
        />
      </View>

      <TouchableOpacity
        style={[
          styles.saveButton,
          (!selectedMood || !selectedEnergy || !selectedFocus || isLogging) && 
          styles.saveButtonDisabled
        ]}
        onPress={saveMoodEntry}
        disabled={!selectedMood || !selectedEnergy || !selectedFocus || isLogging}
      >
        <Text style={styles.saveButtonText}>
          {isLogging ? 'Saving...' : 'Log Entry'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.historyButton}
        onPress={() => setShowingHistory(true)}
      >
        <Text style={styles.historyButtonText}>View History ({moodHistory.length})</Text>
      </TouchableOpacity>

      {/* History Modal */}
      <Modal
        visible={showingHistory}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Mood History</Text>
            <TouchableOpacity onPress={() => setShowingHistory(false)}>
              <Text style={styles.modalClose}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.historyList}>
            {moodHistory.map(entry => {
              const mood = moodOptions.find(m => m.id === entry.mood);
              const energy = energyLevels.find(e => e.id === entry.energy);
              const focus = focusLevels.find(f => f.id === entry.focus);
              const date = new Date(entry.timestamp);
              
              return (
                <View key={entry.id} style={styles.historyEntry}>
                  <View style={styles.historyHeader}>
                    <Text style={styles.historyDate}>
                      {date.toLocaleDateString()} at {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <Text style={styles.historyMood}>{mood.emoji} {mood.label}</Text>
                  </View>
                  <View style={styles.historyDetails}>
                    <Text style={styles.historyDetail}>Energy: {energy.label} ({energy.value}/7)</Text>
                    <Text style={styles.historyDetail}>Focus: {focus.label} ({focus.value}/7)</Text>
                    {entry.notes && (
                      <Text style={styles.historyNotes}>{entry.notes}</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </ScrollView>
  );
};

/**
 * ADHD-Friendly Focus Timer
 */
const FocusTimer = ({ userProfile, onFocusCompleted }) => {
  const [duration, setDuration] = useState(25); // minutes
  const [timeLeft, setTimeLeft] = useState(25 * 60); // seconds
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [session, setSession] = useState('focus'); // focus, short_break, long_break
  const [completedSessions, setCompletedSessions] = useState(0);
  const [animatedValue] = useState(new Animated.Value(1));

  const sessionTypes = {
    focus: { duration: duration, label: 'Focus Time', color: '#FF5722', emoji: '🎯' },
    short_break: { duration: 5, label: 'Short Break', color: '#4CAF50', emoji: '☕' },
    long_break: { duration: 15, label: 'Long Break', color: '#2196F3', emoji: '🌟' }
  };

  const adhdFriendlyDurations = [10, 15, 20, 25, 30, 45, 60];

  useEffect(() => {
    let interval = null;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(timeLeft => timeLeft - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      handleSessionComplete();
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft]);

  useEffect(() => {
    if (isRunning) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(animatedValue, {
            toValue: 0.8,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(animatedValue, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      animatedValue.setValue(1);
    }
  }, [isRunning]);

  const startTimer = () => {
    setIsRunning(true);
    setIsPaused(false);
  };

  const pauseTimer = () => {
    setIsRunning(false);
    setIsPaused(true);
  };

  const resetTimer = () => {
    setIsRunning(false);
    setIsPaused(false);
    setTimeLeft(sessionTypes[session].duration * 60);
  };

  const handleSessionComplete = () => {
    setIsRunning(false);
    
    if (session === 'focus') {
      setCompletedSessions(prev => prev + 1);

      if (typeof onFocusCompleted === 'function') {
        try {
          onFocusCompleted({
            durationMinutes: sessionTypes.focus.duration,
            completedAt: new Date().toISOString(),
          });
        } catch (_) {
          // ignore
        }
      }
      
      // Determine next session
      const nextSession = (completedSessions + 1) % 4 === 0 ? 'long_break' : 'short_break';
      setSession(nextSession);
      setTimeLeft(sessionTypes[nextSession].duration * 60);
      
      Alert.alert(
        'Focus Session Complete! 🎉',
        `Great job! Take a ${sessionTypes[nextSession].label.toLowerCase()}.`,
        [
          { text: 'Start Break', onPress: () => setIsRunning(true) },
          { text: 'Skip Break', onPress: () => startFocusSession() }
        ]
      );
    } else {
      // Break complete
      startFocusSession();
      Alert.alert(
        'Break Complete! 💪',
        'Ready for another focus session?',
        [
          { text: 'Start Focus', onPress: () => setIsRunning(true) },
          { text: 'Not Yet', style: 'cancel' }
        ]
      );
    }
  };

  const startFocusSession = () => {
    setSession('focus');
    setTimeLeft(duration * 60);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = 1 - (timeLeft / (sessionTypes[session].duration * 60));

  return (
    <View style={styles.timerContainer}>
      <Text style={styles.timerTitle}>Focus Timer</Text>
      <Text style={styles.sessionLabel}>
        {sessionTypes[session].emoji} {sessionTypes[session].label}
      </Text>

      <Animated.View 
        style={[
          styles.timerCircle,
          { 
            transform: [{ scale: animatedValue }],
            borderColor: sessionTypes[session].color 
          }
        ]}
      >
        <Text style={[styles.timerText, { color: sessionTypes[session].color }]}>
          {formatTime(timeLeft)}
        </Text>
        <View style={[styles.progressRing, { borderColor: sessionTypes[session].color + '20' }]}>
          <View 
            style={[
              styles.progressFill,
              { 
                backgroundColor: sessionTypes[session].color,
                height: `${progress * 100}%`
              }
            ]}
          />
        </View>
      </Animated.View>

      <View style={styles.timerControls}>
        {!isRunning ? (
          <TouchableOpacity style={styles.startButton} onPress={startTimer}>
            <Text style={styles.startButtonText}>
              {isPaused ? 'Resume' : 'Start'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.pauseButton} onPress={pauseTimer}>
            <Text style={styles.pauseButtonText}>Pause</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity style={styles.resetButton} onPress={resetTimer}>
          <Text style={styles.resetButtonText}>Reset</Text>
        </TouchableOpacity>
      </View>

      {session === 'focus' && (
        <View style={styles.durationSelector}>
          <Text style={styles.durationTitle}>Focus Duration</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.durationScroll}
            contentContainerStyle={styles.durationScrollContent}
          >
            {adhdFriendlyDurations.map(mins => (
              <TouchableOpacity
                key={mins}
                style={[
                  styles.durationButton,
                  duration === mins && styles.selectedDuration
                ]}
                onPress={() => {
                  setDuration(mins);
                  if (!isRunning) {
                    setTimeLeft(mins * 60);
                  }
                }}
              >
                <Text style={[styles.durationText, duration === mins && styles.durationTextActive]}>{mins}m</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.sessionStats}>
        <Text style={styles.statsText}>
          Sessions Today: {completedSessions}
        </Text>
        <Text style={styles.statsText}>
          Next: {completedSessions % 4 === 3 ? 'Long Break' : 'Short Break'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 5,
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    color: '#666',
  },
  selectorContainer: {
    backgroundColor: '#fff',
    margin: 15,
    padding: 20,
    borderRadius: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  selectorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  moodButton: {
    width: '30%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 15,
    marginBottom: 10,
  },
  moodEmoji: {
    fontSize: 24,
    marginBottom: 5,
  },
  moodLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  levelContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  levelButton: {
    width: '13%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    marginBottom: 10,
  },
  selectedLevel: {
    borderColor: '#667eea',
    backgroundColor: '#f0f2ff',
  },
  levelValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  levelLabel: {
    fontSize: 8,
    color: '#666',
    textAlign: 'center',
    marginTop: 2,
  },
  trendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 15,
    padding: 15,
    borderRadius: 10,
    borderLeftWidth: 4,
  },
  trendEmoji: {
    fontSize: 20,
    marginRight: 10,
  },
  trendMessage: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  notesContainer: {
    backgroundColor: '#fff',
    margin: 15,
    padding: 20,
    borderRadius: 15,
  },
  notesTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  notesInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 15,
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  saveButton: {
    backgroundColor: '#667eea',
    margin: 15,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  historyButton: {
    backgroundColor: '#f0f0f0',
    margin: 15,
    marginTop: 0,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  historyButtonText: {
    color: '#666',
    fontSize: 14,
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
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalClose: {
    fontSize: 16,
    color: '#667eea',
  },
  historyList: {
    flex: 1,
  },
  historyEntry: {
    backgroundColor: '#fff',
    margin: 15,
    padding: 15,
    borderRadius: 10,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  historyDate: {
    fontSize: 12,
    color: '#666',
  },
  historyMood: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  historyDetails: {
    gap: 5,
  },
  historyDetail: {
    fontSize: 12,
    color: '#666',
  },
  historyNotes: {
    fontSize: 12,
    color: '#333',
    fontStyle: 'italic',
    marginTop: 5,
  },
  // Timer Styles
  timerContainer: {
    width: '100%',
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
    padding: 20,
  },
  timerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  sessionLabel: {
    fontSize: 18,
    color: '#666',
    marginBottom: 30,
  },
  timerCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    marginBottom: 30,
  },
  timerText: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  progressRing: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 4,
    overflow: 'hidden',
  },
  progressFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  timerControls: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 30,
  },
  startButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  pauseButton: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
  },
  pauseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resetButton: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
  },
  resetButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: 'bold',
  },
  durationSelector: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  durationScroll: {
    maxHeight: 48,
  },
  durationScrollContent: {
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  durationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#333',
  },
  durationButton: {
    backgroundColor: '#f0f0f0',
    height: 40,
    minWidth: 56,
    paddingHorizontal: 14,
    borderRadius: 999,
    marginHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedDuration: {
    backgroundColor: '#667eea',
  },
  durationText: {
    color: '#475569',
    fontWeight: 'bold',
  },
  durationTextActive: {
    color: '#fff',
  },
  sessionStats: {
    alignItems: 'center',
  },
  statsText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
});

export { MoodTracker, FocusTimer };

