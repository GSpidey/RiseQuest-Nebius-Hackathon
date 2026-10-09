/**
 * Quest Screen - Main Quest Management Interface
 * Gamified task management with AI-powered breakdown
 */

import { sunrise } from '../components/SunriseUI';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  Dimensions,
  SafeAreaView,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import QuestService from '../services/QuestService';
import { isLocalQuest } from '../services/questRepository';
import CreateQuestModal from '../components/CreateQuestModal';
import QuestFocusMode from '../components/QuestFocusMode';
import QuestCard from '../components/QuestCard';
import { MonetizationService } from '../utils/MonetizationService';

const { width } = Dimensions.get('window');

const QuestScreen = ({ userProfile, onClose }) => {
  const [quests, setQuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active'); // active, completed, all
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFocusMode, setShowFocusMode] = useState(false);
  const [focusQuest, setFocusQuest] = useState(null);
  const [questStats, setQuestStats] = useState({});
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadQuests();
    loadQuestStats();
  }, [activeTab, userProfile.id]);

  const loadQuests = async () => {
    try {
      setLoading(true);
      const allQuests = await QuestService.getUserQuests(userProfile.id);
      
      let filteredQuests = allQuests;
      if (activeTab === 'active') {
        filteredQuests = allQuests.filter(quest => quest.status === 'active');
      } else if (activeTab === 'completed') {
        filteredQuests = allQuests.filter(quest => quest.status === 'completed');
      }

      // Apply search filter
      if (searchTerm) {
        filteredQuests = filteredQuests.filter(quest =>
          quest.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          quest.description.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }

      // Sort by creation date (newest first)
      filteredQuests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      setQuests(filteredQuests);
    } catch (error) {
      console.error('Error loading quests:', error);
      Alert.alert('Error', 'Failed to load quests');
    } finally {
      setLoading(false);
    }
  };

  const loadQuestStats = async () => {
    try {
      const stats = await QuestService.getQuestStats(userProfile.id);
      setQuestStats(stats);
    } catch (error) {
      console.error('Error loading quest stats:', error);
    }
  };

  const handleCreateQuest = async (questData) => {
    try {
      const newQuest = await QuestService.createQuest({
        ...questData,
        userId: userProfile.id,
      });

      // Award Rise Points for creating a quest
      if (!isLocalQuest(newQuest)) await MonetizationService.addRisePoints(
        MonetizationService.RISE_POINT_REWARDS.QUEST_CREATED,
        'creating a new quest', { questId: newQuest.id }
      );

      setShowCreateModal(false);
      loadQuests();
      loadQuestStats();

      Alert.alert(
        isLocalQuest(newQuest) ? 'Saved on this device' : 'Quest Created! 🎯',
        isLocalQuest(newQuest) ? 'These are prepared offline suggestions, not an AI response. This quest is saved only on this device; it does not earn Rise Points or sync to your account.' :
          `Your quest "${newQuest.title}" has ${newQuest.totalSteps} suggested steps. ${newQuest.breakdownSource === 'ai' ? 'AI-generated suggestions — review them before starting.' : 'Prepared suggestions — not a live AI response.'}`,
        [
          { text: 'View Quest', onPress: () => {} },
          { text: 'Start Focus Mode', onPress: () => enterFocusMode(newQuest) }
        ]
      );
    } catch (error) {
      console.error('Error creating quest:', error);
      Alert.alert('Error', 'Failed to create quest');
    }
  };

  const handleQuestProgress = async (questId, subtaskId, completed) => {
    try {
      const updatedQuest = await QuestService.updateQuestProgress(questId, subtaskId, completed);
      
      if (completed && !isLocalQuest(updatedQuest)) {
        // Award Rise Points for completing a step
        await MonetizationService.addRisePoints(
          MonetizationService.RISE_POINT_REWARDS.QUEST_STEP_COMPLETED,
          'completing a quest step', { questId, subtaskId }
        );

        // Check if quest is completed
        if (updatedQuest.status === 'completed') {
          await MonetizationService.addRisePoints(
            MonetizationService.RISE_POINT_REWARDS.QUEST_COMPLETED,
            'completing a full quest', { questId }
          );

          Alert.alert(
            'Quest Completed! 🏆',
            `Congratulations! You've completed "${updatedQuest.title}". You've earned bonus Rise Points!`
          );
        }
      }

      loadQuests();
      loadQuestStats();
      if (focusQuest?.id === updatedQuest.id) setFocusQuest(updatedQuest);
      return updatedQuest;
    } catch (error) {
      console.error('Error updating quest progress:', error);
      if (!showFocusMode) Alert.alert('Not saved', error.message || 'Failed to update progress');
      throw error;
    }
  };

  const handleDeleteQuest = async (questId, questTitle) => {
    Alert.alert(
      'Delete Quest',
      `Are you sure you want to delete "${questTitle}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await QuestService.deleteQuest(questId);
              loadQuests();
              loadQuestStats();
            } catch (error) {
              console.error('Error deleting quest:', error);
              Alert.alert('Error', 'Failed to delete quest');
            }
          }
        }
      ]
    );
  };

  const enterFocusMode = (quest) => {
    const nextStep = QuestService.getNextStep(quest);
    if (nextStep) {
      setFocusQuest(quest);
      setShowFocusMode(true);
    } else {
      Alert.alert('Quest Complete', 'This quest has been completed!');
    }
  };

  const getDifficultyColor = (difficulty) => {
    switch (difficulty) {
      case 'easy': return '#48bb78';
      case 'medium': return '#ed8936';
      case 'hard': return '#e53e3e';
      default: return sunrise.orange;
    }
  };

  const getProgressColor = (progress) => {
    if (progress >= 75) return '#48bb78';
    if (progress >= 50) return '#ed8936';
    if (progress >= 25) return '#ecc94b';
    return '#e53e3e';
  };

  const Header = () => (
    <LinearGradient
      colors={[sunrise.orangeTint, '#FFE49A']}
      style={styles.header}
    >
      <View style={styles.headerTop}>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🎯 Quest Center</Text>
        <TouchableOpacity 
          style={styles.createButton}
          onPress={() => setShowCreateModal(true)}
        >
          <Text style={styles.createButtonText}>+ Create</Text>
        </TouchableOpacity>
      </View>

      {/* Quest Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{questStats.activeQuests || 0}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{questStats.completedQuests || 0}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{questStats.completionRate || 0}%</Text>
          <Text style={styles.statLabel}>Success Rate</Text>
        </View>
      </View>
    </LinearGradient>
  );

  const TabBar = () => (
    <View style={styles.tabBar}>
      {['active', 'completed', 'all'].map((tab) => (
        <TouchableOpacity
          key={tab}
          style={[styles.tab, activeTab === tab && styles.activeTab]}
          onPress={() => setActiveTab(tab)}
        >
          <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
            {tab === 'active' ? '🔥 Active' : tab === 'completed' ? '✅ Done' : '📋 All'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const SearchBar = () => (
    <View style={styles.searchContainer}>
      <TextInput
        style={styles.searchInput}
        placeholder="Search quests..."
        placeholderTextColor="#999"
        value={searchTerm}
        onChangeText={setSearchTerm}
        onSubmitEditing={loadQuests}
      />
    </View>
  );

  const EmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>🎯</Text>
      <Text style={styles.emptyTitle}>
        {activeTab === 'active' ? 'No Active Quests' : 
         activeTab === 'completed' ? 'No Completed Quests' : 'No Quests Yet'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {activeTab === 'active' 
          ? 'Create your first quest and let AI break it down into manageable steps!'
          : activeTab === 'completed'
          ? 'Complete some quests to see them here.'
          : 'Start your journey by creating your first quest!'
        }
      </Text>
      <TouchableOpacity
        style={styles.emptyButton}
        onPress={() => setShowCreateModal(true)}
      >
        <Text style={styles.emptyButtonText}>🚀 Create Your First Quest</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Header />
      <TabBar />
      <SearchBar />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading quests...</Text>
          </View>
        ) : quests.length === 0 ? (
          <EmptyState />
        ) : (
          <View style={styles.questsList}>
            {quests.map((quest) => (
              <QuestCard
                key={quest.id}
                quest={quest}
                onProgress={handleQuestProgress}
                onDelete={handleDeleteQuest}
                onFocusMode={enterFocusMode}
                getDifficultyColor={getDifficultyColor}
                getProgressColor={getProgressColor}
              />
            ))}
          </View>
        )}

        {/* Quick Actions */}
        {quests.length > 0 && (
          <View style={styles.quickActions}>
            <Text style={styles.quickActionsTitle}>⚡ Quick Actions</Text>
            <TouchableOpacity
              style={styles.quickActionButton}
              onPress={() => {
                const activeQuest = quests.find(q => q.status === 'active');
                if (activeQuest) {
                  enterFocusMode(activeQuest);
                } else {
                  Alert.alert('No Active Quests', 'Create a quest first to use focus mode.');
                }
              }}
            >
              <Text style={styles.quickActionText}>🎯 Enter Focus Mode</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.quickActionButton}
              onPress={() => setShowCreateModal(true)}
            >
              <Text style={styles.quickActionText}>➕ Create New Quest</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Create Quest Modal */}
      <CreateQuestModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateQuest}
        userProfile={userProfile}
      />

      {/* Focus Mode Modal */}
      <QuestFocusMode
        visible={showFocusMode}
        quest={focusQuest}
        onClose={() => setShowFocusMode(false)}
        onProgress={handleQuestProgress}
        userProfile={userProfile}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: sunrise.background,
  },
  header: {
    padding: 14,
    paddingTop: 18,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    shadowColor: sunrise.orange,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  backButton: {
    color: sunrise.ink,
    fontSize: 14,
    fontWeight: '600',
    padding: 6,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: sunrise.ink,
    letterSpacing: 0.5,
    textShadowColor: 'transparent',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  createButton: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  createButtonText: {
    color: sunrise.ink,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  statBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    minWidth: 64,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  statNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: sunrise.ink,
    textShadowColor: 'transparent',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  statLabel: {
    fontSize: 10,
    color: sunrise.muted,
    marginTop: 2,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: -15,
    borderRadius: 25,
    padding: 4,
    shadowColor: sunrise.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 20,
    marginHorizontal: 2,
  },
  activeTab: {
    backgroundColor: sunrise.orange,
    shadowColor: sunrise.orange,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  tabText: {
    fontSize: 13,
    color: sunrise.muted,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  activeTabText: {
    color: sunrise.ink,
    fontWeight: '700',
  },
  searchContainer: {
    padding: 20,
    paddingBottom: 15,
  },
  searchInput: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#e8ecf0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  loadingText: {
    fontSize: 16,
    color: sunrise.muted,
    fontWeight: '500',
  },
  questsList: {
    padding: 20,
    paddingTop: 10,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyEmoji: {
    fontSize: 80,
    marginBottom: 24,
    opacity: 0.7,
  },
  emptyTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#2c2c2e',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  emptySubtitle: {
    fontSize: 17,
    color: sunrise.muted,
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 40,
    letterSpacing: 0.2,
  },
  emptyButton: {
    backgroundColor: sunrise.orange,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 28,
    shadowColor: sunrise.orange,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  emptyButtonText: {
    color: sunrise.ink,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  quickActions: {
    margin: 20,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    shadowColor: sunrise.orange,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#f0f0f3',
  },
  quickActionsTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#2c2c2e',
    marginBottom: 20,
    letterSpacing: 0.3,
  },
  quickActionButton: {
    backgroundColor: sunrise.background,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e8ecf0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  quickActionText: {
    fontSize: 17,
    color: '#2c2c2e',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});

export default QuestScreen;
