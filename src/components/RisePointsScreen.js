import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { MonetizationService } from '../utils/MonetizationService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import riseQuestWalletService from '../services/RiseQuestWalletService';

export default function RisePointsScreen({ visible, onClose }) {
  const [subscription, setSubscription] = useState(null);
  const [walletBalance, setWalletBalance] = useState({ risePoints: 0, premiumCredits: 0, total: 0 });
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible) {
      loadUserData();
    }
  }, [visible]);

  const loadUserData = async () => {
    try {
      const sub = await MonetizationService.getUserSubscription();
      setSubscription(sub);

      const statsRaw = await AsyncStorage.getItem('risequest_stats');
      if (statsRaw) {
        const parsed = JSON.parse(statsRaw);
        setUserStats((prev) => ({ ...prev, ...parsed }));
      }

      try {
        const balance = await riseQuestWalletService.getBalance();
        setWalletBalance(balance);
      } catch {
        // If not signed in / backend unreachable, keep local subscription points.
        setWalletBalance({ risePoints: sub?.risePoints || 0, premiumCredits: 0, total: sub?.risePoints || 0 });
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const isToday = (isoString) => {
    if (!isoString) return false;
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  };

  const purchaseWithPoints = async (item, cost) => {
    const success = await MonetizationService.spendRisePoints(cost, item.name);
    if (success) {
      Alert.alert('Unlocked! 🎉', `You've unlocked ${item.name}!`);
      loadUserData(); // Refresh data
    }
  };

  const rewardItems = [
    {
      id: 'basic_mini_game',
      name: 'Extra Mini-Game',
      description: 'Unlock 1 additional mini-game for 24 hours',
      cost: 100,
      icon: '🎮',
      type: 'temporary',
      duration: '24 hours'
    },
    {
      id: 'voice_pack_trial',
      name: 'Celebrity Voice Trial',
      description: 'Try any voice pack for 7 days',
      cost: 200,
      icon: '🎵',
      type: 'trial',
      duration: '7 days'
    },
    {
      id: 'theme_unlock',
      name: 'Premium Theme',
      description: 'Unlock a premium theme permanently',
      cost: 150,
      icon: '🎨',
      type: 'permanent',
      duration: 'Forever'
    },
    {
      id: 'premium_trial_day',
      name: 'Premium Day Pass',
      description: 'Full Premium access for 24 hours',
      cost: 500,
      icon: '👑',
      type: 'trial',
      duration: '24 hours'
    },
    {
      id: 'streak_protection',
      name: 'Streak Protection',
      description: 'Protect your streak from one missed alarm',
      cost: 300,
      icon: '🛡️',
      type: 'insurance',
      duration: 'One-time use'
    },
    {
      id: 'double_points_day',
      name: 'Double Points Day',
      description: 'Earn 2x RisePoints for 24 hours',
      cost: 250,
      icon: '⚡',
      type: 'multiplier',
      duration: '24 hours'
    }
  ];

  const achievements = [
    {
      name: 'Consistency King',
      description: 'Build a 30-day wake-up streak',
      progress: Math.min(Number(userStats.streak || 0), 30),
      total: 30,
      reward: 500,
      icon: '👑',
      completed: Number(userStats.streak || 0) >= 30,
    },
    {
      name: 'Wake-Up Milestone',
      description: 'Reach 50 successful wake-ups',
      progress: Math.min(Number(userStats.totalWakeUps || 0), 50),
      total: 50,
      reward: 200,
      icon: '🌅',
      completed: Number(userStats.totalWakeUps || 0) >= 50,
    },
    {
      name: 'Challenge Master',
      description: 'Complete 50 mini-game challenges',
      progress: Math.min(Number(userStats.challengesCompleted || 0), 50),
      total: 50,
      reward: 200,
      icon: '🎯',
      completed: Number(userStats.challengesCompleted || 0) >= 50,
    },
    {
      name: 'No Snooze Day',
      description: 'Wake up today without snoozing',
      progress: isToday(userStats.lastWakeUpAt) && !isToday(userStats.lastSnoozeAt) ? 1 : 0,
      total: 1,
      reward: MonetizationService.RISE_POINT_REWARDS.NO_SNOOZE,
      icon: '🛡️',
      completed: isToday(userStats.lastWakeUpAt) && !isToday(userStats.lastSnoozeAt),
    },
  ];

  const dailyTasks = [
    {
      name: 'Wake up on time',
      points: MonetizationService.RISE_POINT_REWARDS.DAILY_WAKEUP,
      completed: isToday(userStats.lastWakeUpAt),
      icon: '⏰'
    },
    {
      name: 'Complete mini-game challenge',
      points: MonetizationService.RISE_POINT_REWARDS.CHALLENGE_COMPLETED,
      completed: isToday(userStats.lastChallengeAt),
      icon: '🎮'
    },
    {
      name: 'No snooze used',
      points: MonetizationService.RISE_POINT_REWARDS.NO_SNOOZE,
      completed: isToday(userStats.lastWakeUpAt) && !isToday(userStats.lastSnoozeAt),
      icon: '🚫'
    },
    {
      name: 'Maintain your streak',
      points: MonetizationService.RISE_POINT_REWARDS.STREAK_MILESTONE,
      completed: isToday(userStats.lastWakeUpAt),
      icon: '🔥'
    }
  ];

  if (loading) {
    return (
      <Modal visible={visible} onRequestClose={onClose}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <LinearGradient colors={['#667eea', '#764ba2']} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.title}>🌟 RisePoints & Rewards</Text>
          </View>

          {/* Points Balance */}
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Your RisePoints</Text>
            <Text style={styles.balanceAmount}>{walletBalance?.risePoints || 0}</Text>
            <Text style={styles.balanceSubtext}>
              Earn points by waking up on time and completing challenges!
            </Text>
          </View>

          {/* Daily Tasks */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📅 Today's Tasks</Text>
            {dailyTasks.map((task, index) => (
              <View key={index} style={styles.taskCard}>
                <View style={styles.taskInfo}>
                  <Text style={styles.taskIcon}>{task.icon}</Text>
                  <View style={styles.taskDetails}>
                    <Text style={styles.taskName}>{task.name}</Text>
                    <Text style={styles.taskPoints}>+{task.points} points</Text>
                  </View>
                </View>
                <View style={[
                  styles.taskStatus,
                  task.completed ? styles.taskCompleted : styles.taskPending
                ]}>
                  <Text style={styles.taskStatusText}>
                    {task.completed ? '✓' : '○'}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Achievements */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🏆 Achievements</Text>
            {achievements.map((achievement, index) => (
              <View key={index} style={styles.achievementCard}>
                <View style={styles.achievementHeader}>
                  <Text style={styles.achievementIcon}>{achievement.icon}</Text>
                  <View style={styles.achievementInfo}>
                    <Text style={styles.achievementName}>{achievement.name}</Text>
                    <Text style={styles.achievementDescription}>{achievement.description}</Text>
                  </View>
                  <Text style={styles.achievementReward}>+{achievement.reward}</Text>
                </View>
                
                <View style={styles.progressContainer}>
                  <View style={styles.progressBar}>
                    <View 
                      style={[
                        styles.progressFill,
                        { width: `${(achievement.progress / achievement.total) * 100}%` }
                      ]}
                    />
                  </View>
                  <Text style={styles.progressText}>
                    {achievement.progress}/{achievement.total}
                  </Text>
                </View>
                
                {achievement.completed && (
                  <View style={styles.completedBadge}>
                    <Text style={styles.completedText}>COMPLETED! 🎉</Text>
                  </View>
                )}
              </View>
            ))}
          </View>

          {/* Rewards Store */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🛒 Rewards Store</Text>
            <Text style={styles.sectionSubtext}>
              Spend your RisePoints to unlock premium features!
            </Text>
            
            {rewardItems.map((item) => (
              <View key={item.id} style={styles.rewardCard}>
                <View style={styles.rewardInfo}>
                  <Text style={styles.rewardIcon}>{item.icon}</Text>
                  <View style={styles.rewardDetails}>
                    <Text style={styles.rewardName}>{item.name}</Text>
                    <Text style={styles.rewardDescription}>{item.description}</Text>
                    <Text style={styles.rewardDuration}>{item.duration}</Text>
                  </View>
                </View>
                
                <View style={styles.rewardAction}>
                  <Text style={styles.rewardCost}>{item.cost} pts</Text>
                  <TouchableOpacity
                    style={[
                      styles.purchaseButton,
                      (subscription?.risePoints || 0) < item.cost && styles.purchaseButtonDisabled
                    ]}
                    onPress={() => purchaseWithPoints(item, item.cost)}
                    disabled={(subscription?.risePoints || 0) < item.cost}
                  >
                    <Text style={styles.purchaseButtonText}>
                      {(subscription?.risePoints || 0) >= item.cost ? 'Unlock' : 'Need More'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>

          {/* How to Earn Points */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>💡 How to Earn RisePoints</Text>
            <View style={styles.earnPointsGrid}>
              <View style={styles.earnPointsItem}>
                <Text style={styles.earnPointsIcon}>⏰</Text>
                <Text style={styles.earnPointsAction}>Wake up on time</Text>
                <Text style={styles.earnPointsValue}>+10 pts</Text>
              </View>
              <View style={styles.earnPointsItem}>
                <Text style={styles.earnPointsIcon}>🎮</Text>
                <Text style={styles.earnPointsAction}>Complete challenge</Text>
                <Text style={styles.earnPointsValue}>+25 pts</Text>
              </View>
              <View style={styles.earnPointsItem}>
                <Text style={styles.earnPointsIcon}>🔥</Text>
                <Text style={styles.earnPointsAction}>7-day streak</Text>
                <Text style={styles.earnPointsValue}>+50 pts</Text>
              </View>
              <View style={styles.earnPointsItem}>
                <Text style={styles.earnPointsIcon}>🚫</Text>
                <Text style={styles.earnPointsAction}>No snooze day</Text>
                <Text style={styles.earnPointsValue}>+20 pts</Text>
              </View>
            </View>
          </View>

          {/* Premium Upgrade CTA */}
          <View style={styles.premiumCTA}>
            <Text style={styles.premiumCTATitle}>Want Unlimited Features?</Text>
            <Text style={styles.premiumCTAText}>
              Premium members earn 2x RisePoints and get exclusive rewards!
            </Text>
            <TouchableOpacity style={styles.premiumCTAButton}>
              <Text style={styles.premiumCTAButtonText}>Upgrade to Premium 👑</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#667eea',
  },
  loadingText: {
    color: '#fff',
    fontSize: 18,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 40,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  balanceCard: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    padding: 25,
    alignItems: 'center',
    marginBottom: 30,
  },
  balanceLabel: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 5,
  },
  balanceAmount: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#ffd700',
    marginBottom: 10,
  },
  balanceSubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  sectionSubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 15,
  },
  taskCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  taskInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  taskIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  taskDetails: {
    flex: 1,
  },
  taskName: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  taskPoints: {
    fontSize: 14,
    color: '#ffd700',
  },
  taskStatus: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskCompleted: {
    backgroundColor: '#48bb78',
  },
  taskPending: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  taskStatusText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  achievementCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 15,
    padding: 20,
    marginBottom: 15,
  },
  achievementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  achievementIcon: {
    fontSize: 30,
    marginRight: 15,
  },
  achievementInfo: {
    flex: 1,
  },
  achievementName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  achievementDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  achievementReward: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffd700',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 4,
    marginRight: 10,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#48bb78',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  completedBadge: {
    backgroundColor: '#48bb78',
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 15,
    alignSelf: 'flex-start',
    marginTop: 10,
  },
  completedText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  rewardCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 15,
    padding: 20,
    marginBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rewardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rewardIcon: {
    fontSize: 30,
    marginRight: 15,
  },
  rewardDetails: {
    flex: 1,
  },
  rewardName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  rewardDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  rewardDuration: {
    fontSize: 12,
    color: '#ffd700',
    marginTop: 2,
  },
  rewardAction: {
    alignItems: 'center',
  },
  rewardCost: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffd700',
    marginBottom: 8,
  },
  purchaseButton: {
    backgroundColor: '#48bb78',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  purchaseButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  purchaseButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  earnPointsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  earnPointsItem: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 15,
    width: '48%',
    alignItems: 'center',
    marginBottom: 10,
  },
  earnPointsIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  earnPointsAction: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 5,
  },
  earnPointsValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffd700',
  },
  premiumCTA: {
    backgroundColor: 'rgba(255,215,0,0.2)',
    borderRadius: 20,
    padding: 25,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffd700',
  },
  premiumCTATitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  premiumCTAText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 15,
  },
  premiumCTAButton: {
    backgroundColor: '#ffd700',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  premiumCTAButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
