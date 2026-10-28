import ModalHeading from './ModalHeading';
import Modal, { AppAlert as Alert } from './AppModal';
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, SafeAreaView, FlatList, TextInput, Share } from 'react-native';
import { UserProfileService } from '../models/RiseQuestModels';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Comprehensive Coping Strategies Library
 * Age-appropriate content with ADHD/Bipolar support
 */
const CopingLibrary = ({ userProfile }) => {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [favoriteStrategies, setFavoriteStrategies] = useState([]);
  const [selectedStrategy, setSelectedStrategy] = useState(null);
  const [showingStrategy, setShowingStrategy] = useState(false);

  const categories = [
    { id: 'all', label: 'All Strategies', emoji: '🌟' },
    { id: 'focus', label: 'Focus & Attention', emoji: '🎯' },
    { id: 'anxiety', label: 'Anxiety & Worry', emoji: '💙' },
    { id: 'mood', label: 'Mood Support', emoji: '🌈' },
    { id: 'energy', label: 'Energy Management', emoji: '⚡' },
    { id: 'sleep', label: 'Sleep & Rest', emoji: '😴' },
    { id: 'organization', label: 'Organization', emoji: '📝' },
    { id: 'social', label: 'Social Situations', emoji: '👥' },
    { id: 'overwhelm', label: 'Overwhelm', emoji: '🌊' },
    { id: 'morning', label: 'Morning Routine', emoji: '🌅' }
  ];

  // Comprehensive coping strategies database
  const copingStrategies = [
    {
      id: 'one_small_step', title: 'One Small Step', category: 'overwhelm',
      ageGroups: ['child', 'teen', 'adult'], supportConditions: [],
      difficulty: 'easy', duration: 'A few minutes',
      description: 'Make an everyday task easier to approach with one small action.',
      steps: ['Choose one thing you would like to do', 'Pick a small first action, such as gathering what you need',
        'Try that action at a comfortable pace', 'Pause and decide whether to continue or take a break'],
      tips: ['Ask a trusted person for help if you want', 'You can change the size of your next step'],
      whenToUse: 'When an everyday task feels too big to start'
    },
    // Focus & Attention Strategies
    {
      id: 'pomodoro_basic',
      title: 'ADHD-Friendly Pomodoro',
      category: 'focus',
      ageGroups: ['teen', 'adult'],
      supportConditions: ['adhd', 'add'],
      difficulty: 'easy',
      duration: '25 minutes',
      description: 'Break work into focused 25-minute chunks with short breaks.',
      steps: [
        'Choose ONE task to work on',
        'Set timer for 25 minutes (or shorter if needed)',
        'Work until timer rings - no switching tasks',
        'Take a 5-minute break',
        'Repeat 3-4 times, then take longer break'
      ],
      tips: [
        'Start with 15-minute sessions if 25 feels too long',
        'Put phone in another room during focus time',
        'Have water and fidget toys ready',
        'It\'s OK to pause if you need to move around'
      ],
      whenToUse: 'When you need to focus on tasks but feel distracted or overwhelmed'
    },
    {
      id: 'body_doubling',
      title: 'Virtual Body Doubling',
      category: 'focus',
      ageGroups: ['teen', 'adult'],
      supportConditions: ['adhd', 'add'],
      difficulty: 'easy',
      duration: 'Variable',
      description: 'Work alongside others (virtually or in-person) to maintain focus.',
      steps: [
        'Find a study buddy, virtual co-working room, or family member',
        'Share what you plan to work on',
        'Work quietly together in the same space/call',
        'Check in periodically to stay accountable',
        'Celebrate when you complete tasks'
      ],
      tips: [
        'Try online study rooms or co-working apps',
        'Even working near family can help',
        'Don\'t chat during work time - just be present',
        'Some people find camera-on video calls helpful'
      ],
      whenToUse: 'When you struggle to start tasks or stay focused alone'
    },
    
    // Anxiety & Worry Strategies
    {
      id: 'box_breathing',
      title: 'Box Breathing',
      category: 'anxiety',
      ageGroups: ['child', 'teen', 'adult'],
      supportConditions: ['adhd', 'bipolar', 'anxiety'],
      difficulty: 'easy',
      duration: '2-5 minutes',
      description: 'Simple breathing technique to calm anxiety and racing thoughts.',
      steps: [
        'Sit comfortably and close your eyes if you like',
        'Breathe in for 4 counts',
        'Hold your breath for 4 counts',
        'Breathe out for 4 counts',
        'Hold empty lungs for 4 counts',
        'Repeat 4-8 times'
      ],
      tips: [
        'Count on your fingers to help track',
        'Start with 3 counts if 4 feels too long',
        'Focus on the counting to quiet your mind',
        'Practice when calm so it\'s easier when anxious'
      ],
      whenToUse: 'When feeling anxious, overwhelmed, or having racing thoughts'
    },
    {
      id: 'worry_time',
      title: 'Scheduled Worry Time',
      category: 'anxiety',
      ageGroups: ['teen', 'adult'],
      supportConditions: ['adhd', 'bipolar', 'anxiety'],
      difficulty: 'medium',
      duration: '15 minutes daily',
      description: 'Set aside specific time for worrying to prevent it from taking over your day.',
      steps: [
        'Pick a consistent time each day (not before bed)',
        'Set timer for 15 minutes',
        'Write down or think through your worries',
        'For each worry, ask: "Can I do something about this?"',
        'Make action plans for actionable worries',
        'Accept that some worries are outside your control',
        'When worries pop up outside this time, remind yourself to save them'
      ],
      tips: [
        'Keep a "worry notebook" by your bed',
        'Some people prefer morning worry time',
        'It\'s OK if you can\'t stop worrying immediately',
        'Focus on what you CAN control'
      ],
      whenToUse: 'When worries feel overwhelming or intrusive throughout the day'
    },

    // Mood Support Strategies
    {
      id: 'mood_tracking_simple',
      title: 'Simple Daily Mood Check',
      category: 'mood',
      ageGroups: ['child', 'teen', 'adult'],
      supportConditions: ['bipolar', 'depression'],
      difficulty: 'easy',
      duration: '2 minutes',
      description: 'Quick daily check-in to track mood patterns and triggers.',
      steps: [
        'Rate your mood 1-10 (1=very low, 10=very high)',
        'Note your energy level 1-10',
        'Write one word describing how you feel',
        'Note any triggers (sleep, stress, medication, etc.)',
        'Set one small intention for the day'
      ],
      tips: [
        'Do this same time each day',
        'Don\'t judge your mood - just notice it',
        'Look for patterns over time',
        'Share concerning patterns with trusted adults'
      ],
      whenToUse: 'Daily routine to understand your mood patterns'
    },
    {
      id: 'opposite_action',
      title: 'Opposite Action Technique',
      category: 'mood',
      ageGroups: ['teen', 'adult'],
      supportConditions: ['bipolar', 'depression'],
      difficulty: 'medium',
      duration: '5-30 minutes',
      description: 'Do the opposite of what your difficult emotion tells you to do.',
      steps: [
        'Notice what emotion you\'re feeling strongly',
        'Identify what that emotion makes you want to do',
        'Ask: "Is this emotion helpful right now?"',
        'If not, do the opposite action',
        'Examples: If sad→want to isolate, instead reach out to someone',
        'If anxious→want to avoid, take one small step forward'
      ],
      tips: [
        'Start with small opposite actions',
        'This doesn\'t mean ignore your feelings',
        'Some emotions give us important information',
        'Practice with less intense emotions first'
      ],
      whenToUse: 'When strong emotions are pushing you toward unhelpful behaviors'
    },

    // Energy Management
    {
      id: 'energy_matching',
      title: 'Task-Energy Matching',
      category: 'energy',
      ageGroups: ['teen', 'adult'],
      supportConditions: ['adhd', 'bipolar'],
      difficulty: 'medium',
      duration: 'Ongoing',
      description: 'Match your tasks to your current energy level for better productivity.',
      steps: [
        'Rate your current energy 1-10',
        'High energy (7-10): Tackle challenging tasks, creative work',
        'Medium energy (4-6): Routine tasks, organizing, planning',
        'Low energy (1-3): Easy tasks, self-care, rest',
        'Keep lists of tasks for each energy level',
        'Don\'t force high-energy tasks when energy is low'
      ],
      tips: [
        'Your energy naturally fluctuates - that\'s normal',
        'Rest is productive too',
        'Notice your personal energy patterns',
        'Have backup plans for low-energy days'
      ],
      whenToUse: 'Daily planning and when choosing what to work on'
    },

    // Sleep Strategies
    {
      id: 'sleep_routine_adhd',
      title: 'ADHD Sleep Routine',
      category: 'sleep',
      ageGroups: ['child', 'teen', 'adult'],
      supportConditions: ['adhd'],
      difficulty: 'medium',
      duration: '30-60 minutes before bed',
      description: 'Structured bedtime routine to help ADHD minds wind down.',
      steps: [
        '2 hours before bed: No caffeine, dim lights',
        '1 hour before: No screens or switch to blue light filters',
        '30 minutes before: Start wind-down activities',
        'Try: reading, gentle stretching, journaling',
        'Keep bedroom cool, dark, and quiet',
        'Use same routine every night to train your brain'
      ],
      tips: [
        'ADHD brains often have delayed sleep phase',
        'Consistency matters more than perfect timing',
        'White noise or earplugs can help',
        'Some people need earlier dinner times'
      ],
      whenToUse: 'Difficulty falling asleep or maintaining sleep schedule'
    },

    // Organization Strategies
    {
      id: 'brain_dump',
      title: 'Brain Dump for Overwhelm',
      category: 'organization',
      ageGroups: ['teen', 'adult'],
      supportConditions: ['adhd'],
      difficulty: 'easy',
      duration: '10-15 minutes',
      description: 'Get all your thoughts and tasks out of your head onto paper.',
      steps: [
        'Get paper or open notes app',
        'Set timer for 10 minutes',
        'Write down EVERYTHING in your head',
        'Tasks, worries, ideas, random thoughts - all of it',
        'Don\'t organize or judge - just dump',
        'When timer stops, take a breath',
        'Now organize: urgent, important, someday, trash'
      ],
      tips: [
        'This isn\'t your final to-do list',
        'Don\'t worry about spelling or neatness',
        'Some things might seem silly - write them anyway',
        'Do this weekly or when feeling overwhelmed'
      ],
      whenToUse: 'When your mind feels cluttered or overwhelmed with thoughts'
    },

    // Social Strategies
    {
      id: 'social_battery',
      title: 'Social Battery Management',
      category: 'social',
      ageGroups: ['teen', 'adult'],
      supportConditions: ['adhd', 'anxiety'],
      difficulty: 'easy',
      duration: 'Ongoing',
      description: 'Recognize and manage your social energy to prevent burnout.',
      steps: [
        'Imagine your social energy as a phone battery',
        'Rate your current "charge" 1-100%',
        'Different activities drain battery at different rates',
        'Large groups, new people = faster drain',
        'Close friends, familiar settings = slower drain',
        'When battery gets low, it\'s time to recharge alone'
      ],
      tips: [
        'It\'s OK to leave social events early',
        'Plan recovery time after social activities',
        'Communicate your needs to close friends',
        'Some days you start with less charge - that\'s normal'
      ],
      whenToUse: 'Planning social activities and managing social overwhelm'
    },

    // Morning Routine Strategies
    {
      id: 'morning_routine_gentle',
      title: 'Gentle Morning Start',
      category: 'morning',
      ageGroups: ['child', 'teen', 'adult'],
      supportConditions: ['adhd', 'bipolar'],
      difficulty: 'easy',
      duration: '15-30 minutes',
      description: 'Slow, gentle morning routine that doesn\'t overwhelm your system.',
      steps: [
        'Keep phone charging away from bed',
        'Start with 5 slow, deep breaths',
        'Gentle stretching in bed',
        'Drink water (keep glass by bed)',
        'One small self-care act (wash face, brush teeth)',
        'Check in: How am I feeling today?',
        'Set ONE gentle intention for the day'
      ],
      tips: [
        'Don\'t rush - rushing triggers stress response',
        'Prepare what you can the night before',
        'It\'s OK to move slowly in the morning',
        'Some days you\'ll need more gentle time'
      ],
      whenToUse: 'Daily morning routine, especially on difficult mornings'
    }
  ];

  useEffect(() => {
    loadFavorites();
  }, []);

  const loadFavorites = async () => {
    try {
      const favorites = await AsyncStorage.getItem('favorite_strategies');
      if (favorites) {
        setFavoriteStrategies(JSON.parse(favorites));
      }
    } catch (error) {
      console.error('Error loading favorites:', error);
    }
  };

  const toggleFavorite = async (strategyId) => {
    try {
      const currentFavorites = [...favoriteStrategies];
      const index = currentFavorites.indexOf(strategyId);
      
      if (index > -1) {
        currentFavorites.splice(index, 1);
      } else {
        currentFavorites.push(strategyId);
      }
      
      setFavoriteStrategies(currentFavorites);
      await AsyncStorage.setItem('favorite_strategies', JSON.stringify(currentFavorites));
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const getFilteredStrategies = () => {
    let filtered = copingStrategies;

    // Filter by user's age group and support needs
    if (userProfile) {
      filtered = filtered.filter(strategy => 
        (userProfile.ageGroup ? strategy.ageGroups.includes(userProfile.ageGroup) :
          ['child', 'teen', 'adult'].every(age => strategy.ageGroups.includes(age))) &&
        (strategy.supportConditions.length === 0 || 
         strategy.supportConditions.some(condition => 
           userProfile.supportConditions?.includes(condition)
         ))
      );
    }

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(strategy => strategy.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(strategy =>
        strategy.title.toLowerCase().includes(query) ||
        strategy.description.toLowerCase().includes(query) ||
        strategy.whenToUse.toLowerCase().includes(query)
      );
    }

    return filtered;
  };

  const shareStrategy = async (strategy) => {
    try {
      const message = `${strategy.title}\n\n${strategy.description}\n\nSteps:\n${strategy.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}\n\nFrom RiseQuest Coping Library`;
      
      await Share.share({
        message: message,
        title: strategy.title
      });
    } catch (error) {
      console.error('Error sharing strategy:', error);
    }
  };

  const renderStrategyCard = ({ item: strategy }) => (
    <TouchableOpacity
      style={styles.strategyCard}
      onPress={() => {
        setSelectedStrategy(strategy);
        setShowingStrategy(true);
      }}
    >
      <View style={styles.strategyHeader}>
        <Text style={styles.strategyTitle}>{strategy.title}</Text>
        <TouchableOpacity
          style={styles.favoriteButton}
          onPress={() => toggleFavorite(strategy.id)}
        >
          <Text style={styles.favoriteIcon}>
            {favoriteStrategies.includes(strategy.id) ? '❤️' : '🤍'}
          </Text>
        </TouchableOpacity>
      </View>
      
      <Text style={styles.strategyDescription}>{strategy.description}</Text>
      
      <View style={styles.strategyMeta}>
        <Text style={styles.metaText}>⏱️ {strategy.duration}</Text>
        <Text style={styles.metaText}>📊 {strategy.difficulty}</Text>
        <Text style={styles.categoryBadge}>{categories.find(c => c.id === strategy.category)?.label}</Text>
      </View>
      
      <Text style={styles.whenToUse}>💡 {strategy.whenToUse}</Text>
    </TouchableOpacity>
  );

  const renderStrategyDetail = () => {
    if (!selectedStrategy) return null;

    return (
      <Modal
        visible={showingStrategy}
        onRequestClose={() => setShowingStrategy(false)}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowingStrategy(false)}>
              <Text style={styles.modalClose}>← Back</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => shareStrategy(selectedStrategy)}>
              <Text style={styles.modalShare}>Share</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.strategyDetailContainer}>
            <View style={styles.strategyDetailHeader}>
              <Text style={styles.strategyDetailTitle}>{selectedStrategy.title}</Text>
              <TouchableOpacity
                style={styles.favoriteButton}
                onPress={() => toggleFavorite(selectedStrategy.id)}
              >
                <Text style={styles.favoriteIconLarge}>
                  {favoriteStrategies.includes(selectedStrategy.id) ? '❤️' : '🤍'}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.strategyDetailDescription}>
              {selectedStrategy.description}
            </Text>

            <View style={styles.strategyDetailMeta}>
              <Text style={styles.metaItem}>⏱️ Duration: {selectedStrategy.duration}</Text>
              <Text style={styles.metaItem}>📊 Difficulty: {selectedStrategy.difficulty}</Text>
              <Text style={styles.metaItem}>
                🎯 Category: {categories.find(c => c.id === selectedStrategy.category)?.label}
              </Text>
            </View>

            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>How to do it:</Text>
              {selectedStrategy.steps.map((step, index) => (
                <View key={index} style={styles.stepContainer}>
                  <Text style={styles.stepNumber}>{index + 1}</Text>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>

            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Helpful Tips:</Text>
              {selectedStrategy.tips.map((tip, index) => (
                <View key={index} style={styles.tipContainer}>
                  <Text style={styles.tipBullet}>💡</Text>
                  <Text style={styles.tipText}>{tip}</Text>
                </View>
              ))}
            </View>

            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>When to use this:</Text>
              <Text style={styles.whenToUseDetail}>{selectedStrategy.whenToUse}</Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  const filteredStrategies = getFilteredStrategies();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Coping Strategies</Text>
        <Text style={styles.headerSubtitle}>
          Tools and techniques to help you thrive
        </Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search strategies..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoriesContainer}
      >
        {categories.map(category => (
          <TouchableOpacity
            key={category.id}
            style={[
              styles.categoryButton,
              selectedCategory === category.id && styles.selectedCategory
            ]}
            onPress={() => setSelectedCategory(category.id)}
          >
            <Text style={styles.categoryEmoji}>{category.emoji}</Text>
            <Text style={[
              styles.categoryLabel,
              selectedCategory === category.id && styles.selectedCategoryLabel
            ]}>
              {category.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filteredStrategies}
        renderItem={renderStrategyCard}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.strategiesList}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              No strategies found matching your criteria
            </Text>
          </View>
        }
      />

      {renderStrategyDetail()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF9F2',
  },
  header: {
    padding: 20,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#666',
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  searchInput: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  categoriesContainer: {
    flexGrow: 0,
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  categoryButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    alignItems: 'center',
    minWidth: 80,
  },
  selectedCategory: {
    backgroundColor: '#A65000',
    borderColor: '#A65000',
  },
  categoryEmoji: {
    fontSize: 16,
    marginBottom: 2,
  },
  categoryLabel: {
    fontSize: 12,
    color: '#666',
  },
  selectedCategoryLabel: {
    color: '#252438',
  },
  strategiesList: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  strategyCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  strategyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  strategyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    marginRight: 10,
  },
  favoriteButton: {
    padding: 5,
  },
  favoriteIcon: {
    fontSize: 20,
  },
  favoriteIconLarge: {
    fontSize: 24,
  },
  strategyDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
    lineHeight: 20,
  },
  strategyMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
    gap: 10,
  },
  metaText: {
    fontSize: 12,
    color: '#888',
  },
  categoryBadge: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    fontSize: 10,
    color: '#666',
  },
  whenToUse: {
    fontSize: 12,
    color: '#A65000',
    fontStyle: 'italic',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFF9F2',
  },
  modalHeader: {
    backgroundColor:'#FFF0DB',borderBottomLeftRadius:26,borderBottomRightRadius:26,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalClose: {
    fontSize: 16,
    color: '#A65000',
  },
  modalShare: {
    fontSize: 16,
    color: '#A65000',
  },
  strategyDetailContainer: {
    flex: 1,
    padding: 20,
  },
  strategyDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 15,
  },
  strategyDetailTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    marginRight: 10,
  },
  strategyDetailDescription: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    lineHeight: 22,
  },
  strategyDetailMeta: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  metaItem: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  sectionContainer: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 15,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  stepContainer: {
    flexDirection: 'row',
    marginBottom: 15,
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: 25,
    height: 25,
    borderRadius: 12.5,
    backgroundColor: '#A65000',
    color: '#252438',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: 'bold',
    marginRight: 15,
    lineHeight: 25,
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  tipContainer: {
    flexDirection: 'row',
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  tipBullet: {
    fontSize: 16,
    marginRight: 10,
    marginTop: 2,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  whenToUseDetail: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
});

export default CopingLibrary;

